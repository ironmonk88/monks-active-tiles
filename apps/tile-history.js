import { MonksActiveTiles, log, setting, i18n, makeid } from '../monks-active-tiles.js';

export class TileHistory extends FormApplication {
    constructor(object, options = {}) {
        super(object, options);
    }

    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "tile-history",
            classes: ["form", "action-sheet"],
            title: "MonksActiveTiles.TileHistory",
            template: "modules/monks-active-tiles/templates/tile-history.html",
            width: 700,
            height: 'auto'
        });
    }

    getData(options) {
        let history = this.object.getHistory();
        return mergeObject(super.getData(options), {
            history: history
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        let that = this;
        $('.item-delete', html).click(function () {
            let row = $(this).closest('.item');
            let id = row[0].dataset.id;
            that.object.removeHistory(id);
            row.remove();
            that.setPosition();
        });

        $('button[name="reset"]', html).click(function () {
            that.object.resetHistory();
            $('.item-list', html).empty();
            that.setPosition();
        });
    }

    async _updateObject(event, formData) {
        log('updating action', event, formData, this.object);
    }
}