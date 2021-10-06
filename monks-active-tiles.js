import { registerSettings } from "./settings.js";
import { WithActiveTileConfig } from "./apps/active-tile-config.js"
import { WithActiveTileHUD } from "./apps/active-tile-hud.js"

let debugEnabled = 2;
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

//+++ Add "selected tokens" as an option

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
            fn: () => { game.togglePause(true, true); }
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
                },
                {
                    id: "panfor",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "panfor",
                    type: "list"
                }
            ],
            values: {
                'panfor': {
                    'all': "MonksActiveTiles.showto.everyone",
                    'players': "MonksActiveTiles.showto.players",
                    'token': "MonksActiveTiles.showto.trigger"

                }
            },
            fn: async (args = {}) => {
                const { action, userid } = args;
                let panfor = action.data.panfor || 'trigger';

                if ((panfor == 'token' && game.userid != userid) || panfor != 'token')
                    MonksActiveTiles.emit('pan', { userid: (panfor == 'token' ? userid : null), animate: action.data.animate, x: action.data.location.x, y: action.data.location.y });

                if (panfor == 'all') {
                    if (action.data.animate)
                        canvas.animatePan({ x: action.data.location.x, y: action.data.location.y });
                    else
                        canvas.pan({ x: action.data.location.x, y: action.data.location.y });
                }
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
                    name: "MonksActiveTiles.ctrl.animatepan",
                    type: "checkbox"
                },
                {
                    id: "deletesource",
                    name: "MonksActiveTiles.ctrl.deletesource",
                    type: "checkbox"
                },
                {
                    id: "avoidtokens",
                    name: "MonksActiveTiles.ctrl.avoidtokens",
                    type: "checkbox"
                }
            ],
            fn: async (args = {}) => {
                const { tokens, action, userid } = args;
                if (!tokens || tokens.length == 0) {
                    ui.notifications.info(i18n('MonksActiveTiles.msg.noteleporttoken'));
                    return;
                }

                let result = { result: true, _replacetoken: [] };

                for (let tokendoc of tokens) {
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
                        if (action.data.deletesource)
                            tokendoc.delete();
                        else
                            tokendoc.update({ hidden: true });   //hide the old one
                        newtoken.update({ hidden: oldhidden, img: token.data.img });   //preserve the image, and hiddenness of the old token
                        //tokendoc = newtoken;
                        //let scale = canvas.scene._viewPosition.scale;

                        if (userid != game.user.id) {
                            //pass this back to the player
                            MonksActiveTiles.emit('switchview', { userid: userid, sceneid: scene.id, newpos: newPos, oldpos: oldPos });
                        }
                        ui.notifications.warn(`${token.name} has teleported to ${scene.name}`);

                        result._replacetoken.push(newtoken);
                    }
                }

                return result;
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
                    options: { showToken: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Tile || entity instanceof Drawing); }
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
            fn: async (args = {}) => {
                const { action } = args;
                //wait for animate movement
                let entities = await MonksActiveTiles.getEntities(args);
                    
                if (entities && entities.length > 0) {
                    if (action.data.location.id) {
                        //this is directing to a Tile
                        let destTile = await fromUuid(action.data.location.id);
                        action.data.location.x = destTile.data.x + (destTile.data.width / 2);
                        action.data.location.y = destTile.data.y + (destTile.data.height / 2);
                    }
                    //set or toggle visible
                    for (let entity of entities) {
                        let object = entity.object;
                        if (object instanceof Token)
                            await object.stopAnimation();
                        else
                            await CanvasAnimation.terminateAnimation(`${entity.documentName}.${entity.id}.animateMovement`);

                        let newPos = {
                            x: action.data.location.x - ((object.w || object.width) / 2),
                            y: action.data.location.y - ((object.h || object.height) / 2)
                        };

                        if (!canvas.grid.hitArea.contains(newPos.x, newPos.y)) {
                            //+++find the closest spot on the edge of the scene
                            ui.notifications.error("MonksActiveTiles.msg.prevent-teleport");
                            return;
                        }
                        if (action.data.snap)
                            newPos = canvas.grid.getSnappedPosition(newPos.x, newPos.y);

                        if (object instanceof Token) {
                            if (action.data.wait) {
                                await object.setPosition(newPos.x, newPos.y);
                                await entity.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: false });
                            } else
                                entity.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: true });
                        } else {
                            let animate = async () => {
                                let ray = new Ray({ x: entity.data.x, y: entity.data.y }, { x: newPos.x, y: newPos.y });

                                // Move distance is 10 spaces per second
                                const s = canvas.dimensions.size;
                                entity._movement = ray;
                                const speed = s * 10;
                                const duration = (ray.distance * 1000) / speed;

                                // Define attributes
                                const attributes = [
                                    { parent: object, attribute: 'x', to: newPos.x },
                                    { parent: object, attribute: 'y', to: newPos.y }
                                ];

                                // Dispatch the animation function
                                let animationName = `${entity.documentName}.${entity.id}.animateMovement`;
                                await CanvasAnimation.animateLinear(attributes, {
                                    name: animationName,
                                    context: object,
                                    duration: duration
                                });

                                entity._movement = null;
                            };

                            if (action.data.wait)
                                await animate().then(() => { entity.update({ x: newPos.x, y: newPos.y }); });
                            else
                                animate().then(() => { entity.update({ x: newPos.x, y: newPos.y }); });
                        }
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
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Tile || entity instanceof Drawing); }
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
            fn: async (args = {}) => {
                const { action } = args;
                //find the item in question
                let entities = await MonksActiveTiles.getEntities(args);

                if (entities && entities.length > 0) {
                    //set or toggle visible
                    for (let entity of entities) {
                        await entity.update({ hidden: (action.data.hidden == 'toggle' ? !entity.data.hidden : action.data.hidden !== 'show') });
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
                    options: { showPrevious: true },
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
            fn: async (args = {}) => {
                const { tile, action } = args;
                //find the item in question
                let entities = await MonksActiveTiles.getEntities(args);

                if (entities && entities.length > 0) {
                    if (action.data.location.id) {
                        //this is directing to a Tile
                        let destTile = await fromUuid(action.data.location.id);
                        action.data.location.x = destTile.data.x + (destTile.data.width / 2);
                        action.data.location.y = destTile.data.y + (destTile.data.height / 2);
                    }

                    let result = { result: true, tokens: [] };
                    for (let actor of entities) {
                        if (actor instanceof Actor) {
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
                                tkn.update({ hidden: true });

                            result.tokens.push(tkn);
                        }
                    }
                    return result;
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
                    options: { showTile: true },
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
                    'toggle': "MonksActiveTiles.activate.toggle",
                    'previous': "MonksActiveTiles.activate.previous"

                }
            },
            fn: async (args = {}) => {
                const { action, value } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                for (let entity of entities) {
                    if (entity instanceof AmbientLightDocument || entity instanceof AmbientSoundDocument)
                        await entity.update({ hidden: (action.data.activate == 'toggle' ? !entity.data.hidden : (action.data.activate == 'previous' ? !value.activate : action.data.activate != 'activate')) });
                    else if(entity instanceof TileDocument)
                        await entity.setFlag('monks-active-tiles', 'active', (action.data.activate == 'toggle' ? !entity.getFlag('monks-active-tiles', 'active') : (action.data.activate == 'previous' ? !value.activate : action.data.activate == 'activate')));
                }
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
                    subtype: "entity",
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true }
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
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args);

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
                            warn("Couldn't find attribute", entity, attr);
                            continue;
                        }

                        if (typeof prop == 'object') {
                            if (prop.value == undefined) {
                                debug("Attribute reurned an object and the object doesn't have a value property", entity, attr, prop);
                                continue;
                            }

                            attr = attr + '.value';
                            prop = prop.value;
                        }


                        let update = {};
                        let val = action.data.value;

                        if (val == 'true') val = true;
                        else if (val == 'false') val = false;
                        else {
                            let context = { actor: tokens[0]?.actor?.data, token: tokens[0]?.data, tile: tile.data, entity: entity, user: game.users.get(userid), value:value };

                            if (val.includes("{{")) {
                                const compiled = Handlebars.compile(val);
                                val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                            }

                            const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                            val = await MonksActiveTiles.inlineRoll(val, rgx, action.data.chatMessage, action.data.rollmode, entity);

                            if (val.startsWith('+ ') || val.startsWith('- ')) {
                                val = eval(prop + val);
                            }

                            if (!isNaN(val) && !isNaN(parseFloat(val)))
                                val = parseFloat(val);
                        }
                        update[attr] = val;
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
        'hurtheal': {
            name: "MonksActiveTiles.action.hurtheal",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true }
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
            fn: async (args = {}) => {
                const { tile, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args);

                let applyDamage = async function(actor, amount = 0) {
                    let updates = {};
                    amount = Math.floor(parseInt(amount));
                    let resourcename = game.system.data.primaryTokenAttribute || 'attributes.hp';
                    let resource = getProperty(actor.data, "data." + resourcename);
                    if (resource instanceof Object) {
                        // Deduct damage from temp HP first
                        let dt = 0;
                        let tmpMax = 0;
                        if (resource.temp != undefined) {
                            const tmp = parseInt(resource.temp) || 0;
                            dt = amount > 0 ? Math.min(tmp, amount) : 0;
                            // Remaining goes to health

                            tmpMax = parseInt(resource.tempmax) || 0;

                            updates["data." + resourcename + ".temp"] = tmp - dt;
                        }

                        // Update the Actor
                        const dh = Math.clamped(resource.value - (amount - dt), (game.system.id == 'D35E' || game.system.id == 'pf1' ? -2000 : 0), resource.max + tmpMax);
                        updates["data." + resourcename + ".value"] = dh;
                    } else {
                        let value = Math.floor(parseInt(resource));
                        updates["data." + resourcename] = (value - amount);
                    }

                    return await actor.update(updates);
                }

                if (entities && entities.length > 0) {
                    for (let entity of entities) {
                        const a = entity.actor;

                        let val = action.data.value;
                        let context = { actor: a.data, token: entity.data, tile: tile.data, entity: entity, user: game.users.get(userid), value: value };

                        if (val.includes("{{")) {
                            const compiled = Handlebars.compile(val);
                            val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                        }

                        const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                        val = await MonksActiveTiles.inlineRoll(val, rgx, action.data.chatMessage, action.data.rollmode, entity);

                        try {
                            val = parseFloat(eval(val));
                        } catch{ }

                        val = val * -1;

                        if (val != 0) {
                            if (a.applyDamage) {
                                await a.applyDamage(val);
                            } else {
                                applyDamage(a, val);
                            }
                        }
                    }
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' ' + action.data?.entity.name + ', ' + (action.data?.value.startsWith('-') ? 'hurt by ' + action.data?.value : 'heal by ' + action.data?.value);
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
                },
                {
                    id: "volume",
                    name: "MonksActiveTiles.ctrl.volume",
                    type: "text",
                    default: "1.0"
                },
                {
                    id: "loop",
                    name: "MonksActiveTiles.ctrl.loop",
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
            fn: async (args = {}) => {
                const { tile, action, userid } = args;
                //play the sound
                let getTileSounds = async function(tile) {
                    const audiofile = action.data.audiofile;

                    if (!audiofile.includes('*')) return [audiofile];
                    if (tile._sounds) return tile._sounds;
                    let source = "data";
                    let pattern = audiofile;
                    const browseOptions = { wildcard: true };

                    // Support S3 matching
                    if (/\.s3\./.test(pattern)) {
                        source = "s3";
                        const { bucket, keyPrefix } = FilePicker.parseS3URL(pattern);
                        if (bucket) {
                            browseOptions.bucket = bucket;
                            pattern = keyPrefix;
                        }
                    }

                    // Retrieve wildcard content
                    try {
                        const content = await FilePicker.browse(source, pattern, browseOptions);
                        tile._sounds = content.files;
                    } catch (err) {
                        tile._sounds = [];
                        ui.notifications.error(err);
                    }
                    return tile._sounds;
                }

                //game.settings.get("core", "globalAmbientVolume");
                let volume = 1;
                if (action.data.volume) {
                    if (action.data.volume.indexOf('%') > 0)
                        volume = game.settings.get("core", "globalAmbientVolume") * (parseFloat(action.data.volume.replace('%', '')) / 100);
                    else
                        volume = parseFloat(action.data.volume);
                }

                let audiofiles = await getTileSounds(tile);
                const audiofile = audiofiles[Math.floor(Math.random() * audiofiles.length)];

                if (action.data.audiofor != 'gm') {
                    MonksActiveTiles.emit('playsound', {
                        tileid: tile.uuid,
                        src: audiofile,
                        loop: action.data.loop,
                        userid: (action.data.audiofor == 'token' ? userid : null),
                        sceneid: (action.data.audiofor == 'token' ? null : tile.parent.id),
                        volume: volume
                    });
                }
                if (action.data.audiofor != 'token' || userid == game.user.id) {
                    if (tile.soundeffect != undefined) {
                        tile.soundeffect.stop();
                        MonksActiveTiles.emit('stopsound', {
                            tileid: tile.uuid
                        });
                    }
                    log('Playing', audiofile);
                    AudioHelper.play({ src: audiofile, volume: volume, loop: action.data.loop }, false).then((sound) => {
                        tile.soundeffect = sound;
                        tile.soundeffect.on("end", () => {
                            log('Finished playing', audiofile);
                            delete tile.soundeffect;
                        });
                    });
                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' for ' + i18n(trigger.values.audiofor[action.data.audiofor]);
            }
        },
        'stopsound': {
            name: "MonksActiveTiles.action.stopsound",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "audiotype",
                    name: "MonksActiveTiles.ctrl.audiotype",
                    list: "audiotype",
                    type: "list"
                },
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true },
                    restrict: (entity) => { return entity instanceof Tile; }
                },
                {
                    id: "audiofor",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "audiofor",
                    type: "list"
                }                
            ],
            values: {
                'audiofor': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm",
                    'token': "MonksActiveTiles.for.token"
                },
                'audiotype': {
                    'all': "MonksActiveTiles.audiotype.all",
                    'tile': "MonksActiveTiles.audiotype.tile"
                }
            },
            fn: async (args = {}) => {
                const { tile, action, userid } = args;
                //play the sound
                if (action.data.audiotype == 'all') {
                    game.playlists.forEach(async (p) => {
                        p.sounds.forEach(async (s) => {
                            if (s.playing)
                                await s.update({ playing: false, pausedTime: s.sound.currentTime });
                        });
                    });

                    MonksActiveTiles.emit('stopsound', {
                        type: action.data.audiotype
                    });
                } else {
                    let entities = await MonksActiveTiles.getEntities(args);
                    let entity = entities[0];
                    if (action.data.audiofor != 'gm') {
                        MonksActiveTiles.emit('stopsound', {
                            tileid: entity.uuid,
                            type: action.data.audiotype
                        });
                    }
                    if (action.data.audiofor != 'token' || userid == game.user.id) {
                        if (entity.soundeffect != undefined) {
                            entity.soundeffect.stop();
                        }
                    }
                }
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
            fn: async (args = {}) => {
                const { action } = args;
                //Find the door in question, set the state to whatever value
                if (action.data.entity.id) {
                    let wall = await fromUuid(action.data.entity.id);
                    if (wall && wall.data.door != 0) {
                        let state = (action.data.state == 'open' ? CONST.WALL_DOOR_STATES.OPEN : (action.data.state == 'lock' ? CONST.WALL_DOOR_STATES.LOCKED : CONST.WALL_DOOR_STATES.CLOSED));
                        if (action.data.state == 'toggle' && wall.data.ds != CONST.WALL_DOOR_STATES.LOCKED)
                            state = (wall.data.ds == CONST.WALL_DOOR_STATES.OPEN ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.OPEN);
                        await wall.update({ ds: state });
                    }
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
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                //Display a notification with the message
                let context = { actor: tokens[0]?.actor.data, token: tokens[0]?.data, tile: tile.data, user: game.users.get(userid), value:value };
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
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.speaker",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "incharacter",
                    name: "MonksActiveTiles.ctrl.incharacter",
                    type: "checkbox"
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
                        let syslang = CONFIG[game.system.id.toUpperCase()]?.languages || {};
                        let languages = mergeObject({ '': '' }, duplicate(syslang));
                        return languages;
                    },
                    conditional: () => { return (game.modules.get("polyglot")?.active && CONFIG[game.system.id.toUpperCase()]?.languages); },
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
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;

                let entities = await MonksActiveTiles.getEntities(args);
                let entity = (entities.length > 0 ? entities[0] : null);

                //Add a chat message
                let user = game.users.find(u => u.id == userid);
                let scene = game.scenes.find(s => s.id == user?.viewedScene);

                let tkn = (entity?.object || tokens[0]?.object);

                const speaker = { scene: scene?.id, actor: tkn?.actor.id || user?.character?.id, token: tkn?.id, alias: (action.data.incharacter ? tkn?.name : null) || user?.name };

                let context = { actor: tokens[0]?.actor.data, token: tokens[0]?.data, speaker: tokens[0], tile: tile.data, entity: entity, user: game.users.get(userid), value: value };
                let content = action.data.text;

                if (content.includes("{{")) {
                    const compiled = Handlebars.compile(content);
                    content = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                }

                let messageData = {
                    user: userid,
                    speaker: speaker,
                    type: (action.data.incharacter ? CONST.CHAT_MESSAGE_TYPES.IC : CONST.CHAT_MESSAGE_TYPES.OOC),
                    content: content
                };

                if (action.data.flavor)
                    messageData.flavor = action.data.flavor;

                if (action.data.for == 'gm')
                    messageData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
                else if (action.data.for == 'token') {
                    let tokenOwners = (tkn ? Object.entries(tkn?.actor.data.permission).filter(([k, v]) => { return v == CONST.ENTITY_PERMISSIONS.OWNER }).map(a => { return a[0]; }) : []);
                    messageData.whisper = Array.from(new Set(ChatMessage.getWhisperRecipients("GM").map(u => u.id).concat(tokenOwners)));
                }

                if (action.data.language != '')
                    mergeObject(messageData, { flags: { 'monks-active-tiles': { language: action.data.language } }, lang: action.data.language });

                ChatMessage.create(messageData, { chatBubble: action.data.incharacter });
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' for ' + i18n(trigger.values.for[action.data?.for]);
            }
        },
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
            fn: async (args = {}) => {
                const { action } = args;
                //Find the macro to be run, call it with the data from the trigger
                let macro = game.macros.get(action.data.macroid);
                if (macro instanceof Macro) {
                    return await MonksActiveTiles._executeMacro(macro, args);
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
            fn: async (args = {}) => {
                const { tokens, action, userid } = args;
                //Find the roll table
                let rolltable = game.tables.get(action.data?.rolltableid);
                if (rolltable instanceof RollTable) {
                    //Make a roll
                    let result = await rolltable.draw({ rollMode: action.data.rollmode, displayChat:false});
                    //Check to see what the privacy rules are

                    let user = game.users.find(u => u.id == userid);
                    let scene = game.scenes.find(s => s.id == user.viewedScene);
                    const speaker = { scene: scene?.id, actor: user?.character?.id, token: tokens[0]?.id, alias: user.name };
                    // Override the toMessage so that I can change the speaker

                    // Construct chat data
                    const nr = result.results.length > 1 ? `${result.results.length} results` : "a result";
                    let messageData = {
                        flavor: `Draws ${nr} from the ${rolltable.name} table.`,
                        user: userid,
                        speaker: speaker,
                        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                        roll: result.roll,
                        sound: result.roll ? CONFIG.sounds.dice : null,
                        flags: { "core.RollTable": rolltable.id }
                    };

                    // Render the chat card which combines the dice roll with the drawn results
                    messageData.content = await renderTemplate(CONFIG.RollTable.resultTemplate, {
                        description: TextEditor.enrichHTML(rolltable.data.description, { entities: true }),
                        results: result.results.map(r => {
                            r.text = r.getChatText();
                            return r;
                        }),
                        rollHTML: rolltable.data.displayRoll ? await result.roll.render() : null,
                        table: rolltable
                    });

                    // Create the chat message
                    ChatMessage.create(messageData, { rollMode: action.data.rollmode });

                    return { result: true, results: result.results, roll: result.roll };
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
            fn: async () => {
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
                    options: { showToken: true, showWithin: true, showPlayers: true },
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
            fn: async (args = {}) => {
                const { action } = args;
                let entities = await MonksActiveTiles.getEntities(args);
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
                    options: { showTile: true },
                    restrict: (entity) => { return (entity instanceof Tile); }
                },
                {
                    id: "play",
                    name: "MonksActiveTiles.ctrl.animation",
                    list: "animate",
                    type: "list"
                },
                {
                    id: "animatefor",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "animatefor",
                    type: "list"
                }
            ],
            values: {
                'animatefor': {
                    'all': "MonksActiveTiles.showto.everyone",
                    'token': "MonksActiveTiles.showto.trigger"

                },
                'animate': {
                    'start': "MonksActiveTiles.animate.start",
                    'pause': "MonksActiveTiles.animate.pause",
                    'stop': "MonksActiveTiles.animate.stop"

                }
            },
            fn: async (args = {}) => {
                const { action, userid } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let entity = entities[0];

                if (entity.object.isVideo) {
                    if (action.data.animatefor === 'token') {
                        if(userid == game.user.id)
                            entity.object.play(action.data?.play == 'start', { offset: (action.data?.play == 'stop' ? 0 : null) });
                        else
                            MonksActiveTiles.emit((action.data?.play == 'start' ? 'playvideo' : 'stopvideo'), { tileid: entity.uuid });
                    }
                    else {
                        entity.update({ "video.autoplay": false }, { diff: false, playVideo: action.data?.play == 'start' });
                        if (action.data?.play == 'stop') {
                            MonksActiveTiles.emit('stopvideo', { tileid: entity.uuid });
                            const el = entity.object.sourceElement;
                            if (el?.tagName !== "VIDEO") return;

                            game.video.stop(el);
                        }
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
                    restrict: (entity) => { return (entity instanceof JournalEntry || entity instanceof Actor); }
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
                    'gm': "MonksActiveTiles.showto.gm",
                    'players': "MonksActiveTiles.showto.players",
                    'trigger': "MonksActiveTiles.showto.trigger"

                }
            },
            fn: async (args = {}) => {
                const { action, userid } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let entity = entities[0];

                //open journal
                if (entity && action.data.showto != 'gm')
                    MonksActiveTiles.emit('journal', { showto: action.data.showto, userid: userid, entityid: entity.uuid });
                if (game.user.isGM && (action.data.showto == 'everyone' || action.data.showto == 'gm' || action.data.showto == undefined || (action.data.showto == 'trigger' && userid == game.user.id)))
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
                    options: { showToken: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "item",
                    name: "MonksActiveTiles.ctrl.select-item",
                    type: "select",
                    subtype: "entity",
                    options: { showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Item); }
                }
            ],
            fn: async (args = {}) => {
                const { action } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let items = await MonksActiveTiles.getEntities(args, action.data.item.id);
                if (items?.length) {
                    for (let item of items) {
                        if (item instanceof Item) {
                            for (let token of entities) {
                                const itemData = item.toObject();

                                const actor = token.actor;
                                if (!actor) return;

                                // Create the owned item
                                actor.createEmbeddedDocuments("Item", [itemData]);
                            }
                        }
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
            fn: async (args = {}) => {
                const { action, userid } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let level = (action.data.permission == 'limited' ? CONST.ENTITY_PERMISSIONS.LIMITED :
                    (action.data.permission == 'observer' ? CONST.ENTITY_PERMISSIONS.OBSERVER :
                        (action.data.permission == 'owner' ? CONST.ENTITY_PERMISSIONS.OWNER : CONST.ENTITY_PERMISSIONS.NONE)));

                entities = entities.map(e => (e.actor ? e.actor : e));

                //MonksActiveTiles.preventCycle = true;   //prevent the cycling of tokens due to permission changes
                game.settings.set('monks-active-tiles', 'prevent-cycle', true);
                for (let entity of entities) {
                    const perms = entity.data.permission || entity?.actor?.data.permission;
                    if (action.data.changefor == 'trigger') {
                        let user = game.users.get(userid);
                        if (!user.isGM) {
                            if (action.data.permission == 'default')
                                delete perms[user.id];
                            else
                                perms[user.id] = level;
                        }
                    } else {
                        if (action.data.permission == 'default') {
                            for (let user of game.users.contents) {
                                if (user.isGM) continue;
                                delete perms[user.id];
                            }
                        }else
                            perms.default = level;
                    }

                    //await entity.setFlag('monks-active-tiles', 'prevent-cycle', true); 
                    await entity.update({ permission: perms, 'flags.monks-active-tiles.prevent-cycle': true }, { diff: false, render: true, recursive: false, noHook: true });
                    //await entity.unsetFlag('monks-active-tiles', 'prevent-cycle');
                }
                game.settings.set('monks-active-tiles', 'prevent-cycle', false);
                //MonksActiveTiles.preventCycle = false;
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
                    options: { showToken: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Token ); }
                },
                {
                    id: "actor",
                    name: "MonksActiveTiles.ctrl.select-actor",
                    type: "select",
                    subtype: "entity",
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

                        let result = [];
                        let types = ['weapon', 'spell', 'melee', 'ranged', 'action', 'attack'];

                        for (let item of actor.items) {
                            if (types.includes(item.type)) {
                                let group = result.find(g => g.type == item.type);
                                if (group == undefined) {
                                    group = { type: item.type, text: i18n("MonksActiveTiles.attack." + item.type), groups: {} };
                                    result.push(group);
                                }
                                group.groups[item.id] = item.name;
                            }
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
                },
                {
                    id: "rollattack",
                    name: "MonksActiveTiles.ctrl.rollattack",
                    type: "checkbox"
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
            fn: async (args = {}) => {
                const { action } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                for (let entity of entities) {
                    if (entity)
                        entity?.object?.setTarget(true, { releaseOthers: false });
                }

                //get the actor and the attack and the entities to apply this to.
                if (action.data?.actor.id) {
                    let actor = await fromUuid(action.data?.actor.id);
                    let item = actor.items.get(action.data?.attack?.id);

                    if (item) {
                        if (action.data?.rollattack && item.roll)
                            item.roll({ rollMode: (action.data?.rollmode || 'roll') });
                        else if (item.displayCard)
                            item.displayCard({ rollMode: (action.data?.rollmode || 'roll'), createMessage: true }); //item.roll({configureDialog:false});
                        else if (item.toChat)
                            item.toChat(); //item.roll({configureDialog:false});
                    }
                }
            },
            content: (trigger, action) => {
                if (!action.data?.actor.id)
                    return i18n(trigger.name);
                //let actor = fromUuid(action.data?.actor.id);
                //let item = actor.items.get(action.data.attack);
                return i18n(trigger.name) + ' using ' + action.data?.actor.name + ', ' + action.data?.attack?.name;
            }
        },
        'trigger': {
            name: "MonksActiveTiles.action.trigger",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return (entity instanceof Tile); }
                }
            ],
            fn: async (args = {}) => {
                const { tile, userid } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let entity = entities[0];
                //make sure we're not in a loop
                if (MonksActiveTiles.triggered == undefined)
                    MonksActiveTiles.triggered = [];

                //Add this trigger if it's the original one
                MonksActiveTiles.triggered.push(tile.id);

                //make sure the trigger to be called isn't on the list
                if (!MonksActiveTiles.triggered.includes(entity.id)) {
                    await entity.trigger.call(entity, args);
                } else {
                    log('Preventing a trigger loop');
                }

                //remove this trigger as it's done
                MonksActiveTiles.triggered.pop();
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ', ' + action.data?.entity.name;
            }
        },
        'scene': {
            name: "MonksActiveTiles.action.scene",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "sceneid",
                    name: "MonksActiveTiles.ctrl.scene",
                    list: () => {
                        let result = {};
                        for (let s of game.scenes)
                            result[s.id] = s.name;
                        return result;
                    },
                    type: "list"
                }
            ],
            fn: async (args = {}) => {
                const { action, userid } = args;
                let scene = game.scenes.find(s => s.id == action.data.sceneid);
                if (game.user.id == userid)
                    await scene.view();
                else
                    MonksActiveTiles.emit('switchview', { userid: userid, sceneid: scene.id });
            },
            content: (trigger, action) => {
                let scene = game.scenes.find(s => s.id == action.data.sceneid);
                return i18n(trigger.name) + ' to ' + scene?.name;
            }
        },
        'addtocombat': {
            name: "MonksActiveTiles.action.addtocombat",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                }
            ],
            fn: async (args = {}) => {
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let combat = game.combats.viewed;
                if (!combat) {
                    const cls = getDocumentClass("Combat")
                    combat = await cls.create({ scene: canvas.scene.id, active: true });
                }

                let tokens = entities.filter(t => !t.inCombat).map(t => { return { tokenId: t.id, actorId: t.data.actorId, hidden: t.data.hidden } });
                await combat.createEmbeddedDocuments("Combatant", tokens);
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' to ' + action.data?.entity.name;
            }
        },
        'elevation': {
            name: "MonksActiveTiles.action.elevation",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "value",
                    name: "MonksActiveTiles.ctrl.value",
                    type: "text"
                }
            ],
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args);

                if (entities && entities.length > 0) {
                    for (let entity of entities) {
                        if (!(entity instanceof TokenDocument))
                            continue;

                        let prop = getProperty(entity.data, 'elevation');

                        if (prop == undefined) {
                            warn("Couldn't find attribute", entity);
                            continue;
                        }

                        let update = {};
                        let val = action.data.value;

                        let context = { actor: tokens[0]?.actor?.data, token: tokens[0]?.data, tile: tile.data, entity: entity, user: game.users.get(userid), value: value };
                        if (val.includes("{{")) {
                            const compiled = Handlebars.compile(val);
                            val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                        }

                         /*
                        const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                        val = await MonksActiveTiles.inlineRoll(val, rgx, action.data.chatMessage, action.data.rollmode, entity);
                        */

                        if (val.startsWith('+ ') || val.startsWith('- ')) {
                            val = eval(prop + val);
                        }

                        if (!isNaN(val) && !isNaN(parseFloat(val)))
                            val = parseFloat(val);

                        update.elevation = val;
                        await entity.update(update);
                    }
                }
            },
            content: (trigger, action) => {
                return (action.data?.value.startsWith('+ ') ? 'Increase elevation of ' + action.data?.entity.name + ' by ' + action.data?.value.substring(2) :
                    (action.data?.value.startsWith('- ') ? 'Decrease elevation of ' + action.data?.entity.name + ' by ' + action.data?.value.substring(2) :
                        'Set elevation of ' + action.data?.entity.name + ' to ' + action.data?.value));
            }
        },
        'resethistory': {
            name: "MonksActiveTiles.action.resethistory",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true },
                    restrict: (entity) => { return (entity instanceof Tile); }
                }
            ],
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args);

                if (entities && entities.length > 0) {
                    for (let entity of entities) {
                        if(entity instanceof TileDocument)
                            await entity.resetHistory();
                    }
                }
            },
            content: (trigger, action) => {
                return 'Reset Tile trigger history for ' + action.data?.entity.name;
            }
        }
    }

    static async getEntities(args, id) {
        const { tile, tokens, action, value, userid } = args;
        id = id || action.data.entity.id;

        let entity = [];
        if (id == 'tile')
            entity = [tile];
        else if (id == 'token') {
            entity = tokens;
            for (let i = 0; i < entity.length; i++) {
                if (typeof entity[i] == 'string')
                    entity[i] = await fromUuid(entity[i]);
            }
        }
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
        else if (id == 'controlled') {
            entity = canvas.tokens.controlled.map(t => t.document);
        }
        else if (id == 'previous') {
            if (value.results && value.results.length) {
                //roll table result
                entity = [];
                for (let tableresult of value.results) {
                    let collection = game.collections.get(tableresult.data.collection);
                    let item = collection.get(tableresult.data.resultId);
                    entity.push(item);
                }

                entity = entity.filter(e => e);
            }
        }
        else if (id) {
            entity = await fromUuid(id);
            entity = [entity];
        }

        return entity;
    }

    static async _executeMacro(macro, mainargs = {}) {
        const { tile, tokens, action, userid, values, value } = mainargs;

        for (let i = 0; i < tokens.length; i++) {
            tokens[i] = (typeof tokens[i] == 'string' ? await fromUuid(tokens[i]) : tokens[i]);
        }

        let tkn = tokens[0];

        let context = {
            actor: tkn?.actor,
            token: tkn?.object,
            tile: tile.object,
            user: game.users.get(userid),
            canvas: canvas,
            scene: canvas.scene,
            values: values,
            value: value,
            tokens: tokens
        };
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
            if (getProperty(macro, "data.flags.advanced-macros.runAsGM") || getProperty(macro, "data.flags.furnace.runAsGM") || userid == game.user.id) {
                //execute the macro if it's set to run as GM or it was the GM that actually moved the token.
                //return await macro.execute.apply(macro, [context]);

                return await macro.callScriptFunction(context);
            } else {
                //this one needs to be run as the player, so send it back
                MonksActiveTiles.emit('runmacro', {
                    userid: userid,
                    macroid: macro.uuid,
                    tileid: tile?.uuid,
                    tokenid: tkn?.uuid,
                    values: values,
                    value: value,
                    args: args,
                    tokens: context.tokens.map(t => t.uuid)
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

        if (game.modules.get("lib-wrapper")?.active)
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-enhanced-journal", "JournalDirectory.prototype._onClickEntityName");

        MonksActiveTiles.SOCKET = "module.monks-active-tiles";

        //MonksActiveTiles._oldObjectClass = CONFIG.Tile.objectClass;
        //CONFIG.Tile.objectClass = WithActiveTile(CONFIG.Tile.objectClass);

        MonksActiveTiles._oldSheetClass = CONFIG.Tile.sheetClass;
        CONFIG.Tile.sheetClass = WithActiveTileConfig(CONFIG.Tile.sheetClass);

        MonksActiveTiles.setupTile();

        let oldCycleTokens = TokenLayer.prototype.cycleTokens;
        TokenLayer.prototype.cycleTokens = function (...args) {
            //if (MonksActiveTiles.preventCycle) {
            if(setting('prevent-cycle'))
                return null;
            else
                return oldCycleTokens.call(this, ...args);
        }

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

            if (canvas.activeLayer?.name == 'TokenLayer') {
                //check to see if there are any Tiles that can be activated with a click
                for (let tile of canvas.scene.tiles) {
                    let triggerData = tile.data.flags["monks-active-tiles"];
                    if (triggerData && triggerData.active && triggerData.trigger == 'click') {

                        //check to see if this trigger is restricted by control type
                        if ((triggerData.controlled == 'gm' && !game.user.isGM) || (triggerData.controlled == 'player' && game.user.isGM))
                            continue;

                        let tokens = canvas.tokens.controlled.map(t => t.document);
                        //check to see if this trigger is per token, and already triggered
                        if (triggerData.pertoken) {
                            tokens = tokens.filter(t => !tile.hasTriggered(t.id)); //.uuid
                            if (tokens.length == 0)
                                continue;
                        }

                        //check to see if the clicked point is within the Tile
                        let pt = event.data.origin;
                        if (!(pt.x < tile.data.x || pt.y < tile.data.y || pt.x > tile.data.x + tile.data.width || pt.y > tile.data.y + tile.data.height)) {
                            tile.trigger({ token: tokens, method: 'Click' });
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

        let oldNoteClickLeft = Note.prototype._onClickLeft;
        Note.prototype._onClickLeft = function (event) {
            MonksActiveTiles.controlEntity(this);
            return oldNoteClickLeft.call(this, event);
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
                    let tokens = data.tokens;
                    for (let i = 0; i < tokens.length; i++)
                        tokens[i] = await fromUuid(tokens[i]);
                    let tile = await fromUuid(data.tileid);

                    tile.trigger({ token: tokens, userid: data.senderId, method: data.method });
                }
            } break;
            case 'switchview': {
                if (game.user.id == data.userid) {
                    //let oldSize = canvas.scene.data.size;
                    //let oldPos = canvas.scene._viewPosition;
                    let offset = { dx: (canvas.scene._viewPosition.x - data.oldpos?.x), dy: (canvas.scene._viewPosition.y - data.oldpos?.y) };
                    let scene = game.scenes.get(data.sceneid);
                    await scene.view();
                    //let scale = oldSize / canvas.scene.data.size;
                    if (data.oldpos && data.newpos) {
                        let changeTo = { x: data.newpos.x + offset.dx, y: data.newpos.y + offset.dy };
                        //log('change pos', oldPos, data.oldpos, data.newpos, offset, canvas.scene._viewPosition, changeTo);
                        canvas.pan(changeTo);
                        //log('changed', canvas.scene._viewPosition);
                    }
                }
            } break;
            case 'runmacro': {
                if (game.user.id == data.userid) {
                    let macro = (data?.macroid ? await fromUuid(data.macroid) : null);
                    let tile = (data?.tileid ? await fromUuid(data.tileid) : null);
                    let token = (data?.tokenid ? await fromUuid(data.tokenid) : null);
                    let tokens = data.tokens;
                    for (let i = 0; i < tokens.length; i++) {
                        tokens[i] = await fromUuid(tokens[i])
                    }

                    let context = {
                        actor: token?.actor,
                        token: token?.object,
                        tile: tile.object,
                        user: game.users.get(data.userid),
                        args: data.args,
                        canvas: canvas,
                        scene: canvas.scene,
                        values: data.values,
                        value: data.value,
                        tokens: tokens
                    };
                    //await macro.execute.apply(macro, [context]);
                    await macro.callScriptFunction(context);
                }
            }
            case 'playvideo': {
                let tile = await fromUuid(data.tileid);
                if (tile) {
                    tile.object.play(true);
                }
            } break;
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
                    let tile = await fromUuid(data.tileid);
                    if (tile) {
                        if (tile.soundeffect != undefined) {
                            try {
                                tile.soundeffect.stop();
                            } catch {}
                        }

                        log('Playing', data.src);
                        AudioHelper.play({ src: data.src, volume: data.volume, loop: data.loop }, false).then((sound) => {
                            tile.soundeffect = sound;
                            tile.soundeffect.on("end", () => {
                                log('Finished playing', data.src);
                                delete tile.soundeffect;
                            });
                        });
                    }
                }
            } break;
            case 'stopsound': {
                if (data.type == 'all') {
                    game.audio.playing.forEach((s) => s.stop());
                } else {
                    let tile = await fromUuid(data.tileid);
                    if (tile) {
                        if (tile.soundeffect != undefined) {
                            try {
                                tile.soundeffect.stop();
                                delete tile.soundeffect;
                            } catch { }
                        }
                    }
                }
            } break;
            case 'pan': {
                if (data.userid == game.user.id || (data.userid == undefined && !game.user.isGM)) {
                    if (data.animate)
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
                    let entity = await fromUuid(data.entityid);
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
                if (triggerData.pertoken && this.hasTriggered(token.id))
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
                        newPos.push({ x: filtered[0].x, y: filtered[0].y, x2: filtered[1].x, y2: filtered[1].y, method: 'Movement' });
                    else {
                        if (inTile)
                            newPos.push({ x: filtered[0].x1, y: filtered[0].y1, x2: filtered[0].x2, y2: filtered[0].y2, method: 'Movement' });
                        else 
                            newPos.push({ x: filtered[0].x, y: filtered[0].y, x2: destination.x + (token.w / 2), y2: destination.y + (token.h / 2), method: 'Movement' });
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
                        pos.method = wh;
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
                if (action.action == 'scene') {
                    log('preloading scene', action.data.sceneid);
                    game.scenes.preload(action.data.sceneid, true);
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

        TileDocument.prototype.trigger = async function ({ token = [], userid = game.user.id, method }) {
            if (game.user.isGM) {
                let triggerData = this.data.flags["monks-active-tiles"];
                //if (this.data.flags["monks-active-tiles"]?.pertoken)
                for (let tkn of token)
                    await this.addHistory(tkn.id, method, userid);    //changing this to always register tokens that have triggered it.

                //only complete a trigger once the minimum is reached
                if (triggerData.minrequired && this.countTriggered() < triggerData.minrequired)
                    return;

                //A token has triggered this tile, what actions do we need to do
                let actions = this.data.flags["monks-active-tiles"]?.actions || [];
                let values = [];
                let value = {};
                for (let action of actions) {
                    let fn = MonksActiveTiles.triggerActions[action.action]?.fn;
                    if (fn) {
                        if (action.delay > 0) {
                            let tile = this;
                            window.setTimeout(async function () {
                                try {
                                    await fn.call(tile, { tile: tile, tokens: token, action: action, userid: userid, values: values, value: value });
                                } catch (err) {
                                    error(err);
                                }
                            }, action.delay * 1000);
                        } else {
                            let cancall = await Hooks.call("preTriggerTile", this, this, token, action, userid, values);
                            if (cancall) {
                                try {
                                    let result = await fn.call(this, { tile: this, tokens: token, action: action, userid: userid, values: values, value: value });
                                    if (typeof result == 'object') {
                                        if (result._replacetoken) {
                                            token = result._replacetoken;
                                            delete result._replacetoken;
                                        }
                                        value = mergeObject(value, result);
                                        values.push(mergeObject(result, { action: action }));
                                        result = result.result;
                                    }
                                    let cancontinue = await Hooks.call("triggerTile", this, this, token, action, userid, values);
                                    if (result === false || cancontinue === false) break;
                                } catch (err) {
                                    error(err);
                                }
                            }
                        }
                    }
                }
            } else {
                //post this to the GM
                let tokens = token.map(t => (t?.document?.uuid || t?.uuid));
                MonksActiveTiles.emit('trigger', { tileid: this.uuid, tokens: tokens, method: method } );
            }
        }

        TileDocument.prototype.hasTriggered = function (tokenid, method, userid) {
            let tileHistory = (this.data.flags["monks-active-tiles"]?.history || {});
            if (tokenid == undefined) {
                return Object.entries(tileHistory).length > 0;
            } else {
                let result = tileHistory[tokenid]?.triggered.filter(h => {
                    return (method == undefined || h.how == method) && (userid == undefined || h.who == userid);
                }).sort((a, b) => {
                    return (isFinite(a = a.valueOf()) && isFinite(b = b.valueOf()) ? (a < b) - (a > b) : NaN);
                });

                return (result && result[0]);
            }
        }

        TileDocument.prototype.countTriggered = function () {
            let tileHistory = (this.data.flags["monks-active-tiles"]?.history || {});
            return Object.entries(tileHistory).length;
        }

        TileDocument.prototype.addHistory = async function (tokenid, method, userid) {
            let tileHistory = this.data.flags["monks-active-tiles"]?.history || {};
            let data = { id: makeid(), who: userid, how: method, when: Date.now() };
            if (!tileHistory[tokenid])
                tileHistory[tokenid] = { tokenid: tokenid, triggered: [data] };
            else
                tileHistory[tokenid].triggered.push(data);

            //this.data.flags = mergeObject(this.data.flags, { "monks-active-tiles.history": tileHistory }); //Due to a race condition we need to set the actual value before trying to save it

            await this.setFlag("monks-active-tiles", "history", duplicate(this.data.flags["monks-active-tiles"]?.history || tileHistory));
            canvas.perception.schedule({
                sight: {
                    initialize: true,
                    refresh: true,
                    forceUpdateFog: true // Update exploration even if the token hasn't moved
                },
                lighting: { refresh: true },
                sounds: { refresh: true },
                foreground: { refresh: true }
            });
        }

        TileDocument.prototype.removeHistory = async function (id) {
            let tileHistory = duplicate(this.data.flags["monks-active-tiles"]?.history || {});
            for (let [k, v] of Object.entries(tileHistory)) {
                let item = v.triggered.findSplice(h => h.id == id);
                if (item != undefined) {
                    this.data.flags = mergeObject(this.data.flags, { "monks-active-tiles.history": tileHistory }); //Due to a race condition we need to set the actual value before trying to save it
                    await this.setFlag("monks-active-tiles", "history", tileHistory);
                    break;
                }
            }
        }

        TileDocument.prototype.resetHistory = async function (tokenid) {
            //let tileHistory = duplicate(this.data.flags["monks-active-tiles"]?.history || {});
            if (tokenid == undefined) {
                this.data.flags["monks-active-tiles"].history = {};
                await this.unsetFlag("monks-active-tiles", "history");
            } else {
                delete this.data.flags["monks-active-tiles"].history[tokenid];
                let key = `flags.monks-active-tiles.history.-=${tokenid}`;
                let updates = {};
                updates[key] = null;
                await this.update(updates);
            }
            /*
            this.data.flags["monks-active-tiles"].history = tileHistory; //Due to a race condition we need to set the actual value before trying to save it
            if (Object.entries(tileHistory).length == 0)
                this.unsetFlag("monks-active-tiles", "history");
            else {
                await this.update({ 'flags.monks-active-tiles.history' : tileHistory }, { diff: false });
                //await this.setFlag("monks-active-tiles", "history", tileHistory);
            }*/
        }

        TileDocument.prototype.getHistory = function (tokenid) {
            let tileHistory = (this.data.flags["monks-active-tiles"]?.history || {});
            let stats = { count: 0, method: {}, list: [] };

            for (let [k, v] of Object.entries(tileHistory)) {
                if (tokenid == undefined || tokenid == k) {
                    let tknstat = { count: v.triggered.length, method: {} };
                    let token = canvas.scene.tokens.find(t => t.id == k);
                    for (let data of v.triggered) {
                        if (tknstat.method[data.how] == undefined)
                            tknstat.method[data.how] = 1;
                        else
                            tknstat.method[data.how] = tknstat.method[data.how] + 1;

                        if (tknstat.first == undefined || data.when < tknstat.first.when)
                            tknstat.first = data;
                        if (tknstat.last == undefined || data.when > tknstat.last.when)
                            tknstat.last = data;

                        const time = new Date(data.when).toLocaleDateString('en-US', {
                            hour: "numeric",
                            minute: "numeric",
                            second: "numeric"
                        });

                        let user = game.users.find(p => p.id == data.who);
                        stats.list.push(mergeObject(data, { tokenid: k, name: token?.name || 'Unknown', username: user?.name || 'Unknown', whenfrmt: time }));
                    }

                    if (tknstat.first && (stats.first == undefined || tknstat.first.when < stats.first.when))
                        stats.first = mergeObject(tknstat.first, { tokenid: k });
                    if (tknstat.last && (stats.last == undefined || tknstat.last.when > stats.last.when))
                        stats.last = mergeObject(tknstat.last, { tokenid: k });

                    stats.count += tknstat.count;
                }

            }

            stats.list = stats.list.sort((a, b) => {
                return ( isFinite(a = a.valueOf()) && isFinite(b = b.valueOf()) ? (a > b) - (a < b) : NaN );
            });

            return stats;
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
        this.object.document.trigger({method: 'Manual'});
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
    //log('preupdate token', document, update, options, MonksActiveTiles._rejectRemaining);

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

        //log('triggering for', token.id);

        //Does this cross a tile
        for (let layer of [canvas.background.tiles, canvas.foreground.tiles]) {
            for (let tile of layer) {
                if (tile.data.flags['monks-active-tiles']?.active && tile.data.flags['monks-active-tiles']?.actions?.length > 0) {
                    if (game.modules.get("levels")?.active && _levels && _levels.isTokenInRange && !_levels.isTokenInRange(token, tile))
                        continue;

                    //check and see if the ray crosses a tile
                    let dest = { x: update.x || document.data.x, y: update.y || document.data.y };
                    let collision = tile.document.checkCollision(document, dest);

                    if (collision.length > 0) {
                        let tpts = tile.document.canTrigger(document.object, collision, dest);
                        if (tpts) {
                            //preload any teleports to other scenes
                            tile.document.preloadScene();

                            let doTrigger = async function (idx) {
                                if (idx >= tpts.length)
                                    return;

                                let triggerPt = tpts[idx];
                                //if it does and the token needs to stop, then modify the end position in update
                                let ray = new Ray({ x: token.data.x, y: token.data.y }, { x: triggerPt.x, y: triggerPt.y });

                                let stop = tile.document.checkStop();

                                //log('Triggering tile', update, stop);

                                if (stop) {
                                    //check for snapping to the closest grid spot
                                    if (stop == 'snap')
                                        triggerPt = mergeObject(triggerPt, canvas.grid.getSnappedPosition(triggerPt.x, triggerPt.y));

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
                                /*let sceneId = tile.document.data.flags['monks-active-tiles'].actions.find(a => { return a.action.id == 'teleport' })?.sceneId;
                                if (sceneId && sceneId != canvas.scene.id)
                                    game.scenes.preload(sceneId, true);
*/
                                //calculate how much time until the token reaches the trigger point, and wait to call the trigger
                                const s = canvas.dimensions.size;
                                const speed = s * 10;
                                const duration = (ray.distance * 1000) / speed;

                                window.setTimeout(function () {
                                    log('Tile is triggering', document);
                                    tile.document.trigger({ token: [document], method: triggerPt.method });
                                    if(!stop)   //If this fires on Enter, and a stop is request then we don't need to run the On Exit code.
                                        doTrigger(idx + 1);
                                }, duration);

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
/*
Hooks.on('renderChatMessage', async (message, html, data) => {
    if (message.getFlag('monks-active-tiles', 'language') && message.data.type == CONST.CHAT_MESSAGE_TYPES.OTHER) {
        await message.update({ type: CONST.CHAT_MESSAGE_TYPES.OOC });
    }
});
*/
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

Hooks.on('controlDrawing', (drawing, control) => {
    if (control)
        MonksActiveTiles.controlEntity(drawing);
});