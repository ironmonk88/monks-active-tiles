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
                if (action.data.animate)
                    canvas.animatePan({ x: action.data.location.x, y: action.data.location.y });
                else
                    canvas.pan({ x: action.data.location.x, y: action.data.location.y });
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + (action.data?.snap ? ' (' + i18n("MonksActiveTiles.ctrl.snap").toLowerCase() + ')' : '');
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
                    subtype: "location"
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
                },
                {
                    id: "addanimation",
                    name: "Add bit of animation",
                    type: "checkbox"
                }/*,
                {
                    id: "avoidtokens",
                    name: "Avoid other tokens",
                    type: "checkbox"
                }*/
                /*,
                {
                    id: "addmovement",
                    name: "Add bit of movement",
                    type: "checkbox"
                }*/
            ],
            fn: async (tile, token, action, userid) => {
                let onMovementFrame = function (dt, anim, config) {
                    log('movement frame', dt, anim, config);
                }
                //move the token to the new square
                let newPos = {
                    x: action.data.location.x - (token.w / 2),
                    y: action.data.location.y - (token.h / 2)
                };
                if (action.data.location.sceneId == undefined || action.data.location.sceneId == canvas.scene.id) {

                    await token.stopAnimation();
                    if (!canvas.grid.hitArea.contains(newPos.x, newPos.y)) {
                        //+++find the closest spot on the edge of the scene
                        ui.notifications.error("MonksActiveTiles.msg.prevent-teleport");
                        return;
                    }
                    if (action.data.remotesnap)
                        newPos = canvas.grid.getSnappedPosition(newPos.x, newPos.y);

                    if (action.data.addanimation) {
                        let oldSize = { width: token.width, height: token.height };
                        //token.pivot.set(token.width / 2, token.height / 2);
                        token.x = token.x + (token.width / 2);
                        token.y = token.y + (token.height / 2);
                        token.border.alpha = 0;
                        let animationName = `Token.${token.id}.animateTeleport`;
                        const animationData = [
                            { parent: token, attribute: 'rotation', to: (Math.PI * 6) },
                            { parent: token, attribute: 'width', to: 20 },
                            { parent: token, attribute: 'height', to: 20 }];
                        await CanvasAnimation.animateLinear(animationData, {
                            name: animationName,
                            context: token,
                            duration: 500,
                            ontick: (dt, anim) => onMovementFrame(dt, anim)
                        });
                        //token.pivot.set(0, 0);
                        token.rotation = 0;
                        token.width = oldSize.width;
                        token.height = oldSize.height;
                        token.border.alpha = 1;

                        await token.document.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: false });
                        canvas.animatePan({ x: newPos.x, y: newPos.y });

                        //token.pivot.set(token.width / 2, token.height / 2);
                        token.x = token.x + (token.width / 2);
                        token.y = token.y + (token.height / 2);
                        token.width = 20;
                        token.height = 20;
                        token.border.alpha = 0;
                        const animationData2 = [
                            { parent: token, attribute: 'rotation', to: (Math.PI * 6) },
                            { parent: token, attribute: 'width', to: oldSize.width },
                            { parent: token, attribute: 'height', to: oldSize.height }];
                        await CanvasAnimation.animateLinear(animationData2, {
                            name: animationName,
                            context: token,
                            duration: 500,
                            ontick: (dt, anim) => onMovementFrame(dt, anim)
                        });
                        token.pivot.set(0, 0);
                        token.rotation = 0;
                        token.width = oldSize.width;
                        token.height = oldSize.height;
                        token.x = token.x - (token.width / 2);
                        token.y = token.y - (token.height / 2);
                        token.border.alpha = 1;
                    } else {
                        await token.document.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: false });
                        if(action.data.animatepan)
                            canvas.animatePan({ x: newPos.x, y: newPos.y });
                        else
                            canvas.pan({ x: newPos.x, y: newPos.y });
                    }
                } else {
                    //if the end spot is on a different scene then hide this token, check the new scene for a token for that actor and move it, otherwise create the token on the new scene
                    let scene = game.scenes.get(action.data.location.sceneId);
                    let xtoken = (token.actor?.id ? scene.tokens.find(t => { return t.actor?.id == token.actor?.id }) : null);

                    if (action.data.remotesnap) {
                        newPos.x = newPos.x.toNearest(scene.data.size);
                        newPos.y = newPos.y.toNearest(scene.data.size);
                    }

                    if (xtoken) {
                        await xtoken.update({ x: newPos.x, y: newPos.y, hidden: token.data.hidden }, { bypass: true, animate: false });
                    }
                    else {
                        const td = await token.actor.getTokenData({ x: newPos.x, y: newPos.y });
                        const cls = getDocumentClass("Token");
                        await cls.create(td, { parent: scene });
                    }
                    token.update({ hidden: true });   //hide the old one
                    let scale = canvas.scene._viewPosition.scale;

                    if (userid == game.user.id) {
                        await scene.view();
                        canvas.pan({ x: newPos.x, y: newPos.y, scale: scale });
                    } else {
                        //pass this back to the player
                        game.socket.emit(
                            MonksActiveTiles.SOCKET,
                            {
                                action: 'switchview',
                                senderId: game.user.id,
                                userid: userid,
                                sceneid: scene.id,
                                pos: { x: newPos.x, y: newPos.y, scale: scale}
                            },
                            (resp) => { }
                        );
                    }
                }
            },
            content: (trigger, action) => {
                let scene = game.scenes.find(s => s.id == action.data?.location.sceneId);
                return i18n(trigger.name) + ' token to [' + action.data?.location.x + ',' + action.data?.location.y + ']'+ (scene ? ' Scene: ' + scene.name : '') + (action.data?.remotesnap ? ' (snap to grid)' : '');
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
                    subtype: "location",
                    restrict: (scene) => { return this.scene.id == scene.id; }
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
                try {
                    let entities = await MonksActiveTiles.getEntities(tile, token, action);
                    
                    if (entities && entities.length > 0) {
                        //set or toggle visible
                        for (let token of entities) {
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
                                await token.document.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: false });
                            } else
                                token.document.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: true });
                        }
                    }
                } catch {

                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' ' + action.data?.entity.name + ' to [' + action.data?.location.x + ',' + action.data?.location.y + ']' + (action.data?.snap ? ' (snap to grid)' : '') + (action.data?.wait ? ' (wait)' : '');
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
                try {
                    let entities = await MonksActiveTiles.getEntities(tile, token, action);

                    if (entities && entities.length > 0) {
                        //set or toggle visible
                        for (let e of entities) {
                            await e.document.update({ hidden: (action.data.hidden == 'toggle' ? !e.data.hidden : action.data.hidden !== 'show') });
                        }
                    }
                } catch {

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
                    options: { showTile: false, showToken: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof Actor); }
                },
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "location",
                    restrict: (scene) => { return this.scene.id == scene.id; }
                },
                {
                    id: "snap",   //using remote snap because I don't want this to trigger the token to be snapped to the grid on the tile
                    name: "MonksActiveTiles.ctrl.snap",
                    type: "checkbox",
                    defvalue: true
                }
            ],
            fn: async (tile, token, action) => {
                //find the item in question
                try {
                    let entities = await MonksActiveTiles.getEntities(tile, token, action);

                    if (entities && entities.length > 0) {
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

                            // Submit the Token creation request and activate the Tokens layer (if not already active)
                            const cls = getDocumentClass("Token");
                            await cls.create(td, { parent: tile.document.parent });
                        }
                    }
                } catch {

                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' ' + action.data?.entity.name + ' to [' + action.data?.location.x + ',' + action.data?.location.y + ']' + (action.data?.snap ? ' (snap to grid)' : '');
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
                    options: { showToken: false, showPlayers: false },
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
                let entities = await MonksActiveTiles.getEntities(tile, token, action);
                if (entities.length == 0)
                    return;

                let entity = entities[0].document;

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
                }
            ],
            fn: async (tile, token, action) => {
                try {
                    let entities = await MonksActiveTiles.getEntities(tile, token, action);

                    if (entities && entities.length > 0) {
                        for (let entity of entities) {
                            let document = entity.document;

                            let update = {};
                            let value = action.data.value;
                            if (action.data.value == 'true') value = true;
                            else if (action.data.value == 'false') value = false;
                            else if (action.data.value.startsWith('+ ') || action.data.value.startsWith('- ')) {
                                let base = getProperty(document.data, action.data.attribute);
                                value = eval(base + action.data.value);
                            }
                            update[action.data.attribute] = value;
                            await document.update(update);
                        }
                    }
                } catch {

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
                }
            ],
            values: {
                'audiofor': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm"
                }
            },
            fn: (tile, token, action) => {
                //play the sound
                AudioHelper.play({ src: action.data.audiofile }, action.data.actionfor !== 'gm');
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' for ' + trigger.values.audiofor[action.audiofor];
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
                    options: { showTile: false, showToken: false, showPlayers: false },
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
                    'lock': "MonksActiveTiles.state.locked"
                }
            },
            fn: async (tile, token, action) => {
                //Find the door in question, set the state to whatever value
                let wall = await fromUuid(action.data.entity.id);
                if (wall && wall.data.door != 0) {
                    await wall.update({ ds: (action.data.state == 'open' ? CONST.WALL_DOOR_STATES.OPEN : (action.data.state == 'locked' ? CONST.WALL_DOOR_STATES.LOCKED : CONST.WALL_DOOR_STATES.CLOSED)) });
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
                }
            ],
            values: {
                'type': {
                    'info': "MonksActiveTiles.notification.info",
                    'warning': "MonksActiveTiles.notification.warning",
                    'error': "MonksActiveTiles.notification.error"
                }
            },
            fn: (tile, token, action) => {
                //Display a notification with the message
                ui.notifications.notify(action.data.text, action.data.type);
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
            fn: (tile, token, action) => {
                //Add a chat message
                let tokenOwners = Object.entries(token.actor.data.permission).filter(([k, v]) => { return v == CONST.ENTITY_PERMISSIONS.OWNER }).map(a => { return a[0]; });
                const speaker = ChatMessage.getSpeaker({ user: game.user.id });

                let messageData = {
                    user: game.user.id,
                    //speaker: speaker,
                    type: CONST.CHAT_MESSAGE_TYPES.OTHER,
                    content: action.data.text
                };

                if (action.data.for == 'gm')
                    messageData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
                else if (action.data.for == 'token') {
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
                try {
                    let macro = game.macros.get(action.data.macroid);
                    if (macro instanceof Macro) {
                        return await MonksActiveTiles._executeMacro(macro, tile, token, action, userid);
                    }
                } catch{}
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
                }
            ],
            fn: async (tile, token, action) => {
                //Find the roll table
                try {
                    let rolltable = game.tables.get(action.data?.rolltableid);
                    if (rolltable instanceof RollTable) {
                        //Make a roll
                        let result = rolltable.draw();
                        //Check to see what the privacy rules are
                    }
                } catch{ }
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
                if (action.data?.for == 'token') {
                    //canvas.sight._onResetFog(result)
                }
                else 
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
                        for (let effect of CONFIG.statusEffects.sort((a, b) => { return (i18n(a.label) > i18n(b.label) ? 1 : (i18n(a.label) < i18n(b.label) ? -1 : 0)) })) {
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
                let entities = await MonksActiveTiles.getEntities(tile, token, action);
                if (entities.length == 0)
                    return;

                const effect = CONFIG.statusEffects.find(e => e.id === action.data?.effectid);
                for (let token of entities) {
                    if (token == undefined)
                        continue;

                    if (action.data?.addeffect == 'toggle')
                        await token.toggleEffect(effect, { overlay: false });
                    else {
                        const exists = (token.actor.effects.find(e => e.getFlag("core", "statusId") === effect.id) != undefined);
                        if (exists != (action.data?.addeffect == 'add'))
                            await token.toggleEffect(effect, { overlay: false });
                    }
                }
            },
            content: (trigger, action) => {
                const effect = CONFIG.statusEffects.find(e => e.id === action.data?.effectid);
                return (action.data?.addeffect == 'add' ? i18n("MonksActiveTiles.add.add") : (action.data?.addeffect == 'remove' ? i18n("MonksActiveTiles.add.remove") : i18n("MonksActiveTiles.add.toggle"))) + ' ' + i18n(effect.label) + ' ' + (action.data?.addeffect == 'add' ? "to" : (action.data?.addeffect == 'remove' ? "from" : "on")) + ' ' + action.data?.entity.name;
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
                    options: { showToken: false, showPlayers: false },
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
                let entities = await MonksActiveTiles.getEntities(tile, token, action);
                if (entities.length == 0)
                    return;

                let entity = entities[0];

                if (entity.isVideo) 
                    entity.play(action.data?.play == 'start', { offset: (action.data?.play == 'stop' ? 0 : null)});
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
                    options: { showTile: false, showToken: false, showPlayers: false },
                    restrict: (entity) => { return (entity instanceof JournalEntry); }
                }
            ],
            fn: async (tile, token, action) => {
                let entities = await MonksActiveTiles.getEntities(tile, token, action);
                if (entities.length == 0)
                    return;

                let entity = entities[0];

                //open journal
                if (entity) entity.sheet.render(true);
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ', ' + action.data?.entity.name;
            }
        }
    }

    static async getEntities(tile, token, action) {
        let entity;
        if (action.data.entity.id == 'tile')
            entity = [(tile.object || tile)];
        else if (action.data.entity.id == 'token')
            entity = [(token?.object || token)];
        else if (action.data.entity.id == 'players') {
            entity = canvas.tokens.placeables.filter(t => {
                return t.actor != undefined && t.actor?.hasPlayerOwner && t.actor?.data.type != 'npc';
            });
        } else {
            entity = await fromUuid(action.data.entity.id);
            entity = [(entity.object || entity)];
        }

        return entity;
    }

    static async _executeMacro(macro, tile, token, action, userid) {
        if (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active) {
            if (!(macro.getFlag("advanced-macros", "runAsGM") || macro.getFlag("furnace", "runAsGM") || token == undefined) && userid != game.user.id) {
                //this one needs to be run as the player, so send it back
                window.setTimeout(function () {
                    game.socket.emit(
                        MonksActiveTiles.SOCKET,
                        {
                            action: 'runmacro',
                            userid: userid,
                            macroid: macro.uuid,
                            tileid: tile?.document.uuid,
                            tokenid: token?.document.uuid,
                            acts: action
                        },
                        (resp) => { }
                    );
                }, 100);
            } else {
                let args = [{ actor: token?.actor, token: token, tile: tile, userid: userid }, action.data.args];
                return await macro.execute.apply(macro, args);
            }
        } else
            return await macro.execute({ actor: token.actor, token: token });
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
            if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'location') {
                let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
                if (restrict && !restrict(canvas.scene)) {
                    ui.notifications.error(i18n("MonksActiveTiles.msg.invalid-location"));
                    return;
                }

                let pos = event.data.getLocalPosition(canvas.app.stage);
                let update = { x: parseInt(pos.x), y: parseInt(pos.y), sceneId: (canvas.scene.id != MonksActiveTiles.waitingInput.options.parent.object.parent.id ? canvas.scene.id : null) };
                MonksActiveTiles.waitingInput.updateSelection(update);
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

        let oldClickActorName = ActorDirectory.prototype._onClickEntityName;
        ActorDirectory.prototype._onClickEntityName = async function (event) {
            if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') { //+++ need to make sure this is allowed, only create should be able to select templates
                event.preventDefault();
                const actorId = event.currentTarget.closest(".actor").dataset.entityId;
                const actor = this.constructor.collection.get(actorId);
                MonksActiveTiles.waitingInput.updateSelection({ id: actor.uuid, name: actor.name });
            } else
                oldClickActorName.call(this, event);
        }

        let oldClickJournalName = JournalDirectory.prototype._onClickEntityName;
        JournalDirectory.prototype._onClickEntityName = async function (event) {
            if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') { //+++ need to make sure this is allowed, only create should be able to select templates
                event.preventDefault();
                const journalId = event.currentTarget.closest(".journal").dataset.entityId;
                const journal = this.constructor.collection.get(journalId);
                MonksActiveTiles.waitingInput.updateSelection({ id: journal.uuid, name: journal.name });
            } else
                oldClickJournalName.call(this, event);
        }

        let oldOnClickEntry = Compendium.prototype._onClickEntry;
        Compendium.prototype._onClickEntry = async function (event) {
            if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') { //+++ need to make sure this is allowed, only create should be able to select templates
                let li = event.currentTarget.parentElement;
                const document = await this.collection.getDocument(li.dataset.documentId);
                if (document instanceof Actor) 
                    MonksActiveTiles.waitingInput.updateSelection({ id: document.uuid, name: document.name });
                else
                    oldOnClickEntry.call(this, event);
            } else
                oldOnClickEntry.call(this, event);
        }
    }

    static async onMessage(data) {
        switch (data.action) {
            case 'trigger': {
                if (game.user.isGM) {
                    let token = await fromUuid(data.tokenid);
                    let tile = await fromUuid(data.tileid);

                    tile.trigger(token.object, data.senderId);
                }
            } break;
            case 'switchview': {
                if (game.user.id == data.userid) {
                    let scene = game.scenes.get(data.sceneid);
                    await scene.view();
                    canvas.pan({ x: data.pos.x, y: data.pos.y, scale: data.pos.scale });
                }
            } break;
            case 'runmacro': {
                if (game.user.id == data.userid) {
                    let macro = await fromUuid(data.macroid);
                    let tile = await fromUuid(data.tileid);
                    let token = await fromUuid(data.tokenid);
                    MonksActiveTiles._executeMacro(macro, tile, token, data.acts, data.userid);
                }
            }
        }
    }

    static controlEntity(entity) {
        if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') {
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
            if (this.data.flags["monks-active-tiles"].actions == undefined)
                this.data.flags["monks-active-tiles"].actions = [];
        }

        TileDocument.prototype.canTrigger = function (token, collision) {
            let triggerData = this.data.flags["monks-active-tiles"];
            if (triggerData) {
                //check to see if this trigger is per token, and already triggered
                if (triggerData.pertoken && triggerData.tokens?.includes(token.id))
                    return;

                //check to see if this trigger is restricted
                if ((triggerData.restriction == 'gm' && token.actor.hasPlayerOwner) || (triggerData.restriction == 'player' && !token.actor.hasPlayerOwner))
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
                let when = this.getFlag('monks-active-tiles', 'trigger');   //+++ need to do something different if movement is called for
                let idx = ((inTile ? 0 : 1) - (when == 'enter' ? 1 : 0));

                log(collision, sorted, filtered, inTile, when, idx);

                if (idx < 0 || idx >= filtered.length)
                    return;

                let newPos = filtered[idx];
                newPos.x -= (token.w / 2);
                newPos.y -= (token.h / 2);

                return newPos;
            }
        }

        TileDocument.prototype.checkCollision = function (token, update) {
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
            const tokenX2 = update.x + tokenOffsetW;
            const tokenY2 = update.y + tokenOffsetH;

            // 2. Create a new Ray for the token, from its starting position to its
            // destination.

            const tokenRay = new Ray({ x: tokenX1, y: tokenY1 }, { x: tokenX2, y: tokenY2 });
            // 3. Create four intersection checks, one for each line making up the
            // tile rectangle. If any of these pass, that means it has intersected at
            // some point.

            let i1 = tokenRay.intersectSegment([tileX1, tileY1, tileX2, tileY1]);
            //let i2 = tokenRay.intersectSegment([tileX2, tileY1, tileX2, tileY2]);
            //let i3 = tokenRay.intersectSegment([tileX1, tileY2, tileX2, tileY2]);
            let i4 = tokenRay.intersectSegment([tileX1, tileY1, tileX1, tileY2]);

            let intersect = [
                tokenRay.intersectSegment([tileX1, tileY1, tileX2, tileY1]),
                tokenRay.intersectSegment([tileX2, tileY1, tileX2, tileY2]),
                tokenRay.intersectSegment([tileX1, tileY2, tileX2, tileY2]),
                tokenRay.intersectSegment([tileX1, tileY1, tileX1, tileY2])
            ].filter(i => i);

            return intersect;
        }

        TileDocument.prototype.checkStop = function () {
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
                            window.setTimeout(async function () {
                                await fn.call(this, this.object, token, action);
                            }, action.delay * 1000);
                        } else {
                            let result = await fn.call(this, this.object, token, action, userid);
                            if (result === false) break;
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
                game.socket.emit(
                    MonksActiveTiles.SOCKET,
                    {
                        action: 'trigger',
                        senderId: game.user.id,
                        tileid: this.uuid,
                        tokenid: token?.document.uuid
                    },
                    (resp) => { }
                );
            }
        }

        if (!game.modules.get("drag-ruler")?.active) {
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
                this.cancelMovement = false;
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
                    await token.document.update(path.B, { animate: animate });
                    path.B.x = token.data.x;
                    path.B.y = token.data.y;

                    //if the movement has been canceled then stop processing rays
                    if (this.cancelMovement)
                        break;

                    // Update the path which may have changed during the update, and animate it
                    priorDest = path.B;
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
        //Does this cross a tile
        for (let layer of [canvas.background.tiles, canvas.foreground.tiles]) {
            for (let tile of layer) {
                if (tile.data.flags['monks-active-tiles']?.active && tile.data.flags['monks-active-tiles']?.actions?.length > 0) {
                    if (game.modules.get("levels")?.active && _levels && _levels.isTokenInRange && !_levels.isTokenInRange(token, tile))
                        continue;

                    //check and see if the ray crosses a tile
                    let collision = tile.document.checkCollision(document, { x: update.x || document.data.x, y: update.y || document.data.y });

                    if (collision.length > 0) {
                        let triggerPt = tile.document.canTrigger(document.object, collision);
                        if (triggerPt) {
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

                                //try to disrupt the remaining path if there is one, by setting an update
                                //MonksActiveTiles._rejectRemaining[document.id] = { x: triggerPt.x, y: triggerPt.y };
                                //window.setTimeout(function () { delete MonksActiveTiles._rejectRemaining[document.id]; }, 500); //Hopefully half a second is enough to clear any of the remaining animations

                                let ruler = canvas.controls.getRulerForUser(game.user.id);
                                if (ruler) ruler.cancelMovement = true;
                                options.animate = false;

                                /*
                                if (game.modules.get("drag-ruler")?.active) {
                                    let checkcount = 0;
                                    let stopanimate = window.setInterval(function () {
                                        checkcount++;
                                        log('stop animation', CanvasAnimation.animations);
                                        let sa = CanvasAnimation.animations[`Token.${document.id}.animateMovement`] != undefined;
                                        token.stopAnimation();
                                        if (sa || checkcount > 20) {
                                            window.clearInterval(stopanimate);
                                            //add a new animation to the new spot
                                            document.update({ x: triggerPt.x, y: triggerPt.y }, { bypass: true });
                                        }
                                    }, 10);
                                }*/
                                    await document.update({ x: triggerPt.x, y: triggerPt.y }, { bypass: true });
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
                                tile.document.trigger(document.object);
                            }, duration);
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