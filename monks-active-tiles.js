import { registerSettings } from "./settings.js";
import { WithActiveTileConfig } from "./apps/active-tile-config.js"
import { ActionConfig } from "./apps/action-config.js";

export let debug = (...args) => {
    if (MonksActiveTiles.debugEnabled > 1) console.log("DEBUG: monks-active-tiles | ", ...args);
};
export let log = (...args) => console.log("monks-active-tiles | ", ...args);
export let warn = (...args) => {
    if (MonksActiveTiles.debugEnabled > 0) console.warn("monks-active-tiles | ", ...args);
};
export let error = (...args) =>
    console.error("monks-active-tiles | ", ...args);
export let i18n = key => {
    return game.i18n.localize(key);
};
export let actiontext = (key, props) => {
    let text = game.i18n.format(key, props)
        .replace('<action>', '<span class="action-style">')
        .replace('</action>', '</span>')
        .replace('<detail>', '<span class="details-style">')
        .replace('</detail>', '</span>');
    return text;
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
    //static _rejectRemaining = {};
    static savestate = {};
    static debugEnabled = 1;

    static _slotmachine = {};

    static timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static emit(action, args = {}) {
        args.action = action;
        args.senderId = game.user.id
        game.socket.emit( MonksActiveTiles.SOCKET, args, (resp) => { } );
    }

    static get triggerModes() {
        return {
            'enter': i18n("MonksActiveTiles.mode.enter"),
            'exit': i18n("MonksActiveTiles.mode.exit"),
            'both': i18n("MonksActiveTiles.mode.both"),
            'movement': i18n("MonksActiveTiles.mode.movement"),
            'stop': i18n("MonksActiveTiles.mode.stop"),
            'elevation': i18n("MonksActiveTiles.mode.elevation"),
            'click': i18n("MonksActiveTiles.mode.click"),
            'rightclick': i18n("MonksActiveTiles.mode.rightclick"),
            'dblclick': i18n("MonksActiveTiles.mode.dblclick"),
            'hover': i18n("MonksActiveTiles.mode.hover"),
            'hoverin': i18n("MonksActiveTiles.mode.hoverin"),
            'hoverout': i18n("MonksActiveTiles.mode.hoverout"),
            'combatstart': i18n("MonksActiveTiles.mode.combatstart"),
            'round': i18n("MonksActiveTiles.mode.round"),
            'turn': i18n("MonksActiveTiles.mode.turn"),
            'turnend': i18n("MonksActiveTiles.mode.turnend"),
            'combatend': i18n("MonksActiveTiles.mode.combatend"),
            'ready': i18n("MonksActiveTiles.mode.canvasready"),
            'manual': i18n("MonksActiveTiles.mode.manual")
        }
    };

    static triggerGroups = {
        'actions': { name: 'MonksActiveTiles.group.actions', 'default': true },
        'filters': { name: 'MonksActiveTiles.group.filters' },
        'logic': { name: 'MonksActiveTiles.group.logic' }
    }

    static triggerActions = {
        'pause': {
            name: "MonksActiveTiles.action.pause",
            //options: { allowDelay: true },
            ctrls: [
                {
                    id: "pause",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "state",
                    type: "list"
                }
            ],
            values: {
                'state': {
                    'pause': "MonksActiveTiles.pause.pause",
                    'unpause': "MonksActiveTiles.pause.unpause"
                }
            },
            fn: (args = {}) => {
                const { action } = args;
                // Remove this if Foundry every fixes the togglePause issue
                if (action?.data?.pause == 'unpause' && !game.data.paused)
                    return;
                game.togglePause((action?.data?.pause !== 'unpause'), true);
            },
            content: async (trigger, action) => {
                return actiontext("MonksActiveTiles.actiontext.pause", { pause: i18n(trigger.values.state[action?.data?.pause || 'pause']) });
            }
        },
        'delay': {
            name: "MonksActiveTiles.action.delay",
            group: "logic",
            ctrls: [
                {
                    id: "delay",
                    name: "MonksActiveTiles.ctrl.delay",
                    type: "text",
                    required: true
                }
            ],
            fn: (args = {}) => {
                const { action, tile } = args;

                let times = ("" + action.data.delay).split(',').map(d => d.trim());
                let time = times[Math.floor(Math.random() * times.length)];

                if (time.indexOf('-') != -1) {
                    let parts = time.split('-');
                    time = (Math.floor(Math.random() * (parseFloat(parts[1]) - parseFloat(parts[0]))) + parseFloat(parts[0])) * 1000;
                } else
                    time = parseFloat(time) * 1000;

                if (time > 0) {
                    window.setTimeout(function () {
                        tile.resumeActions(args._id);
                    }, time);
                }

                return { pause: true };
            },
            content: async (trigger, action) => {
                return actiontext("MonksActiveTiles.actiontext.delay", action.data);
            }
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
            content: async (trigger, action) => {
                return actiontext("MonksActiveTiles.actiontext.movement",
                    {
                        action: i18n(trigger.name),
                        snap: MonksActiveTiles.getActionFlag(action.data?.snap, 'snap')
                    });
            }
        },
        'pancanvas': {
            name: "MonksActiveTiles.action.pancanvas",
            ctrls: [
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "position",
                    options: { showToken: true, showPlayers: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Tile || entity instanceof Token); },
                    required: true
                },
                {
                    id: "animate",
                    name: "MonksActiveTiles.ctrl.animate",
                    type: "checkbox",
                    onClick: (app) => {
                        app.checkConditional();
                    }
                },
                {
                    id: "duration",
                    name: "MonksActiveTiles.ctrl.duration",
                    type: "number",
                    defvalue: 1,
                    min: 0.05,
                    max: null,
                    step: 0.05,
                    conditional: (app) => { return $('input[name="data.animate"]', app.element).prop("checked") }
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
                    'gm': "MonksActiveTiles.showto.gm",
                    'players': "MonksActiveTiles.showto.players",
                    'token': "MonksActiveTiles.showto.trigger"

                }
            },
            fn: async (args = {}) => {
                const { tile, action, userid, value } = args;
                let panfor = action.data.panfor || 'trigger';

                let dests = await MonksActiveTiles.getLocation.call(tile, action.data.location, value, null, userid);
                dests = (dests instanceof Array ? dests : [dests]);

                for (let dest of dests) {
                    if (dest.scene != undefined && dest.scene != canvas.scene.id)
                        return;

                    dest.duration = (action.data?.duration ?? 1) * 1000;

                    if (isNaN(dest.x) && (dest.x.startsWith("+") || dest.x.startsWith("-"))) {
                        dest.x = parseInt(eval(`${canvas.scene._viewPosition.x} ${dest.x}`));
                    }
                    if (isNaN(dest.y) && (dest.y.startsWith("+") || dest.y.startsWith("-"))) {
                        dest.y = parseInt(eval(`${canvas.scene._viewPosition.y} ${dest.y}`));
                    }

                    if (panfor != "gm")
                        MonksActiveTiles.emit('pan', { userid: (panfor == 'token' ? userid : null), animate: action.data.animate, x: dest.x, y: dest.y, scale: dest.scale, duration: dest.duration });

                    if (panfor != "players") {
                        if (action.data.animate) {
                            await canvas.animatePan(dest);
                        }
                        else
                            canvas.pan(dest);
                    }
                }
            },
            content: async (trigger, action) => {
                let locationName = await MonksActiveTiles.locationName(action.data?.location);
                return `<span class="action-style">${i18n(trigger.name)}</span> to <span class="details-style">"${locationName}"</span> for <span class="value-style">&lt;${i18n(trigger.values.panfor[action.data?.panfor])}&gt;</span>${(action.data.animate ? ' <i class="fas fa-sign-in-alt" title="Animate"></i>' : '')}`;
            }
        },
        'teleport': {
            name: "MonksActiveTiles.action.teleport",
            options: { allowDelay: true },
            stop:true,
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "either",
                    //onChange: (app) => {
                    //    app.checkConditional();
                    //},
                    options: { showTagger: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Tile); },
                    required: true,
                    placeholder: 'Select a location or Tile'
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
                    type: "checkbox",
                    help: "If you are teleporting between scenes select this to remove the token on the previous scene.",
                    //conditional: (app) => {
                    //    let location = JSON.parse($('input[name="data.location"]', app.element).val() || "{}");
                    //    return !!location.sceneId;
                    //}
                },
                {
                    id: "preservesettings",
                    name: "MonksActiveTiles.ctrl.preservesettings",
                    type: "checkbox",
                    help: "If you are teleporting between scenes and want to keep the settings for the tokens on that scene."
                    //conditional: (app) => {
                    //    let location = JSON.parse($('input[name="data.location"]', app.element).val() || "{}");
                    //    return !!location.sceneId;
                    //}
                },
                {
                    id: "avoidtokens",
                    name: "MonksActiveTiles.ctrl.avoidtokens",
                    type: "checkbox"
                }
            ],
            fn: async (args = {}) => {
                const { tile, action, userid, value } = args;

                let entities = await MonksActiveTiles.getEntities(args);

                if (!entities || entities.length == 0) {
                    log(i18n('MonksActiveTiles.msg.noteleporttoken'));
                    return;
                }

                let result = { continue: true, tokens: entities, entities: entities };

                for (let tokendoc of entities) {
                    let tokenWidth = ((tokendoc.parent.dimensions.size * Math.abs(tokendoc.data.width)) / 2);
                    let tokenHeight = ((tokendoc.parent.dimensions.size * Math.abs(tokendoc.data.height)) / 2);

                    let oldPos = {
                        x: tokendoc.data.x + tokenWidth,
                        y: tokendoc.data.y + tokenHeight
                    }

                    let dest = await MonksActiveTiles.getLocation.call(tile, action.data.location, value);
                    if (!dest)
                        continue;

                    if (dest instanceof Array)
                        dest = dest[0];

                    if (isNaN(dest.x) && (dest.x.startsWith("+") || dest.x.startsWith("-"))) {
                        dest.x = parseInt(eval(`${tokendoc.data.x} ${dest.x}`));
                    }
                    if (isNaN(dest.y) && (dest.y.startsWith("+") || dest.y.startsWith("-"))) {
                        dest.y = parseInt(eval(`${tokendoc.data.y} ${dest.y}`));
                    }

                    //move the token to the new square
                    let newPos = {
                        x: dest.x,
                        y: dest.y
                    };

                    let samescene = (dest.scene == undefined || dest.scene == tokendoc.parent.id);
                    await tokendoc.setFlag('monks-active-tiles', 'teleporting', true);

                    if (samescene) {
                        await tokendoc._object?.stopAnimation();   //+++ need to stop the animation for everyone, even if they're not on the same scene
                        if (!tokendoc.parent.dimensions.rect.contains(newPos.x, newPos.y)) {
                            //+++find the closest spot on the edge of the scene
                            ui.notifications.error(i18n("MonksActiveTiles.msg.prevent-teleport"));
                            return;
                        }

                        //find a vacant spot
                        if (action.data.avoidtokens)
                            newPos = MonksActiveTiles.findVacantSpot(newPos, tokendoc, tokendoc.parent, dest, action.data.remotesnap);

                        newPos.x -= tokenWidth;
                        newPos.y -= tokenHeight;

                        if (action.data.remotesnap) {
                            newPos.x = newPos.x.toNearest(tokendoc.parent.dimensions.size);
                            newPos.y = newPos.y.toNearest(tokendoc.parent.dimensions.size);
                        }

                        //fade in backdrop
                        if (userid != game.user.id && setting('teleport-wash')) {
                            MonksActiveTiles.emit('fade', { userid: userid });
                            await MonksActiveTiles.timeout(400);
                        }

                        let offset = { dx: oldPos.x - newPos.x, dy: oldPos.y - newPos.y };
                        await tokendoc.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: false, teleport: true });

                        if (userid != game.user.id)
                            MonksActiveTiles.emit('offsetpan', { userid: userid, animatepan: action.data.animatepan, x: offset.dx - (Math.abs(tokendoc.data.width) / 2), y: offset.dy - (Math.abs(tokendoc.data.height) / 2) });
                    } else {
                        result.tokens = [];
                        //if the end spot is on a different scene then hide this token, check the new scene for a token for that actor and move it, otherwise create the token on the new scene

                        if (userid != game.user.id && setting('teleport-wash')) {
                            MonksActiveTiles.emit('fade', { userid: userid, time: 1000 });
                            //await MonksActiveTiles.timeout(400);
                        }

                        let scene = game.scenes.get(dest.scene);
                        let newtoken = (tokendoc.actor?.id ? scene.tokens.find(t => { return t.actor?.id == tokendoc.actor?.id }) : null);

                        //find a vacant spot
                        if (action.data.avoidtokens)
                            newPos = MonksActiveTiles.findVacantSpot(newPos, tokendoc, scene, dest, action.data.remotesnap);

                        newPos.x -= tokenWidth;
                        newPos.y -= tokenHeight;

                        if (action.data.remotesnap) {
                            newPos.x = newPos.x.toNearest(scene.data.size);
                            newPos.y = newPos.y.toNearest(scene.data.size);
                        }

                        const td = mergeObject(await tokendoc.toObject(), { x: newPos.x, y: newPos.y });
                        if (newtoken) {
                            await newtoken.update((action.data.preservesettings ? { x: newPos.x, y: newPos.y, hidden: tokendoc.data.hidden } : td), { bypass: true, animate: false, teleport: true });
                        }
                        else {
                            const cls = getDocumentClass("Token");
                            newtoken = await cls.create(td, { parent: scene });
                        }

                        await newtoken.unsetFlag('monks-active-tiles', 'teleporting');

                        let oldhidden = tokendoc.data.hidden;
                        if (action.data.deletesource)
                            tokendoc.delete();
                        else
                            tokendoc.update({ hidden: true });   //hide the old one
                        newtoken.update({ hidden: oldhidden, img: tokendoc.data.img });   //preserve the image, and hiddenness of the old token
                        //tokendoc = newtoken;
                        //let scale = canvas.scene._viewPosition.scale;

                        let owners = game.users.filter(u => {
                            return !u.isGM && u.character && u.character.id == tokendoc.actor?.id;
                        }).map(u => u.id);
                        if (!game.user.isGM && userid != game.user.id && !owners.includes(game.user.id))
                            owners.push(game.user.id);
                        if (owners.length) {
                            //pass this back to the player
                            MonksActiveTiles.emit('switchview', { userid: [owners], sceneid: scene.id, newpos: newPos, oldpos: oldPos });
                        }
                        ui.notifications.warn(`${tokendoc.name} has teleported to ${scene.name}`);

                        result.tokens.push(newtoken);
                    }
                    if (tokendoc && (samescene || !action.data.deletesource))
                        await tokendoc.unsetFlag('monks-active-tiles', 'teleporting');
                }

                window.setTimeout(async function () {
                    for (let tokendoc of entities) {
                        try {
                            await tokendoc.unsetFlag('monks-active-tiles', 'teleporting');
                        } catch {}
                    }
                }, 2000);

                return result;
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let locationName = await MonksActiveTiles.locationName(action.data?.location);               
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span> to <span class="details-style">"${locationName}"</span>${(action.data?.remotesnap ? ' <i class="fas fa-compress" title="Snap to grid"></i>' : '')}${(action.data.animatepan ? ' <i class="fas fa-sign-in-alt" title="Animate Pan"></i>' : '')}`;
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
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => {
                        return (
                            entity instanceof Token ||
                            entity instanceof Tile ||
                            entity instanceof Drawing ||
                            entity instanceof AmbientLight ||
                            entity instanceof AmbientSound ||
                            entity instanceof Note);
                    }
                },
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "either",
                    options: { showTagger: true, showToken: true, showOrigin: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Tile && this.scene.id == entity.parent.id) || this.scene.id == entity.id; },
                    required: true
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
                },
                {
                    id: "trigger",
                    name: "MonksActiveTiles.ctrl.triggertiles",
                    type: "checkbox"
                }
            ],
            fn: async (args = {}) => {
                const { tile, action, value, pt } = args;
                //wait for animate movement
                let entities = await MonksActiveTiles.getEntities(args);
                    
                if (entities && entities.length > 0) {
                    let dests = await MonksActiveTiles.getLocation.call(tile, action.data.location, value, pt);
                    for (let dest of dests) {
                        //set or toggle visible
                        for (let entity of entities) {
                            let object = entity.object;
                            if (object instanceof Token)
                                await object.stopAnimation();
                            else
                                await CanvasAnimation.terminateAnimation(`${entity.documentName}.${entity.id}.animateMovement`);

                            let entDest = duplicate(dest);
                            if (isNaN(entDest.x) && (entDest.x.startsWith("+") || entDest.x.startsWith("-"))) {
                                entDest.x = parseInt(eval(`${entity.data.x} ${entDest.x}`));
                                action.data.location.id = "origin";
                            }
                            if (isNaN(entDest.y) && (entDest.y.startsWith("+") || entDest.y.startsWith("-"))) {
                                entDest.y = parseInt(eval(`${entity.data.y} ${entDest.y}`));
                                action.data.location.id = "origin";
                            }

                            let newPos = {
                                x: entDest.x - (action.data?.location?.id == "origin" ? 0 : ((object.w || object.width) / 2)),
                                y: entDest.y - (action.data?.location?.id == "origin" ? 0 : ((object.h || object.height) / 2))
                            };

                            if (!canvas.grid.hitArea.contains(newPos.x, newPos.y)) {
                                //+++find the closest spot on the edge of the scene
                                ui.notifications.error(i18n("MonksActiveTiles.msg.prevent-teleport"));
                                return;
                            }
                            if (action.data.snap)
                                newPos = canvas.grid.getSnappedPosition(newPos.x, newPos.y);

                            if (object instanceof Token) {
                                if (action.data.wait) {
                                    await object.setPosition(newPos.x, newPos.y);
                                    await entity.update({ x: newPos.x, y: newPos.y }, { bypass: !action.data.trigger, animate: false });
                                } else
                                    entity.update({ x: newPos.x, y: newPos.y }, { bypass: !action.data.trigger, animate: true });
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

                                MonksActiveTiles.emit("move", { entityid: entity.uuid, x: newPos.x, y: newPos.y });
                                if (action.data.wait)
                                    await animate().then(async () => { await entity.update({ x: newPos.x, y: newPos.y }); });
                                else
                                    animate().then(async () => { await entity.update({ x: newPos.x, y: newPos.y }); });
                            }
                        }
                    }

                    let result = { entities: entities };
                    if (entities[0] instanceof TokenDocument)
                        result.tokens = entities;
                    return result;
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let locationName = await MonksActiveTiles.locationName(action.data?.location);
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span> to <span class="details-style">"${locationName}"</span>${(action.data?.snap ? ' <i class="fas fa-compress" title="Snap to grid"></i>' : '')}${(action.data?.wait ? ' <i class="fas fa-clock" title="Wait until finished"></i>' : '')}${(action.data?.trigger ? ' <i class="fas fa-running" title="Trigger tiles while moving"></i>' : '')}`;
            }
        },
        'showhide': {
            name: "MonksActiveTiles.action.showhide",
            requiresGM: true,
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Tile || entity instanceof Drawing); }
                },
                {
                    id: "collection",
                    name: "Collection",
                    list: "collection",
                    type: "list",
                    onChange: (app, ctrl) => {
                        $('input[name="data.entity"]', app.element).next().html('Current collection of ' + $(ctrl).val());
                    },
                    conditional: (app) => {
                        let entity = JSON.parse($('input[name="data.entity"]', app.element).val() || "{}");
                        return entity?.id == 'previous';
                    },
                    defvalue: 'tokens'
                },
                {
                    id: "hidden",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "hidden",
                    type: "list",
                    defvalue: 'hide'
                },
                {
                    id: "fade",
                    name: "MonksActiveTiles.ctrl.fade",
                    type: "number",
                    min: 0,
                    step: 0.05,
                    defvalue: 0
                }
            ],
            values: {
                'hidden': {
                    'show': "MonksActiveTiles.hidden.show",
                    'hide': "MonksActiveTiles.hidden.hide",
                    'toggle': "MonksActiveTiles.hidden.toggle"
                },
                'collection': {
                    'tokens': "Tokens",
                    'tiles': "Tiles",
                    'drawings': "Drawings"
                }
            },
            fn: async (args = {}) => {
                const { action } = args;
                //find the item in question
                let entities = await MonksActiveTiles.getEntities(args, action.data?.collection || "tokens");

                if (entities && entities.length > 0) {
                    //set or toggle visible
                    let result = { entities: entities };
                    for (let entity of entities) {
                        if (entity) {
                            let hide = (action.data.hidden == 'toggle' ? !entity.data.hidden : (action.data.hidden == 'previous' ? !value.visible : action.data.hidden !== 'show'));
                            if (action.data?.fade) {
                                let icon = entity.object.icon || entity.object.tile || entity.object;
                                const attributes = [
                                    { parent: icon, attribute: 'alpha', to: (hide ? 0.5 : entity.data.alpha) }
                                ];

                                //if (!hide)
                                //    icon.alpha = 0.5;

                                let animationName = `MonksActiveTiles.${entity.documentName}.${entity.id}.animateShowHide`;
                                await CanvasAnimation.terminateAnimation(animationName);

                                CanvasAnimation.animateLinear(attributes, {
                                    name: animationName,
                                    context: icon,
                                    duration: action.data?.fade * 1000
                                }).then(() => {
                                    entity.update({ hidden: hide });
                                });

                                MonksActiveTiles.emit("showhide", { entityid: entity.uuid, time: new Date().getTime() + (action.data?.fade * 1000), hide: hide });
                            } else
                                await entity.update({ hidden: hide });

                            MonksActiveTiles.addToResult(entity, result);
                        }
                    }
                   
                    return result;
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="action-style">${i18n(trigger.values.hidden[action.data?.hidden])}</span> <span class="entity-style">${entityName}<span>`;
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
                    restrict: (entity) => { return (entity instanceof Actor || entity instanceof JournalEntry || entity instanceof Note); },
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    required: true,
                    defaultType: 'actors',
                    placeholder: 'Please select an Actor or Encounter to create'
                },
                {
                    id: "collection",
                    name: "Collection",
                    list: "collection",
                    type: "list",
                    onChange: (app, ctrl) => {
                        $('input[name="data.entity"]', app.element).next().html('Current collection of ' + $(ctrl).val());
                    },
                    conditional: (app) => {
                        let entity = JSON.parse($('input[name="data.entity"]', app.element).val() || "{}");
                        return entity?.id == 'previous';
                    },
                    defvalue: 'actors'
                },
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "either",
                    options: { showTagger: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Tile && this.scene.id == entity.parent.id) || this.scene.id == entity.id; },
                    required: true
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
                },
                {
                    id: "avoidtokens",
                    name: "MonksActiveTiles.ctrl.avoidtokens",
                    type: "checkbox"
                }
            ],
            values: {
                'collection': {
                    'actors': "Actors",
                    'journals': "Journal Entries"
                }
            },
            fn: async (args = {}) => {
                const { tile, action, value } = args;
                //find the item in question
                let entities = await MonksActiveTiles.getEntities(args, action.data?.collection || 'actors');

                if (entities && entities.length > 0) {
                    let dests = await MonksActiveTiles.getLocation.call(tile, action.data.location, value);
                    dests = (dests instanceof Array ? dests : [dests]);

                    const actors = [];
                    for (let entity of entities) {
                        if (entity instanceof NoteDocument) {
                            if (action.data.location.id == "previous") {
                                dests = [{x: entity.data.x, y: entity.data.y}];
                            }
                            entity = entity.entry;
                        }
                        if (entity instanceof JournalEntry) {

                            if ((entity.data.flags["monks-enhanced-journal"]?.actors || []).length && game.modules.get("monks-enhanced-journal")?.active) {
                                for (let ea of (entity.data.flags['monks-enhanced-journal']?.actors || [])) {
                                    let actor;
                                    if (ea.pack) {
                                        const pack = game.packs.get(ea.pack);
                                        let id = ea.id;
                                        if (ea.lookup) {
                                            if (!pack.index.length) await pack.getIndex();
                                            const entry = pack.index.find(i => (i._id === ea.lookup) || (i.name === ea.lookup));
                                            id = entry.id;
                                        }
                                        actor = id ? await pack.getDocument(id) : null;
                                    } else {
                                        actor = game.actors.get(ea.id);
                                    }

                                    if (actor) {
                                        let quantity = String(ea.quantity || "1");
                                        if (quantity.indexOf("d") != -1) {
                                            let r = new Roll(quantity);
                                            await r.evaluate({ async: true });
                                            quantity = r.total;
                                        } else {
                                            quantity = parseInt(quantity);
                                            if (isNaN(quantity)) quantity = 1;
                                        }

                                        for (let i = 0; i < (quantity || 1); i++) {
                                            let dest = dests[Math.floor(Math.random() * dests.length)];
                                            let data = {
                                                x: dest.x,
                                                y: dest.y,
                                                hidden: action.data.invisible || ea.hidden
                                            };

                                            actors.push({ data, actor });
                                        }
                                    }
                                }
                            } else if (entity.data.flags["quick-encounters"]?.quickEncounter && game.modules.get("quick-encounters")?.active) {
                                try {
                                    let data = JSON.parse(entity.data.flags["quick-encounters"]?.quickEncounter);

                                    for (let ea of (data.extractedActors || [])) {
                                        let actor;
                                        if (ea.dataPackName) {
                                            const pack = game.packs.get(ea.dataPackName);
                                            let id = ea.actorID;
                                            if (ea.lookup) {
                                                if (!pack.index.length) await pack.getIndex();
                                                const entry = pack.index.find(i => (i._id === ea.lookup) || (i.name === ea.lookup));
                                                id = entry.id;
                                            }
                                            actor = id ? await pack.getDocument(id) : null;
                                        } else {
                                            actor = game.actors.get(ea.actorID);
                                        }

                                        if (actor) {
                                            for (let i = 0; i < ea.numActors; i++) {
                                                let sa = ea.savedTokensData[i] || {};
                                                sa.hidden = sa.hidden || action.data.invisible;
                                                sa.lockpos = true;
                                                if ((action.data.location.id == "previous" && value.location == undefined && ea.savedTokensData[i] == undefined)
                                                    || sa.x == undefined
                                                    || sa.y == undefined) {
                                                    let dest = dests[Math.floor(Math.random() * dests.length)];
                                                    if (dest) {
                                                        sa.x = dest.x;
                                                        sa.y = dest.y;
                                                        sa.dest = dest;
                                                    }
                                                    sa.lockpos = false;
                                                }
                                                actors.push({ data: sa, actor });
                                            }
                                        }
                                    }
                                } catch (err) {
                                    log(err);
                                }
                            }
                        } else if (entity instanceof Actor) {
                            let dest = dests[Math.floor(Math.random() * dests.length)];
                            let data = {
                                x: dest.x,
                                y: dest.y,
                                dest: dest,
                                hidden: action.data.invisible
                            };
                            actors.push({ data, actor: entity });
                        }
                    };
                    
                    let result = { continue: true, tokens: [], entities: entities };
                    for (let ad of actors) {
                        let actor = ad.actor;

                        if (actor.compendium) {
                            const actorData = game.actors.fromCompendium(actor);
                            actor = await Actor.implementation.create(actorData);
                        }

                        // Prepare the Token data
                        const td = await actor.getTokenData(ad.data);

                        if (!ad.data.lockpos) {
                            if (action.data.avoidtokens) {
                                let dt = mergeObject(ad.data, MonksActiveTiles.findVacantSpot(ad.data, { data: td }, tile.parent, ad.dest, action.data.snap));
                                td.x = dt.x;
                                td.y = dt.y;
                            }

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
                        }

                        // Validate the final position
                        if (!canvas.dimensions.rect.contains(td.x, td.y)) continue;

                        // Submit the Token creation request and activate the Tokens layer (if not already active)
                        const cls = getDocumentClass("Token");
                        let tkn = await cls.create(td, { parent: tile.parent });

                        if (td.hidden)
                            tkn.update({ hidden: true });

                        result.tokens.push(tkn);
                    }
                    return result;
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'actors');
                let locationName = await MonksActiveTiles.locationName(action.data?.location);
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span> at <span class="details-style">"${locationName}"</span>${(action.data?.snap ? ' <i class="fas fa-compress" title="Snap to grid"></i>' : '')}${(action.data?.invisible ? ' <i class="fas fa-eye-slash" title="Invisible"></i>' : '')}`;
            }
        },
        'createjournal': {
            name: "MonksActiveTiles.action.createjournal",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showPrevious: true },
                    restrict: (entity) => { return (entity instanceof JournalEntry); },
                    required: true,
                    defaultType: 'journal',
                    placeholder: 'Please select a Journal Entry to add to the canvas'
                },
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "either",
                    restrict: (entity) => { return (entity instanceof Tile && this.scene.id == entity.parent.id) || this.scene.id == entity.id; },
                    required: true
                },
                {
                    id: "icon",
                    name: "MonksActiveTiles.ctrl.icon",
                    list: () => {
                        let list = {};
                        Object.entries(CONFIG.JournalEntry.noteIcons).filter(([k, v]) => { list[v] = k; });
                        return list;
                    },
                    type: "list",
                    defvalue: 'icons/svg/book.svg'
                },
                {
                    id: "snap",   //using remote snap because I don't want this to trigger the token to be snapped to the grid on the tile
                    name: "MonksActiveTiles.ctrl.snap",
                    type: "checkbox",
                    defvalue: true
                }
            ],
            fn: async (args = {}) => {
                const { tile, action, value } = args;
                //find the item in question
                let entities = await MonksActiveTiles.getEntities(args, 'actors');

                if (entities && entities.length > 0) {
                    let entry = entities[0];
                    let dest = await MonksActiveTiles.getLocation.call(tile, action.data.location, value);
                    if (dest instanceof Array) dest = dest[0];

                    let result = { continue: true, journal: [entry], entities: [] };

                    if (entry instanceof JournalEntry) {
                        let data = {
                            x: dest.x,
                            y: dest.y,
                            entryId: entry.id,
                            icon: action.data.icon
                        };

                        // Snap to Grid
                        if (action.data.snap) {
                            let snap = canvas.grid.getSnappedPosition(data.x, data.y, canvas.notes.gridPrecision);
                            data.x = snap.x;
                            data.y = snap.y;
                        }

                        // Validate the final position
                        if (!canvas.dimensions.rect.contains(data.x, data.y)) return;

                        // Submit the Token creation request and activate the Tokens layer (if not already active)
                        const cls = getDocumentClass("Note");
                        let note = await cls.create(data, { parent: tile.parent });

                        result.entities.push(note);
                    }
                    return result;
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'journal');
                let locationName = await MonksActiveTiles.locationName(action.data?.location);
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span> at <span class="details-style">"${locationName}"</span>${(action.data?.snap ? ' <i class="fas fa-compress" title="Snap to grid"></i>' : '')}`;
            }
        },
        'activate': {
            name: "MonksActiveTiles.action.activate",
            requiresGM: true,
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true, showTagger: true },
                    restrict: (entity) => {
                        return (entity instanceof Tile || entity instanceof AmbientLight || entity instanceof AmbientSound || entity.terrain != undefined);
                    },
                    defaultType: 'tiles'
                },
                {
                    id: "activate",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "activate",
                    type: "list",
                    defvalue: 'deactivate'
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
                let entities = await MonksActiveTiles.getEntities(args, 'tiles');
                if (entities.length == 0)
                    return;

                for (let entity of entities) {
                    if (entity) {
                        if (entity instanceof AmbientLightDocument || entity instanceof AmbientSoundDocument || entity._object?.terrain != undefined)
                            await entity.update({ hidden: (action.data.activate == 'toggle' ? !entity.data.hidden : (action.data.activate == 'previous' ? !value.activate : action.data.activate != 'activate')) });
                        else if (entity instanceof TileDocument)
                            await entity.setFlag('monks-active-tiles', 'active', (action.data.activate == 'toggle' ? !entity.getFlag('monks-active-tiles', 'active') : (action.data.activate == 'previous' ? !value.activate : action.data.activate == 'activate')));
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                return `<span class="action-style">${i18n(trigger.values.activate[action.data?.activate])}</span> <span class="entity-style">${entityName}</span>`;
            }
        },
        'alter': {
            name: "MonksActiveTiles.action.alter",
            requiresGM: true,
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true }
                },
                {
                    id: "attribute",
                    name: "MonksActiveTiles.ctrl.attribute",
                    type: "text",
                    required: true,
                    help: "separate multiple updates with a ;"
                },
                {
                    id: "value",
                    name: "MonksActiveTiles.ctrl.value",
                    type: "text",
                    required: true,
                    onBlur: (app) => {
                        app.checkConditional();
                    },
                    check: (app) => {
                        let countAttr = $('input[name="data.attribute"]', app.element).val().split(";").map(v => v != "").filter(v => v).length;
                        let countVal = $('input[name="data.value"]', app.element).val().split(";").map(v => v != "").filter(v => v).length;
                        if (countAttr != countVal)
                            return "number of attributes does not match the values";
                    },
                    help: "If you want to increase the value use '+ 10', if you want to have the value rolled use '[[1d4]]'"
                },
                {
                    id: "chatMessage",
                    name: "MonksActiveTiles.ctrl.chatmessage",
                    type: "checkbox",
                    conditional: (app) => {
                        return $('input[name="data.value"]', app.element).val().includes('[[');
                    }
                },
                {
                    id: "rollmode",
                    name: 'MonksActiveTiles.ctrl.rollmode',
                    list: "rollmode",
                    type: "list",
                    conditional: (app) => {
                        return $('input[name="data.value"]', app.element).val().includes('[[');
                    }
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
                const { tile, tokens, action, userid, value, method } = args;
                let entities = await MonksActiveTiles.getEntities(args);

                if (entities && entities.length > 0) {
                    for (let entity of entities) {
                        if (entity) {
                            let attrs = action.data.attribute.split(";");
                            let vals = action.data.value.split(";");
                            if (attrs.length != vals.length) {
                                warn("The number of attributes to change does not match the number of values to set");
                                continue;
                            }

                            let base = entity;

                            let update = {};
                            for (let i = 0; i < attrs.length; i++) {
                                let attr = attrs[i].trim();

                                if (attr == "")
                                    continue;

                                if (!attr.startsWith('flags')) {
                                    if (!hasProperty(base.data, attr) && entity instanceof TokenDocument) {
                                        base = entity.actor;
                                        attr = 'data.' + attr;
                                    }

                                    if (!hasProperty(base.data, attr)) {
                                        warn("Couldn't find attribute", entity, attr);
                                        continue;
                                    }
                                }

                                let prop = getProperty(base.data, attr);

                                if (prop && typeof prop == 'object' && !(prop instanceof Array)) {
                                    if (prop.value == undefined) {
                                        debug("Attribute returned an object and the object doesn't have a value property", entity, attr, prop);
                                        continue;
                                    }

                                    attr = attr + '.value';
                                    prop = prop.value;
                                }

                                let val = vals[i];
                                if (val == undefined)
                                    continue;
                                val = val.trim();

                                if (val == 'true')
                                    val = true;
                                else if (val == 'false')
                                    val = false;
                                else {
                                    let context = {
                                        actor: tokens[0]?.actor?.data,
                                        token: tokens[0]?.data,
                                        tile: tile.data,
                                        entity: entity,
                                        user: game.users.get(userid),
                                        value: value,
                                        scene: canvas.scene,
                                        method: method
                                    };

                                    if (val.includes("{{")) {
                                        const compiled = Handlebars.compile(val);
                                        val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                                    }

                                    const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                                    val = await MonksActiveTiles.inlineRoll(val, rgx, action.data.chatMessage, action.data.rollmode, entity);

                                    if (val.startsWith('+ ') || val.startsWith('- ')) {
                                        try {
                                            if (prop instanceof Array) {
                                                let add = val.startsWith('+ ');
                                                let parts = val.replace('+ ', '').replace('- ', '').split(',').map(p => p.trim());
                                                if (add)
                                                    val = prop.concat(parts).filter((value, index, self) => { return self.indexOf(value) === index; });
                                                else
                                                    val = prop.filter(value => { return !parts.includes(value) });
                                            } else {
                                                val = eval(prop + val);
                                            }
                                        } catch (err) {
                                            val = (prop instanceof Array ? [] : 0);
                                            debug(err);
                                        }
                                    }
                                    if (typeof val == "string" && val.startsWith('=')) {
                                        try {
                                            if (prop instanceof Array) {
                                                val = val.replace('=', '').split(',').map(p => p.trim());
                                            } else {
                                                val = eval(val.substring(1));
                                            }
                                        } catch (err) {
                                            val = (prop instanceof Array ? [] : 0);
                                            debug(err);
                                        }
                                    }

                                    if (val instanceof Array) {
                                        for (let i = 0; i < val.length; i++) {
                                            if (!isNaN(val[i]) && !isNaN(parseFloat(val[i])))
                                                val[i] = parseFloat(val[i]);
                                        }
                                    } else {
                                        if (!isNaN(val) && !isNaN(parseFloat(val)))
                                            val = parseFloat(val);
                                    }
                                }
                                update[attr] = val;
                            }
                            base.update(update); 
                        }
                    }

                    let result = { entities: entities };
                    if (entities[0] instanceof TokenDocument)
                        result.tokens = entities;
                    return result;
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let str = "";
                let attrs = action.data?.attribute.split(";");
                let vals = action.data?.value.split(";");
                for (let i = 0; i < attrs.length; i++) {
                    let attr = attrs[i].trim();
                    if (attr == "")
                        continue;
                    let actionName = 'set';
                    let midName = 'to';
                    let value = vals[i];
                    if (value != undefined) {
                        value = value.trim();
                        if (value.startsWith('+ ') || value.startsWith('- ')) {
                            actionName = value.startsWith('+ ') ? 'increase' : 'decrease';
                            midName = 'by';
                            value = value.substring(2)
                        } else if (value.startsWith('=')) {
                            value = `(${value.substring(1)})`;
                        }

                        str += `, ${actionName} <span class="value-style">&lt;${attr}&gt;</span> ${midName} <span class="details-style">"${value}"</span>`;
                    }
                }
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span>${str}`;
            }
        },
        /*'animate': {
            name: "MonksActiveTiles.action.animate",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true, showPrevious: true }
                },
                {
                    id: "attribute",
                    name: "MonksActiveTiles.ctrl.attribute",
                    type: "text"
                },
                {
                    id: "from",
                    name: "From",
                    type: "text"
                },
                {
                    id: "to",
                    name: "To",
                    type: "text"
                },
                {
                    id: "repeat",
                    name: "Repeat",
                    type: "checkbox"
                }
            ],
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args);

                let animate = (dt) => {
                    let interval = 100;
                };

                let attr = action.data.attribute;

                if (entities && entities.length > 0) {
                    for (let entity of entities) {
                        const attributes = [
                            { parent: entity.object, attribute: attr, to: action.data.to }
                        ];

                        let animationName = `MonksActiveTiles.${entity.id}.animate`;
                        let _animation = await CanvasAnimation.animateLinear(attributes, {
                            name: animationName,
                            context: entity.object,
                            duration: 1000
                        });
                    }
                }

                let result = { entities: entities };
                if (entities && entities.length > 0 && entities[0] instanceof TokenDocument)
                    result.tokens = entities;
                return result;
            },
            content: async (trigger, action) => {
                return "Animate";
            }
        },*/
        'hurtheal': {
            name: "MonksActiveTiles.action.hurtheal",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true }
                },
                {
                    id: "value",
                    name: "MonksActiveTiles.ctrl.value",
                    type: "text",
                    required: true,
                    onBlur: (app) => {
                        app.checkConditional();
                    },
                    help: "If you want to increase the value use '+ 10', if you want to have the value rolled use '[[1d4]]'"
                },
                {
                    id: "chatMessage",
                    name: "MonksActiveTiles.ctrl.chatmessage",
                    type: "checkbox",
                    conditional: (app) => {
                        const val = $('input[name="data.value"]', app.element).val();
                        return val.includes('[[') || val.includes('d');
                    }
                },
                {
                    id: "rollmode",
                    name: 'MonksActiveTiles.ctrl.rollmode',
                    list: "rollmode",
                    type: "list",
                    conditional: (app) => {
                        const val = $('input[name="data.value"]', app.element).val();
                        return val.includes('[[') || val.includes('d');
                    }
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
                const { tile, action, userid, value, method } = args;
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
                        const dh = Math.clamped(resource.value - (amount - dt), (game.system.id == 'D35E' || game.system.id == 'pf1' ? -2000 : 0), (resource.max == 0 ? 4000 : resource.max + tmpMax));
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
                        let context = {
                            actor: a.data,
                            token: entity.data,
                            tile: tile.data,
                            entity: entity,
                            user: game.users.get(userid),
                            value: value,
                            scene: canvas.scene,
                            method: method
                        };

                        if (val.includes("{{")) {
                            const compiled = Handlebars.compile(val);
                            val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                        }

                        const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                        val = await MonksActiveTiles.inlineRoll(val, rgx, action.data.chatMessage, action.data.rollmode, entity);

                        if (val.indexOf("d") != -1) {
                            let r = new Roll(val);
                            await r.evaluate({ async: true });
                            val = r.total;

                            if (action.data.chatMessage)
                                r.toMessage({}, { rollMode: action.data.rollmode });
                        }

                        try {
                            val = parseFloat(eval(val));
                        } catch{ }

                        val = val * -1;

                        if (val != 0) {
                            if (!$.isNumeric(val)) {
                                warn("Value used for Hurt/Heal did not evaluate to a number", val);
                                continue;
                            }
                            if (a.applyDamage) {
                                await a.applyDamage(val, (game.system.id == "pf2e" ? entity : 1));
                            } else {
                                applyDamage(a, val);
                            }
                        }
                    }

                    return { tokens: entities, entities: entities };
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="action-style">${(action.data?.value.startsWith('-') ? 'Hurt' : 'Heal')}</span> <span class="entity-style">${entityName}</span>, by <span class="details-style">"${action.data?.value}"</span>`;
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
                    subtype: "audio",
                    required: true
                },
                {
                    id: "audiofor",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "audiofor",
                    type: "list"
                },
                {
                    id: "volume",
                    name: "MonksActiveTiles.ctrl.volume",
                    type: "slider",
                    defvalue: "1.0"
                },
                {
                    id: "loop",
                    name: "MonksActiveTiles.ctrl.loop",
                    type: "checkbox"
                },
                {
                    id: "fade",
                    name: "MonksActiveTiles.ctrl.fade",
                    type: "number",
                    min: 0,
                    step: 0.05,
                    defvalue: 0.25
                },
                {
                    id: "scenerestrict",
                    name: "MonksActiveTiles.ctrl.scenerestrict",
                    type: "checkbox"
                },
                {
                    id: "prevent",
                    name: "MonksActiveTiles.ctrl.preventsound",
                    type: "checkbox"
                },
            ],
            values: {
                'audiofor': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm",
                    'token': "MonksActiveTiles.for.player",
                    'owner': "MonksActiveTiles.for.token"
                },
            },
            fn: async (args = {}) => {
                const { tile, tokens, action, userid } = args;
                //play the sound
                let getTileSounds = async function(tile) {
                    const audiofile = action.data.audiofile;

                    if (!audiofile) {
                        console.log(`Audio file not set to anything, can't play sound`);
                        return;
                    }

                    if (!audiofile.includes('*')) return [audiofile];
                    if (tile._sounds) return tile._sounds;
                    let source = "data";
                    let pattern = audiofile;
                    const browseOptions = { wildcard: true };

                    if (typeof ForgeVTT != "undefined" && ForgeVTT.usingTheForge) {
                        source = "forgevtt";
                    }

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

                let volume = Math.clamped((action.data.volume.value ?? action.data.volume ?? 1), 0, 1);

                let audiofiles = await getTileSounds(tile);
                const audiofile = audiofiles[Math.floor(Math.random() * audiofiles.length)];

                let owners = [];
                for (let token of tokens) {
                    if (token.actor) {
                        for (let [user, perm] of Object.entries(token.actor.data.permission)) {
                            if (perm >= CONST.DOCUMENT_PERMISSION_LEVELS.OWNER && !owners.includes(user))
                                owners.push(user);
                        }
                    }
                }

                if (action.data.audiofor != 'gm') {
                    MonksActiveTiles.emit('playsound', {
                        tileid: tile.uuid,
                        actionid: action.id,
                        src: audiofile,
                        loop: action.data.loop,
                        userid: (action.data.audiofor == 'token' ? [userid] : (action.data.audiofor == 'owner' ? owners : null)),
                        sceneid: (action.data.audiofor == 'token' ? null : (action.data.scenerestrict ? tile.parent.id : null)),
                        volume: volume,
                        prevent: action.data.prevent,
                        fade: action.data.fade
                    });
                }
                if (["all", "gm"].includes(action.data.audiofor) || userid == game.user.id || owners.includes(game.user.id)) {
                    if (tile.soundeffect != undefined && tile.soundeffect[action.id] != undefined) {
                        if (tile.soundeffect[action.id].playing && action.data.prevent == true)
                            return;

                        tile.soundeffect[action.id].fade(0, { duration: 250 }).then(() => {
                            tile.soundeffect[action.id].stop();
                            delete tile.soundeffect[action.id];
                        });
                        MonksActiveTiles.emit('stopsound', {
                            tileid: tile.uuid,
                            actionid: action.id,
                            userid: (action.data.audiofor == 'token' ? [userid] : (action.data.audiofor == 'owner' ? owners : null)),
                            fade: 0.25
                        });
                    }
                    debug('Playing', audiofile, action.id);
                    let fade = action.data.fade ?? 0;
                    AudioHelper.play({ src: audiofile, volume: (fade > 0 ? 0 : volume), loop: action.data.loop }, false).then((sound) => {
                        if (fade > 0)
                            sound.fade(volume * game.settings.get("core", "globalInterfaceVolume"), { duration: fade * 1000 });
                        if (tile.soundeffect == undefined)
                            tile.soundeffect = {};
                        tile.soundeffect[action.id] = sound;
                        tile.soundeffect[action.id].on("end", () => {
                            debug('Finished playing', audiofile);
                            delete tile.soundeffect[action.id];
                        });
                        tile.soundeffect[action.id]._mattvolume = volume;
                    });
                }
            },
            content: async (trigger, action) => {
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="details-style">"${action.data.audiofile}"</span> for <span class="value-style">&lt;${i18n(trigger.values.audiofor[action.data.audiofor])}&gt;</span>${(action.data?.loop ? ' <i class="fas fa-sync" title="Loop sound"></i>' : '')}`;
            }
        },
        'playlist': {
            name: "MonksActiveTiles.action.playlist",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.playlist",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => {
                        return (entity instanceof Playlist || entity instanceof PlaylistSound);
                    },
                    required: true,
                    defaultType: 'playlists',
                    placeholder: 'Please select a playlist'
                },
                {
                    id: "play",
                    name: "MonksActiveTiles.ctrl.play",
                    list: "play",
                    defvalue: "play",
                    type: "list",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                },
                {
                    id: "volume",
                    name: "MonksActiveTiles.ctrl.volume",
                    type: "slider",
                    defvalue: "1.0",
                    conditional: (app) => {
                        return $('select[name="data.play"]', app.element).val() == 'play';
                    }
                },
                {
                    id: "loop",
                    name: "MonksActiveTiles.ctrl.loop",
                    type: "checkbox",
                    conditional: (app) => {
                        return $('select[name="data.play"]', app.element).val() == 'play';
                    }
                }
            ],
            values: {
                'play': {
                    'play': "Play",
                    'stop': "Stop"
                },
            },
            fn: async (args = {}) => {
                const { tile, action, userid } = args;
                
                let volume = Math.clamped((action.data.volume.value ?? action.data.volume ?? 1), 0, 1);

                let entities = await MonksActiveTiles.getEntities(args, 'playlists');
                for (let entity of entities) {
                    if (entity instanceof Playlist) {
                        if (action.data?.play !== "stop")
                            await entity.playAll();
                        else
                            await entity.stopAll();
                    } else {
                        if (action.data?.play !== "stop")
                            await entity.update({ playing: true, repeat: action.data.loop, volume: volume });
                        else
                            await entity.update({ playing: false });
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data.entity, 'playlists')
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="details-style">"${action.data?.play == 'play' ? "Play" : "Stop"}"</span> <span class="entity-style">${entityName}</span>${(action.data?.loop ? ' <i class="fas fa-sync" title="Loop sound"></i>' : '')}`;
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
                    type: "list",
                    onChange: (app) => {
                        app.checkConditional();
                    }, 
                },
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true },
                    restrict: (entity) => { return entity instanceof Tile; },
                    conditional: (app) => {
                        return $('select[name="data.audiotype"]', app.element).val() == 'tile';
                    },
                    defaultType: 'tiles'
                },
                {
                    id: "audiofor",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "audiofor",
                    type: "list"
                },
                {
                    id: "fade",
                    name: "MonksActiveTiles.ctrl.fade",
                    type: "number",
                    min: 0,
                    step: 0.05,
                    defvalue: 0.25
                }
            ],
            values: {
                'audiofor': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm",
                    'token': "MonksActiveTiles.for.player",
                    'owner': "MonksActiveTiles.for.token"
                },
                'audiotype': {
                    'all': "MonksActiveTiles.audiotype.all",
                    'tile': "MonksActiveTiles.audiotype.tile"
                }
            },
            fn: async (args = {}) => {
                const { tile, tokens, action, userid } = args;
                //play the sound
                if (action.data.audiotype == 'all') {
                    game.playlists.forEach(async (p) => {
                        p.sounds.forEach(async (s) => {
                            if (s.playing)
                                await s.update({ playing: false, pausedTime: s.sound.currentTime });
                        });
                    });

                    MonksActiveTiles.emit('stopsound', {
                        type: action.data.audiotype,
                    });
                } else {
                    let owners = [];
                    for (let token of tokens) {
                        if (token.actor) {
                            for (let [user, perm] of Object.entries(token.actor.data.permission)) {
                                if (perm >= CONST.DOCUMENT_PERMISSION_LEVELS.OWNER && !owners.includes(user))
                                    owners.push(user);
                            }
                        }
                    }

                    let entities = await MonksActiveTiles.getEntities(args, 'tiles');
                    for (let entity of entities) {
                        if (action.data.audiofor != 'gm') {
                            MonksActiveTiles.emit('stopsound', {
                                tileid: entity.uuid,
                                type: action.data.audiotype,
                                userid: (action.data.audiofor == 'token' ? [userid] : (action.data.audiofor == 'owner' ? owners : null)),
                                fade: action.data.fade ?? 0.25
                            });
                        }
                        if (["all", "gm"].includes(action.data.audiofor) || userid == game.user.id || owners.includes(game.user.id)) {
                            if (entity.soundeffect != undefined) {
                                let fade = (action.data.fade * 1000) ?? 0.25;
                                for (let [key, sound] of Object.entries(entity.soundeffect)) {
                                    sound.fade(0, { duration: fade }).then(() => {
                                        sound.stop();
                                        delete entity.soundeffect[key];
                                    });
                                }
                            }
                        }
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = '';
                if (action.data.audiotype == 'tile')
                    entityName = await MonksActiveTiles.entityName(action.data.entity, 'tiles');
                return `<span class="action-style">${i18n(trigger.name)}</span> of <span class="entity-style">${(action.data.audiotype == 'all' ? i18n("MonksActiveTiles.audiotype.all") : entityName)}</span> for <span class="value-style">&lt;${i18n(trigger.values.audiofor[action.data.audiofor])}&gt;</span>`;
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
                    options: { showTagger: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Wall && entity.data.door); },  //this needs to be a wall segment
                    required: true,
                    defaultType: 'walls',
                    placeholder: 'Please select a Wall'
                },
                {
                    id: "state",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "state",
                    type: "list"
                },
                {
                    id: "type",
                    name: "MonksActiveTiles.ctrl.type",
                    list: "type",
                    type: "list"
                }
            ],
            values: {
                'state': {
                    'none': "",
                    'open': "MonksActiveTiles.state.open",
                    'close': "MonksActiveTiles.state.closed",
                    'lock': "MonksActiveTiles.state.locked",
                    'toggle': "MonksActiveTiles.state.toggle"
                },
                'type': {
                    'none': "",
                    'door': "MonksActiveTiles.doortype.door",
                    'secret': "MonksActiveTiles.doortype.secret",
                    'toggle': "MonksActiveTiles.doortype.toggle"
                }
            },
            fn: async (args = {}) => {
                const { action } = args;
                //Find the door in question, set the state to whatever value
                if (action.data.entity.id) {
                    let walls = await MonksActiveTiles.getEntities(args, 'walls');
                    for (let wall of walls) {
                        if (wall && wall.data.door != 0) {
                            let updates = {}
                            if (action.data.state && action.data.state !== '') {
                                let state = (action.data.state == 'open' ? CONST.WALL_DOOR_STATES.OPEN : (action.data.state == 'lock' ? CONST.WALL_DOOR_STATES.LOCKED : CONST.WALL_DOOR_STATES.CLOSED));
                                if (action.data.state == 'toggle' && wall.data.ds != CONST.WALL_DOOR_STATES.LOCKED)
                                    state = (wall.data.ds == CONST.WALL_DOOR_STATES.OPEN ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.OPEN);
                                updates.ds = state;
                            }
                            if (action.data.type && action.data.type !== '') {
                                let type = (action.data.type == 'door' ? CONST.WALL_DOOR_TYPES.DOOR : CONST.WALL_DOOR_TYPES.SECRET);
                                if (action.data.type == 'toggle')
                                    type = (wall.data.door == CONST.WALL_DOOR_TYPES.DOOR ? CONST.WALL_DOOR_TYPES.SECRET : CONST.WALL_DOOR_TYPES.DOOR);
                                updates.door = type;
                            }
                            await wall.update(updates);
                        }
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'walls');
                let stateText = (action.data?.state != 'none' ? (action.data?.state == 'toggle' ?
                    `, toggle <span class="details-style">"State"</span>` :
                    `, set <span class="details-style">"State"</span> to <span class="value-style">&lt;${i18n(trigger.values.state[action.data?.state])}&gt;</span>`) : '');
                let typeText = (action.data?.type != undefined && action.data?.type != 'none' ? (action.data?.type == 'toggle' ?
                    `, toggle <span class="details-style">"Type"</span>` :
                    `, set <span class="details-style">"Type"</span> to <span class="value-style">&lt;${i18n(trigger.values.type[action.data?.type])}&gt;</span>`) : '');
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span>${stateText}${typeText}`;
            }
        },
        'notification': {
            name: "MonksActiveTiles.action.notification",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "text",
                    name: "MonksActiveTiles.ctrl.text",
                    type: "text",
                    required: true
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
                const { tile, tokens, action, userid, value, method } = args;
                //Display a notification with the message
                let context = {
                    actor: tokens[0]?.actor.data,
                    token: tokens[0]?.data,
                    tile: tile.data,
                    user: game.users.get(userid),
                    value: value,
                    scene: canvas.scene,
                    method: method
                };
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
            content: async (trigger, action) => {
                return `<span class="action-style">${i18n(trigger.name)}</span> as <span class="details-style">"${i18n(trigger.values.type[action.data?.type])}"</span> to <span class="value-style">&lt;${i18n(trigger.values.showto[action.data?.showto])}&gt;</span>`;
            }
        },
        'chatmessage': {
            name: "MonksActiveTiles.action.chatmessage",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "flavor",
                    name: "MonksActiveTiles.ctrl.flavor",
                    type: "text"
                },
                {
                    id: "text",
                    name: "MonksActiveTiles.ctrl.text",
                    type: "text",
                    subtype: "multiline",
                    required: true
                },
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.speaker",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "incharacter",
                    name: "MonksActiveTiles.ctrl.incharacter",
                    type: "checkbox"
                },
                {
                    id: "chatbubble",
                    name: "MonksActiveTiles.ctrl.chatbubble",
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
                    conditional: () => {
                        return (game.modules.get("polyglot")?.active && !!CONFIG[game.system.id.toUpperCase()]?.languages);
                    },
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
                const { tile, tokens, action, userid, value, method } = args;

                let entities = await MonksActiveTiles.getEntities(args);
                let entity = (entities.length > 0 ? entities[0] : null);

                //Add a chat message
                let user = game.users.find(u => u.id == userid);
                let scene = game.scenes.find(s => s.id == user?.viewedScene);

                let tkn = (entity?.object || tokens[0]?.object);

                const speaker = { scene: scene?.id, actor: tkn?.actor.id || user?.character?.id, token: tkn?.id, alias: tkn?.name || user?.name };

                let context = {
                    actor: tokens[0]?.actor?.data,
                    token: tokens[0]?.data,
                    speaker: tokens[0],
                    tile: tile.data,
                    entity: entity,
                    user: game.users.get(userid),
                    value: value,
                    scene: canvas.scene,
                    method: method
                };
                let content = action.data.text;

                if (content.includes("{{")) {
                    const compiled = Handlebars.compile(content);
                    content = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                }

                if (content.startsWith('/')) {
                    ui.chat.processMessage(content);
                } else {
                    let messageData = {
                        user: userid,
                        speaker: speaker,
                        type: (action.data.incharacter ? CONST.CHAT_MESSAGE_TYPES.IC : CONST.CHAT_MESSAGE_TYPES.OOC),
                        content: content
                    };

                    if (action.data.flavor)
                        messageData.flavor = action.data.flavor;

                    if (action.data.for == 'gm') {
                        messageData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
                        messageData.speaker = null;
                        messageData.user = game.user.id;
                    }
                    else if (action.data.for == 'token') {
                        let tokenOwners = (tkn ? Object.entries(tkn?.actor.data.permission).filter(([k, v]) => { return v == CONST.ENTITY_PERMISSIONS.OWNER }).map(a => { return a[0]; }) : []);
                        messageData.whisper = Array.from(new Set(ChatMessage.getWhisperRecipients("GM").map(u => u.id).concat(tokenOwners)));
                    }

                    if (action.data.language != '' && game.modules.get("polyglot")?.active)
                        mergeObject(messageData, { flags: { 'monks-active-tiles': { language: action.data.language } }, lang: action.data.language });

                    ChatMessage.create(messageData, { chatBubble: action.data.chatbubble });
                }
            },
            content: async (trigger, action) => {
                let syslang = CONFIG[game.system.id.toUpperCase()]?.languages || {};
                let msg = (action.data.text.length <= 15 ? action.data.text : action.data.text.substr(0, 15) + "...");
                return `<span class="action-style">${i18n(trigger.name)}</span> for <span class="value-style">&lt;${i18n(trigger.values.for[action.data?.for])}&gt;</span>${(action.data.language != '' && game.modules.get("polyglot")?.active ? ` in <span class="details-style">"${syslang[action.data.language]}"</span>` : '')}${(action.data?.incharacter ? ' <i class="fas fa-user" title="In Character"></i>' : '')}${(action.data?.chatbubble ? ' <i class="fas fa-comment" title="Chat Bubble"></i>' : '')} "${msg}"`;
            }
        },
        'runmacro': {
            name: "MonksActiveTiles.action.runmacro",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Macro); },
                    defaultType: "macro"
                },
                {
                    id: "args",
                    name: "MonksActiveTiles.ctrl.args",
                    type: "text",
                    conditional: () => {
                        return (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active || !setting('use-core-macro'));
                    },
                    help: "separate arguments with spaces, and reference them in the macro using args[0]"
                },
                {
                    id: "runasgm",
                    name: "MonksActiveTiles.ctrl.runasgm",
                    list: "runas",
                    type: "list"
                }
            ],
            values: {
                'runas': {
                    'unknown': "",
                    'gm': "MonksActiveTiles.runas.gm",
                    'player': "MonksActiveTiles.runas.player"
                }
            },
            fn: async (args = {}) => {
                const { action } = args;
                //Find the macro to be run, call it with the data from the trigger
                let entities;
                if (!action.data.entity) {
                    try {
                        entities = await fromUuid(action.data?.macroid);
                    } catch {
                        entities = game.macros.get(action.data?.macroid);
                    }
                    entities = [entities];
                } else {
                    entities = await MonksActiveTiles.getEntities(args, "macros");
                }

                for (let macro of entities) {
                    if (macro instanceof Macro) {
                        return await MonksActiveTiles._executeMacro(macro, args);
                    }
                }
            },
            content: async (trigger, action) => {
                let pack;
                let entityName = "";
                if (!action.data.entity) {
                    let macro;
                    try {
                        macro = await fromUuid(action.data?.macroid);
                    } catch {
                        macro = game.macros.get(action.data?.macroid);
                    }
                    entityName = (macro?.name || 'Unknown Macro');

                    if (macro?.data.document.pack)
                        pack = game.packs.get(macro.data.document.pack);

                    entityName = (pack ? pack.metadata.name + ":" : "") + entityName;
                } else {
                    entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                }
                
                return `<span class="action-style">${i18n(trigger.name)}</span>, <span class="entity-style">${entityName}</span>${(action.data.runasgm != undefined && action.data.runasgm != 'unknown' ? ' as <span class="value-style">&lt;' + i18n(trigger.values.runas[action.data.runasgm]) + '&gt;</span>' : '')}`;
            }
        },
        'rolltable': {
            name: "MonksActiveTiles.action.rolltable",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "rolltableid",
                    name: "MonksActiveTiles.ctrl.selectrolltable",
                    list: async () => {
                        let rolltables = [];

                        for (let pack of game.packs) {
                            if (pack.documentName == 'RollTable') {
                                const index = await pack.getIndex();
                                let entries = [];
                                const tableString = `Compendium.${pack.collection}.`;
                                for (let table of index) {
                                    entries.push({
                                        name: table.name,
                                        uuid: tableString + table._id,
                                    });
                                }

                                let groups = entries.sort((a, b) => { return a.name.localeCompare(b.name) }).reduce((a, v) => ({ ...a, [v.uuid]: v.name }), {});
                                rolltables.push({ text: pack.metadata.label, groups: groups });
                            }
                        };

                        let groups = game.tables.map(t => { return { uuid: t.uuid, name: t.name } }).sort((a, b) => { return a.name.localeCompare(b.name) }).reduce((a, v) => ({ ...a, [v.uuid]: v.name }), {});
                        rolltables.push({ text: "Rollable Tables", groups: groups });
                        return rolltables;
                    },
                    type: "list",
                    required: true
                },
                {
                    id: "quantity",
                    name: "MonksActiveTiles.ctrl.quantity",
                    type: "number",
                    defvalue: 1,
                    min: 1,
                    step: 1,
                    help: "Set this to blank to use the roll table quantity"
                },
                {
                    id: "rollmode",
                    name: 'MonksActiveTiles.ctrl.rollmode',
                    list: "rollmode",
                    type: "list"
                },
                {
                    id: "chatmessage",
                    name: 'MonksActiveTiles.ctrl.chatmessage',
                    type: "checkbox",
                    defvalue: true
                },
                {
                    id: "reset",
                    name: 'MonksActiveTiles.ctrl.reset',
                    type: "checkbox",
                    defvalue: true
                },
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
                let rolltable = await fromUuid(action.data?.rolltableid);
                if (rolltable instanceof RollTable) {
                    //Make a roll

                    const available = rolltable.data.results.filter(r => !r.data.drawn);
                    if (!available.length && action?.data?.reset)
                        await rolltable.reset();

                    let results = { continue: true };
                    if (game.modules.get("better-rolltables")?.active) {
                        let BRTBuilder = await import('/modules/better-rolltables/scripts/core/brt-builder.js');
                        let BetterResults = await import('/modules/better-rolltables/scripts/core/brt-table-results.js');
                        let LootChatCard = await import('/modules/better-rolltables/scripts/loot/loot-chat-card.js');

                        const brtBuilder = new BRTBuilder.BRTBuilder(rolltable);
                        const tblResults = await brtBuilder.betterRoll(action.data?.quantity);

                        //action.data.rollmode
                        if (action.data.chatmessage !== false) {
                            if (game.settings.get('better-rolltables', 'use-condensed-betterroll')) {
                                const br = new BetterResults.BetterResults(tblResults);
                                const betterResults = await br.buildResults(rolltable);
                                const currencyData = br.getCurrencyData();

                                const lootChatCard = new LootChatCard.LootChatCard(betterResults, currencyData);
                                await lootChatCard.createChatCard(rolltable);
                            } else {
                                await brtBuilder.createChatCard(tblResults);
                            }
                        }

                        results.results = tblResults;
                        results.roll = brtBuilder.mainRoll;
                    } else {
                        let numRolls = action.data?.quantity || 1;
                        let tblResults = await rolltable.drawMany(numRolls, { rollMode: action.data.rollmode, displayChat: false });
                        //Check to see what the privacy rules are

                        if (action.data.chatmessage !== false) {
                            let user = game.users.find(u => u.id == userid);
                            let scene = game.scenes.find(s => s.id == user.viewedScene);
                            const speaker = { scene: scene?.id, actor: user?.character?.id, token: tokens[0]?.id, alias: user.name };
                            // Override the toMessage so that I can change the speaker

                            // Construct chat data
                            const nr = tblResults.results.length > 1 ? `${tblResults.results.length} results` : "a result";
                            let messageData = {
                                flavor: `Draws ${nr} from the ${rolltable.name} table.`,
                                user: userid,
                                speaker: speaker,
                                type: CONST.CHAT_MESSAGE_TYPES.ROLL,
                                roll: tblResults.roll,
                                sound: tblResults.roll ? CONFIG.sounds.dice : null,
                                flags: { "core.RollTable": rolltable.id }
                            };

                            // Render the chat card which combines the dice roll with the drawn results
                            messageData.content = await renderTemplate(CONFIG.RollTable.resultTemplate, {
                                description: TextEditor.enrichHTML(rolltable.data.description, { entities: true }),
                                results: tblResults.results.map(r => {
                                    r.text = r.getChatText();
                                    return r;
                                }),
                                rollHTML: rolltable.data.displayRoll ? await tblResults.roll.render() : null,
                                table: rolltable
                            });

                            if (action.data.rollmode != 'roll') {
                                messageData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
                                messageData.speaker = null;
                                messageData.user = game.user.id;
                            }

                            // Create the chat message
                            ChatMessage.create(messageData, { rollMode: action.data.rollmode });
                        }

                        results.results = tblResults.results;
                        results.roll = tblResults.roll;
                    }

                    if (results.results.length) {
                        //roll table result
                        results.text = [];
                        for (let tableresult of results.results) {
                            let entity;

                            let collection = game.collections.get(tableresult.data.collection);
                            if (collection == undefined) {
                                let pack = game.packs.get(tableresult.data.collection);
                                if (pack == undefined)
                                    results.text.push(tableresult.data.text);
                                else
                                    entity = await pack.getDocument(tableresult.data.resultId);
                            } else
                                entity = collection.get(tableresult.data.resultId);

                            MonksActiveTiles.addToResult(entity, results);
                        }
                    }

                    debug("Rolltable", results);

                    return results;
                }
            },
            content: async (trigger, action) => {
                let pack;
                let rolltable = await fromUuid(action.data?.rolltableid);
                if (rolltable.data.document.pack)
                    pack = game.packs.get(rolltable.data.document.pack);
                return `<span class="action-style">${i18n(trigger.name)}</span>, ${action.data?.quantity ? `<span class="value-style">&lt;${action.data?.quantity} items&gt;</span>` : ''} from <span class="entity-style">${pack ? pack.metadata.name + ":" : ""}${(rolltable?.name || 'Unknown Roll Table')}</span>`;
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
            content: async (trigger, action) => {
                return `<span class="action-style">${i18n(trigger.name)}</span> for <span class="value-style">&lt;${(action.data?.for == 'token' ? 'Token' : 'Everyone')}&gt;</span>`;
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
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
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
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    type: "list",
                    required: true
                },
                {
                    id: "addeffect",
                    name: "Add Effect",
                    type: "list",
                    list: 'add',
                    conditional: (app) => {
                        if (game.system.id == 'pf2e') {
                            let id = $('select[name="data.effectid"]', app.element).val();
                            let condition = game.pf2e.ConditionManager.conditions.get(id);

                            return !condition.value;
                        } else
                            return true;
                    },
                    defvalue: 'add'
                },
                {
                    id: "altereffect",
                    name: "Alter Effect",
                    type: "text",
                    conditional: (app) => {
                        if (!game.system.id == 'pf2e')
                            return false;

                        let id = $('select[name="data.effectid"]', app.element).val();
                        let condition = game.pf2e.ConditionManager.conditions.get(id);

                        return !!condition.value;
                    },
                    help: "If you want to increase the value use '+ 1'"
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

                    if (effect) {
                        for (let token of entities) {
                            if (token == undefined)
                                continue;

                            let existing = token.actor.itemTypes.condition.find((condition) => {
                                return condition.slug === effect.slug;
                            });

                            if (effect.value) {
                                let value = parseInt(action.data?.altereffect.replace(' ', ''));
                                if (isNaN(value))
                                    continue;

                                if (value < 0) {
                                    if (existing) {
                                        let newVal = existing.value + value;
                                        if (newVal < 1)
                                            await game.pf2e.ConditionManager.removeConditionFromToken(existing.id, token.object);
                                        else
                                            await game.pf2e.ConditionManager.updateConditionValue(existing.id, token.object, newVal);
                                    }
                                } else {
                                    if (existing) {
                                        let newVal = (action.data?.altereffect.startsWith("+") ? existing.value + value : value);
                                        await game.pf2e.ConditionManager.updateConditionValue(existing.id, token.object, newVal);
                                    } else {
                                        await game.pf2e.ConditionManager.addConditionToToken(mergeObject(effect.toObject(), { data: { value: { value: value } } }), token.object);
                                    }
                                }
                            } else {
                                let add = (action.data?.addeffect == 'add');

                                if (action.data?.addeffect == 'toggle') {
                                    add = (existing == undefined);
                                }

                                if (add)
                                    await game.pf2e.ConditionManager.addConditionToToken(effect.toObject(), token.object);
                                else
                                    await game.pf2e.ConditionManager.removeConditionFromToken(existing.id, token.object);
                            }
                        }
                    }
                } else {
                    let effect = CONFIG.statusEffects.find(e => e.id === action.data?.effectid);

                    if (effect) {
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
                }

                return { tokens: entities, entities: entities };
            },
            content: async (trigger, action) => {
                let effect = CONFIG.statusEffects.find(e => e.id === action.data?.effectid);
                if (game.system.id == 'pf2e')
                    effect = game.pf2e.ConditionManager.getCondition(action.data?.effectid);
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="action-style">${effect.value ? "Alter" : i18n(trigger.values.add[action?.data?.addeffect || 'add'])}</span> <span class="details-style">"${(i18n(effect?.label) || effect?.name || 'Unknown Effect')}"</span>${effect.value ? " by " + action.data?.altereffect : ""} ${effect.value ? "on" : (action.data?.addeffect == 'add' ? "to" : (action.data?.addeffect == 'remove' ? "from" : "on"))} <span class="entity-style">${entityName}</span>`;
            }
        },
        'playanimation': {
            name: "MonksActiveTiles.action.playanimation",
            requiresGM: true,
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Tile); },
                    defaultType: 'tiles'
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
                let entities = await MonksActiveTiles.getEntities(args, 'tiles');
                if (entities.length == 0)
                    return;

                for (let entity of entities) {
                    if (entity.object.isVideo) {
                        if (action.data.animatefor === 'token') {
                            if (userid == game.user.id)
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
                }

                return { entities: entities };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                return `<span class="action-style">${i18n(trigger.values.animate[action.data?.play])} animation</span> on <span class="entity-style">${entityName}</span> for <span class="value-style">&lt;${i18n(trigger.values.animatefor[action.data?.animatefor])}&gt;</span>`;
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
                    options: { showPrevious: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof JournalEntry); },
                    required: true,
                    defaultType: 'journal',
                    placeholder: 'Please select a Journal'
                },
                {
                    id: "showto",
                    name: "MonksActiveTiles.ctrl.showto",
                    list: "showto",
                    type: "list"
                },
                {
                    id: "permission",
                    name: "MonksActiveTiles.ctrl.usepermission",
                    type: "checkbox"
                },
                {
                    id: "enhanced",
                    name: "MonksActiveTiles.ctrl.enhanced",
                    type: "checkbox",
                    conditional: () => { return game.modules.get('monks-enhanced-journal')?.active }
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
                let entities;
                if (action.data.entity.id == 'players') {
                    let user = game.users.get(userid);
                    if (user.isGM)
                        return;
                    entities = [game.journal.find(j => {
                        return j.testUserPermission(user, "OWNER");
                    })];
                } else
                    entities = await MonksActiveTiles.getEntities(args, 'journal');

                if (entities.length == 0)
                    return;

                for (let entity of entities) {
                    //open journal
                    if (entity && action.data.showto != 'gm')
                        MonksActiveTiles.emit('journal', { showto: action.data.showto, userid: userid, entityid: entity.uuid, permission: action.data.permission, enhanced: action.data.enhanced });
                    if (MonksActiveTiles.allowRun && (action.data.showto == 'everyone' || action.data.showto == 'gm' || action.data.showto == undefined || (action.data.showto == 'trigger' && userid == game.user.id))) {
                        if (!game.modules.get("monks-enhanced-journal")?.active || action.data?.enhanced !== true || !game.MonksEnhancedJournal.openJournalEntry(entity))
                            entity.sheet.render(true);
                    }
                }

                return { entities: entities };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'journal');
                return `<span class="action-style">${i18n(trigger.name)}</span>, <span class="entity-style">${entityName}</span> for <span class="value-style">&lt;${i18n(trigger.values.showto[action.data?.showto])}&gt;</span>`;
            }
        },
        'openactor': {
            name: "MonksActiveTiles.action.openactor",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showPrevious: true, showTagger: true, showWithin: true, showPlayers: true },
                    restrict: (entity) => { return (entity instanceof Actor || entity instanceof Token); },
                    required: true,
                    defaultType: 'actor',
                    placeholder: 'Please select a Token or Actor'
                },
                {
                    id: "showto",
                    name: "MonksActiveTiles.ctrl.showto",
                    list: "showto",
                    type: "list"
                },
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
                let entities;
                if (action.data.entity.id == 'players') {
                    let user = game.users.get(userid);
                    if (user.isGM)
                        return;
                    entities = [user.character];
                } else
                    entities = await MonksActiveTiles.getEntities(args, 'actor');

                if (entities.length == 0)
                    return;

                for (let entity of entities) {
                    if (entity instanceof TokenDocument)
                        entity = entity.actor;
                    //open actor
                    if (entity && action.data.showto != 'gm')
                        MonksActiveTiles.emit('actor', { showto: action.data.showto, userid: userid, entityid: entity.uuid, permission: action.data.permission, enhanced: action.data.enhanced });
                    if (MonksActiveTiles.allowRun && (action.data.showto == 'everyone' || action.data.showto == 'gm' || action.data.showto == undefined || (action.data.showto == 'trigger' && userid == game.user.id))) {
                        entity.sheet.render(true);
                    }
                }

                return { entities: entities };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'actor');
                return `<span class="action-style">${i18n(trigger.name)}</span>, <span class="entity-style">${entityName}</span> for <span class="value-style">&lt;${i18n(trigger.values.showto[action.data?.showto])}&gt;</span>`;
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
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "item",
                    name: "MonksActiveTiles.ctrl.select-item",
                    type: "select",
                    subtype: "entity",
                    options: { showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Item); },
                    required: true,
                    placeholder: 'Please select an item',
                    defaultType: 'items'
                },
                {
                    id: "quantity",
                    name: "MonksActiveTiles.ctrl.quantity",
                    type: "number",
                    defvalue: 1,
                    min: 1,
                    step: 1,
                    help: "Set this to blank to use the items original quantity"
                },
                {
                    id: "distribute",
                    name: "MonksActiveTiles.ctrl.distribution",
                    list: "distribute",
                    type: "list"
                },
            ],
            values: {
                'distribute': {
                    'everyone': "MonksActiveTiles.distribute.everyone",
                    'single': "MonksActiveTiles.distribute.single",
                    'evenall': "MonksActiveTiles.distribute.evenall",
                    'even': "MonksActiveTiles.distribute.even"

                }
            },
            fn: async (args = {}) => {
                const { action } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let items = await MonksActiveTiles.getEntities(args, 'items', action.data.item);
                if (items?.length) {
                    let tokens = entities.filter(e => e instanceof TokenDocument && e.actor);
                    let dist = action.data?.distribute || "everyone";
                    let itemsTaken = (dist == "single" ? 1 : (dist == "evenall" ? Math.ceil(items.length / tokens.length) : (dist == "even" ? Math.floor(items.length / tokens.length) : items.length)));
                    for (let token of tokens) {
                        const actor = token.actor;
                        if (!actor) return;

                        let addItems = [];
                        for (let i = 0; i < itemsTaken; i++) {
                            let item = (dist == "everyone" ? items[i] : items.shift());

                            if (item && item instanceof Item) {
                                const itemData = item.toObject();
                                if (action.data?.quantity) {
                                    switch (game.system.id) {
                                        case "pf2e":
                                            itemData.data.quantity = { value: action.data?.quantity };
                                            break;
                                        case "gurps":
                                            itemData.data.eqt.count = action.data?.quantity;
                                            break;
                                        default:
                                            itemData.data.quantity = action.data?.quantity;
                                            break;
                                    }
                                }
                                addItems.push(itemData);
                            }
                        }

                        // Create the owned item
                        await actor.createEmbeddedDocuments("Item", addItems);
                    }
                }

                return { tokens: entities, entities: entities, items: items };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let item = await MonksActiveTiles.entityName(action.data?.item, "items"); //await fromUuid(action.data?.item.id);
                return `<span class="action-style">${i18n(trigger.name)}</span>, Add <span class="value-style">&lt;${action.data?.quantity || "item's quantity"}&gt;</span> <span class="details-style">"${item?.name || item || 'Unknown Item'}"</span> to <span class="entity-style">${entityName}</span>`;
            }
        },
        'removeitem': {
            name: "MonksActiveTiles.action.removeitem",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "item",
                    name: "MonksActiveTiles.ctrl.select-item",
                    type: "text",
                    required: true,
                    placeholder: 'Please enter an item name'
                },
                {
                    id: "quantity",
                    name: "MonksActiveTiles.ctrl.quantity",
                    type: "number",
                    defvalue: 1,
                    min: 1,
                    step: 1
                },
            ],
            fn: async (args = {}) => {
                const { action } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let quantity = parseInt(action.data.quantity);
                if (quantity < 1)
                    quantity = 1;

                for (let token of entities) {
                    if (token instanceof TokenDocument) {
                        const actor = token.actor;
                        if (!actor) return;

                        let item = actor.data.items.find(i => i.name == action.data.item);
                        if (item) {
                            let itemQuantity = (item.data.data.quantity.hasOwnProperty("value") ? item.data.data.quantity.value : item.data.data.quantity);
                            if (itemQuantity <= quantity) {
                                await item.delete();
                            } else {
                                itemQuantity -= quantity;
                                await item.update({ data: { quantity: (item.data.data.quantity.hasOwnProperty("value") ? { value: itemQuantity } : itemQuantity) }});
                            }
                        }
                    }
                }

                return { tokens: entities, entities: entities };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="action-style">${i18n(trigger.name)}</span>, Remove <span class="value-style">&lt;${action.data?.quantity || "item's quantity"}&gt;</span> <span class="details-style">"${action.data?.item || 'Unknown Item'}"</span> from <span class="entity-style">${entityName}</span>`;
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
                    required: true,
                    subtype: "entity",
                    options: { showPrevious: true, showTagger: true },
                    restrict: (entity) => {
                        return (
                            entity instanceof Token ||
                            entity instanceof Note ||
                            entity instanceof JournalEntry ||
                            entity instanceof Scene ||
                            entity instanceof Actor
                        );
                    },
                    defaultType: 'journal',
                    placeholder: 'Please select an entity',
                    help: 'You can change permissions for Journals, Notes, Tokens, Actors, or Scenes'
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
                    let lvl = level;
                    if (entity instanceof Scene)
                        lvl = CONST.ENTITY_PERMISSIONS.OBSERVER;
                    const perms = entity.data.permission || entity?.actor?.data.permission;
                    if (action.data.changefor == 'trigger') {
                        let user = game.users.get(userid);
                        if (!user.isGM) {
                            if (action.data.permission == 'default')
                                delete perms[user.id];
                            else
                                perms[user.id] = lvl;
                        }
                    } else {
                        if (action.data.permission == 'default') {
                            for (let user of game.users.contents) {
                                if (user.isGM) continue;
                                delete perms[user.id];
                            }
                        }else
                            perms.default = lvl;
                    }

                    await entity.setFlag('monks-active-tiles', 'prevent-cycle', true); 
                    await entity.update({ permission: perms }, { diff: false, render: true, recursive: false, noHook: true });
                    await entity.unsetFlag('monks-active-tiles', 'prevent-cycle');
                }
                game.settings.set('monks-active-tiles', 'prevent-cycle', false);
                //MonksActiveTiles.preventCycle = false;

                let result = { entities: entities };
                if (entities[0] instanceof TokenDocument)
                    result.tokens = entities;
                return result;
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="action-style">${i18n(trigger.name)}</span> of <span class="entity-style">${entityName}</span> to <span class="details-style">"${i18n(trigger.values.permissions[action.data?.permission])}"</span> for <span class="value-style">&lt;${i18n(trigger.values.showto[action.data?.changefor])}&gt;</span>`;
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
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Token ); }
                },
                {
                    id: "actor",
                    name: "MonksActiveTiles.ctrl.select-actor",
                    type: "select",
                    subtype: "entity",
                    restrict: (entity) => { return (entity instanceof Actor || entity instanceof Token); },
                    required: true,
                    defaultType: 'actors',
                    placeholder: 'Please select an Actor to perform attack'
                },
                {
                    id: "attack",
                    name: "MonksActiveTiles.ctrl.attack",
                    list: async function (data) {
                        if (!data?.actor?.id)
                            return;

                        let actor = await fromUuid(data?.actor?.id);
                        if (actor && actor instanceof TokenDocument)
                            actor = actor.actor;
                        if (!actor)
                            return;

                        let result = [];
                        let types = ['weapon', 'spell', 'melee', 'ranged', 'action', 'attack', 'object'];

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
                    type: "list",
                    required: true
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
                    type: "checkbox",
                    help: "If you're wanting to integrate with MidiQol, turn this on."
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
                    if (actor && actor instanceof TokenDocument)
                        actor = actor.actor;
                    if (actor) {
                        let item = actor.items.get(action.data?.attack?.id);

                        if (item) {
                            if (action.data?.rollattack && item.useAttack)
                                item.useAttack({ skipDialog: true });
                            else if (action.data?.rollattack && item.roll)
                                item.roll({ rollMode: (action.data?.rollmode || 'roll') });
                            else if (item.displayCard)
                                item.displayCard({ rollMode: (action.data?.rollmode || 'roll'), createMessage: true }); //item.roll({configureDialog:false});
                            else if (item.toChat)
                                item.toChat(); //item.roll({configureDialog:false});
                        } else
                            warn(`Could not find the attack item when using the attack action`);
                    } else
                        warn(`Could not find actor when using the attack action`);
                }

                return { tokens: entities, entities: entities };
            },
            content: async (trigger, action) => {
                if (!action.data?.actor.id)
                    return i18n(trigger.name);
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let actor = await fromUuid(action.data?.actor.id);
                if (actor && actor instanceof TokenDocument)
                    actor = actor.actor;
                let item = actor?.items?.get(action.data?.attack?.id);
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span> using <span class="details-style">"${actor?.name || 'Unknown Actor'}: ${item?.name || 'Unknown Item'}"</span>`;
            }
        },
        'trigger': {
            name: "MonksActiveTiles.action.trigger",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-tile",
                    type: "select",
                    subtype: "entity",
                    required: true,
                    options: { showTile: true, showTagger: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Tile); },
                    defaultType: 'tiles',
                    placeholder: "Please select a Tile"
                },
                {
                    id: "token",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
            ],
            fn: async (args = {}) => {
                const { tile, userid, action, method } = args;
                let entities = await MonksActiveTiles.getEntities(args, 'tiles');
                if (entities.length == 0)
                    return;

                let tokens = await MonksActiveTiles.getEntities(args, "tokens", (action.data?.token || { id: "previous" }));
                //if (tokens.length == 0)
                //    return;

                //if (MonksActiveTiles.triggered == undefined)
                //    MonksActiveTiles.triggered = [];

                let promises = [];
                for (let entity of entities) {
                    if (!(entity instanceof TileDocument))
                        continue;
                    //Add this trigger if it's the original one
                    //MonksActiveTiles.triggered.push(tile.id);

                    let newargs = Object.assign({}, args, { tokens: tokens, tile: entity, method: "trigger", options: { originalMethod: method } });
                    promises.push(entity.trigger.call(entity, newargs));

                    //remove this trigger as it's done
                    //MonksActiveTiles.triggered.pop();
                }

                return Promise.all(promises).then((results) => {
                    let value = {};
                    for (let result of results) {
                        mergeObject(value, result.value);
                    }
                    return value;
                });
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                return `<span class="action-style">${i18n(trigger.name)}</span>, <span class="entity-style">${entityName}</span>`;
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
                        let result = {"_active": "-- Active Scene --", "_previous": "-- Current Scene Collection --"};
                        for (let s of game.scenes)
                            result[s.id] = s.name;
                        return result;
                    },
                    type: "list",
                    required: true
                },
                {
                    id: "activate",
                    name: "MonksActiveTiles.ctrl.activate",
                    type: "checkbox"
                }
            ],
            fn: async (args = {}) => {
                const { action, userid, value } = args;
                let scene;

                if (action.data.sceneid == "_previous")
                    scene = value.scenes && value.scenes.length ? value.scenes[0] : null;
                else
                    scene = game.scenes.find(s => (action.data.sceneid == "_active" ? s.active : s.id == action.data.sceneid));

                if (scene) {
                    if (game.user.id == userid || action.data.activate)
                        await (action.data.activate ? scene.activate() : scene.view());
                    else
                        MonksActiveTiles.emit('switchview', { userid: [userid], sceneid: scene.id });
                }
            },
            content: async (trigger, action) => {
                let scene = game.scenes.find(s => (action.data.sceneid == "_active" ? s.active : s.id == action.data.sceneid));
                return `<span class="action-style">${i18n(trigger.name)}</span> to <span class="detail-style">"${action.data.sceneid == "_active" ? "(Active Scene)": ""} ${scene?.name || "Unknown Scene"}"</span>${(action.data.activate ? ' <i class="fas fa-bullseye" title="Activate Scene"></i>' : '')}`
            }
        },
        'scenebackground': {
            name: "MonksActiveTiles.action.scenebackground",
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
                    type: "list",
                    required: true
                },
                {
                    id: "img",
                    name: "MonksActiveTiles.ctrl.image",
                    type: "filepicker",
                    subtype: "image",
                    required: true
                }
            ],
            fn: async (args = {}) => {
                const { action, userid } = args;
                let scene = game.scenes.find(s => s.id == action.data.sceneid);
                scene.update({img: action.data.img});
            },
            content: async (trigger, action) => {
                let scene = game.scenes.find(s => s.id == action.data.sceneid);
                return `<span class="action-style">${i18n(trigger.name)}</span> set <span class="detail-style">"${scene?.name}"</span> to <span class="value-style">&lt;${action.data.img}&gt;</span>`
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
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token); },
                    defaultType: 'tokens'
                },
                {
                    id: "addto",
                    name: "Add to Combat",
                    type: "list",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    list: 'add',
                    defvalue: 'add'
                },
                {
                    id: "start",
                    name: "MonksActiveTiles.ctrl.startcombat",
                    type: "checkbox",
                    conditional: (app) => { return $('select[name="data.addto"]', app.element).val() == "add"  }
                }
            ],
            values: {
                'add': {
                    "add": 'MonksActiveTiles.add.add',
                    "remove": 'MonksActiveTiles.add.remove',
                }
            },
            fn: async (args = {}) => {
                const { action } = args;

                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let combat = game.combats.viewed;
                if (!combat) {
                    if (action.data.addto == "remove")
                        return;
                    const cls = getDocumentClass("Combat")
                    combat = await cls.create({ scene: canvas.scene.id, active: true });
                }

                if (action.data.addto == "remove") {
                    let combatants = entities.filter(t => t instanceof TokenDocument && t.inCombat).map(t => { return combat.getCombatantByToken(t.id); });
                    await combat.deleteEmbeddedDocuments("Combatant", combatants);
                } else {
                    let tokens = entities.filter(t => t instanceof TokenDocument && !t.inCombat).map(t => { return { tokenId: t.id, actorId: t.data.actorId, hidden: t.data.hidden } });
                    await combat.createEmbeddedDocuments("Combatant", tokens);

                    if (combat && action.data.start && !combat.started)
                        combat.startCombat();
                }

                return { tokens: entities, entities: entities, combat: combat };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `Add <span class="entity-style">${entityName}</span> to <span class="action-style">Combat</span>${(action.data.start ? ' <i class="fas fa-fist-raised" title="Start Combat"></i>' : '')}`;
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
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "value",
                    name: "MonksActiveTiles.ctrl.value",
                    type: "text",
                    required: true,
                    help: "Use '+ value' to increase the value, or '- value' to decrease"
                }
            ],
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value, method } = args;
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

                        let context = {
                            actor: tokens[0]?.actor?.data,
                            token: tokens[0]?.data,
                            tile: tile.data,
                            entity: entity,
                            user: game.users.get(userid),
                            value: value,
                            scene: canvas.scene,
                            method: method
                        };
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

                    return { tokens: entities, entities: entities };
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let actionName = 'Set';
                let midName = 'to';
                let value = action.data?.value;
                if (action.data?.value.startsWith('+ ') || action.data?.value.startsWith('- ')) {
                    actionName = (action.data?.value.startsWith('+ ') ? "Increase" : "Decrease");
                    midName = "by";
                    value = action.data?.value.substring(2);
                }
                return `<span class="action-style">${actionName} elevation</span> of <span class="entity-style">${entityName}</span> ${midName} <span class="details-style">"${value}"</span>`;
            }
        },
        'resethistory': {
            name: "MonksActiveTiles.action.resethistory",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Tile); },
                    defaultType: 'tiles'
                }
            ],
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args, 'tiles');

                if (entities && entities.length > 0) {
                    for (let entity of entities) {
                        if(entity instanceof TileDocument)
                            await entity.resetHistory();
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                return `<span class="action-style">Reset Tile trigger history</span> for <span class="entity-style">${entityName}</span>`;
            }
        },
        'imagecycle': {
            name: "MonksActiveTiles.action.imagecycle",
            requiresGM: true,
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true },
                    restrict: (entity) => { return (entity instanceof Tile); },
                    defaultType: 'tiles'
                },
                {
                    id: "imgat",
                    name: "MonksActiveTiles.ctrl.imgat",
                    type: "number",
                    defvalue: 1
                },
                {
                    id: "random",
                    name: "MonksActiveTiles.ctrl.random",
                    type: "checkbox",
                    defvalue: false
                },
                {
                    id: "slot",
                    name: "MonksActiveTiles.ctrl.slotmachine",
                    type: "checkbox",
                    defvalue: false,
                    onClick: (app) => {
                        app.checkConditional();
                    }
                },
                {
                    id: "spins",
                    name: "MonksActiveTiles.ctrl.spins",
                    type: "number",
                    defvalue: 3,
                    conditional: (app) => { return $('input[name="data.slot"]', app.element).prop("checked") }
                },
                {
                    id: "speed",
                    name: "MonksActiveTiles.ctrl.rate",
                    type: "number",
                    defvalue: 1000,
                    conditional: (app) => { return $('input[name="data.slot"]', app.element).prop("checked") }
                },
                {
                    id: "files",
                    name: "MonksActiveTiles.ctrl.images",
                    type: "filelist",
                    required: true
                },
            ],
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args, 'tiles');

                tile._cycleimages = tile._cycleimages || {};
                let files = tile._cycleimages[action.id];
                if (files == undefined) {
                    let actfiles = (action.data?.files || []);
                    files = tile._cycleimages[action.id] = await MonksActiveTiles.getTileFiles(actfiles);
                }

                if (entities && entities.length > 0 && files.length > 0) {
                    let actions = duplicate(tile.getFlag('monks-active-tiles', 'actions'));
                    let act = actions.find(a => a.id == action.id);

                    let oldIdx = (act.data?.imgat || 1) - 1;
                    if (action.data.random === true)
                        act.data.imgat = Math.floor(Math.random() * files.length) + 1;
                    else
                        act.data.imgat = (Math.clamped((act.data?.imgat || 1), 1, files.length) % files.length) + 1;

                    let newIdx = (act.data?.imgat || 1) - 1;

                    await tile.setFlag('monks-active-tiles', 'actions', actions);

                    if (act.data.slot) {
                        let promises = [];
                        MonksActiveTiles.emit("slotmachine", { id: action.id, cmd: "prep", tileid: tile.uuid, entities: entities.map(e => { return { entityid: e.uuid } }) });
                        for (let entity of entities) {
                            promises.push(MonksActiveTiles.rollSlot(entity, files, oldIdx, newIdx, act.data.spins, act.data.speed));
                        }
                        return Promise.all(promises).then(() => {
                            return { entities: entities };
                        });
                    } else {
                        for (let entity of entities) {
                            if (files[act.data.imgat - 1])
                                await entity.update({ img: files[act.data.imgat - 1] });
                        }
                        return { entities: entities };
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                return `<span class="action-style">${i18n(trigger.name)}</span> for <span class="entity-style">${entityName}</span>${(action.data?.random ? ' <i class="fas fa-random" title="Pick a random image"></i>' : "")}`;
            }
        },
        'imagecycleset': {
            name: "MonksActiveTiles.action.imagecycleset",
            requiresGM: true,
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Tile); },
                    defaultType: 'tiles'
                },
                {
                    id: "imgat",
                    name: "MonksActiveTiles.ctrl.imgat",
                    type: "number",
                    defvalue: 1
                },
            ],
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args, 'tiles');

                if (entities && entities.length > 0) {
                    for (let entity of entities) {

                        let actions = duplicate(entity.getFlag('monks-active-tiles', 'actions'));
                        let act = actions.find(a => a.action == "imagecycle");

                        if (act) {
                            entity._cycleimages = entity._cycleimages || {};
                            let files = entity._cycleimages[act.id];
                            if (files == undefined) {
                                let actfiles = (act.data?.files || []);
                                files = entity._cycleimages[act.id] = await MonksActiveTiles.getTileFiles(actfiles);
                            }

                            act.data.imgat = Math.clamped((action.data?.imgat || 1), 1, files.length);

                            if (files[act.data.imgat - 1])
                                await entity.update({ img: files[act.data.imgat - 1] });

                            entity.setFlag('monks-active-tiles', 'actions', actions);
                        }
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                return `<span class="action-style">${i18n(trigger.name)}</span> to <span class="details-style">"${action.data.imgat}"</span> for <span class="entity-style">${entityName}</span>`;
            }
        },
        'delete': {
            name: "MonksActiveTiles.action.delete",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    required: true,
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => {
                        return (
                            entity instanceof Token ||
                            entity instanceof Tile ||
                            entity instanceof Wall ||
                            entity instanceof Drawing ||
                            entity instanceof Note || 
                            entity instanceof AmbientLight || 
                            entity instanceof AmbientSound ||
                            entity.terrain != undefined);
                    },
                    defaultType: 'tiles',
                    placeholder: 'Please select an entity',
                    help: 'You may delete Tokens, Tiles, Walls, Drawings, Notes, Lights, and Sounds'
                }
            ],
            fn: async (args = {}) => {
                let entities = await MonksActiveTiles.getEntities(args, 'tiles');

                let deleteIds = {};
                for (let entity of entities) {
                    if (!entity.data.locked) {
                        if (!deleteIds[entity.constructor.documentName])
                            deleteIds[entity.constructor.documentName] = [entity.id];
                        else
                            deleteIds[entity.constructor.documentName].push(entity.id);
                    }
                }

                for (let [k, v] of Object.entries(deleteIds)) {
                    if (v.length) {
                        await canvas.scene.deleteEmbeddedDocuments(k, v);
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span>`;
            }
        },
        'target': {
            name: "MonksActiveTiles.action.target",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "target",
                    name: "Select Targets",
                    type: "list",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    list: 'target',
                    defvalue: 'target'
                },
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => {
                        return entity instanceof Token;
                    },
                    conditional: (app) => { return $('select[name="data.target"]', app.element).val() == "target" },
                    defaultType: 'tokens'
                }
            ],
            values: {
                'target': {
                    "target": 'MonksActiveTiles.target.target',
                    "clear": 'MonksActiveTiles.target.clear',
                }
            },
            fn: async (args = {}) => {
                const { action, userid } = args
                let entities = await MonksActiveTiles.getEntities(args, 'tokens');

                let user = game.users.get(userid);
                if (action.data.target == "clear") {
                    user.targets.forEach(t => t.setTarget(false, { user: user, releaseOthers: true, groupSelection: false }));
                } else {
                    if (userid == game.user.id)
                        user.updateTokenTargets(entities.map(t => t.id));
                    else
                        MonksActiveTiles.emit("target", { userid: userid, tokens: entities.map(t => t.id) });
                }
            },
            content: async (trigger, action) => {
                if (action.data.target == "clear")
                    return `<span class="action-style">${i18n("MonksActiveTiles.target.clear")} targets</span>`;
                else {
                    let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tokens');
                    return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span>`;
                }
            }
        },
        'scenelighting': {
            name: "MonksActiveTiles.action.scenelighting",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "darkness",
                    name: "MonksActiveTiles.ctrl.darkness",
                    type: "slider",
                    defvalue: 1
                },
                {
                    id: "speed",
                    name: "MonksActiveTiles.ctrl.speed",
                    type: "number",
                    defvalue: 10
                },
            ],
            fn: async (args = {}) => {
                let { tile, action } = args;
                tile.parent.update({ darkness: action.data.darkness }, { animateDarkness: (action.data.speed * 1000) });
            },
            content: async (trigger, action) => {
                return `<span class="action-style">Change ${i18n(trigger.name)}</span> set darkness to <span class="details-style">"${action.data.darkness}"</span> after <span class="value-style">&lt;${action.data.speed} seconds&gt;</span>`;
            }
        },
        'globalvolume': {
            name: "MonksActiveTiles.action.globalvolume",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "volumetype",
                    name: "MonksActiveTiles.ctrl.volumetype",
                    type: "list",
                    defvalue: "globalAmbientVolume",
                    list: "volumetype"
                },
                {
                    id: "volume",
                    name: "MonksActiveTiles.ctrl.volume",
                    type: "slider",
                    defvalue: "1.0",
                    step: "0.05"
                },
            ],
            values: {
                'volumetype': {
                    "globalPlaylistVolume": 'MonksActiveTiles.volumetype.playlists',
                    "globalAmbientVolume": 'MonksActiveTiles.volumetype.ambient',
                    "globalInterfaceVolume": 'MonksActiveTiles.volumetype.interface',
                }
            },
            fn: async (args = {}) => {
                let { action } = args;

                $(`#global-volume input[name="${action.data.volumetype}"]`).val(action.data.volume).change();
            },
            content: async (trigger, action) => {
                return `<span class="action-style">Change ${i18n(trigger.name)}</span> set <span class="details-style">"${i18n(trigger.values.volumetype[action.data.volumetype])}"</span> to <span class="value-style">&lt;${action.data.volume}&gt;</span>`;
            }
        },
        'dialog': {
            name: "MonksActiveTiles.action.dialog",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "dialogtype",
                    name: "MonksActiveTiles.ctrl.dialogtype",
                    type: "list",
                    defvalue: "confirm",
                    list: "dialogtype",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                },
                {
                    id: "title",
                    name: "MonksActiveTiles.ctrl.title",
                    type: "text",
                },
                {
                    id: "content",
                    name: "MonksActiveTiles.ctrl.content",
                    type: "text",
                    subtype: "multiline",
                    required: true
                },
                /*{
                    id: "options",
                    name: "MonksActiveTiles.ctrl.options",
                    type: "text",
                },*/
                {
                    id: "yes",
                    name: "MonksActiveTiles.ctrl.onyes",
                    type: "text",
                    conditional: (app) => {
                        return $('select[name="data.dialogtype"]', app.element).val() == 'confirm';
                    },
                    placeholder: "Enter the name of the Anchor"
                },
                {
                    id: "no",
                    name: "MonksActiveTiles.ctrl.onno",
                    type: "text",
                    conditional: (app) => {
                        return $('select[name="data.dialogtype"]', app.element).val() == 'confirm';
                    },
                    placeholder: "Enter the name of the Anchor"
                },
            ],
            values: {
                'dialogtype': {
                    "confirm": 'MonksActiveTiles.dialogtype.confirm',
                    "alert": 'MonksActiveTiles.dialogtype.alert'
                }
            },
            fn: async (args = {}) => {
                let { action, tile, _id, value, tokens, userid } = args;

                let title = action.data.title;
                let content = action.data.content;

                if (userid == game.user.id)
                    MonksActiveTiles._showDialog(tile, tokens[0], value, action.data.dialogtype, title, content, action.data?.options, action.data.yes, action.data.no).then((results) => { tile.resumeActions(_id, results); });
                else {
                    MonksActiveTiles.emit("showdialog", {
                        _id, userid: userid,
                        tileid: tile.uuid,
                        tokenid: tokens[0]?.uuid,
                        value,
                        type: action.data.dialogtype,
                        title,
                        content,
                        options: action.data?.options,
                        yes: action.data.yes,
                        no: action.data.no
                    });
                }

                return { pause: true };
            },
            content: async (trigger, action) => {
                let msg = encodeURI(action.data.content.length <= 15 ? action.data.content : action.data.content.substr(0, 15) + "...");
                return `<span class="action-style">${i18n(trigger.name)}</span>, <span class="value-style">&lt;${i18n(trigger.values.dialogtype[action.data.dialogtype])}&gt;</span> "${msg}"`;
            }
        },
        'scrollingtext': {
            name: "MonksActiveTiles.action.scrollingtext",
            options: { allowDelay: true },
            ctrls: [
                {
                    id: "text",
                    name: "MonksActiveTiles.ctrl.text",
                    type: "text",
                    required: true
                },
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true }
                },
                {
                    id: "for",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "for",
                    type: "list"
                },
                {
                    id: "duration",
                    name: "MonksActiveTiles.ctrl.duration",
                    type: "number",
                    min: 0.1,
                    step: 0.1,
                    defvalue: 5
                },
                {
                    id: "anchor",
                    name: "MonksActiveTiles.ctrl.anchor",
                    list: "anchor",
                    type: "list",
                    defvalue: 0
                },
                {
                    id: "direction",
                    name: "MonksActiveTiles.ctrl.direction",
                    list: "anchor",
                    type: "list",
                    defvalue: 2
                },
            ],
            values: {
                'for': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm",
                    'token': "MonksActiveTiles.for.token"
                },
                'anchor': {
                    0: "Center",
                    1: "Bottom",
                    2: "Top",
                    3: "Left",
                    4: "Right"
                }
            },
            fn: async (args = {}) => {
                const { tile, action, userid, value, method } = args;

                let entities = await MonksActiveTiles.getEntities(args);

                for (let entity of entities) {
                    //Add a chat message
                    let user = game.users.find(u => u.id == userid);
                    let scene = game.scenes.find(s => s.id == user?.viewedScene);

                    let token = entity?.object;

                    let context = {
                        actor: token.actor.data,
                        token: token.data,
                        tile: tile.data,
                        user: game.users.get(userid),
                        value: value,
                        scene: scene,
                        method: method
                    };
                    let content = action.data.text;

                    if (content.includes("{{")) {
                        const compiled = Handlebars.compile(content);
                        content = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                    }

                    if (action.data.for != 'token') {
                        token.hud.createScrollingText(content, {
                            duration: action.data.duration * 1000,
                            anchor: parseInt(action.data.anchor),
                            direction: parseInt(action.data.direction)
                        });
                    }

                    if (action.data.for != 'gm') {
                        let owners = [];
                        if (token.actor) {
                            for (let [user, perm] of Object.entries(token.actor.data.permission)) {
                                if (perm >= CONST.DOCUMENT_PERMISSION_LEVELS.OWNER && !owners.includes(user))
                                    owners.push(user);
                            }
                        }

                        MonksActiveTiles.emit("scrollingtext", {
                            users: (action.data.for == 'token' ? owners : null),
                            tokenid: token.id,
                            content,
                            duration: action.data.duration * 1000,
                            anchor: parseInt(action.data.anchor),
                            direction: parseInt(action.data.direction)
                        });
                    }
                }
            },
            content: async (trigger, action) => {
                let msg = action.data.text.substr(0, 15);
                return `<span class="action-style">${i18n(trigger.name)}</span> for <span class="value-style">&lt;${i18n(trigger.values.for[action.data?.for])}&gt;</span> "${msg}..."`;
            }
        },
        'preload': {
            name: "MonksActiveTiles.action.preload",
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
                    type: "list",
                    required: true
                },
                {
                    id: "for",
                    name: "MonksActiveTiles.ctrl.for",
                    list: "for",
                    type: "list"
                }
            ],
            values: {
                'for': {
                    'all': "MonksActiveTiles.for.all",
                    'gm': "MonksActiveTiles.for.gm",
                    'token': "MonksActiveTiles.for.token"
                },
            },
            fn: async (args = {}) => {
                const { tile, action, userid, value, method } = args;

                if (action.data.for != "token" || game.user.id == userid)
                    await game.scenes.preload(action.data.sceneid);

                if (action.data.for != "gm")
                    MonksActiveTiles.emit('preload', { userid: action.data.for == "token" ? userid : null, sceneid: action.data.sceneid });
            },
            content: async (trigger, action) => {
                let scene = game.scenes.get(action.data.sceneid)
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="detail-style">"${scene.name || 'Unkown Scene'}"</span> for <span class="value-style">&lt;${i18n(trigger.values.for[action.data?.for])}&gt;</span>`;
            }
        },
        
        'distance': {
            name: "MonksActiveTiles.filter.distance",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "measure",
                    name: "Measure",
                    list: "measure",
                    type: "list",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    defvalue: 'lte'
                },
                {
                    id: "distance",
                    name: "MonksActiveTiles.ctrl.distance",
                    type: "number",
                    required: true,
                    variation: 'unit',
                    conditional: (app) => {
                        return $('select[name="data.measure"]', app.element).val() != 'lt';
                    },
                    defvalue: 1
                },
                {
                    id: "continue",
                    name: "Continue if",
                    list: "continue",
                    type: "list",
                    defvalue: 'within'
                }
            ],
            values: {
                'measure': {
                    'lt': "inside tile",
                    'lte': "less than",
                    'eq': "within",
                    'gt': "greater than"
                },
                'continue': {
                    "always": "Always",
                    "within": "Any Within Distance",
                    "all": "All Within Distance"
                },
                'unit': {
                    'sq': "grid sq.",
                    'px': "pixel"
                }
            },
            group: "filters",
            fn: async (args = {}) => {
                const { tile, value, action } = args;

                let midTile = { x: tile.data.x + (Math.abs(tile.data.width) / 2), y: tile.data.y + (Math.abs(tile.data.height) / 2)};

                let entities = await MonksActiveTiles.getEntities(args);

                let tokens = entities.filter(t => {
                    if (!(t instanceof TokenDocument))
                        return false;

                    const midToken = { x: t.data.x + ((Math.abs(t.data.width) * canvas.grid.w) / 2), y: t.data.y + ((Math.abs(t.data.height) * canvas.grid.h) / 2) };

                    if (action.data.measure == 'lt') {
                        return tile.pointWithin(midToken);
                    } else {
                        let distance = parseInt(action.data?.distance.value || action.data?.distance || 0);
                        if (action.data.distance.var == 'sq')
                            distance = (t.parent.data.grid * distance);

                        //need to find a ray between the center of the tile and the token
                        //find out where it crosses the edge of the Tile
                        //take the distance from that point to the center of the token, minus the tokens radius.

                        const tokenRay = new Ray({ x: midToken.x, y: midToken.y }, { x: midTile.x, y: midTile.y });

                        let segments = MonksActiveTiles.getTileSegments(tile);
                        let intersect = segments.filter(s => foundry.utils.lineSegmentIntersects(tokenRay.A, tokenRay.B, s.a, s.b))
                            .map(s => foundry.utils.lineSegmentIntersection(tokenRay.A, tokenRay.B, s.a, s.b));

                        if (intersect.length == 0) {
                            //it's within the tile
                            return action.data.measure == 'lte';
                        } else {
                            const dist = Math.hypot(intersect[0].x - midToken.x, intersect[0].y - midToken.y) - ((Math.abs(t.data.width) * canvas.grid.w) / 2);
                            debug('token within', dist);

                            return (action.data.measure == 'gt' ? dist > distance : dist <= distance && dist > -(Math.abs(t.data.width) * canvas.grid.w));
                        }
                    }
                });

                let cont = (action.data?.continue == 'always'
                    || (action.data?.continue == 'within' && tokens.length > 0)
                    || (action.data?.continue == 'all' && tokens.length == value["tokens"].length && tokens.length > 0));

                return { continue: cont, tokens: tokens };
            },
            content: async (trigger, action) => {
                let unit = (action.data.distance.var == 'sq' ? 'grid square' : 'pixels');
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="filter-style">Filter</span> <span class="entity-style">${entityName}</span> ${action.data.measure != 'lte' ? 'by a distance' : 'that are'} <span class="entity-style">${trigger.values.measure[action.data.measure || 'eq']}</span>${(action.data.measure != 'lt' ? ` <span class="details-style">"${action.data?.distance.value || action.data?.distance || 0}"</span> ${unit} of this Tile` : '')} ${(action.data?.continue != 'always' ? ', Continue if ' + (action.data?.continue == 'within' ? 'Any Within Distance' : 'All Within Distance') : '')}`;
            }
        },
        'exists': {
            name: "MonksActiveTiles.filter.exists",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "collection",
                    name: "Collection",
                    list: "collection",
                    type: "list",
                    onChange: (app, ctrl) => {
                        $('input[name="data.entity"]', app.element).next().html('Current collection of ' + $(ctrl).val());
                    },
                    conditional: (app) => {
                        let entity = JSON.parse($('input[name="data.entity"]', app.element).val() || "{}");
                        return entity?.id == 'previous';
                    },
                    defvalue: 'tokens'
                },
                {
                    id: "count",
                    name: "MonksActiveTiles.ctrl.count",
                    type: "text",
                    required: true,
                    defvalue: "> 0"
                },
                {
                    id: "none",
                    name: "If none exist goto",
                    type: "text",
                    placeholder: "Leave blank to stop"
                },
            ],
            values: {
                'collection': {
                    'actors': "Actors",
                    'drawings': "Drawings",
                    'items': "Items",
                    'journals': "Journal Entries",
                    'macros': "Macros",
                    'scene': "Scene",
                    'tiles': "Tiles",
                    'tokens': "Tokens",
                    'walls': "Walls"
                }
            },
            group: "filters",
            fn: async (args = {}) => {
                let { tokens, tile, userid, value, method, action } = args;
                let entities = await MonksActiveTiles.getEntities(args, action.data?.collection || "tokens");

                let goto = action.data?.none || "";

                if (goto.includes("{{")) {
                    let context = {
                        actor: tokens[0]?.actor?.data,
                        token: tokens[0]?.data,
                        tile: tile.data,
                        user: game.users.get(userid),
                        value: value,
                        scene: canvas.scene,
                        method: method
                    };

                    const compiled = Handlebars.compile(goto);
                    goto = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                }

                let count = action.data?.count ?? "> 0";
                if (count.startsWith("="))
                    count = "=" + count;

                let cando = false;
                try {
                    cando = !!eval(entities.length + " " + count);
                } catch {
                }

                let result = { continue: (cando || goto != "") };
                result[action.data?.collection || "tokens"] = entities;
                if (goto != "" && !cando)
                    result.goto = goto;

                return result;
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, action.data?.collection);
                let goto = action.data?.none || "";
                let count = action.data?.count ?? "> 0";
                return `<span class="filter-style">Check entity count, Continue if</span> <span class="entity-style">${entityName}</span> <span class="value-style">"${count}"</span>${goto != "" ? ' goto <span class="details-style">"' + goto + '"</span> if none exist' : ""}`;
            }
        },
        'triggercount': {
            name: "MonksActiveTiles.filter.triggercount",
            ctrls: [
                {
                    id: "count",
                    name: "MonksActiveTiles.ctrl.triggercount",
                    type: "text",
                    required: true,
                    defvalue: "> 1"
                },
                {
                    id: "unique",
                    name: "Unique token triggers",
                    type: "checkbox",
                },
                {
                    id: "none",
                    name: "If no success goto",
                    type: "text",
                    placeholder: "Leave blank to stop"
                },
            ],
            group: "filters",
            fn: async (args = {}) => {
                let { tokens, tile, userid, value, method, action } = args;

                let goto = action.data?.none || "";

                if (goto.includes("{{")) {
                    let context = {
                        actor: tokens[0]?.actor?.data,
                        token: tokens[0]?.data,
                        tile: tile.data,
                        user: game.users.get(userid),
                        value: value,
                        scene: canvas.scene,
                        method: method
                    };

                    const compiled = Handlebars.compile(goto);
                    goto = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                }

                let count = action.data?.count ?? "> 1";
                if (count.startsWith("="))
                    count = "=" + count;

                let cando = false;
                try {
                    cando = !!eval(tile.countTriggered(action.data.unique ? "unique" : null) + " " + count);
                } catch {
                }

                let result = { continue: (cando || goto != "") };
                if (goto != "" && !cando)
                    result.goto = goto;

                return result;
            },
            content: async (trigger, action) => {
                let goto = action.data?.none || "";
                let count = action.data?.count ?? "> 0";
                return `<span class="filter-style">Continue if</span> Tile triggered <span class="value-style">"${count}"</span> times ${action.data.unique ? "by unique tokens " : ""} ${goto != "" ? ` goto <span class="details-style">"${goto}"</span> if it hasn't` : ""}`;
            }
        },
        'tokencount': {
            name: "MonksActiveTiles.filter.tokencount",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "count",
                    name: "MonksActiveTiles.ctrl.tokencount",
                    type: "text",
                    required: true,
                    defvalue: "= 1"
                },
            ],
            group: "filters",
            fn: async (args = {}) => {
                let { action, tile } = args;

                let count = action.data?.count ?? "= 1";
                if (count.startsWith("="))
                    count = "=" + count;

                let entities = await MonksActiveTiles.getEntities(args);
                entities = entities.filter(e => {
                    let cando = false;
                    try {
                        cando = !!eval(tile.countTriggered(e.id) + " " + count);
                    } catch {
                    }
                    return cando
                })

                return { tokens: entities };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let goto = action.data?.none || "";
                let count = action.data?.count ?? "> 0";
                return `<span class="filter-style">Filter</span> <span class="entity-style">${entityName}</span> by trigger count <span class="value-style">"${count}"</span>${goto != "" ? ` goto <span class="details-style">"${goto}"</span> if none have` : ""}`;
            }
        },
        'first': {
            name: "MonksActiveTiles.filter.first",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "collection",
                    name: "Collection",
                    list: "collection",
                    type: "list",
                    onChange: (app, ctrl) => {
                        $('input[name="data.entity"]', app.element).next().html('Current collection of ' + $(ctrl).val());
                    },
                    conditional: (app) => {
                        let entity = JSON.parse($('input[name="data.entity"]', app.element).val() || "{}");
                        return entity?.id == 'previous';
                    },
                    defvalue: 'tokens'
                },
                {
                    id: "position",
                    name: "MonksActiveTiles.ctrl.position",
                    type: "text",
                    required: true,
                    defvalue: "first",
                    help: "you can also use <i>first</i>, <i>last</i>, or <i>random</i> to select a spot"
                },
            ],
            values: {
                'collection': {
                    'actors': "Actors",
                    'drawings': "Drawings",
                    'items': "Items",
                    'journals': "Journal Entries",
                    'macros': "Macros",
                    'scene': "Scene",
                    'tiles': "Tiles",
                    'tokens': "Tokens",
                    'walls': "Walls"
                }
            },
            group: "filters",
            fn: async (args = {}) => {
                let { value, action } = args;

                let entities = await MonksActiveTiles.getEntities(args, action.data?.collection || "tokens");

                if (entities && entities.length) {
                    let position = action.data?.position ?? "first";
                    if (position == "first")
                        position = 0;
                    else if (position == "last")
                        position = entities.length - 1;
                    else if (position == "random")
                        position = Math.floor(Math.random() * entities.length);
                    else
                        position = position - 1;

                    position = Math.clamped(position, 0, entities.length - 1);
                    let entity = entities[position];

                    let result = {};
                    MonksActiveTiles.addToResult(entity, result);

                    return result;
                } else
                    return { tokens: [] };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let position = action.data?.position ?? "first";
                return `<span class="filter-style">Limit</span> <span class="entity-style">${entityName}</span> to <span class="value-style">"${position}"</span> in the list`;
            }
        },
        'attribute': {
            name: "MonksActiveTiles.filter.attribute",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => {
                        return (entity instanceof Token ||
                            entity instanceof Tile ||
                            entity instanceof Drawing ||
                            entity instanceof Note ||
                            entity instanceof AmbientLight ||
                            entity instanceof AmbientSound ||
                            entity instanceof Wall ||
                            entity.terrain != undefined);
                    }
                },
                {
                    id: "collection",
                    name: "Collection",
                    list: "collection",
                    type: "list",
                    onChange: (app, ctrl) => {
                        $('input[name="data.entity"]', app.element).next().html('Current collection of ' + $(ctrl).val());
                    },
                    conditional: (app) => {
                        let entity = JSON.parse($('input[name="data.entity"]', app.element).val() || "{}");
                        return entity?.id == 'previous';
                    },
                    defvalue: 'tokens'
                },
                {
                    id: "attribute",
                    name: "MonksActiveTiles.ctrl.attribute",
                    type: "text",
                    required: true
                },
                {
                    id: "value",
                    name: "MonksActiveTiles.ctrl.value",
                    type: "text",
                    required: true,
                },
            ],
            values: {
                'collection': {
                    'actors': "Actors",
                    'items': "Items",
                    'journals': "Journal Entries",
                    'tokens': "Tokens",
                    'walls': "Walls"
                }
            },
            group: "filters",
            fn: async (args = {}) => {
                let { action, value, tokens, tile, method } = args;

                let entities = await MonksActiveTiles.getEntities(args, action.data?.collection || "tokens");

                let result = entities.filter(entity => {
                    let attr = action.data.attribute;
                    let base = entity;

                    if (!attr.startsWith('flags')) {
                        if (!hasProperty(base.data, attr) && entity instanceof TokenDocument) {
                            base = entity.actor;
                            attr = 'data.' + attr;
                        }

                        if (!hasProperty(base.data, attr)) {
                            warn("Couldn't find attribute", entity, attr);
                            return false;
                        }
                    }

                    let prop = getProperty(base.data, attr);

                    if (prop && (typeof prop == 'object')) {
                        if (prop.value == undefined) {
                            debug("Attribute returned an object and the object doesn't have a value property", entity, attr, prop);
                            return false;
                        }

                        attr = attr + '.value';
                        prop = prop.value;
                    }

                    let val = action.data.value;

                    if (val === 'true') return prop == true;
                    else if (val === 'false') return prop == false;
                    else {
                        if (val.includes("{{")) {
                            let context = {
                                actor: tokens[0]?.actor?.data,
                                token: tokens[0]?.data,
                                tile: tile.data,
                                entity: entity,
                                user: game.users.get(userid),
                                value: value,
                                scene: canvas.scene,
                                method: method
                            };
                            const compiled = Handlebars.compile(val);
                            val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                        }

                        if (val.startsWith('= '))
                            val = '=' + val;

                        let stmt = (prop instanceof Array ? `[${prop.map(v => typeof v == 'string' ? '"' + v + '"' : v).join(',')}].includes(${val})` : (typeof prop == 'string' ? `"${prop}"` : prop) + ' ' + val);
                        stmt = stmt.replace("and", "&& " + prop).replace("or", "|| " + prop);

                        try {
                            return eval(stmt);
                        } catch {
                            return false;
                        }
                    }
                });

                let retval = {};
                retval[action.data?.collection || "tokens"] = result;
                return retval;
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, action.data?.collection);
                return `<span class="filter-style">Find</span> <span class="entity-style">${entityName}</span> with <span class="value-style">&lt;${action.data?.attribute}&gt;</span> <span class="details-style">"${action.data?.value}"</span>`;
            }
        },
        'inventory': {
            name: "MonksActiveTiles.filter.inventory",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => {
                        return (entity instanceof Token);
                    }
                },
                {
                    id: "item",
                    name: "MonksActiveTiles.ctrl.itemname",
                    type: "text",
                    required: true
                },
                {
                    id: "count",
                    name: "MonksActiveTiles.ctrl.itemcount",
                    type: "text",
                    required: true,
                    defvalue: "> 0"
                },
            ],
            group: "filters",
            fn: async (args = {}) => {
                let { action, value, tokens, tile } = args;

                let count = action.data?.count ?? "= 1";
                if (count.startsWith("="))
                    count = "=" + count;

                let entities = await MonksActiveTiles.getEntities(args, action.data?.collection || "tokens");

                let result = entities.filter(entity => {
                    if (!entity.actor)
                        return false;
                    let item = entity.actor.items.filter(i => i.name == action.data.item);

                    let cando = false;
                    try {
                        cando = !!eval(item.length + " " + count);
                    } catch {
                    }
                    return cando;
                });

                return { tokens: result };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, action.data?.collection);
                let count = action.data?.count ?? "> 0";
                return `<span class="filter-style">Find</span> <span class="entity-style">${entityName}</span> with item <span class="value-style">&lt;${action.data?.item}&gt;</span> <span class="value-style">"${count}"</span>`;
            }
        },
        'playertype': {
            name: "MonksActiveTiles.logic.playertype",
            ctrls: [
                {
                    id: "gm",
                    name: "MonksActiveTiles.ctrl.gmredirect",
                    type: "text",
                },
                {
                    id: "player",
                    name: "MonksActiveTiles.ctrl.playerredirect",
                    type: "text",
                }
            ],
            group: "logic",
            fn: async (args = {}) => {
                let { action, userid } = args;

                let user = game.users.get(userid);
                if (user.isGM) {
                    if (action.data.gm)
                        return { goto: action.data.gm };
                    else
                        return { continue: false };
                } else {
                    if (action.data.player)
                        return { goto: action.data.player };
                    else
                        return { continue: false };
                }
            },
            content: async (trigger, action) => {
                let gmredirect = (action.data.gm ? `<span class="entity-style">GM</span> to <span class="value-style">&lt;${action.data.gm}&gt;</span>` : "");
                let playerredirect = (action.data.player ? `<span class="entity-style">Player</span> to <span class="value-style">&lt;${action.data.player}&gt;</span>` : "");
                return `<span class="filter-style">Redirect player</span> ${gmredirect} ${playerredirect}`;
            }
        },
        'anchor': {
            name: "MonksActiveTiles.logic.anchor",
            ctrls: [
                {
                    id: "tag",
                    name: "MonksActiveTiles.ctrl.name",
                    type: "text",
                    required: true,
                    placeholder: 'Please enter the name of '
                },
                {
                    id: "stop",
                    name: "MonksActiveTiles.ctrl.stopwhenreached",
                    type: "checkbox"
                }
            ],
            group: "logic",
            fn: async (args = {}) => {
                const { action } = args;

                if(action.data.stop)
                    return { continue: false };
            },
            content: async (trigger, action) => {
                return `<span class="logic-style">${i18n(trigger.name)}:</span> <span class="tag-style">${action.data?.tag}</span>${(action.data?.stop ? ' <i class="fas fa-stop" title="Stop when reached in code"></i>' : '')}`;
            }
        },
        'goto': {
            name: "MonksActiveTiles.logic.goto",
            ctrls: [
                {
                    id: "tag",
                    name: "MonksActiveTiles.ctrl.name",
                    type: "text",
                    placeholder: "Please enter an Anchor name",
                    required: true
                },
                {
                    id: "limit",
                    name: "MonksActiveTiles.ctrl.limit",
                    type: "number",
                    onBlur: (app) => {
                        app.checkConditional();
                    },
                },
                {
                    id: "resume",
                    name: "MonksActiveTiles.ctrl.resume",
                    type: "checkbox",
                    conditional: (app) => {
                        return $('input[name="data.limit"]', app.element).val() != '';
                    }
                }
            ],
            group: "logic",
            fn: async (args = {}) => {
                const { tokens, tile, userid, value, method, action } = args;

                let goto = action.data?.tag;
                if (goto.includes("{{")) {
                    let context = {
                        actor: tokens[0]?.actor?.data,
                        token: tokens[0]?.data,
                        tile: tile.data,
                        user: game.users.get(userid),
                        value: value,
                        scene: canvas.scene,
                        method: method
                    };

                    const compiled = Handlebars.compile(goto);
                    goto = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                }

                if (action.data?.limit) {
                    let loop = args.value.loop || {};
                    let loopval = (loop[action.id] || 0) + 1;
                    loop[action.id] = loopval;
                    if (loopval >= action.data?.limit)
                        return { continue: action.data?.resume };
                    else
                        return { goto: goto, loop: loop };
                } else
                    return { goto: goto };
            },
            content: async (trigger, action) => {
                return `<span class="logic-style">${i18n(trigger.name)}:</span> <span class="tag-style">${action.data?.tag}</span>${action.data?.limit ? ' limit by <span class="details-style">"' + action.data?.limit + '"</span>' : ''}${(action.data?.resume ? ' <i class="fas fa-forward" title="Resume after looping"></i>' : '')}`;
            }
        },
        'stop': {
            name: "MonksActiveTiles.logic.stop",
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => {
                        return (entity instanceof Tile);
                    },
                    defaultType: "tiles"
                },
            ],
            group: "logic",
            fn: async (args = {}) => {
                let { tile } = args;

                let entities = await MonksActiveTiles.getEntities(args, "tiles");

                if (entities.length) {
                    for (let entity of entities) {
                        if (tile.id == entity.id)
                            return { continue: false };
                        else
                            entity.setFlag('monks-active-tiles', 'continue', false);
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, "tiles");
                return `<span class="logic-style">${i18n(trigger.name)}</span> for <span class="entity-style">${entityName}</span>`;
            }
        }
    }

    static getActionFlag(val, flag) {
        if (!val)
            return "";
        switch (flag) {
            case "snap":
                return ` <i class="fas fa-compress" title="${i18n("MonksActiveTiles.SnapToGrid")}"></i>`;
        }
        return "";
    }

    static async getEntities(args, defaultType, entry) {
        const { tile, tokens, action, value, userid } = args;
        let id = entry?.id || action.data?.entity?.id;

        let entities = [];
        if (id == 'tile')
            entities = [tile];
        else if (id == 'token') {
            entities = tokens;
            for (let i = 0; i < entities.length; i++) {
                if (typeof entities[i] == 'string')
                    entities[i] = await fromUuid(entities[i]);
            }
        }
        else if (id == 'players') {
            entities = tile.parent.tokens.filter(t => {
                return t.actor != undefined && t.actor?.hasPlayerOwner && t.actor?.data.type != 'npc';
            });
        }
        else if (id == 'within') {
            //find all tokens with this Tile
            entities = tile.tokensWithin();
        }
        else if (id == 'controlled') {
            entities = canvas.tokens.controlled.map(t => t.document);
        }
        else if (id == undefined || id == '' || id == 'previous') {
            let deftype = (defaultType || 'tokens');
            entities = (deftype == 'tiles' && id != 'previous' ? [tile] : value[deftype]);
            entities = (entities instanceof Array ? entities : (entities ? [entities] : []));
            
            let collection = canvas[deftype == "tiles" ? "background" : deftype];
            if (collection) {
                for (let i = 0; i < entities.length; i++) {
                    let entity = entities[i];
                    if (typeof entity == "string") {
                        let newEnt = collection.get(entity);
                        if (newEnt?.document)
                            entities[i] = newEnt.document;
                    }
                }
            }
        }
        else if (id.startsWith('tagger')) {
            if (game.modules.get('tagger')?.active) {
                let entity = entry || action.data?.entity;
                let tag = id.substring(7);
                let options = {};
                if (!entity.match || entity.match == "any")
                    options.matchAny = true;
                if (entity.match == "exact")
                    options.matchExactly = true;

                if (entity.scene == "_all")
                    options.allScenes = true;
                else if (entity.scene !== "_active" && entity.scene)
                    options.sceneId = entity.scene;

                entities = Tagger.getByTag(tag, options);

                if (entity.scene == "_all")
                    entities = [].concat(...Object.values(entities));
            }
        }
        else if (id) {
            entities = (id.includes('Terrain') ? MonksActiveTiles.getTerrain(id) : await fromUuid(id));
            entities = [entities];
        } 

        return entities;
    }

    static async entityName(entity, defaultType) {
        let name = "";
        if (entity?.id == 'tile' || (defaultType == 'tiles' && (entity?.id == undefined || entity?.id == '')))
            name = i18n("MonksActiveTiles.ThisTile");
        else if (entity?.id == 'token')
            name = i18n("MonksActiveTiles.TriggeringToken");
        else if (entity?.id == 'players')
            name = i18n("MonksActiveTiles.PlayerTokens");
        else if (entity?.id == 'within')
            name = i18n("MonksActiveTiles.WithinTile");
        else if (entity?.id == 'controlled')
            name = i18n("MonksActiveTiles.Controlled");
        else if (entity?.id == undefined || entity?.id == '' || entity?.id == 'previous')
            name = game.i18n.format("MonksActiveTiles.CurrentCollection", { collection: (defaultType || "tokens")}); //(defaultType == 'tokens' || defaultType == undefined ? i18n("MonksActiveTiles.PreviousData") : 'Current ' + defaultType );
        else if (entity?.id.startsWith('tagger'))
            name = `<i class="fas fa-tag fa-sm"></i> ${entity.id.substring(7)}`;
        else if (entity?.id) {
            let document = (entity.id.includes('Terrain') ? MonksActiveTiles.getTerrain(entity.id) : await fromUuid(entity.id));
            if (document) {
                if (document.name) {
                    name = document.name;
                    if (document.parent && document.parent instanceof Playlist) {
                        name = document.parent.name + ": " + name;
                    }
                } else {
                    if (game.modules.get('tagger')?.active) {
                        let tags = Tagger.getTags(document);
                        if (tags.length)
                            name = tags[0];
                    }

                    if (!name)
                        name = document.documentName + ": " + document.id;
                }
            }
        }

        return name;
    }

    static async getLocation(_location, value, pt, userid) {
        let location = duplicate(_location);

        if (location.id == 'previous')
            location = value["location"];
        else if (location.id == 'origin')
            location = value["original"];
        else if (location.id == 'players') {
            let user = game.users.get(userid);
            if (user && user.character?.id) {
                let scene = game.scenes.get(user.viewedScene);
                if (scene) {
                    let token = scene.data.tokens.find(t => t.actor.id == user.character.id);
                    if (token) {
                        return {
                            x: token.data.x + ((Math.abs(token.data.width) * scene.dimensions.size) / 2),
                            y: token.data.y + ((Math.abs(token.data.height) * scene.dimensions.size) / 2),
                            scene: scene.id
                        };
                    }
                }
            }
        } else if (location.id == 'token')
            location = pt;

        location = (location instanceof Array ? location : [location]);

        for (let i = 0; i < location.length; i++) {
            let l = location[i];
            if (l == undefined)
                continue;

            if (l.id) {
                let dest;
                if (l.id.startsWith('tagger')) {
                    if (game.modules.get('tagger')?.active) {
                        let tag = l.id.substring(7);
                        let options = {};
                        if (!l.match || l.match == "any")
                            options.matchAny = true;
                        if (l.match == "exact")
                            options.matchExactly = true;

                        if (l.scene == "_all")
                            options.allScenes = true;
                        else if (l.scene !== "_active" && l.scene)
                            options.sceneId = l.scene;

                        let entities = Tagger.getByTag(tag, options);

                        if (l.scene == "_all")
                            entities = [].concat(...Object.values(entities));

                        if (entities.length) {
                            dest = entities[Math.floor(Math.random() * entities.length)];
                            if (entities.length > 1) {
                                let count = 0
                                while (dest.id == this.id && count < 50) {
                                    dest = entities[Math.floor(Math.random() * entities.length)];
                                    count++;
                                }
                            }
                        }
                    }
                } else {
                    //this is directing to an entity
                    try {
                        dest = await fromUuid(l.id);
                    } catch { }
                }
                if (dest) {
                    location[i] = {
                        x: dest.data.x + (Math.abs(dest.data.width) / 2),
                        y: dest.data.y + (Math.abs(dest.data.height) / 2),
                        width: Math.abs(dest.data.width),
                        height: Math.abs(dest.data.height),
                        scene: dest.parent.id
                    };
                } else
                    location[i] = null;
            } else {
                location[i] = {
                    x: l.x,
                    y: l.y,
                    scale: l.scale,
                    scene: l.sceneId || canvas.scene.id
                };
            }
        }
        return location.filter(l => !!l);
    }

    static async locationName(location) {
        let name = "";

        if (!location)
            return '';
        let sceneId = location.sceneId || canvas.scene.id;
        if (location.id) {
            if (location?.id == 'previous')
                name = "Current Location";
            else if (location.id == 'players')
                name = "Player's Token";
            else if (location?.id == 'token')
                name = "Triggering Token";
            else if (location?.id == 'origin')
                name = i18n("MonksActiveTiles.Origin");
            else if (location?.id.startsWith('tagger'))
                name = `<i class="fas fa-tag fa-sm"></i> ${location.id.substring(7)}`;
            else {
                //this is directing to an entity
                let document = await fromUuid(location.id);
                if (document) {
                    sceneId = document.parent.id;

                    if (document.name)
                        name = document.name
                    else {
                        if (game.modules.get('tagger')?.active) {
                            let tags = Tagger.getTags(document);
                            if (tags.length)
                                name = tags[0];
                        }

                        if (!name)
                            name = document.documentName + ": " + document.id;
                    }
                } else {
                    if (location.x || location.y)
                        name = `[${location.x},${location.y}${(location.scale ? `, scale:${location.scale}` : '')}]`;
                    else
                        name = "Unknown Location";
                }
            }
        } else {
            name = `[${location.x},${location.y}${(location.scale ? `, scale:${location.scale}` : '')}]`;
        }

        let scene = game.scenes.find(s => s.id == sceneId);
        return `${(scene?.id != canvas.scene.id ? 'Scene: ' + scene.name + ', ' : '')}${name}`;
    }

    static async getTileFiles(files) {
        let results = [];
        for (let file of files) {
            if (!file.name.includes('*'))
                results.push(file.name);
            else {
                let source = "data";
                let pattern = file.name;
                const browseOptions = { wildcard: true };

                if (typeof ForgeVTT != "undefined" && ForgeVTT.usingTheForge) {
                    source = "forgevtt";
                }

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
                    results = results.concat(content.files);
                } catch (err) {
                    debug(err);
                }
            }
        }
        return results;
    }

    static getTerrain(uuid) {
        let parts = uuid.split(".");

        let scene = game.scenes.get(parts[1]);
        let terrain = scene?.terrain.get(parts[3]);

        return terrain;
    }

    static async _executeMacro(macro, mainargs = {}) {
        const { tile, tokens, action, userid, values, value, method, pt } = mainargs;

        for (let i = 0; i < tokens.length; i++) {
            tokens[i] = (typeof tokens[i] == 'string' ? await fromUuid(tokens[i]) : tokens[i]);
        }

        let tkn = tokens[0];

        let user = game.users.get(userid);

        let context = {
            actor: tkn?.actor,
            token: tkn?.object,
            character: user.character,
            tile: tile.object,
            user: user,
            canvas: canvas,
            scene: canvas.scene,
            values: values,
            value: value,
            tokens: tokens,
            method: method,
            pt: pt,
            actionId: mainargs._id,
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

        let runasgm = (action.data.runasgm == 'player' || action.data.runasgm == 'gm' ? action.data.runasgm == 'gm' :
            (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active ? getProperty(macro, "data.flags.advanced-macros.runAsGM") || getProperty(macro, "data.flags.furnace.runAsGM") : true));

        if (runasgm || userid == game.user.id) {
            if (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active)
                return await (macro.data.type == 'script' ? macro.callScriptFunction(context) : macro.execute(args));
            else
                return await (macro.data.type == 'script' ? MonksActiveTiles._execute.call(macro, context) : macro.execute(args));
        } else {
            MonksActiveTiles.emit('runmacro', {
                userid: userid,
                macroid: macro.uuid,
                tileid: tile?.uuid,
                tokenid: tkn?.uuid,
                values: values,
                value: value,
                method: method,
                pt: pt,
                args: args,
                tokens: context.tokens.map(t => t.uuid),
                _id: mainargs._id
            });

            return { pause: true };
        }

        /*
        if (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active) {
            if (getProperty(macro, "data.flags.advanced-macros.runAsGM") || getProperty(macro, "data.flags.furnace.runAsGM") || userid == game.user.id) {
                //execute the macro if it's set to run as GM or it was the GM that actually moved the token.
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
                    method: method,
                    args: args,
                    tokens: context.tokens.map(t => t.uuid)
                });
            }
        } else {

            return await macro.execute(context);
        }*/
    }

    static async _execute(context) {
        if (setting('use-core-macro')) {
            return await this.execute(context);
        } else {
            try {
                return new Function(`"use strict";
            return (async function ({speaker, actor, token, character, args, scene}={}) {
                ${this.data.command}
                });`)().call(this, context);
            } catch (err) {
                ui.notifications.error(`There was an error in your macro syntax. See the console (F12) for details`);
                console.error(err);
            }
        }
    }

    static async _showDialog(tile, token, value, type, title, content, options, yes, no) {
        let context = { actor: token?.actor?.data, token: token?.data, tile: tile.data, user: game.user, value: value, scene: canvas.scene };
        let compiled = Handlebars.compile(title);
        title = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
        compiled = Handlebars.compile(content);
        content = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();

        let opts = {};
        try {
            opts = JSON.parse(options);
        } catch {}

        if (type == 'confirm') {
            return Dialog.confirm({
                title: title,
                content: content,
                yes: (html) => {
                    let data = (yes ? { goto: yes } : {});

                    const form = html[0].querySelector("form");
                    if (form) {
                        const fd = new FormDataExtended(form);
                        data = foundry.utils.mergeObject(data, fd.toObject());
                    }

                    if (!data.goto)
                        data.continue = false;

                    return data;
                },
                no: (html) => {
                    let data = (no ? { goto: no } : { });

                    const form = html[0].querySelector("form");
                    if (form) {
                        const fd = new FormDataExtended(form);
                        data = foundry.utils.mergeObject(data, fd.toObject());
                    }

                    if (!data.goto)
                        data.continue = false;

                    return data;
                },
                options: opts,
                rejectClose: true
            }).catch(() => { return { goto: no }; });
        } else if (type == 'alert') {
            return Dialog.prompt({
                title: title,
                content: content,
                callback: (html) => {
                    let data = { };
                    const form = html[0].querySelector("form");
                    if (form) {
                        const fd = new FormDataExtended(form);
                        data = foundry.utils.mergeObject(data, fd.toObject());
                    }

                    return data;
                },
                options: opts,
                rejectClose: true
            }).catch(() => { return {}; });
        }
    }

    static async rollSlot(entity, files, oldIdx, newIdx, spins, speed) {
        let t = entity._object;

        const container = new PIXI.Container();
        t.addChild(container);
        container.width = entity.data.width;
        container.height = entity.data.height;

        //Set the image clip region
        const mask = new PIXI.Graphics();
        mask.beginFill(0xFFFFFF);
        mask.drawRect(0, 0, entity.data.width, entity.data.height);
        mask.endFill();
        container.addChild(mask);
        container.mask = mask;

        //load all the files
        let sprites = [];
        for (let f of files) {
            let tex = await loadTexture(f);
            sprites.push(new PIXI.Sprite(tex));
        }

        //add them to the tile
        for (let s of sprites) {
            s.y = entity.data.height;
            s.width = entity.data.width;
            s.height = entity.data.height;
            container.addChild(s);
        }

        //hide the actual image
        t.children[0].visible = false;

        //set the current index and set the current file to be showing.
        let frames = [];
        frames.push({ sprite: sprites[oldIdx], idx: oldIdx });
        sprites[oldIdx].y = 0;
        MonksActiveTiles.emit("slotmachine", { cmd: "animate", entityid: entity.uuid, oldIdx, newIdx, spins, speed });

        //run the animation
        return CanvasAnimation._animatePromise(
            MonksActiveTiles.slotAnimate,
            t,
            `slot-machine${entity.id}`,
            { tile: t, frames: frames, sprites: sprites, idx: oldIdx, total: (sprites.length * spins) + (newIdx - oldIdx < 0 ? sprites.length + newIdx - oldIdx : newIdx - oldIdx) + 1 },
            speed
        ).then((t) => {
            MonksActiveTiles.emit("slotmachine", { cmd: "cleanup", entityid: entity.uuid });
            //clear all files, and the mask
            //update the tile
            entity._object.removeChild(container);
            entity._object.children[0].visible = true;
            entity.update({ img: files[newIdx] });
        });
    }

    static async slotAnimate(deltaTime, resolve, reject, attributes, duration) {
        let dt = (duration * PIXI.settings.TARGET_FPMS) / (deltaTime);// * (attributes.total < (attributes.sprites.length * 2) ? ((attributes.sprites.length * 2) - attributes.total) / 3 : 1));
        //cycle through all the images 8 times, 5 full speed, slowing down for the last to and positioning on the correct one for the last round
        //go through each frame
        let max = attributes.frames.length;
        for (let i = 0; i < max; i++) {
            let frame = attributes.frames[i];
            if (frame) {
                try {
                    //move the frame up on the x
                    let newY = frame.sprite.y - dt;

                    //if the current frame is completely off the Tile, then remove it from the frames
                    if (Math.abs(newY) >= attributes.tile.document.data.height) {
                        attributes.frames.shift();
                        i--;
                        max--;
                    } else if (newY < 0 && i == max - 1) {
                        //if the current frame hits negative, then add the next file to the frames
                        attributes.total--;
                        if (attributes.total == 0)
                            newY = 0;
                        else {
                            attributes.idx = (attributes.idx + 1) % attributes.sprites.length;
                            let sprite = attributes.sprites[attributes.idx];
                            let spriteY = attributes.tile.document.data.height + newY;
                            sprite.y = spriteY;
                            attributes.frames.push({ sprite: sprite, idx: attributes.idx });
                        }
                    }
                    frame.sprite.y = newY;
                } catch {
                }
            }
        }

        if (attributes.total == 0)
            resolve(true);
    }

    static findVacantSpot(pos, token, scene, dest, snap) {
        let tokenCollide = function (pt) {
            let ptWidth = (token.data.width * scene.data.size) / 2;
            let checkpt = duplicate(pt);
            if (snap) {
                checkpt.x += ((Math.abs(token.data.width) * scene.data.size) / 2);
                checkpt.y += ((Math.abs(token.data.height) * scene.data.size) / 2);
            }

            let found = scene.tokens.find(tkn => {
                if (token.id == tkn.id)
                    return false;

                let tokenX = tkn.data.x + ((Math.abs(tkn.data.width) * scene.data.size) / 2);
                let tokenY = tkn.data.y + ((Math.abs(tkn.data.height) * scene.data.size) / 2);

                let distSq = parseInt(Math.sqrt(Math.pow(checkpt.x - tokenX, 2) + Math.pow(checkpt.y - tokenY, 2)));
                let radSumSq = ((Math.abs(tkn.data.width) * scene.data.size) / 2) + ptWidth;

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
            if (dest && dest.width && dest.height) {
                let checkpt = duplicate(pt);
                if (snap) {
                    checkpt.x += ((Math.abs(token.data.width) * scene.data.size)/ 2);
                    checkpt.y += ((Math.abs(token.data.height) * scene.data.size) / 2);
                }

                //gr.lineStyle(2, 0x808080).drawRect(dest.data.x + debugoffset.x, dest.data.y + debugoffset.y, dest.data.width, dest.data.height);
                return (checkpt.x < dest.x || checkpt.y < dest.y || checkpt.x > dest.x + Math.abs(dest.width) || checkpt.y > dest.y + Math.abs(dest.height));
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
        const tw = (Math.abs(token.data.width) * scene.data.size);
        let dist = 0;
        let angle = null;
        let rotate = 1; //should be set first thing, but if it isn't just make sure it's not 0
        let spot = duplicate(pos);
        let checkspot = duplicate(spot);
        if (snap) {
            checkspot.x -= ((Math.abs(token.data.width) * scene.data.size) / 2);
            checkspot.y -= ((Math.abs(token.data.height) * scene.data.size) / 2);
            checkspot.x = checkspot.x.toNearest(scene.data.size);
            checkspot.y = checkspot.y.toNearest(scene.data.size);
        }
        let ray = new Ray({ x: pos.x, y: pos.y }, { x: checkspot.x, y: checkspot.y });

        while (tokenCollide(checkspot) || wallCollide(ray) || outsideTile(checkspot)) {

            //log("Checking Position:", checkspot, tknRes, wallRes, tileRes);

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
                checkspot.x -= ((Math.abs(token.data.width) * scene.data.size) / 2);
                checkspot.y -= ((Math.abs(token.data.height) * scene.data.size) / 2);
                checkspot.x = checkspot.x.toNearest(scene.data.size);
                checkspot.y = checkspot.y.toNearest(scene.data.size);

                ray.B.x = checkspot.x + ((Math.abs(token.data.width) * scene.data.size) / 2);
                ray.B.y = checkspot.y + ((Math.abs(token.data.height) * scene.data.size) / 2);
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

        //log("Found spot", spot, count, scene.tokens.contents.length);

        //gr.lineStyle(2, 0x00ff00).drawCircle(spot.x + debugoffset.x, spot.y + debugoffset.y, 4);

        return spot;
    }

    static async inlineRoll(value, rgx, chatMessage, rollMode, token) {
        let doRoll = async function (match, command, formula, closing, label, ...args) {
            if (closing.length === 3) formula += "]";
            let roll = await Roll.create(formula).roll();

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
            let result = await doRoll(...match);
            retVal = retVal.replace(match[0], result);
        }

        return retVal;
    }

    constructor() {
    }

    static addToResult(entity, result) {
        if (!entity)
            return;

        if (entity instanceof TokenDocument) {
            if (result.tokens == undefined) result.tokens = [];
            result.tokens.push(entity);
        } else if (entity instanceof TileDocument) {
            if (result.tiles == undefined) result.tiles = [];
            result.tiles.push(entity);
        } else if (entity instanceof DrawingDocument) {
            if (result.drawings == undefined) result.drawings = [];
            result.drawings.push(entity);
        } else if (entity instanceof AmbientLightDocument) {
            if (result.lights == undefined) result.lights = [];
            result.lights.push(entity);
        } else if (entity instanceof AmbientSoundDocument) {
            if (result.sounds == undefined) result.sounds = [];
            result.sounds.push(entity);
        } else if (entity instanceof WallDocument) {
            if (result.walls == undefined) result.walls = [];
            result.walls.push(entity);
        } else if (entity instanceof JournalEntry) {
            if (result.journals == undefined) result.journals = [];
            result.journals.push(entity);
        } else if (entity instanceof Scene) {
            if (result.scenes == undefined) result.scenes = [];
            result.scenes.push(entity);
        } else if (entity instanceof Macro) {
            if (result.macros == undefined) result.macros = [];
            result.macros.push(entity);
        }
    }

    static async init() {
        log('Initializing Monks Active Tiles');
        registerSettings();

        game.MonksActiveTiles = this;

        //let otherGroups = {};
        //await Hooks.call("setupTileGroups", otherGroups);
        //MonksActiveTiles.triggerGroups = Object.assign(MonksActiveTiles.triggerGroups, otherGroups);

        //let otherTriggers = {};
        await Hooks.call("setupTileActions", this);
        //MonksActiveTiles.triggerActions = Object.assign(otherTriggers, MonksActiveTiles.triggerActions);

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-enhanced-journal", "JournalDirectory.prototype._onClickDocumentName");
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-enhanced-journal", "Compendium.prototype._onClickEntry");
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-scene-navigation", "SceneDirectory.prototype._onClickDocumentName");
        }

        MonksActiveTiles.SOCKET = "module.monks-active-tiles";

        //MonksActiveTiles._oldObjectClass = CONFIG.Tile.objectClass;
        //CONFIG.Tile.objectClass = WithActiveTile(CONFIG.Tile.objectClass);

        MonksActiveTiles.setupTile();

        Handlebars.registerHelper({ selectGroups: MonksActiveTiles.selectGroups });

        /*let setPosition = function (...args) {
            let [html, target] = args;
            let parent = target[0].parentElement;
            let container;
            if (this.container) {
                container = target.closest(this.container);
                if (container.length) parent = container[0];
                else container = null;
            }

            // Append to target and get the context bounds
            //container.css('position', 'relative');
            html.css("visibility", "hidden");
            (container || target).append(html);
            const contextRect = html[0].getBoundingClientRect();
            const parentRect = target[0].getBoundingClientRect();
            const containerRect = parent.getBoundingClientRect();

            // Determine whether to expand upwards
            const contextTop = parentRect.top - contextRect.height;
            const contextBottom = parentRect.bottom + contextRect.height;
            const canOverflowUp = (contextTop > containerRect.top) || (getComputedStyle(parent).overflowY === "visible");

            // If it overflows the container bottom, but not the container top
            const containerUp = (contextBottom > containerRect.bottom) && (contextTop >= containerRect.top);
            const windowUp = (contextBottom > window.innerHeight) && (contextTop > 0) && canOverflowUp;
            this._expandUp = containerUp || windowUp;

            // Display the menu
            html.addClass(this._expandUp ? "expand-up" : "expand-down");
            html.css("visibility", "");
            target.addClass("context");
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "ContextMenu.prototype._setPosition", setPosition, "OVERRIDE");
        } else {
            ContextMenu.prototype._setPosition = setPosition;
        }*/

        let tileRefresh = function (wrapped, ...args) {
            let result = wrapped(...args);

            if (this.bg) {
                const aw = Math.abs(this.data.width);
                const ah = Math.abs(this.data.height);
                const r = Math.toRadians(this.data.rotation);

                this.bg.position.set(aw / 2, ah / 2);
                this.bg.clear().beginFill(0xFFFFFF, 0.5).drawRect(-(aw / 2), -(ah / 2), aw, ah).endFill();
                this.bg.rotation = r;
            }

            return result;
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Tile.prototype.refresh", tileRefresh, "WRAPPER");
        } else {
            const oldTileRefresh = Tile.prototype.refresh;
            Tile.prototype.refresh = function (event) {
                return tileRefresh.call(this, oldTileRefresh.bind(this), ...arguments);
            }
        }

        let tileDraw = function (wrapped, ...args) {
            return wrapped(...args).then((result) => {
                let triggerData = this.document.data.flags["monks-active-tiles"];
                if (triggerData?.usealpha && !this._alphaMap)
                    this._createAlphaMap({ keepPixels: true });
                return result;
            });
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Tile.prototype.draw", tileDraw, "WRAPPER");
        } else {
            const oldTileDraw = Tile.prototype.draw;
            Tile.prototype.draw = function (event) {
                return tileDraw.call(this, oldTileDraw.bind(this), ...arguments);
            }
        }

        let oldCycleTokens = TokenLayer.prototype.cycleTokens;
        TokenLayer.prototype.cycleTokens = function (...args) {
            //if (MonksActiveTiles.preventCycle) {
            if(setting('prevent-cycle'))
                return null;
            else
                return oldCycleTokens.call(this, ...args);
        }

        let doorControl = async function (wrapped, ...args) {
            if (setting("allow-door-passthrough")) {
                await new Promise((resolve) => { resolve(); });
            }

            let triggerDoor = function (wall) {
                if (wall && setting("allow-door")) {
                    //check if this is associated with a Tile
                    if (wall.data.flags["monks-active-tiles"]?.entity) {
                        if ((!!wall.data.flags["monks-active-tiles"][MonksActiveTiles.wallchange]) ||
                            (wall.data.flags["monks-active-tiles"].open == undefined && wall.data.flags["monks-active-tiles"].close == undefined && wall.data.flags["monks-active-tiles"].lock == undefined && wall.data.flags["monks-active-tiles"].secret == undefined)) {

                            let entity = JSON.parse(wall.data.flags['monks-active-tiles']?.entity || "{}");
                            if (entity.id) {
                                let walls = [wall];

                                let doc;
                                if (entity.id.startsWith("tagger")) {
                                    if (game.modules.get('tagger')?.active) {
                                        let tag = entity.id.substring(7);
                                        doc = Tagger.getByTag(tag)[0];
                                    }
                                } else {
                                    let parts = entity.id.split(".");

                                    const [docName, docId] = parts.slice(0, 2);
                                    parts = parts.slice(2);
                                    const collection = CONFIG[docName].collection.instance;
                                    doc = collection.get(docId);

                                    while (doc && (parts.length > 1)) {
                                        const [embeddedName, embeddedId] = parts.slice(0, 2);
                                        doc = doc.getEmbeddedDocument(embeddedName, embeddedId);
                                        parts = parts.slice(2);
                                    }
                                }

                                if (doc) {
                                    let triggerData = doc.data.flags["monks-active-tiles"];
                                    if (triggerData && triggerData.active) {
                                        //check to see if this trigger is restricted by control type
                                        if ((triggerData.controlled == 'gm' && !game.user.isGM) || (triggerData.controlled == 'player' && game.user.isGM))
                                            return;

                                        let tokens = canvas.tokens.controlled.map(t => t.document);
                                        //check to see if this trigger is per token, and already triggered
                                        if (triggerData.pertoken) {
                                            tokens = tokens.filter(t => !doc.hasTriggered(t.id)); //.uuid
                                            if (tokens.length == 0)
                                                return;
                                        }

                                        return doc.trigger({ tokens: tokens, method: 'door', options: { walls: walls, change: MonksActiveTiles.wallchange } });
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let result = wrapped(...args);
            if (result && result.then) {
                return result.then((wall) => {
                    triggerDoor(wall);
                });
            } else {
                triggerDoor(this.wall);
                return result;
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "DoorControl.prototype._onRightDown", doorControl, "WRAPPER");
        } else {
            const oldDoorControl = DoorControl.prototype._onRightDown;
            DoorControl.prototype._onRightDown = function (event) {
                return doorControl.call(this, oldDoorControl.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "DoorControl.prototype._onMouseDown", doorControl, "WRAPPER");
        } else {
            const oldDoorControl = DoorControl.prototype._onMouseDown;
            DoorControl.prototype._onMouseDown = function (event) {
                return doorControl.call(this, oldDoorControl.bind(this), ...arguments);
            }
        }

        let playlistCollapse = function (wrapped, ...args) {
            let waitingType = MonksActiveTiles.waitingInput?.waitingfield?.data('type');
            if (waitingType == 'entity') {
                let event = args[0];
                const playlistId = $(event.currentTarget).closest('.playlist-header').data('documentId');
                const playlist = game.playlists.get(playlistId);
                if (playlist)
                    MonksActiveTiles.controlEntity(playlist);
            } else
                return wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "PlaylistDirectory.prototype._onPlaylistCollapse", playlistCollapse, "MIXED");
        } else {
            const oldPlaylistCollapse = PlaylistDirectory.prototype._onPlaylistCollapse;
            PlaylistDirectory.prototype._onPlaylistCollapse = function (event) {
                return playlistCollapse.call(this, oldPlaylistCollapse.bind(this), ...arguments);
            }
        }

        let contains = (position, tile) => {
            return position.x >= tile.data.x
                && position.y >= tile.data.y
                && position.x <= (tile.data.x + Math.abs(tile.data.width))
                && position.y <= (tile.data.y + Math.abs(tile.data.height));
        };

        let lastPosition = undefined;
        MonksActiveTiles.hoveredTiles = new Set();

        document.body.addEventListener("mousemove", function () {

            let mouse = canvas?.app?.renderer?.plugins?.interaction?.mouse;
            if (!mouse) return;

            const currentPosition = mouse.getLocalPosition(canvas.app.stage);

            if (!lastPosition) {
                lastPosition = currentPosition;
                return;
            }

            if (!canvas.scene)
                return;

            for (let tile of canvas.scene.tiles) {

                let triggerData = tile.data.flags["monks-active-tiles"];

                if (!triggerData || !triggerData.active || !(triggerData.trigger?.includes("hover") || triggerData.pointer))
                    continue;

                //check to see if this trigger is restricted by control type
                if ((triggerData.controlled === 'gm' && !game.user.isGM) || (triggerData.controlled === 'player' && game.user.isGM))
                    continue;

                let tokens = [];
                if (triggerData.trigger?.includes("hover")) {
                    tokens = canvas.tokens.controlled.map(t => t.document);
                    //check to see if this trigger is per token, and already triggered
                    if (triggerData.pertoken) {
                        tokens = tokens.filter(t => !tile.hasTriggered(t.id)); //.uuid
                        if (tokens.length === 0)
                            continue;
                    }
                }

                let lastPositionContainsTile = contains(lastPosition, tile);
                let currentPositionContainsTile = contains(currentPosition, tile);

                if (!lastPositionContainsTile && currentPositionContainsTile && !MonksActiveTiles.hoveredTiles.has(tile)) {
                    MonksActiveTiles.hoveredTiles.add(tile);
                    if (triggerData.pointer)
                        $('#board').css({ cursor: 'pointer' });
                    if (triggerData.trigger === "hover" || triggerData.trigger === "hoverin") {
                        tile.trigger({ tokens: tokens, method: 'hoverin', pt: currentPosition });
                    }
                }

                if (lastPositionContainsTile && !currentPositionContainsTile && MonksActiveTiles.hoveredTiles.has(tile)) {
                    MonksActiveTiles.hoveredTiles.delete(tile);
                    if (triggerData.pointer && MonksActiveTiles.hoveredTiles.size == 0)
                        $('#board').css({ cursor: '' });
                    if (triggerData.trigger === "hover" || triggerData.trigger === "hoverout") {
                        tile.trigger({ tokens: tokens, method: 'hoverout', pt: currentPosition });
                    }
                }
            }

            lastPosition = currentPosition;
        });

        let _onLeftClick = function (wrapped, ...args) {
            let event = args[0];
            canvasClick.call(this, event, 'click');
            wrapped(...args);
        }

        let _onRightClick = function (wrapped, ...args) {
            let event = args[0];
            canvasClick.call(this, event, 'rightclick');
            wrapped(...args);
        }

        let _onLeftClick2 = function (wrapped, ...args) {
            let event = args[0];
            canvasClick.call(this, event, 'dblclick');
            wrapped(...args);
        }

        let canvasClick = function (event, clicktype) {
            let waitingType = MonksActiveTiles.waitingInput?.waitingfield?.data('type');
            if (clicktype == "click" && (waitingType == 'location' || waitingType == 'either' || waitingType == 'position')) {
                let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
                if (restrict && !restrict(canvas.scene)) {
                    ui.notifications.error(i18n("MonksActiveTiles.msg.invalid-location"));
                    return;
                }

                let pos = event.data.getLocalPosition(canvas.app.stage);
                let update = { x: parseInt(pos.x), y: parseInt(pos.y), sceneId: (canvas.scene.id != MonksActiveTiles.waitingInput.options.parent.object.parent.id ? canvas.scene.id : null) };
                ActionConfig.updateSelection.call(MonksActiveTiles.waitingInput, update);
            }

            if (canvas.activeLayer instanceof TokenLayer) {
                //check to see if there are any Tiles that can be activated with a click
                MonksActiveTiles.checkClick(event.data.origin, clicktype);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Canvas.prototype._onClickLeft", _onLeftClick, "WRAPPER");
        } else {
            const oldClickLeft = Canvas.prototype._onClickLeft;
            Canvas.prototype._onClickLeft = function (event) {
                return _onLeftClick.call(this, oldClickLeft.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Canvas.prototype._onClickRight", _onRightClick, "WRAPPER");
        } else {
            const oldClickRight = Canvas.prototype._onClickRight;
            Canvas.prototype._onClickRight = function (event) {
                return _onRightClick.call(this, oldClickRight.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Canvas.prototype._onClickLeft2", _onLeftClick2, "WRAPPER");
        } else {
            const oldClickLeft = Canvas.prototype._onClickLeft2;
            Canvas.prototype._onClickLeft2 = function (event) {
                return _onLeftClick2.call(this, oldClickLeft.bind(this), ...arguments);
            }
        }

        let clickDocumentName = async function (wrapped, ...args) {
            let event = args[0];
            let waitingType = MonksActiveTiles.waitingInput?.waitingfield?.data('type');
            if (waitingType == 'entity') { //+++ need to make sure this is allowed, only create should be able to select templates
                event.preventDefault();
                const documentId = event.currentTarget.closest(".document").dataset.documentId;
                const document = this.constructor.collection.get(documentId);

                let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
                if (restrict && !restrict(document))
                    return wrapped(...args);

                ActionConfig.updateSelection.call(MonksActiveTiles.waitingInput, { id: document.uuid, name: document.name });
            } else
                wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "ActorDirectory.prototype._onClickDocumentName", clickDocumentName, "MIXED");
        } else {
            const oldClickActorName = ActorDirectory.prototype._onClickDocumentName;
            ActorDirectory.prototype._onClickDocumentName = function (event) {
                return clickDocumentName.call(this, oldClickActorName.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "ItemDirectory.prototype._onClickDocumentName", clickDocumentName, "MIXED");
        } else {
            const oldClickItemName = ItemDirectory.prototype._onClickDocumentName;
            ItemDirectory.prototype._onClickDocumentName = function (event) {
                return clickDocumentName.call(this, oldClickItemName.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "JournalDirectory.prototype._onClickDocumentName", clickDocumentName, "MIXED");
        } else {
            const oldClickJournalName = JournalDirectory.prototype._onClickDocumentName;
            JournalDirectory.prototype._onClickDocumentName = function (event) {
                return clickDocumentName.call(this, oldClickJournalName.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "SceneDirectory.prototype._onClickDocumentName", clickDocumentName, "MIXED");
        } else {
            const oldClickJournalName = SceneDirectory.prototype._onClickDocumentName;
            SceneDirectory.prototype._onClickDocumentName = function (event) {
                return clickDocumentName.call(this, oldClickJournalName.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "MacroDirectory.prototype._onClickDocumentName", clickDocumentName, "MIXED");
        } else {
            const oldClickJournalName = MacroDirectory.prototype._onClickDocumentName;
            MacroDirectory.prototype._onClickDocumentName = function (event) {
                return clickDocumentName.call(this, oldClickJournalName.bind(this), ...arguments);
            }
        }

        let checkClickDocumentName = async function (wrapped, ...args) {
            if (this.constructor.name == "MacroSidebarDirectory") {
                return clickDocumentName.call(this, wrapped.bind(this), ...args);
            } else
                return wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "SidebarDirectory.prototype._onClickDocumentName", checkClickDocumentName, "MIXED");
        } else {
            const oldClickJournalName = SidebarDirectory.prototype._onClickDocumentName;
            SidebarDirectory.prototype._onClickDocumentName = function (event) {
                return checkClickDocumentName.call(this, oldClickJournalName.bind(this), ...arguments);
            }
        }

        let clickCompendiumEntry = async function (wrapped, ...args) {
            let event = args[0];
            if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') { //+++ need to make sure this is allowed, only create should be able to select templates
                let li = event.currentTarget.parentElement;
                const document = await this.collection.getDocument(li.dataset.documentId);
                let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
                if (restrict && !restrict(document))
                    return wrapped(...args);

                ActionConfig.updateSelection.call(MonksActiveTiles.waitingInput, { id: document.uuid, name: document.name });
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

        let leftClick = async function (wrapped, ...args) {
            MonksActiveTiles.controlEntity(this);
            return wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "AmbientLight.prototype._onClickLeft", leftClick, "WRAPPER");
        } else {
            const oldOnClickLeft = AmbientLight.prototype._onClickLeft;
            AmbientLight.prototype._onClickLeft = function (event) {
                return leftClick.call(this, oldOnClickLeft.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "AmbientSound.prototype._onClickLeft", leftClick, "WRAPPER");
        } else {
            const oldOnClickLeft = AmbientSound.prototype._onClickLeft;
            AmbientSound.prototype._onClickLeft = function (event) {
                return leftClick.call(this, oldOnClickLeft.bind(this), ...arguments);
            }
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Note.prototype._onClickLeft", leftClick, "WRAPPER");
        } else {
            const oldOnClickLeft = Note.prototype._onClickLeft;
            Note.prototype._onClickLeft = function (event) {
                return leftClick.call(this, oldOnClickLeft.bind(this), ...arguments);
            }
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

    static async fixTiles() {
        //find all tiles and check for actions that have the old format
        //openfql, execute(need to figure out if it's kandashi or tagger), setmovement, requestroll, filterrequest
        for (let scene of game.scenes) {
            for (let tile of scene.tiles) {
                let triggerData = tile.data.flags["monks-active-tiles"];
                if (triggerData && triggerData.actions.length > 0) {
                    let actions = duplicate(triggerData.actions);
                    let update = false;
                    for (let action of actions) {
                        switch (action.action) {
                            case "openfql":
                                action.action = "forien-quest-log.openfql";
                                update = true;
                                break;
                            case "setmovement":
                            case "requestroll":
                            case "filterrequest":
                                action.action = `monks-tokenbar.${action.action}`;
                                update = true;
                                break;
                            case "execute":
                                if (action.data.effect != undefined)
                                    action.action = `kandashis-fluid-canvas.execute`;
                                else
                                    action.action = `tagger.execute`;
                                update = true;
                                break;
                        }
                    }

                    if (update) {
                        await tile.setFlag("monks-active-tiles", "actions", actions);
                    }
                }
            }
        }
    }

    static registerTileGroup(namespace, name) {
        if (MonksActiveTiles.triggerGroups[namespace] != undefined) {
            warn(`Trigger Group ${namespace} already exists`);
            return;
        }

        MonksActiveTiles.triggerGroups[namespace] = { name: name };
        return true;
    }

    static registerTileAction(namespace, name, action) {
        let key = `${namespace}.${name}`;
        if (!game.modules.get(namespace)) {
            warn(`Registering module namespace, ${namespace} doesn't exist`);
            return;
        }

        if (MonksActiveTiles.triggerActions[key] != undefined) {
            warn(`Action ${key} already exists`);
            return;
        }

        if (action.group == undefined)
            action.group = namespace;

        if (MonksActiveTiles.triggerGroups[action.group] == undefined) {
            warn(`Trigger Group ${action.group} doesn't exist`);
            return;
        }

        MonksActiveTiles.triggerActions[key] = action;
        return true;
    }

    static async onMessage(data) {
        switch (data.action) {
            case 'trigger': {
                if (game.user.isGM) {
                    let tokens = data.tokens;
                    for (let i = 0; i < tokens.length; i++)
                        tokens[i] = await fromUuid(tokens[i]);
                    let tile = await fromUuid(data.tileid);

                    tile.trigger({ tokens: tokens, userid: data.senderId, method: data.method, pt: data.pt });
                }
            } break;
            case 'switchview': {
                if (data.userid.find(u => u == game.user.id) != undefined) {
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
                    let macro;
                    try {
                        macro = await fromUuid(data.macroid);
                    } catch {
                        macro = game.macros.get(data.macroid);
                    }

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
                        tokens: tokens,
                        method: data.method,
                        pt: data.pt,
                        actionId: data._id,
                    };

                    let results = (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active ?
                        await (macro.data.type == 'script' ? macro.callScriptFunction(context) : macro.execute(data.args)) :
                        await MonksActiveTiles._execute.call(macro, context));
                    MonksActiveTiles.emit("returnmacro", { _id: data._id, tileid: data?.tileid, results: results });
                }
            } break;
            case 'returnmacro': {
                if (game.user.isGM) {
                    let tile = await fromUuid(data.tileid);
                    if (tile)
                        tile.resumeActions(data._id, data.results);
                }
            } break;
            case 'showdialog': {
                if (game.user.id == data.userid) {
                    let tile = (data?.tileid ? await fromUuid(data.tileid) : null);
                    let token = (data?.tokenid ? await fromUuid(data.tokenid) : null);

                    MonksActiveTiles._showDialog(tile, token, data.value, data.type, data.title, data.content, data.options, data.yes, data.no).then((results) => {
                        MonksActiveTiles.emit("returndialog", { _id: data._id, tileid: data?.tileid, results: results });
                    });
                }
            } break;
            case 'returndialog': {
                if (game.user.isGM) {
                    let tile = await fromUuid(data.tileid);
                    if (tile)
                        tile.resumeActions(data._id, data.results);
                }
            } break;
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
                if ((data.userid == undefined || data.userid.find(u => u == game.user.id) != undefined) && (data.sceneid == undefined || canvas.scene.id == data.sceneid)) {
                    let tile = await fromUuid(data.tileid);
                    if (tile) {
                        if (tile.soundeffect != undefined && tile.soundeffect[data.actionid] != undefined) {
                            if (tile.soundeffect[data.actionid].playing && data.prevent)
                                return;

                            try {
                                tile.soundeffect[data.actionid].stop();
                            } catch {}
                        }

                        let volume = Math.clamped(data.volume, 0, 1);

                        debug('Playing', data.src);
                        AudioHelper.play({ src: data.src, volume: (data.fade > 0 ? 0 : volume), loop: data.loop }, false).then((sound) => {
                            if (data.fade > 0)
                                sound.fade(volume * game.settings.get("core", "globalInterfaceVolume"), { duration: data.fade * 1000 });
                            if (tile.soundeffect == undefined)
                                tile.soundeffect = {};
                            tile.soundeffect[data.actionid] = sound;
                            tile.soundeffect[data.actionid].on("end", () => {
                                debug('Finished playing', data.src);
                                delete tile.soundeffect[data.actionid];
                            });
                            tile.soundeffect[data.actionid]._mattvolume = volume;
                        });
                    }
                }
            } break;
            case 'stopsound': {
                if (data.type == 'all') {
                    game.audio.playing.forEach((s) => s.stop());
                } else {
                    if ((data.userid == undefined || data.userid.find(u => u == game.user.id) != undefined)) {
                        let tile = await fromUuid(data.tileid);
                        if (tile) {
                            if (tile.soundeffect != undefined) {
                                if (data.actionid) {
                                    try {
                                        tile.soundeffect[data.actionid].fade(0, { duration: data.fade * 1000 }).then((sound) => {
                                            sound.stop();
                                            delete tile.soundeffect[data.actionid]
                                        });
                                    } catch { }
                                    
                                } else {
                                    for (let [key, sound] of Object.entries(tile.soundeffect)) {
                                        try {
                                            sound.fade(0, { duration: data.fade * 1000 }).then((sound) => {
                                                sound.stop();
                                                delete tile.soundeffect[key]
                                            });
                                        } catch { }
                                    }
                                }
                            }
                        }
                    }
                }
            } break;
            case 'pan': {
                if (data.userid == game.user.id || (data.userid == undefined && !game.user.isGM)) {
                    let dest = { x: data.x, y: data.y, scale: data.scale, duration: data.duration };
                    if (data.animate)
                        canvas.animatePan(dest);
                    else
                        canvas.pan(dest);
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
                    $('<div>').addClass('active-tile-backdrop').css({'background': setting('teleport-colour')}).appendTo('body').animate({ opacity: 1 }, {
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
                    if (!entity)
                        return;

                    if (data.permission === true && !entity.testUserPermission(game.user, "LIMITED"))
                        return ui.notifications.warn(`You do not have permission to view ${entity.name}.`);

                    if (!game.modules.get("monks-enhanced-journal")?.active || data?.enhanced !== true || !game.MonksEnhancedJournal.openJournalEntry(entity))
                        entity.sheet.render(true);
                }
            } break;
            case 'actor': {
                if ((data.showto == 'players' && !game.user.isGM) || (data.showto == 'trigger' && game.user.id == data.userid) || data.showto == 'everyone' || data.showto == undefined) {
                    let entity = await fromUuid(data.entityid);
                    if (!entity)
                        return;

                    if (data.permission === true && !entity.testUserPermission(game.user, "LIMITED"))
                        return ui.notifications.warn(`You do not have permission to view ${entity.name}.`);

                    entity.sheet.render(true);
                }
            } break;
            case 'notification': {
                if (data.userid == undefined || data.userid == game.user.id) {
                    ui.notifications.notify(data.content, data.type);
                }
            } break;
            case 'fql': {
                if ((data.for == 'players' && !game.user.isGM) || (data.for == 'trigger' && game.user.id == data.userid) || data.for == 'everyone' || data.for == undefined) {
                    Hooks.call('ForienQuestLog.Open.QuestLog');
                }
            } break;
            case 'target': {
                if (data.userid == game.user.id) {
                    game.user.updateTokenTargets(data.tokens);
                }
            } break;
            case 'scrollingtext': {
                if (data.userid == undefined || data.userids.find(u => u == game.user.id) != undefined) {
                    let token = canvas.tokens.get(data.tokenid);
                    if (token) {
                        token.hud.createScrollingText(data.content, {
                            duration: data.duration,
                            anchor: data.anchor,
                            direction: data.direction
                        });
                    }
                }
            } break;
            case 'preload': {
                if (data.userid == undefined || data.userid == game.user.id) {
                    game.scenes.preload(data.sceneid);
                }
            } break;
            case 'slotmachine': {
                if (!game.user.isGM) {
                    
                    if (data.cmd == "prep") {
                        let tile = await fromUuid(data.tileid);
                        tile._cycleimages = tile._cycleimages || {};
                        let files = tile._cycleimages[data.id];
                        if (files == undefined) {
                            let tileData = tile.data.flags["monks-active-tiles"];
                            let action = tileData.actions.find(a => a.id == data.id);
                            let actfiles = (action.data?.files || []);
                            files = tile._cycleimages[data.id] = await MonksActiveTiles.getTileFiles(actfiles);
                        }

                        for (let call of data.entities) {
                            let entity = await fromUuid(call.entityid);
                            if (entity) {
                                MonksActiveTiles._slotmachine[entity.id] = new Promise(async () => {
                                    let t = entity._object;

                                    const container = new PIXI.Container();
                                    t.addChild(container);
                                    container.width = entity.data.width;
                                    container.height = entity.data.height;

                                    //Set the image clip region
                                    const mask = new PIXI.Graphics();
                                    mask.beginFill(0xFFFFFF);
                                    mask.drawRect(0, 0, entity.data.width, entity.data.height);
                                    mask.endFill();
                                    container.addChild(mask);
                                    container.mask = mask;

                                    //load all the files
                                    let sprites = [];
                                    for (let f of files) {
                                        let tex = await loadTexture(f);
                                        sprites.push(new PIXI.Sprite(tex));
                                    }

                                    //add them to the tile
                                    for (let s of sprites) {
                                        s.y = entity.data.height;
                                        s.width = entity.data.width;
                                        s.height = entity.data.height;
                                        container.addChild(s);
                                    }

                                    //hide the actual image
                                    t.children[0].visible = false;

                                    MonksActiveTiles._slotmachine[entity.id] = { container, sprites, mask };
                                });
                            }
                        }
                    } else if (data.cmd == "animate") {
                        let entity = await fromUuid(data.entityid);
                        if (entity) {
                            let animateDetails = MonksActiveTiles._slotmachine[entity.id];

                            let resolve = () => {
                                let sprites = animateDetails.sprites;

                                let frames = [];
                                frames.push({ sprite: sprites[data.oldIdx], idx: data.oldIdx });
                                sprites[data.oldIdx].y = 0;

                                MonksActiveTiles._slotmachine[entity.id].animation = CanvasAnimation._animatePromise(
                                    MonksActiveTiles.slotAnimate,
                                    entity._object,
                                    `slot-machine${entity.id}`,
                                    {
                                        tile: entity._object,
                                        frames: frames,
                                        sprites: sprites,
                                        idx: data.oldIdx,
                                        total: (sprites.length * data.spins) + (data.newIdx - data.oldIdx < 0 ? sprites.length + data.newIdx - data.oldIdx : data.newIdx - data.oldIdx) + 1
                                    },
                                    data.speed
                                )
                            }

                            if (animateDetails instanceof Promise) {
                                animateDetails.then(() => {
                                    resolve();
                                });
                            } else
                                resolve();
                        }
                    } else if (data.cmd == "cleanup") {
                        let entity = await fromUuid(data.entityid);
                        if (entity) {
                            let animateDetails = MonksActiveTiles._slotmachine[entity.id];
                            if (animateDetails.animate instanceof Promise) {
                                animateDetails.animate.then(() => {
                                    entity._object.removeChild(animateDetails.container);
                                    entity._object.children[0].visible = true;
                                })
                            } else {
                                entity._object.removeChild(animateDetails.container);
                                entity._object.children[0].visible = true;
                            }
                        }
                    }
                }
            } break;
            case 'move':
                {
                    let entity = await fromUuid(data.entityid);

                    let object = entity.object;
                    await CanvasAnimation.terminateAnimation(`${entity.documentName}.${entity.id}.animateMovement`);

                    let animate = async () => {
                        let ray = new Ray({ x: entity.data.x, y: entity.data.y }, { x: data.x, y: data.y });

                        // Move distance is 10 spaces per second
                        const s = canvas.dimensions.size;
                        entity._movement = ray;
                        const speed = s * 10;
                        const duration = (ray.distance * 1000) / speed;

                        // Define attributes
                        const attributes = [
                            { parent: object, attribute: 'x', to: data.x },
                            { parent: object, attribute: 'y', to: data.y }
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

                    animate();

                } break;
            case 'showhide': {
                let entity = await fromUuid(data.entityid);

                if (!entity)
                    return;

                let icon = entity.object.icon || entity.object.tile || entity.object;
                let animationName = `MonksActiveTiles.${entity.documentName}.${entity.id}.animateShowHide`;

                await CanvasAnimation.terminateAnimation(animationName);

                const attributes = [
                    { parent: icon, attribute: 'alpha', to: (data.hide ? 0 : entity.data.alpha), object: entity.object }
                ];

                if (entity instanceof TokenDocument)
                    attributes.push({ parent: entity.object.hud, attribute: 'alpha', to: (data.hide ? 0 : 1) });

                let time = data.time - new Date().getTime();
                if (time < 0)
                    return;

                if (!data.hide) {
                    icon.alpha = 0;
                    entity.object.hud.alpha = 0;
                    icon.visible = true;
                    entity.object.visible = true;
                }

                CanvasAnimation.animateLinear(attributes, {
                    name: animationName,
                    context: icon,
                    duration: time,
                    ontick: (dt, attributes) => {
                        if (attributes[0].to == 1) {
                            if (!attributes[0].object.visible)
                                attributes[0].object.visible = true;
                            if (attributes[0].object.alpha != attributes[0].done)
                                attributes[0].object.alpha = attributes[0].done;
                        }

                        //log("Token fade", attributes[0].parent.alpha, attributes[0].object.alpha, attributes[0].parent.visible, attributes[0].object.visible, attributes[0].remaining, attributes[0].done, attributes[0].delta, attributes[0].d);
                    }
                }).then(() => {
                    if (data.hide)
                        entity.object.visible = false;
                    entity.object.hud.alpha = 1;
                });
            } break;
        }
    }

    static checkClick(pt, clicktype = "click") {
        for (let tile of canvas.scene.tiles) {
            tile.checkClick(pt, clicktype);
        }
    }

    static controlEntity(entity) {
        let waitingType = MonksActiveTiles.waitingInput?.waitingfield?.data('type');
        if (waitingType == 'entity' || waitingType == 'either' || waitingType == 'position') {
            let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
            if (restrict && !restrict(entity)) {
                ui.notifications.error(i18n("MonksActiveTiles.msg.invalid-entity"));
                return;
            }
            if(entity.document)
                ActionConfig.updateSelection.call(MonksActiveTiles.waitingInput, { id: entity.document.uuid, name: entity.document.name || (entity.document.documentName + ": " + entity.document.id) });
            else
                ActionConfig.updateSelection.call(MonksActiveTiles.waitingInput, { id: entity.uuid, name: (entity?.parent?.name ? entity.parent.name + ": " : "") + entity.name });
        }
    }

    static selectPlaylistSound(evt) {
        const playlistId = $(evt.currentTarget).data('playlistId');
        const soundId = $(evt.currentTarget).data('soundId');

        const sound = game.playlists.get(playlistId)?.sounds?.get(soundId);
        if (sound)
            MonksActiveTiles.controlEntity(sound);
    }

    static getTileSegments(tile, offset = 0) {
        let tileX1 = tile.data.x + offset;
        let tileY1 = tile.data.y + offset;
        let tileX2 = tile.data.x + Math.abs(tile.data.width) - offset;
        let tileY2 = tile.data.y + Math.abs(tile.data.height) - offset;

        let segments = [
            { a: { x: tileX1, y: tileY1 }, b: { x: tileX2, y: tileY1 } },
            { a: { x: tileX2, y: tileY1 }, b: { x: tileX2, y: tileY2 } },
            { a: { x: tileX2, y: tileY2 }, b: { x: tileX1, y: tileY2 } },
            { a: { x: tileX1, y: tileY2 }, b: { x: tileX1, y: tileY1 } }
        ];

        if (tile.data.rotation != 0) {
            function rotate(cx, cy, x, y, angle) {
                var realangle = angle + 90,
                    rad = Math.toRadians(realangle),
                    sin = Math.cos(rad),
                    cos = Math.sin(rad),
                    run = x - cx,
                    rise = y - cy,
                    tx = (cos * run) + (sin * rise) + cx,
                    ty = (cos * rise) - (sin * run) + cy;
                return { x: tx, y: ty };
            }

            const cX = tile.data.x + (Math.abs(tile.data.width) / 2);
            const cY = tile.data.y + (Math.abs(tile.data.height) / 2);

            let pt1 = rotate(cX, cY, tileX1, tileY1, tile.data.rotation);
            let pt2 = rotate(cX, cY, tileX2, tileY1, tile.data.rotation);
            let pt3 = rotate(cX, cY, tileX2, tileY2, tile.data.rotation);
            let pt4 = rotate(cX, cY, tileX1, tileY2, tile.data.rotation);

            /*
            let gr = MonksActiveTiles.debugGr;
            if (!gr) {
                gr = new PIXI.Graphics();
                MonksActiveTiles.debugGr = gr;
                canvas.tokens.addChild(gr);
            }

            gr.beginFill(0x00ffff)
                .drawCircle(tileX1, tileY1, 4)
                .drawCircle(tileX2, tileY1, 6)
                .drawCircle(tileX2, tileY2, 8)
                .drawCircle(tileX1, tileY2, 10)
                .endFill();

            gr.beginFill(0xffff00)
                .drawCircle(pt1.x, pt1.y, 4)
                .drawCircle(pt2.x, pt2.y, 6)
                .drawCircle(pt3.x, pt3.y, 8)
                .drawCircle(pt4.x, pt4.y, 10)
                .endFill();
                */

            segments = [
                { a: pt1, b: pt2 },
                { a: pt2, b: pt3 },
                { a: pt3, b: pt4 },
                { a: pt4, b: pt1 }
            ];
        }

        return segments;
    }

    static setupTile() {
        TileDocument.prototype._normalize = function () {
            this.data.flags = mergeObject({
                'monks-active-tiles': {
                    active: true,
                    trigger: setting('default-trigger'),
                    chance: 100,
                    restriction: 'all',
                    controlled: 'all',
                    actions: []
                }
            }, this.data.flags);
        }

        TileDocument.prototype.pointWithin = function (point) {
            let pt = point;

            if (this.data.rotation != 0) {
                //rotate the point
                function rotate(cx, cy, x, y, angle) {
                    var rad = Math.toRadians(angle),
                        cos = Math.cos(rad),
                        sin = Math.sin(rad),
                        run = x - cx,
                        rise = y - cy,
                        tx = (cos * run) + (sin * rise) + cx,
                        ty = (cos * rise) - (sin * run) + cy;
                    return { x: tx, y: ty };
                }

                const cX = this.data.x + (Math.abs(this.data.width) / 2);
                const cY = this.data.y + (Math.abs(this.data.height) / 2);

                pt = rotate(cX, cY, pt.x, pt.y, this.data.rotation);
            }

            return !(pt.x <= this.data.x ||
                pt.x >= this.data.x + Math.abs(this.data.width) ||
                pt.y <= this.data.y ||
                pt.y >= this.data.y + Math.abs(this.data.height));
        }

        TileDocument.prototype.tokensWithin = function () {
            return this.parent.tokens.filter(t => {
                const midToken = { x: t.data.x + (Math.abs(t.data.width) / 2), y: t.data.y + (Math.abs(t.data.height) / 2) };
                if (game.modules.get("levels")?.active) {
                    let tileht = this.data.flags.levels?.rangeTop ?? 1000;
                    let tilehb = this.data.flags.levels?.rangeBottom ?? -1000;
                    if (t.data.elevation >= tilehb && t.data.elevation <= tileht)
                        return this.pointWithin(midToken);
                } else
                    return this.pointWithin(midToken);
            });
        }

        TileDocument.prototype.checkClick = function (pt, clicktype = 'click') {
            let triggerData = this.data.flags["monks-active-tiles"];
            if (triggerData && triggerData.active && triggerData.trigger == clicktype) {
                //prevent triggering when game is paused
                if (setting("prevent-when-paused") && game.paused && !game.user.isGM && triggerData.allowpaused !== true)
                    return;

                //check to see if this trigger is restricted by control type
                if ((triggerData.controlled == 'gm' && !game.user.isGM) || (triggerData.controlled == 'player' && game.user.isGM))
                    return;

                let tokens = canvas.tokens.controlled.map(t => t.document);
                //check to see if this trigger is per token, and already triggered
                if (triggerData.pertoken) {
                    tokens = tokens.filter(t => !this.hasTriggered(t.id)); //.uuid
                    if (tokens.length == 0)
                        return;
                }

                //check to see if the clicked point is within the Tile
                if (pt == undefined || (triggerData.usealpha ? this.object.containsPixel(pt.x, pt.y) : this.pointWithin(pt))) {
                    //this.preloadScene();
                    return this.trigger({ tokens: tokens, method: clicktype, pt: pt });
                }
            }
        }

        TileDocument.prototype.checkCollision = function (token, destination, usealpha) {
            let when = this.getFlag('monks-active-tiles', 'trigger');

            const tokenOffsetW = (token.data.width * token.parent.data.size) / 2;
            const tokenOffsetH = (token.data.height * token.parent.data.size) / 2;
            const tokenX1 = token.data.x + tokenOffsetW;
            const tokenY1 = token.data.y + tokenOffsetH;
            const tokenX2 = destination.x + tokenOffsetW;
            const tokenY2 = destination.y + tokenOffsetH;

            const tokenRay = new Ray({ x: tokenX1, y: tokenY1 }, { x: tokenX2, y: tokenY2 });

            if (when == 'both') {
                when = this.pointWithin({ x: tokenRay.A.x, y: tokenRay.A.y }) ? 'exit' : 'enter';
            }

            let buffer = (token.parent.data.size / 5) * (when == 'enter' ? 1 : (when == 'exit' ? -1 : 0));

            let segments = MonksActiveTiles.getTileSegments(this, buffer);

            let intersect = segments
                .filter(s => foundry.utils.lineSegmentIntersects(tokenRay.A, tokenRay.B, s.a, s.b))
                .map(s => foundry.utils.lineSegmentIntersection(tokenRay.A, tokenRay.B, s.a, s.b));

            /*
            let gr = MonksActiveTiles.debugGr;
            if (!gr) {
                gr = new PIXI.Graphics();
                MonksActiveTiles.debugGr = gr;
                canvas.tokens.addChild(gr);
            }

            for (let seg of segments) {
                gr.lineStyle(2, 0xff0000).moveTo(seg.a.x, seg.a.y).lineTo(seg.b.x, seg.b.y);
            }
            for (let pt of intersect) {
                gr.beginFill(0x00ff00).drawCircle(pt.x, pt.y, 4).endFill();
            }
            */

            if ((when == 'movement' || when == 'elevation') && intersect.length == 0) {
                //check to see if there's moving within the Tile
                if (this.pointWithin({ x: tokenRay.A.x, y: tokenRay.A.y }) &&
                    this.pointWithin({ x: tokenRay.B.x, y: tokenRay.B.y })) {
                    intersect = [{ x1: tokenRay.A.x, y1: tokenRay.A.y, x2: tokenRay.B.x, y2: tokenRay.B.y }];
                }
            } else if (usealpha) {
                //check the spot using alpha

                // walk from the intersection point to the (token end for on enter, or token start for on exit
                // if the point is in the alpha map, then change the intersection point to this point.
            }

            return intersect;
        }

        TileDocument.prototype.canTrigger = function (token, collision, destination, elevation) {
            let triggerData = this.data.flags["monks-active-tiles"];
            if (triggerData) {
                // prevent players from triggering a tile if the game is paused.
                if (setting("prevent-when-paused") && game.paused && !game.user.isGM && triggerData.allowpaused !== true)
                    return;

                let when = this.getFlag('monks-active-tiles', 'trigger');

                if (!["enter", "exit", "both", "elevation", "movement", "stop"].includes(when))
                    return;

                if (when == 'elevation' && elevation == token.data.elevation)
                    return;

                //check to see if this trigger is per token, and already triggered
                if (triggerData.pertoken && this.hasTriggered(token.id))
                    return;

                //check to see if this trigger is restricted by token type
                if ((triggerData.restriction == 'gm' && token.actor?.hasPlayerOwner) || (triggerData.restriction == 'player' && !token.actor?.hasPlayerOwner))
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
                let sorted = (collision.length > 1 ? collision.sort((c1, c2) => (c1.t0 > c2.t0) ? 1 : -1) : collision);

                //clear out any duplicate corners
                let filtered = sorted.filter((value, index, self) => {
                    return self.findIndex(v => v.t0 === value.t0) === index;
                })

                let tokenMidX = ((token.data.width * token.parent.data.size) / 2);
                let tokenMidY = ((token.data.height * token.parent.data.size) / 2);
                //is the token currently in the tile
                let tokenPos = { x: (when == 'stop' ? destination.x : token.data.x) + tokenMidX, y: (when == 'stop' ? destination.y : token.data.y) + tokenMidY };
                let inTile = this.pointWithin(tokenPos); //!(tokenPos.x <= this.object.x || tokenPos.x >= this.object.x + this.object.width || tokenPos.y <= this.object.y || tokenPos.y >= this.object.y + this.object.height);

                //go through the list, alternating in/out until we find one that satisfies the on enter/on exit setting, and if it does, return the trigger point.
                let newPos = [];
                if (when == 'movement' || when == 'elevation') {
                    if (filtered.length == 2)
                        newPos.push({ x: filtered[0].x, y: filtered[0].y, x2: filtered[1].x, y2: filtered[1].y, method: 'movement' });
                    else {
                        if (inTile)
                            newPos.push({ x: filtered[0].x1, y: filtered[0].y1, x2: filtered[0].x2, y2: filtered[0].y2, method: 'movement' });
                        else
                            newPos.push({ x: filtered[0].x, y: filtered[0].y, x2: destination.x + tokenMidX, y2: destination.y + tokenMidY, method: 'movement' });
                    }
                } else if (when == 'stop') {
                    if (inTile)
                        newPos.push({ x: destination.x, y: destination.y, method: 'stop' });
                } else {
                    let checkPos = function (wh) {
                        let idx = ((inTile ? 0 : 1) - (wh == 'enter' ? 1 : 0));

                        debug("Can Trigger", collision, sorted, filtered, inTile, wh, idx);

                        if (idx < 0 || idx >= filtered.length)
                            return;

                        let pos = duplicate(filtered[idx]);
                        pos.x -= tokenMidX;
                        pos.y -= tokenMidY;
                        pos.method = (wh == 'enter' ? "enter" : "exit");
                        newPos.push(pos);
                    }

                    checkPos(when == 'both' ? 'enter' : when);
                    if (when == 'both')
                        checkPos('exit');
                }

                return newPos;
            }
        }

        /*
        TileDocument.prototype.preloadScene = function () {
            let actions = this.data.flags["monks-active-tiles"]?.actions || [];
            if (!this._preload)
                this._preload = {};
            for (let action of actions) {
                if (action.action == 'teleport' && action.data.location.sceneId && action.data.location.sceneId != canvas.scene.id) {
                    if (!this._preload[action.data.location.sceneId]) {
                        log('preloading scene', action.data.location.sceneId, this._preload);
                        this._preload[action.data.location.sceneId] = game.scenes.preload(action.data.location.sceneId, true).then(() => {
                            delete this._preload[action.data.location.sceneId];
                            log('clearing preloading scene', action.data.location.sceneId, this._preload);
                        });
                    }
                }
                if (action.action == 'scene') {
                    if (!this._preload[action.data.location.sceneId]) {
                        log('preloading scene', action.data.sceneid);
                        this._preload[action.data.location.sceneId] = game.scenes.preload(action.data.sceneid, true).then(() => {
                            delete this._preload[action.data.location.sceneId];
                            log('clearing preloading scene', action.data.location.sceneId, this._preload);
                        });
                    }
                }
            }
        }*/

        TileDocument.prototype.checkStop = function () {
            let when = this.getFlag('monks-active-tiles', 'trigger');
            if (when == 'movement')
                return { stop: false };
            let stopmovement = false;
            let stoppage = this.data.flags['monks-active-tiles'].actions.filter(a => {
                if (a.action == 'movement')
                    stopmovement = true;
                return MonksActiveTiles.triggerActions[a.action].stop === true;
            });
            return { stop: stoppage.length != 0, snap: stoppage.find(a => a.data?.snap), coolDown: stopmovement };
            //return (stoppage.length == 0 ? { stop: false } : (stoppage.find(a => a.data?.snap) ? 'snap' : true));
        }

        TileDocument.prototype.trigger = async function ({ token = [], tokens = [], userid = game.user.id, method, pt, options = {} } = {}) {
            if (token.length > 0 && tokens.length == 0) {
                error("Passing in <token> has been deprecated and will be removed at some point.  Please use <tokens> instead, and either update your macro or contact the module that is making this call");
                tokens = token;
            }
            if (MonksActiveTiles.allowRun) {
                let triggerData = this.data.flags["monks-active-tiles"];
                //if (this.data.flags["monks-active-tiles"]?.pertoken)
                if (game.user.isGM && triggerData.record === true) {
                    if (tokens.length > 0) {
                        for (let tkn of tokens)
                            await this.addHistory(tkn.id, method, userid);    //changing this to always register tokens that have triggered it.
                    } else if(method != "trigger")
                        await this.addHistory("", method, userid);
                }

                //only complete a trigger once the minimum is reached
                if (triggerData.minrequired && this.countTriggered() < triggerData.minrequired)
                    return;

                //A token has triggered this tile, what actions do we need to do
                let values = [];
                let value = Object.assign({ tokens: tokens }, options);
                let context = Object.assign({ tile: this, tokens: tokens, userid: userid, values: values, value: value, method: method, pt: pt }, options);

                let direction = {};
                if (!!pt && !!pt.x && !!pt.y) {
                    let midTile = { x: this.data.x + (this.data.width / 2), y: this.data.y + (this.data.height / 2) };
                    const tokenRay = new Ray({ x: midTile.x, y: midTile.y }, { x: pt.x, y: pt.y });

                    direction.y = ((tokenRay.angle == 0 || tokenRay.angle == Math.PI) ? "" : (tokenRay.angle < 0 ? "top" : "bottom"));
                    direction.x = ((Math.abs(tokenRay.angle) == (Math.PI / 2)) ? "" : (Math.abs(tokenRay.angle) < (Math.PI / 2) ? "right" : "left"));
                    value.direction = direction;
                }

                let actions = triggerData?.actions || [];
                let start = 0;
                //auto anchors
                // gm, player, trigger type, direction?
                let autoanchor = actions.filter(a => a.action == "anchor" && a.data.tag.startsWith("_"));

                if (autoanchor.length) {
                    let user = game.users.get(userid);
                    for (let anchor of autoanchor) {
                        if (anchor.data.tag == "_gm" && user?.isGM === true) {
                            start = actions.findIndex(a => a.id == anchor.id) + 1;
                            break;
                        } else if (anchor.data.tag == "_player" && user?.isGM === false) {
                            start = actions.findIndex(a => a.id == anchor.id) + 1;
                            break;
                        } else if (MonksActiveTiles.triggerModes[anchor.data.tag.replace("_", "")] != undefined && `_${options.originalMethod || method}` == anchor.data.tag) {
                            start = actions.findIndex(a => a.id == anchor.id) + 1;
                            break;
                        } else if (anchor.data.tag.startsWith("_door") && anchor.data.tag.endsWith(options.change)) {
                            start = actions.findIndex(a => a.id == anchor.id) + 1;
                            break;
                        } else if (anchor.data.tag == `_${user.name}`) {
                            start = actions.findIndex(a => a.id == anchor.id) + 1;
                            break;
                        } else if (anchor.data.tag == `_${direction.y}` || anchor.data.tag == `_${direction.x}` || anchor.data.tag == `_${direction.y}-${direction.x}`) {
                            start = actions.findIndex(a => a.id == anchor.id) + 1;
                            break;
                        }
                    }
                }

                return await this.runActions(context, Math.max(start, 0));
            } else {
                //post this to the GM
                let tokenData = tokens.map(t => (t?.document?.uuid || t?.uuid));
                MonksActiveTiles.emit('trigger', { tileid: this.uuid, tokens: tokenData, method: method, pt: pt, options: options } );
            }
        }

        TileDocument.prototype.runActions = async function (context, start = 0, resume = null) {
            if (context._id == undefined)
                context._id = makeid();
            let actions = this.data.flags["monks-active-tiles"]?.actions || [];
            let pausing = false;

            for (let i = start; i < actions.length; i++) {
                let action = actions[i];

                let trigger = MonksActiveTiles.triggerActions[action.action];

                if (!trigger)
                    continue;

                if (trigger.requiresGM === true && !game.user.isGM)
                    continue;

                debug("Running action", action);
                context.index = i;
                context.action = action;
                let fn = trigger.fn;
                if (fn) {
                    if (action.delay > 0) {
                        let tile = this;
                        window.setTimeout(async function () {
                            try {
                                if (tile.getFlag('monks-active-tiles', 'active') !== false) {
                                    context.action = action;
                                    await fn.call(tile, context);
                                }
                            } catch (err) {
                                error(err);
                            }
                        }, action.delay * 1000);
                    } else {
                        let cancall = (resume != undefined) || await Hooks.call("preTriggerTile", this, this, context.tokens, context.action, context.userid, context.value);
                        if (cancall) {
                            try {
                                let result = resume || await fn.call(this, context);
                                resume = null;
                                if (typeof result == 'object') {
                                    log("context.value", context.value, "result", result);
                                    if (Array.isArray(result)) {
                                        for (let res of result) {
                                            if (typeof res == 'object') {
                                                log("res", res);
                                                context.value = mergeObject(context.value, res);
                                            }
                                        }
                                    } else
                                        context.value = mergeObject(context.value, result);
                                    delete context.value.goto;
                                    context.values.push(mergeObject(result, { action: action }));

                                    if (result.pause) {
                                        debug("Pausing actions");
                                        MonksActiveTiles.savestate[context._id] = context;
                                        result = { continue: false };
                                        pausing = true;
                                    }

                                    if (result.goto) {
                                        if (result.goto instanceof Array) {
                                            result.continue = false;
                                            for (let goto of result.goto) {
                                                if (this.getFlag('monks-active-tiles', 'active') !== false) {
                                                    debug("Jumping to Anchor", goto.tag);
                                                    let idx = actions.findIndex(a => a.action == 'anchor' && a.data.tag == goto.tag);
                                                    if (idx != -1) {
                                                        let gotoContext = Object.assign({}, context);
                                                        gotoContext = mergeObject(gotoContext, { value: goto });
                                                        gotoContext._id = makeid();
                                                        await this.runActions(gotoContext, idx + 1);
                                                    }
                                                } else {
                                                    debug("Skipping anchor due to Tile being inactive", goto.tag);
                                                }
                                            }
                                        } else {
                                            //find the index of the tag
                                            debug("Jumping to Anchor", result.goto);
                                            let idx = actions.findIndex(a => a.action == 'anchor' && a.data.tag == result.goto);
                                            if (idx != -1)
                                                i = idx;
                                        }
                                    }

                                    result = result.continue;
                                }
                                let cancontinue = await Hooks.call("triggerTile", this, this, context.tokens, context.action, context.userid, context.value);
                                if (result === false || cancontinue === false || this.getFlag('monks-active-tiles', 'active') === false || this.getFlag('monks-active-tiles', 'continue') === false) {
                                    this.unsetFlag('monks-active-tiles', 'continue');
                                    debug("Stopping actions", result, cancontinue, this.getFlag('monks-active-tiles', 'active'), this.getFlag('monks-active-tiles', 'continue'));
                                    break;
                                }
                            } catch (err) {
                                error(err);
                            }
                        }
                    }
                }
            }

            if (!pausing) {
                delete MonksActiveTiles.savestate[context._id];
            }

            return context;
        }

        TileDocument.prototype.resumeActions = async function (saveid, result) {
            let savestate = MonksActiveTiles.savestate[saveid];
            if (!savestate) {
                log(`Unable to find save state: ${saveid}`);
                return;
            }

            this.runActions(savestate, savestate.index, Object.assign({}, result));
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

        TileDocument.prototype.countTriggered = function (tokenid, method, userid) {
            //let tileHistory = (this.data.flags["monks-active-tiles"]?.history || {});
            //return Object.entries(tileHistory).length;

            let tileHistory = (this.data.flags["monks-active-tiles"]?.history || {});
            if (tokenid == undefined) {
                let count = 0;
                for (let [k, v] of Object.entries(tileHistory)) {
                    let result = v?.triggered.filter(h => {
                        return (method == undefined || h.how == method) && (userid == undefined || h.who == userid);
                    }) || [];
                    count += result.length;
                }
                return count;
            } else if (tokenid == "unique") {
                return Object.keys(tileHistory).length;
            } else {
                let result = tileHistory[tokenid]?.triggered.filter(h => {
                    return (method == undefined || h.how == method) && (userid == undefined || h.who == userid);
                }) || [];

                return result.length;
            }
        }

        TileDocument.prototype.addHistory = async function (tokenid, method, userid) {
            let tileHistory = this.data.flags["monks-active-tiles"]?.history || {};
            let data = { id: makeid(), who: userid, how: method, when: Date.now() };
            if (!tileHistory[tokenid])
                tileHistory[tokenid] = { tokenid: tokenid, triggered: [data] };
            else
                tileHistory[tokenid].triggered.push(data);

            //this.data.flags = mergeObject(this.data.flags, { "monks-active-tiles.history": tileHistory }); //Due to a race condition we need to set the actual value before trying to save it

            try {
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
            } catch {}
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
                await this.update({ [`flags.monks-active-tiles.-=history`]: null }, { render: false });
            } else {
                delete this.data.flags["monks-active-tiles"].history[tokenid];
                let key = `flags.monks-active-tiles.history.-=${tokenid}`;
                let updates = {};
                updates[key] = null;
                await this.update(updates, { render: false });
            }
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
                        stats.list.push(mergeObject(data, {
                            tokenid: k,
                            name: token?.name || (k == "" ? "" : 'Unknown'),
                            username: user?.name || 'Unknown',
                            whenfrmt: time,
                            howname: MonksActiveTiles.triggerModes[data.how] || data.how
                        }));
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

        let tokens = canvas.tokens.controlled.map(t => t.document);
        //check to see if this trigger is per token, and already triggered
        let triggerData = this.object.document.data.flags["monks-active-tiles"];
        if (triggerData.pertoken)
            tokens = tokens.filter(t => !this.object.document.hasTriggered(t.id)); //.uuid

        //Trigger this Tile
        this.object.document.trigger({ tokens: tokens, method: 'manual'});
    }

    static selectGroups(choices, options) {
        const localize = options.hash['localize'] ?? false;
        let selected = options.hash['selected'] ?? null;
        let blank = options.hash['blank'] || null;
        selected = selected instanceof Array ? selected.map(String) : [String(selected)];

        // Create an option
        const option = (groupid, id, label) => {
            if (localize) label = game.i18n.localize(label);
            let key = (groupid ? groupid + ":" : "") + id;
            let isSelected = selected.includes(key);
            html += `<option value="${key}" ${isSelected ? "selected" : ""}>${label}</option>`
        };

        // Create the options
        let html = "";
        if (blank) option("", blank);
        if (choices instanceof Array) {
            for (let group of choices) {
                let label = (localize ? game.i18n.localize(group.text) : group.text);
                html += `<optgroup label="${label}">`;
                Object.entries(group.groups).forEach(e => option(group.id, ...e));
                html += `</optgroup>`;
            }
        } else {
            Object.entries(group.groups).forEach(e => option(...e));
        }
        return new Handlebars.SafeString(html);
    }

    static get allowRun() {
        return game.user.isGM || (game.users.find(u => u.isGM && u.active) == undefined && setting("allow-player"));
    }

    static mergeArray(original, other = {}) {
        other = other || {};
        if (!(original instanceof Object) || !(other instanceof Object)) {
            throw new Error("One of original or other are not Objects!");
        }

        // Iterate over the other object
        for (let k of Object.keys(other)) {
            const v = other[k];
            if (!(v instanceof Array))
                throw new Error("One of the properties is not an array");
            if (original.hasOwnProperty(k)) {
                if (!(original[k] instanceof Array))
                    throw new Error("One of the properties is not an array");
                original[k] = original[k].concat(v);
            }
            else original[k] = v;
        }
        return original;
    }
}

Hooks.on('init', async () => {
    MonksActiveTiles.init();
});

Hooks.on('ready', () => {
    game.socket.on(MonksActiveTiles.SOCKET, MonksActiveTiles.onMessage);

    MonksActiveTiles._oldSheetClass = CONFIG.Tile.sheetClasses.base['core.TileConfig'].cls;
    CONFIG.Tile.sheetClasses.base['core.TileConfig'].cls = WithActiveTileConfig(CONFIG.Tile.sheetClasses.base['core.TileConfig'].cls);

    if (game.modules.get("item-piles")?.active && setting('drop-item')) {
        game.settings.set('monks-active-tiles', 'drop-item', false);
        ui.notifications.warn(i18n("MonksActiveTiles.msg.itempiles"));
        warn(i18n("MonksActiveTiles.msg.itempiles"));
    }

    if (!setting("fix-action-names")) {
        MonksActiveTiles.fixTiles();
        game.settings.set("monks-active-tiles", "fix-action-names", true);
    }
});

Hooks.on('preUpdateToken', async (document, update, options, userId) => { 
    //log('preupdate token', document, update, options, MonksActiveTiles._rejectRemaining);

    /*
    if (MonksActiveTiles._rejectRemaining[document.id] && options.bypass !== true) {
        update.x = MonksActiveTiles._rejectRemaining[document.id].x;
        update.y = MonksActiveTiles._rejectRemaining[document.id].y;
        options.animate = false;
    }*/

    //make sure to bypass if the token is being dropped somewhere, otherwise we could end up triggering a lot of tiles
    if ((update.x != undefined || update.y != undefined || update.elevation != undefined) && options.bypass !== true && options.animate !== false) { //(!game.modules.get("drag-ruler")?.active || options.animate)) {
        let token = document.object;

        if ((document.caught || document.getFlag('monks-active-tiles', 'teleporting')) && !options.teleport) {
            //do not update x/y if the token is under a cool down period, or if it is teleporting.
            delete update.x;
            delete update.y;
            return;
        }

        //log('triggering for', token.id);

        //Does this cross a tile
        for (let tile of document.parent.tiles) {
            if (tile.data.flags['monks-active-tiles']?.active && tile.data.flags['monks-active-tiles']?.actions?.length > 0) {
                if (game.modules.get("levels")?.active && _levels && _levels.isTokenInRange && !_levels.isTokenInRange(token, tile._object))
                    continue;

                //check and see if the ray crosses a tile
                let dest = { x: update.x || document.data.x, y: update.y || document.data.y };
                let elevation = update.elevation || document.data.elevation;
                let collision = tile.checkCollision(document, dest, !!tile.data.flags['monks-active-tiles']?.usealpha);

                if (collision.length > 0) {
                    let tpts = tile.canTrigger(document, collision, dest, elevation);
                    if (tpts) {
                        //preload any teleports to other scenes
                        //tile.document.preloadScene();

                        let doTrigger = async function (idx) {
                            if (idx >= tpts.length)
                                return;

                            let triggerPt = tpts[idx];
                            let pt = { x: triggerPt.x + ((document.data.height * document.parent.data.size) / 2), y: triggerPt.y + ((document.data.height * document.parent.data.size) / 2) };

                            //if it does and the token needs to stop, then modify the end position in update
                            let ray = new Ray({ x: document.data.x, y: document.data.y }, { x: triggerPt.x, y: triggerPt.y });

                            let stop = tile.checkStop();

                            //log('Triggering tile', update, stop);
                            let original = { x: update.x || document.data.x, y: update.y || document.data.y };
                            if (stop.stop) {
                                //check for snapping to the closest grid spot
                                if (stop.snap) {
                                    triggerPt = mergeObject(triggerPt, canvas.grid.getSnappedPosition(triggerPt.x, triggerPt.y));
                                }

                                //if this token needs to be stopped, then we need to adjust the path, and force close the movement animation
                                delete update.x;
                                delete update.y;

                                //make sure spamming the arrow keys is prevented
                                if (stop.coolDown) {
                                    document.caught = true;
                                    $('#board').addClass("cooldown")
                                    window.setTimeout(function () { delete document.caught; $('#board').removeClass("cooldown"); }, 1500);
                                }

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
                            const s = document.parent.data.size;
                            const speed = s * 10;
                            const duration = (ray.distance * 1000) / speed;

                            window.setTimeout(function () {
                                log('Tile is triggering', document);
                                tile.trigger({ tokens: [document], method: triggerPt.method, pt: pt, options: { original } });
                                if(!stop.stop)   //If this fires on Enter, and a stop is request then we don't need to run the On Exit code.
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
});

Hooks.on("preUpdateCombat", async function (combat, delta) {
    if (combat.started && game.user.isGM) {
        for (let layer of [canvas.background.tiles, canvas.foreground.tiles]) {
            for (let tile of layer) {
                let triggerData = tile.data.flags["monks-active-tiles"];
                if (triggerData && triggerData.active && triggerData.actions.length > 0 &&
                    ((delta.turn || delta.round) && triggerData.trigger == 'turnend')) {
                    let tokens = [combat.combatant.token];
                    tile.document.trigger({ tokens: tokens, method: 'turnend' });
                }
            }
        }
    }
});

Hooks.on("updateCombat", async function (combat, delta) {
    if (combat.started && game.user.isGM) {
        for (let layer of [canvas.background.tiles, canvas.foreground.tiles]) {
            for (let tile of layer) {
                let triggerData = tile.data.flags["monks-active-tiles"];
                if (triggerData && triggerData.active && triggerData.actions.length > 0 &&
                    ((delta.round && triggerData.trigger == 'round')
                        || ((delta.turn || delta.round) && triggerData.trigger == 'turn')
                        || (delta.round == 1 && combat.turn == 0 && triggerData.trigger == 'combatstart')
                    )) {
                    let tokens = (triggerData.trigger == 'turn' ? [combat.combatant.token] : combat.combatants.map(c => c.token));
                    tile.document.trigger({ tokens: tokens, method: triggerData.trigger });
                }
            }
        }
    }
});

Hooks.on("deleteCombat", async function (combat, delta) {
    if (combat.started && game.user.isGM) {
        for (let layer of [canvas.background.tiles, canvas.foreground.tiles]) {
            for (let tile of layer) {
                let triggerData = tile.data.flags["monks-active-tiles"];
                if (triggerData && triggerData.active && triggerData.actions.length > 0 && triggerData.trigger == 'combatend') {
                    let tokens = combat.combatants.map(c => c.token);
                    tile.document.trigger({ tokens: tokens, method: 'combatend' });
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

Hooks.on('renderTileHUD', (app, html, data) => {
    let active = app.object.document.getFlag('monks-active-tiles', 'active') ?? true;
    $('<div>')
        .addClass('control-icon')
        .toggleClass('active', active)
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

Hooks.on('controlTerrain', (terrain, control) => {
    if (control)
        MonksActiveTiles.controlEntity(terrain);
});

Hooks.on("setupTileActions", (app) => {
    if (game.modules.get('forien-quest-log')?.active) {
        app.registerTileGroup('forien-quest-log', "Forien's Quest Log");
        app.registerTileAction('forien-quest-log', 'openfql', {
            name: 'Open FQL Quest Log',
            ctrls: [
                {
                    id: "for",
                    name: "For",
                    list: "for",
                    type: "list"
                }
            ],
            values: {
                'for': {
                    "trigger": 'Triggering Player',
                    "everyone": 'Everyone',
                    "players": 'Players Only',
                    "gm": 'GM Only'
                }
            },
            group: 'forien-quest-log',
            fn: async (args = {}) => {
                const { action, userid } = args;

                if (action.data.for != 'gm')
                    MonksActiveTiles.emit('fql', { for: action.data.for, userid: userid });
                if (MonksActiveTiles.allowRun && (action.data.for == 'everyone' || action.data.for == 'gm' || action.data.for == undefined || (action.data.for == 'trigger' && userid == game.user.id)))
                    Hooks.call('ForienQuestLog.Open.QuestLog');

            },
            content: async (trigger, action) => {
                return `<span class="logic-style">${trigger.name}</span> for <span class="value-style">&lt;${i18n(trigger.values.for[action.data?.for])}&gt;</span>`;
            }
        });
    }

    if (game.modules.get('kandashis-fluid-canvas')?.active) {
        app.registerTileGroup('kandashis-fluid-canvas', "Kandashi's Fluid Canvas");
        app.registerTileAction('kandashis-fluid-canvas', 'execute', {
            name: 'Execute Effect',
            ctrls: [
                {
                    id: "effect",
                    name: "Effect",
                    list: "effect",
                    type: "list",
                    onChange: (app) => {
                        app.checkConditional();
                    },
                },
                {
                    id: "for",
                    name: "For",
                    list: "for",
                    type: "list",
                    conditional: (app) => {
                        return ["drug", "sepia", "drug", "negative", "blur"].includes($('select[name="data.effect"]', app.element).val());
                    }
                },
                {
                    id: "intensity",
                    name: "Intensity",
                    type: "number",
                    defvalue: 2,
                    required: true,
                    conditional: (app) => {
                        return ["earthquake", "heartbeat", "drug", "spin", "blur"].includes($('select[name="data.effect"]', app.element).val());
                    }
                },
                {
                    id: "duration",
                    name: "Duration (ms)",
                    type: "number",
                    defvalue: 1000,
                    required: true,
                    conditional: (app) => {
                        return ["earthquake", "heartbeat", "spin", "drug"].includes($('select[name="data.effect"]', app.element).val());
                    }
                },
                {
                    id: "iteration",
                    name: "Iteration",
                    type: "number",
                    defvalue: 3,
                    required: true,
                    conditional: (app) => {
                        return ["earthquake", "heartbeat", "spin", "drug"].includes($('select[name="data.effect"]', app.element).val());
                    }
                },
            ],
            values: {
                'effect': {
                    "earthquake": 'KFC.earthquake',
                    "heartbeat": 'KFC.heartBeat',
                    "drug": 'KFC.drug',
                    "spin": 'KFC.spin',
                    "fade": 'KFC.fade',
                    "sepia": 'KFC.sepia',
                    "negative": 'KFC.negative',
                    "blur": 'KFC.blur'
                },
                'for': {
                    "trigger": 'Triggering Player',
                    "everyone": 'Everyone',
                    "players": 'Players Only',
                    "gm": 'GM Only'
                }
            },
            group: 'kandashis-fluid-canvas',
            fn: async (args = {}) => {
                const { action, userid } = args;

                if (["earthquake", "heartbeat", "spin"].includes(action.data.effect))
                    KFC.executeForEveryone(action.data.effect, action.data.intensity, action.data.duration, action.data.iteration);
                else {
                    let users = (action.data.for == 'trigger' ? [userid] :
                        (action.data.for == 'gm' ? [game.user.id] :
                            game.users.filter(u => (action.data.for == 'everyone' || !u.isGM)).map(u => u.id)));
                    KFC.executeAsGM(action.data.effect, users, action.data.intensity, action.data.duration, action.data.iteration);
                }

            },
            content: async (trigger, action) => {
                return `<span class="logic-style">${trigger.name}</span> <span class="details-style">"${i18n(trigger.values.effect[action.data?.effect])}"</span>`;
            }
        });
    }

    if (game.modules.get('tagger')?.active) {
        app.registerTileGroup('tagger', "Tagger");
        app.registerTileAction('tagger', 'execute', {
            name: 'Add Tag',
            ctrls: [
                {
                    id: "entity",
                    name: "MonksActiveTiles.ctrl.select-entity",
                    type: "select",
                    subtype: "entity",
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => {
                        return (
                            entity instanceof Token ||
                            entity instanceof Tile ||
                            entity instanceof Drawing ||
                            entity instanceof AmbientLight ||
                            entity instanceof AmbientSound ||
                            entity instanceof Note); }
                },
                {
                    id: "tag",
                    name: "MonksActiveTiles.ctrl.tag",
                    type: "text",
                    required: true
                },
                {
                    id: "state",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "state",
                    type: "list",
                    defvalue: 'add'
                }
            ],
            values: {
                'state': {
                    'add': "MonksActiveTiles.state.add",
                    'remove': "MonksActiveTiles.state.remove",
                    'toggle': "MonksActiveTiles.state.toggle"
                }
            },
            group: 'tagger',
            fn: async (args = {}) => {
                const { action, userid } = args;

                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length) {
                    if (action.data.state == 'add')
                        Tagger.addTags(entities, action.data.tag);
                    else if (action.data.state == 'remove')
                        Tagger.removeTags(entities, action.data.tag);
                    else if (action.data.state == 'toggle')
                        Tagger.toggleTags(entities, action.data.tag);
                }

                return { tokens: entities };
            },
            content: async (trigger, action) => {
                return `<span class="action-style">Tagger</span> <span class="details-style">"${i18n(trigger.values.state[action.data?.state])}"</span> <span class="value-style">&lt;${action.data.tag}&gt;</span>`;
            }
        });
    }

    if (game.modules.get('confetti')?.active) {
        app.registerTileGroup('confetti', "Confetti");
        app.registerTileAction('confetti', 'shoot', {
            name: 'Shoot Confetti',
            ctrls: [
                {
                    id: "strength",
                    name: "Confetti Strength",
                    list: "strength",
                    type: "list",
                    defvalue: 2
                }
            ],
            values: {
                'strength': {
                    0: "Low",
                    1: "Medium",
                    2: "High"
                }
            },
            group: 'confetti',
            fn: async (args = {}) => {
                const { action, userid } = args;

                const shootConfettiProps = window.confetti.getShootConfettiProps(parseInt(action.data.strength));
                window.confetti.shootConfetti(shootConfettiProps);

                return { };
            },
            content: async (trigger, action) => {
                return `<span class="action-style">Shoot Confetti</span> <span class="details-style">"${i18n(trigger.values.strength[action.data?.strength])}"</span>`;
            }
        });
    }
});

Hooks.on("renderPlaylistDirectory", (app, html, user) => {
    $('li.sound', html).click(MonksActiveTiles.selectPlaylistSound.bind(this));
});

Hooks.once('libChangelogsReady', function () {
    //libChangelogs.register("monks-active-tiles", "The option to delay an action has been moved from being a property of the action itself to its own action under the Logic group.  It will still appear for old actions that used delay but won't appear for new ones.", "major")
});

Hooks.on("renderWallConfig", async (app, html, options) => {
    if (setting("allow-door")) {
        let entity = JSON.parse(app.object.data.flags['monks-active-tiles']?.entity || "{}");
        let tilename = "";
        if (entity.id)
            tilename = await MonksActiveTiles.entityName(entity);
        let triggerData = mergeObject({ tilename: tilename, showtagger: game.modules.get('tagger')?.active }, (app.object.data.flags['monks-active-tiles'] || {}));
        let wallHtml = await renderTemplate("modules/monks-active-tiles/templates/wall-config.html", triggerData);

        if ($('.sheet-tabs', html).length) {
            $('.sheet-tabs', html).append($('<a>').addClass("item").attr("data-tab", "triggers").html('<i class="fas fa-running"></i> Triggers'));
            $('<div>').addClass("tab action-sheet").attr('data-tab', 'triggers').html(wallHtml).insertAfter($('.tab:last', html));
        } else {
            let root = $('form', html);
            if (root.length == 0)
                root = html;
            let basictab = $('<div>').addClass("tab").attr('data-tab', 'basic');
            $('> *:not(button)', root).each(function () {
                basictab.append(this);
            });

            $(root).prepend($('<div>').addClass("tab action-sheet").attr('data-tab', 'triggers').html(wallHtml)).prepend(basictab).prepend(
                $('<nav>')
                    .addClass("sheet-tabs tabs")
                    .append($('<a>').addClass("item active").attr("data-tab", "basic").html('<i class="fas fa-university"></i> Basic'))
                    .append($('<a>').addClass("item").attr("data-tab", "triggers").html('<i class="fas fa-running"></i> Triggers'))
            );
        }

        $('button[data-type="entity"]', html).on("click", ActionConfig.selectEntity.bind(app));
        $('button[data-type="tagger"]', html).on("click", ActionConfig.addTag.bind(app));

        app.options.tabs = [{ navSelector: ".tabs", contentSelector: "form", initial: "basic" }];
        app.options.height = "auto";
        app._tabs = app._createTabHandlers();
        const el = html[0];
        app._tabs.forEach(t => t.bind(el));

        app.setPosition();
    }
});

Hooks.on("dropCanvasData", async (canvas, data, options, test) => {
    if (data.type == 'Item' && setting('drop-item')) {
        //Get the Item

        let item;

        if (data.pack) {
            const pack = game.packs.get(data.pack);
            item = await pack?.getDocument(data.id);
        } else {
            item = game.items.get(data.id);
        }

        if (!item)
            return ui.notifications.warn("Could not find item");

        //Create Tile
        //change the Tile Image to the Item image
        //Add the actions to Hide the Tile, Disabled the Tile, and Add the Item to Inventory
        let dest = canvas.grid.getSnappedPosition(data.x - (canvas.scene.data.size / 2), data.y - (canvas.scene.data.size / 2), canvas.background.gridPrecision);

        let td = mergeObject(dest, {
            img: item.img,
            width: canvas.scene.data.size,
            height: canvas.scene.data.size,
            flags: {
                'monks-active-tiles': { "active": true, "restriction": "all", "controlled": "all", "trigger": "click", "pertoken": false, "minrequired": 0, "chance": 100, "actions": [{ "action": "distance", "data": { "measure": "eq", "distance": { "value": 1, "var": "sq" }, "continue": "within" }, "id": "UugwKEORHARYwcS2" }, { "action": "exists", "data": { "entity": "" }, "id": "Tal2G8WXfo3xmL5U" }, { "action": "first", "id": "dU81VsGaWmAgLAYX" }, { "action": "showhide", "data": { "entity": { "id": "tile", "name": "This Tile" }, "hidden": "hide" }, "id": "UnujCziObnW2Axkx" }, { "action": "additem", "data": { "entity": "", "item": { "id": item.uuid, "name": "" } }, "id": "IwxJOA8Pi287jBbx" }, { "action": "notification", "data": { "text": "{{value.items.0.name}} has been added to {{value.tokens.0.name}}'s inventory", "type": "info", "showto": "token" }, "id": "oNx3QqEi0WpxfkhV" }, { "action": "activate", "data": { "entity": "", "activate": "deactivate" }, "id": "6K7aEZH8SnGv3Gyq" }] }
            }
        });

        const cls = getDocumentClass("Tile");
        await cls.create(td, { parent: canvas.scene });
    }
});

Hooks.on("renderSettingsConfig", (app, html, data) => {
    let colour = setting("teleport-colour");
    $('<input>').attr('type', 'color').attr('data-edit', 'monks-active-tiles.teleport-colour').val(colour).insertAfter($('input[name="monks-active-tiles.teleport-colour"]', html).addClass('color'));
});

Hooks.on("renderTileConfig", (app, html, data) => {
    //Make sure that another module hasn't erased the monks-active-tiles class
    $(app.element).addClass("monks-active-tiles");
});

Hooks.on("canvasReady", () => {
    $('#board').css({ 'cursor': '' });
    MonksActiveTiles.hoveredTiles = new Set();
    for (let tile of canvas.scene.tiles) {
        let triggerData = tile.data.flags["monks-active-tiles"];
        if (triggerData && triggerData.active && triggerData.trigger == "ready") {
            //check to see if this trigger is restricted by control type
            if ((triggerData.controlled == 'gm' && !game.user.isGM) || (triggerData.controlled == 'player' && game.user.isGM))
                return;

            return tile.trigger({ method: "ready" });
        }
    }
});

Hooks.on("openJournalEntry", (document, options, userid) => {
    if (MonksActiveTiles.waitingInput && MonksActiveTiles.waitingInput.waitingfield.data('type') == 'entity') {
        let restrict = MonksActiveTiles.waitingInput.waitingfield.data('restrict');
        if (!restrict || restrict(document)) {
            return false;
        }
    }
});

Hooks.on('updateTile', async (document, update, options, userId) => {
    if (update.img != undefined) {
        let triggerData = document.data.flags["monks-active-tiles"];
        if (triggerData?.usealpha) {
            window.setTimeout(function () {
                document.object._createAlphaMap({ keepPixels: true });
            }, 500);
        }
    }
});

Hooks.on('preUpdateWall', async (document, update, options, userId) => {
    if (update.door != undefined && (document.data.door == 2 || update.door == 2))
        MonksActiveTiles.wallchange = "secret";

    if (update.ds != undefined) {
        if (document.data.ds == 2 || update.ds == 2)
            MonksActiveTiles.wallchange = "lock";
        else if (update.ds == 0)
            MonksActiveTiles.wallchange = "close";
        else if (update.ds == 1)
            MonksActiveTiles.wallchange = "open";
    }
});

Hooks.on("globalInterfaceVolumeChanged", (volume) => {
    for (let tile of canvas.scene.tiles) {
        for (let sound of Object.values(tile.soundeffect || {})) {
            if (sound._mattvolume) {
                sound.volume = volume * (sound._mattvolume ?? 1);
            }
        }
    }
});