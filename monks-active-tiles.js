import { registerSettings } from "./settings.js";
import { WithActiveTileConfig } from "./apps/active-tile-config.js"
import { WithActiveTileHUD } from "./apps/active-tile-hud.js"

export let debug = (...args) => {
    if (debugEnabled > 1) console.log("DEBUG: monks-active-tiles | ", ...args);
};
export let log = (...args) => console.log("monks-active-tiles | ", ...args);
export let warn = (...args) => {
    if (debugEnabled > 0) console.warn("monks-active-tiles | ", ...args);
};
export let error = (...args) => console.error("monks-active-tiles | ", ...args);
export let i18n = key => {
    return game.i18n.localize(key);
};
export let setting = key => {
    return game.settings.get("monks-active-tiles", key);
};

export let makeid = () => {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < 16; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

export let oldSheetClass = () => {
    return MonksActiveTiles._oldSheetClass;
};

export let oldObjectClass = () => {
    return MonksActiveTiles._oldObjectClass;
};

export class MonksActiveTiles {
    static _oldSheetClass;
    //static _oldObjectClass;
    static _rejectRemaining = {};

    static timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static emit(action, args = {}) {
        args.action = action;
        args.senderId = game.user.id
        game.socket.emit( MonksActiveTiles.SOCKET, args, (resp) => { } );
    }

    static triggerActions = {
        'pause': {
            name: "MonksActiveTiles.action.pause",
            options: { allowDelay: true },
            fn: (tile, token, action) => { game.togglePause(true, true); }
        },
        'movement': {
            name: "MonksActiveTiles.action.stopmovement",
            stop: true,
            ctrls: [
                {
                    id: "snap",
                    name: "MonksActiveTiles.ctrl.snap",
                    type: "checkbox"
                }
            ],
            content: (trigger, action) => {
                return i18n(trigger.name) + (action.data?.snap ? ' (' + i18n("MonksActiveTiles.ctrl.snap").toLowerCase() + ')' : '');
            }
        },
        'pancanvas': {
            name: "MonksActiveTiles.action.pancanvas",
            ctrls: [
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "location"
                },
                {
                    id: "animate",
                    name: "MonksActiveTiles.ctrl.animate",
                    type: "checkbox"
                }
            ],
            fn: async (tile, token, action, userid) => {
                if (userid != game.user.id)
                    MonksActiveTiles.emit('pan', { userid: userid, animatepan: action.data.animatepan, x: action.data.location.x, y: action.data.location.y });
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' to ' + (action.data?.location.name ? action.data?.location.name : '[' + action.data?.location.x + ',' + action.data?.location.y + ']');
            }
        },
        'teleport': {
            name: "MonksActiveTiles.action.teleport",
            options: { allowDelay: true },
            stop:true,
            ctrls: [
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "either",
                    restrict: (entity) => { return (entity instanceof Tile); }
                },
                {
                    id: "remotesnap",   //using remote snap because I don't want this to trigger the token to be snapped to the grid on the tile
                    name: "MonksActiveTiles.ctrl.snap",
                    type: "checkbox"
                },
                {
                    id: "animatepan",
                    name: "Animate Canvas Pan",
                    type: "checkbox"
                }/*,
                {
                    id: "addanimation",
                    name: "Add bit of animation",
                    type: "checkbox"
                }*/,
                {
                    id: "avoidtokens",
                    name: "Avoid other tokens",
                    type: "checkbox"
                }
                /*,
                {
                    id: "addmovement",
                    name: "Add bit of movement",
                    type: "checkbox"
                }*/
            ],
            fn: async (tiledoc, tokendoc, action, userid) => {
                if (!tokendoc) {
                    ui.notifications.info('No token to teleport');
                    return;
                }

                let token = tokendoc.object;

                let oldPos = {
                    x: token.x + (token.width / 2),
                    y: token.y + (token.height / 2)
                }

                let destTile;
                let sceneId = action.data.location.sceneId;
                if (action.data.location.id) {
                    //this is directing to a Tile
                    destTile = await fromUuid(action.data.location.id);
                    action.data.location.x = destTile.data.x + (destTile.data.width / 2);
                    action.data.location.y = destTile.data.y + (destTile.data.height / 2);

                    if (destTile.parent.id != canvas.scene.id)
                        sceneId = destTile.parent.id;
                }

                //move the token to the new square
                let newPos = {
                    x: action.data.location.x,
                    y: action.data.location.y
                };

                if (sceneId == undefined || sceneId == canvas.scene.id) {

                    await token.stopAnimation();
                    if (!canvas.grid.hitArea.contains(newPos.x, newPos.y)) {
                        //+++find the closest spot on the edge of the scene
                        ui.notifications.error(i18n("MonksActiveTiles.msg.prevent-teleport"));
                        return;
                    }

                    //find a vacant spot
                    if (action.data.avoidtokens)
                        newPos = MonksActiveTiles.findVacantSpot(newPos, token, canvas.scene, destTile, action.data.remotesnap);

                    newPos.x -= (token.w / 2);
                    newPos.y -= (token.h / 2);

                    if (action.data.remotesnap)
                        newPos = canvas.grid.getSnappedPosition(newPos.x, newPos.y);
                    //else {
                    //    newPos.x -= (token.w / 2);
                    //    newPos.y -= (token.h / 2);
                    //}

                    //fade in backdrop
                    if (userid != game.user.id) {
                        MonksActiveTiles.emit('fade', { userid: userid });
                        await MonksActiveTiles.timeout(400);
                    }

                    let offset = { dx: oldPos.x - newPos.x, dy: oldPos.y - newPos.y };
                    await tokendoc.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: false });

                    if (userid != game.user.id)
                        MonksActiveTiles.emit('offsetpan', { userid: userid, animatepan: action.data.animatepan, x: offset.dx - (token.w / 2), y: offset.dy - (token.h / 2) });
                } else {
                    //if the end spot is on a different scene then hide this token, check the new scene for a token for that actor and move it, otherwise create the token on the new scene
                    //let offset = { dx: canvas.scene._viewPosition.x - oldPos.x, dy: canvas.scene._viewPosition.y - oldPos.y };
                    //let offset = { dx: oldPos.x - newPos.x, dy: oldPos.y - newPos.y };

                    if (userid != game.user.id) {
                        MonksActiveTiles.emit('fade', { userid: userid, time: 1000 });
                        //await MonksActiveTiles.timeout(400);
                    }

                    let scene = game.scenes.get(sceneId);
                    let newtoken = (token.actor?.id ? scene.tokens.find(t => { return t.actor?.id == token.actor?.id }) : null);

                    //find a vacant spot
                    if (action.data.avoidtokens)
                        newPos = MonksActiveTiles.findVacantSpot(newPos, token, scene, destTile, action.data.remotesnap);

                    newPos.x -= ((token.data.width * scene.data.size) / 2);
                    newPos.y -= ((token.data.height * scene.data.size) / 2);

                    if (action.data.remotesnap) {
                        newPos.x = newPos.x.toNearest(scene.data.size);
                        newPos.y = newPos.y.toNearest(scene.data.size);
                    }

                    if (newtoken) {
                        await newtoken.update({ x: newPos.x, y: newPos.y, hidden: token.data.hidden }, { bypass: true, animate: false });
                    }
                    else {
                        const td = await token.actor.getTokenData({ x: newPos.x, y: newPos.y });
                        const cls = getDocumentClass("Token");
                        newtoken = await cls.create(td, { parent: scene });
                    }
                    let oldhidden = token.document.data.hidden;
                    tokendoc.update({ hidden: true });   //hide the old one
                    newtoken.update({ hidden: oldhidden, img: token.data.img });   //preserve the image, and hiddenness of the old token
                    //tokendoc = newtoken;
                    //let scale = canvas.scene._viewPosition.scale;

                    if (userid != game.user.id) {
                        //pass this back to the player
                        MonksActiveTiles.emit('switchview', { userid: userid, sceneid: scene.id, newpos: newPos, oldpos: oldPos });
                    }
                    ui.notifications.warn(`${token.name} has teleported to ${scene.name}`);

                    return newtoken;
                }
            },
            content: (trigger, action) => {
                let scene = game.scenes.find(s => s.id == action.data?.location.sceneId);
                return i18n(trigger.name) + ' token to ' + (action.data?.location.name ? action.data?.location.name : '[' + action.data?.location.x + ',' + action.data?.location.y + ']') + (scene ? ' Scene: ' + scene.name : '') + (action.data?.remotesnap ? ' (snap to grid)' : '');
            }
        },
        'movetoken': {
            name: "MonksActiveTiles.action.movement",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "either",
                    restrict: (entity) => { return (entity instanceof Tile && this.scene.id == entity.parent.id) || this.scene.id == entity.id; }
                },
                {
                    id: "snap",   //using remote snap because I don't want this to trigger the token to be snapped to the grid on the tile
                    name: "MonksActiveTiles.ctrl.snap",
                    type: "checkbox",
                    defvalue: true
                },
                {
                    id: "wait",
                    name: "MonksActiveTiles.ctrl.waitforanimation",
                    type: "checkbox"
                }
            ],
            fn: async (tile, token, action, userid) => {
                //wait for animate movement
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);
                    
                if (entities && entities.length > 0) {
                    if (action.data.location.id) {
                        //this is directing to a Tile
                        let destTile = await fromUuid(action.data.location.id);
                        action.data.location.x = destTile.data.x + (destTile.data.width / 2);
                        action.data.location.y = destTile.data.y + (destTile.data.height / 2);
                    }
                    //set or toggle visible
                    for (let tokendoc of entities) {
                        let token = tokendoc.object;
                        await token.stopAnimation();

                        let newPos = {
                            x: action.data.location.x - (token.w / 2),
                            y: action.data.location.y - (token.h / 2)
                        };

                        if (!canvas.grid.hitArea.contains(newPos.x, newPos.y)) {
                            //+++find the closest spot on the edge of the scene
                            ui.notifications.error("MonksActiveTiles.msg.prevent-teleport");
                            return;
                        }
                        if (action.data.snap)
                            newPos = canvas.grid.getSnappedPosition(newPos.x, newPos.y);

                        if (action.data.wait) {
                            await token.setPosition(newPos.x, newPos.y);
                            await tokendoc.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: false });
                        } else
                            tokendoc.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: true });
                    }
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' ' + action.data?.entity.name + ' to ' + (action.data?.location.id ? action.data?.location.name : '[' + action.data?.location.x + ',' + action.data?.location.y + ']') + (action.data?.snap ? ' (snap to grid)' : '') + (action.data?.wait ? ' (wait)' : '');
            }
        },
        'showhide': {
            name: "MonksActiveTiles.action.showhide",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Tile); }
                },
                {
                    id: "hidden",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "hidden",
                    type: "list"
                }
            ],
            values: {
                'hidden': {
                    'show': "MonksActiveTiles.hidden.show",
                    'hide': "MonksActiveTiles.hidden.hide",
                    'toggle': "MonksActiveTiles.hidden.toggle"
                }
            },
            fn: async (tile, token, action) => {
                //find the item in question
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);

                if (entities && entities.length > 0) {
                    //set or toggle visible
                    for (let e of entities) {
                        await e.update({ hidden: (action.data.hidden == 'toggle' ? !e.data.hidden : action.data.hidden !== 'show') });
                    }
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.values.hidden[action.data?.hidden]) + ' ' + action.data?.entity.name;
            }
        },
        'create': {
            name: "MonksActiveTiles.action.createtoken",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false, showToken: false, showWithin: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof Actor); }
                },
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "either",
                    restrict: (entity) => { return (entity instanceof Tile && this.scene.id == entity.parent.id) || this.scene.id == entity.id; }
                },
                {
                    id: "snap",   //using remote snap because I don't want this to trigger the token to be snapped to the grid on the tile
                    name: "MonksActiveTiles.ctrl.snap",
                    type: "checkbox",
                    defvalue: true
                },
                {
                    id: "invisible",   //using remote snap because I don't want this to trigger the token to be snapped to the grid on the tile
                    name: "MonksActiveTiles.ctrl.invisible",
                    type: "checkbox",
                    defvalue: false
                }
            ],
            fn: async (tile, token, action) => {
                //find the item in question
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);

                if (entities && entities.length > 0) {
                    if (action.data.location.id) {
                        //this is directing to a Tile
                        let destTile = await fromUuid(action.data.location.id);
                        action.data.location.x = destTile.data.x + (destTile.data.width / 2);
                        action.data.location.y = destTile.data.y + (destTile.data.height / 2);
                    }
                    //set or toggle visible
                    for (let actor of entities) {
                        //let actor = await Actor.implementation.fromDropData({id: entity.id, type: 'Actor'});
                        if (actor.compendium) {
                            const actorData = game.actors.fromCompendium(actor);
                            actor = await Actor.implementation.create(actorData);
                        }

                        let data = {
                            x: action.data.location.x,
                            y: action.data.location.y,
                            hidden: false
                        };
                        // Prepare the Token data
                        const td = await actor.getTokenData(data);

                        // Bypass snapping
                        if (!action.data.snap) {
                            td.update({
                                x: td.x - (td.width * canvas.grid.w / 2),
                                y: td.y - (td.height * canvas.grid.h / 2)
                            });
                        }
                        // Otherwise snap to nearest vertex, adjusting for large tokens
                        else {
                            const hw = canvas.grid.w / 2;
                            const hh = canvas.grid.h / 2;
                            td.update(canvas.grid.getSnappedPosition(td.x - (td.width * hw), td.y - (td.height * hh)));
                        }

                        // Validate the final position
                        if (!canvas.dimensions.rect.contains(td.x, td.y)) continue;

                        if (action.data.invisible)
                            td.hidden = true;

                        // Submit the Token creation request and activate the Tokens layer (if not already active)
                        const cls = getDocumentClass("Token");
                        let tkn = await cls.create(td, { parent: tile.parent });

                        if (action.data.invisible)
                            tkn.update({hidden: true});
                    }
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' ' + action.data?.entity.name + ' to ' + (action.data?.location.id ? action.data?.location.name : '[' + action.data?.location.x + ',' + action.data?.location.y + ']') + (action.data?.snap ? ' (snap to grid)' : '');
            }
        },
        'activate': {
            name: "MonksActiveTiles.action.activate",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: false, showWithin: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof Tile || entity instanceof AmbientLight || entity instanceof AmbientSound); }
                },
                {
                    id: "activate",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "activate",
                    type: "list"
                }
            ],
            values: {
                'activate': {
                    'deactivate': "MonksActiveTiles.activate.deactivate",
                    'activate': "MonksActiveTiles.activate.activate",
                    'toggle': "MonksActiveTiles.activate.toggle"

                }
            },
            fn: async (tile, token, action) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);
                if (entities.length == 0)
                    return;

                let entity = entities[0];

                if (entity instanceof AmbientLightDocument || entity instanceof AmbientSoundDocument)
                    await entity.update({ hidden: (action.data.activate == 'toggle' ? !entity.data.hidden : (action.data.activate != 'activate')) });
                else
                    await entity.setFlag('monks-active-tiles', 'active', (action.data.activate == 'toggle' ? !entity.getFlag('monks-active-tiles', 'active') : action.data.activate == 'activate'));
            },
            content: (trigger, action) => {
                return i18n(trigger.values.activate[action.data?.activate]) + ' ' + action.data?.entity.name;
            }
        },
        'alter': {
            name: "MonksActiveTiles.action.alter",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity"
                },
                {
                    id: "attribute",
                    name: "MonksActiveTiles.ctrl.attribute",
                    type: "text"
                },
                {
                    id: "value",
                    name: "MonksActiveTiles.ctrl.value",
                    type: "text"
                },
                {
                    id: "chatMessage",
                    name: "MonksActiveTiles.ctrl.chatmessage",
                    type: "checkbox"
                },
                {
                    id: "rollmode",
                    name: 'MonksActiveTiles.ctrl.rollmode',
                    list: "rollmode",
                    type: "list"
                }
            ],
            values: {
                'rollmode': {
                    "roll": 'MonksActiveTiles.rollmode.public',
                    "gmroll": 'MonksActiveTiles.rollmode.private',
                    "blindroll": 'MonksActiveTiles.rollmode.blind',
                    "selfroll": 'MonksActiveTiles.rollmode.self'
                }
            },
            fn: async (tile, token, action, userid) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);

                if (entities && entities.length > 0) {
                    for (let entity of entities) {
                        let attr = action.data.attribute;

                        let prop = getProperty(entity.data, attr);
                        if (prop == undefined && entity instanceof TokenDocument) {
                            entity = entity.actor;
                            attr = 'data.' + attr;
                            prop = getProperty(entity.data, attr);
                        }

                        if (prop == undefined) {
                            debug("Couldn't find attribute", entity, attr);
                            return;
                        }

                        if (typeof prop == 'object') {
                            if (prop.value == undefined) {
                                debug("Attribute reurned an object and the object doesn't have a value property", entity, attr, prop);
                                return;
                            }

                            attr = attr + '.value';
                            prop = prop.value;
                        }


                        let update = {};
                        let value = action.data.value;

                        if (value == 'true') value = true;
                        else if (value == 'false') value = false;
                        else {
                            let context = { actor: token?.actor.data, token: token?.data, tile: tile.data, user: game.users.get(userid) };

                            if (value.includes("{{")) {
                                const compiled = Handlebars.compile(value);
                                value = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                            }

                            const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                            value = await MonksActiveTiles.inlineRoll(value, rgx, action.data.chatMessage, action.data.rollmode, token);

                            if (value.startsWith('+ ') || value.startsWith('- ')) {
                                value = eval(prop + value);
                            }

                            if (!isNaN(value) && !isNaN(parseFloat(value)))
                                value = parseFloat(value);
                        }
                        update[attr] = value;
                        await entity.update(update);
                    }
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' ' + action.data?.entity.name + ', ' + (action.data?.value.startsWith('+ ') ? 'increase ' + action.data?.attribute + ' by ' + action.data?.value.substring(2) :
                    (action.data?.value.startsWith('- ') ? 'decrease ' + action.data?.attribute + ' by ' + action.data?.value.substring(2) :
                        'set ' + action.data?.attribute + ' to ' + action.data?.value));
            }
        },
        'playsound': {
            name: "MonksActiveTiles.action.playsound",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "audiofile",
                    name: "MonksActiveTiles.ctrl.audiofile",
                    type: "filepicker",
                    subtype: "audio"
                },
                {
                    id: "audiofor",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "audiofor",
                    type: "list"
                },
                {
                    id: "scenerestrict",
                    name: "MonksActiveTiles.ctrl.scenerestrict",
                    type: "checkbox"
                }
            ],
            values: {
                'audiofor': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm",
                    'token': "MonksActiveTiles.for.token"
                }
            },
            fn: (tile, token, action, userid) => {
                //play the sound
                if (action.data.audiofor != 'gm')
                    MonksActiveTiles.emit('playsound', { src: action.data.audiofile, userid: (action.data.audiofor == 'token' ? userid : null), sceneid: (action.data.audiofor == 'token' ? null : tile.parent.id) });
                if (action.data.audiofor != 'token' || userid == game.user.id)
                    AudioHelper.play({ src: action.data.audiofile }, false);
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' for ' + i18n(trigger.values.audiofor[action.data.audiofor]);
            }
        },
        'changedoor': {
            name: "MonksActiveTiles.action.changedoor",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.selectdoor",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false, showToken: false, showWithin: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof Wall && entity.data.door); }  //this needs to be a wall segment
                },
                {
                    id: "state",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "state",
                    type: "list"
                }
            ],
            values: {
                'state': {
                    'open': "MonksActiveTiles.state.open",
                    'close': "MonksActiveTiles.state.closed",
                    'lock': "MonksActiveTiles.state.locked",
                    'toggle': "MonksActiveTiles.state.toggle"
                }
            },
            fn: async (tile, token, action) => {
                //Find the door in question, set the state to whatever value
                let wall = await fromUuid(action.data.entity.id);
                if (wall && wall.data.door != 0) {
                    let state = (action.data.state == 'open' ? CONST.WALL_DOOR_STATES.OPEN : (action.data.state == 'lock' ? CONST.WALL_DOOR_STATES.LOCKED : CONST.WALL_DOOR_STATES.CLOSED));
                    if (action.data.state == 'toggle' && wall.data.ds != CONST.WALL_DOOR_STATES.LOCKED)
                        state = (wall.data.ds == CONST.WALL_DOOR_STATES.OPEN ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.OPEN);
                    await wall.update({ ds: state });
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' ' + action.data?.entity.name + ' to ' + i18n(trigger.values.state[action.data?.state]);
            }
        },
        'notification': {
            name: "MonksActiveTiles.action.notification",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "text",
                    name: "MonksActiveTiles.ctrl.text",
                    type: "text"
                },
                {
                    id: "type",
                    name: "MonksActiveTiles.ctrl.type",
                    list: "type",
                    type: "list"
                },
                {
                    id: "showto",
                    name: "MonksActiveTiles.ctrl.showto",
                    list: "showto",
                    type: "list"
                }
            ],
            values: {
                'type': {
                    'info': "MonksActiveTiles.notification.info",
                    'warning': "MonksActiveTiles.notification.warning",
                    'error': "MonksActiveTiles.notification.error"
                },
                'showto': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm",
                    'token': "MonksActiveTiles.for.token"

                }
            },
            fn: (tile, token, action, userid) => {
                //Display a notification with the message
                let context = { actor: token?.actor.data, token: token?.data, tile: tile.data, user: game.users.get(userid) };
                let content = action.data.text;

                if (content.includes("{{")) {
                    const compiled = Handlebars.compile(content);
                    content = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                }

                if (action.data.showto != 'gm')
                    MonksActiveTiles.emit('notification', { content: content, type: action.data.type, userid: (action.data.showto == 'token' ? userid : null) });
                if (action.data.showto != 'token' || userid == game.user.id)
                    ui.notifications.notify(content, action.data.type);
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' to ' + i18n(trigger.values.showto[action.data?.showto]);
            }
        },
        'chatmessage': {
            name: "MonksActiveTiles.action.chatmessage",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "text",
                    name: "MonksActiveTiles.ctrl.text",
                    type: "text",
                    subtype: "multiline"
                },
                {
                    id: "flavor",
                    name: "MonksActiveTiles.ctrl.flavor",
                    type: "text"
                },
                {
                    id: "for",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "for",
                    type: "list"
                },
                {
                    id: "language",
                    name: "MonksActiveTiles.ctrl.language",
                    list: () => {
                        let languages = mergeObject({'': ''}, duplicate(CONFIG[game.system.id.toUpperCase()].languages));
                        return languages;
                    },
                    conditional: () => { return (game.modules.get("polyglot")?.active); },
                    type: "list"
                }
            ],
            values: {
                'for': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm",
                    'token': "MonksActiveTiles.for.token"
                }
            },
            fn: (tile, token, action, userid) => {
                //Add a chat message
                
                const speaker = ChatMessage.getSpeaker({ token: token });

                let context = { actor: token?.actor.data, token: token?.data, tile: tile.data, user: game.users.get(userid) };
                let content = action.data.text;

                if (content.includes("{{")) {
                    const compiled = Handlebars.compile(content);
                    content = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                }

                let messageData = {
                    user: game.user.id,
                    speaker: speaker,
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                    content: content
                };

                if (action.data.flavor)
                    messageData.flavor = action.data.flavor;

                if (action.data.for == 'gm')
                    messageData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
                else if (action.data.for == 'token') {
                    let tokenOwners = (token ? Object.entries(token?.actor.data.permission).filter(([k, v]) => { return v == CONST.ENTITY_PERMISSIONS.OWNER }).map(a => { return a[0]; }) : []);
                    messageData.whisper = Array.from(new Set(ChatMessage.getWhisperRecipients("GM").map(u => u.id).concat(tokenOwners)));
                }

                if (action.data.language != '')
                    mergeObject(messageData, { flags: { 'monks-active-tiles': { language: action.data.language } } });

                ChatMessage.create(messageData);
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' for ' + i18n(trigger.values.for[action.data?.for]);
            }
        },
        /*'castspell': {
            name: 'Cast Spell',
            fn: (tile, token) => {
                //Figure out what spell needs to be cast
            }
        }*/
        'runmacro': {
            name: "MonksActiveTiles.action.runmacro",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "macroid",
                    name: "MonksActiveTiles.ctrl.macro",
                    list: () => {
                        let result = {};
                        for (let macro of game.macros.contents.sort((a, b) => { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)})) {
                            result[macro.id] = macro.name;
                        }
                        return result;
                    },
                    type: "list"
                },
                {
                    id: "args",
                    name: "MonksActiveTiles.ctrl.args",
                    type: "text",
                    conditional: () => {
                        return (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active);
                    }
                }
            ],
            fn: async (tile, token, action, userid) => {
                //Find the macro to be run, call it with the data from the trigger
                let macro = game.macros.get(action.data.macroid);
                if (macro instanceof Macro) {
                    return await MonksActiveTiles._executeMacro(macro, tile, token, action, userid);
                }
            },
            content: (trigger, action) => {
                let macro = game.macros.get(action.data?.macroid);
                return i18n(trigger.name) + ', ' + macro?.name;
            }
        },
        'rolltable': {
            name: "MonksActiveTiles.action.rolltable",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "rolltableid",
                    name: "MonksActiveTiles.ctrl.selectrolltable",
                    list: () => {
                        let result = {};
                        for (let table of game.tables.contents) {
                            result[table.id] = table.name;
                        }
                        return result;
                    },
                    type: "list"
                },
                {
                    id: "rollmode",
                    name: 'MonksActiveTiles.ctrl.rollmode',
                    list: "rollmode",
                    type: "list"
                }
            ],
            values: {
                'rollmode': {
                    "roll": 'MonksActiveTiles.rollmode.public',
                    "gmroll": 'MonksActiveTiles.rollmode.private',
                    "blindroll": 'MonksActiveTiles.rollmode.blind',
                    "selfroll": 'MonksActiveTiles.rollmode.self'
                }
            },
            fn: async (tile, token, action) => {
                //Find the roll table
                let rolltable = game.tables.get(action.data?.rolltableid);
                if (rolltable instanceof RollTable) {
                    //Make a roll
                    let result = rolltable.draw({rollMode: action.data.rollmode});
                    //Check to see what the privacy rules are
                }
            },
            content: (trigger, action) => {
                let rolltable = game.tables.get(action.data?.rolltableid);
                return i18n(trigger.name) + ', ' + rolltable?.name;
            }
        },
        'resetfog': {
            name: "MonksActiveTiles.action.resetfog",
            ctrls: [
                /*
                {
                    id: "for",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "for",
                    type: "list"
                }
                */
            ],
            values: {
                'for': {
                    'all': "MonksActiveTiles.for.all",
                    //'token': "MonksActiveTiles.for.token"
                }
            },
            fn: async (tile, token, action) => {
                //if (action.data?.for == 'token') {
                    //canvas.sight._onResetFog(result)
                //}
                //else 
                    canvas.sight.resetFog();
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' for ' + (action.data?.for == 'token' ? 'Token' : 'Everyone');
            }
        },
        'activeeffect': {
            name: "MonksActiveTiles.action.activeeffect",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "effectid",
                    name: "MonksActiveTiles.ctrl.effectlist",
                    list: () => {
                        let result = {};
                        let conditions = CONFIG.statusEffects;
                        if (game.system.id == 'pf2e') {
                            conditions = game.pf2e.ConditionManager.conditions;
                            conditions = [...conditions].map(e => { return { id: e[0], label: e[1].name }; });
                        }
                        for (let effect of conditions.sort((a, b) => { return String(a.label).localeCompare(b.label) })) { //(i18n(a.label) > i18n(b.label) ? 1 : (i18n(a.label) < i18n(b.label) ? -1 : 0))
                            result[effect.id] = i18n(effect.label);
                        }
                        return result;
                    },
                    type: "list"
                },
                {
                    id: "addeffect",
                    name: "Add Effect",
                    type: "list",
                    list: 'add',
                    defvalue: 'add'
                }
            ],
            values: {
                'add': {
                    'add': "MonksActiveTiles.add.add",
                    'remove': "MonksActiveTiles.add.remove",
                    'toggle': "MonksActiveTiles.add.toggle"

                }
            },
            fn: async (tile, token, action) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);
                if (entities.length == 0)
                    return;

                if (game.system.id == 'pf2e') {
                    let effect = game.pf2e.ConditionManager.getCondition(action.data?.effectid);

                    for (let token of entities) {
                        if (token == undefined)
                            continue;

                        let add = (action.data?.addeffect == 'add');

                        let existing = token.actor.itemTypes.condition.find((condition => condition.getFlag("core", "sourceId") === effect.flags.core.sourceId));
                        if (action.data?.addeffect == 'toggle') {
                            add = (existing == undefined);
                        }

                        if (add)
                            await game.pf2e.ConditionManager.addConditionToToken(effect, token.object);
                        else
                            await game.pf2e.ConditionManager.removeConditionFromToken(existing.id, token.object)
                    }
                } else {
                    let effect = CONFIG.statusEffects.find(e => e.id === action.data?.effectid);

                    for (let token of entities) {
                        if (token == undefined)
                            continue;

                        if (action.data?.addeffect == 'toggle')
                            await token.object.toggleEffect(effect, { overlay: false });
                        else {
                            const exists = (token.actor.effects.find(e => e.getFlag("core", "statusId") === effect.id) != undefined);
                            if (exists != (action.data?.addeffect == 'add'))
                                await token.object.toggleEffect(effect, { overlay: false });
                        }
                    }
                }
            },
            content: (trigger, action) => {
                let effect = CONFIG.statusEffects.find(e => e.id === action.data?.effectid);
                if (game.system.id == 'pf2e')
                    effect = game.pf2e.ConditionManager.getCondition(action.data?.effectid);
                return (action.data?.addeffect == 'add' ? i18n("MonksActiveTiles.add.add") : (action.data?.addeffect == 'remove' ? i18n("MonksActiveTiles.add.remove") : i18n("MonksActiveTiles.add.toggle"))) + ' ' + (i18n(effect.label) || effect.name) + ' ' + (action.data?.addeffect == 'add' ? "to" : (action.data?.addeffect == 'remove' ? "from" : "on")) + ' ' + action.data?.entity.name;
            }
        },
        'playanimation': {
            name: "MonksActiveTiles.action.playanimation",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: false, showWithin: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof Tile); }
                },
                {
                    id: "play",
                    name: "MonksActiveTiles.ctrl.animation",
                    list: "animate",
                    type: "list"
                }
            ],
            values: {
                'animate': {
                    'start': "MonksActiveTiles.animate.start",
                    'pause': "MonksActiveTiles.animate.pause",
                    'stop': "MonksActiveTiles.animate.stop"

                }
            },
            fn: async (tile, token, action) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);
                if (entities.length == 0)
                    return;

                let entity = entities[0];

                if (entity.object.isVideo) {
                    //entity.play(action.data?.play == 'start', { offset: (action.data?.play == 'stop' ? 0 : null) });
                    entity.update({ "video.autoplay": false }, { diff: false, playVideo: action.data?.play == 'start' });
                    if (action.data?.play == 'stop') {
                        game.socket.emit(
                            MonksActiveTiles.SOCKET,
                            {
                                action: 'stopvideo',
                                tileid: entity.uuid
                            },
                            (resp) => { }
                        );
                        const el = entity.object.sourceElement;
                        if (el?.tagName !== "VIDEO") return;

                        game.video.stop(el);
                    }
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.values.animate[action.data?.play]) + ' animation on ' + action.data?.entity.name;
            }
        },
        'openjournal': {
            name: "MonksActiveTiles.action.openjournal",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false, showToken: false, showWithin: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof JournalEntry); }
                },
                {
                    id: "showto",
                    name: "MonksActiveTiles.ctrl.showto",
                    list: "showto",
                    type: "list"
                }
            ],
            values: {
                'showto': {
                    'everyone': "MonksActiveTiles.showto.everyone",
                    'players': "MonksActiveTiles.showto.players",
                    'trigger': "MonksActiveTiles.showto.trigger"

                }
            },
            fn: async (tile, token, action, userid) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);
                if (entities.length == 0)
                    return;

                let entity = entities[0];

                //open journal
                if (entity)
                    MonksActiveTiles.emit('journal', { showto: action.data.showto, userid: userid, entityid: entity.id });
                if (game.user.isGM && (action.data.showto == 'everyone' || action.data.showto == undefined || (action.data.showto == 'trigger' && userid == game.user.id)))
                    entity.sheet.render(true);
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ', ' + action.data?.entity.name;
            }
        },
        'additem': {
            name: "MonksActiveTiles.action.additem",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false, showToken: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "item",
                    name: "MonksActiveTiles.ctrl.select-item",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false, showToken: false, showWithin: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof Item); }
                }
            ],
            fn: async (tile, token, action, userid) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);
                if (entities.length == 0)
                    return;

                let item = await MonksActiveTiles.getEntities(tile, token, action.data.item.id);
                if (item[0]) {
                    for (let token of entities) {
                        const itemData = item[0].toObject();

                        const actor = token.actor;
                        if (!actor) return;

                        // Create the owned item
                        actor.createEmbeddedDocuments("Item", [itemData]);
                    }
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ', ' + action.data?.item.name + ' to ' + action.data?.entity.name;
            }
        },
        'permissions': {
            name: "MonksActiveTiles.action.permission",
            options: { allowDelay: false },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false, showToken: false, showWithin: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Note || entity instanceof JournalEntry); }
                },
                {
                    id: "changefor",
                    name: "MonksActiveTiles.ctrl.changefor",
                    list: "showto",
                    type: "list"
                },
                {
                    id: "permission",
                    name: "MonksActiveTiles.ctrl.permission",
                    list: "permissions",
                    type: "list"
                }

            ],
            values: {
                'showto': {
                    'everyone': "MonksActiveTiles.showto.everyone",
                    'trigger': "MonksActiveTiles.showto.trigger"

                },
                'permissions': {
                    'default': "PERMISSION.DEFAULT",
                    'none': "PERMISSION.NONE",
                    'limited': "PERMISSION.LIMITED",
                    'observer': "PERMISSION.OBSERVER",
                    'owner': "PERMISSION.OWNER"

                }
            },
            fn: async (tile, token, action, userid) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);
                if (entities.length == 0)
                    return;

                let level = (action.data.permission == 'limited' ? CONST.ENTITY_PERMISSIONS.LIMITED :
                    (action.data.permission == 'observer' ? CONST.ENTITY_PERMISSIONS.OBSERVER :
                        (action.data.permission == 'owner' ? CONST.ENTITY_PERMISSIONS.OWNER : CONST.ENTITY_PERMISSIONS.NONE)));

                for (let entity of entities) {
                    const perms = entity.data.permission;
                    for (let user of game.users.contents) {
                        if (user.isGM || (action.data.changefor == 'trigger' && user.id != userid))
                            continue;

                        if (action.data.permission == 'default')
                            delete perms[user.id];
                        else
                            perms[user.id] = level;
                    }
                    entity.update({ permission: perms }, { diff: false, recursive: false, noHook: true });
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' of ' + action.data?.entity.name + ' to ' + i18n(trigger.values.permissions[action.data?.permission]);
            }
        },
        'attack': {
            name: "MonksActiveTiles.action.attack",
            options: { allowDelay: false },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false, showToken: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Token ); }
                },
                {
                    id: "actor",
                    name: "MonksActiveTiles.ctrl.select-actor",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: false, showToken: false, showWithin: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof Actor ); }
                },
                {
                    id: "attack",
                    name: "MonksActiveTiles.ctrl.attack",
                    list: async function (data) {
                        if (!data?.actor?.id)
                            return;

                        let actor = await fromUuid(data?.actor?.id);
                        if (!actor)
                            return;

                        let attacks = {};
                        for (let item of actor.items) {
                            if (item.type == 'weapon')
                                attacks[item.id] = item.name;
                        }

                        return attacks;
                    },
                    type: "list"
                }

            ],
            fn: async (tile, token, action, userid) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action.data.entity.id);
                if (entities.length == 0)
                    return;

                //get the actor and the attack and the entities to apply this to.
                if (action.data?.actor.id) {
                    let actor = await fromUuid(action.data?.actor.id);
                    let item = actor.items.get(action.data?.attack?.id);

                    if (item) {
                        item.roll();
                    }
                }

                for (let entity of entities) {
                    entity.object.setTarget(true, { releaseOthers: false });
                }
            },
            content: (trigger, action) => {
                if (!action.data?.actor.id)
                    return i18n(trigger.name);
                //let actor = fromUuid(action.data?.actor.id);
                //let item = actor.items.get(action.data.attack);
                return i18n(trigger.name) + ' using ' + action.data?.actor.name + ', ' + action.data?.attack?.name;
            }
        }
    }

    static async getEntities(tile, token, id) {
        let entity;
        if (id == 'tile')
            entity = [tile];
        else if (id == 'token')
            entity = [token];
        else if (id == 'players') {
            entity = canvas.tokens.placeables.filter(t => {
                return t.actor != undefined && t.actor?.hasPlayerOwner && t.actor?.data.type != 'npc';
            }).map(t => t.document);
        }
        else if (id == 'within') {
            //find all tokens with this Tile
            entity = canvas.tokens.placeables.filter(t => {
                let offsetW = t.w / 2;
                let offsetH = t.h / 2;
                return tile.object.hitArea.contains((t.x + offsetW) - tile.data.x, (t.y + offsetH) - tile.data.y);
            }).map(t => t.document);
        }
        else {
            entity = await fromUuid(id);
            entity = [entity];
        }

        return entity;
    }

    static async _executeMacro(macro, tile, token, action, userid) {
        let context = { actor: token?.actor, token: token?.object, tile: tile.object, user: game.users.get(userid) };
        let args = action.data.args;

        if (args == undefined || args == "")
            args = [];
        else {
            if (args.includes("{{")) {
                const compiled = Handlebars.compile(args);
                args = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
            }

            args = args.match(/\\?.|^$/g).reduce((p, c) => {
                if (c === '"') {
                    p.quote ^= 1;
                } else if (!p.quote && c === ' ') {
                    p.a.push('');
                } else {
                    p.a[p.a.length - 1] += c.replace(/\\(.)/, "$1");
                }
                return p;
            }, { a: [''] }).a

            for (let i = 0; i < args.length; i++) {
                if (!isNaN(args[i]) && !isNaN(parseFloat(args[i])))
                    args[i] = parseFloat(args[i]);
            }
        }

        context.args = args;

        if (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active) {
            //if (!(macro.getFlag("advanced-macros", "runAsGM") || macro.getFlag("furnace", "runAsGM") || token == undefined) && userid != game.user.id) {
            //if ((getProperty(macro, "data.flags.advanced-macros.runAsGM") || getProperty(macro, "data.flags.furnace.runAsGM") || token == undefined) && !game.user.isGM) {
            if (getProperty(macro, "data.flags.advanced-macros.runAsGM") || getProperty(macro, "data.flags.furnace.runAsGM") || userid == game.user.id) {
                //execute the macro if it's set to run as GM or it was the GM that actually moved the token.
                return await macro.execute.apply(macro, [context]);
            } else {
                //this one needs to be run as the player, so send it back
                MonksActiveTiles.emit('runmacro', {
                    userid: userid,
                    macroid: macro.uuid,
                    tileid: tile?.uuid,
                    tokenid: token?.uuid,
                    args: args
                });
            }
        } else
            return await macro.execute(context);
    }

    static findVacantSpot(pos, token, scene, dest, snap) {
        let tokenCollide = function (pt) {
            let ptWidth = (token.data.width * scene.data.size) / 2;
            let checkpt = duplicate(pt);
            if (snap) {
                checkpt.x += ((token.data.width * scene.data.size) / 2);
                checkpt.y += ((token.data.height * scene.data.size) / 2);
            }

            let found = scene.tokens.find(tkn => {
                if (token.id == tkn.id)
                    return false;

                let tokenX = tkn.data.x + ((tkn.data.width * scene.data.size) / 2);
                let tokenY = tkn.data.y + ((tkn.data.height * scene.data.size) / 2);

                let distSq = parseInt(Math.sqrt(Math.pow(checkpt.x - tokenX, 2) + Math.pow(checkpt.y - tokenY, 2)));
                let radSumSq = ((tkn.data.width * scene.data.size) / 2) + ptWidth;

                let result = (distSq < radSumSq - 5);
                
                //log('check', count, dist, tkn.name, distSq, radSumSq, checkpt, tkn, result);
                //gr.lineStyle(2, 0x808080).drawCircle(tokenX + debugoffset.x, tokenY + debugoffset.y, ((tkn.data.width * scene.data.size) / 2));
                

                return result;
            })

            return found != undefined;
        }

        let wallCollide = function (ray) {
            return canvas.walls.checkCollision(ray);
        }

        let outsideTile = function (pt) {
            let checkpt = duplicate(pt);
            if (snap) {
                checkpt.x += ((token.data.width * scene.data.size)/ 2);
                checkpt.y += ((token.data.height * scene.data.size) / 2);
            }

            if (dest) {
                
                //gr.lineStyle(2, 0x808080).drawRect(dest.data.x + debugoffset.x, dest.data.y + debugoffset.y, dest.data.width, dest.data.height);

                return (checkpt.x < dest.data.x || checkpt.y < dest.data.y || checkpt.x > dest.data.x + dest.data.width || checkpt.y > dest.data.y + dest.data.height);
            }
            return false;
        }

        /*let debugoffset = (scene != undefined ? { x: -(pos.x - scene.dimensions.paddingX), y: -(pos.y - scene.dimensions.paddingY) } : { x: 0, y: 0 });
        let gr = new PIXI.Graphics();
        if (MonksActiveTiles.debugGr)
            canvas.tokens.removeChild(MonksActiveTiles.debugGr);
        MonksActiveTiles.debugGr = gr;
        canvas.tokens.addChild(gr);
        gr.beginFill(0x0000ff).drawCircle(pos.x + debugoffset.x, pos.y + debugoffset.y, 4).endFill();*/

        let count = 0;
        const tw = (token.data.width * scene.data.size);
        let dist = 0;
        let angle = null;
        let rotate = 1; //should be set first thing, but if it isn't just make sure it's not 0
        let spot = duplicate(pos);
        let checkspot = duplicate(spot);
        if (snap) {
            checkspot.x -= ((token.data.width * scene.data.size) / 2);
            checkspot.y -= ((token.data.height * scene.data.size) / 2);
            checkspot.x = checkspot.x.toNearest(scene.data.size);
            checkspot.y = checkspot.y.toNearest(scene.data.size);
        }
        let ray = new Ray({ x: pos.x, y: pos.y }, { x: checkspot.x, y: checkspot.y });
        while (tokenCollide(checkspot) || wallCollide(ray) || outsideTile(checkspot)) {
            count++;
            //move the point along
            if (angle == undefined || angle > 2 * Math.PI) {
                dist += scene.data.size;
                angle = 0;
                rotate = Math.atan2(tw, dist); //What's the angle to move, so at this distance, the arc travles the token width
            } else {
                //rotate
                angle += rotate;
            }
            spot.x = pos.x + (Math.cos(angle) * dist);
            spot.y = pos.y + (-Math.sin(angle) * dist);
            checkspot = duplicate(spot);

            //need to check that the resulting snap to grid isn't going to put this out of bounds
            if (snap) {
                checkspot.x -= ((token.data.width * scene.data.size) / 2);
                checkspot.y -= ((token.data.height * scene.data.size) / 2);
                checkspot.x = checkspot.x.toNearest(scene.data.size);
                checkspot.y = checkspot.y.toNearest(scene.data.size);

                ray.B.x = checkspot.x + ((token.data.width * scene.data.size) / 2);
                ray.B.y = checkspot.y + ((token.data.height * scene.data.size) / 2);
            } else {
                ray.B.x = checkspot.x;
                ray.B.y = checkspot.y;
            }

            //for testing
            /*
            log('Checking', checkspot, dest);

            let collide = wallCollide(ray);
            let tcollide = tokenCollide(checkspot);
            let outside = outsideTile(checkspot);

            if (spot.x != checkspot.x || spot.y != checkspot.y) {
                gr.beginFill(0x800080)
                    .lineStyle(2, 0x800080)
                    .moveTo(spot.x + debugoffset.x, spot.y + debugoffset.y)
                    .lineTo(checkspot.x + debugoffset.x, checkspot.y + debugoffset.y)
                    .drawCircle(spot.x + debugoffset.x, spot.y + debugoffset.y, 4).endFill();
            }
            gr.beginFill(collide ? 0xff0000 : (tcollide ? 0xffff00 : 0x00ff00)).drawCircle(checkspot.x + debugoffset.x, checkspot.y + debugoffset.y, 4).endFill();

            log('checkspot', checkspot, dist, collide, tcollide, outside);*/
            
            if (count > 50) {
                //if we've exceeded the maximum spots to check then set it to the original spot
                spot = pos;
                break;
            }
        }

        //gr.lineStyle(2, 0x00ff00).drawCircle(spot.x + debugoffset.x, spot.y + debugoffset.y, 4);

        return spot;
    }

    static async inlineRoll(value, rgx, chatMessage, rollMode, token) {
        let doRoll = function (match, command, formula, closing, label, ...args) {
            if (closing.length === 3) formula += "]";
            let roll = Roll.create(formula).roll();

            if (chatMessage) {
                const cls = ChatMessage.implementation;
                const speaker = cls.getSpeaker({token:token});
                roll.toMessage({ flavor: (label ? `${label}: ${roll.total}` : roll.total), speaker }, { rollMode: rollMode });
            }

            return roll.total;
        }

        let retVal = value;

        const matches = value.matchAll(rgx);
        for (let match of Array.from(matches).reverse()) {
            //+++ need to replace this value in value
            let result = doRoll(...match);
            retVal = retVal.replace(match[0], result);
        }

        return retVal;
    }

    constructor() {
    }

    static init() {
        log('Initializing Monks Active Tiles');
        registerSettings();

        game.MonksActiveTiles = this;

        MonksActiveTiles.SOCKET = "module.monks-active-tiles";

        //MonksActiveTiles._oldObjectClass = CONFIG.Tile.objectClass;
        //CONFIG.Tile.objectClass = WithActiveTile(CONFIG.Tile.objectClass);

        MonksActiveTiles._oldSheetClass = CONFIG.Tile.sheetClass;
        CONFIG.Tile.sheetClass = WithActiveTileConfig(CONFIG.Tile.sheetClass);

        MonksActiveTiles.setupTile();

        let updateSelection = function (wrapped, ...args) {
            let event = args[0];
            let waitingType = MonksActiveTiles.waitingInput?.waitingfield?.data('type');
            if (waitingType == 'location' || waitingType == 'either') {
                let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
                if (restrict && !restrict(canvas.scene)) {
                    ui.notifications.error(i18n("MonksActiveTiles.msg.invalid-location"));
                    return;
                }

                let pos = event.data.getLocalPosition(canvas.app.stage);
                let update = { x: parseInt(pos.x), y: parseInt(pos.y), sceneId: (canvas.scene.id != MonksActiveTiles.waitingInput.options.parent.object.parent.id ? canvas.scene.id : null) };
                MonksActiveTiles.waitingInput.updateSelection(update);
            }

            if (canvas.activeLayer.name == 'TokenLayer') {
                //check to see if there are any Tiles that can be activated with a click
                for (let tile of canvas.scene.tiles) {
                    let triggerData = tile.data.flags["monks-active-tiles"];
                    if (triggerData && triggerData.active && triggerData.trigger == 'click') {

                        //check to see if this trigger is restricted by control type
                        if ((triggerData.controlled == 'gm' && !game.user.isGM) || (triggerData.controlled == 'player' && game.user.isGM))
                            continue;

                        //check to see if the clicked point is within the Tile
                        let pt = event.data.origin;
                        if (!(pt.x < tile.data.x || pt.y < tile.data.y || pt.x > tile.data.x + tile.data.width || pt.y > tile.data.y + tile.data.height)) {
                            tile.trigger();
                        }
                    }
                }
            }

            wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Canvas.prototype._onClickLeft", updateSelection, "WRAPPER");
        } else {
            const oldClickLeft = Canvas.prototype._onClickLeft;
            Canvas.prototype._onClickLeft = function (event) {
                return updateSelection.call(this, oldClickLeft.bind(this), ...arguments);
            }
        }

        let clickEntityName = async function (wrapped, ...args) {
            let event = args[0];
            let waitingType = MonksActiveTiles.waitingInput?.waitingfield?.data('type');
            if (waitingType == 'entity') { //+++ need to make sure this is allowed, only create should be able to select templates
                event.preventDefault();
                const entityId = event.currentTarget.closest(".entity").dataset.entityId;
                const entity = this.constructor.collection.get(entityId);
                MonksActiveTiles.waitingInput.updateSelection({ id: entity.uuid, name: entity.name });
            } else
                wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "ActorDirectory.prototype._onClickEntityName", clickEntityName, "MIXED");
        } else {
            const oldClickActorName = ActorDirectory.prototype._onClickEntityName;
            ActorDirectory.prototype._onClickEntityName = function (event) {
                return clickEntityName.call(this, oldClickActorName.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "ItemDirectory.prototype._onClickEntityName", clickEntityName, "MIXED");
        } else {
            const oldClickItemName = ItemDirectory.prototype._onClickEntityName;
            ItemDirectory.prototype._onClickEntityName = function (event) {
                return clickEntityName.call(this, oldClickItemName.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "JournalDirectory.prototype._onClickEntityName", clickEntityName, "MIXED");
        } else {
            const oldClickJournalName = JournalDirectory.prototype._onClickEntityName;
            JournalDirectory.prototype._onClickEntityName = function (event) {
                return clickEntityName.call(this, oldClickJournalName.bind(this), ...arguments);
            }
        }

        let clickCompendiumEntry = async function (wrapped, ...args) {
            let event = args[0];
            if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') { //+++ need to make sure this is allowed, only create should be able to select templates
                let li = event.currentTarget.parentElement;
                const document = await this.collection.getDocument(li.dataset.documentId);
                if (document instanceof Actor || document instanceof Item) 
                    MonksActiveTiles.waitingInput.updateSelection({ id: document.uuid, name: document.name });
                else
                    wrapped(...args);
            } else
                wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Compendium.prototype._onClickEntry", clickCompendiumEntry, "MIXED");
        } else {
            const oldOnClickEntry = Compendium.prototype._onClickEntry;
            Compendium.prototype._onClickEntry = function (event) {
                return clickCompendiumEntry.call(this, oldOnClickEntry.bind(this), ...arguments);
            }
        }

        let oldLightClickLeft = AmbientLight.prototype._onClickLeft;
        AmbientLight.prototype._onClickLeft = function (event) {
            MonksActiveTiles.controlEntity(this);
            return oldLightClickLeft.call(this, event);
        }

        let oldSoundClickLeft = AmbientSound.prototype._onClickLeft;
        AmbientSound.prototype._onClickLeft = function (event) {
            MonksActiveTiles.controlEntity(this);
            return oldSoundClickLeft.call(this, event);
        }

        if (!game.modules.get("drag-ruler")?.active && !game.modules.get("libruler")?.active) {
            /*
            let clear = function (wrapped, ...args) {
                this.cancelMovement = false;
                wrapped(...args);
            }

            if (game.modules.get("lib-wrapper")?.active) {
                libWrapper.register("monks-active-tiles", "Ruler.prototype.clear", clear, "WRAPPER");
            } else {
                const oldClear = Ruler.prototype.clear;
                Ruler.prototype.clear = function (event) {
                    return clear.call(this, oldClear.bind(this));
                }
            }*/

            let moveToken = async function (wrapped, ...args) {
                //this.cancelMovement = false;
                let wasPaused = game.paused;
                if (wasPaused && !game.user.isGM) {
                    ui.notifications.warn("GAME.PausedWarning", { localize: true });
                    return false;
                }
                if (!this.visible || !this.destination) return false;
                const token = this._getMovementToken();
                if (!token) return false;

                // Determine offset relative to the Token top-left.
                // This is important so we can position the token relative to the ruler origin for non-1x1 tokens.
                const origin = canvas.grid.getTopLeft(this.waypoints[0].x, this.waypoints[0].y);
                const s2 = canvas.dimensions.size / 2;
                const dx = Math.round((token.data.x - origin[0]) / s2) * s2;
                const dy = Math.round((token.data.y - origin[1]) / s2) * s2;

                // Get the movement rays and check collision along each Ray
                // These rays are center-to-center for the purposes of collision checking
                let rays = this._getRaysFromWaypoints(this.waypoints, this.destination);
                let hasCollision = rays.some(r => canvas.walls.checkCollision(r));
                if (hasCollision) {
                    ui.notifications.error("ERROR.TokenCollide", { localize: true });
                    return false;
                }

                // Execute the movement path defined by each ray.
                this._state = Ruler.STATES.MOVING;
                let priorDest = undefined;
                for (let r of rays) {
                    // Break the movement if the game is paused
                    if (!wasPaused && game.paused) break;

                    // Break the movement if Token is no longer located at the prior destination (some other change override this)
                    if (priorDest && ((token.data.x !== priorDest.x) || (token.data.y !== priorDest.y))) break;

                    // Adjust the ray based on token size
                    const dest = canvas.grid.getTopLeft(r.B.x, r.B.y);
                    const path = new Ray({ x: token.x, y: token.y }, { x: dest[0] + dx, y: dest[1] + dy });

                    // Commit the movement and update the final resolved destination coordinates
                    let animate = true;
                    priorDest = duplicate(path.B);
                    await token.document.update(path.B, { animate: animate });
                    path.B.x = token.data.x;
                    path.B.y = token.data.y;

                    //if the movement has been canceled then stop processing rays
                    //if (this.cancelMovement)
                    //    break;

                    // Update the path which may have changed during the update, and animate it
                    if (animate)
                        await token.animateMovement(path);
                }

                // Once all animations are complete we can clear the ruler
                this._endMeasurement();
            }

            if (game.modules.get("lib-wrapper")?.active) {
                libWrapper.register("monks-active-tiles", "Ruler.prototype.moveToken", moveToken, "OVERRIDE");
            } else {
                const oldMoveToken = Ruler.prototype.moveToken;
                Ruler.prototype.moveToken = function (event) {
                    return moveToken.call(this, oldMoveToken.bind(this));
                }
            }
        }
    }

    static async onMessage(data) {
        switch (data.action) {
            case 'trigger': {
                if (game.user.isGM) {
                    let token = (data.tokenid ? await fromUuid(data.tokenid) : null);
                    let tile = await fromUuid(data.tileid);

                    tile.trigger(token, data.senderId);
                }
            } break;
            case 'switchview': {
                if (game.user.id == data.userid) {
                    //let oldSize = canvas.scene.data.size;
                    //let oldPos = canvas.scene._viewPosition;
                    let offset = { dx: (canvas.scene._viewPosition.x - data.oldpos.x), dy: (canvas.scene._viewPosition.y - data.oldpos.y) };
                    let scene = game.scenes.get(data.sceneid);
                    await scene.view();
                    //let scale = oldSize / canvas.scene.data.size;
                    let changeTo = { x: data.newpos.x + offset.dx, y: data.newpos.y + offset.dy };
                    //log('change pos', oldPos, data.oldpos, data.newpos, offset, canvas.scene._viewPosition, changeTo);
                    canvas.pan(changeTo);
                    //log('changed', canvas.scene._viewPosition);
                }
            } break;
            case 'runmacro': {
                if (game.user.id == data.userid) {
                    let macro = await fromUuid(data.macroid);
                    let tile = await fromUuid(data.tileid);
                    let token = await fromUuid(data.tokenid);

                    let context = { actor: token?.actor, token: token?.object, tile: tile.object, user: game.users.get(data.userid), args: data.args };
                    await macro.execute.apply(macro, [context]);
                }
            }
            case 'stopvideo': {
                let tile = await fromUuid(data.tileid);
                if (tile) {
                    const el = tile._object?.sourceElement;
                    if (el?.tagName !== "VIDEO") return;

                    game.video.stop(el);
                }
            } break;
            case 'playsound': {
                if ((data.userid == undefined || data.userid == game.user.id) && (data.sceneid == undefined || canvas.scene.id == data.sceneid)) {
                    AudioHelper.play({ src: data.src }, false);
                }
            } break;
            case 'pan': {
                if (data.userid == game.user.id) {
                    if (data.animatepan)
                        canvas.animatePan({ x: data.x, y: data.y });
                    else
                        canvas.pan({ x: data.x, y: data.y });
                }
            } break;
            case 'offsetpan': {
                if (data.userid == game.user.id) {
                    if (data.animatepan)
                        canvas.animatePan({ x: canvas.scene._viewPosition.x - data.x, y: canvas.scene._viewPosition.y - data.y });
                    else
                        canvas.pan({ x: canvas.scene._viewPosition.x - data.x, y: canvas.scene._viewPosition.y - data.y });
                }
            } break;
            case 'fade': {
                if (data.userid == game.user.id) {
                    $('<div>').addClass('active-tile-backdrop').appendTo('body').animate({ opacity: 1 }, {
                        duration: (data.time || 400), easing: 'linear', complete: async function () {
                            $(this).animate({ opacity: 0 }, {
                                duration: (data.time || 400), easing: 'linear', complete: function () { $(this).remove(); }
                            });
                        }
                    });
                }
            } break;
            case 'journal': {
                if ((data.showto == 'players' && !game.user.isGM) || (data.showto == 'trigger' && game.user.id == data.userid) || data.showto == 'everyone' || data.showto == undefined) {
                    let entity = game.journal.get(data.entityid);
                    entity.sheet.render(true);
                }
            } break;
            case 'notification': {
                if (data.userid == undefined || data.userid == game.user.id) {
                    ui.notifications.notify(data.content, data.type);
                }
            } break;
        }
    }

    static controlEntity(entity) {
        let waitingType = MonksActiveTiles.waitingInput?.waitingfield?.data('type');
        if (waitingType == 'entity' || waitingType == 'either') {
            let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
            if (restrict && !restrict(entity)) {
                ui.notifications.error(i18n("MonksActiveTiles.msg.invalid-entity"));
                return;
            }
            MonksActiveTiles.waitingInput.updateSelection({ id: entity.document.uuid, name: entity.document.name || (entity.document.documentName + ": " + entity.document.id) });
        }
    }

    static setupTile() {
        TileDocument.prototype._normalize = function () {
            if (this.data.flags["monks-active-tiles"] == undefined)
                this.data.flags["monks-active-tiles"] = {};
            if (this.data.flags["monks-active-tiles"].chance == undefined)
                this.data.flags["monks-active-tiles"].chance = 100;
            if (this.data.flags["monks-active-tiles"].restriction == undefined)
                this.data.flags["monks-active-tiles"].restriction = 'all';
            if (this.data.flags["monks-active-tiles"].controlled == undefined)
                this.data.flags["monks-active-tiles"].controlled = 'all';
            if (this.data.flags["monks-active-tiles"].actions == undefined)
                this.data.flags["monks-active-tiles"].actions = [];
        }

        TileDocument.prototype.checkCollision = function (token, destination) {
            // 1. Get all the tile's vertices. X and Y are position at top-left corner
            // of tile.
            let when = this.getFlag('monks-active-tiles', 'trigger');   //+++ need to do something different if movement is called for
            let buffer = (canvas.grid.size / 4) * (when == 'enter' ? 1 : (when == 'exit' ? -1 : 0));
            const tileX1 = this.data.x + buffer;
            const tileY1 = this.data.y + buffer;
            const tileX2 = this.data.x + this.data.width - buffer;
            const tileY2 = this.data.y + this.data.height - buffer;

            const tokenOffsetW = token.object.w / 2;
            const tokenOffsetH = token.object.h / 2;
            const tokenX1 = token.data.x + tokenOffsetW;
            const tokenY1 = token.data.y + tokenOffsetH;
            const tokenX2 = destination.x + tokenOffsetW;
            const tokenY2 = destination.y + tokenOffsetH;

            // 2. Create a new Ray for the token, from its starting position to its
            // destination.

            const tokenRay = new Ray({ x: tokenX1, y: tokenY1 }, { x: tokenX2, y: tokenY2 });
            // 3. Create four intersection checks, one for each line making up the
            // tile rectangle. If any of these pass, that means it has intersected at
            // some point.

            //let i1 = tokenRay.intersectSegment([tileX1, tileY1, tileX2, tileY1]);
            //let i2 = tokenRay.intersectSegment([tileX2, tileY1, tileX2, tileY2]);
            //let i3 = tokenRay.intersectSegment([tileX1, tileY2, tileX2, tileY2]);
            //let i4 = tokenRay.intersectSegment([tileX1, tileY1, tileX1, tileY2]);

            let intersect = [
                tokenRay.intersectSegment([tileX1, tileY1, tileX2, tileY1]),
                tokenRay.intersectSegment([tileX2, tileY1, tileX2, tileY2]),
                tokenRay.intersectSegment([tileX1, tileY2, tileX2, tileY2]),
                tokenRay.intersectSegment([tileX1, tileY1, tileX1, tileY2])
            ].filter(i => i);

            if (when == 'movement' && intersect.length == 0) {
                //check to see if there's moving within the Tile
                if (this.object.hitArea.contains(tokenRay.A.x - this.data.x, tokenRay.A.y - this.data.y) && this.object.hitArea.contains(tokenRay.B.x - this.data.x, tokenRay.B.y - this.data.y)) {
                    intersect = [{ x1: tokenRay.A.x, y1: tokenRay.A.y, x2: tokenRay.B.x, y2: tokenRay.B.y}];
                }
            }

            return intersect;
        }

        TileDocument.prototype.canTrigger = function (token, collision, destination) {
            let triggerData = this.data.flags["monks-active-tiles"];
            if (triggerData) {
                let when = this.getFlag('monks-active-tiles', 'trigger');

                if (when == 'manual' || when == 'click')
                    return;

                //check to see if this trigger is per token, and already triggered
                if (triggerData.pertoken && triggerData.tokens?.includes(token.id))
                    return;

                //check to see if this trigger is restricted by token type
                if ((triggerData.restriction == 'gm' && token.actor.hasPlayerOwner) || (triggerData.restriction == 'player' && !token.actor.hasPlayerOwner))
                    return;

                //check to see if this trigger is restricted by control type
                if ((triggerData.controlled == 'gm' && !game.user.isGM) || (triggerData.controlled == 'player' && game.user.isGM))
                    return;

                //If this trigger has a chance of failure, roll the dice
                if (triggerData.chance != 100) {
                    let chance = (Math.random() * 100);
                    if (chance > triggerData.chance) {
                        log(`trigger failed with ${chance}% out of ${triggerData.chance}%`);
                        return;
                    } else
                        log(`trigger passed with ${chance}% out of ${triggerData.chance}%`);
                }

                //sort by closest
                let sorted = collision.sort((c1, c2) => (c1.t0 > c2.t0) ? 1 : -1);

                //clear out any duplicate corners
                let filtered = sorted.filter((value, index, self) => {
                    return self.findIndex(v => v.t0 === value.t0) === index;
                })

                //is the token currently in the tile
                let tokenPos = { x: token.x + (token.w / 2), y: token.y + (token.h / 2) };
                let inTile = !(tokenPos.x <= this.object.x || tokenPos.x >= this.object.x + this.object.width || tokenPos.y <= this.object.y || tokenPos.y >= this.object.y + this.object.height);

                //go through the list, alternating in/out until we find one that satisfies the on enter/on exit setting, and if it does, return the trigger point.
                let newPos = [];
                if (when == 'movement') {
                    if (filtered.length == 2)
                        newPos.push({ x: filtered[0].x, y: filtered[0].y, x2: filtered[1].x, y2: filtered[1].y });
                    else {
                        if (inTile)
                            newPos.push({ x: filtered[0].x1, y: filtered[0].y1, x2: filtered[0].x2, y2: filtered[0].y2 });
                        else 
                            newPos.push({ x: filtered[0].x, y: filtered[0].y, x2: destination.x + (token.w / 2), y2: destination.y + (token.h / 2) });
                    }
                } else {
                    let checkPos = function (wh) {
                        let idx = ((inTile ? 0 : 1) - (wh == 'enter' || wh == 'both' ? 1 : 0));

                        log(collision, sorted, filtered, inTile, wh, idx);

                        if (idx < 0 || idx >= filtered.length)
                            return;

                        let pos = duplicate(filtered[idx]);
                        pos.x -= (token.w / 2);
                        pos.y -= (token.h / 2);
                        newPos.push(pos);
                    }

                    checkPos(when);
                    if (when == 'both')
                        checkPos('exit');
                }

                return newPos;
            }
        }

        TileDocument.prototype.preloadScene = function () {
            let actions = this.data.flags["monks-active-tiles"]?.actions || [];
            for (let action of actions) {
                if (action.action == 'teleport' && action.data.location.sceneId && action.data.location.sceneId != canvas.scene.id) {
                    log('preloading scene', action.data.location.sceneId);
                    game.scenes.preload(action.data.location.sceneId, true);
                }
            }
        }

        TileDocument.prototype.checkStop = function () {
            let when = this.getFlag('monks-active-tiles', 'trigger');
            if (when == 'movement')
                return false;
            let stoppage = this.data.flags['monks-active-tiles'].actions.filter(a => { return MonksActiveTiles.triggerActions[a.action].stop === true });
            return (stoppage.length == 0 ? false : (stoppage.find(a => a.data?.snap) ? 'snap' : true));
        }

        TileDocument.prototype.trigger = async function (token, userid = game.user.id) {
            if (game.user.isGM) {
                //A token has triggered this tile, what actions do we need to do
                let actions = this.data.flags["monks-active-tiles"]?.actions || [];
                for (let action of actions) {
                    let fn = MonksActiveTiles.triggerActions[action.action]?.fn;
                    if (fn) {
                        if (action.delay > 0) {
                            let tile = this;
                            window.setTimeout(async function () {
                                try {
                                    await fn.call(tile, tile, token, action, userid);
                                } catch (err) {
                                    error(err);
                                }
                            }, action.delay * 1000);
                        } else {
                            let cancall = await Hooks.call("preTriggerTile", this, this, token, action, userid);
                            if (cancall) {
                                try {
                                    let result = await fn.call(this, this, token, action, userid);
                                    if (result instanceof TokenDocument)
                                        token = result;
                                    let cancontinue = await Hooks.call("triggerTile", this, this, token, action, userid);
                                    if (result === false || cancontinue === false) break;
                                } catch (err) {
                                    error(err);
                                }
                            }
                        }
                    }
                }

                if (this.data.flags["monks-active-tiles"]?.pertoken) {
                    let triggerTokens = duplicate(this.data.flags["monks-active-tiles"]?.tokens || []);
                    triggerTokens.push(token.id);
                    await this.setFlag("monks-active-tiles", "tokens", triggerTokens);
                }
            } else {
                //post this to the GM
                MonksActiveTiles.emit('trigger', { tileid: this.uuid, tokenid: token?.uuid } );
            }
        }
    }

    static changeActive(event) {
        event.preventDefault();

        // Toggle the active state
        const isActive = this.object.document.getFlag('monks-active-tiles', 'active');
        const updates = this.layer.controlled.map(o => {
            return { _id: o.id, 'flags.monks-active-tiles.active': !isActive };
        });

        // Update all objects
        event.currentTarget.classList.toggle("active", !isActive);
        return canvas.scene.updateEmbeddedDocuments(this.object.document.documentName, updates);
    }

    static manuallyTrigger(event) {
        event.preventDefault();

        //Trigger this Tile
        this.object.document.trigger();
    }
}

Hooks.on('init', async () => {
    MonksActiveTiles.init();
})

Hooks.on('ready', () => {
    game.socket.on(MonksActiveTiles.SOCKET, MonksActiveTiles.onMessage);
});

/*
Hooks.on('canvasInit', () => {
    let activehud = WithActiveTileHUD(canvas.hud.tile.constructor);
    canvas.hud.tile = new activehud();
});*/

Hooks.on('preUpdateToken', async (document, update, options, userId) => { 
    log('preupdate token', document, update, options, MonksActiveTiles._rejectRemaining);

    /*
    if (MonksActiveTiles._rejectRemaining[document.id] && options.bypass !== true) {
        update.x = MonksActiveTiles._rejectRemaining[document.id].x;
        update.y = MonksActiveTiles._rejectRemaining[document.id].y;
        options.animate = false;
    }*/

    //make sure to bypass if the token is being dropped somewhere, otherwise we could end up triggering a lot of tiles
    if ((update.x != undefined || update.y != undefined) && options.bypass !== true && options.animate !== false) { //(!game.modules.get("drag-ruler")?.active || options.animate)) {
        let token = document.object;

        if (document.caught) {
            delete update.x;
            delete update.y;
            return;
        }

        log('triggering for', token.id);

        //Does this cross a tile
        for (let layer of [canvas.background.tiles, canvas.foreground.tiles]) {
            for (let tile of layer) {
                if (tile.data.flags['monks-active-tiles']?.active && tile.data.flags['monks-active-tiles']?.actions?.length > 0) {
                    if (game.modules.get("levels")?.active && _levels && _levels.isTokenInRange && !_levels.isTokenInRange(token, tile))
                        continue;

                    //check and see if the ray crosses a tile
                    let dest = { x: update.x || document.data.x, y: update.y || document.data.y };
                    let collision = tile.document.checkCollision(document, dest);

                    log('Here1', token.id);
                    if (collision.length > 0) {
                        log('Here2', token.id);
                        let tpts = tile.document.canTrigger(document.object, collision, dest);
                        if (tpts) {
                            log('Here3', token.id);
                            //preload any teleports to other scenes
                            tile.document.preloadScene();

                            let doTrigger = async function (idx) {
                                log('Here4', token.id, idx);
                                if (idx >= tpts.length)
                                    return;

                                let triggerPt = tpts[idx];
                                //let when = tile.document.getFlag('monks-active-tiles', 'trigger');
                                /*
                                if (when == 'movement') {
                                    //trigger on every grid space, this should probably be per square
                                    let dist = Math.sqrt(Math.pow((triggerPt.x1 - triggerPt.x2), 2) + Math.pow((triggerPt.y1 - triggerPt.y2), 2));
                                    
                                    const s = canvas.dimensions.size;
                                    const speed = s * 10;
                                    const duration = (s * 1000) / speed;
    
                                    let total = parseInt(dist / s);
                                    let count = 0;
                                    let timer = window.setInterval(function () {
                                        tile.document.trigger(document.object);
                                        count++;
                                        if (count >= total)
                                            window.clearInterval(timer);
                                    }, duration);
                                } else {*/
                                //if it does and the token needs to stop, then modify the end position in update
                                let ray = new Ray({ x: token.data.x, y: token.data.y }, { x: triggerPt.x, y: triggerPt.y });

                                let stop = tile.document.checkStop();

                                //log('Triggering tile', update, stop);

                                if (stop) {
                                    //check for snapping to the closest grid spot
                                    if (stop == 'snap')
                                        triggerPt = canvas.grid.getSnappedPosition(triggerPt.x, triggerPt.y);

                                    //if this token needs to be stopped, then we need to adjust the path, and force close the movement animation
                                    let oldPos = { x: update.x, y: update.y };
                                    delete update.x;
                                    delete update.y;

                                    //make sure spamming the arrow keys is prevented
                                    document.caught = true;
                                    window.setTimeout(function () { delete document.caught; }, 1500);

                                    //try to disrupt the remaining path if there is one, by setting an update
                                    //MonksActiveTiles._rejectRemaining[document.id] = { x: triggerPt.x, y: triggerPt.y };
                                    //window.setTimeout(function () { delete MonksActiveTiles._rejectRemaining[document.id]; }, 500); //Hopefully half a second is enough to clear any of the remaining animations

                                    if (game.modules.get("drag-ruler")?.active) {
                                        let ruler = canvas.controls.getRulerForUser(game.user.id);
                                        if (ruler) ruler.cancelMovement = true;
                                        options.animate = false;
                                        await document.update({ x: triggerPt.x, y: triggerPt.y }, { bypass: true });
                                    } else {
                                        update.x = triggerPt.x;
                                        update.y = triggerPt.y;
                                        //options.bypass = true;
                                    }
                                }

                                //if there's a scene to teleport to, then preload it.
                                let sceneId = tile.document.data.flags['monks-active-tiles'].actions.find(a => { return a.action.id == 'teleport' })?.sceneId;
                                if (sceneId && sceneId != canvas.scene.id)
                                    game.scenes.preload(sceneId, true);

                                //calculate how much time until the token reaches the trigger point, and wait to call the trigger
                                const s = canvas.dimensions.size;
                                const speed = s * 10;
                                const duration = (ray.distance * 1000) / speed;

                                window.setTimeout(function () {
                                    log('Tile is triggering', document);
                                    tile.document.trigger(document);
                                    if(!stop)   //If this fires on Enter, and a stop is request then we don't need to run the On Exit code.
                                        doTrigger(idx + 1);
                                }, duration);
                                //}

                                return duration;
                            }

                            //Do this so Enter/Exit will both fire.  But we have to wait for the Enter to finish first.
                            doTrigger(0);
                        }
                    }
                }
            }
        }
    }
});

Hooks.on('preCreateChatMessage', async (document, data, options, userId) => {
    if (document.getFlag('monks-active-tiles', 'language')) {
        document.data.update({ "flags.polyglot.language": document.getFlag('monks-active-tiles', 'language') });
    }
});

Hooks.on('renderChatMessage', async (message, html, data) => {
    if (message.getFlag('monks-active-tiles', 'language') && message.data.type == CONST.CHAT_MESSAGE_TYPES.OTHER) {
        await message.update({ type: CONST.CHAT_MESSAGE_TYPES.OOC });
    }
});

Hooks.on('renderTileHUD', (app, html, data) => {
    $('<div>')
        .addClass('control-icon')
        .toggleClass('active', app.object.document.getFlag('monks-active-tiles', 'active'))
        .attr('data-action', 'active')
        .append($('<img>').attr({
            src: 'icons/svg/aura.svg',
            width: '36',
            height: '36',
            title: i18n("MonksActiveTiles.ToggleActive")
        }))
        .click(MonksActiveTiles.changeActive.bind(app))
        .insertAfter($('.control-icon[data-action="locked"]', html));

    $('<div>')
        .addClass('control-icon')
        .attr('data-action', 'trigger')
        .append($('<img>').attr({
            src: 'modules/monks-active-tiles/img/power-button.svg',
            width: '36',
            height: '36',
            title: i18n("MonksActiveTiles.ManualTrigger")
        }))
        .click(MonksActiveTiles.manuallyTrigger.bind(app))
        .insertAfter($('.control-icon[data-action="locked"]', html));
});

Hooks.on('controlToken', (token, control) => {
    if (control)
        MonksActiveTiles.controlEntity(token);
});

Hooks.on('controlWall', (wall, control) => {
    if (control)
        MonksActiveTiles.controlEntity(wall);
});

Hooks.on('controlTile', (tile, control) => {
    if (control)
        MonksActiveTiles.controlEntity(tile);
});

Hooks.on('libRulerReady', () => {
    Ruler.prototype.animateToken = async function (token, ray, dx, dy, segment_num) {
        log(`Animating token for segment_num ${segment_num}`);

        // Adjust the ray based on token size
        const dest = canvas.grid.getTopLeft(ray.B.x, ray.B.y);
        const path = new Ray({ x: token.data.x, y: token.data.y }, { x: dest[0] + dx, y: dest[1] + dy });

        // Commit the movement and update the final resolved destination coordinates
        const priorDest = duplicate(path.B);
        await token.document.update(path.B);
        path.B.x = token.data.x;
        path.B.y = token.data.y;

        // Update the path which may have changed during the update, and animate it
        await token.animateMovement(path);

        return priorDest;
    }
});