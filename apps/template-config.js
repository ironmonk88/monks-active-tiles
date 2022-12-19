import { MonksActiveTiles, log, error, setting, i18n, makeid } from '../monks-active-tiles.js';

export class TemplateConfig extends FormApplication {
    constructor(object, tiletemplates, options = {}) {
        super(object, options);
        this.tiletemplates = tiletemplates;
    }

    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "template-config",
            classes: ["dialog", "action-sheet"],
            title: "Update Tile",
            template: "modules/monks-active-tiles/templates/template-config.html",
            width: 320,
            height: 'auto',
        });
    }

    async _updateObject(event, formData) {
        formData.id = this.object._id;
        this.tiletemplates.updateTile(formData);
    }
}
