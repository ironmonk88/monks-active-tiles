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

    static triggerActions = {
        'pause': {
            name: 'Pause Game',
            fn: (tile, token, action) => { game.togglePause(true, true); }
        },
        'teleport': {
            name: 'Teleport',
            stop:true,
            ctrls: [
                {
                    id: "location",
                    name: "Select Coordinates",
                    type: "select",
                    subtype: "location"
                }
            ],
            fn: async (tile, token, action) => {
                //move the token to the new square
                if (action.data.location.scene == undefined || action.data.location.sceneId == canvas.scene.id) {
                    await token.stopAnimation();
                    await token.document.update({ x: action.data.location.x, y: action.data.location.y }, { ignore: true, animate: false });
                    canvas.pan(action.data.location.x, action.data.location.y);
                } else {
                    //if the end spot is on a different scene then hide this token, check the new scene for a token for that actor and move it, otherwise create the token on the new scene
                    let scene = game.scenes.get(action.data.location.sceneId);
                    let xtoken = (token.actor?.id ? scene.tokens.find(t => { return t.actor?.id == token.actor?.id }) : null);
                    if (xtoken) {
                        xtoken.update({ x: action.data.location.x, y: action.data.location.y, hidden: token.data.hidden }, { ignore: true, animate: false });
                    }
                    else {
                        const td = await token.actor.getTokenData({ x: action.data.location.x, y: action.data.location.y });
                        const cls = getDocumentClass("Token");
                        await cls.create(td, { parent: scene });
                    }
                    token.update({hidden: true});   //hide the old one

                    await scene.view();
                    canvas.pan(action.data.location.x, action.data.location.y);
                }
            },
            content: (trigger, action) => {
                let scene = game.scenes.find(s => s.id == action.data.location.scene);
                return trigger.name + ' token to ' + (scene ? 'Scene: ' + scene.name : '') + '[' + action.data.location.x + ',' + action.data.location.y + ']' + (action.delay > 0 ? ' after ' + action.delay + ' seconds' : '');
            }
        },
        'showhide': {
            name: 'Show/Hide',
            ctrls: [
                {
                    id: "entity",
                    name: "Select Entity",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Tile); }
                },
                {
                    id: "hidden",
                    name: "State",
                    list: "hidden",
                    type: "list"
                }
            ],
            values: {
                'hidden': {
                    'show': 'Show',
                    'hide': 'Hide',
                    'toggle': 'Toggle'
                }
            },
            fn: async (tile, token, action) => {
                //find the item in question
                try {
                    let entity;
                    if (action.data.entity == 'This')
                        entity = tile;
                    else if (action.data.entity == 'Token')
                        entity = token;
                    else 
                        entity = await fromUuid(action.data.entity.id);
                    if (entity) {
                        //set or toggle visible
                        entity.update({ hidden: (action.data.hidden == 'toggle' ? !entity.data.hidden : action.data.hidden !== 'show') });
                    }
                } catch {

                }
            },
            content: (trigger, action) => {
                return trigger.values.hidden[action.data.hidden] + ' ' + (action.data.entity.name || action.data.entity) + (action.delay > 0 ? ' after ' + action.delay + ' seconds' : '');
            }
        },
        'activate': {
            name: 'Activate/Deactivate Tile',
            ctrls: [
                {
                    id: "entity",
                    name: "Select Entity",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return (entity instanceof Tile); }
                },
                {
                    id: "activate",
                    name: "State",
                    list: "activate",
                    type: "list"
                }
            ],
            values: {
                'activate': {
                    'activate': 'Activate',
                    'deactivate': 'Deactivate'
                }
            },
            fn: async (tile, token, action) => {
                let entity;
                if (action.data.entity == 'This')
                    entity = tile;
                else
                    entity = await fromUuid(action.data.entity.id);

                entity.setFlag('monks-active-tiles', 'active', action.data.activate == 'activate');
            },
            content: (trigger, action) => {
                return trigger.values.activate[action.data.activate] + ' ' + (action.data.entity.name || action.data.entity) + (action.delay > 0 ? ' after ' + action.delay + ' seconds' : '');
            }
        },
        'alter': {
            name: 'Alter',
            ctrls: [
                {
                    id: "entity",
                    name: "Select Entity",
                    type: "select",
                    subtype: "entity"
                },
                {
                    id: "attribute",
                    name: "Attribute",
                    type: "text"
                },
                {
                    id: "value",
                    name: "Value",
                    type: "text"
                }
            ],
            fn: async (tile, token, action) => {
                try {
                    let entity;
                    if (action.data.entity == 'This')
                        entity = tile;
                    else if (action.data.entity == 'Token')
                        entity = token;
                    else
                        entity = await fromUuid(action.data.entity.id);

                    if (entity) {
                        let update = {};
                        update[action.data.attribute] = (action.data.value == 'true' ? true : (action.data.value == 'false' ? false : ($.isNumeric(action.data.value) ? parseFloat(action.data.value) : action.data.value)));
                        entity.update(update);
                    }
                } catch {

                }
            },
            content: (trigger, action) => {
                return trigger.name + ' ' + (action.data.entity.name || action.data.entity) + ' set ' + action.data.attribute + ' to ' + action.data.value + (action.delay > 0 ? ' after ' + action.delay + ' seconds' : '');
            }
        },
        'playsound': {
            name: 'Play sound',
            ctrls: [
                {
                    id: "audiofile",
                    name: "Sound File",
                    type: "filepicker",
                    subtype: "audio"
                },
                {
                    id: "audiofor",
                    name: "For",
                    list: "audiofor",
                    type: "list"
                }
            ],
            values: {
                'audiofor': {
                    'all': 'Everyone',
                    'gm': 'GM Only'
                }
            },
            fn: (tile, token, action) => {
                //play the sound
                AudioHelper.play({ src: action.data.audiofile }, action.data.actionfor !== 'gm');
            },
            content: (trigger, action) => {
                return trigger.name + ' for ' + trigger.values.audiofor[action.audiofor] + (action.delay > 0 ? ' after ' + action.delay + ' seconds' : '');
            }
        },
        'changedoor': {
            name: 'Change door state',
            ctrls: [
                {
                    id: "entity",
                    name: "Select Door",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return (entity instanceof Wall && entity.data.door); }  //this needs to be a wall segment
                },
                {
                    id: "state",
                    name: "State",
                    list: "state",
                    type: "list"
                }
            ],
            values: {
                'state': {
                    'open': 'Open',
                    'close': 'Closed',
                    'lock': 'Locked'
                }
            },
            fn: async (tile, token, action) => {
                //Find the door in question, set the state to whatever value
                let wall = await fromUuid(action.data.entity.id);
                if (wall && wall.data.door == 1) {
                    wall.update({ ds: (action.data.state == 'open' ? CONST.WALL_DOOR_STATES.OPEN : (action.data.state == 'locked' ? CONST.WALL_DOOR_STATES.LOCKED : CONST.WALL_DOOR_STATES.CLOSED)) });
                }
            },
            content: (trigger, action) => {
                return trigger.name + ' to ' + trigger.values.state[action.data.state] + (action.delay > 0 ? ' after ' + action.delay + ' seconds' : '');
            }
        },
        /*'alter': {
            name: 'Alter',
            fn: (tile, token, action) => {
                //Not sure what to do about this, but it should mostly be for height or vision
            }
        },*/
        'notification': {
            name: 'Send Notification',
            ctrls: [
                {
                    id: "text",
                    name: "Text",
                    type: "text"
                },
                {
                    id: "type",
                    name: "Type",
                    list: "type",
                    type: "list"
                }
            ],
            values: {
                'type': {
                    'info': 'Info',
                    'warning': 'Warning',
                    'error': 'Error'
                }
            },
            fn: (tile, token, action) => {
                //Display a notification with the message
                ui.notifications.notify(action.data.text, action.data.type);
            }
        },
        'chatmessage': {
            name: 'Chat Message',
            ctrls: [
                {
                    id: "text",
                    name: "Text",
                    type: "text",
                    subtype: "multiline"
                },
                {
                    id: "for",
                    name: "For",
                    list: "for",
                    type: "list"
                }
            ],
            values: {
                'for': {
                    'all': 'Everyone',
                    'gm': 'GM Only',
                    'token': 'Token Owner'
                }
            },
            fn: (tile, token, action) => {
                //Add a chat message
                const speaker = ChatMessage.getSpeaker({ user: game.user });

                let messageData = {
                    user: game.user.id,
                    speaker: speaker,
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: action.data.text
                };

                ChatMessage.create(messageData);
            }
        },
        /*'castspell': {
            name: 'Cast Spell',
            fn: (tile, token) => {
                //Figure out what spell needs to be cast
            }
        }*/
        /*'runmacro': {
            name: 'Run Macro',
            ctrls: [
                {
                    id: "entityid",
                    name: "Select Macro",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return true; }  //can onyl select a macro
                }
            ],
            fn: async (tile, token, action) => {
                //Find the macro to be run, call it with the data from the trigger
                try {
                    let macro = await fromUuid(action.data.entityid);
                    if (macro instanceof Macro) {
                        execute({ actor: token.actor, token: token });
                    }
                } catch{}
            }
        },
        'rolltable': {
            name: 'Roll Table',
            ctrls: [
                {
                    id: "entityid",
                    name: "Select Roll Table",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return true; }  //can only select a roll table
                }
            ],
            fn: async (tile, token, action) => {
                //Find the roll table
                try {
                    let rolltable = await fromUuid(action.data.entityid);
                    if (rolltable instanceof RollTable) {
                        //Make a roll
                        let result = rolltable.draw();
                        //Check to see what the privacy rules are
                    }
                } catch{ }
            }
        }*/
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

        if (game.modules.get("monks-tokenbar")?.active) {
            MonksActiveTiles.triggerActions['setmovement'] = {
                name: 'Set Movement',
                stop: true,
                fn: (tile, token, action) => { }
            };
            MonksActiveTiles.triggerActions['requestroll'] = {
                name: 'Request Roll',
                fn: (tile, token, action) => { }
            };
        }

        /*
        let oldMoveToken = Ruler.prototype.moveToken;
        Ruler.prototype.moveToken = async function (event) {
            const rays = this._getRaysFromWaypoints(this.waypoints, this.destination);
            log('Rays:', rays);
            oldMoveToken.call(this, event);
        }

        let oldSetPosition = Token.prototype.setPosition;
        Token.prototype.setPosition = async function (x, y, { animate = true } = {}) {
            if (animate) {
                let origin = this._movement ? this.position : this._validPosition,
                    target = { x: x, y: y },
                    isVisible = this.isVisible;

                // Create the movement ray
                let ray = new Ray(origin, target);

                log('Ray:', ray);

                //check and see if the ray crosses a tile
                //if it does and the token needs to stop, then modify the end position
                //either way, set the trigger to fire once the token animates to the tile

                oldSetPosition.call(this, x, y, { animate: animate });
            } else
                oldSetPosition.call(this, x, y, { animate: animate });
        }*/

        let oldClickLeft = Canvas.prototype._onClickLeft;
        Canvas.prototype._onClickLeft = function (event) {
            if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'location') {
                let pos = event.data.getLocalPosition(canvas.app.stage);
                let update = { x: parseInt(pos.x), y: parseInt(pos.y) };
                if (canvas.scene.id != MonksActiveTiles.waitingInput.options.parent.object.parent.id)
                    update.sceneId = canvas.scene.id;
                MonksActiveTiles.waitingInput.updateSelection(update);
            }
            oldClickLeft.call(this, event);
        }
    }

    static controlEntity(entity) {
        if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') {
            let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
            if (restrict && !restrict(entity)) {
                ui.notifications.error('Invalid entity type');
                return;
            }
            MonksActiveTiles.waitingInput.updateSelection({ id: entity.document.uuid, name: entity.document.name });
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

        TileDocument.prototype.trigger = function (token) {
            //A token has triggered this tile, what actions do we need to do
            let triggerData = this.data.flags["monks-active-tiles"];
            if (triggerData) {
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

                //+++if this token needs to be stopped, then we need to adjust the path, and trigger when the animation clears

                let actions = this.data.flags["monks-active-tiles"]?.actions || [];
                for (let action of actions) {
                    let fn = MonksActiveTiles.triggerActions[action.action]?.fn;
                    if (fn) {
                        if (action.delay > 0) {
                            window.setTimeout(function () {
                                fn.call(this, this, token, action);
                            }, action.delay * 1000);
                        }else
                            fn.call(this, this, token, action);
                    }
                }
            }
        }

        TileDocument.prototype.checkCollision = function (token, update) {
            // 1. Get all the tile's vertices. X and Y are position at top-left corner
            // of tile.
            const tileX1 = this.data.x;
            const tileY1 = this.data.y;
            const tileX2 = this.data.x + this.data.width;
            const tileY2 = this.data.y + this.data.height;

            const tokenCanvasWidth = token.data.width * canvas.grid.size;
            const tokenCanvasHeight = token.data.height * canvas.grid.size;
            const tokenX1 = token.data.x + tokenCanvasWidth / 2;
            const tokenY1 = token.data.y + tokenCanvasHeight / 2;
            const tokenX2 = update.x + tokenCanvasWidth / 2;
            const tokenY2 = update.y + tokenCanvasHeight / 2;

            // 2. Create a new Ray for the token, from its starting position to its
            // destination.

            const tokenRay = new Ray({
                x: tokenX1,
                y: tokenY1
            }, {
                x: tokenX2,
                y: tokenY2
            }); // 3. Create four intersection checks, one for each line making up the
            // tile rectangle. If any of these pass, that means it has intersected at
            // some point.

            let intersect = [
                tokenRay.intersectSegment([tileX1, tileY1, tileX2, tileY1]),
                tokenRay.intersectSegment([tileX2, tileY1, tileX2, tileY2]),
                tokenRay.intersectSegment([tileX2, tileY2, tileX1, tileY2]),
                tokenRay.intersectSegment([tileX1, tileY2, tileX1, tileY1])
            ].filter(i => i);

            return intersect;
        }

        TileDocument.prototype.checkStop = function (collision, update) {
            let stoppage = this.data.flags['monks-active-tiles'].actions.find(a => { return MonksActiveTiles.triggerActions[a.action].stop === true });
            if (stoppage) {
                //update.x = collision[0].x;
                //update.y = collision[0].y;
                delete update.x;
                delete update.y;
            }
        }
    }

    static checkTileCollision(tile, token, update) {
        // 1. Get all the tile's vertices. X and Y are position at top-left corner
        // of tile.
        const tileX1 = tile.data.x;
        const tileY1 = tile.data.y;
        const tileX2 = tile.data.x + tile.data.width;
        const tileY2 = tile.data.y + tile.data.height;

        const tokenCanvasWidth = token.data.width * canvas.grid.size;
        const tokenCanvasHeight = token.data.height * canvas.grid.size;
        const tokenX1 = token.data.x + tokenCanvasWidth / 2;
        const tokenY1 = token.data.y + tokenCanvasHeight / 2;
        const tokenX2 = update.x + tokenCanvasWidth / 2;
        const tokenY2 = update.y + tokenCanvasHeight / 2;

        // 2. Create a new Ray for the token, from its starting position to its
        // destination.

        const tokenRay = new Ray({
            x: tokenX1,
            y: tokenY1
        }, {
            x: tokenX2,
            y: tokenY2
        }); // 3. Create four intersection checks, one for each line making up the
        // tile rectangle. If any of these pass, that means it has intersected at
        // some point.

        let intersect = [
            tokenRay.intersectSegment([tileX1, tileY1, tileX2, tileY1]),
            tokenRay.intersectSegment([tileX2, tileY1, tileX2, tileY2]),
            tokenRay.intersectSegment([tileX2, tileY2, tileX1, tileY2]),
            tokenRay.intersectSegment([tileX1, tileY2, tileX1, tileY1])
        ].filter(i => i);

        return intersect;
    }
}

Hooks.on('init', async () => {
    MonksActiveTiles.init();
})

Hooks.on('canvasInit', () => {
    let activehud = WithActiveTileHUD(canvas.hud.tile.constructor);
    canvas.hud.tile = new activehud();
});

Hooks.on('preUpdateToken', (document, update, options, userId) => {
    if ((update.x != undefined || update.y != undefined) && game.user.isGM && options.ignore !== true) {
        let token = document.object;
        //Does this cross a tile
        for (let layer of [canvas.background.tiles, canvas.foreground.tiles]) {
            for (let tile of layer) {
                if (tile.data.flags['monks-active-tiles']?.active) {
                    //check and see if the ray crosses a tile
                    let collision = tile.document.checkCollision(document, { x: update.x || document.data.x, y: update.y || document.data.y });

                    if (collision.length > 0) {
                        //if it does and the token needs to stop, then modify the end position in update
                        tile.document.checkStop(collision, update);
                        if (update.x == undefined && update.y == undefined) {
                            let checkcount = 0;
                            let stopanimate = window.setInterval(function () {
                                checkcount++;
                                if (token.stopAnimation() || checkcount > 20)
                                    window.clearInterval(stopanimate);
                            }, 10);
                        }

                        //either way, set the trigger to fire once the token animates to the spot on the tile
                        tile.document.trigger(document.object);

                        //also need to check if the token is entering or leaving the tile
                    }
                }
            }
        }
    }
});

Hooks.on('controlToken', (token, control) => {
    if (control)
        MonksActiveTiles.controlEntity(token);
})

Hooks.on('controlWall', (wall, control) => {
    if (control)
        MonksActiveTiles.controlEntity(wall);
})

Hooks.on('controlTile', (tile, control) => {
    if(control)
        MonksActiveTiles.controlEntity(tile);
})

Hooks.on('createToken', () => {
    log('token created');
});