import { MonksActiveTiles, log, error, setting, i18n, makeid } from '../monks-active-tiles.js';

export class LocationEdit extends FormApplication {
    constructor(object, options = {}) {
        super(object, options);

        this.locationList = $(this.object).data("value") || [];
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "edit-location",
            classes: ["form", "edit-location-sheet", "monks-active-tiles", "sheet"],
            title: "Edit location details",
            template: "modules/monks-active-tiles/templates/location-dialog.html",
            width: 700,
            height: 'auto',
        });
    }

    getData(options) {
        let sceneList = { "": "" };
        for (let scene of game.scenes) {
            sceneList[scene.id] = scene.name;
        }

        return foundry.utils.mergeObject(super.getData(options), {
            action: this.options.action,
            locations: this.locationList,
            sceneList
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        let that = this;
        $('.item-delete', html).click((event) => {
            let row = $(event.currentTarget).closest('.item');
            let idx = row.index();
            this.locationList.splice(idx, 1);
            this.render(true);
        });

        $('input, select', html).change((event) => {
            let row = $(event.currentTarget).closest('.item');
            let idx = row.index();
            this.locationList[idx][event.currentTarget.name] = event.currentTarget.value;
        });

        $('.item-add', html).click((event) => {
            this.locationList = this.locationList || [];
            this.locationList.push({ id: "", x: "", y: "", scale: "", sceneId: "" });
            this.render(true);
        });

        $('button[name="close"]', html).click((event) => {
            this.close();
        });
    }

    async _updateObject(event) {
        let name = await MonksActiveTiles.locationName(this.locationList);
        this.object.val(JSON.stringify(this.locationList)).data("value", this.locationList).next().html(name);
        this.object.trigger('change');
    }
}