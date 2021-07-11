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
            title: "MonksActiveTiles.TriggerAction",
            template: "modules/monks-active-tiles/templates/action-config.html",
            width: 500,
            height: 'auto'
        });
    }

    getData(options) {
        let temp = [];
        for (let [k, v] of Object.entries(MonksActiveTiles.triggerActions))
            temp.push({ id: k, name: i18n(v.name) });
        let availableActions = temp.sort((a, b) => { return (a.name > b.name ? 1 : (a.name < b.name ? -1 : 0)) }).reduce(function (result, item) {
            result[item.id] = item.name;
            return result;
        }, {});

        return mergeObject(super.getData(options), {
            availableActions: availableActions
        });
    }

    activateListeners(html) {
        this.changeAction();

        super.activateListeners(html);
        $('select[name="action"]', html).change(this.changeAction.bind(this));
    }

    async selectEntity(event) {
        let btn = $(event.currentTarget);
        let field = $('input[name="' + btn.attr('data-target') + '"]', this.element);

        if (btn.attr('data-type') == 'tile')
            field.val('{"id":"tile","name":"' + i18n("MonksActiveTiles.ThisTile") + '"}').next().html(i18n("MonksActiveTiles.ThisTile"));
        else if (btn.attr('data-type') == 'token')
            field.val('{"id":"token","name":"' + i18n("MonksActiveTiles.TriggeringToken") + '"}').next().html(i18n("MonksActiveTiles.TriggeringToken"));
        else if (btn.attr('data-type') == 'players')
            field.val('{"id":"players","name":"' + i18n("MonksActiveTiles.PlayerTokens") + '"}').next().html(i18n("MonksActiveTiles.PlayerTokens"));
        else {
            if (!this._minimized)
                await this.minimize();
            if (!this.options.parent._minimized)
                await this.options.parent.minimize();

            this.waitingfield = field;
            MonksActiveTiles.waitingInput = this;

            ui.notifications.warn((btn.hasClass('location-picker') ? (this.restrict ? i18n("MonksActiveTiles.msg.select-location") : i18n("MonksActiveTiles.msg.select-location-any")) : i18n("MonksActiveTiles.msg.select-entity")));
        }
    }

    async updateSelection(selection) {
        this.waitingfield.val((typeof selection == 'object' ? JSON.stringify(selection) : selection));
        let scene = (selection?.sceneId ? game.scenes.get(selection.sceneId) : null);
        this.waitingfield.next().html(typeof selection == 'object' ? (selection.x || selection.y ? 'x:' + selection.x + ', y:' + selection.y + (scene ? ', scene:' + scene.name : '') : selection.name) : selection);

        await this.maximize();
        await this.options.parent.maximize();

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

        //make sure delay is not set for one of the controls that can't delay
        let trigger = MonksActiveTiles.triggerActions[formData.action];
        if (!trigger.options?.allowDelay)
            formData["delay"] = null;

        if (this.object.id == undefined) {
            mergeObject(this.object, formData);
            this.object.id = makeid();
            let actions = duplicate(this.options.parent.object.getFlag("monks-active-tiles", "actions") || []);
            actions.push(this.object);
            mergeObject(this.options.parent.object.data.flags, {
                "monks-active-tiles": { actions: actions }
            });
            //add this row to the parent
            let trigger = MonksActiveTiles.triggerActions[this.object.action];
            $('<li>').addClass('item flexrow').attr('data-id', this.object.id).attr('draggable', true)
                .append($('<div>').addClass('item-name flexrow').append($('<h4>').css({ 'white-space': 'normal' }).html(trigger.content ? trigger.content(trigger, this.object) : i18n(trigger.name))))
                .append($('<div>').addClass('item-controls flexrow')
                    .append($('<a>').addClass('item-control action-edit').attr('title', 'Edit Action').html('<i class="fas fa-edit"></i>').click(this.options.parent._editAction.bind(this.options.parent)))
                    .append($('<a>').addClass('item-control action-delete').attr('title', 'Delete Action').html('<i class="fas fa-trash"></i>').click(this.options.parent._deleteAction.bind(this.options.parent))))
                .appendTo($(`.action-items .item-list`, this.options.parent.element));
            this.options.parent.setPosition();
        } else {
            let actions = duplicate(this.options.parent.object.getFlag("monks-active-tiles", "actions") || []);
            let action = actions.find(a => a.id == this.object.id);
            if (action) {
                mergeObject(action, formData);
                mergeObject(this.options.parent.object.data.flags, {
                    "monks-active-tiles": { actions: actions }
                });
                //update the text for this row
                let trigger = MonksActiveTiles.triggerActions[action.action];
                $(`.action-items .item[data-id="${action.id}"] .item-name h4`, this.options.parent.element).html(trigger.content ? trigger.content(trigger, action) : trigger.name);
            }
        }
    }

    changeAction() {
        let command = $('select[name="action"]', this.element).val();
        let action = MonksActiveTiles.triggerActions[command];

        $('.action-controls', this.element).empty();

        let data = this.object.data || {};

        for (let ctrl of (action.ctrls || [])) {
            let options = mergeObject({ showTile: true, showToken: true, showPlayers: true }, ctrl.options);
            let field = $('<div>').addClass('form-fields');
            let id = 'data.' + ctrl.id;

            if (ctrl.conditional == undefined || (typeof ctrl.conditional == 'function' ? ctrl.conditional() : ctrl.conditional)) {

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
                                    : Object.entries(list).map(([k, v]) => { return $('<option>').attr('value', k).html(i18n(v)).prop('selected', k == data[ctrl.id]) }))
                            ));
                        }
                        break;
                    case 'select':
                        //so this is the fun one, when the button is pressed, I need to minimize the windows, and wait for a selection
                        if (ctrl.subtype == 'location') {
                            let scene = (data[ctrl.id]?.sceneId ? game.scenes.get(data[ctrl.id].sceneId) : null);
                            field
                                .append($('<input>').attr({ type: 'hidden', name: id }).val(JSON.stringify(data[ctrl.id])).data('type', 'location'))
                                .append($('<span>').addClass('display-value').html((data[ctrl.id] ? 'x:' + data[ctrl.id].x + ', y:' + data[ctrl.id].y + (scene ? ', scene:' + scene.name : '') : '')))
                                .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': i18n("MonksActiveTiles.msg.selectlocation") }).addClass('location-picker').html('<i class="fas fa-crosshairs fa-fw"></i>').click(this.selectEntity.bind(this)));
                        } else if (ctrl.subtype == 'entity') {
                            field//.css({ 'flex-direction': 'row', 'align-items': 'flex-start' })
                                .append($('<input>').attr({ type: 'hidden', name: id }).val(typeof data[ctrl.id] == 'object' ? JSON.stringify(data[ctrl.id]) : data[ctrl.id]).data('restrict', ctrl.restrict).data('type', 'entity'))
                                .append($('<span>').addClass('display-value').html(data[ctrl.id]?.name))
                                .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': i18n("MonksActiveTiles.msg.selectentity") }).addClass('entity-picker').html('<i class="fas fa-crosshairs fa-fw"></i>').click(this.selectEntity.bind(this)))
                                .append($('<button>').attr({ 'type': 'button', 'data-type': 'tile', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.usetile") }).toggle(options.showTile).addClass('entity-picker').html('<i class="fas fa-cubes fa-fw"></i>').click(this.selectEntity.bind(this)))
                                .append($('<button>').attr({ 'type': 'button', 'data-type': 'token', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.usetoken") }).toggle(options.showToken).addClass('entity-picker').html('<i class="fas fa-user-alt fa-fw"></i>').click(this.selectEntity.bind(this)))
                                .append($('<button>').attr({ 'type': 'button', 'data-type': 'players', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.useplayers") }).toggle(options.showPlayers).addClass('entity-picker').html('<i class="fas fa-users fa-fw"></i>').click(this.selectEntity.bind(this)));
                        }
                        break;
                    case 'text':
                        field.append($('<input>').attr({ type: 'text', name: id }).val(data[ctrl.id] != undefined ? data[ctrl.id] : ctrl.defvalue));
                        break;
                    case 'checkbox':
                        field.append($('<input>').attr({ type: 'checkbox', name: id }).prop('checked', (data[ctrl.id] != undefined ? data[ctrl.id] : ctrl.defvalue ))).css({flex: '0 0 30px'});
                        break;
                }

                $('<div>')
                    .addClass('form-group')
                    .append($('<label>').html(i18n(ctrl.name)))
                    .append(field)
                    .appendTo($('.action-controls', this.element));
            }
        }

        $('[data-type="delay"]', this.element).toggle(action?.options?.allowDelay === true);

        if(this.rendered)
            this.setPosition();
    }
}