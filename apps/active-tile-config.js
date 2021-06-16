import { MonksActiveTiles, log, setting, i18n, makeid } from '../monks-active-tiles.js';
import { ActionConfig } from "../apps/action-config.js";

export const WithActiveTileConfig = (TileConfig) => {
    class ActiveTileConfig extends TileConfig {
        constructor(...args) {
            super(...args);
        }

        static get defaultOptions() {
            return foundry.utils.mergeObject(super.defaultOptions, {
                classes: ["monks-active-tiles", "sheet"],
                template: "modules/monks-active-tiles/templates/active-tile-config.html"
            });
        }

        async getData(options) {
            this.object._normalize();
            const data = super.getData(options);

            data.triggerModes = { 'enter': i18n("MonksActiveTiles.mode.enter"), 'exit': i18n("MonksActiveTiles.mode.exit") };
            data.triggerRestriction = { 'all': i18n("MonksActiveTiles.restrict.all"), 'player': i18n("MonksActiveTiles.restrict.player"), 'gm': i18n("MonksActiveTiles.restrict.gm") };

            data.actions = this.object.data.flags['monks-active-tiles'].actions.map(a => {
                let trigger = MonksActiveTiles.triggerActions[a.action];
                let content = (trigger == undefined ? 'Unknown' : (trigger.content ? trigger.content(trigger, a) : i18n(trigger.name)) + (a.action.delay > 0 ? ' after ' + a.action.delay + ' seconds' : ''));
                return {
                    id: a.id,
                    content: content
                };
            });

            return data;
        }

        activateListeners(html) {
            super.activateListeners(html);

            $('.action-create', html).click(this._createAction.bind(this));
            $('.action-edit', html).click(this._editAction.bind(this));
            $('.action-delete', html).click(this._deleteAction.bind(this));
        }

        _createAction(event) {
            let action = { delay: 0 };
            if (this.object.data.flags["monks-active-tiles"].actions == undefined)
                this.object.data.flags["monks-active-tiles"].actions = [];
            new ActionConfig(action, {parent: this}).render(true);
        }

        _editAction(event) {
            let item = event.currentTarget.closest('.item');
            let action = this.object.data.flags["monks-active-tiles"].actions.find(obj => obj.id == item.dataset.id);
            if (action != undefined)
                new ActionConfig(action, { parent: this }).render(true);
        }

        _deleteAction(event) {
            let item = event.currentTarget.closest('.item');
            this.deleteAction(item.dataset.id);
        }

        deleteAction(id) {
            let actions = duplicate(this.object.data.flags["monks-active-tiles"].actions || []);
            actions.findSplice(i => i.id == id);
            this.object.setFlag("monks-active-tiles", "actions", actions);
            //$(`li[data-id="${id}"]`, this.element).remove();
        }
    }

    const constructorName = "ActiveTileConfig";
    Object.defineProperty(ActiveTileConfig.prototype.constructor, "name", { value: constructorName });
    return ActiveTileConfig;
};
