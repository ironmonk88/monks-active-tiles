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
            name: "MonksActiveTiles.action.pause",
            options: { allowDelay: true },
            fn: (tile, token, action) => { game.togglePause(true, true); }
        },
        'movement': {
            name: "MonksActiveTiles.action.movement",
            stop: true,
            ctrls: [
                {
                    id: "snap",
                    name: "MonksActiveTiles.ctrl.snap",
                    type: "checkbox"
                }
            ],
            content: (trigger, action) => {
                return i18n(trigger.name) + (action.data.snap ? ' (' + i18n("MonksActiveTiles.ctrl.snap").toLowerCase() + ')' : '');
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
                }/*,
                {
                    id: "addmovement",
                    name: "Add bit of movement",
                    type: "checkbox"
                }*/
            ],
            fn: async (tile, token, action, userid) => {
                //move the token to the new square
                let newPos = {
                    x: action.data.location.x - (token.w / 2),
                    y: action.data.location.y - (token.h / 2)
                };
                if (action.data.location.sceneId == undefined || action.data.location.sceneId == canvas.scene.id) {
                    await token.stopAnimation();
                    if (!canvas.grid.hitArea.contains(newPos.x, newPos.y)) {
                        //+++find the closest spot on the edge
                        ui.notifications.error("MonksActiveTiles.msg.prevent-teleport");
                        return;
                    }
                    if (action.data.remotesnap)
                        newPos = canvas.grid.getSnappedPosition(newPos.x, newPos.y);

                    await token.document.update({ x: newPos.x, y: newPos.y }, { ignore: true, animate: false });
                    canvas.pan(newPos.x, newPos.y);
                } else {
                    //if the end spot is on a different scene then hide this token, check the new scene for a token for that actor and move it, otherwise create the token on the new scene
                    let scene = game.scenes.get(action.data.location.sceneId);
                    let xtoken = (token.actor?.id ? scene.tokens.find(t => { return t.actor?.id == token.actor?.id }) : null);

                    if (action.data.remotesnap) {
                        newPos.x = newPos.x.toNearest(scene.data.size);
                        newPos.y = newPos.y.toNearest(scene.data.size);
                    }

                    if (xtoken) {
                        xtoken.update({ x: newPos.x, y: newPos.y, hidden: token.data.hidden }, { ignore: true, animate: false });
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
                        canvas.pan(newPos.x, newPos.y, scale);
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
                let scene = game.scenes.find(s => s.id == action.data.location.sceneId);
                return i18n(trigger.name) + ' token to [' + action.data.location.x + ',' + action.data.location.y + ']'+ (scene ? ' Scene: ' + scene.name : '') + (action.data.remotesnap ? ' (snap to grid)' : '');
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
                    let entity;
                    if (action.data.entity.id == 'tile')
                        entity = [tile];
                    else if (action.data.entity.id == 'token')
                        entity = [token];
                    else if (action.data.entity.id == 'players') {
                        entity = canvas.tokens.placeables.filter(t => {
                            return t.actor != undefined && t.actor?.hasPlayerOwner && t.actor?.data.type != 'npc';
                        });
                    } else {
                        entity = await fromUuid(action.data.entity.id);
                        entity = [entity];
                    }
                    if (entity && entity.length > 0) {
                        //set or toggle visible
                        for (let e of entity) {
                            e.update({ hidden: (action.data.hidden == 'toggle' ? !e.data.hidden : action.data.hidden !== 'show') });
                        }
                    }
                } catch {

                }
            },
            content: (trigger, action) => {
                return i18n(trigger.values.hidden[action.data.hidden]) + ' ' + action.data.entity.name;
            }
        },
        'activate': {
            name: "MonksActiveTiles.action.activate",
            options: { showToken: false, showPlayers: false, allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return (entity instanceof Tile); }
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
                    'activate': "MonksActiveTiles.activate.activate",
                    'deactivate': "MonksActiveTiles.activate.deactivate"
                }
            },
            fn: async (tile, token, action) => {
                let entity;
                if (action.data.entity.id == 'tile')
                    entity = tile;
                else
                    entity = await fromUuid(action.data.entity.id);

                entity.setFlag('monks-active-tiles', 'active', action.data.activate == 'activate');
            },
            content: (trigger, action) => {
                return i18n(trigger.values.activate[action.data.activate]) + ' ' + action.data.entity.name;
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
                    let entity;
                    if (action.data.entity.id == 'tile')
                        entity = [tile];
                    else if (action.data.entity.id == 'token')
                        entity = [token];
                    else if (action.data.entity.id == 'players') {
                        entity = canvas.tokens.placeables.filter(t => {
                            return t.actor != undefined && t.actor?.hasPlayerOwner && t.actor?.data.type != 'npc';
                        });
                    }
                    else {
                        entity = await fromUuid(action.data.entity.id);
                        entity = [entity];
                    }

                    if (entity && entity.length > 0) {
                        for (let e of entity) {
                            let update = {};
                            let value = action.data.value;
                            if (action.data.value == 'true') value = true;
                            else if (action.data.value == 'false') value = false;
                            else if (action.data.value.startsWith('+ ') || action.data.value.startsWith('- ')) {
                                let base = getProperty(e.data, action.data.attribute);
                                value = eval(base + action.data.value);
                            }
                            update[action.data.attribute] = value;
                            e.update(update);
                        }
                    }
                } catch {

                }
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' ' + action.data.entity.name + ', ' + (action.data.value.startsWith('+ ') ? 'increase ' + action.data.attribute + ' by ' + action.data.value.substring(2) :
                    (action.data.value.startsWith('- ') ? 'decrease ' + action.data.attribute + ' by ' + action.data.value.substring(2) :
                        'set ' + action.data.attribute + ' to ' + action.data.value));
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
                    'all': "MonksActiveTiles.audiofor.all",
                    'gm': "MonksActiveTiles.audiofor.gm"
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
            options: { showTile: false, showToken: false, showPlayers: false, allowDelay: true },
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
                    'lock': "MonksActiveTiles.state.locked"
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
                return i18n(trigger.name) + ' to ' + i18n(trigger.values.state[action.data.state]);
            }
        },
        'notification': {
            name: 'Send Notification',
            options: { allowDelay: true },
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
            options: { allowDelay: true },
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
                let tokenOwners = Object.entries(token.actor.data.permission).filter(([k, v]) => { return v == CONST.ENTITY_PERMISSIONS.OWNER }).map(a => { return a[0]; });
                const speaker = ChatMessage.getSpeaker({ user: game.user.id });

                let messageData = {
                    user: game.user.id,
                    speaker: speaker,
                    type: CONST.CHAT_MESSAGE_TYPES.OOC,
                    content: action.data.text
                };

                if (action.data.for == 'gm')
                    messageData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
                else if (action.data.for == 'token') {
                    messageData.whisper = Array.from(new Set(ChatMessage.getWhisperRecipients("GM").map(u => u.id).concat(tokenOwners)));
                }

                ChatMessage.create(messageData);
            },
            content: (trigger, action) => {
                return i18n(trigger.name) + ' for ' + i18n(trigger.values.for[action.data.for]);
            }
        },
        /*'castspell': {
            name: 'Cast Spell',
            fn: (tile, token) => {
                //Figure out what spell needs to be cast
            }
        }*/
        'runmacro': {
            name: 'Run Macro',
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "macroid",
                    name: "Macro",
                    list: () => {
                        let result = {};
                        for (let macro of game.macros.contents) {
                            result[macro.id] = macro.name;
                        }
                        return result;
                    },
                    type: "list"
                }
            ],
            fn: async (tile, token, action) => {
                //Find the macro to be run, call it with the data from the trigger
                try {
                    let macro = game.macros.get(action.data.macroid);
                    if (macro instanceof Macro) {
                        macro.execute({ actor: token.actor, token: token });
                    }
                } catch{}
            },
            content: (trigger, action) => {
                let macro = game.macros.get(action.data.macroid);
                return i18n(trigger.name) + ', ' + macro?.name;
            }
        },
        'rolltable': {
            name: 'Roll Table',
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "rolltableid",
                    name: "Select Roll Table",
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
                    let rolltable = game.tables.get(action.data.rolltableid);
                    if (rolltable instanceof RollTable) {
                        //Make a roll
                        let result = rolltable.draw();
                        //Check to see what the privacy rules are
                    }
                } catch{ }
            },
            content: (trigger, action) => {
                let rolltable = game.tables.get(action.data.rolltableid);
                return i18n(trigger.name) + ', ' + rolltable?.name;
            }
        }
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
                let update = { x: parseInt(pos.x), y: parseInt(pos.y), sceneId: (canvas.scene.id != MonksActiveTiles.waitingInput.options.parent.object.parent.id ? canvas.scene.id : null ) };
                MonksActiveTiles.waitingInput.updateSelection(update);
            }
            oldClickLeft.call(this, event);
        }
    }

    static async onMessage(data) {
        switch (data.action) {
            case 'trigger': {
                if (game.user.isGM) {
                    let token = await fromUuid(data.tokenid);
                    let tile = await fromUuid(data.tileid);

                    tile.trigger(token.object);
                }
            } break;
            case 'switchview': {
                if (game.user.id == data.userid) {
                    let scene = game.scenes.get(data.sceneid);
                    await scene.view();
                    canvas.pan(data.pos.x, data.pos.y, data.pos.scale);
                }
            } break;
        }
    }

    static controlEntity(entity) {
        if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') {
            let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
            if (restrict && !restrict(entity)) {
                ui.notifications.error('Invalid entity type');
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
                let inTile = !(tokenPos.x < this.object.x || tokenPos.x > this.object.x + this.object.width || tokenPos.y < this.object.y || tokenPos.y > this.object.y + this.object.height);

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

        TileDocument.prototype.trigger = function (token, userid = game.user.id) {
            if (game.user.isGM) {
                //A token has triggered this tile, what actions do we need to do
                let actions = this.data.flags["monks-active-tiles"]?.actions || [];
                for (let action of actions) {
                    let fn = MonksActiveTiles.triggerActions[action.action]?.fn;
                    if (fn) {
                        if (action.delay > 0) {
                            window.setTimeout(function () {
                                fn.call(this, this, token, action);
                            }, action.delay * 1000);
                        } else
                            fn.call(this, this, token, action, userid);
                    }
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
            return (stoppage.length == 0 ? false : (stoppage.find(a => a.data.snap) ? 'snap' : true));
        }
    }
}

Hooks.on('init', async () => {
    MonksActiveTiles.init();
})

Hooks.on('ready', () => {
    game.socket.on(MonksActiveTiles.SOCKET, MonksActiveTiles.onMessage);
});

Hooks.on('canvasInit', () => {
    let activehud = WithActiveTileHUD(canvas.hud.tile.constructor);
    canvas.hud.tile = new activehud();
});

Hooks.on('preUpdateToken', (document, update, options, userId) => { 
    //make sure to ignore if the token is being dropped somewhere, otherwise we could end up triggering a lot of tiles
    if ((update.x != undefined || update.y != undefined) && options.ignore !== true && options.animate) {
        let token = document.object;
        //Does this cross a tile
        for (let layer of [canvas.background.tiles, canvas.foreground.tiles]) {
            for (let tile of layer) {
                if (tile.data.flags['monks-active-tiles']?.active) {
                    //check and see if the ray crosses a tile
                    let collision = tile.document.checkCollision(document, { x: update.x || document.data.x, y: update.y || document.data.y });
                    if (collision.length > 0) {
                        let triggerPt = tile.document.canTrigger(document.object, collision);
                        if (triggerPt) {
                            //if it does and the token needs to stop, then modify the end position in update
                            let ray = new Ray({ x: token.data.x, y: token.data.y }, { x: triggerPt.x, y: triggerPt.y });

                            let stop = tile.document.checkStop();
                            if (stop) {
                                //check for snapping to the closest grid spot
                                if (stop == 'snap')
                                    triggerPt = canvas.grid.getSnappedPosition(triggerPt.x, triggerPt.y);

                                //if this token needs to be stopped, then we need to adjust the path, and force close the movement animation
                                let oldPos = { x: update.x, y: update.y };
                                delete update.x;
                                delete update.y;
                                
                                let checkcount = 0;
                                let stopanimate = window.setInterval(function () {
                                    checkcount++;
                                    let sa = CanvasAnimation.animations[`Token.${document.id}.animateMovement`] != undefined;
                                    token.stopAnimation();
                                    if (sa || checkcount > 20) {
                                        window.clearInterval(stopanimate);
                                        //add a new animation to the new spot
                                        document.update({ x: triggerPt.x, y: triggerPt.y });
                                    }
                                }, 10);
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

Hooks.on('updateScene', () => {
    log('scene updated');
})