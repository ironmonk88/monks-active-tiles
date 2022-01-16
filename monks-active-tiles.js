import { registerSettings } from "./settings.js";
import { WithActiveTileConfig } from "./apps/active-tile-config.js"

let debugEnabled = 1;
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
    //static _rejectRemaining = {};
    static savestate = {};

    static timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    static emit(action, args = {}) {
        args.action = action;
        args.senderId = game.user.id
        game.socket.emit( MonksActiveTiles.SOCKET, args, (resp) => { } );
    }

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
                game.togglePause((action?.data?.pause !== 'unpause'), true);
            },
            content: async (trigger, action) => {
                return `<span class="action-style">${i18n(trigger.values.state[action?.data?.pause || 'pause'])} game</span>`;
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
                    //attr: { min: "0", step: "any" }
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
                return `<span class="action-style">Wait</span> for <span class="details-style">"${action.data.delay} seconds"</span>`;
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
                return `<span class="action-style">${i18n(trigger.name)}</span>${(action.data?.snap ? ' <i class="fas fa-compress" title="Snap to grid"></i>' : '')}`;
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
                    restrict: (entity) => { return (entity instanceof Tile || entity instanceof Token); },
                    required: true
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
                const { action, userid, value } = args;
                let panfor = action.data.panfor || 'trigger';

                let dest = await MonksActiveTiles.getLocation(action.data.location, value);
                if (dest.scene != undefined && dest.scene != canvas.scene.id)
                    return;

                if ((panfor == 'token' && game.userid != userid) || panfor != 'token')
                    MonksActiveTiles.emit('pan', { userid: (panfor == 'token' ? userid : null), animate: action.data.animate, x: dest.x, y: dest.y, scale: dest.scale });

                if (panfor == 'all') {
                    if (action.data.animate)
                        canvas.animatePan(dest);
                    else
                        canvas.pan(dest);
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
                    type: "checkbox"
                },
                {
                    id: "preservesettings",
                    name: "MonksActiveTiles.ctrl.preservesettings",
                    type: "checkbox"
                },
                {
                    id: "avoidtokens",
                    name: "MonksActiveTiles.ctrl.avoidtokens",
                    type: "checkbox"
                }
            ],
            fn: async (args = {}) => {
                const { action, userid, value } = args;

                let entities = await MonksActiveTiles.getEntities(args);

                if (!entities || entities.length == 0) {
                    ui.notifications.info(i18n('MonksActiveTiles.msg.noteleporttoken'));
                    return;
                }

                let result = { continue: true, tokens: entities, entities: entities };

                for (let tokendoc of entities) {
                    let tokenWidth = ((tokendoc.parent.dimensions.size * tokendoc.data.width) / 2);
                    let tokenHeight = ((tokendoc.parent.dimensions.size * tokendoc.data.height) / 2);

                    let oldPos = {
                        x: tokendoc.data.x + tokenWidth,
                        y: tokendoc.data.y + tokenHeight
                    }

                    let dest = await MonksActiveTiles.getLocation(action.data.location, value);

                    //move the token to the new square
                    let newPos = {
                        x: dest.x,
                        y: dest.y
                    };

                    if (dest.scene == undefined || dest.scene == tokendoc.parent.id) {
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
                        if (userid != game.user.id) {
                            MonksActiveTiles.emit('fade', { userid: userid });
                            await MonksActiveTiles.timeout(400);
                        }

                        let offset = { dx: oldPos.x - newPos.x, dy: oldPos.y - newPos.y };
                        await tokendoc.update({ x: newPos.x, y: newPos.y }, { bypass: true, animate: false });

                        if (userid != game.user.id)
                            MonksActiveTiles.emit('offsetpan', { userid: userid, animatepan: action.data.animatepan, x: offset.dx - (tokendoc.data.width / 2), y: offset.dy - (tokendoc.data.height / 2) });
                    } else {
                        result.tokens = [];
                        //if the end spot is on a different scene then hide this token, check the new scene for a token for that actor and move it, otherwise create the token on the new scene

                        if (userid != game.user.id) {
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
                            await newtoken.update((action.data.preservesettings ? { x: newPos.x, y: newPos.y, hidden: tokendoc.data.hidden } : td), { bypass: true, animate: false });
                        }
                        else {
                            const cls = getDocumentClass("Token");
                            newtoken = await cls.create(td, { parent: scene });
                        }

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
                }

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
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Tile || entity instanceof Drawing); }
                },
                {
                    id: "location",
                    name: "MonksActiveTiles.ctrl.select-coordinates",
                    type: "select",
                    subtype: "either",
                    options: { showTagger: true },
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
                const { action, value } = args;
                //wait for animate movement
                let entities = await MonksActiveTiles.getEntities(args);
                    
                if (entities && entities.length > 0) {
                    let dest = await MonksActiveTiles.getLocation(action.data.location, value);
                    //set or toggle visible
                    for (let entity of entities) {
                        let object = entity.object;
                        if (object instanceof Token)
                            await object.stopAnimation();
                        else
                            await CanvasAnimation.terminateAnimation(`${entity.documentName}.${entity.id}.animateMovement`);

                        let newPos = {
                            x: dest.x - ((object.w || object.width) / 2),
                            y: dest.y - ((object.h || object.height) / 2)
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

                            if (action.data.wait)
                                await animate().then(async () => { await entity.update({ x: newPos.x, y: newPos.y }); });
                            else
                                animate().then(async () => { await entity.update({ x: newPos.x, y: newPos.y }); });
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
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Tile || entity instanceof Drawing); }
                },
                {
                    id: "hidden",
                    name: "MonksActiveTiles.ctrl.state",
                    list: "hidden",
                    type: "list",
                    defvalue: 'hide'
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
                        if(entity)
                            await entity.update({ hidden: (action.data.hidden == 'toggle' ? !entity.data.hidden : (action.data.hidden == 'previous' ? !value.visible : action.data.hidden !== 'show')) });
                    }

                    let result = { entities: entities };
                    if (entities[0] instanceof TokenDocument)
                        result.tokens = entities;
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
                    restrict: (entity) => { return (entity instanceof Actor); },
                    required: true,
                    defaultType: 'actors',
                    placeholder: 'Please select an Actor to create'
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
                const { tile, action, value } = args;
                //find the item in question
                let entities = await MonksActiveTiles.getEntities(args, null, 'actors');

                if (entities && entities.length > 0) {
                    let dest = await MonksActiveTiles.getLocation(action.data.location, value);

                    let result = { continue: true, tokens: [], entities: entities };
                    for (let actor of entities) {
                        if (actor instanceof Actor) {
                            //let actor = await Actor.implementation.fromDropData({id: entity.id, type: 'Actor'});
                            if (actor.compendium) {
                                const actorData = game.actors.fromCompendium(actor);
                                actor = await Actor.implementation.create(actorData);
                            }

                            let data = {
                                x: dest.x,
                                y: dest.y,
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
                let entities = await MonksActiveTiles.getEntities(args, null, 'actors');

                if (entities && entities.length > 0) {
                    let entry = entities[0];
                    let dest = await MonksActiveTiles.getLocation(action.data.location, value);

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
                let entities = await MonksActiveTiles.getEntities(args, null, 'tiles');
                if (entities.length == 0)
                    return;

                for (let entity of entities) {
                    if (entity instanceof AmbientLightDocument || entity instanceof AmbientSoundDocument || entity._object?.terrain != undefined)
                        await entity.update({ hidden: (action.data.activate == 'toggle' ? !entity.data.hidden : (action.data.activate == 'previous' ? !value.activate : action.data.activate != 'activate')) });
                    else if (entity instanceof TileDocument)
                        await entity.setFlag('monks-active-tiles', 'active', (action.data.activate == 'toggle' ? !entity.getFlag('monks-active-tiles', 'active') : (action.data.activate == 'previous' ? !value.activate : action.data.activate == 'activate')));
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
                    required: true
                },
                {
                    id: "value",
                    name: "MonksActiveTiles.ctrl.value",
                    type: "text",
                    required: true,
                    onBlur: (app) => {
                        app.checkConditional();
                        app.setPosition({height:'auto'});
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
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args);

                if (entities && entities.length > 0) {
                    for (let entity of entities) {
                        if (entity) {
                            let attr = action.data.attribute;
                            let base = entity;

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

                            if (prop && typeof prop == 'object') {
                                if (prop.value == undefined) {
                                    debug("Attribute returned an object and the object doesn't have a value property", entity, attr, prop);
                                    continue;
                                }

                                attr = attr + '.value';
                                prop = prop.value;
                            }


                            let update = {};
                            let val = action.data.value;

                            if (val == 'true')
                                val = true;
                            else if (val == 'false')
                                val = false;
                            else
                            {
                                let context = { actor: tokens[0]?.actor?.data, token: tokens[0]?.data, tile: tile.data, entity: entity, user: game.users.get(userid), value: value };

                                if (val.includes("{{")) {
                                    const compiled = Handlebars.compile(val);
                                    val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                                }

                                const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)([\]]{2,3})(?:{([^}]+)})?/gi;
                                val = await MonksActiveTiles.inlineRoll(val, rgx, action.data.chatMessage, action.data.rollmode, entity);

                                if (val.startsWith('+ ') || val.startsWith('- ')) {
                                    try {
                                        val = eval(prop + val);
                                    } catch (err) {
                                        val = 0;
                                        debug(err);
                                    }
                                }
                                if (typeof val == "string" && val.startsWith('=')) {
                                    try {
                                        val = eval(val.substring(1));
                                    } catch (err) {
                                        val = 0;
                                        debug(err);
                                    }
                                }

                                if (!isNaN(val) && !isNaN(parseFloat(val)))
                                    val = parseFloat(val);
                            }
                            update[attr] = val;
                            await entity.update(update);
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
                let actionName = 'set';
                let midName = 'to';
                let value = action.data?.value;
                if (action.data?.value.startsWith('+ ') || action.data?.value.startsWith('- ')){
                    actionName = action.data?.value.startsWith('+ ') ? 'increase' : 'decrease';
                    midName = 'by';
                    value = action.data?.value.substring(2)
                } else if (action.data?.value.startsWith('=')) {
                    value = `(${action.data?.value.substring(1)})`;
                }
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span>, ${actionName} <span class="value-style">&lt;${action.data?.attribute}&gt;</span> ${midName} <span class="details-style">"${value}"</span>`;
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
                        app.setPosition({ height: 'auto' });
                    },
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
                    variation: "volume",
                    defvalue: "1.0"
                },
                {
                    id: "loop",
                    name: "MonksActiveTiles.ctrl.loop",
                    type: "checkbox"
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
                },
                'volume': {
                    'value': "value",
                    'percent': "percent"
                }
            },
            fn: async (args = {}) => {
                const { tile, action, userid } = args;
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
                if (action.data.volume.var == 'percent')
                    volume = game.settings.get("core", "globalAmbientVolume") * action.data.volume.value;
                else
                    volume = action.data.volume.value;

                let audiofiles = await getTileSounds(tile);
                const audiofile = audiofiles[Math.floor(Math.random() * audiofiles.length)];

                if (action.data.audiofor != 'gm') {
                    MonksActiveTiles.emit('playsound', {
                        tileid: tile.uuid,
                        src: audiofile,
                        loop: action.data.loop,
                        userid: (action.data.audiofor == 'token' ? userid : null),
                        sceneid: (action.data.audiofor == 'token' ? null : (action.data.scenerestrict ? tile.parent.id : null)),
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
                        return (entity instanceof PlaylistSound);
                    },
                    required: true,
                    defaultType: 'playlists',
                    placeholder: 'Please select a playlist'
                },
                {
                    id: "volume",
                    name: "MonksActiveTiles.ctrl.volume",
                    type: "slider",
                    variation: "volume",
                    defvalue: "1.0"
                },
                {
                    id: "loop",
                    name: "MonksActiveTiles.ctrl.loop",
                    type: "checkbox"
                }
            ],
            values: {
                'volume': {
                    'value': "value",
                    'percent': "percent"
                }
            },
            fn: async (args = {}) => {
                const { tile, action, userid } = args;
                
                let volume = 1;
                if (action.data.volume.var == 'percent')
                    volume = game.settings.get("core", "globalAmbientVolume") * action.data.volume.value;
                else
                    volume = action.data.volume.value;

                let entities = await MonksActiveTiles.getEntities(args, null, 'playlists');
                for (let entity of entities) {
                    await entity.update({ playing: true, repeat: action.data.loop, volume: volume });
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data.entity, 'playlists')
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span>${(action.data?.loop ? ' <i class="fas fa-sync" title="Loop sound"></i>' : '')}`;
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
                        app.setPosition({ height: 'auto' });
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
                    let entities = await MonksActiveTiles.getEntities(args, null, 'tiles');
                    for (let entity of entities) {
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
                    let walls = await MonksActiveTiles.getEntities(args, null, 'walls');
                    for (let wall of walls) {
                        if (wall && wall.data.door != 0) {
                            let state = (action.data.state == 'open' ? CONST.WALL_DOOR_STATES.OPEN : (action.data.state == 'lock' ? CONST.WALL_DOOR_STATES.LOCKED : CONST.WALL_DOOR_STATES.CLOSED));
                            if (action.data.state == 'toggle' && wall.data.ds != CONST.WALL_DOOR_STATES.LOCKED)
                                state = (wall.data.ds == CONST.WALL_DOOR_STATES.OPEN ? CONST.WALL_DOOR_STATES.CLOSED : CONST.WALL_DOOR_STATES.OPEN);
                            await wall.update({ ds: state });
                        }
                    }
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'walls');
                return `<span class="action-style">${i18n(trigger.name)}</span> of <span class="entity-style">${entityName}</span> to <span class="details-style">"${i18n(trigger.values.state[action.data?.state])}"</span>`;
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
            content: async (trigger, action) => {
                return `<span class="action-style">${i18n(trigger.name)}</span> as <span class="details-style">"${i18n(trigger.values.type[action.data?.type])}"</span> to <span class="value-style">&lt;${i18n(trigger.values.showto[action.data?.showto])}&gt;</span>`;
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
                    subtype: "multiline",
                    required: true
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
                const { tile, tokens, action, userid, value } = args;

                let entities = await MonksActiveTiles.getEntities(args);
                let entity = (entities.length > 0 ? entities[0] : null);

                //Add a chat message
                let user = game.users.find(u => u.id == userid);
                let scene = game.scenes.find(s => s.id == user?.viewedScene);

                let tkn = (entity?.object || tokens[0]?.object);

                const speaker = { scene: scene?.id, actor: tkn?.actor.id || user?.character?.id, token: tkn?.id, alias: tkn?.name || user?.name };

                let context = { actor: tokens[0]?.actor.data, token: tokens[0]?.data, speaker: tokens[0], tile: tile.data, entity: entity, user: game.users.get(userid), value: value };
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

                    if (action.data.for == 'gm')
                        messageData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
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
                return `<span class="action-style">${i18n(trigger.name)}</span> for <span class="value-style">&lt;${i18n(trigger.values.for[action.data?.for])}&gt;</span>${(action.data.language != '' && game.modules.get("polyglot")?.active ? ` in <span class="details-style">"${syslang[action.data.language]}"</span>` : '')}${(action.data?.incharacter ? ' <i class="fas fa-user" title="In Character"></i>' : '')}${(action.data?.chatbubble ? ' <i class="fas fa-comment" title="Chat Bubble"></i>' : '')}`;
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
                    type: "list",
                    required: true
                },
                {
                    id: "args",
                    name: "MonksActiveTiles.ctrl.args",
                    type: "text",
                    conditional: () => {
                        return (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active);
                    }
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
                let macro = game.macros.get(action.data.macroid);
                if (macro instanceof Macro) {
                    return await MonksActiveTiles._executeMacro(macro, args);
                }
            },
            content: async (trigger, action) => {
                let macro = game.macros.get(action.data?.macroid);
                return `<span class="action-style">${i18n(trigger.name)}</span>, <span class="entity-style">${(macro?.name || 'Unknown Macro')}</span>${(action.data.runasgm != undefined && action.data.runasgm != 'unknown' ? ' as <span class="value-style">&lt;' + i18n(trigger.values.runas[action.data.runasgm]) + '&gt;</span>' : '')}`;
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
                    type: "list",
                    required: true
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
                    let results = { continue: true };
                    if (game.modules.get("better-rolltables")?.active) {
                        let BRTBuilder = await import('/modules/better-rolltables/scripts/core/brt-builder.js');
                        let BetterResults = await import('/modules/better-rolltables/scripts/core/brt-table-results.js');
                        let LootChatCard = await import('/modules/better-rolltables/scripts/loot/loot-chat-card.js');

                        const brtBuilder = new BRTBuilder.BRTBuilder(rolltable);
                        const results = await brtBuilder.betterRoll();

                        if (game.settings.get('better-rolltables', 'use-condensed-betterroll')) {
                            const br = new BetterResults.BetterResults(results);
                            const betterResults = await br.buildResults(tableEntity);
                            const currencyData = br.getCurrencyData();

                            const lootChatCard = new LootChatCard.LootChatCard(betterResults, currencyData);
                            await lootChatCard.createChatCard(tableEntity);
                        } else {
                            await brtBuilder.createChatCard(results);
                        }

                        if (results.length) {
                            //roll table result
                            entity = [];
                            for (let tableresult of value.results) {
                                let collection = game.collections.get(tableresult.data.collection);
                                let item = collection.get(tableresult.data.resultId);
                                entity.push(item);
                            }

                            entity = entity.filter(e => e);
                        }

                        results.results = results;
                        results.roll = brtBuilder.mainRoll;
                    } else {
                        let result = await rolltable.draw({ rollMode: action.data.rollmode, displayChat: false });
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

                        results.results = result.results;
                        results.roll = result.roll;
                    }

                    if (results.results.length) {
                        //roll table result
                        results.actors = [];
                        results.items = [];
                        for (let tableresult of result.results) {
                            let collection = game.collections.get(tableresult.data.collection);
                            let entity = collection.get(tableresult.data.resultId);
                            if (entity instanceof Item)
                                results.items.push(entity);
                            else if(entity instanceof Actor)
                                results.actors.push(entity);
                        }

                        results.actors = results.actors.filter(e => e);
                        results.items = results.items.filter(e => e);
                    }

                    return results;
                }
            },
            content: async (trigger, action) => {
                let rolltable = game.tables.get(action.data?.rolltableid);
                return `<span class="action-style">${i18n(trigger.name)}</span>, from <span class="entity-style">${(rolltable?.name || 'Unknown Roll Table')}</span>`;
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
                    type: "list",
                    required: true
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

                return { tokens: entities, entities: entities };
            },
            content: async (trigger, action) => {
                let effect = CONFIG.statusEffects.find(e => e.id === action.data?.effectid);
                if (game.system.id == 'pf2e')
                    effect = game.pf2e.ConditionManager.getCondition(action.data?.effectid);
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="action-style">${i18n(trigger.values.add[action?.data?.addeffect || 'add'])}</span> <span class="details-style">"${(i18n(effect.label) || effect.name || 'Unknown Effect')}"</span> ${(action.data?.addeffect == 'add' ? "to" : (action.data?.addeffect == 'remove' ? "from" : "on"))} <span class="entity-style">${entityName}</span>`;
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
                let entities = await MonksActiveTiles.getEntities(args, null, 'tiles');
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
                    restrict: (entity) => { return (entity instanceof JournalEntry || entity instanceof Actor); },
                    required: true,
                    defaultType: 'journal',
                    placeholder: 'Please select a Journal or Actor'
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
                let entities = await MonksActiveTiles.getEntities(args, null, 'journal');
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
                }
            ],
            fn: async (args = {}) => {
                const { action } = args;
                let entities = await MonksActiveTiles.getEntities(args);
                if (entities.length == 0)
                    return;

                let items = await MonksActiveTiles.getEntities(args, action.data.item.id, 'items');
                if (items?.length) {
                    for (let item of items) {
                        if (item instanceof Item) {
                            for (let token of entities) {
                                if (token instanceof TokenDocument) {
                                    const itemData = item.toObject();

                                    const actor = token.actor;
                                    if (!actor) return;

                                    // Create the owned item
                                    actor.createEmbeddedDocuments("Item", [itemData]);
                                }
                            }
                        }
                    }
                }

                return { tokens: entities, entities: entities, items: items };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                let item = await fromUuid(action.data?.item.id);
                return `<span class="action-style">${i18n(trigger.name)}</span>, <span class="details-style">"${item?.name || 'Unknown Item'}"</span> to <span class="entity-style">${entityName}</span>`;
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
                    options: { showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Note || entity instanceof JournalEntry); },
                    defaultType: 'journal',
                    placeholder: 'Please select a Journal, Note, or Token'
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
                return `<span class="action-style">${i18n(trigger.name)}</span> <span class="entity-style">${entityName}</span> using <span class="details-style">"${actor?.name || 'Unknown Actor'}, ${item?.name || 'Unknown Item'}"</span>`;
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
                    options: { showTile: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Tile); },
                    defaultType: 'tiles'
                }
            ],
            fn: async (args = {}) => {
                const { tile, userid } = args;
                let entities = await MonksActiveTiles.getEntities(args, null, 'tiles');
                if (entities.length == 0)
                    return;

                let entity = entities[0];
                //make sure we're not in a loop
                if (MonksActiveTiles.triggered == undefined)
                    MonksActiveTiles.triggered = [];

                //Add this trigger if it's the original one
                MonksActiveTiles.triggered.push(tile.id);

                let newargs = duplicate(args);
                newargs.method = "Trigger";
                await entity.trigger.call(entity, newargs);

                //remove this trigger as it's done
                MonksActiveTiles.triggered.pop();
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
                        let result = {};
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
                const { action, userid } = args;
                let scene = game.scenes.find(s => s.id == action.data.sceneid);
                if (game.user.id == userid)
                    await (action.data.activate ? scene.activate() : scene.view());
                else
                    MonksActiveTiles.emit('switchview', { userid: [userid], sceneid: scene.id, activate: action.data.sceneid });
            },
            content: async (trigger, action) => {
                let scene = game.scenes.find(s => s.id == action.data.sceneid);
                return `<span class="action-style">${i18n(trigger.name)}</span> to <span class="detail-style">"${scene?.name}"</span>${(action.data.activate ? ' <i class="fas fa-bullseye" title="Activate Scene"></i>' : '')}`
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
                    restrict: (entity) => { return (entity instanceof Token); }
                },
                {
                    id: "start",
                    name: "MonksActiveTiles.ctrl.startcombat",
                    type: "checkbox"
                }
            ],
            fn: async (args = {}) => {
                const { action } = args;

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

                if (combat && action.data.start && !combat.started)
                    combat.startCombat();

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
                    required: true
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
                return `<span class="action-style">${actionName} elevation</span> of <span class="entity-style">${entityName}</span> ${midName} <span class="details-style">"${value}"</span`;
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
                let entities = await MonksActiveTiles.getEntities(args, null, 'tiles');

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
                    id: "files",
                    name: "MonksActiveTiles.ctrl.images",
                    type: "filelist",
                    required: true
                }
            ],
            fn: async (args = {}) => {
                const { tile, tokens, action, userid, value } = args;
                let entities = await MonksActiveTiles.getEntities(args, null, 'tiles');

                tile._cycleimages = tile._cycleimages || {};
                let files = tile._cycleimages[action.id];
                if (files == undefined) {
                    let actfiles = (action.data?.files || []);
                    files = tile._cycleimages[action.id] = await MonksActiveTiles.getTileFiles(actfiles);
                }

                if (entities && entities.length > 0 && files.length > 0) {
                    let actions = duplicate(tile.getFlag('monks-active-tiles', 'actions'));
                    let act = actions.find(a => a.id == action.id);

                    act.data.imgat = (Math.clamped((act.data?.imgat || 1), 1, files.length) % files.length) + 1;
                    for (let entity of entities) {
                        await entity.update({ img: files[act.data.imgat - 1] });
                    }
                    
                    tile.setFlag('monks-active-tiles', 'actions', actions);
                }
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity, 'tiles');
                return `<span class="action-style">${i18n(trigger.name)}</span> for <span class="entity-style">${entityName}</span>`;
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
                    options: { showTile: true, showToken: true, showWithin: true, showPlayers: true, showPrevious: true, showTagger: true },
                    restrict: (entity) => { return (entity instanceof Token || entity instanceof Tile || entity instanceof Drawing || entity instanceof Note); },
                    defaultType: 'tiles'
                }
            ],
            fn: async (args = {}) => {
                let entities = await MonksActiveTiles.getEntities(args, null, 'tiles');

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
        'distance': {
            name: "MonksActiveTiles.filter.distance",
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
                    id: "measure",
                    name: "Measure",
                    list: "measure",
                    type: "list",
                    onChange: (app) => {
                        app.checkConditional();
                        app.setPosition({ height: 'auto' });
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

                let midTile = { x: tile.data.x + (tile.data.width / 2), y: tile.data.y + (tile.data.height / 2)};

                let tileX1 = tile.data.x;
                let tileY1 = tile.data.y;
                let tileX2 = tile.data.x + tile.data.width;
                let tileY2 = tile.data.y + tile.data.height;
                if (tile.data.rotation != 0) {
                    function rotate(cx, cy, x, y, angle) {
                        var rad = Math.toRadians(angle),
                            cos = Math.cos(rad),
                            sin = Math.sin(rad),
                            run = x - cx,
                            rise = y - cy,
                            tx = (cos * run) + (sin * rise) + cx,
                            ty = (cos * rise) - (sin * run) + cy;
                        return [tx, ty];
                    }

                    [tileX1, tileY1] = rotate(midTile.x, midTile.y, tileX1, tileY1, tile.data.rotation);
                    [tileX2, tileY2] = rotate(midTile.x, midTile.y, tileX2, tileY2, tile.data.rotation);
                }

                let entities = await MonksActiveTiles.getEntities(args);

                let tokens = entities.filter(t => {
                    if (!(t instanceof TokenDocument))
                        return false;

                    const midToken = { x: t.data.x + ((t.data.width * canvas.grid.w) / 2), y: t.data.y + ((t.data.height * canvas.grid.h) / 2) };

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

                        let intersect = [
                            tokenRay.intersectSegment([tileX1, tileY1, tileX2, tileY1]),
                            tokenRay.intersectSegment([tileX2, tileY1, tileX2, tileY2]),
                            tokenRay.intersectSegment([tileX1, tileY2, tileX2, tileY2]),
                            tokenRay.intersectSegment([tileX1, tileY1, tileX1, tileY2])
                        ].filter(i => i);

                        if (intersect.length == 0) {
                            //it's within the tile
                            return action.data.measure == 'lte';
                        } else {
                            const dist = Math.hypot(intersect[0].x - midToken.x, intersect[0].y - midToken.y) - ((t.data.width * canvas.grid.w) / 2);
                            console.log('token within', dist);

                            return (action.data.measure == 'gt' ? dist > distance : dist <= distance && dist > -(t.data.width * canvas.grid.w));
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
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                }
            ],
            group: "filters",
            fn: async (args = {}) => {
                let entities = await MonksActiveTiles.getEntities(args);
                return { continue: entities.length > 0, tokens: entities };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="filter-style">Stop</span> if <span class="entity-style">${entityName}</span> doesn't exist`;
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
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Token); }
                }
            ],
            group: "filters",
            fn: async (args = {}) => {
                let { value } = args;

                let entities = await MonksActiveTiles.getEntities(args);

                return { tokens: (entities.length ? [entities[0]] : []) };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="filter-style">Limit</span> <span class="entity-style">${entityName}</span> to <span class="value-style">"First"</span> in the list`;
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
                    options: { showToken: true, showWithin: true, showPlayers: true, showPrevious: true },
                    restrict: (entity) => { return (entity instanceof Token); }
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
            group: "filters",
            fn: async (args = {}) => {
                let { action, value, tokens, tile } = args;

                let entities = await MonksActiveTiles.getEntities(args);

                let result = entities.filter(entity => {
                    if (!(entity instanceof TokenDocument))
                        return false;

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
                            let context = { actor: tokens[0]?.actor?.data, token: tokens[0]?.data, tile: tile.data, entity: entity, user: game.users.get(userid), value: value };
                            const compiled = Handlebars.compile(val);
                            val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                        }

                        if (val.startsWith('= '))
                            val = '=' + val;

                        try {
                            return eval(prop + ' ' + val);
                        } catch {
                            return false;
                        }
                    }
                });

                return { tokens: result };
            },
            content: async (trigger, action) => {
                let entityName = await MonksActiveTiles.entityName(action.data?.entity);
                return `<span class="filter-style">Find</span> <span class="entity-style">${entityName}</span> with <span class="value-style">&lt;${action.data?.attribute}&gt;</span> <span class="details-style">"${action.data?.value}"</span>`;
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
                        app.setPosition({ height: 'auto' });
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
                const { action } = args;

                if (action.data?.limit) {
                    let loop = args.value.loop || {};
                    let loopval = (loop[action.id] || 0) + 1;
                    loop[action.id] = loopval;
                    if (loopval >= action.data?.limit)
                        return { continue: action.data?.resume };
                    else
                        return { goto: action.data?.tag, loop: loop };
                } else
                    return { goto: action.data?.tag };
            },
            content: async (trigger, action) => {
                return `<span class="logic-style">${i18n(trigger.name)}:</span> <span class="tag-style">${action.data?.tag}</span>${action.data?.limit ? ' limit by <span class="details-style">"' + action.data?.limit + '"</span>' : ''}${(action.data?.resume ? ' <i class="fas fa-forward" title="Resume after looping"></i>' : '')}`;
            }
        },
        'stop': {
            name: "MonksActiveTiles.logic.stop",
            group: "logic",
            fn: async (args = {}) => {
                return { continue: false };
            },
            content: async (trigger, action) => {
                return `<span class="logic-style">${i18n(trigger.name)}</span>`;
            }
        }
    }

    static async getEntities(args, id, defaultType) {
        const { tile, tokens, action, value, userid } = args;
        id = id || action.data.entity.id;

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
            entities = canvas.tokens.placeables.filter(t => {
                return t.actor != undefined && t.actor?.hasPlayerOwner && t.actor?.data.type != 'npc';
            }).map(t => t.document);
        }
        else if (id == 'within') {
            //find all tokens with this Tile
            entities = canvas.tokens.placeables.filter(t => {
                const midToken = { x: t.data.x + (t.data.width / 2), y: t.data.y + (t.data.height / 2) };
                return tile.pointWithin(midToken);
            }).map(t => t.document);
        }
        else if (id == 'controlled') {
            entities = canvas.tokens.controlled.map(t => t.document);
        }
        else if (id == undefined || id == '' || id == 'previous') {
            entities = (defaultType == 'tiles' ? [tile] : value[(defaultType || 'tokens')]);
            entities = (entities instanceof Array ? entities : [entities]);
        }
        else if (id.startsWith('tagger')) {
            if (game.modules.get('tagger')?.active) {
                let tag = id.substring(7);
                entities = window.Tagger.getByTag(tag);
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
            name = (defaultType == 'tokens' || defaultType == undefined ? i18n("MonksActiveTiles.PreviousData") : '' );
        else if (entity?.id.startsWith('tagger'))
            name = `[Tagger] ${entity.id.substring(7)}`;
        else if (entity?.id) {
            let document = (entity.id.includes('Terrain') ? MonksActiveTiles.getTerrain(entity.id) : await fromUuid(entity.id));
            if (document) {
                if (document.name)
                    name = document.name
                else {
                    if (game.modules.get('tagger')?.active) {
                        let tags = window.Tagger.getTags(document);
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

    static async getLocation(location, value) {

        if (location.id == 'previous')
            location = value["location"];

        if (location.id) {
            let dest;
            if (location.id.startsWith('tagger')) {
                if (game.modules.get('tagger')?.active) {
                    let tag = location.id.substring(8);
                    entities = window.Tagger.getByTag(tag);
                    if (entities.length) {
                        dest = entities[Math.floor(Math.random() * entities.length)];
                    }
                }
            } else {
                //this is directing to an entity
                dest = await fromUuid(location.id);
            }
            if (dest) {
                return {
                    x: dest.data.x + (dest.data.width / 2),
                    y: dest.data.y + (dest.data.height / 2),
                    width: dest.data.width,
                    height: dest.data.height,
                    scene: dest.parent.id
                };
            }
        }
        return {
            x: location.x,
            y: location.y,
            scale: location.scale,
            scene: location.sceneId || canvas.scene.id
        };
    }

    static async locationName(location) {
        let name = "";

        if (!location)
            return '';
        let sceneId = location.sceneId || canvas.scene.id;
        if (location.id) {
            if (location?.id == 'previous')
                name = "Current Location";
            else if (location?.id.startsWith('tagger'))
                name = `[Tagger] ${location.id.substring(7)}`;
            else {
                //this is directing to an entity
                let document = await fromUuid(location.id);
                if (document) {
                    sceneId = document.parent.id;

                    if (document.name)
                        name = document.name
                    else {
                        if (game.modules.get('tagger')?.active) {
                            let tags = window.Tagger.getTags(document);
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
        return `${(scene.id != canvas.scene.id ? 'Scene: ' + scene.name + ', ' : '')}${name}`;
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
                return await MonksActiveTiles._execute.call(macro, context);
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
                return (checkpt.x < dest.x || checkpt.y < dest.y || checkpt.x > dest.x + dest.width || checkpt.y > dest.y + dest.height);
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

    static async init() {
        log('Initializing Monks Active Tiles');
        registerSettings();

        game.MonksActiveTiles = this;

        let otherGroups = {};
        await Hooks.call("setupTileGroups", otherGroups);
        MonksActiveTiles.triggerGroups = Object.assign(MonksActiveTiles.triggerGroups, otherGroups);

        let otherTriggers = {};
        await Hooks.call("setupTileActions", otherTriggers);
        MonksActiveTiles.triggerActions = Object.assign(otherTriggers, MonksActiveTiles.triggerActions);

        if (game.modules.get("lib-wrapper")?.active)
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-enhanced-journal", "JournalDirectory.prototype._onClickDocumentName");

        MonksActiveTiles.SOCKET = "module.monks-active-tiles";

        //MonksActiveTiles._oldObjectClass = CONFIG.Tile.objectClass;
        //CONFIG.Tile.objectClass = WithActiveTile(CONFIG.Tile.objectClass);

        MonksActiveTiles.setupTile();

        Handlebars.registerHelper({ selectGroups: MonksActiveTiles.selectGroups });

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

        let oldCycleTokens = TokenLayer.prototype.cycleTokens;
        TokenLayer.prototype.cycleTokens = function (...args) {
            //if (MonksActiveTiles.preventCycle) {
            if(setting('prevent-cycle'))
                return null;
            else
                return oldCycleTokens.call(this, ...args);
        }

        let contains = (position, tile) => {
            return position.x >= tile.data.x
                && position.y >= tile.data.y
                && position.x <= (tile.data.x + tile.data.width)
                && position.y <= (tile.data.y + tile.data.height);
        };

        let lastPosition = undefined;
        let hoveredTiles = new Set();

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

                if (!triggerData || !triggerData.active || !triggerData.trigger?.includes("hover")) continue;

                //check to see if this trigger is restricted by control type
                if ((triggerData.controlled === 'gm' && !game.user.isGM) || (triggerData.controlled === 'player' && game.user.isGM))
                    continue;

                let tokens = canvas.tokens.controlled.map(t => t.document);
                //check to see if this trigger is per token, and already triggered
                if (triggerData.pertoken) {
                    tokens = tokens.filter(t => !tile.hasTriggered(t.id)); //.uuid
                    if (tokens.length === 0)
                        continue;
                }

                let lastPositionContainsTile = contains(lastPosition, tile);
                let currentPositionContainsTile = contains(currentPosition, tile);

                if (!lastPositionContainsTile && currentPositionContainsTile && !hoveredTiles.has(tile)) {
                    hoveredTiles.add(tile)
                    if (triggerData.trigger === "hoverin") {
                        tile.trigger({ token: tokens, method: 'HoverIn', pt: currentPosition });
                    }
                }

                if (lastPositionContainsTile && !currentPositionContainsTile && hoveredTiles.has(tile)) {
                    hoveredTiles.delete(tile)
                    if (triggerData.trigger === "hoverout") {
                        tile.trigger({ token: tokens, method: 'HoverOut', pt: currentPosition });
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

        let _onLeftClick2 = function (wrapped, ...args) {
            let event = args[0];
            canvasClick.call(this, event, 'dblclick');
            wrapped(...args);
        }

        let canvasClick = function (event, clicktype) {
            let waitingType = MonksActiveTiles.waitingInput?.waitingfield?.data('type');
            if (waitingType == 'location' || waitingType == 'either' || waitingType == 'position') {
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
                MonksActiveTiles.waitingInput.updateSelection({ id: document.uuid, name: document.name });
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

                    tile.trigger({ token: tokens, userid: data.senderId, method: data.method, pt: data.pt });
                }
            } break;
            case 'switchview': {
                if (data.userid.find(u => u == game.user.id).length > 0) {
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
                        tokens: tokens,
                        method: data.method,
                        pt: data.pt,
                    };

                    let results = (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active ?
                        await (macro.data.type == 'script' ? macro.callScriptFunction(context) : macro.execute(data.args) ) :
                        await MonksActiveTiles._execute.call(macro, context));
                    MonksActiveTiles.emit("returnmacro", { _id: data._id, tileid: data?.tileid, results: results });
                }
            }
            case 'returnmacro': {
                if (game.user.isGM) {
                    let tile = await fromUuid(data.tileid);
                    if (tile)
                        tile.resumeActions(data._id, data.results);
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
                    let dest = { x: data.x, y: data.y, scale: data.scale };
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
                    if (!entity)
                        return;

                    if (data.permission === true && !entity.testUserPermission(game.user, "LIMITED"))
                        return ui.notifications.warn(`You do not have permission to view ${entity.name}.`);

                    if (!game.modules["monks-enhanced-journal"]?.active || data?.enhanced !== true || !game.MonksEnhancedJournal.openJournalEntry(entity))
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
            }
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
                MonksActiveTiles.waitingInput.updateSelection({ id: entity.document.uuid, name: entity.document.name || (entity.document.documentName + ": " + entity.document.id) });
            else
                MonksActiveTiles.waitingInput.updateSelection({ id: entity.uuid, name: entity.parent.name  + ": " + entity.name });
        }
    }

    static selectPlaylistSound(evt) {
        const playlistId = $(evt.currentTarget).data('playlistId');
        const soundId = $(evt.currentTarget).data('soundId');

        const sound = game.playlists.get(playlistId)?.sounds?.get(soundId);
        if (sound)
            MonksActiveTiles.controlEntity(sound);
    }

    static setupTile() {
        TileDocument.prototype._normalize = function () {
            this.data.flags = mergeObject({ 'monks-active-tiles': { chance: 100, restriction: 'all', controlled: 'all', actions: []}}, this.data.flags);
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

                const cX = this.data.x + (this.data.width / 2);
                const cY = this.data.y + (this.data.height / 2);

                pt = rotate(cX, cY, pt.x, pt.y, this.data.rotation);
            }

            return !(pt.x <= this.data.x ||
                pt.x >= this.data.x + this.data.width ||
                pt.y <= this.data.y ||
                pt.y >= this.data.y + this.data.height);
        }

        TileDocument.prototype.checkClick = function (pt, clicktype = 'click') {
            let triggerData = this.data.flags["monks-active-tiles"];
            if (triggerData && triggerData.active && triggerData.trigger == clicktype) {
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
                if (pt == undefined || this.pointWithin(pt)) {
                    return this.trigger({ token: tokens, method: (clicktype == 'dblclick' ? 'DoubleClick' : 'Click'), pt: pt });
                }
            }
        }

        TileDocument.prototype.checkCollision = function (token, destination) {
            // 1. Get all the tile's vertices. X and Y are position at top-left corner
            // of tile.
            let when = this.getFlag('monks-active-tiles', 'trigger');   //+++ need to do something different if movement is called for
            let buffer = (canvas.grid.size / 4) * (when == 'enter' ? 1 : (when == 'exit' ? -1 : 0));
            let tileX1 = this.data.x + buffer;
            let tileY1 = this.data.y + buffer;
            let tileX2 = this.data.x + this.data.width - buffer;
            let tileY2 = this.data.y + this.data.height - buffer;
            if (this.data.rotation != 0) {
                function rotate(cx, cy, x, y, angle) {
                    var rad = Math.toRadians(angle),
                        cos = Math.cos(rad),
                        sin = Math.sin(rad),
                        run = x - cx,
                        rise = y - cy,
                        tx = (cos * run) + (sin * rise) + cx,
                        ty = (cos * rise) - (sin * run) + cy;
                    return [tx, ty];
                }

                const cX = this.data.x + (this.data.width / 2);
                const cY = this.data.y + (this.data.height / 2);

                [tileX1, tileY1] = rotate(cX, cY, tileX1, tileY1, this.data.rotation);
                [tileX2, tileY2] = rotate(cX, cY, tileX2, tileY2, this.data.rotation);
            }

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

            /*
            let gr = MonksActiveTiles.debugGr;
            if (!gr) {
                gr = new PIXI.Graphics();
                MonksActiveTiles.debugGr = gr;
                canvas.tokens.addChild(gr);
            }
            for (let pt of intersect) {
                gr.beginFill(0x00ff00).drawCircle(pt.x, pt.y, 4).endFill();
            }*/

            if (when == 'movement' && intersect.length == 0) {
                //check to see if there's moving within the Tile
                if (this.pointWithin({ x: tokenRay.A.x, y: tokenRay.A.y }) &&
                    this.pointWithin({ x: tokenRay.B.x, y: tokenRay.B.y })) {
                    intersect = [{ x1: tokenRay.A.x, y1: tokenRay.A.y, x2: tokenRay.B.x, y2: tokenRay.B.y}];
                }
            }

            return intersect;
        }

        TileDocument.prototype.canTrigger = function (token, collision, destination) {
            let triggerData = this.data.flags["monks-active-tiles"];
            if (triggerData) {
                let when = this.getFlag('monks-active-tiles', 'trigger');

                if (!["enter", "exit", "both", "movement", "stop"].includes(when))
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
                let tokenPos = { x: (when == 'stop' ? destination.x : token.x) + (token.w / 2), y: (when == 'stop' ? destination.y : token.y) + (token.h / 2) };
                let inTile = this.pointWithin(tokenPos); //!(tokenPos.x <= this.object.x || tokenPos.x >= this.object.x + this.object.width || tokenPos.y <= this.object.y || tokenPos.y >= this.object.y + this.object.height);

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
                } else if (when == 'stop') {
                    if (inTile)
                        newPos.push({ x: destination.x, y: destination.y, method: 'Stop' });
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

        TileDocument.prototype.trigger = async function ({ token = [], userid = game.user.id, method, pt }) {
            if (MonksActiveTiles.allowRun) {
                let triggerData = this.data.flags["monks-active-tiles"];
                //if (this.data.flags["monks-active-tiles"]?.pertoken)
                if (game.user.isGM) {
                    if (token.length > 0) {
                        for (let tkn of token)
                            await this.addHistory(tkn.id, method, userid);    //changing this to always register tokens that have triggered it.
                    } else if(method != "Trigger")
                        await this.addHistory("", method, userid);
                }

                //only complete a trigger once the minimum is reached
                if (triggerData.minrequired && this.countTriggered() < triggerData.minrequired)
                    return;

                //A token has triggered this tile, what actions do we need to do
                let values = [];
                let value = { tokens: token };
                let context = { tile: this, tokens: token, userid: userid, values: values, value: value, method: method, pt: pt };

                return await this.runActions(context);
            } else {
                //post this to the GM
                let tokens = token.map(t => (t?.document?.uuid || t?.uuid));
                MonksActiveTiles.emit('trigger', { tileid: this.uuid, tokens: tokens, method: method, pt: pt } );
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
                                    context.value = mergeObject(context.value, result);
                                    delete context.value.goto;
                                    context.values.push(mergeObject(result, { action: action }));

                                    if (result.pause) {
                                        MonksActiveTiles.savestate[context._id] = context;
                                        result = { continue: false };
                                        pausing = true;
                                    }

                                    if (result.goto) {
                                        if (result.goto instanceof Array) {
                                            result.continue = false;
                                            for (let goto of result.goto) {
                                                let idx = actions.findIndex(a => a.action == 'anchor' && a.data.tag == goto.tag);
                                                if (idx != -1) {
                                                    let gotoContext = Object.assign({}, context);
                                                    gotoContext = mergeObject(gotoContext, { value: goto });
                                                    gotoContext._id = makeid();
                                                    await this.runActions(gotoContext, idx + 1);
                                                }
                                            }
                                        } else {
                                            //find the index of the tag
                                            let idx = actions.findIndex(a => a.action == 'anchor' && a.data.tag == result.goto);
                                            if (idx != -1)
                                                i = idx;
                                        }
                                    }

                                    result = result.continue;
                                }
                                let cancontinue = await Hooks.call("triggerTile", this, this, context.tokens, context.action, context.userid, context.value);
                                if (result === false || cancontinue === false || this.getFlag('monks-active-tiles', 'active') === false)
                                    break;
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
                        stats.list.push(mergeObject(data, { tokenid: k, name: token?.name || (k == "" ? "" : 'Unknown'), username: user?.name || 'Unknown', whenfrmt: time }));
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
        this.object.document.trigger({ token: tokens, method: 'Manual'});
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
}

Hooks.on('init', async () => {
    MonksActiveTiles.init();
})

Hooks.on('ready', () => {
    game.socket.on(MonksActiveTiles.SOCKET, MonksActiveTiles.onMessage);

    MonksActiveTiles._oldSheetClass = CONFIG.Tile.sheetClasses.base['core.TileConfig'].cls;
    CONFIG.Tile.sheetClasses.base['core.TileConfig'].cls = WithActiveTileConfig(CONFIG.Tile.sheetClasses.base['core.TileConfig'].cls);

    if (game.modules.get("item-piles")?.active && setting('drop-item')) {
        game.settings.set('monks-active-tiles', 'drop-item', false);
        ui.notifications.warn(i18n("MonksActiveTiles.msg.itempiles"));
        warn(i18n("MonksActiveTiles.msg.itempiles"));
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
                                let pt = { x: triggerPt.x + (document.object.w / 2), y: triggerPt.y + (document.object.h / 2) };

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
                                    tile.document.trigger({ token: [document], method: triggerPt.method, pt: pt });
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

Hooks.on('controlTerrain', (terrain, control) => {
    if (control)
        MonksActiveTiles.controlEntity(terrain);
});

Hooks.on("setupTileGroups", (groups) => {
    groups['fql'] = { name: "Forien's Quest Log" };
    groups['kandashis-fluid-canvas'] = { name: "Kandashi's Fluid Canvas" };
});

Hooks.on("setupTileActions", (actions = {}) => {
    if (game.modules.get('forien-quest-log')?.active) {
        Object.assign(actions, {
            'openfql': {
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
                group: 'fql',
                fn: async (args = {}) => {
                    const { action, userid } = args;

                    if (action.data.for != 'gm')
                        MonksActiveTiles.emit('fql', { for: action.data.for, userid: userid });
                    if (MonksActiveTiles.allowRun && (action.data.for == 'everyone' || action.data.for == 'gm' || action.data.for == undefined || (action.data.for == 'trigger' && userid == game.user.id)))
                        Hooks.call('ForienQuestLog.Open.QuestLog');

                },
                content: async (trigger, action) => {
                    return trigger.name + ' for ' + i18n(trigger.values.for[action.data?.for]);
                }
            }
        });
    }

    if (game.modules.get('kandashis-fluid-canvas')?.active) {
        Object.assign(actions, {
            'execute': {
                name: 'Execute Effect',
                ctrls: [
                    {
                        id: "effect",
                        name: "Effect",
                        list: "effect",
                        type: "list",
                        onChange: (app) => {
                            app.checkConditional();
                            app.setPosition({ height: 'auto' });
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
                            return ["earthquake", "heartBeat", "drug", "spin", "blur"].includes($('select[name="data.effect"]', app.element).val());
                        }
                    },
                    {
                        id: "duration",
                        name: "Duration (ms)",
                        type: "number",
                        defvalue: 1000,
                        required: true,
                        conditional: (app) => {
                            return ["earthquake", "heartBeat", "spin", "drug"].includes($('select[name="data.effect"]', app.element).val());
                        }
                    },
                    {
                        id: "iteration",
                        name: "Iteration",
                        type: "number",
                        defvalue: 3,
                        required: true,
                        conditional: (app) => {
                            return ["earthquake", "heartBeat", "spin", "drug"].includes($('select[name="data.effect"]', app.element).val());
                        }
                    },
                ],
                values: {
                    'effect': {
                        "earthquake": 'KFC.earthquake',
                        "heartBeat": 'KFC.heartBeat',
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

                    if (["earthquake", "heartBeat", "spin"].includes(action.data.effect))
                        KFC.executeForEveryone(action.data.effect, action.data.intensity, action.data.duration, action.data.iteration);
                    else {
                        let users = (action.data.for == 'trigger' ? [userid] :
                            (action.data.for == 'gm' ? [game.user.id] :
                                game.users.filter(u => (action.data.for == 'everyone' || !u.isGM)).map(u => u.id)));
                        KFC.executeAsGM(action.data.effect, users, action.data.intensity, action.data.duration, action.data.iteration);
                    }

                },
                content: async (trigger, action) => {
                    return trigger.name + ' <span class="details-style">"' + i18n(trigger.values.effect[action.data?.effect]) + '"</span>';
                }
            }
        });
    }

    return actions;
});

Hooks.on("renderPlaylistDirectory", (app, html, user) => {
    $('li.sound', html).click(MonksActiveTiles.selectPlaylistSound.bind(this));
});

Hooks.once('libChangelogsReady', function () {
    libChangelogs.register("monks-active-tiles", "The option to delay an action has been moved from being a property of the action itself to its own action under the Logic group.  It will still appear for old actions that used delay but won't appear for new ones.", "major")
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