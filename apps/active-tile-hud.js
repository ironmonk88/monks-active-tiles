import { MonksActiveTiles, log, setting, i18n, makeid } from '../monks-active-tiles.js';

export const WithActiveTileHUD = (TileHUD) => {
    class ActiveTileHUD extends TileHUD {
        constructor(...args) {
            super(...args);
        }

        static get defaultOptions() {
            return foundry.utils.mergeObject(super.defaultOptions, {
                template: "modules/monks-active-tiles/templates/active-tile-hud.html"
            });
        }

        getData(options) {
            const data = super.getData(options);
            return foundry.utils.mergeObject(data, {
                activeClass: this.object.document.getFlag('monks-active-tiles', 'active') ? "active" : ""
            });
        }

        _onClickControl(event) {
            const button = event.currentTarget;
            if (button.dataset.action == 'active') {
                event.preventDefault();

                // Toggle the active state
                const isActive = this.object.document.getFlag('monks-active-tiles', 'active');
                const updates = this.layer.controlled.map(o => {
                    return { _id: o.id, 'flags.monks-active-tiles.active': !isActive };
                });

                // Update all objects
                event.currentTarget.classList.toggle("active", !isActive);
                return canvas.scene.updateEmbeddedDocuments(this.object.document.documentName, updates);
            }else
                super._onClickControl(event);
        }
    }

    const constructorName = "ActiveTileHUD";
    Object.defineProperty(ActiveTileHUD.prototype.constructor, "name", { value: constructorName });
    return ActiveTileHUD;
};