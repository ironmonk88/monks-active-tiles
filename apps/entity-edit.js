import { MonksActiveTiles, log, error, setting, i18n, makeid } from '../monks-active-tiles.js';

export class EntityEdit extends FormApplication {
    constructor(object, options = {}) {
        super(object, options);

        this.entityList = $(this.object).data("value");
        if (typeof this.entityList == "string")
            this.entityList = this.entityList.split(",");
        else
            this.entityList = [this.entityList];
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "edit-entity",
            classes: ["form", "edit-entity-sheet", "monks-active-tiles", "sheet"],
            title: "Edit location details",
            template: "modules/monks-active-tiles/templates/entity-dialog.html",
            width: 500,
            height: 'auto',
        });
    }

    getData(options) {
        return mergeObject(super.getData(options), {
            action: this.options.action,
            entities: this.entityList
        });
    }

    activateListeners(html) {
        super.activateListeners(html);

        let that = this;
        $('.item-delete', html).click((event) => {
            let row = $(event.currentTarget).closest('.item');
            let idx = row.index();
            this.entityList.splice(idx, 1);
            this.render(true);
        });

        $('input', html).change((event) => {
            let row = $(event.currentTarget).closest('.item');
            let idx = row.index();
            this.entityList[idx][event.currentTarget.name] = event.currentTarget.value;
        });

        $('.item-add', html).click((event) => {
            this.entityList = this.entityList || [];
            this.entityList.push({ id: "" });
            this.render(true);
        });

        $('button[name="close"]', html).click((event) => {
            this.close();
        });
    }

    async _updateObject(event) {
        let name = await MonksActiveTiles.entityName(this.entityList);
        this.object.val(JSON.stringify(this.entityList)).data("value", this.entityList).next().html(name);
        this.object.trigger('change');
    }
}