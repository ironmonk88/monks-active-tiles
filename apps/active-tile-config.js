import { MonksActiveTiles, log, setting, i18n, makeid } from '../monks-active-tiles.js';
import { ActionConfig } from "../apps/action-config.js";
import { TileHistory } from './tile-history.js';

export const WithActiveTileConfig = (TileConfig) => {
    class ActiveTileConfig extends TileConfig {
        constructor(...args) {
            super(...args);
        }

        static get defaultOptions() {
            return foundry.utils.mergeObject(super.defaultOptions, {
                classes: ["monks-active-tiles", "sheet"],
                scrollY: ["ol.item-list"],
                dragDrop: [{ dragSelector: ".item", dropSelector: ".item-list" }]
            });
        }

        async _renderInner(data) {
            let html = await super._renderInner(data);
            $('.sheet-tabs', html).append($('<a>').addClass('item').attr('data-tab', "triggers").html(`<i class="fas fa-running"></i> ${i18n("MonksActiveTiles.Triggers")}`));
            let tab = $('<div>').addClass('tab').attr('data-tab', "triggers").insertAfter($('div[data-tab="animation"]', html));

            let template = "modules/monks-active-tiles/templates/tile-config.html";
            const tiledata = mergeObject({ 'data.flags.monks-active-tiles.minrequired': 0 }, data);

            tiledata.triggerModes = {
                'enter': i18n("MonksActiveTiles.mode.enter"),
                'exit': i18n("MonksActiveTiles.mode.exit"),
                'both': i18n("MonksActiveTiles.mode.both"),
                'movement': i18n("MonksActiveTiles.mode.movement"),
                'stop': i18n("MonksActiveTiles.mode.stop"),
                'click': i18n("MonksActiveTiles.mode.click"),
                'dblclick': i18n("MonksActiveTiles.mode.dblclick"),
                'hoverin': i18n("MonksActiveTiles.mode.hoverin"),
                'hoverout': i18n("MonksActiveTiles.mode.hoverout"),
                'manual': i18n("MonksActiveTiles.mode.manual")
            };
            tiledata.triggerRestriction = { 'all': i18n("MonksActiveTiles.restrict.all"), 'player': i18n("MonksActiveTiles.restrict.player"), 'gm': i18n("MonksActiveTiles.restrict.gm") };
            tiledata.triggerControlled = { 'all': i18n("MonksActiveTiles.control.all"), 'player': i18n("MonksActiveTiles.control.player"), 'gm': i18n("MonksActiveTiles.control.gm") };

            tiledata.actions = (this.object.getFlag('monks-active-tiles', 'actions') || [])
                .map(a => {
                    let trigger = MonksActiveTiles.triggerActions[a.action];
                    let content = (trigger == undefined ? 'Unknown' : (trigger.content ? trigger.content(trigger, a) : i18n(trigger.name)) + (a.delay > 0 ? ' after ' + a.delay + ' seconds' : ''));
                    return {
                        id: a.id,
                        content: content
                    };
                });

            let renderhtml = await renderTemplate(template, tiledata);
            tab.append(renderhtml);

            return html;
        }

        _onDragStart(event) {
            let li = event.currentTarget.closest(".item");
            const isFolder = li.classList.contains("folder");
            const dragData = { type: this.constructor.documentName, id: li.dataset.id };
            event.dataTransfer.setData("text/plain", JSON.stringify(dragData));
            this._dragType = dragData.type;
        }

        _canDragStart(selector) {
            return true;
        }

        _onDrop(event) {
            const cls = this.constructor.documentName;

            // Try to extract the data
            let data;
            try {
                data = JSON.parse(event.dataTransfer.getData('text/plain'));
            }
            catch (err) {
                return false;
            }

            // Identify the drop target
            const selector = this._dragDrop[0].dropSelector;
            const target = event.target.closest(".item") || null;

            // Call the drop handler
            if (target && target.dataset.id) {
                let actions = duplicate(this.object.data.flags["monks-active-tiles"].actions || []);

                if (data.id === target.dataset.id) return; // Don't drop on yourself

                let from = actions.findIndex(a => a.id == data.id);
                let to = actions.findIndex(a => a.id == target.dataset.id);
                log('from', from, 'to', to);
                actions.splice(to, 0, actions.splice(from, 1)[0]);

                this.object.data.flags["monks-active-tiles"].actions = actions;
                $('.action-items .item[data-id="' + data.id + '"]', this.element).insertBefore(target);
            }
        }

        async _onActionHoverIn(event) {
            event.preventDefault();
            if (!canvas.ready) return;
            const li = event.currentTarget;

            let action = (this.object.data.flags["monks-active-tiles"].actions || []).find(a => a.id == li.dataset.id);
            if (action && action.data.entity && !['tile', 'token', 'players', 'within', 'controlled', 'previous'].includes(action.data.entity.id)) {
                let entity = await fromUuid(action.data.entity.id);
                if (entity && entity._object) {
                    entity._object._onHoverIn(event);
                    this._highlighted = entity;
                }
            }
        }

        _onActionHoverOut(event) {
            event.preventDefault();
            if (this._highlighted) this._highlighted._object._onHoverOut(event);
            this._highlighted = null;
        }

        _getSubmitData(updateData = {}) {
            let data = super._getSubmitData(updateData);
            data["flags.monks-active-tiles.actions"] = this.object.data.flags["monks-active-tiles"].actions;
            return data;
        }

        activateListeners(html) {
            super.activateListeners(html);
            var that = this;

            const contextOptions = this._getContextOptions();
            Hooks.call(`getActiveTileConfigContext`, html, contextOptions);
            new ContextMenu($(html), ".action-items .item", contextOptions);

            $('.action-create', html).click(this._createAction.bind(this));
            $('.action-edit', html).click(this._editAction.bind(this));
            $('.action-delete', html).click(this._deleteAction.bind(this));
            $('.view-history', html).click(function () {
                new TileHistory(that.object).render(true);
            });

            //$('div[data-tab="triggers"] .item-list li.item', html).hover(this._onActionHoverIn.bind(this), this._onActionHoverOut.bind(this));
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

        cloneAction(id) {
            let actions = duplicate(this.object.data.flags["monks-active-tiles"].actions || []);
            let idx = actions.findIndex(obj => obj.id == id);
            if (idx == -1)
                return;

            let action = actions[idx];
            if (!action)
                return;

            let clone = duplicate(action);
            clone.id = makeid();
            actions.splice(idx + 1, 0, clone);
            this.object.setFlag("monks-active-tiles", "actions", actions);
        }

        resetPerToken() {
            this.object.resetPerToken();
        }

        _getContextOptions() {
            return [
                {
                    name: "SIDEBAR.Duplicate",
                    icon: '<i class="far fa-copy"></i>',
                    condition: () => game.user.isGM,
                    callback: elem => {
                        let li = $(elem).closest('.item');
                        const id = li.data("id");
                        return this.cloneAction(id);
                    }
                },
                {
                    name: "SIDEBAR.Delete",
                    icon: '<i class="fas fa-trash"></i>',
                    condition: () => game.user.isGM,
                    callback: elem => {
                        let li = $(elem).closest('.item');
                        const id = li.data("id");
                        Dialog.confirm({
                            title: `${game.i18n.localize("SIDEBAR.Delete")} action`,
                            content: game.i18n.format("SIDEBAR.DeleteWarning", { type: 'action' }),
                            yes: this.deleteAction.bind(this, id),
                            options: {
                                top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                                left: window.innerWidth - 720
                            }
                        });
                    }
                }
            ];
        }
    }

    const constructorName = "ActiveTileConfig";
    Object.defineProperty(ActiveTileConfig.prototype.constructor, "name", { value: constructorName });
    return ActiveTileConfig;
};
