/*export const WithActiveTile = (Tile) => {
    class ActiveTile extends Tile {
        constructor(...args) {
            super(...args);
        }

        normalize() {
            if (this.getFlag("monks-active-tiles", "trigger-chance") == undefined)
                this.setFlag("monks-active-tiles", "trigger-chance", 100);
            if (this.getFlag("monks-active-tiles", "restriction") == undefined)
                this.setFlag("monks-active-tiles", "restriction", 'all');
            if (this.getFlag("monks-active-tiles", "actions") == undefined)
                this.setFlag("monks-active-tiles", "actions", []);
        }
    }

    const constructorName = "ActiveTile";
    Object.defineProperty(ActiveTile.prototype.constructor, "name", { value: constructorName });
    return ActiveTile;
};*/

export class ActiveTile extends Tile {
    constructor(...args) {
        super(...args);
    }

    normalize() {
        if (this.getFlag("monks-active-tiles", "trigger-chance") == undefined)
            this.setFlag("monks-active-tiles", "trigger-chance", 100);
        if (this.getFlag("monks-active-tiles", "restriction") == undefined)
            this.setFlag("monks-active-tiles", "restriction", 'all');
        if (this.getFlag("monks-active-tiles", "actions") == undefined)
            this.setFlag("monks-active-tiles", "actions", []);
    }
}

//+++ when created, trigger chance needs to be set to 100
//+++ restriction = 'all'