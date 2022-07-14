import { MonksActiveTiles, log, error, setting, i18n, makeid } from '../monks-active-tiles.js';

export class BatchManager {
    constructor() {
        this.commands = new Map();
    }

    get hasChanges() {
        return this.commands.size > 0;
    }

    add(command, entity, data = {}, options = {}) {
        if (!["create", "update", "delete"].includes(command)) {
            error("Invalid command passed to batch manager: " + command);
            return;
        }

        let getMap = function (parent, child) {
            let map = parent.get(child);
            if (!map) {
                map = new Map();
                parent.set(child, map);
            }
            return map;
        }

        let cmd = getMap(this.commands, command); //get the list of classes under this command

        if (typeof entity == "string") {
            entity = options.parent.constructor.metadata.embedded[entity]?.implementation;
        }

        let classes = getMap(cmd, (command == "create" ? entity : entity.constructor)); //get the list of parent classes
        let parents = getMap(classes, options?.parent || entity.parent); //get list of any specific option updates
        if (options?.parent)
            delete options.parent;
        let opts = JSON.stringify(options);
        let updates = getMap(parents, opts); //split class changes based on the options being passed, to differentiate between parents and specific options to the call
        let update = (command == "create" ? {} : updates.get(entity.id)) || {};

        if (command !== "create")
            data = Object.assign(data, { _id: entity.id });
        updates.set((command == "create" ? "create" + makeid() : entity.id), Object.assign(update, data));  //if we're creating an object then give it a fake id so that it doesn't merge with any other objects
    }

    async execute() {
        if (!this.hasChanges)
            return new Promise((resolve) => { resolve(); });

        let promises = [];

        for (let command of ["create", "update", "delete"]) {
            let classes = this.commands.get(command);
            if (!classes)
                continue;

            for (let [cls, parents] of classes) {
                for (let [parent, clsopt] of parents) {
                    for (let [options, updates] of clsopt) {
                        let cmds = [];
                        for (let [id, data] of updates) {
                            if (command == "delete")
                                cmds.push(id);
                            else if (Object.keys(data).length > 1) //only push the data if there's something changing
                                cmds.push(data);
                        }
                        if (cmds.length == 0)
                            continue;

                        options = (options || "{}");
                        options = JSON.parse(options);
                        options.parent = parent;
                        promises.push(cls[`${command}Documents`](cmds, options));
                    }
                }
            }
        }
        this.commands.clear();

        return Promise.all(promises);
    }

    mergeResults(results) {
        return [].concat.apply([], results);
    }
}