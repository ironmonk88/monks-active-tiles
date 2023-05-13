import { registerSettings } from "./settings.js";
import { WithActiveTileConfig } from "./apps/active-tile-config.js"
import { ActionConfig } from "./apps/action-config.js";
import { TileTemplates } from "./apps/tile-templates.js";
import { BatchManager } from "./classes/BatchManager.js";
import { ActionManager } from "./actions.js";

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

export let patchFunc = (prop, func, type = "WRAPPER") => {
    if (game.modules.get("lib-wrapper")?.active) {
        libWrapper.register("monks-active-tiles", prop, func, type);
    } else {
        const oldFunc = eval(prop);
        eval(`${prop} = function (event) {
            return func.call(this, ${type != "OVERRIDE" ? "oldFunc.bind(this)," : ""} ...arguments);
        }`);
    }
}

export let rollDice = async (val, options = {}) => {
    if (val && typeof val === "string" && val.indexOf("d") != -1) {
        let roll = options.roll || new Roll(val);
        await roll.evaluate({ async: true });
        return { value: roll.total, roll: roll };
    } else
        return { value: val };
}

export let getVolume = () => {
    if (game.modules.get("monks-sound-enhancement")?.active)
        return game.settings.get("core", "globalSoundEffectVolume");
    else
        return game.settings.get("core", "globalAmbientVolume");
}

export let getValue = async (val = "", args, entity, options = {operation:'assign'}) => {
    const { tile, tokens, action, userid, value, method, change } = args;

    if (val == 'true') {
        val = (prop == undefined ? true : prop === true);
    } else if (val == 'false') {
        val = (prop == undefined ? false : prop === false);
    } else {
        let context = Object.assign({
            actor: tokens[0]?.actor,
            token: tokens[0],
            tile: tile.toObject(),
            entity: entity,
            variable: getProperty(tile, "flags.monks-active-tiles.variables") || {},
            user: game.users.get(userid),
            value: value,
            scene: canvas.scene,
            canvas: canvas,
            method: method,
            change: change
        }, options);

        if (typeof val == "string" && val.includes("{{")) {
            const compiled = Handlebars.compile(val);
            val = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
        }

        if (options.inline !== false && typeof val == "string") {
            const rgx = /\[\[(\/[a-zA-Z]+\s)?(.*?)(]{2,3})(?:{([^}]+)})?/gi;
            val = await MonksActiveTiles.inlineRoll(val, rgx, action.data.chatMessage, action.data.rollmode, entity);
        }

        if (options.rollmode && val.indexOf("d") != -1) {
            let roll = await rollDice(val);
            val = roll.value;

            if (action.data.chatMessage) {
                context.result = val;
                const compiled = Handlebars.compile(options.flavor || "");
                let flavor = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                roll.roll.toMessage({ flavor }, { rollMode: options.rollmode });
            }
        }

        if (options.prop != undefined && typeof val == "string") {
            try {
                if (val.startsWith('+ ') || val.startsWith('- ')) {
                    if (options.prop instanceof Array) {
                        let add = val.startsWith('+ ');
                        let parts = val.replace('+ ', '').replace('- ', '').split(',').map(p => p.trim());
                        if (add)
                            val = options.prop.concat(parts).filter((value, index, self) => { return self.indexOf(value) === index; });
                        else
                            val = options.prop.filter(value => { return !parts.includes(value) });
                    } else {
                        val = eval(options.prop + val);
                    }
                }
                else if (options.operation == 'assign' || options.operation == undefined) {
                    val = (val.startsWith("=") ? val.substring(1) : val);
                    if (options.prop instanceof Array) {
                        val = val.split(',').map(p => p.trim()).filter(p => !!p);
                    } else {
                        val = eval(val);
                    }
                } else if (options.operation == 'compare') {
                    if (options.prop instanceof Array || options.prop instanceof Set) {
                        val = (val.startsWith("==") ? val.substring(2) : (val.startsWith("=") ? val.substring(1) : val));
                        val = eval(`[${Array.from(options.prop).map(v => typeof v == 'string' ? '"' + v + '"' : v).join(',')}].includes(${val})`);
                    } else {
                        val = (val.startsWith("=") && !val.startsWith("==") ? "=" + val : (val.startsWith("==") || val.startsWith(">") || val.startsWith("<") ? val : "== " + val));
                        val = eval((typeof options.prop == 'string' ? `"${options.prop}"` : options.prop) + ' ' + val);
                    }
                }
            } catch (err) {
                val = (options.prop instanceof Array ? [] : 0);
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

    return val;
}

export class MonksActiveTiles {
    static _oldSheetClass;
    //static _oldObjectClass;
    //static _rejectRemaining = {};
    static savestate = {};
    static debugEnabled = 1;

    static _slotmachine = {};

    static batch = new BatchManager();

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
            //'both': i18n("MonksActiveTiles.mode.both"),
            'movement': i18n("MonksActiveTiles.mode.movement"),
            'stop': i18n("MonksActiveTiles.mode.stop"),
            'elevation': i18n("MonksActiveTiles.mode.elevation"),
            'rotation': i18n("MonksActiveTiles.mode.rotation"),
            'click': i18n("MonksActiveTiles.mode.click"),
            'rightclick': i18n("MonksActiveTiles.mode.rightclick"),
            'dblclick': i18n("MonksActiveTiles.mode.dblclick"),
            'create': i18n("MonksActiveTiles.mode.create"),
            //'hover': i18n("MonksActiveTiles.mode.hover"),
            'hoverin': i18n("MonksActiveTiles.mode.hoverin"),
            'hoverout': i18n("MonksActiveTiles.mode.hoverout"),
            'combatstart': i18n("MonksActiveTiles.mode.combatstart"),
            'round': i18n("MonksActiveTiles.mode.round"),
            'turn': i18n("MonksActiveTiles.mode.turn"),
            'turnend': i18n("MonksActiveTiles.mode.turnend"),
            'combatend': i18n("MonksActiveTiles.mode.combatend"),
            'ready': i18n("MonksActiveTiles.mode.canvasready"),
            'manual': i18n("MonksActiveTiles.mode.manual"),
            'door': i18n("MonksActiveTiles.mode.door")
        }
    };

    static triggerGroups = {
        'actions': { name: 'MonksActiveTiles.group.actions', 'default': true },
        'filters': { name: 'MonksActiveTiles.group.filters' },
        'logic': { name: 'MonksActiveTiles.group.logic' }
    }

    static triggerActions = ActionManager.actions;

    static getActionFlag(val, flag) {
        if (!val)
            return "";
        switch (flag) {
            case "snap":
                return ` <i class="fas fa-compress" title="${i18n("MonksActiveTiles.SnapToGrid")}"></i>`;
        }
        return "";
    }

    static getTrigger(val) {
        if (!val) return [];

        let triggers = val instanceof Array ? val : [val];

        if (triggers.includes("both")) {
            triggers.push("enter", "exit");
            triggers.findSplice(t => t == "both");
        }
        if (triggers.includes("hover")) {
            triggers.push("hoverin", "hoverout");
            triggers.findSplice(t => t == "hover");
        }

        return triggers;
    }

    static async getEntities(args, defaultType, entry) {
        const { tile, tokens, action, value, userid } = args;
        let id = entry?.id || action.data?.entity?.id;

        if (id != undefined && !id.startsWith("tagger"))
            id = id.split("#")[0];

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
        else if (id && id.startsWith('players')) {
            if (action.action == "create") {
                entities = game.users.map(u => !u.isGM && (u.active || !id.endsWith('active')) && u.character).filter(t => !!t);
            } else {
                entities = tile.parent.tokens.filter(t => {
                    return t.actor != undefined && t.actor?.hasPlayerOwner && !['npc', 'familiar', 'hazard', 'loot'].includes(t.actor?.type);
                });
            }
        }
        else if (id == 'within') {
            if (action.action == "activate") {
                entities = [...tile.entitiesWithin("lights"), ...tile.entitiesWithin("sounds")];
            } else
                //find all tokens with this Tile
                entities = tile.entitiesWithin();
        }
        else if (id == 'controlled') {
            if (defaultType == "playlists") {
                game.playlists.forEach(async (p) => {
                    p.sounds.forEach(async (s) => {
                        if (s.playing || s.pausedTime != null)
                            entities.push(s);
                    });
                });
            } else
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
                else if (entity.scene !== "_active" && entity.scene && game.scenes.get(entity.scene) != undefined)
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
            name = defaultType == "playlists" ? i18n("MonksActiveTiles.CurrentlyPlaying") : i18n("MonksActiveTiles.Controlled");
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
                    } else if (document.compendium) {
                        name = `<i class="fas fa-atlas"></i> ${document.compendium.metadata.label}: ${name}`;
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

    static async getLocation(_location, value, args = {}) {
        let location = duplicate(_location);

        if (location.id == 'previous')
            location = value["location"];
        else if (location.id == 'origin')
            location = value["original"];
        else if (location.id == 'players') {
            let user = game.users.get(args.userid);
            if (user && user.character?.id) {
                let scene = game.scenes.get(user.viewedScene);
                if (scene) {
                    let token = scene.tokens.find(t => t.actor.id == user.character.id);
                    if (token) {
                        return [{
                            x: token.x + ((Math.abs(token.width) * scene.dimensions.size) / 2),
                            y: token.y + ((Math.abs(token.height) * scene.dimensions.size) / 2),
                            scene: scene.id
                        }];
                    }
                }
            }
        } else if (location.id == 'tile') {
            location = [this];
        } else if (location.id == 'token')
            location = args.pt || (value.tokens.length ? { x: value.tokens[0].x, y: value.tokens[0].y } : null);
        else if(location.id?.startsWith('tagger')) {
            if (game.modules.get('tagger')?.active) {
                let tag = location.id.substring(7);
                let options = {};
                if (!location.match || location.match == "any")
                    options.matchAny = true;
                if (location.match == "exact")
                    options.matchExactly = true;

                if (location.scene == "_all")
                    options.allScenes = true;
                else if (location.scene !== "_active" && location.scene)
                    options.sceneId = location.scene;

                location = Tagger.getByTag(tag, options);

                if (options.allScenes)
                    location = [].concat(...Object.values(location));
            }
        }

        location = (location instanceof Array ? location : [location]);

        for (let i = 0; i < location.length; i++) {
            let l = location[i];
            if (l == undefined)
                continue;

            if (l.id) {
                let dest = l;
                //this is directing to an entity
                if (!(dest instanceof Document)) {
                    try {
                        dest = await fromUuid(l.uuid || l.id);
                    } catch { }
                }

                if (dest) {
                    location[i] = {
                        x: dest.x + (Math.abs(dest.width) / 2),
                        y: dest.y + (Math.abs(dest.height) / 2),
                        width: Math.abs(dest.width),
                        height: Math.abs(dest.height),
                        scene: dest.parent.id,
                        dest: dest
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
            else if (location?.id == 'tile')
                name = "This Tile";
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
            name = isEmpty(location) ? "" : `[${location.x},${location.y}${(location.scale ? `, scale:${location.scale}` : '')}]`;
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
        const { tile, tokens, action, userid, values, value, method, pt, change, event } = mainargs;

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
            change: change,
            event: event
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
            (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active ? getProperty(macro, "flags.advanced-macros.runAsGM") || getProperty(macro, "flags.furnace.runAsGM") : true));

        if (runasgm || userid == game.user.id) {
            //if (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active)
            //    return await (macro.type == 'script' ? macro.callScriptFunction(context) : macro.execute(args));
            //else
                return await (macro.type == 'script' ? MonksActiveTiles._execute.call(macro, context) : macro.execute(args));
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
                _id: mainargs._id,
                change: change,
                event: event
            });

            return { pause: true };
        }

        /*
        if (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active) {
            if (getProperty(macro, "flags.advanced-macros.runAsGM") || getProperty(macro, "flags.furnace.runAsGM") || userid == game.user.id) {
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
            return (async function ({speaker, actor, token, character, tile, method, pt, args, scene, event}={}) {
                ${this.command}
                });`)().call(this, context);
            } catch (err) {
                ui.notifications.error(`There was an error in your macro syntax. See the console (F12) for details`);
                console.error(err);
            }
        }
    }

    static async _showDialog(tile, token, value, type, title, content, options, yes, no, closeNo, buttons) {
        let context = {
            actor: token?.actor?.toObject(false),
            token: token?.toObject(false),
            tile: tile.toObject(false),
            variable: getProperty(tile, "flags.monks-active-tiles.variables") || {},
            user: game.user,
            value: value,
            scene: canvas.scene
        };
        let compiled = Handlebars.compile(title);
        title = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
        compiled = Handlebars.compile(content);
        content = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();

        let opts = {};
        try {
            opts = JSON.parse(options);
        } catch { }

        if (type == 'confirm') {
            return Dialog.confirm({
                title: title,
                content: content,
                yes: (html) => {
                    let data = {};

                    const form = html[0].querySelector("form");
                    if (form) {
                        const fd = new FormDataExtended(form);
                        data = foundry.utils.mergeObject(data, fd.object);
                        context.value = foundry.utils.mergeObject(context.value, fd.object);
                    }

                    if (yes) {
                        if (yes.includes("{{")) {
                            const compiled = Handlebars.compile(yes);
                            data.goto = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                        } else
                            data.goto = yes;
                    }

                    if (!data.goto)
                        data.continue = false;

                    return data;
                },
                no: (html) => {
                    let data = {}

                    const form = html[0].querySelector("form");
                    if (form) {
                        const fd = new FormDataExtended(form);
                        data = foundry.utils.mergeObject(data, fd.object);
                        context.value = foundry.utils.mergeObject(context.value, fd.object);
                    }

                    if (no) {
                        if (no.includes("{{")) {
                            const compiled = Handlebars.compile(no);
                            data.goto = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                        } else
                            data.goto = no;
                    }

                    if (!data.goto)
                        data.continue = false;

                    return data;
                },
                options: opts,
                rejectClose: true,
            }).catch(() => {
                return closeNo ? { goto: no } : {};
            });
        } else if (type == 'alert') {
            return Dialog.prompt({
                title: title,
                content: content,
                callback: (html) => {
                    let data = {};
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
        } else {
            let _html;
            let _submit = false;
            return Dialog.wait({
                title, content,
                close: () => {
                    let data = {};

                    if (_submit) {
                        const form = _html[0].querySelector("form");
                        if (form) {
                            const fd = new FormDataExtended(form);
                            data = foundry.utils.mergeObject(data, fd.object);
                        }
                    }
                    return data;
                },
                render: (html) => {
                    _html = html;
                    $(html).on("submit", (evt) => {
                        _submit = true;
                        $('.window-header a.close', $(evt.currentTarget).closest('.app.dialog')).click();
                    })
                },
                buttons: buttons.reduce((a, v) => ({
                    ...a, [v.id]: {
                        label: v.name, callback: (html) => {
                            let data = {};

                            const form = html[0].querySelector("form");
                            if (form) {
                                const fd = new FormDataExtended(form);
                                data = foundry.utils.mergeObject(data, fd.object);
                                context.value = foundry.utils.mergeObject(context.value, fd.object);
                            }

                            if (v.goto) {
                                if (v.goto.includes("{{")) {
                                    const compiled = Handlebars.compile(v.goto);
                                    data.goto = compiled(context, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true }).trim();
                                } else
                                    data.goto = v.goto;
                            }

                            if (!data.goto)
                                data.continue = false;

                            return data;
                        }
                    }
                }), {})
            }, opts);
        }
    }

    static async rollSlot(entity, files, oldIdx, newIdx, spins, time) {
        let t = entity._object;

        const container = new PIXI.Container();
        t.addChild(container);
        container.width = entity.width;
        container.height = entity.height;

        //Set the image clip region
        const mask = new PIXI.Graphics();
        mask.beginFill(0xFFFFFF);
        mask.drawRect(0, 0, entity.width, entity.height);
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
            s.y = entity.height;
            s.width = entity.width;
            s.height = entity.height;
            container.addChild(s);
        }

        //hide the actual image
        t.children[0].visible = false;

        //set the current index and set the current file to be showing.
        let frames = [];
        frames.push({ sprite: sprites[oldIdx], idx: oldIdx });
        sprites[oldIdx].y = 0;
        MonksActiveTiles.emit("slotmachine", { cmd: "animate", entityid: entity.uuid, oldIdx, newIdx, spins, time });

        let duration = time - new Date().getTime();
        if (duration < 0)
            return;

        //run the animation
        return CanvasAnimation._animatePromise(
            MonksActiveTiles.slotAnimate,
            t,
            `slot-machine${entity.id}`,
            { tile: t, frames: frames, sprites: sprites, idx: oldIdx, total: (sprites.length * spins) + (newIdx - oldIdx < 0 ? sprites.length + newIdx - oldIdx : newIdx - oldIdx) + 1 },
            duration
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
                    if (Math.abs(newY) >= attributes.tile.document.height) {
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
                            let spriteY = attributes.tile.document.height + newY;
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

    static async animateEntity(entity, from, animation) {
        let object = entity.mesh || entity.shape || entity;
        let to = {
            x: entity.document.x + ((entity.document.width || entity.document.shape?.width || 0) / 2),
            y: entity.document.y + ((entity.document.height || entity.document.shape?.height || 0) / 2),
            rotation: entity.document.rotation,
            alpha: (entity.document.hidden ? (game.user.isGM ? 0.5 : 0) : entity.document.alpha ?? 1),
            hidden: entity.document.hidden
        };
        //await CanvasAnimation.terminateAnimation(`${entity.document.documentName}.${entity.id}.animateEntity`);

        let duration = (animation.time - new Date().getTime()) ?? animation.duration;
        if (isNaN(duration) || duration < 0) {
            log("Fade time has already passed");
            return new Promise((resolve) => { resolve(); });
        }

        if (from)
            entity._animationAttributes = mergeObject(entity._animationAttributes || {}, from);

        let animations = {};
        // Define attributes
        let attributes = [];
        //let positionChange = false;

        if (from.x != undefined && to.x != undefined && from.x != to.x) {
            attributes.push({ parent: object, attribute: 'x', from: from.x, to: to.x });
            //positionChange = true;
        }
        if (from.y != undefined && to.y != undefined && from.y != to.y) {
            attributes.push({ parent: object, attribute: 'y', from: from.y, to: to.y });
            //positionChange = true;
        }
        if (attributes.length)
            animations["movement"] = attributes;
        //if (positionChange)
         //   object.position.set(from.x ?? to.x, from.y ?? to.y);
        let dr = to.rotation - from.rotation;
        if (!isNaN(dr) && dr !== 0) {
            let r = to.rotation;
            if (dr > 180) r -= 360;
            if (dr < -180) r += 360;
            dr = r - from.rotation;
            animations["rotation"] = [{ attribute: "rotation", from: (from.rotation * (Math.PI / 180)), to: (r * (Math.PI / 180)), parent: object }]; // Do not use Math.toRadians because that will normalise the number
        }
        let hasAlpha = false;
        if (from.alpha != undefined && to.alpha != undefined && from.alpha != to.alpha) {
            animations["alpha"] = [{ parent: object, attribute: 'alpha', from: from.alpha, to: to.alpha }];
            hasAlpha = true;
        }

        if (isEmpty(animations))
            return;

        // Dispatch the animation function
        for (let [key, attributes] of Object.entries(animations)) {
            let animationName = `${entity.document.documentName}.${entity.id}.animate${key}`;
            CanvasAnimation.animate(attributes, {
                name: animationName,
                context: object,
                duration: duration,
                ontick: (dt, animation) => {
                    for (let attribute of animation.attributes) {
                        let realval = attribute.from + attribute.done;
                        if (!isNaN(attribute.done) && attribute.parent[attribute.attribute] != realval)
                            attribute.parent[attribute.attribute] = realval;
                        setProperty(entity, `_animationAttributes.${attribute.attribute}`, realval)
                        if (attribute.attribute == "alpha" && to.hidden === true && !game.user.isGM && !attribute.parent.visible)
                            attribute.parent.object.visible = true;
                        if (attribute.parent instanceof AmbientLight) {
                            attribute.parent.document[attribute.attribute] = realval;
                            attribute.parent.updateSource();
                        }
                    }

                    //log("Animate Entity", animation.attributes[0].parent.rotation, attributes[0].done, attributes[0].from + attributes[0].done, animation.attributes[0].from, animation.attributes[0].to);
                }
            }).then(() => {
                for (let i = 0; i < attributes.length; i++) {
                    let attribute = attributes[i];
                    delete entity._animationAttributes[attribute.attribute];
                    if (attribute.attribute == "alpha" && to.hidden === true && !game.user.isGM && attribute.parent.visible)
                        attribute.parent.object.visible = false;
                }
            });
        }
    }

    static async fadeImage(entity, hide, time) {
        let icon = entity.object.mesh || entity.shape;
        let animationName = `MonksActiveTiles.${entity.documentName}.${entity.id}.animateShowHide`;

        await CanvasAnimation.terminateAnimation(animationName);

        if (!hide) {
            icon.alpha = (game.user.isGM ? icon.alpha : 0);
            if (entity.object.hud)
                entity.object.hud.alpha = 0;
            icon.visible = true;
            entity.object.visible = true;

            entity.object._showhide = icon.alpha;
        }

        const attributes = [
            { parent: icon, attribute: 'alpha', to: (hide ? (game.user.isGM ? 0.5 : 0) : entity.alpha || 1), object: entity.object, hide: hide, from: icon.alpha || 1 }
        ];

        if (entity instanceof TokenDocument)
            attributes.push({ parent: entity.object.hud, attribute: 'alpha', to: (hide ? 0 : 1) });

        let duration = time - new Date().getTime();
        if (duration < 0) {
            log("Fade time has already passed");
            return new Promise((resolve) => { resolve(); });
        }

        return CanvasAnimation.animate(attributes, {
            name: animationName,
            context: icon,
            duration: duration,
            ontick: (dt, animation) => {
                for (let attribute of animation.attributes) {
                    if (attribute.object && !attribute.hide) {
                        if (!attribute.object.visible)
                            attribute.object.visible = true;
                        let realval = attributes[0].from + attributes[0].done;
                        if (attribute.parent.alpha != realval)
                            attribute.parent.alpha = realval;
                        entity.object._showhide = attribute.parent[attribute.attribute];
                    }
                }

                //log("Token fade", attributes[0].object.alpha, attributes[0].parent.alpha, attributes[0].from + attributes[0].done, attributes[0].remaining, attributes[0].done, attributes[0].delta, attributes[0].object.visible, attributes[0].parent.visible);
            }
        }).then(() => {
            if (hide)
                entity.object.visible = false;
            if (entity.object.hud)
                entity.object.hud.alpha = 1;
            delete entity.object._showhide;
        });
    }

    static async transitionImage(entity, from, to, transition, time) {
        let t = entity._object;

        let duration = time - new Date().getTime();

        //log("transition", t._transition, from, to);
        /*
        if (t._transition) {
            t._transitionQueue = t._transitionQueue || [];
            t._transitionQueue.push({ entity, from, to, transition, duration });
            log("addng to queue", t._transition, t._transitionQueue);
            return;
        }*/

        let animationName = `MonksActiveTiles.${entity.documentName}.${entity.id}.animateTransitionImage`;

        //await CanvasAnimation.terminateAnimation(animationName);

        if (duration < 0) {
            log("Transition time has already passed");
            new Promise((resolve) => { resolve(); });
        }

        const container = new PIXI.Container();
        let idx = canvas.primary.children.indexOf(t) || 0;
        t._transition = canvas.primary.addChildAt(container, idx + 1);
        container.width = entity.width;
        container.height = entity.height;
        container.x = entity.x;
        container.y = entity.y;
        //log("Container", container.x, container.y, t._transition, t._transition.x, t._transition.y);

        //Set the image clip region
        if (transition != "fade" && transition != "blur") {
            const mask = new PIXI.Graphics();
            mask.beginFill(0xFFFFFF);
            mask.drawRect(0, 0, entity.width, entity.height);
            mask.endFill();
            container.addChild(mask);
            container.mask = mask;
        }

        const hw = Math.abs(entity.width) / 2;
        const hh = Math.abs(entity.height) / 2;
        const inner = container.addChild(new PIXI.Container());
        inner.x = hw;
        inner.y = hh;

        //load the sprites
        t._textures = t._textures || {};

        if (!t._textures[from])
            t._textures[from] = await loadTexture(from);
        
        if (!t._textures[to])
            t._textures[to] = await loadTexture(to);

        let sprites = [
            { sprite: new PIXI.Sprite(t._textures[from]), texture: t._textures[from] },
            { sprite: new PIXI.Sprite(t._textures[to]), texture: t._textures[to] }
        ]

        //add them to the tile
        const r = Math.toRadians(entity.rotation);
        for (let sprite of sprites) {
            let s = sprite.sprite;
            s.x = 0;
            s.y = 0;
            inner.addChild(s);

            // Update tile appearance
            s.alpha = entity.alpha;
            s.scale.x = entity.width / sprite.texture.width;
            s.scale.y = entity.height / sprite.texture.height;
            s.rotation = r;
            s.anchor.set(0.5, 0.5);
            s.tint = entity.tint ? foundry.utils.colorStringToHex(entity.tint) : 0xFFFFFF;
        }

        //hide the actual image
        t.mesh.visible = false;
        t.texture = t._textures[to];
        t.mesh.texture = t._textures[to];
        t.mesh.scale.x = t.width / t.texture.width;
        t.mesh.scale.y = t.height / t.texture.height;

        let attributes = [];

        let s_from = sprites[0].sprite;
        let s_to = sprites[1].sprite;

        s_from.alpha = entity.alpha;
        if (transition == "fade") {
            s_to.alpha = 0;

            // Define attributes
            attributes = [
                { parent: s_from, attribute: 'alpha', to: 0 },
                { parent: s_to, attribute: 'alpha', to: entity.alpha }
            ];
        }

        if (transition == "blur") {
            s_from.filters = [new PIXI.filters.BlurFilter()];
            s_from.filters[0].blur == 0;
            s_to.filters = [new PIXI.filters.BlurFilter()];
            s_to.filters[0].blur == 200;
            s_to.alpha = 0;

            attributes = [
                { parent: s_from.filters[0], attribute: 'blur', to: 200 },
                { parent: s_to.filters[0], attribute: 'blur', to: 0 },
                { parent: s_from, attribute: 'alpha', to: 0 },
                { parent: s_to, attribute: 'alpha', to: entity.alpha }
            ];
        }

        if (transition.startsWith("slide")) {
            attributes.push({ parent: s_from, attribute: 'alpha', to: 0 });
        } else if (transition.startsWith("bump")) {
            if (transition.endsWith("left")) {
                attributes.push({ parent: s_from, attribute: 'x', to: -entity.width });
            } else if (transition.endsWith("right")) {
                attributes.push({ parent: s_from, attribute: 'x', to: entity.width });
            } else if (transition.endsWith("up")) {
                attributes.push({ parent: s_from, attribute: 'y', to: -entity.height });
            } else if (transition.endsWith("down")) {
                attributes.push({ parent: s_from, attribute: 'y', to: entity.height });
            }
        }

        if (transition.endsWith("left")) {
            s_to.x = entity.width;
            attributes.push({ parent: s_to, attribute: 'x', to: 0 });
        } else if (transition.endsWith("right")) {
            s_to.x = -entity.width;
            attributes.push({ parent: s_to, attribute: 'x', to: 0 });
        } else if (transition.endsWith("up")) {
            s_to.y = entity.height;
            attributes.push({ parent: s_to, attribute: 'y', to: 0 });
        } else if (transition.endsWith("down")) {
            s_to.y = -entity.height;
            attributes.push({ parent: s_to, attribute: 'y', to: 0 });
        }

        return CanvasAnimation.animate(attributes, {
            name: animationName,
            context: t,
            duration: duration,
            ontick: (dt, animation) => {
                if (t.mesh.visible)
                    t.mesh.visible = false;
                //log("Tick", animation.attributes[0]);
            }
        }).then(() => {
            canvas.primary.removeChild(container);
            delete t._transition;
            t.texture = t._textures[to];
            t.texture.x = 0;
            t.texture.y = 0;
            t.mesh.visible = true;
            t.mesh.refresh();
            //log("checking transition queue", t._transition, t._transitionQueue);
            //if (t._transitionQueue?.length) {
            //    let next = t._transitionQueue.shift();
            //    MonksActiveTiles.transitionImage(next.entity, next.from, next.to, next.transition, new Date().getTime() + next.duration);
            //}
        });
    }

    static findVacantSpot(pos, token, scene, newTokens, dest, snap) {
        let tokenList = scene.tokens.contents.concat(...newTokens);
        let tokenCollide = function (pt) {
            let ptWidth = (token.width * scene.dimensions.size) / 2;
            let checkpt = duplicate(pt);
            if (snap) {
                checkpt.x += ((Math.abs(token.width) * scene.dimensions.size) / 2);
                checkpt.y += ((Math.abs(token.height) * scene.dimensions.size) / 2);
            }

            let found = tokenList.find(tkn => {
                if (token.id == tkn.id)
                    return false;

                let tokenX = tkn.x + ((Math.abs(tkn.width) * scene.dimensions.size) / 2);
                let tokenY = tkn.y + ((Math.abs(tkn.height) * scene.dimensions.size) / 2);

                let distSq = parseInt(Math.sqrt(Math.pow(checkpt.x - tokenX, 2) + Math.pow(checkpt.y - tokenY, 2)));
                let radSumSq = ((Math.abs(tkn.width) * scene.dimensions.size) / 2) + ptWidth;

                let result = (distSq < radSumSq - 5);
                
                //log('check', count, dist, tkn.name, distSq, radSumSq, checkpt, tkn, result);
                //gr.lineStyle(2, 0x808080).drawCircle(tokenX + debugoffset.x, tokenY + debugoffset.y, ((tkn.width * scene.dimensions.size) / 2));
                

                return result;
            })

            return found != undefined;
        }

        let wallCollide = function (ray) {
            for (let wall of scene.walls) {
                if (lineSegmentIntersects(ray.A, ray.B, { x: wall.c[0], y: wall.c[1] }, { x: wall.c[2], y: wall.c[3] }))
                    return true;
            }
            return false
        }

        let outsideTile = function (pt) {
            if (dest && dest.width && dest.height) {
                let checkpt = duplicate(pt);
                if (snap) {
                    checkpt.x += ((Math.abs(token.width) * scene.dimensions.size)/ 2);
                    checkpt.y += ((Math.abs(token.height) * scene.dimensions.size) / 2);
                }

                //gr.lineStyle(2, 0x808080).drawRect(dest.x + debugoffset.x, dest.y + debugoffset.y, dest.width, dest.height);
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
        const tw = (Math.abs(token.width) * scene.dimensions.size);
        let dist = 0;
        let angle = null;
        let rotate = 1; //should be set first thing, but if it isn't just make sure it's not 0
        let spot = duplicate(pos);
        let checkspot = duplicate(spot);
        if (snap) {
            checkspot.x -= ((Math.abs(token.width) * scene.dimensions.size) / 2);
            checkspot.y -= ((Math.abs(token.height) * scene.dimensions.size) / 2);
            checkspot.x = checkspot.x.toNearest(scene.dimensions.size);
            checkspot.y = checkspot.y.toNearest(scene.dimensions.size);
        }
        let ray = new Ray({ x: pos.x, y: pos.y }, { x: checkspot.x, y: checkspot.y });

        while (tokenCollide(checkspot) || wallCollide(ray) || outsideTile(checkspot)) {

            //log("Checking Position:", checkspot, tknRes, wallRes, tileRes);

            count++;
            //move the point along
            if (angle == undefined || angle > 2 * Math.PI) {
                dist += scene.dimensions.size;
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
                checkspot.x -= ((Math.abs(token.width) * scene.dimensions.size) / 2);
                checkspot.y -= ((Math.abs(token.height) * scene.dimensions.size) / 2);
                checkspot.x = checkspot.x.toNearest(scene.dimensions.size);
                checkspot.y = checkspot.y.toNearest(scene.dimensions.size);

                ray.B.x = checkspot.x + ((Math.abs(token.width) * scene.dimensions.size) / 2);
                ray.B.y = checkspot.y + ((Math.abs(token.height) * scene.dimensions.size) / 2);
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

    static async inlineRoll(value, rgx, chatMessage = true, rollMode = "selfroll", token) {
        let doRoll = async function (match, command, formula, closing, label, ...args) {
            if (closing.length === 3) formula += "]";
            let roll = await Roll.create(formula).roll();

            if (chatMessage) {
                const cls = ChatMessage.implementation;
                const speaker = cls.getSpeaker({ token: token });

                let mode = command.replace(/[^A-Za-z]/g, "");
                if (!["publicroll", "gmroll", "blindroll", "selfroll"].includes(mode)) mode = null;

                roll.toMessage({ flavor: (label ? `${label}: ${roll.total}` : roll.total), speaker }, { rollMode: mode || rollMode });
            }

            return roll.total;
        }

        let retVal = value;

        const matches = value.matchAll(rgx);
        for (let match of Array.from(matches).reverse()) {
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
        } else if (entity instanceof Actor) {
            if (result.actors == undefined) result.actors = [];
            result.actors.push(entity);
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
            if (result.journal == undefined) result.journal = [];
            result.journal.push(entity);
        } else if (entity instanceof Scene) {
            if (result.scenes == undefined) result.scenes = [];
            result.scenes.push(entity);
        } else if (entity instanceof Macro) {
            if (result.macros == undefined) result.macros = [];
            result.macros.push(entity);
        } else if (entity instanceof Item) {
            if (result.items == undefined) result.items = [];
            result.items.push(entity);
        } else if (entity instanceof RollTable) {
            if (result.rolltables == undefined) result.rolltables = [];
            result.rolltables.push(entity);
        } else if (entity instanceof Playlist) {
            if (result.playlists == undefined) result.playlists = [];
            result.playlists.push(entity);
        } else if (entity instanceof User) {
            if (result.users == undefined) result.users = [];
            result.users.push(entity);
        }
    }

    static async init() {
        log('Initializing Monks Active Tiles');
        registerSettings();

        game.MonksActiveTiles = this;

        try {
            Object.defineProperty(User.prototype, "isTheGM", {
                get: function isTheGM() {
                    return this == (game.users.find(u => u.hasRole("GAMEMASTER") && u.active) || game.users.find(u => u.hasRole("ASSISTANT") && u.active));
                }
            });
        } catch { }

        Array.prototype.pickRandom = function (id) {
            if (this.length == 0)
                return null;
            else if (this.length == 1)
                return this[0];
            else {
                let results = this.filter(d => d.dest == undefined || d.dest.id != id);
                return results[Math.floor(Math.random() * results.length)];
            }
        }

        CONFIG.TextEditor.enrichers.push({ id: 'MonksActiveTileTrigger', pattern: new RegExp(`@(Tile)\\[([^\\]]+)\\](?:{([^}]+)})?`, 'g'), enricher: MonksActiveTiles._createTileLink });

        //let otherGroups = {};
        //await Hooks.call("setupTileGroups", otherGroups);
        //MonksActiveTiles.triggerGroups = Object.assign(MonksActiveTiles.triggerGroups, otherGroups);

        //let otherTriggers = {};
        await Hooks.call("setupTileActions", this);
        //MonksActiveTiles.triggerActions = Object.assign(otherTriggers, MonksActiveTiles.triggerActions);

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-enhanced-journal", "JournalDirectory.prototype._onClickDocumentName");
            libWrapper.ignore_conflicts("monks-active-tiles", "multiple-document-selection", "JournalDirectory.prototype._onClickDocumentName");
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-enhanced-journal", "Compendium.prototype._onClickEntry");
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-scene-navigation", "SceneDirectory.prototype._onClickDocumentName");
            libWrapper.ignore_conflicts("monks-active-tiles", "df-scene-enhance", "SceneDirectory.prototype._onClickDocumentName");
            libWrapper.ignore_conflicts("monks-active-tiles", "monks-little-details", "TilesLayer.prototype._onDropData");
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



        let entityOnUpdate = function (wrapped, ...args) {
            let [data, options, userId] = args;
            const keys = Object.keys(foundry.utils.flattenObject(data));
            const changed = new Set(keys);
            const positionChange = ["x", "y"].some(c => changed.has(c));
            const hasRotation = changed.has("rotation");
            const hasAlpha = changed.has("hidden");

            let object = this.mesh || this.shape || this;

            const initial = {};
            if (positionChange) {
                initial.x = object.x;
                initial.y = object.y
            };
            if (hasRotation) {
                initial.rotation = Math.toDegrees(object.rotation);
            }
            if (hasAlpha) {
                initial.alpha = (changed["hidden"] === false ? (game.user.isGM ? 0.5 : 0) : object.alpha);
            }
            log("Initial", initial);

            let result = wrapped(...args);

            if (!!options.animation && options.animation.duration && (positionChange || hasRotation || hasAlpha))
                MonksActiveTiles.animateEntity(this, initial, options.animation)

            return result;
        }

        patchFunc("Tile.prototype._onUpdate", entityOnUpdate);
        patchFunc("Drawing.prototype._onUpdate", entityOnUpdate);
        patchFunc("AmbientLight.prototype._onUpdate", entityOnUpdate);
        patchFunc("AmbientSound.prototype._onUpdate", entityOnUpdate);
        patchFunc("Note.prototype._onUpdate", entityOnUpdate);
        /*
        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Tile.prototype._onUpdate", tileOnUpdate, "WRAPPER");
        } else {
            const oldOnUpdate = Tile.prototype._onUpdate;
            Tile.prototype._onUpdate = function (event) {
                return tileOnUpdate.call(this, oldOnUpdate.bind(this), ...arguments);
            }
        }*/

        let releaseAll = function (wrapped, ...args) {
            if (this.controlled.length) {
                let data = { tokens: this.controlled.map(t => t.document) };
                let id = window.setTimeout(() => {
                    if (id == MonksActiveTiles._selectedTokens.id)
                        delete MonksActiveTiles._selectedTokens;
                }, 400);
                data.id = id;
                MonksActiveTiles._selectedTokens = data;
            }
            return wrapped(...args);
        }

        patchFunc("TokenLayer.prototype.releaseAll", releaseAll);

        let onDropData = async function (wrapper, ...args) {
            const [event, data] = args;
            if (data.data) {
                // Drop tile from tile browser
                let tileData = data.data;
                tileData.x = data.x;
                tileData.y = data.y;
                tileData.x = tileData.x - (tileData.width / 2);
                tileData.y = tileData.y - (tileData.height / 2);
                if (!event.shiftKey) {
                    const { x, y } = canvas.grid.getSnappedPosition(tileData.x, tileData.y);
                    tileData.x = x;
                    tileData.y = y;
                }
                if (event.altKey) tileData.hidden = true;
                return TileDocument.create(tileData, { parent: canvas.scene });
            }
            else
                return wrapper(...args);
        }

        patchFunc("TilesLayer.prototype._onDropData", onDropData, "MIXED");

        let tileCreatePreview = function (wrapped, ...args) {
            let data = args[0];

            if (getProperty(data, "flags.monks-active-tiles") == undefined) {
                data = mergeObject(data, {
                    flags: {
                        'monks-active-tiles': {
                            active: true,
                            trigger: setting('default-trigger'),
                            chance: 100,
                            restriction: 'all',
                            controlled: 'all',
                            actions: []
                        }
                    }
                });
            }

            return wrapped(...args);
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Tile.prototype.constructor.createPreview", tileCreatePreview, "WRAPPER");
        } else {
            const oldTileCreatePreview = Tile.prototype.constructor.createPreview;
            Tile.prototype.constructor.createPreview = function (event) {
                return tileCreatePreview.call(this, oldTileCreatePreview.bind(this), ...arguments);
            }
        }

        let tileDraw = function (wrapped, ...args) {
            if (this._transition) {
                this.removeChild(this._transition);
            }
            return wrapped(...args).then((result) => {
                if (this._transition) {
                    this.addChild(this._transition);
                    this.mesh.visible = false;
                }

                if (this._animationAttributes && this._animationAttributes.alpha && this?.mesh?.alpha != this._animationAttributes.alpha) {
                    this.mesh.alpha = this._animationAttributes.alpha;
                }

                let triggerData = this.document.flags["monks-active-tiles"];
                if (triggerData?.usealpha && !this._textureBorderPoints) {
                    this._findTextureBorder();
                }

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

        let tokenDraw = function (wrapped, ...args) {
            return wrapped(...args).then((result) => {
                if (this._showhide) {
                    this.mesh.alpha = this._showhide;
                    this.mesh.visible = true;
                    this.visible = true;
                    log("Token Draw");
                }
                return result;
            });
        }

        if (game.modules.get("lib-wrapper")?.active) {
            libWrapper.register("monks-active-tiles", "Token.prototype.draw", tokenDraw, "WRAPPER");
        } else {
            const oldTokenDraw = Token.prototype.draw;
            Token.prototype.draw = function (event) {
                return tokenDraw.call(this, oldTokenDraw.bind(this), ...arguments);
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
                    if (wall.flags["monks-active-tiles"]?.entity) {
                        if ((!!wall.flags["monks-active-tiles"][wall._wallchange || "checklock"]) ||
                            (wall.flags["monks-active-tiles"].open == undefined && wall.flags["monks-active-tiles"].close == undefined && wall.flags["monks-active-tiles"].lock == undefined && wall.flags["monks-active-tiles"].secret == undefined && wall.flags["monks-active-tiles"].checklock == undefined)) {

                            let entity = wall.flags['monks-active-tiles']?.entity;
                            if (typeof entity == "string")
                                entity = JSON.parse(entity || "{}");
                            if (entity.id) {
                                let walls = [wall];

                                let docs = [];
                                if (entity.id.startsWith("tagger")) {
                                    if (game.modules.get('tagger')?.active) {
                                        let tag = entity.id.substring(7);

                                        let options = {};
                                        if (!entity.match || entity.match == "any")
                                            options.matchAny = true;
                                        if (entity.match == "exact")
                                            options.matchExactly = true;

                                        if (entity.scene == "_all")
                                            options.allScenes = true;
                                        else if (entity.scene !== "_active" && entity.scene)
                                            options.sceneId = entity.scene;

                                        docs = Tagger.getByTag(tag, options);

                                        if (entity.scene == "_all")
                                            docs = [].concat(...Object.values(docs));
                                    }
                                } else if (entity.id == "within") {
                                    // Find the tile under this door
                                    for (let tile of wall.parent.tiles) {
                                        let triggerData = tile.flags["monks-active-tiles"] || {};
                                        let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);
                                        if (triggerData?.active && triggerData.actions?.length > 0 && triggers.includes("door")) {

                                            let pt1 = { x: wall.c[0], y: wall.c[1] };
                                            let pt2 = { x: wall.c[2], y: wall.c[3] };
                                            if (tile.pointWithin(pt1) || tile.pointWithin(pt2))
                                                docs.push(tile);
                                            else {
                                                let collisions = tile.getIntersections(pt1, pt2);
                                                if (collisions.length) {
                                                    docs.push(tile);
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    let parts = entity.id.split(".");

                                    const [docName, docId] = parts.slice(0, 2);
                                    parts = parts.slice(2);
                                    const collection = CONFIG[docName].collection.instance;
                                    let entry = collection.get(docId);

                                    while (entry && (parts.length > 1)) {
                                        const [embeddedName, embeddedId] = parts.slice(0, 2);
                                        entry = entry.getEmbeddedDocument(embeddedName, embeddedId);
                                        parts = parts.slice(2);
                                    }

                                    docs = [entry];
                                }

                                if (docs.length) {
                                    let results = {};
                                    for (let doc of docs) {
                                        let triggerData = doc.flags["monks-active-tiles"];
                                        if (triggerData?.active) {
                                            if (setting("prevent-when-paused") && game.paused && !game.user.isGM && triggerData.allowpaused !== true)
                                                return;

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

                                            let result = doc.trigger({ tokens: tokens, method: 'door', options: { walls: walls, change: wall._wallchange || "checklock" } }) || {};
                                            mergeObject(results, result);
                                        }
                                    }
                                    return results;
                                }
                            }
                        }
                    }
                }
            }

            let result = wrapped(...args);
            if (result instanceof Promise) {
                return result.then((wall) => {
                    let w = wall || args[0]?.target?.wall?.document;
                    if (w && w instanceof WallDocument) {
                        triggerDoor(w);
                        delete w._wallchange;
                    }
                });
            } else {
                if (this.wall) {
                    triggerDoor(this.wall.document);
                    delete this.wall.document._wallchange;
                }
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
            return position.x >= tile.x
                && position.y >= tile.y
                && position.x <= (tile.x + Math.abs(tile.width))
                && position.y <= (tile.y + Math.abs(tile.height));
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

            if (!(canvas.activeLayer instanceof TokenLayer))
                return;

            let hasPointer = $('#board').css('cursor') == "pointer"

            for (let tile of canvas.scene.tiles) {
                let triggerData = tile.flags["monks-active-tiles"];
                let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);

                if (!triggerData || (!triggerData.active && !hasPointer) || !(triggers.includes("hoverin") || triggers.includes("hoverout") || triggerData.pointer))
                    continue;

                //check to see if this trigger is restricted by control type
                if ((triggerData.controlled === 'gm' && !game.user.isGM) || (triggerData.controlled === 'player' && game.user.isGM))
                    continue;

                let tokens = [];
                if (triggers.includes("hoverin") || triggers.includes("hoverout")) {
                    tokens = canvas.tokens.controlled.map(t => t.document);
                    //check to see if this trigger is per token, and already triggered
                    if (triggerData.pertoken) {
                        tokens = tokens.filter(t => !tile.hasTriggered(t.id));
                        if (tokens.length === 0)
                            continue;
                    }

                    if (triggerData.usealpha && this._object && !this.object._texturePolygon)
                        this.object._findTextureBorder();
                }

                let lastPositionContainsTile = tile.pointWithin(lastPosition);
                let currentPositionContainsTile = tile.pointWithin(currentPosition);

                if (!lastPositionContainsTile && currentPositionContainsTile && !MonksActiveTiles.hoveredTiles.has(tile)) {
                    MonksActiveTiles.hoveredTiles.add(tile);
                    if (triggerData.pointer)
                        $('#board').css({ cursor: 'pointer' });
                    if (triggers.includes("hoverin")) {
                        if (setting("prevent-when-paused") && game.paused && !game.user.isGM && triggerData.allowpaused !== true)
                            continue;

                        tile.trigger({ tokens: tokens, method: 'hoverin', pt: currentPosition });
                    }
                }

                if (lastPositionContainsTile && !currentPositionContainsTile && MonksActiveTiles.hoveredTiles.has(tile)) {
                    MonksActiveTiles.hoveredTiles.delete(tile);
                    if (triggerData.pointer && MonksActiveTiles.hoveredTiles.size == 0)
                        $('#board').css({ cursor: '' });
                    if (triggers.includes("hoverout")) {
                        if (setting("prevent-when-paused") && game.paused && !game.user.isGM && triggerData.allowpaused !== true)
                            continue;

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
                MonksActiveTiles.checkClick(event.data.origin, clicktype, event);
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
            libWrapper.register("monks-active-tiles", "MeasuredTemplate.prototype._onClickLeft", leftClick, "WRAPPER");
        } else {
            const oldOnClickLeft = MeasuredTemplate.prototype._onClickLeft;
            MeasuredTemplate.prototype._onClickLeft = function (event) {
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

            /*
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
                const dx = Math.round((token.x - origin[0]) / s2) * s2;
                const dy = Math.round((token.y - origin[1]) / s2) * s2;

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
                    if (priorDest && ((token.x !== priorDest.x) || (token.y !== priorDest.y))) break;

                    // Adjust the ray based on token size
                    const dest = canvas.grid.getTopLeft(r.B.x, r.B.y);
                    const path = new Ray({ x: token.x, y: token.y }, { x: dest[0] + dx, y: dest[1] + dy });

                    // Commit the movement and update the final resolved destination coordinates
                    let animate = true;
                    priorDest = duplicate(path.B);
                    await token.document.update(path.B, { animate: animate });
                    path.B.x = token.x;
                    path.B.y = token.y;

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
                libWrapper.register("monks-active-tiles", "Ruler.prototype._animateMovement", moveToken, "OVERRIDE");
            } else {
                const oldMoveToken = Ruler.prototype._animateMovement;
                Ruler.prototype._animateMovement = async function (event) {
                    return moveToken.call(this, oldMoveToken.bind(this));
                }
            }
            */
        }
    }

    static async fixTiles() {
        //find all tiles and check for actions that have the old format
        //openfql, execute(need to figure out if it's kandashi or tagger), setmovement, requestroll, filterrequest
        for (let scene of game.scenes) {
            for (let tile of scene.tiles) {
                let triggerData = tile.flags["monks-active-tiles"];
                if (triggerData && triggerData.actions?.length > 0) {
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

    static async fixImageCycle() {
        //find all tiles and check for actions that have the old format
        //openfql, execute(need to figure out if it's kandashi or tagger), setmovement, requestroll, filterrequest
        for (let scene of game.scenes) {
            for (let tile of scene.tiles) {
                let triggerData = tile.flags["monks-active-tiles"];
                if (triggerData && triggerData.actions?.length > 0) {
                    let actions = duplicate(triggerData.actions);
                    let update = false;
                    for (let i = 0; i < actions.length; i++) {
                        let action = actions[i];
                        if (action.action == "imagecycle") {
                            if (triggerData.files == undefined) {
                                await tile.setFlag("monks-active-tiles", "files", action.data.files);
                                await tile.setFlag("monks-active-tiles", "fileindex", action.data.imgat - 1);
                            }
                            if (i >= actions.length - 1 || actions[i + 1].action != "tileimage") {
                                actions.splice(i + 1, 0, {
                                    id: makeid(),
                                    action: "tileimage",
                                    data: {
                                        select: (action.data?.random === true ? "random" : "next"),
                                        transition: (action.data?.slot === true ? "bump-down" : "fade")
                                    }
                                });
                                update = true;
                            }
                        } else if (action.action == "tileimage" && action.id == undefined) {
                            action.id = makeid();
                            update = true;
                        }
                    }

                    if (update) {
                        await tile.setFlag("monks-active-tiles", "actions", actions);
                    }
                }
            }
        }
    }

    static _createTileLink(match, { async = false, relativeTo } = {}) {
        let [command, options, name] = match.slice(1, 5);
        let [target, ...props] = options.split(' ');
        const data = {
            cls: ["tile-trigger-link"],
            icon: 'fas fa-cube',
            dataset: {},
            name: name
        };

        data.dataset = { uuid: target };
        let activeProp = (props || []).find(p => p.startsWith('active:'));
        if (activeProp)
            data.dataset.active = activeProp.replace('active:', '');
        const constructAnchor = () => {
            const a = document.createElement("a");
            a.classList.add(...data.cls);
            a.draggable = true;
            for (let [k, v] of Object.entries(data.dataset)) {
                a.dataset[k] = v;
            }
            a.innerHTML = `<i class="${data.icon}"></i>${data.name}`;
            return a;
        };

        return constructAnchor()
    }

    static async _onClickTileLink(event) {
        event.preventDefault();
        const a = event.currentTarget;
        let uuid = a.dataset.uuid;

        if (!uuid.startsWith("Scene"))
            uuid = `Scene.${canvas.scene.id}.${!uuid.startsWith("Tile") ? "Tile." : ""}${uuid}`;

        let tile = await fromUuid(uuid);
        if (tile && tile instanceof TileDocument) {
            let tokens = canvas.tokens.controlled.map(t => t.document);
            //check to see if this trigger is per token, and already triggered
            let triggerData = tile.flags["monks-active-tiles"];

            if (triggerData) {
                if (triggerData.pertoken)
                    tokens = tokens.filter(t => !tile.hasTriggered(t.id));

                if (a.dataset.active == "true" && !triggerData.active) return;

                tile.trigger({ tokens: tokens, method: "manual", options: { journal: [this.object] } });
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
                if (game.user.isTheGM) {
                    let tokens = data.tokens;
                    for (let i = 0; i < tokens.length; i++)
                        tokens[i] = await fromUuid(tokens[i]);
                    let tile = await fromUuid(data.tileid);

                    if (data.options.walls) {
                        for (let i = 0; i < data.options.walls.length; i++)
                            data.options.walls[i] = await fromUuid(data.options.walls[i]);
                    }

                    tile.trigger({ tokens: tokens, userid: data.senderId, method: data.method, pt: data.pt, options: data.options });
                }
            } break;
            case 'switchview': {
                if (data.userid.find(u => u == game.user.id) != undefined) {
                    //let oldSize = canvas.scene.dimensions.size;
                    //let oldPos = canvas.scene._viewPosition;
                    let offset = { dx: (canvas.scene._viewPosition.x - data.oldpos?.x), dy: (canvas.scene._viewPosition.y - data.oldpos?.y) };
                    let scene = game.scenes.get(data.sceneid);
                    if (canvas.scene.id != scene.id) {
                        let oldPing = game.user.permissions["PING_CANVAS"];
                        game.user.permissions["PING_CANVAS"] = false;
                        await scene.view();
                        window.setTimeout(() => {
                            if (oldPing == undefined)
                                delete game.user.permissions["PING_CANVAS"];
                            else
                                game.user.permissions["PING_CANVAS"] = oldPing;
                        }, 500);
                    }
                    //let scale = oldSize / canvas.scene.dimensions.size;
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

                    let user = game.users.get(data.userid);

                    let context = {
                        actor: token?.actor,
                        token: token?.object,
                        character: user?.character,
                        tile: tile.object,
                        user: user,
                        args: data.args,
                        canvas: canvas,
                        scene: canvas.scene,
                        values: data.values,
                        value: data.value,
                        tokens: tokens,
                        method: data.method,
                        pt: data.pt,
                        actionId: data._id,
                        change: data.change
                    };

                    let results = (macro.type == 'script' ? MonksActiveTiles._execute.call(macro, context) : macro.execute(args));
                    /*
                        (game.modules.get("advanced-macros")?.active || game.modules.get("furnace")?.active ?
                        await (macro.type == 'script' ? macro.callScriptFunction(context) : macro.execute(data.args)) :
                        await MonksActiveTiles._execute.call(macro, context));
                        */
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

                    MonksActiveTiles._showDialog(tile, token, data.value, data.type, data.title, data.content, data.options, data.yes, data.no, data.buttons).then((results) => {
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
                    const el = tile._object?.sourceElement;
                    if (el?.tagName !== "VIDEO") return;

                    if (data.play == 'stop')
                        game.video.stop(el);
                    else if (data.play == 'pause')
                        el.pause();
                    else
                        el.play();
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
                        if (data.src) {
                            AudioHelper.play({ src: data.src, volume: (data.fade > 0 ? 0 : volume), loop: data.loop }, false).then((sound) => {
                                if (data.fade > 0)
                                    sound.fade(volume * getVolume(), { duration: data.fade * 1000 });
                                if (tile.soundeffect == undefined)
                                    tile.soundeffect = {};
                                tile.soundeffect[data.actionid] = sound;
                                tile.soundeffect[data.actionid].on("end", () => {
                                    debug('Finished playing', data.src);
                                    delete tile.soundeffect[data.actionid];
                                });
                                tile.soundeffect[data.actionid].effectiveVolume = volume;
                            });
                        }
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
                                        if (tile.soundeffect[data.actionid]) {
                                            tile.soundeffect[data.actionid].fade(0, { duration: data.fade * 1000 }).then((sound) => {
                                                sound.stop();
                                                delete tile.soundeffect[data.actionid];
                                            });
                                        }
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
            case 'showimage': {
                if ((data.userid == undefined || data.userid.find(u => u == game.user.id) != undefined)) {
                    new ImagePopout(data.src, {
                        title: data.caption
                    }).render(true);
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
                if (data.userid instanceof Array ? data.userid.includes(game.user.id) : data.userid == game.user.id) {
                    $('<div>').addClass('active-tile-backdrop').css({'background': data.colour || setting('teleport-colour')}).appendTo('body').animate({ opacity: 1 }, {
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

                    if (game.modules.get("monks-enhanced-journal")?.active && entity instanceof JournalEntry && entity.pages.size == 1 && !!getProperty(entity.pages.contents[0], "flags.monks-enhanced-journal.type")) {
                        let type = getProperty(entity.pages.contents[0], "flags.monks-enhanced-journal.type");
                        if (type == "base" || type == "oldentry") type = "journalentry";
                        let types = game.MonksEnhancedJournal.getDocumentTypes();
                        if (types[type]) {
                            entity = entity.pages.contents[0];
                            game.MonksEnhancedJournal.fixType(entity);
                        }
                    }

                    if (data.enhanced !== true || !game.modules.get("monks-enhanced-journal")?.active || !game.MonksEnhancedJournal.openJournalEntry(entity, { tempOwnership: !data.permission })) {
                        if (!data.permission && !entity.testUserPermission(game.user, "OBSERVER")) {
                            entity.ownership[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                            if (entity.parent)
                                entity.parent.ownership[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
                        }
                        entity.sheet.render(true, { force: !data.permission, pageId: data.page, anchor: data.subsection?.slugify() });
                        if (!data.permission) {
                            if (entity._source.ownership[game.user.id] == undefined)
                                delete entity.ownership[game.user.id];
                            else
                                entity.ownership[game.user.id] = entity._source.ownership[game.user.id];
                            if (entity.parent) {
                                if (entity.parent._source.ownership[game.user.id] == undefined)
                                    delete entity.parent.ownership[game.user.id];
                                else
                                    entity.parent.ownership[game.user.id] = entity.parent._source.ownership[game.user.id];
                            }
                        }
                    }
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
                    if (data.quest) {
                        const fqlAPI = game.modules.get('forien-quest-log').public.QuestAPI;
                        fqlAPI.open({ questId: data.quest });
                    } else
                        Hooks.call('ForienQuestLog.Open.QuestLog');
                }
            } break;
            case 'party-inventory': {
                if ((data.for == 'players' && !game.user.isGM) || (data.for == 'trigger' && game.user.id == data.userid) || data.for == 'everyone' || data.for == undefined) {
                    game.modules.get("party-inventory").api.openWindow();
                }
            } break;
            case 'target': {
                if (data.userid == game.user.id) {
                    if(data.target == "target")
                        game.user.updateTokenTargets(data.tokens);
                    else {
                        data.tokens.forEach(id => {
                            let token = canvas.tokens.get(id);
                            if (token)
                                token.setTarget(data.target !== "clear", { user: game.user, releaseOthers: false, groupSelection: false })
                        });
                    }
                }
            } break;
            case 'scrollingtext': {
                if (data.userid == undefined || data.userids.find(u => u == game.user.id) != undefined) {
                    let token = canvas.tokens.get(data.tokenid);
                    if (token) {
                        canvas.interface.createScrollingText(token.center, data.content, {
                            anchor: data.anchor,
                            direction: data.direction,
                            duration: data.duration,
                            distance: token.h,
                            fontSize: 28,
                            stroke: 0x000000,
                            strokeThickness: 4,
                            jitter: 0.25
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
                            let tileData = tile.flags["monks-active-tiles"];
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
                                    container.width = entity.width;
                                    container.height = entity.height;

                                    //Set the image clip region
                                    const mask = new PIXI.Graphics();
                                    mask.beginFill(0xFFFFFF);
                                    mask.drawRect(0, 0, entity.width, entity.height);
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
                                        s.y = entity.height;
                                        s.width = entity.width;
                                        s.height = entity.height;
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

                                let duration = data.time - new Date().getTime();
                                if (duration < 0)
                                    return;

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
                                    duration
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
            case 'transition':
                {
                    let entity = await fromUuid(data.entityid);
                    if (entity)
                        MonksActiveTiles.transitionImage(entity, data.from, data.img, data.transition, data.time);
                } break;
            case 'move':
                {
                    let entity = await fromUuid(data.entityid);

                    if (entity)
                        MonksActiveTiles.moveEntity(entity, { x: data.x, y: data.y }, data.time);
                } break;
            case 'showhide': {
                let entity = await fromUuid(data.entityid);

                if (entity)
                    MonksActiveTiles.fadeImage(entity, data.hide, data.time);
            } break;
            case 'bubble': {
                if (!data.for || data.for.length == 0 || data.for.includes(game.user.id)) {
                    let token = canvas.tokens.get(data.tokenId);
                    if (token) {
                        canvas.hud.bubbles.say(token, data.content);
                    }
                } 
            } break;
        }
    }

    static checkClick(pt, clicktype = "click", event) {
        for (let tile of canvas.scene.tiles) {
            tile.checkClick(pt, clicktype, event);
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

    static getTileSegments(tile, usealpha = false) {
        let width = Math.abs(tile.width);
        let height = Math.abs(tile.height);

        let segments = [
            { a: { x: 0, y: 0 }, b: { x: width, y: 0 } },
            { a: { x: width, y: 0 }, b: { x: width, y: height } },
            { a: { x: width, y: height }, b: { x: 0, y: height } },
            { a: { x: 0, y: height }, b: { x: 0, y: 0 } }
        ];

        if (usealpha) {
            segments = [];
            for (let i = 0; i < tile.object._textureBorderPoints.length - 2; i += 2) {
                segments.push({ a: { x: tile.object._textureBorderPoints[i], y: tile.object._textureBorderPoints[i + 1] }, b: { x: tile.object._textureBorderPoints[i + 2], y: tile.object._textureBorderPoints[i + 3] } });
            }
            segments.push({ a: { x: tile.object._textureBorderPoints[tile.object._textureBorderPoints.length - 2], y: tile.object._textureBorderPoints[tile.object._textureBorderPoints.length - 1] }, b: { x: tile.object._textureBorderPoints[0], y: tile.object._textureBorderPoints[1] } })
        } 

        /*
        if (tile.rotation != 0) {
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

            const cX = tile.x + (Math.abs(tile.width) / 2);
            const cY = tile.y + (Math.abs(tile.height) / 2);

            let pt1 = rotate(cX, cY, tileX1, tileY1, tile.rotation);
            let pt2 = rotate(cX, cY, tileX2, tileY1, tile.rotation);
            let pt3 = rotate(cX, cY, tileX2, tileY2, tile.rotation);
            let pt4 = rotate(cX, cY, tileX1, tileY2, tile.rotation);
            */
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
        /*
            segments = [
                { a: pt1, b: pt2 },
                { a: pt2, b: pt3 },
                { a: pt3, b: pt4 },
                { a: pt4, b: pt1 }
            ];
        }*/

        return segments;
    }

    static setupTile() {
        TileDocument.prototype.pointWithin = function (point) {
            let triggerData = this.flags["monks-active-tiles"];

            const cX = (Math.abs(this.width) / 2);
            const cY = (Math.abs(this.height) / 2);

            // normalise the point to center, scale, normalise to the origin, then rotate
            /*
            let pt = {
                x: ((point.x - (this.x - ((this.texture.scaleX - 1) * (this.width / 2)))) / this.texture.scaleX),
                y: ((point.y - (this.y - ((this.texture.scaleY - 1) * (this.height / 2)))) / this.texture.scaleY)
            };
            */
            let pt = {
                x: (point.x - (this.x + cX)),
                y: (point.y - (this.y + cY))
            };

            if (this.rotation != 0) {
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

                pt = rotate(0, 0, pt.x, pt.y, this.rotation);
            }

            pt.x = (pt.x / this.texture.scaleX) + cX;
            pt.y = (pt.y / this.texture.scaleY) + cY;

            if (triggerData?.usealpha && this._object && !this._object._texturePolygon)
                this.object._findTextureBorder();

            /*
            let gr = MonksActiveTiles.debugGr;
            if (!gr) {
                gr = new PIXI.Graphics();
                MonksActiveTiles.debugGr = gr;
                canvas.tokens.addChild(gr);
            }

            gr.lineStyle(2, 0x800080).drawCircle(pt.x + this.x, pt.y + this.y, 4);
            */

            if (pt.x < 0 ||
                pt.x > Math.abs(this.width) ||
                pt.y < 0 ||
                pt.y > Math.abs(this.height))
                return false;

            return triggerData?.usealpha && this._object?._texturePolygon ? this._object?._texturePolygon.contains(pt.x, pt.y) : true;
        }

        TileDocument.prototype.tokensWithin = function () {
            console.warn("tokensWithin is deprecated and will be remove in later version.  Please use entitiesWithin instead");
            return this.entitiesWithin();
        }
        TileDocument.prototype.entitiesWithin = function (collection = "tokens") {
            return this.parent[collection]?.filter(t => {
                let triggerPt = getProperty(t, "flags.monks-active-tiles.triggerPt");
                let midToken = (triggerPt ? triggerPt : {
                    x: t.x + ((Math.abs(t.width || 1) * t.parent.dimensions.size) / 2),
                    y: t.y + ((Math.abs(t.height || 1) * t.parent.dimensions.size) / 2),
                });

                if (game.modules.get("levels")?.active && collection == "tokens") {
                    let tileht = this.flags.levels?.rangeTop ?? 1000;
                    let tilehb = this.flags.levels?.rangeBottom ?? -1000;
                    if (t.elevation >= tilehb && t.elevation <= tileht)
                        return this.pointWithin(midToken);
                } else
                    return this.pointWithin(midToken);
            });
        }

        Tile.prototype._findTextureBorder_old = function () {
            let findPoint = function (pixels, start) {
                let pt;
                let dest = { x: width - start.x, y: height - start.y };

                //gr.lineStyle(1, 0x00ff00).moveTo(this.x + (start.x * aW), this.y + (start.y * aH)).lineTo(this.x + (dest.x * aW), this.y + (dest.y * aH));

                let hypot = Math.hypot((dest.x - start.x), (dest.y - start.y));
                let dX = (dest.x - start.x) / hypot;
                let dY = (dest.y - start.y) / hypot;

                for (let i = 0; i < hypot; i++) {
                    let check = { x: parseInt(start.x + (dX * i)), y: parseInt(start.y + (dY * i)) };
                    //gr.beginFill(0x00ff00).drawCircle(this.x + (check.x * aW), this.y + (check.y * aH), 1).endFill();
                    if (!pt || check.x != pt.x || check.y != pt.y) {
                        let idx = ((check.y * width) + check.x) * 4;
                        if (pixels[idx + 3] != 0) {
                            //gr.lineStyle(1, 0x00ff00).moveTo(this.x + (start.x * aW), this.y + (start.y * aH)).lineTo(this.x + (check.x * aW), this.y + (check.y * aH));

                            return check;
                        }
                        pt = check;
                    }
                }
            }

            let addPoint = function (pt) {
                if (pt) {
                    const last = points.slice(-2);
                    const next = [pt.x * aW, pt.y * aH];
                    if (next.equals(last)) return;

                    points = points.concat(next);
                }
            }

            let simplify = function(points, tolerance = 20) {
                if (points.length <= 2) return points;

                let getSqSegDist = function (p, p1, p2) {

                    var x = p1.x,
                        y = p1.y,
                        dx = p2.x - x,
                        dy = p2.y - y;

                    if (dx !== 0 || dy !== 0) {

                        var t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);

                        if (t > 1) {
                            x = p2.x;
                            y = p2.y;

                        } else if (t > 0) {
                            x += dx * t;
                            y += dy * t;
                        }
                    }

                    dx = p.x - x;
                    dy = p.y - y;

                    return dx * dx + dy * dy;
                }

                let simplifyDPStep = function (points, first, last, sqTolerance, simplified) {
                    var maxSqDist = sqTolerance,
                        index;

                    for (var i = first + 1; i < last; i++) {
                        var sqDist = getSqSegDist(
                            { x: points[i * 2], y: points[(i * 2) + 1] },
                            { x: points[first * 2], y: points[(first * 2) + 1] },
                            { x: points[last * 2], y: points[(last * 2) + 1] });

                        if (sqDist > maxSqDist) {
                            index = i;
                            maxSqDist = sqDist;
                        }
                    }

                    if (maxSqDist > sqTolerance) {
                        if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
                        simplified.push(points[index * 2], points[(index * 2) + 1]);
                        if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
                    }
                }

                var last = (points.length / 2) - 1;

                var simplified = points.slice(0, 2);
                simplifyDPStep(points, 0, last, tolerance, simplified);
                simplified.concat(points.slice(-2));

                return simplified;
            }

            const accuracy = 2;
            let width, height, aW, aH;

            let points = [];
            if (this.texture == null) {
                points = [0, 0, this.document.width, 0, this.document.width, this.document.height, 0, this.document.height, 0, 0];
            } else {
                const sprite = new PIXI.Sprite(this.texture);
                sprite.width = width = parseInt(this.texture.baseTexture.realWidth / accuracy);
                sprite.height = height = parseInt(this.texture.baseTexture.realHeight / accuracy);
                sprite.anchor.set(0.5, 0.5);
                sprite.position.set(sprite.width / 2, sprite.height / 2);

                aW = this.document.width / width;
                aH = this.document.height / height;

                // Create or update the alphaMap render texture
                const tex = PIXI.RenderTexture.create({ width: sprite.width, height: sprite.height });

                // Render the sprite to the texture and extract its pixels
                // Destroy sprite and texture when they are no longer needed
                canvas.app.renderer.render(sprite, tex);
                sprite.destroy(false);
                const pixels = canvas.app.renderer.extract.pixels(tex);
                tex.destroy(true);

                for (let i = 0; i < width; i++) {
                    addPoint.call(this, findPoint.call(this, pixels, { x: i, y: 0 }));
                }
                for (let i = 0; i < height; i++) {
                    addPoint.call(this, findPoint.call(this, pixels, { x: width - 1, y: i }));
                }
                for (let i = width - 1; i > 0; i--) {
                    addPoint.call(this, findPoint.call(this, pixels, { x: i, y: height - 1 }));
                }
                for (let i = height - 1; i > 0; i--) {
                    addPoint.call(this, findPoint.call(this, pixels, { x: 0, y: i }));
                }

                points = simplify(points, 40);
                //points = points.concat(points.slice(0, 2));

                /*
                for (let i = 0; i < width; i++) {
                    for (let j = 0; j < height; j++) {
                        let idx = ((j * width) + i) * 4;
                        if (pixels[idx + 3] != 0) {
                            gr.beginFill(0x0000ff).drawCircle(this.x + (i * aW), this.y + (j * aH), 1).endFill();
                        }
                    }
                }
                */
            }

            this._textureBorderPoints = points;
            this._texturePolygon = new PIXI.Polygon(this._textureBorderPoints);
            if (CONFIG.debug.tiletriggers) {
                if (this._debugBorder)
                    this._debugBorder.destroy();
                this._debugBorder = this.addChild(new PIXI.Graphics());
                this._debugBorder.lineStyle(2, 0xff0000).drawPolygon(this._texturePolygon);
            }

            /*
            let gr = MonksActiveTiles.debugGr;
            if (!gr) {
                gr = new PIXI.Graphics();
                MonksActiveTiles.debugGr = gr;
                canvas.tokens.addChild(gr);
                gr.x = this.x;
                gr.y = this.y;
                gr.lineStyle(2, 0xff0000).drawPolygon(this._textureBorderPoints);
            }
            */
        }

        Tile.prototype._findTextureBorder = function () {
            let findStart = function (pixels) {
                let point;
                let x = 0;
                while (!point && x < width) {
                    point = findPoint(pixels, { x: x, y: 0 }, { value: 'y', adjust: 1, max: height - 1 });
                    x++;
                }

                return point;
            }

            let addPoints = function (pixels, start, delta, last, depth = 0) {
                //log("Add Points", start, delta, last);
                let lastPt = { x: last.x, y: last.y };
                let check;
                let checkDelta = rotateDelta(delta);
                for (let i = start[delta.value]; delta.adjust > 0 ? i < delta.max : i > delta.max; i += delta.adjust) {
                    check = { x: start.x, y: start.y };
                    check[delta.value] = i;
                    // y+ switches to -, x- switches to +
                    let point = findPoint(pixels, check, checkDelta);
                    if (point) {
                        //gr.lineStyle(1, 0x00ff00).moveTo(this.x + (check.x * aW), this.y + (check.y * aH)).lineTo(this.x + (point.x * aW), this.y + (point.y * aH));
                        let diff = lastPt[checkDelta.value] - point[checkDelta.value];
                        //log("At Point", point);
                        if (depth < 2 && lastPt && Math.abs(diff) > 10) {
                            // this line is suspect, let's try and fill in the gaps
                            let altVal = delta.value == "x" ? "y" : "x";
                            let dir = (diff > 0 && checkDelta.adjust > 0) || (diff < 0 && checkDelta.adjust < 0) ? "left" : "right";
                            let suspectDelta = rotateDelta(delta, { direction: dir, max: point[altVal] });
                            //log("Suspect", dir, lastPt, suspectDelta, point);
                            let susEnd = addPoints.call(this, pixels, lastPt, suspectDelta, point, depth + 1);
                            //log("At Point Sus", susEnd, lastPt, point);

                            diff = point[delta.value] - susEnd[delta.value];
                            if (Math.abs(diff) > 10) {
                                // this line is suspect, let's try and fill in the gaps
                                let dir = (diff > 0 && checkDelta.adjust > 0) || (diff < 0 && checkDelta.adjust < 0) ? "left" : "right";
                                let suspectDelta = rotateDelta(delta, { direction: dir, max: point[delta.value == "x" ? "y" : "x"] });
                                //log("Suspect 2", dir, susEnd, suspectDelta, point);
                                point = addPoints.call(this, pixels, susEnd, suspectDelta, point, depth + 1);
                            } else
                                point = susEnd;
                        }
                        //gr.beginFill(0x00ffff).drawCircle(this.x + (point.x * aW), this.y + (point.y * aH), 2).endFill();
                        points.push(point.x * aW, point.y * aH);
                        lastPt = point;
                    } else
                        return lastPt;
                }
                return lastPt;
            }

            let findPoint = function (pixels, start, delta) {
                let check;
                
                for (let i = start[delta.value]; delta.adjust > 0 ? i < delta.max : i > delta.max; i += delta.adjust) {
                    check = { x: start.x, y: start.y };
                    check[delta.value] = i;
                    let idx = ((check.y * width) + check.x) * 4;
                    if (pixels[idx + 3] != 0) {
                        return check;
                    }
                }
            }

            let rotateDelta = function (delta, { direction = "right", max } = {}) {
                let value = delta.value == "x" ? "y" : "x";
                let adjust = (delta.value == "y" ? (direction == "right" ? delta.adjust * -1 : delta.adjust) : (direction == "right" ? delta.adjust : delta.adjust * -1));
                max = max ?? (adjust == -1 ? 0 : (value == "x" ? width - 1 : height - 1));
                return { value, adjust, max };
            }

            let simplify = function (points, tolerance = 20) {
                if (points.length <= 2) return points;

                let getSqSegDist = function (p, p1, p2) {

                    var x = p1.x,
                        y = p1.y,
                        dx = p2.x - x,
                        dy = p2.y - y;

                    if (dx !== 0 || dy !== 0) {

                        var t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);

                        if (t > 1) {
                            x = p2.x;
                            y = p2.y;

                        } else if (t > 0) {
                            x += dx * t;
                            y += dy * t;
                        }
                    }

                    dx = p.x - x;
                    dy = p.y - y;

                    return dx * dx + dy * dy;
                }

                let simplifyDPStep = function (points, first, last, sqTolerance, simplified) {
                    var maxSqDist = sqTolerance,
                        index;

                    for (var i = first + 1; i < last; i++) {
                        var sqDist = getSqSegDist(
                            { x: points[i * 2], y: points[(i * 2) + 1] },
                            { x: points[first * 2], y: points[(first * 2) + 1] },
                            { x: points[last * 2], y: points[(last * 2) + 1] });

                        if (sqDist > maxSqDist) {
                            index = i;
                            maxSqDist = sqDist;
                        }
                    }

                    if (maxSqDist > sqTolerance) {
                        if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
                        simplified.push(points[index * 2], points[(index * 2) + 1]);
                        if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
                    }
                }

                var last = (points.length / 2) - 1;

                var simplified = points.slice(0, 2);
                simplifyDPStep(points, 0, last, tolerance, simplified);
                simplified.concat(points.slice(-2));

                return simplified;
            }

            const accuracy = 2;
            let width, height, aW, aH;

            /*
            let gr = MonksActiveTiles.debugGr;
            if (!gr) {
                gr = new PIXI.Graphics();
                MonksActiveTiles.debugGr = gr;
                canvas.tokens.addChild(gr);
            }
            */

            let points = [];
            if (this.texture == null) {
                points = [0, 0, this.document.width, 0, this.document.width, this.document.height, 0, this.document.height, 0, 0];
            } else {
                const sprite = new PIXI.Sprite(this.texture);
                sprite.width = width = parseInt(this.texture.baseTexture.realWidth / accuracy);
                sprite.height = height = parseInt(this.texture.baseTexture.realHeight / accuracy);
                sprite.anchor.set(0.5, 0.5);
                sprite.position.set(sprite.width / 2, sprite.height / 2);

                aW = this.document.width / width;
                aH = this.document.height / height;

                // Create or update the alphaMap render texture
                const tex = PIXI.RenderTexture.create({ width: sprite.width, height: sprite.height });

                // Render the sprite to the texture and extract its pixels
                // Destroy sprite and texture when they are no longer needed
                canvas.app.renderer.render(sprite, tex);
                sprite.destroy(false);
                const pixels = canvas.app.renderer.extract.pixels(tex);
                tex.destroy(true);

                // Find the starting point
                // Work along the top until the line reaches the other side
                // Start at the last point, and work down

                let start, point, lastPt;
                start = lastPt = point = findStart.call(this, pixels);
                if (!start) {
                    points = [0, 0, this.document.width, 0, this.document.width, this.document.height, 0, this.document.height, 0, 0];
                } else {
                    //gr.beginFill(0x0000ff).drawCircle(this.x + (start.x * aW), this.y + (start.y * aH), 4).endFill();
                    let delta = { value: "x", adjust: 1, max: width };
                    for (let i = 0; i < 4; i++) {
                        let from = { x: i % 2 == 0 ? lastPt.x : i == 1 ? width - 1 : 0, y: i % 2 == 0 ? i == 2 ? height - 1 : 0 : lastPt.y };
                        point = addPoints.call(this, pixels, from, delta, lastPt);
                        lastPt = point || lastPt;
                        //gr.beginFill(0x00ffff).drawCircle(this.x + (lastPt.x * aW), this.y + (lastPt.y * aH), 4).endFill();
                        delta = rotateDelta(delta, { max: (i == 2 ? start.y : null) });
                        //log("Last Point", lastPt, delta);
                    }

                    points = simplify(points, 40);
                    //points = points.concat(points.slice(0, 2));

                    /*
                    for (let i = 0; i < width; i++) {
                        for (let j = 0; j < height; j++) {
                            let idx = ((j * width) + i) * 4;
                            if (pixels[idx + 3] != 0) {
                                gr.beginFill(0x0000ff).drawCircle(this.x + (i * aW), this.y + (j * aH), 1).endFill();
                            }
                        }
                    }
                    */
                }
            }

            this._textureBorderPoints = points;
            this._texturePolygon = new PIXI.Polygon(this._textureBorderPoints);
            if (CONFIG.debug.tiletriggers) {
                if (this._debugBorder)
                    this._debugBorder.destroy();
                this._debugBorder = this.addChild(new PIXI.Graphics());
                this._debugBorder.lineStyle(2, 0xff0000).drawPolygon(this._texturePolygon);
            }
        }

        TileDocument.prototype.checkClick = function (pt, clicktype = 'click', event) {
            let triggerData = this.flags["monks-active-tiles"];
            let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);
            if (triggerData?.active && triggers.includes(clicktype)) {
                //prevent triggering when game is paused
                if (setting("prevent-when-paused") && game.paused && !game.user.isGM && triggerData.allowpaused !== true)
                    return;

                //check to see if this trigger is restricted by control type
                if ((triggerData.controlled == 'gm' && !game.user.isGM) || (triggerData.controlled == 'player' && game.user.isGM))
                    return;

                let tokens = canvas.tokens.controlled.map(t => t.document);
                if (!tokens.length && MonksActiveTiles._selectedTokens?.tokens)
                    tokens = MonksActiveTiles._selectedTokens.tokens;
                //check to see if this trigger is per token, and already triggered
                if (triggerData.pertoken) {
                    tokens = tokens.filter(t => !this.hasTriggered(t.id)); //.uuid
                    if (tokens.length == 0)
                        return;
                }

                if (triggerData.usealpha && !this.object._texturePolygon)
                    this.object._findTextureBorder();
                if (CONFIG.debug.tiletriggers && triggerData.usealpha) {
                    if (this.object._debugBorder)
                        this.object._debugBorder.destroy();
                    this.object._debugBorder = this.object.addChild(new PIXI.Graphics());
                    this.object._debugBorder.lineStyle(2, 0xff0000).drawPolygon(this.object._texturePolygon);
                }

                /*
                let gr = MonksActiveTiles.debugGr;
                if (!gr) {
                    gr = new PIXI.Graphics();
                    MonksActiveTiles.debugGr = gr;
                    canvas.tokens.addChild(gr);
                }
                for (let x = pt.x - 1500; x < pt.x + 1500; x += 10) {
                    for (let y = pt.y - 1500; y < pt.y + 1500; y += 10) {
                        let check = this.pointWithin({ x: x, y: y });
                        gr.beginFill(check ? 0xff0000 : 0x00ff00).drawCircle(x, y, 4).endFill();
                    }
                }
                */

                //check to see if the clicked point is within the Tile
                if (pt == undefined || this.pointWithin(pt)) {
                    return this.trigger({ tokens: tokens, method: clicktype, pt: pt, options: { event: event } });
                }
            }
        }

        TileDocument.prototype.getIntersections = function (token, destination) {
            let triggerData = this.flags["monks-active-tiles"];

            if (!triggerData?.active) return [];

            if (triggerData.usealpha && !this.object._texturePolygon)
                this.object._findTextureBorder();
            if (CONFIG.debug.tiletriggers && triggerData.usealpha) {
                if (this.object._debugBorder)
                    this.object._debugBorder.destroy();
                this.object._debugBorder = this.object.addChild(new PIXI.Graphics());
                this.object._debugBorder.lineStyle(2, 0xff0000).drawPolygon(this.object._texturePolygon);
            }

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

            const cX = (Math.abs(this.width) / 2);
            const cY = (Math.abs(this.height) / 2);

            const tokenOffsetW = ((token.width ?? 0) * (token?.parent?.dimensions?.size ?? 0)) / 2;
            const tokenOffsetH = ((token.height ?? 0) * (token?.parent?.dimensions?.size ?? 0)) / 2;
            const tokenX1 = token.x + tokenOffsetW;
            const tokenY1 = token.y + tokenOffsetH;
            const tokenX2 = destination.x + tokenOffsetW;
            const tokenY2 = destination.y + tokenOffsetH;

            const tokenRay = new Ray(
                {
                    x: tokenX1 - (this.x + cX),
                    y: tokenY1 - (this.y + cY)
                },
                {
                    x: tokenX2 - (this.x + cX),
                    y: tokenY2 - (this.y + cY)
                });

            if (this.rotation != 0) {
                //rotate the point
                tokenRay.A = rotate(0, 0, tokenRay.A.x, tokenRay.A.y, this.rotation);
                tokenRay.B = rotate(0, 0, tokenRay.B.x, tokenRay.B.y, this.rotation);
            }

            tokenRay.A.x = (tokenRay.A.x / this.texture.scaleX) + cX;
            tokenRay.A.y = (tokenRay.A.y / this.texture.scaleY) + cY;
            tokenRay.B.x = (tokenRay.B.x / this.texture.scaleX) + cX;
            tokenRay.B.y = (tokenRay.B.y / this.texture.scaleY) + cY;

            // Check the bounding box first
            let segments = MonksActiveTiles.getTileSegments(this).filter(s => foundry.utils.lineSegmentIntersects(tokenRay.A, tokenRay.B, s.a, s.b));

            if (triggerData.usealpha) {
                !(tokenRay.A.x <= 0 || tokenRay.A.x >= Math.abs(this.width) || tokenRay.A.y <= 0 || tokenRay.A.y >= Math.abs(this.height))
                // only need to check the polygon if there are segments, or if both points are within the rectangle
                if (segments.length || 
                    !(tokenRay.A.x <= 0 || tokenRay.A.x >= Math.abs(this.width) || tokenRay.A.y <= 0 || tokenRay.A.y >= Math.abs(this.height)) || 
                    !(tokenRay.B.x <= 0 || tokenRay.B.x >= Math.abs(this.width) || tokenRay.B.y <= 0 || tokenRay.B.y >= Math.abs(this.height))) {
                    segments = MonksActiveTiles.getTileSegments(this, true).filter(s => foundry.utils.lineSegmentIntersects(tokenRay.A, tokenRay.B, s.a, s.b));
                }
            }

            let intersect = segments
                .map(s => {
                    let point = foundry.utils.lineSegmentIntersection(tokenRay.A, tokenRay.B, s.a, s.b);
                    let t0 = point.t0;
                    point = { x: (point.x - cX) * this.texture.scaleX, y: (point.y - cY) * this.texture.scaleY }
                    point = rotate(0, 0, point.x, point.y, this.rotation * -1);
                    point = { x: point.x + (this.x + cX), y: point.y + (this.y + cY) }
                    point.t0 = t0;
                    return point;
                });

            if (CONFIG.debug.tiletriggers) {
                let gr = MonksActiveTiles.debugGr;
                if (!gr) {
                    gr = new PIXI.Graphics();
                    MonksActiveTiles.debugGr = gr;
                    canvas.tokens.addChild(gr);
                }

                for (let pt of intersect) {
                    gr.lineStyle(2, 0x800080).drawCircle(pt.x, pt.y, 4);
                }
            }

            return intersect;
        }

        TileDocument.prototype.canTrigger = function (token) {
            let triggerData = this.flags["monks-active-tiles"];
            if (triggerData) {
                // prevent players from triggering a tile if the game is paused.
                if (setting("prevent-when-paused") && game.paused && !game.user.isGM && triggerData.allowpaused !== true)
                    return false;

                //check to see if this trigger is per token, and already triggered
                if (token && triggerData.pertoken && this.hasTriggered(token.id))
                    return false;

                //check to see if this trigger is restricted by token type
                if (token && ((triggerData.restriction == 'gm' && token.actor?.hasPlayerOwner) || (triggerData.restriction == 'player' && !token.actor?.hasPlayerOwner)))
                    return false;

                //check to see if this trigger is restricted by control type
                if (token && ((triggerData.controlled == 'gm' && !game.user.isGM) || (triggerData.controlled == 'player' && game.user.isGM)))
                    return false;

                //If this trigger has a chance of failure, roll the dice
                if (triggerData.chance == 0)
                    return false;

                if (triggerData.chance != 100) {
                    let chance = (Math.random() * 100);
                    if (chance > triggerData.chance) {
                        log(`trigger failed with ${chance}% out of ${triggerData.chance}%`);
                        return false;
                    } else
                        log(`trigger passed with ${chance}% out of ${triggerData.chance}%`);
                }

                return true;
            }
        }

        TileDocument.prototype.getTriggerPoints = function (when, token, collision, source, destination) {
            let triggerData = this.flags["monks-active-tiles"];
            if (triggerData) {
                let tokenMidX = ((token.width * token.parent.dimensions.size) / 2);
                let tokenMidY = ((token.height * token.parent.dimensions.size) / 2);
                //is the token currently in the tile
                let tokenPos = { x: (when == 'stop' ? destination.x : token.x) + tokenMidX, y: (when == 'stop' ? destination.y : token.y) + tokenMidY };
                let inTile = this.pointWithin(tokenPos);

                //go through the list, alternating in/out until we find one that satisfies the on enter/on exit setting, and if it does, return the trigger point.
                if (when == 'movement') {
                    if (collision.length > 1)
                        //movement is an enter an exit, so take the start and end points
                        return { x: collision[0].x, y: collision[0].y, x2: collision[collision.length - 1].x, y2: collision[collision.length - 1].y, method: 'movement' };
                    else if (collision.length == 1) {
                        if (inTile)
                            // movement is an exit
                            return { x: source.x + tokenMidX, y: source.y + tokenMidY, x2: collision[0].x, y2: collision[0].y, method: 'movement' };
                        else
                            // movement is coming into the tile, so start at the entry point, and exit at the destination
                            return { x: collision[0].x, y: collision[0].y, x2: destination.x + tokenMidX, y2: destination.y + tokenMidY, method: 'movement' };
                    } else {
                        // movement is within the tile
                        return { x: source.x + tokenMidX, y: source.y + tokenMidY, x2: destination.x + tokenMidX, y2: destination.y + tokenMidY, method: 'movement' };
                    }
                } else if (when == 'elevation' || when == 'create' || when == 'rotation') {
                    return { x: source.x + tokenMidX, y: source.y + tokenMidY, method: when };
                } else if (when == 'stop') {
                    if (inTile)
                        return { x: destination.x, y: destination.y, method: 'stop' };
                } else {
                    //let idx = ((inTile ? 0 : 1) - (when == 'enter' ? 1 : 0));
                    let pos = { method: when };
                    if (when == 'exit' && collision.length > 1) {
                        pos.x = collision[collision.length - 1].x;
                        pos.y = collision[collision.length - 1].y;
                    } else {
                        pos.x = collision[0].x;
                        pos.y = collision[0].y;
                    }
                    return pos;
                }

                return null;
            }
        }

        /*
        TileDocument.prototype.preloadScene = function () {
            let actions = this.flags["monks-active-tiles"]?.actions || [];
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
            let triggers = MonksActiveTiles.getTrigger(getProperty(this, "flags.monks-active-tiles.trigger"));
            if (triggers.includes('movement'))
                return { stop: false };
            let stopmovement = false;
            let stoppage = this.flags['monks-active-tiles'].actions.filter(a => {
                if (a.action == 'movement')
                    stopmovement = true;
                return MonksActiveTiles.triggerActions[a.action].stop === true;
            });
            return { stop: stoppage.length != 0, snap: stoppage.find(a => a.data?.snap), coolDown: stopmovement };
            //return (stoppage.length == 0 ? { stop: false } : (stoppage.find(a => a.data?.snap) ? 'snap' : true));
        }

        TileDocument.prototype.trigger = async function ({ tokens = [], userid = game.user.id, method, pt, options = {} } = {}) {
            if (MonksActiveTiles.allowRun) {
                let triggerData = this.flags["monks-active-tiles"];

                if (triggerData == undefined) return;
                //if (this.flags["monks-active-tiles"]?.pertoken)
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

                for (let tkn of tokens) {
                    setProperty(tkn, "flags.monks-active-tiles.triggerPt", pt);
                }

                //A token has triggered this tile, what actions do we need to do
                let values = [];
                let value = Object.assign({ tokens: tokens }, options);
                let context = Object.assign({ tile: this, tokens: tokens, userid: userid, values: values, value: value, method: method, pt: pt }, options);
                if (options.event)
                    context.event = options.event;

                let direction = {};
                if (!!pt && !!pt.x && !!pt.y) {
                    let tokenRay;
                    if (!tokens.length) {
                        let midTile = { x: this.x + (Math.abs(this.width) / 2), y: this.y + (Math.abs(this.height) / 2) };
                        tokenRay = new Ray({ x: midTile.x, y: midTile.y }, { x: pt.x, y: pt.y });
                    } else {
                        tokenRay = new Ray({ x: options.src?.x || tokens[0].x, y: options.src?.y || tokens[0].y }, { x: options.original?.x || pt.x, y: options.original?.y || pt.y });
                    }

                    direction.y = ((tokenRay.angle == 0 || tokenRay.angle == Math.PI) ? "" : (tokenRay.angle < 0 ? "up" : "down"));
                    direction.x = ((Math.abs(tokenRay.angle) == (Math.PI / 2)) ? "" : (Math.abs(tokenRay.angle) < (Math.PI / 2) ? "right" : "left"));
                    //log("Direction", tokenRay.angle, tokenRay, direction, tokens[0].x, tokens[0].y);
                    value.direction = direction;
                }

                let rotation = null;
                if (tokens.length) {
                    rotation = options.rotation ?? tokens[0].rotation;
                }

                let actions = triggerData?.actions || [];
                let start = 0;

                if (options.landing) {
                    start = actions.findIndex(a => a.action == "anchor" && a.data.tag == options.landing) + 1;
                }

                if (start == 0) {
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
                            } else if (rotation != undefined && anchor.data.tag == `_rotation${rotation}`) {
                                start = actions.findIndex(a => a.id == anchor.id) + 1;
                                break;
                            }
                        }
                    }
                }

                let actionResult = await this.runActions(context, Math.max(start, 0));

                for (let tkn of tokens) {
                    setProperty(tkn, "flags.monks-active-tiles.triggerPt", null);
                }

                return actionResult;
            } else {
                //post this to the GM
                let tokenData = tokens.map(t => (t?.document?.uuid || t?.uuid));
                if (options.walls) {
                    options.walls = options.walls.map(w => (w?.document?.uuid || w?.uuid));
                }
                delete options.event;
                MonksActiveTiles.emit('trigger', { tileid: this.uuid, tokens: tokenData, method: method, pt: pt, options: options } );
            }
        }

        TileDocument.prototype.runActions = async function (context, start = 0, resume = null) {
            if (context._id == undefined)
                context._id = makeid();
            let actions = this.flags["monks-active-tiles"]?.actions || [];
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
                if (resume != undefined)
                    context.tokens = resume.tokens || context.tokens;
                let fn = trigger.fn;
                if (fn) {
                    //If there are batch actiosn to complete and this function is not batchable, then execute the changes
                    if (!trigger.batch)
                        await MonksActiveTiles.batch.execute();

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
                                                context.value = mergeObject(context.value, res);
                                            }
                                        }
                                    } else
                                        context.value = mergeObject(context.value, result);
                                    delete context.value.goto;
                                    context.values.push(mergeObject(result, { action: action }));

                                    if (result.pause) {
                                        debug("Pausing actions");
                                        //Execute any batch actions before pausing
                                        await MonksActiveTiles.batch.execute();

                                        MonksActiveTiles.savestate[context._id] = context;
                                        result = { continue: false };
                                        pausing = true;
                                    }

                                    if (result.runbatch) {
                                        await MonksActiveTiles.batch.execute();
                                        delete result.runbatch;
                                    }

                                    if (result.goto) {
                                        if (result.goto instanceof Array) {
                                            result.continue = false;
                                            for (let goto of result.goto) {
                                                if (this.getFlag('monks-active-tiles', 'active') !== false) {
                                                    debug("Jumping to Landing", goto.tag);
                                                    let idx = actions.findIndex(a => a.action == 'anchor' && a.data.tag == goto.tag);
                                                    if (idx != -1) {
                                                        let gotoContext = Object.assign({}, context);
                                                        gotoContext = mergeObject(gotoContext, { value: goto });
                                                        gotoContext._id = makeid();
                                                        await this.runActions(gotoContext, idx + 1);
                                                    }
                                                } else {
                                                    debug("Skipping landing due to Tile being inactive", goto.tag);
                                                }
                                            }
                                        } else {
                                            //find the index of the tag
                                            debug("Jumping to Landing", result.goto);
                                            let idx = actions.findIndex(a => a.action == 'anchor' && a.data.tag == result.goto);
                                            if (idx != -1)
                                                i = idx;
                                            else {
                                                // try and find _failedlanding
                                                idx = actions.findIndex(a => a.action == 'anchor' && a.data.tag == "_failedlanding");
                                                if (idx != -1)
                                                    i = idx;
                                            }
                                        }
                                    }

                                    result = result.continue;
                                }
                                let cancontinue = await Hooks.call("triggerTile", this, this, context.tokens, context.action, context.userid, context.value);
                                if (result === false || cancontinue === false || this.getFlag('monks-active-tiles', 'active') === false || this.getFlag('monks-active-tiles', 'continue') === false) {
                                    this.unsetFlag('monks-active-tiles', 'continue');
                                    //if (this._resumeTimer && !pausing)
                                    //    window.clearTimeout(this._resumeTimer);
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

            await MonksActiveTiles.batch.execute();

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
            let tileHistory = (this.flags["monks-active-tiles"]?.history || {});
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
            //let tileHistory = (this.flags["monks-active-tiles"]?.history || {});
            //return Object.entries(tileHistory).length;

            let tileHistory = (this.flags["monks-active-tiles"]?.history || {});
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
            let tileHistory = this.flags["monks-active-tiles"]?.history || {};
            let data = { id: makeid(), who: userid, how: method, when: Date.now() };
            if (!tileHistory[tokenid])
                tileHistory[tokenid] = { tokenid: tokenid, triggered: [data] };
            else
                tileHistory[tokenid].triggered.push(data);

            //this.flags = mergeObject(this.flags, { "monks-active-tiles.history": tileHistory }); //Due to a race condition we need to set the actual value before trying to save it

            try {
                await this.setFlag("monks-active-tiles", "history", duplicate(this.flags["monks-active-tiles"]?.history || tileHistory));
                canvas.perception.update({
                    refreshLighting: true,
                    refreshSounds: true,
                    initializeVision: true,
                    refreshVision: true,
                    refreshTiles: true,
                    forceUpdateFog: true
                }, true);
            } catch {}
        }

        TileDocument.prototype.removeHistory = async function (id) {
            let tileHistory = duplicate(this.flags["monks-active-tiles"]?.history || {});
            for (let [k, v] of Object.entries(tileHistory)) {
                let item = v.triggered.findSplice(h => h.id == id);
                if (item != undefined) {
                    this.flags = mergeObject(this.flags, { "monks-active-tiles.history": tileHistory }); //Due to a race condition we need to set the actual value before trying to save it
                    await this.setFlag("monks-active-tiles", "history", tileHistory);
                    break;
                }
            }
        }

        TileDocument.prototype.resetHistory = async function (tokenid) {
            //let tileHistory = duplicate(this.flags["monks-active-tiles"]?.history || {});
            if (tokenid == undefined) {
                this.flags["monks-active-tiles"].history = {};
                await this.update({ [`flags.monks-active-tiles.-=history`]: null }, { render: false });
            } else {
                if (this.flags["monks-active-tiles"].history != undefined)
                    delete this.flags["monks-active-tiles"].history[tokenid];
                let key = `flags.monks-active-tiles.history.-=${tokenid}`;
                let updates = {};
                updates[key] = null;
                await this.update(updates, { render: false });
            }
        }

        TileDocument.prototype.getHistory = function (tokenid) {
            let tileHistory = (this.flags["monks-active-tiles"]?.history || {});
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
        let triggerData = this.object.document.flags["monks-active-tiles"];

        if (triggerData == undefined) return;

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
            if (localize) label = game.i18n.has(label) ? game.i18n.localize(label) : label;
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

    static saveTemplate() {
        Dialog.confirm({
            title: "Name of Template",
            content: `
<form>
    <div class="form-group">
        <label for= "name" >Template Name</label >
        <div class="form-fields">
            <input type="text" name="name" />
        </div>
    </div>
</form>`,
            yes: async (html) => {
                const form = html[0].querySelector("form");
                if (form) {
                    const fd = new FormDataExtended(form);
                    if (!fd.object.name)
                        return ui.notifications.error("Tile templates require a name");

                    let templates = setting("tile-templates") || [];
                    let data = this.object.toObject();
                    data._id = data.id = randomID();
                    data.name = fd.object.name;
                    data.visible = true;
                    delete data.img;
                    data.img = data.texture.src;
                    data.thumbnail = data.img || "modules/monks-active-tiles/img/cube.svg";
                    if (VideoHelper.hasVideoExtension(data.thumbnail)) {
                        const t = await ImageHelper.createThumbnail(data.thumbnail, { width: 60, height: 60 });
                        data.thumbnail = t.thumb;
                    }
                    templates.push(data);
                    game.settings.set("monks-active-tiles", "tile-templates", templates);
                    ui.notifications.info("Tile information has been saved to Tile Templates.");
                    new TileTemplates().render(true);
                }
            },
            options: {
                width: 400
            }
        }
        );
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
    if (!setting("fix-imagecycle")) {
        MonksActiveTiles.fixImageCycle();
        game.settings.set("monks-active-tiles", "fix-imagecycle", true);
    }
});

Hooks.on('createToken', async (document, options, userId) => {
    for (let tile of document.parent.tiles) {
        let triggerData = getProperty(tile, "flags.monks-active-tiles") || {};
        let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);
        if (triggerData?.active && triggerData.actions?.length > 0 && triggers.includes('create')) {
            let token = document.object;

            if (game.modules.get("levels")?.active && CONFIG.Levels.API && CONFIG.Levels.API.isTokenInRange && !CONFIG.Levels.API.isTokenInRange(token, tile._object))
                continue;

            //check and see if the ray crosses a tile
            let pt = { x: document.x + ((document.height * document.parent.dimensions.size) / 2), y: document.y + ((document.height * document.parent.dimensions.size) / 2) };
            if (tile.canTrigger(document) && tile.pointWithin(pt)) {
                tile.trigger({ tokens: [document], method: 'create', pt: pt });
            }
        }
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
    if ((update.x != undefined || update.y != undefined || update.elevation != undefined || update.rotation != undefined) && options.bypass !== true && options.animate !== false) { //(!game.modules.get("drag-ruler")?.active || options.animate)) {
        let token = document.object;

        if ((document.caught || document.getFlag('monks-active-tiles', 'teleporting')) && !options.teleport) {
            //do not update x/y if the token is under a cool down period, or if it is teleporting.
            delete update.x;
            delete update.y;
            return;
        }

        //log('triggering for', token.id);
        let gr = new PIXI.Graphics();
        if (MonksActiveTiles.debugGr)
            canvas.tokens.removeChild(MonksActiveTiles.debugGr);
        MonksActiveTiles.debugGr = gr;
        canvas.tokens.addChild(gr);

        //Does this cross a tile
        for (let tile of document.parent.tiles) {
            if (options.originaltile === tile.id)
                continue;

            let triggerData = tile.flags["monks-active-tiles"] || {};
            let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);
            if (triggerData?.active && triggerData.actions?.length > 0) {
                if (game.modules.get("levels")?.active && CONFIG.Levels.API && CONFIG.Levels.API.isTokenInRange && !CONFIG.Levels.API.isTokenInRange(token, tile._object))
                    continue;

                //check and see if the ray crosses a tile
                let src = { x: document.x, y: document.y };
                let tokenMidX = ((document.width * document.parent.dimensions.size) / 2);
                let tokenMidY = ((document.height * document.parent.dimensions.size) / 2);
                let tokenPos = { x: document.x + tokenMidX, y: document.y + tokenMidY };

                let start = { x: document.x, y: document.y };
                let dest = { x: update.x || document.x, y: update.y || document.y };
                let elevation = update.elevation ?? document.elevation;
                let rotation = update.rotation ?? document.rotation;

                if (!tile.canTrigger(document))
                    continue;

                let contains = tile.pointWithin(tokenPos);

                // Elevation and Create happen immediate, the others all have a delay
                let availableTriggers = ["elevation", "rotation", "enter", "movement", "stop", "exit"].filter(t => triggers.includes(t));

                if (update.rotation == undefined || !contains)
                    availableTriggers.findSplice(t => t == "rotation");

                if (update.elevation == undefined || !contains)
                    availableTriggers.findSplice(t => t == "elevation");

                if (update.x == undefined && update.y == undefined) {
                    availableTriggers.findSplice(t => t == "enter");
                    availableTriggers.findSplice(t => t == "movement");
                    availableTriggers.findSplice(t => t == "exit");
                    availableTriggers.findSplice(t => t == "stop");
                }

                if (availableTriggers.length == 0)
                    continue;

                let collisions;
                if (availableTriggers.includes('enter') || availableTriggers.includes('exit') || availableTriggers.includes('movement') || availableTriggers.includes('stop')) {
                    if (contains) {
                        availableTriggers.findSplice(t => t == "enter");
                        availableTriggers.findSplice(t => t == "stop");
                    }

                    if (availableTriggers.length == 0)
                        continue;

                    if (availableTriggers.length > 0) {
                        collisions = tile.getIntersections(document, dest);
                        if (collisions.length == 0) {
                            availableTriggers.findSplice(t => t == "enter");
                            availableTriggers.findSplice(t => t == "exit");
                            availableTriggers.findSplice(t => t == "stop");
                            if (!contains)
                                availableTriggers.findSplice(t => t == "movement");
                        } else {
                            //sort by closest
                            let sorted = (collisions.length > 1 ? collisions.sort((c1, c2) => (c1.t0 > c2.t0) ? 1 : -1) : collisions);

                            //clear out any duplicate corners
                            collisions = sorted.filter((value, index, self) => {
                                return self.findIndex(v => v.x === value.x && v.y === value.y) === index;
                            });

                            if (collisions.length == 1) {
                                if (contains) {
                                    availableTriggers.findSplice(t => t == "enter");
                                    availableTriggers.findSplice(t => t == "stop");
                                } else
                                    availableTriggers.findSplice(t => t == "exit");
                            } else
                                availableTriggers.findSplice(t => t == "stop");
                        }
                        //log("Collisions", collisions);
                    }
                }

                if (availableTriggers.length == 0)
                    continue;

                log("Available triggers", availableTriggers);
                let doTrigger = async function (idx) {
                    if (idx >= availableTriggers.length)
                        return; // We've worked through all the triggers

                    let when = availableTriggers[idx];
                    let triggerPt = tile.getTriggerPoints(when, document, collisions, start, dest);

                    if (when == "movement") {
                        if (CONFIG.debug.tiletriggers) {
                            gr.lineStyle(2, 0x800080)
                                .moveTo(triggerPt.x, triggerPt.y)
                                .lineTo(triggerPt.x2, triggerPt.y2);
                        }
                    } else if (when == "enter" || when == "exit") {
                        if (triggerPt == undefined || (triggerPt.x == tokenPos.x && triggerPt.y == tokenPos.y)) {
                            // move on to the next trigger because being on the line does not trigger an enter or exit.
                            // or it's an enter or exit, and there's not a coresponding triggering point
                            return doTrigger(idx + 1);
                        }
                    } else if (when == "elevation") {
                        if (CONFIG.debug.tiletriggers)
                            gr.beginFill(0x00ffff).drawCircle(triggerPt.x, triggerPt.y, 4).endFill();
                    }

                    //if it does and the token needs to stop, then modify the end position in update
                    let endPt = { x: triggerPt.x - tokenMidX, y: triggerPt.y - tokenMidY };

                    let stop = tile.checkStop();

                    //log('Triggering tile', update, stop);
                    let original = { x: update.x || document.x, y: update.y || document.y };
                    if (stop.stop) {
                        //check for snapping to the closest grid spot
                        if (stop.snap) {
                            // if it's entering or exiting, then we need to nudge it into the correct square
                            let snapPoint = Ray.towardsPoint(endPt, dest, document.parent.dimensions.size / 3);
                            endPt = mergeObject(endPt, canvas.grid.getSnappedPosition(snapPoint.B.x, snapPoint.B.y));
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
                            let updateDate = {};
                            if (endPt.x || endPt.x == 0) updateDate.x = endPt.x;
                            if (endPt.y || endPt.y == 0) updateDate.y = endPt.y;
                            if (updateDate.x != undefined || updateData.y != undefined)
                                await document.update(updateDate, { bypass: true });
                        } else {
                            if (endPt.x || endPt.x == 0) update.x = endPt.x;
                            if (endPt.y || endPt.y == 0) update.y = endPt.y;
                            //options.bypass = true;
                        }
                    }
                    
                    if (when == "elevation" || when == "rotation") {
                        // rotation and elevation fire immediately
                        tile.trigger({ tokens: [document], method: when, pt: triggerPt, options: { original, elevation, rotation, src: start } });
                        doTrigger(idx + 1);
                    } else {
                        //calculate how much time until the token reaches the trigger point, and wait to call the trigger
                        let ray = new Ray({ x: start.x, y: start.y }, { x: triggerPt.x2 ?? triggerPt.x, y: triggerPt.y2 ?? triggerPt.y });  // This isn't exactly accurate, but I want the trigger to happen when the trigger point is crossed, not the final destination
                        const s = document.parent.dimensions.size;
                        const speed = s * 6;
                        const duration = (ray.distance * 1000) / speed;

                        //log('Tile has registered', when, duration, start, triggerPt, document);

                        if (duration <= 0) {
                            tile.trigger({ tokens: [document], method: when, pt: triggerPt, options: { original, elevation, rotation, src: start } });
                            doTrigger(idx + 1);
                        } else {
                            // We need to fire when the token gets to the trigger point
                            window.setTimeout(function () {
                                //log('Tile is triggering', when, document);
                                tile.trigger({ tokens: [document], method: triggerPt.method, pt: triggerPt, options: { original, elevation, rotation, src: start } });
                                start.x = triggerPt.x2 ?? triggerPt.x;
                                start.y = triggerPt.y2 ?? triggerPt.y;
                                if (!(stop.stop && when == "enter")) //If this fires on Enter, and a stop is request then we don't need to run the On Exit code.
                                    doTrigger(idx + 1);
                            }, duration);
                        }

                        //return duration;
                    }
                }
                doTrigger(0);

                /*
                if (collision.length > 0) {
                    let tpts = tile.getTriggerPoints(document, collisions, dest);
                    if (tpts) {
                        let doTrigger = async function (idx) {
                            if (idx >= tpts.length)
                                return;

                            let triggerPt = tpts[idx];
                            let pt = { x: triggerPt.x + ((document.height * document.parent.dimensions.size) / 2), y: triggerPt.y + ((document.height * document.parent.dimensions.size) / 2) };

                            //if it does and the token needs to stop, then modify the end position in update
                            let ray = new Ray({ x: document.x, y: document.y }, { x: triggerPt.x, y: triggerPt.y });

                            let stop = tile.checkStop();

                            //log('Triggering tile', update, stop);
                            let original = { x: update.x || document.x, y: update.y || document.y };
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

                            //calculate how much time until the token reaches the trigger point, and wait to call the trigger
                            const s = document.parent.dimensions.size;
                            const speed = s * 6;
                            const duration = (ray.distance * 1000) / speed;

                            window.setTimeout(function () {
                                log('Tile is triggering', document);
                                tile.trigger({ tokens: [document], method: triggerPt.method, pt: pt, options: { original, src } });
                                if(!stop.stop)   //If this fires on Enter, and a stop is request then we don't need to run the On Exit code.
                                    doTrigger(idx + 1);
                            }, duration);

                            return duration;
                        }

                        //Do this so Enter/Exit will both fire.  But we have to wait for the Enter to finish first.
                        doTrigger(0);
                    }
                }
                */
            }
        }
    }
});

Hooks.on("preUpdateCombat", async function (combat, delta) {
    if (combat.started && game.user.isGM && combat.scene) {
        for (let tile of combat.scene.tiles) {
            let triggerData = tile.flags["monks-active-tiles"] || {};
            let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);
            if (triggerData?.active && triggerData.actions?.length > 0 &&
                ((delta.turn || delta.round) && triggers.includes('turnend'))) {
                let tokens = [combat.combatant.token];
                tile.trigger({ tokens: tokens, method: 'turnend' });
            }
        }
    }
});

Hooks.on("updateCombat", async function (combat, delta) {
    if (combat.started && game.user.isGM && combat.scene) {
        for (let tile of combat.scene.tiles) {
            let triggerData = tile.flags["monks-active-tiles"];
            let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);
            if (triggerData?.active && triggerData.actions?.length > 0) {
                if (delta.round && triggers.includes('round')) {
                    let tokens = combat.combatants.map(c => c.token);
                    tile.trigger({ tokens: tokens, method: 'round' });
                }
                if ((delta.turn || delta.round) && triggers.includes('turn')) {
                    let tokens = [combat.combatant.token];
                    tile.trigger({ tokens: tokens, method: 'turn' });
                }
                if (delta.round == 1 && combat.turn == 0 && triggers.includes('combatstart')) {
                    let tokens = combat.combatants.map(c => c.token);
                    tile.trigger({ tokens: tokens, method: 'combatstart' });
                }
            }
        }
    }
});

Hooks.on("deleteCombat", async function (combat, delta) {
    if (combat.started && game.user.isGM && combat.scene) {
        for (let tile of combat.scene.tiles) {
            let triggerData = tile.flags["monks-active-tiles"];
            let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);
            if (triggerData?.active && triggerData.actions?.length > 0 && triggers.includes('combatend')) {
                let tokens = combat.combatants.map(c => c.token);
                tile.trigger({ tokens: tokens, method: 'combatend' });
            }
        }
    }
});

Hooks.on('preCreateChatMessage', async (document, data, options, userId) => {
    if (document.getFlag('monks-active-tiles', 'language')) {
        setProperty(data, "flags.polyglot.language", document.getFlag('monks-active-tiles', 'language'));
        //document.update({ "flags.polyglot.language": document.getFlag('monks-active-tiles', 'language') });
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

Hooks.on("renderPlaylistDirectory", (app, html, user) => {
    $('li.sound', html).click(MonksActiveTiles.selectPlaylistSound.bind(this));
});

Hooks.on("renderWallConfig", async (app, html, options) => {
    if (setting("allow-door")) {
        let entity = app.object.flags['monks-active-tiles']?.entity || {};
        if (typeof entity == "string" && entity)
            entity = JSON.parse(entity);
        let tilename = "";
        if (entity.id)
            tilename = entity.id == "within" ? i18n("MonksActiveTiles.WithinWall") : await MonksActiveTiles.entityName(entity);
        let triggerData = mergeObject({ tilename: tilename, showtagger: game.modules.get('tagger')?.active }, (app.object.flags['monks-active-tiles'] || {}));
        triggerData.entity = JSON.stringify(entity);
        let wallHtml = await renderTemplate("modules/monks-active-tiles/templates/wall-config.html", triggerData);

        if ($('.sheet-tabs', html).length) {
            $('.sheet-tabs', html).append($('<a>').addClass("item").attr("data-tab", "triggers").html('<i class="fas fa-running"></i> Triggers'));
            $('<div>').addClass("tab action-sheet").attr('data-tab', 'triggers').html(wallHtml).insertAfter($('.tab:last', html));
        } else {
            let root = $('form', html);
            if (root.length == 0)
                root = html;
            let basictab = $('<div>').addClass("tab").attr('data-tab', 'basic');
            $('> *:not(button):not(footer)', root).each(function () {
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
        $('button[data-type="within"]', html).on("click", (event) => {
            let btn = $(event.currentTarget);
            $('input[name="' + btn.attr('data-target') + '"]', app.element).val('{"id":"within","name":"' + i18n("MonksActiveTiles.WithinWall") + '"}').next().html(i18n("MonksActiveTiles.WithinWall"));
        });

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
        let item = await fromUuid(data.uuid);

        if (!item)
            return ui.notifications.warn("Could not find item");

        //Create Tile
        //change the Tile Image to the Item image
        //Add the actions to Hide the Tile, Disabled the Tile, and Add the Item to Inventory
        let size = canvas.scene.dimensions.size * setting("drop-item-size");
        let dest = { x: data.x - (size / 2), y: data.y - (size / 2) };

        let td = mergeObject(dest, {
            img: item.img,
            width: size,
            height: size,
            flags: {
                'monks-active-tiles': {
                    "active": true,
                    "restriction": "all",
                    "controlled": "all",
                    "trigger": "click",
                    "pertoken": false,
                    "minrequired": 0,
                    "chance": 100,
                    "actions": [
                        { "action": "distance", "data": { "measure": "eq", "distance": { "value": 1, "var": "sq" }, "continue": "always", "entity": "" }, "id": "UugwKEORHARYwcS2" },
                        { "action": "exists", "data": { "entity": "", "collection": "tokens", "count": "> 0", "none": "NotCloseEnough" }, "id": "Tal2G8WXfo3xmL5U" },
                        { "action": "first", "id": "dU81VsGaWmAgLAYX" },
                        { "action": "showhide", "data": { "entity": { "id": "tile", "name": "This Tile" }, "hidden": "hide" }, "id": "UnujCziObnW2Axkx" },
                        { "action": "additem", "data": { "entity": "", "item": { "id": item.uuid, "name": "" } }, "id": "IwxJOA8Pi287jBbx" },
                        { "action": "notification", "data": { "text": "{{value.items.0.name}} has been added to {{value.tokens.0.name}}'s inventory", "type": "info", "showto": "token" }, "id": "oNx3QqEi0WpxfkhV" },
                        { "action": "activate", "data": { "entity": "", "activate": "deactivate" }, "id": "6K7aEZH8SnGv3Gyq" },
                        { "action": "anchor", "data": { "tag": "NotCloseEnough", "stop": true }, "id": "9Pi17j10WPrzAFeq" },
                        { "action": "notification", "data": { "text": "Not close enough to pick up this item", "type": "warning", "showto": "token" }, "id": "Unr31Z6iM2P2U7VC" }
                    ]
                }
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

    $("<button>").attr("type", "button").attr("title", "Save as Template").css({ "flex": "0 0 34px" }).html('<i class="fas fa-save" style="margin-right: 0px;"></i>').insertBefore($('button[type="submit"]', html)).on("click", MonksActiveTiles.saveTemplate.bind(app));
});

Hooks.on("canvasReady", () => {
    $('#board').css({ 'cursor': '' });
    MonksActiveTiles.hoveredTiles = new Set();
    for (let tile of canvas.scene.tiles) {
        let triggerData = tile.flags["monks-active-tiles"];
        let triggers = MonksActiveTiles.getTrigger(triggerData?.trigger);
        if (triggerData?.active && triggers.includes("ready")) {
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
    if (update?.texture?.src != undefined || getProperty(update, "flags.monks-active-tiles.usealpha") != undefined) {
        let triggerData = document.flags["monks-active-tiles"];
        if (triggerData?.usealpha) {
            window.setTimeout(function () {
                document.object._findTextureBorder();
            }, 500);
        }
    }
});

Hooks.on('preUpdateWall', async (document, update, options, userId) => {
    if (update.door != undefined && (document.door == 2 || update.door == 2))
        document._wallchange = "secret";

    if (update.ds != undefined) {
        if (document.ds == 2 || update.ds == 2)
            document._wallchange = "lock";
        else if (update.ds == 0)
            document._wallchange = "close";
        else if (update.ds == 1)
            document._wallchange = "open";
    }

    let entity = getProperty(update, "flags.monks-active-tiles.entity");
    if (!!entity && typeof entity == "string") {
        setProperty(update, "flags.monks-active-tiles.entity", JSON.parse(entity));
    }
});

Hooks.on("globalAmbientVolumeChanged", (volume) => {
    if (!game.modules.get("monks-sund-enhancements")?.active) {
        for (let tile of canvas.scene.tiles) {
            for (let sound of Object.values(tile.soundeffect || {})) {
                if (sound.effectiveVolume) {
                    sound.volume = volume * (sound.effectiveVolume ?? 1);
                }
            }
        }
    }
});

Hooks.on("globalSoundEffectVolumeChanged", (volume) => {
    for (let tile of canvas.scene.tiles) {
        for (let sound of Object.values(tile.soundeffect || {})) {
            if (sound.effectiveVolume) {
                sound.volume = volume * (sound.effectiveVolume ?? 1);
            }
        }
    }
});

Hooks.on("refreshTile", (tile) => {
    if (tile.bg && !tile.bg._destroyed) {
        const aw = Math.abs(tile.document.width);
        const ah = Math.abs(tile.document.height);
        const r = Math.toRadians(tile.document.rotation);

        tile.bg.position.set(aw / 2, ah / 2);
        tile.bg.clear().beginFill(0xFFFFFF, 0.5).drawRect(-(aw / 2), -(ah / 2), aw, ah).endFill();
        tile.bg.rotation = r;
    }

    if (tile._transition && tile.mesh.visible) {
        tile.mesh.visible = false;
    }

    if (tile._animationAttributes && tile._animationAttributes.alpha && tile?.mesh?.alpha != tile._animationAttributes.alpha) {
        tile.mesh.alpha = tile._animationAttributes.alpha;
    }
});

Hooks.on("refreshToken", (token) => {
    if (token._showhide) {
        token.mesh.alpha = this._showhide;
        token.mesh.visible = true;
        token.visible = true;
    }
});

Hooks.on("getSceneControlButtons", (controls) => {
    if (game.user.isGM) {
        let tileControls = controls.find(control => control.name === "tiles")
        tileControls.tools.push({
            name: "templates",
            title: "MonksActiveTiles.TileTemplates",
            icon: "fas fa-folder-tree",
            onClick: async () => {
                new TileTemplates().render(true);
            },
            button: true
        });
    }
});

Hooks.once("MultipleDocumentSelection.ready", (dirs) => {
    dirs.push(TileTemplates);
})

Hooks.on("renderJournalSheet", (sheet, html, data) => {
    $("a.tile-trigger-link", html).unbind("click").click(MonksActiveTiles._onClickTileLink.bind(sheet));
});

Hooks.on("renderJournalPageSheet", (sheet, html, data) => {
    $("a.tile-trigger-link", html).unbind("click").click(MonksActiveTiles._onClickTileLink.bind(sheet));
});

Hooks.on("renderItemSheet", (sheet, html, data) => {
    $("a.tile-trigger-link", html).unbind("click").click(MonksActiveTiles._onClickTileLink.bind(sheet));
});