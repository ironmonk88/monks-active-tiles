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
            width: setting("tile-edit") ? 600 : 320,
            height: setting("tile-edit") ? 400 : 'auto',
            resizable: setting("tile-edit"),
        });
    }

    getData(options) {
        let data = super.getData(options)
        let tileData = duplicate(this.object);
        delete tileData._id;
        delete tileData.id;
        delete tileData.x;
        delete tileData.y;

        return mergeObject(data, {
            tileData: JSON.stringify(tileData, null, 4),
            allowEditing: setting("tile-edit")
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        let that = this;

        $('button[name="submit"]', html).click(function () {
            if (setting("tile-edit")) {
                // check that the JSON is valid before submitting
                let tileData = $('textarea[name="tileData"]', html).val();
                if (tileData) {
                    try {
                        $(".error-message", html).html("");
                        JSON.parse(tileData);
                    } catch (e) {
                        $(".error-message", html).html(e);
                        error(e);
                        return;
                    }
                }
            }
            that.submit();
        });
    }

    async _updateObject(event, formData) {
        if (setting("tile-edit") && formData.tileData) {
            try {
                let tileData = JSON.parse(formData.tileData);
                tileData.id = this.object._id;
                tileData.name = formData.name;
                this.tiletemplates.updateTile(tileData);
                return;
            } catch (e) {
                error(e);
                return;
            }
        }

        formData.id = this.object._id;
        delete formData.tileData;
        this.tiletemplates.updateTile(formData);
    }
}
