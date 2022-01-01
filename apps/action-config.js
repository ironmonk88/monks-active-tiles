import { MonksActiveTiles, log, setting, i18n, makeid } from '../monks-active-tiles.js';

export class ActionConfig extends FormApplication {
    constructor(object, options = {}) {
        super(object, options);

        this.tokenAttr = [];
        this.tileAttr = [];

        //let's just grab the first player character we can find
        let token = canvas.scene.tokens?.contents[0]?.data;
        if (token) {
            let attributes = TokenDocument.getTrackedAttributes(token ?? {});
            if (attributes)
                this.tokenAttr = (this.tokenAttr || []).concat(attributes.value.concat(attributes.bar).map(a => a.join('.')));
        }
        let player = game.actors.find(a => a.type == 'character');
        if (player) {
            let attributes = TokenDocument.getTrackedAttributes(player.data.data ?? {});
            if (attributes)
                this.tokenAttr = (this.tokenAttr || []).concat(attributes.value.concat(attributes.bar).map(a => a.join('.')));
        }

        let tile = canvas.scene.data.tiles?.contents[0]?.data;
        if (tile) {
            let attributes = TokenDocument.getTrackedAttributes(tile ?? {});
            if (attributes)
                this.tileAttr = attributes.value.concat(attributes.bar).map(a => a.join('.'));
        }
    }

    /** @inheritdoc */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "trigger-action",
            classes: ["form", "action-sheet"],
            title: "MonksActiveTiles.TriggerAction",
            template: "modules/monks-active-tiles/templates/action-config.html",
            width: 550,
            height: 'auto'
        });
    }

    getData(options) {
        let groups = {};
        for (let [k, v] of Object.entries(MonksActiveTiles.triggerActions)) {
            let group = v.group || 'actions';
            if (groups[group] == undefined)
                groups[group] = [];
            groups[group].push({ id: k, name: i18n(v.name)});
        }

        let availableActions = Object.entries(groups).map(([k, v]) => {
            return {
                text: i18n(`MonksActiveTiles.group.${k}`),
                groups: v.sort((a, b) => { return (a.name > b.name ? 1 : (a.name < b.name ? -1 : 0)) }).reduce(function (result, item) {
                    result[item.id] = item.name;
                    return result;
                }, {})
            };
        });

        /*
        let availableActions = temp.sort((a, b) => { return (a.name > b.name ? 1 : (a.name < b.name ? -1 : 0)) }).reduce(function (result, item) {
            result[item.id] = item.name;
            return result;
        }, {});*/

        return mergeObject(super.getData(options), {
            availableActions: availableActions
        });
    }

    activateListeners(html) {
        var that = this;
        this.changeAction();

        super.activateListeners(html);
        $('select[name="action"]', html).change(function () {
            //clear out these before saving the new information so we don't get data bleed through
            if (that.object.data) {
                that.object.data.location = {};
                that.object.data.entity = {};
                that.object.data.item = {};
                that.object.data.actor = {};
            }
            that.changeAction.call(that);
        });
    }

    _activateFilePicker(event) {
        event.preventDefault();
        const options = this._getFilePickerOptions(event);
        options.wildcard = true;
        const fp = new FilePicker(options);
        this.filepickers.push(fp);
        return fp.browse();
    }

    fillList(list, id) {
        return (list instanceof Array
            ? list.map(g => { return $('<optgroup>').attr('label', i18n(g.text)).append(Object.entries(g.groups).map(([k, v]) => { return $('<option>').attr('value', (g.id ? g.id + ":" : '') + k).html(i18n(v)).prop('selected', ((g.id ? g.id + ":" : '') + k) == id) })) })
            : Object.entries(list).map(([k, v]) => { return $('<option>').attr('value', k).html(i18n(v)).prop('selected', k == id) }))
    }

    async selectEntity(event) {
        let btn = $(event.currentTarget);
        let field = $('input[name="' + btn.attr('data-target') + '"]', this.element);

        this.attributes = this.tokenAttr;
        //$('input[name="data.attribute"]', this.element).data('typeahead').source = this.tokenAttr;

        if (btn.attr('data-type') == 'tile') {
            field.val('{"id":"tile","name":"' + i18n("MonksActiveTiles.ThisTile") + '"}').next().html(i18n("MonksActiveTiles.ThisTile"));
            //$('input[name="data.attribute"]', this.element).data('typeahead').source = this.tileAttr;
            this.attributes = this.tileAttr;
        }
        else if (btn.attr('data-type') == 'token')
            field.val('{"id":"token","name":"' + i18n("MonksActiveTiles.TriggeringToken") + '"}').next().html(i18n("MonksActiveTiles.TriggeringToken"));
        else if (btn.attr('data-type') == 'players')
            field.val('{"id":"players","name":"' + i18n("MonksActiveTiles.PlayerTokens") + '"}').next().html(i18n("MonksActiveTiles.PlayerTokens"));
        else if (btn.attr('data-type') == 'within')
            field.val('{"id":"within","name":"' + i18n("MonksActiveTiles.WithinTile") + '"}').next().html(i18n("MonksActiveTiles.WithinTile"));
        else if (btn.attr('data-type') == 'controlled')
            field.val('{"id":"controlled","name":"' + i18n("MonksActiveTiles.Controlled") + '"}').next().html(i18n("MonksActiveTiles.Controlled"));
        else if (btn.attr('data-type') == 'previous')
            field.val('{"id":"previous","name":"' + i18n("MonksActiveTiles.PreviousData") + '"}').next().html(i18n("MonksActiveTiles.PreviousData"));
        else {
            if (!this._minimized)
                await this.minimize();
            if (!this.options.parent._minimized)
                await this.options.parent.minimize();

            this.waitingfield = field;
            MonksActiveTiles.waitingInput = this;

            MonksActiveTiles.lasttab = null;
            let tab = ui.sidebar.tabs[field.data('deftype')];
            if (tab) {
                if (tab.tabName !== ui.sidebar.tabs.activeTab) {
                    MonksActiveTiles.lasttab = ui.sidebar.activeTab;
                    tab.activate();
                }
            }

            MonksActiveTiles.lasttool = null;
            let tool = ui.controls.controls.find(t => t.name == field.data('deftype'));
            if (tool) {
                if (tool.name !== ui.controls.activeControl) {
                    MonksActiveTiles.lasttool = ui.controls.activeControl;
                    canvas[tool.layer].activate();
                }
            }
        }
    }

    async updateSelection(selection) {
        this.waitingfield.val((typeof selection == 'object' ? JSON.stringify(selection) : selection));
        let scene = (selection?.sceneId ? game.scenes.get(selection.sceneId) : null);
        this.waitingfield.next().html(typeof selection == 'object' ? (this.waitingfield.data('type') == 'entity' ? await MonksActiveTiles.entityName(selection) : await MonksActiveTiles.locationName(selection)) : selection); //(selection.x || selection.y ? 'x:' + selection.x + ', y:' + selection.y + (scene ? ', scene:' + scene.name : '') : selection.name)

        await this.maximize();
        await this.options.parent.maximize();

        if (MonksActiveTiles.lasttab) {
            ui.sidebar.activateTab(MonksActiveTiles.lasttab);
            delete MonksActiveTiles.lasttab;
        }

        if (MonksActiveTiles.lasttool) {
            let tool = ui.controls.controls.find(t => t.name == MonksActiveTiles.lasttool);
            canvas[tool.layer].activate();
            delete MonksActiveTiles.lasttool;
        }

        if (this.waitingfield.attr('name') == 'data.actor') {
            let select = $('select[name="data.attack"]', this.element);
            select.empty();
            if (selection.id) {
                let ctrl = select.parent().data('ctrl');

                let list = await ctrl.list.call(ctrl, { actor: { id: selection.id }});

                select.append(this.fillList(list, ''));
            }
        }

        delete this.waitingfield;
        delete MonksActiveTiles.waitingInput;

        if (canvas.scene.id != this.options.parent.object.parent.id)
            game.scenes.get(this.options.parent.object.parent.id).view();
    }

    async selectPosition(event) {
        let btn = $(event.currentTarget);
        let field = $('input[name="' + btn.attr('data-target') + '"]', this.element);

        let x = parseInt(canvas.stage.pivot.x);
        let y = parseInt(canvas.stage.pivot.y);
        let scale = canvas.stage.scale.x;

        field.val(`{"x":${x},"y":${y},"scale":${scale}}`).next().html(`x:${x}, y:${y}, scale:${scale}`);
    }

    async addTag(event) {
        const html = await renderTemplate(`modules/monks-active-tiles/templates/tagger-dialog.html`, {
            data: this.object?.data
        });

        // Render the confirmation dialog window
        return Dialog.prompt({
            title: "Enter tag",
            content: html,
            label: i18n("MonksActiveTiles.Save"),
            callback: async (html) => {
                let tagName = $('input[name="tag-name"]').val();
                let btn = $(event.currentTarget);
                let field = $('input[name="' + btn.attr('data-target') + '"]', this.element);
                let entity = { id: `tagger:${tagName}` };
                entity.name = await MonksActiveTiles.entityName(entity);
                field.val(JSON.stringify(entity)).next().html(entity.name);
            },
            rejectClose: false,
            options: {
                width: 400
            }
        });
    }

    addToFileList(event) {
        let filename = $(event.currentTarget).val();
        if (filename != '') {
            let id = makeid();
            $('.file-list', this.element).append($('<li>').attr('data-id', id)
                .addClass('flexrow')
                .append($('<input>').attr({ 'type': 'hidden', 'name': 'files.id' }).val(id))
                .append($('<input>').attr({ 'type': 'hidden', 'name': 'files.name' }).val(filename))
                .append($('<span>').html(filename))
                .append($('<a>').css({'flex':'0 0 28px', height: '28px', width: '28px'}).html('<i class="fas fa-trash fa-sm"></i>').click(this.removeFile.bind(this, id))));
            $(event.currentTarget).val('');
            this.setPosition({height: 'auto'});
        }
    }

    removeFile(id, event) {
        $(`.file-list li[data-id="${id}"]`, this.element).remove();
        this.setPosition({ height: 'auto' });
    }

    async _onSubmit(...args) {
        let event = args[0];
        event.preventDefault();
        //confirm that all required fields have a value
        let allGood = true;
        $('.required[name]', this.element).each(function () {
            if ($(this).is(':visible') && $(this).val() == '' && $(this).children().length == 0)
                allGood = false;
        })

        if (!allGood) {
            ui.notifications.error('Cannot save, not all required fields have been filled in.');
            return false;
        }

        return super._onSubmit.call(this, ...args);
    }

    _getSubmitData(updateData = {}) {
        let data = expandObject(super._getSubmitData(updateData));

        let files = null;
        if (data.files) {
            for (let [k, v] of Object.entries(data.files)) {
                let values = (v instanceof Array ? v : [v]);
                if (files == undefined) {
                    files = values.map(file => { let obj = {}; obj[k] = file; return obj; });
                } else {
                    for (let i = 0; i < values.length; i++) {
                        files[i][k] = values[i];
                    }
                }
            }
            delete data.files;
            data.data.files = files;
        }

        if (data.delay == undefined)
            delete data.delay;

        return flattenObject(data);
    }

    async _updateObject(event, formData) {
        log('updating action', event, formData, this.object);

        for (let check of ['location', 'entity', 'item', 'actor']) {
            if (formData[`data.${check}`])
                formData[`data.${check}`] = (formData[`data.${check}`].startsWith('{') ? JSON.parse(formData[`data.${check}`]) : formData[`data.${check}`]);
        }

        if (formData['data.attack'])
            formData['data.attack'] = { id: formData['data.attack'], name: $('select[name="data.attack"] option:selected', this.element).text()};

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
            let li = $('<li>').addClass('item flexrow').attr('data-id', this.object.id).attr('draggable', true)
                .append($('<div>').addClass('item-name flexrow').append($('<h4>').css({ 'white-space': 'normal' }).html(trigger.content ? await trigger.content(trigger, this.object) : i18n(trigger.name))))
                .append($('<div>').addClass('item-controls flexrow')
                    .append($('<a>').addClass('item-control action-edit').attr('title', 'Edit Action').html('<i class="fas fa-edit"></i>').click(this.options.parent._editAction.bind(this.options.parent)))
                    .append($('<a>').addClass('item-control action-delete').attr('title', 'Delete Action').html('<i class="fas fa-trash"></i>').click(this.options.parent._deleteAction.bind(this.options.parent))))
                .appendTo($(`.action-items .item-list`, this.options.parent.element));

            li[0].ondragstart = this.options.parent._dragDrop[0]._handleDragStart.bind(this.options.parent._dragDrop[0]);

            this.options.parent.setPosition({height: 'auto'});
        } else {
            let actions = duplicate(this.options.parent.object.getFlag("monks-active-tiles", "actions") || []);
            let action = actions.find(a => a.id == this.object.id);
            if (action) {
                //clear out these before saving the new information so we don't get data bleed through
                if (action.data.location) action.data.location = {};
                if (action.data.entity) action.data.entity = {};
                if (action.data.item) action.data.item = {};
                if (action.data.actor) action.data.actor = {};
                mergeObject(action, formData);
                this.options.parent.object.data.flags["monks-active-tiles"].actions = actions;
                //update the text for this row
                let trigger = MonksActiveTiles.triggerActions[action.action];
                $(`.action-items .item[data-id="${action.id}"] .item-name h4`, this.options.parent.element).html(trigger.content ? await trigger.content(trigger, action) : i18n(trigger.name));
            }
        }

        this.options.parent.setPosition({height:'auto'});
    }

    checkConditional() {
        let that = this;
        $('.form-group', this.element).each(function () {
            if ($(this).data('conditional'))
                $(this).toggle($(this).data('conditional').call(that, that));
        })
    }

    async changeAction() {
        let command = $('select[name="action"]', this.element).val();
        let action = MonksActiveTiles.triggerActions[command];

        $('.action-controls', this.element).empty();

        let data = this.object.data || {};

        for (let ctrl of (action.ctrls || [])) {
            let options = mergeObject({ showTile: false, showToken: false, showWithin: false, showPlayers: false, showPrevious: false, showControlled: false }, ctrl.options);
            let field = $('<div>').addClass('form-fields').data('ctrl', ctrl);
            let id = 'data.' + ctrl.id + (ctrl.variation ? '.value' : '');
            let val = data[ctrl.id] != undefined ? (data[ctrl.id].value != undefined ? data[ctrl.id].value : data[ctrl.id]) : ctrl.defvalue;

            switch (ctrl.type) {
                case 'filepicker':
                    field
                        .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': game.i18n.localize("FILES.BrowseTooltip") }).addClass('file-picker').html('<i class="fas fa-file-import fa-sm"></i>').click(this._activateFilePicker.bind(this)))
                        .append($('<input>').toggleClass('required', !!ctrl.required).attr({ type: 'text', name: id, placeholder: (ctrl.subtype == 'audio' ? 'path/audio.mp3' : '') }).val(data[ctrl.id]));
                    break;
                case 'filelist':
                    {
                        let ul = $('<ul>').addClass('file-list');
                        field
                            .append($('<div>').addClass('flexcol')
                            .append($('<ol>')
                            .addClass("files-list items-list")
                            .append($('<li>').addClass('items-header flexrow')
                                .append($('<div>').addClass('item-controls').css({'text-align':'right'})
                                    .append($('<a>').css({'margin-right': '12px'}).attr({ 'title': game.i18n.localize("FILES.BrowseTooltip") }).html('<i class="fas fa-plus"></i> Add').on('click', (ev) => { $(ev.currentTarget).next().click(); }))
                                    .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': '_file-list' }).css({ 'display': 'none' }).addClass('file-picker').click(this._activateFilePicker.bind(this))))
                                .append($('<input>').css({ "margin-right": "0px !important" }).attr({ type: 'hidden', name: '_file-list' }).change(this.addToFileList.bind(this)))
                            )
                            .append(ul)));
                        
                        for (let file of (data.files || [])) {
                            ul.toggleClass('required', !!ctrl.required)
                                .append($('<li>').attr('data-id', file.id)
                                    .addClass('flexrow file-row')
                                    .append($('<input>').attr({ 'type': 'hidden', 'name': 'files.id' }).val(file.id))
                                    .append($('<input>').attr({ 'type': 'hidden', 'name': 'files.name' }).val(file.name))
                                    .append($('<span>').html(file.name))
                                    .append($('<a>').html('<i class="fas fa-trash fa-sm"></i>').click(this.removeFile.bind(this, file.id)))
                                );
                        }
                    }
                    break;
                case 'list':
                    {
                        let list;
                        if (typeof ctrl.list == 'function')
                            list = await ctrl.list.call(action, data);
                        else
                            list = (action.values && action.values[ctrl.list]);

                        let select = $('<select>').toggleClass('required', !!ctrl.required).attr({ name: id, 'data-dtype': 'String' });
                        if (ctrl.onChange)
                            select.on('change', ctrl.onChange.bind(this, this));
                        field.append(select);
                        if (list != undefined) {
                            select.append(this.fillList(list, (data[ctrl.id]?.id || data[ctrl.id] || ctrl.defvalue)));
                        }
                    }
                    break;
                case 'select':
                    //so this is the fun one, when the button is pressed, I need to minimize the windows, and wait for a selection
                    if (ctrl.subtype == 'location' || ctrl.subtype == 'either' || ctrl.subtype == 'position') {
                        field
                            .append($('<input>').toggleClass('required', !!ctrl.required).attr({ type: 'hidden', name: id }).val(JSON.stringify(data[ctrl.id])).data({ 'type': ctrl.subtype, deftype: ctrl.defaultType }))
                            .append($('<span>').addClass('display-value').html(await MonksActiveTiles.locationName(data[ctrl.id]) || `<span class="placeholder-style">${ctrl.placeholder || 'Please select a location'}</style>`)) //(data[ctrl.id] ? (data[ctrl.id].name ? data[ctrl.id].name : 'x:' + data[ctrl.id].x + ', y:' + data[ctrl.id].y) + (scene ? ', scene:' + scene.name : '') : '')
                            .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': i18n("MonksActiveTiles.msg.selectlocation") }).addClass('location-picker').html('<i class="fas fa-crosshairs fa-sm"></i>').click(this.selectEntity.bind(this)))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': 'position', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.setposition") }).toggle(ctrl.subtype == 'position').addClass('entity-picker').html('<i class="fas fa-crop-alt fa-sm"></i>').click(this.selectPosition.bind(this)));
                    } else if (ctrl.subtype == 'entity') {
                        field//.css({ 'flex-direction': 'row', 'align-items': 'flex-start' })
                            .append($('<input>').toggleClass('required', !!ctrl.required).attr({ type: 'hidden', name: id }).val(typeof data[ctrl.id] == 'object' ? JSON.stringify(data[ctrl.id]) : data[ctrl.id]).data({ 'restrict': ctrl.restrict, 'type': 'entity', deftype: ctrl.defaultType }))
                            .append($('<span>').addClass('display-value').html(await MonksActiveTiles.entityName(data[ctrl.id], ctrl.defaultType) || `<span class="placeholder-style">${ctrl.placeholder || 'Please select an Entity'}</style>`))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': ctrl.subtype, 'data-target': id, 'title': i18n("MonksActiveTiles.msg.selectentity") }).addClass('entity-picker').html('<i class="fas fa-crosshairs fa-sm"></i>').click(this.selectEntity.bind(this)))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': 'tile', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.usetile") }).toggle(options.showTile).addClass('entity-picker').html('<i class="fas fa-cubes fa-sm"></i>').click(this.selectEntity.bind(this)))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': 'token', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.usetoken") }).toggle(options.showToken).addClass('entity-picker').html('<i class="fas fa-user-alt fa-sm"></i>').click(this.selectEntity.bind(this)))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': 'within', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.usewithin") }).toggle(options.showWithin).addClass('entity-picker').html('<i class="fas fa-street-view fa-sm"></i>').click(this.selectEntity.bind(this)))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': 'players', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.useplayers") }).toggle(options.showPlayers).addClass('entity-picker').html('<i class="fas fa-users fa-sm"></i>').click(this.selectEntity.bind(this)))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': 'previous', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.useprevious") }).toggle(options.showPrevious).addClass('entity-picker').html('<i class="fas fa-history fa-sm"></i>').click(this.selectEntity.bind(this)))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': 'controlled', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.usecontrolled") }).toggle(options.showControlled).addClass('entity-picker').html('<i class="fas fa-bullhorn fa-sm"></i>').click(this.selectEntity.bind(this)))
                            .append($('<button>').attr({ 'type': 'button', 'data-type': 'tagger', 'data-target': id, 'title': i18n("MonksActiveTiles.msg.usetagger") }).toggle(options.showTagger && game.modules.get('tagger')?.active).addClass('entity-picker').html('<i class="fas fa-tag fa-sm"></i>').click(this.addTag.bind(this)));
                    }
                    break;
                case 'text':
                case 'number':
                    {
                        let input = $('<input>').toggleClass('required', !!ctrl.required).attr({ type: ctrl.type, name: id }).val(val);
                        if (ctrl.placeholder)
                            input.attr('placeholder', ctrl.placeholder);
                        if (ctrl.attr)
                            input.attr(ctrl.attr);
                        if (ctrl.type == 'number')
                            input.css({ flex: '0 0 75px', 'text-align': 'right' });
                        if (ctrl.onBlur)
                            input.on('blur', ctrl.onBlur.bind(this, this));
                        field.append(input);
                    }
                    break;
                case 'slider':
                    field.append($('<input>').attr({ type: 'range', name: id, min: ctrl.min || 0, max: ctrl.max || 1.0, step: ctrl.step || 0.1 }).val(val != undefined ? val : 1.0))
                        .append($('<span>').addClass('range-value').html(val != undefined ? val : 1.0));
                    break
                case 'checkbox':
                    {
                        let input = $('<input>').attr({ type: 'checkbox', name: id }).prop('checked', val);
                        if (ctrl.onClick)
                            input.on('click', ctrl.onClick.bind(this, this));
                        field.append(input).css({ flex: '0 0 30px' });
                    }
                    break;
            }

            const div = $('<div>')
                .addClass('form-group')
                .toggle(ctrl.conditional == undefined || (typeof ctrl.conditional == 'function' ? ctrl.conditional.call(this, this) : ctrl.conditional))
                .append($('<label>').html(i18n(ctrl.name) + (!!ctrl.required ? '<span class="req-field" title="This is a required field">*</span>' : '')))
                .append(field);

            if (typeof ctrl.conditional == 'function')
                div.data('conditional', ctrl.conditional);

            if (ctrl.variation) {
                let list = (action.values && action.values[ctrl.variation]);

                let select = $('<select>').addClass('variant').attr({ name:'data.' + ctrl.id + '.var', 'data-dtype': 'String' });
                field.append(select);
                if (list != undefined) {
                    select.append(this.fillList(list, (data[ctrl.id]?.var)));
                }
            }

            div.appendTo($('.action-controls', this.element));

            if (ctrl.id == 'attribute') {
                let that = this;

                this.attributes = this.tokenAttr;

                var substringMatcher = function () {
                    return function findMatches(q, cb) {
                        var matches, substrRegex;

                        // an array that will be populated with substring matches
                        matches = [];

                        // regex used to determine if a string contains the substring `q`
                        substrRegex = new RegExp(q, 'i');

                        // iterate through the pool of strings and for any string that
                        // contains the substring `q`, add it to the `matches` array
                        $.each(that.attributes, function (i, str) {
                            if (substrRegex.test(str)) {
                                matches.push(str);
                            }
                        });

                        cb(matches);
                    };
                };

                $('input[name="data.attribute"]', field).typeahead(
                    {
                        minLength: 1,
                        hint: true,
                        highlight: true
                    },
                    {
                        source: substringMatcher()
                    }
                );
            }
        }

        $('[data-type="delay"]', this.element).toggle(!!this.object.delay && command != 'delay'); //action?.options?.allowDelay === true);

        if(this.rendered)
            this.setPosition();
    }
}