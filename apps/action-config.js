import { MonksActiveTiles, log, setting, i18n, makeid } from '../monks-active-tiles.js';

export class ActionConfig extends FormApplication {
    constructor(object, options = {}) {
        super(object, options);
    }

    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "trigger-action",
            classes: ["form", "action-sheet"],
            title: "Trigger Action",
            template: "modules/monks-active-tiles/templates/action-config.html",
            width: 500,
            height:'auto'
        });
    }

    getData(options) {
        let availableActions = {};
        for (let [k, v] of Object.entries(MonksActiveTiles.triggerActions))
            availableActions[k] = v.name;

        return mergeObject(super.getData(options), {
            availableActions: availableActions
        });
    }

    activateListeners(html) {
        this.changeAction();

        super.activateListeners(html);
        $('select[name="action"]', html).change(this.changeAction.bind(this));
    }

    selectEntity(event) {
        let btn = $(event.currentTarget);

        if (!this._minimized)
            this.minimize();
        if (!this.options.parent._minimized)
            this.options.parent.minimize();

        this.waitingfield = btn.next();
        MonksActiveTiles.waitingInput = this;

        ui.notifications.warn((btn.hasClass('location-picker') ? 'Please select a location on this scene or a different scene' : 'Please select an entity'));
    }

    /*
    _onSelectFile(selection, filePicker, event) {
        log(selection, filePicker, event);
        let updates = {};
        updates[filePicker.field.name] = selection;
        this.object.update(updates);
    }*/

    updateSelection(selection) {
        this.waitingfield.val((typeof selection == 'object' ? JSON.stringify(selection) : selection));
        this.waitingfield.next().html((typeof selection == 'object' ? JSON.stringify(selection) : selection));

        this.maximize();
        this.options.parent.maximize();

        delete this.waitingfield;
        delete MonksActiveTiles.waitingInput;

        if (canvas.scene.id != this.options.parent.object.parent.id)
            game.scenes.get(this.options.parent.object.parent.id).view();
    }

    async _updateObject(event, formData) {
        log('updating action', event, formData, this.object);

        if (formData['data.location'])
            formData['data.location'] = (formData['data.location'].startsWith('{') ? JSON.parse(formData['data.location']) : formData['data.location']);
        if (formData['data.entity'])
            formData['data.entity'] = (formData['data.entity'].startsWith('{') ? JSON.parse(formData['data.entity']) : formData['data.entity']);

        if (this.object.id == undefined) {
            mergeObject(this.object, formData);
            this.object.id = makeid();
            let actions = duplicate(this.options.parent.object.getFlag("monks-active-tiles", "actions"));
            actions.push(this.object);
            this.options.parent.object.setFlag("monks-active-tiles", "actions", actions);
        } else {
            let actions = duplicate(this.options.parent.object.getFlag("monks-active-tiles", "actions"));
            let action = actions.find(a => a.id == this.object.id);
            if (action) {
                mergeObject(action, formData);
                this.options.parent.object.setFlag("monks-active-tiles", "actions", actions);
            }
        }
    }

    changeAction() {
        let command = $('select[name="action"]', this.element).val();
        let action = MonksActiveTiles.triggerActions[command];

        $('.action-controls', this.element).empty();

        let data = this.object.data || {};

        for (let ctrl of (action.ctrls || [])) {
            let field = $('<div>').addClass('form-fields');
            let id = 'data.' + ctrl.id;

            switch (ctrl.type) {
                case 'filepicker':
                    field
                        .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': game.i18n.localize("FILES.BrowseTooltip") }).addClass('file-picker').html('<i class="fas fa-file-import fa-fw"></i>').click(this._activateFilePicker.bind(this)))
                        .append($('<input>').attr({ type: 'text', name: id, placeholder: (ctrl.subtype == 'audio' ? 'path/audio.mp3' : '') }).val(data[ctrl.id]));
                    break;
                case 'list':
                    let list = action.values[ctrl.list];
                    field.append($('<select>').attr({ name: id, 'data-dtype': 'String' }).append(Object.entries(list).map(([k, v]) => { return $('<option>').attr('value', k).html(v).prop('selected', k == data[ctrl.id]) })));
                    break;
                case 'select':
                    //so this is the fun one, when the button is pressed, I need to minimize the windows, and wait for a selection
                    if (ctrl.subtype == 'location') {
                        field
                            .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': "Select a location" }).addClass('location-picker').html('<i class="fas fa-crosshairs fa-fw"></i>').click(this.selectEntity.bind(this)))
                            .append($('<input>').attr({ type: 'hidden', name: id }).val(JSON.stringify(data[ctrl.id])).data('type', 'location'))
                            .append($('<span>').addClass('display-value').val(JSON.stringify(data[ctrl.id])));
                    } else if (ctrl.subtype == 'entity') {
                        field
                            .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': "Select an entity" }).addClass('entity-picker').html('<i class="fas fa-crosshairs fa-fw"></i>').click(this.selectEntity.bind(this)))
                            .append($('<input>').attr({ type: 'text', name: id }).val(typeof data[ctrl.id] == 'object' ? JSON.stringify(data[ctrl.id]) : data[ctrl.id]).data('restrict', ctrl.restrict).data('type', 'entity'));
                    }
                    break;
                case 'text':
                    field.append($('<input>').attr({ type: 'text', name: id }).val(data[ctrl.id]));
                    break;
            }

            $('<div>')
                .addClass('form-group')
                .append($('<label>').html(ctrl.name))
                .append(field)
                .appendTo($('.action-controls', this.element));
        }

        if(this.rendered)
            this.setPosition();
    }
}