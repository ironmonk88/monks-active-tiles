import { MonksActiveTiles, log, setting, i18n, makeid } from '../monks-active-tiles.js';

export class TileVariables extends FormApplication {
    constructor(object, options = {}) {
        super(object, options);
    }

    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "tile-variables",
            classes: ["form", "action-sheet"],
            title: "MonksActiveTiles.TileVariables",
            template: "modules/monks-active-tiles/templates/tile-variables.html",
            width: 700,
            height: 'auto'
        });
    }

    getData(options) {
        let variables = getProperty(this.object, "flags.monks-active-tiles.variables") || {};
        return mergeObject(super.getData(options), {
            variables: variables
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        $('.item-delete', html).click(async (event) => {
            let row = event.currentTarget.closest('.item');
            let id = row.dataset.id;
            await this.object.update({[`flags.monks-active-tiles.variables.-=${id}`]: null})
            delete this.object.flags["monks-active-tiles"].variables[id];
            row.remove();
            this.setPosition();
        });

        $('button[name="clear"]', html).click((event) => {
            this.object.unsetFlag("monks-active-tiles", "variables");
            $('.item-list', html).empty();
            this.setPosition();
        });
    }

    async _updateObject(event, formData) {
        log('updating action', event, formData, this.object);
    }
}