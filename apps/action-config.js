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
            availableActions[k] = i18n(v.name);

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
        let field = $('input[name="' + btn.attr('data-target') + '"]', this.element);

        if (btn.attr('data-type') == 'tile')
            field.val('{"id":"tile","name":"This tile"}').next().html("This tile");
        else if (btn.attr('data-type') == 'token')
            field.val('{"id":"token","name":"Triggering Token"}').next().html("Triggering Token");
        else if (btn.attr('data-type') == 'players')
            field.val('{"id":"players","name":"Player tokens"}').next().html("Player tokens");
        else {
            if (!this._minimized)
                this.minimize();
            if (!this.options.parent._minimized)
                this.options.parent.minimize();

            this.waitingfield = field;
            MonksActiveTiles.waitingInput = this;

            ui.notifications.warn((btn.hasClass('location-picker') ? 'Please select a location on this scene or a different scene' : 'Please select an entity'));
        }
    }

    updateSelection(selection) {
        this.waitingfield.val((typeof selection == 'object' ? JSON.stringify(selection) : selection));
        let scene = (selection?.sceneId ? game.scenes.get(selection.sceneId) : null);
        this.waitingfield.next().html(typeof selection == 'object' ? 'x:' + selection.x + ', y:' + selection.y + (scene ? ', scene:' + scene.name : '') : selection);

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
                    let list;
                    if (typeof ctrl.list == 'function')
                        list = ctrl.list.call();
                    else
                        list = (action.values && action.values[ctrl.list]);

                    if (list != undefined) {
                        field.append($('<select>').attr({ name: id, 'data-dtype': 'String' }).append(
                            (list instanceof Array
                                ? list.map(g => { return $('<optgroup>').attr('label', i18n(g.text)).append(Object.entries(g.groups).map(([k, v]) => { return $('<option>').attr('value', g.id + ":" + k).html(i18n(v)).prop('selected', (g.id + ":" + k) == data[ctrl.id]) })) })
                                : Object.entries(list).map(([k, v]) => { return $('<option>').attr('value', k).html(v).prop('selected', k == data[ctrl.id]) }))
                        ));
                    }
                    break;
                case 'select':
                    //so this is the fun one, when the button is pressed, I need to minimize the windows, and wait for a selection
                    let options = mergeObject({showTile: true, showToken: true, showPlayers: true}, ctrl.options);
                    if (ctrl.subtype == 'location') {
                        let scene = (data[ctrl.id]?.sceneId ? game.scenes.get(data[ctrl.id].sceneId) : null);
                        field
                            .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': "Select a location" }).addClass('location-picker').html('<i class="fas fa-crosshairs fa-fw"></i>').click(this.selectEntity.bind(this)))
                            .append($('<input>').attr({ type: 'hidden', name: id }).val(JSON.stringify(data[ctrl.id])).data('type', 'location'))
                            .append($('<span>').addClass('display-value').html((data[ctrl.id] ? 'x:' + data[ctrl.id].x + ', y:' + data[ctrl.id].y + (scene ? ', scene:' + scene.name : '') : '')));
                    } else if (ctrl.subtype == 'entity') {
                        field.css({'flex-direction':'column', 'align-items': 'flex-start'})
                            .append($('<div>').addClass('flexrow')
                                .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': "Select an entity" }).addClass('entity-picker').html('<i class="fas fa-crosshairs fa-fw"></i>').click(this.selectEntity.bind(this)))
                                .append($('<button>').attr({ 'type': 'button', 'data-type': 'tile', 'data-target': id, 'title': "Use the current Tile" }).toggle(options.showTile).addClass('entity-picker').html('<i class="fas fa-cubes fa-fw"></i>').click(this.selectEntity.bind(this)))
                                .append($('<button>').attr({ 'type': 'button', 'data-type': 'token', 'data-target': id, 'title': "Use the triggering token" }).toggle(options.showToken).addClass('entity-picker').html('<i class="fas fa-user-alt fa-fw"></i>').click(this.selectEntity.bind(this)))
                                .append($('<button>').attr({ 'type': 'button', 'data-type': 'players', 'data-target': id, 'title': "Use player tokens" }).toggle(options.showPlayers).addClass('entity-picker').html('<i class="fas fa-users fa-fw"></i>').click(this.selectEntity.bind(this))))
                            .append($('<div>').css({'width':'100%'})
                                .append($('<input>').attr({ type: 'hidden', name: id }).val(typeof data[ctrl.id] == 'object' ? JSON.stringify(data[ctrl.id]) : data[ctrl.id]).data('restrict', ctrl.restrict).data('type', 'entity'))
                                .append($('<span>').addClass('display-value').html(data[ctrl.id]?.name)));
                    }
                    break;
                case 'text':
                    field.append($('<input>').attr({ type: 'text', name: id }).val(data[ctrl.id]));
                    break;
                case 'checkbox':
                    field.append($('<input>').attr({ type: 'checkbox', name: id }).prop('checked', data[ctrl.id]));
                    break;
            }

            $('<div>')
                .addClass('form-group')
                .append($('<label>').html(i18n(ctrl.name)))
                .append(field)
                .appendTo($('.action-controls', this.element));
        }

        if(this.rendered)
            this.setPosition();
    }
}