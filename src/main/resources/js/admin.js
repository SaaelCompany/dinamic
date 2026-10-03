/**
 * Form builder. Renders from the JSON already printed into the page.
 * Several blocks, each drawn as a tree. Listeners live on #sdf-app so a re-render cannot drop them.
 */
(function () {
    'use strict';

    function start() {
        var app = document.getElementById('sdf-app');
        if (!app) {
            return;
        }
        var contextPath = app.getAttribute('data-context-path') || '';
        var host = document.getElementById('sdf-blocks');
        var preview = document.getElementById('sdf-preview');
        var textarea = document.getElementById('sdf-rules');
        var config = parseInitial(textarea.value);
        var requestTypes = null;

        app.addEventListener('click', onClick);
        app.addEventListener('input', onInput);
        app.addEventListener('change', onChange);

        refresh();
        loadRequestTypes();

        function parseInitial(text) {
            try {
                return fromRaw(JSON.parse(text));
            } catch (e) {
                return emptyConfig();
            }
        }

        function emptyConfig() {
            return {version: 3, blocks: []};
        }

        function fromRaw(raw) {
            if (!raw || typeof raw !== 'object' || Number(raw.version) === 1) {
                return emptyConfig();
            }
            var source = raw;
            if (!source.blocks) {
                source = {
                    version: 3,
                    blocks: [{
                        id: 'main',
                        title: raw.title == null ? '' : raw.title,
                        clearOnHide: raw.clearOnHide,
                        requestTypeIds: raw.requestTypeIds || [],
                        fields: raw.fields || []
                    }]
                };
            }
            var blocks = [];
            var incoming = source.blocks || [];
            var i;
            for (i = 0; i < incoming.length; i++) {
                blocks.push(normalizeBlock(incoming[i] || {}));
            }
            var cfg = {version: 3, blocks: blocks};
            repair(cfg);
            return cfg;
        }

        function normalizeBlock(src) {
            return {
                id: src.id ? String(src.id) : '',
                title: src.title == null ? '' : String(src.title),
                clearOnHide: src.clearOnHide !== false,
                requestTypeIds: [],
                _rawTypeIds: src.requestTypeIds || [],
                _scope: (src.requestTypeIds && src.requestTypeIds.length) ? 'picked' : 'all',
                place: src.place === 'start' || src.place === 'after' ? src.place : 'end',
                placeAfter: src.placeAfter == null ? '' : String(src.placeAfter),
                fields: normalizeFields(src.fields || [])
            };
        }

        function normalizeFields(incoming) {
            var fields = [];
            var i;
            for (i = 0; i < incoming.length; i++) {
                var src = incoming[i] || {};
                var options = [];
                var rawOptions = src.options || [];
                var o;
                for (o = 0; o < rawOptions.length; o++) {
                    options.push(rawOptions[o] == null ? '' : String(rawOptions[o]));
                }
                var when = null;
                if (src.when && src.when.fieldId) {
                    var values = [];
                    var rawValues = src.when.values || [];
                    var v;
                    for (v = 0; v < rawValues.length; v++) {
                        values.push(String(rawValues[v]));
                    }
                    when = {
                        fieldId: String(src.when.fieldId),
                        values: values,
                        negate: !!src.when.negate,
                        _mode: values.length ? 'selected' : 'any'
                    };
                }
                fields.push({
                    id: src.id ? String(src.id) : '',
                    label: src.label == null ? '' : String(src.label),
                    type: src.type || 'text',
                    options: options,
                    when: when
                });
            }
            return fields;
        }

        function repair(cfg) {
            var seenBlocks = {};
            var b;
            for (b = 0; b < cfg.blocks.length; b++) {
                var block = cfg.blocks[b];
                var ids = [];
                var rawIds = block._rawTypeIds || block.requestTypeIds || [];
                var r;
                for (r = 0; r < rawIds.length; r++) {
                    var number = Number(rawIds[r]);
                    if (number > 0) {
                        ids.push(number);
                    }
                }
                block.requestTypeIds = ids;
                delete block._rawTypeIds;
                if (!block.id || seenBlocks[block.id]) {
                    block.id = freshBlockId(cfg.blocks);
                }
                seenBlocks[block.id] = true;
                repairFields(block.fields);
            }
        }

        function repairFields(fields) {
            var seen = {};
            var i;
            for (i = 0; i < fields.length; i++) {
                var field = fields[i];
                if (!field.id || seen[field.id]) {
                    field.id = nextId(fields);
                }
                if (field.when && !seen[field.when.fieldId]) {
                    field.when = null;
                } else if (field.when && !field.when._mode) {
                    field.when._mode = (field.when.values && field.when.values.length) ? 'selected' : 'any';
                }
                seen[field.id] = true;
            }
        }

        function nextId(fields) {
            var used = {};
            var i;
            for (i = 0; i < fields.length; i++) {
                if (fields[i].id) {
                    used[fields[i].id] = true;
                }
            }
            var n = 1;
            while (used['field' + n]) {
                n++;
            }
            return 'field' + n;
        }

        function freshBlockId(blocks) {
            var used = {};
            var i;
            for (i = 0; i < blocks.length; i++) {
                if (blocks[i].id) {
                    used[blocks[i].id] = true;
                }
            }
            var n = 1;
            while (used['block' + n]) {
                n++;
            }
            return 'block' + n;
        }

        function isChoice(type) {
            return type === 'checkbox' || type === 'radio' || type === 'select';
        }

        function trim(value) {
            return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
        }

        function fieldCount() {
            var n = 0;
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                n += config.blocks[i].fields.length;
            }
            return n;
        }

        function blockById(id) {
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                if (config.blocks[i].id === id) {
                    return config.blocks[i];
                }
            }
            return null;
        }

        function exportWhen(when, parent) {
            if (!when || !when.fieldId) {
                return null;
            }
            var values = [];
            if (parent && isChoice(parent.type) && when._mode !== 'any') {
                var v;
                for (v = 0; v < (when.values || []).length; v++) {
                    var item = trim(when.values[v]);
                    if (item) {
                        values.push(item);
                    }
                }
            }
            return {fieldId: when.fieldId, values: values, negate: false};
        }

        function exportFields(fields, keepBlank) {
            var out = [];
            var i;
            for (i = 0; i < fields.length; i++) {
                var src = fields[i];
                var options = [];
                if (isChoice(src.type)) {
                    var o;
                    for (o = 0; o < (src.options || []).length; o++) {
                        var text = keepBlank ? (src.options[o] == null ? '' : String(src.options[o])) : trim(src.options[o]);
                        if (keepBlank || text) {
                            options.push(text);
                        }
                    }
                }
                var field = {
                    id: src.id,
                    label: keepBlank ? (src.label || '') : trim(src.label),
                    type: src.type || 'text',
                    options: options
                };
                var parent = null;
                if (src.when && src.when.fieldId) {
                    var p;
                    for (p = 0; p < i; p++) {
                        if (fields[p].id === src.when.fieldId) {
                            parent = fields[p];
                        }
                    }
                    field.when = exportWhen(src.when, parent);
                }
                out.push(field);
            }
            return out;
        }

        function editorDocument() {
            var blocks = [];
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                var block = config.blocks[i];
                blocks.push(exportBlock(block, true));
            }
            return {version: 3, blocks: blocks};
        }

        function documentForSave() {
            var blocks = [];
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                var block = config.blocks[i];
                blocks.push(exportBlock(block, false));
            }
            return {version: 3, blocks: blocks};
        }

        function exportBlock(block, keepBlank) {
            var ids = block._scope === 'picked' ? (block.requestTypeIds || []) : [];
            return {
                id: block.id,
                title: keepBlank ? (block.title || '') : trim(block.title || ''),
                clearOnHide: block.clearOnHide !== false,
                requestTypeIds: ids,
                place: block.place || 'end',
                placeAfter: block.placeAfter || '',
                fields: exportFields(block.fields, keepBlank)
            };
        }

        function sync() {
            textarea.value = JSON.stringify(editorDocument(), null, 2);
        }

        function el(tag, className, text) {
            var node = document.createElement(tag);
            if (className) {
                node.className = className;
            }
            if (text != null) {
                node.appendChild(document.createTextNode(text));
            }
            return node;
        }

        function hasClass(node, name) {
            return !!node && (' ' + node.className + ' ').indexOf(' ' + name + ' ') !== -1;
        }

        function button(role, text, disabled) {
            var node = document.createElement('button');
            node.type = 'button';
            node.className = role === 'add-field' || role === 'add-child' ? 'aui-button' : 'aui-button aui-button-subtle';
            node.setAttribute('data-role', role);
            node.appendChild(document.createTextNode(text));
            if (disabled) {
                node.disabled = true;
            }
            return node;
        }

        function roleOf(node) {
            while (node && node !== app) {
                if (node.getAttribute && node.getAttribute('data-role')) {
                    return node.getAttribute('data-role');
                }
                node = node.parentNode;
            }
            return null;
        }

        function locate(node) {
            var blockIndex = -1;
            var fieldIndex = -1;
            while (node && node !== app) {
                if (node.getAttribute) {
                    if (fieldIndex < 0 && node.getAttribute('data-field-index') != null && hasClass(node, 'sdf-card')) {
                        fieldIndex = parseInt(node.getAttribute('data-field-index'), 10);
                        blockIndex = parseInt(node.getAttribute('data-block-index'), 10);
                    }
                    if (blockIndex < 0 && node.getAttribute('data-block-index') != null && hasClass(node, 'sdf-block-card')) {
                        blockIndex = parseInt(node.getAttribute('data-block-index'), 10);
                    }
                }
                node = node.parentNode;
            }
            return {blockIndex: blockIndex, fieldIndex: fieldIndex};
        }

        function render() {
            while (host.firstChild) {
                host.removeChild(host.firstChild);
            }
            document.getElementById('sdf-empty').style.display = config.blocks.length ? 'none' : 'block';
            document.getElementById('sdf-block-count').textContent =
                AJS.I18n.getText('ru.saael.dynamicfields.admin.blocks.count') + ' ' + config.blocks.length;
            document.getElementById('sdf-count').textContent =
                AJS.I18n.getText('ru.saael.dynamicfields.admin.fields.count') + ' ' + fieldCount();
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                host.appendChild(renderBlock(config.blocks[i], i));
            }
            renderPreview();
        }

        function renderBlock(block, blockIndex) {
            var card = el('section', 'sdf-block-card');
            card.setAttribute('data-block-index', String(blockIndex));
            var head = el('div', 'sdf-block-head');
            var title = document.createElement('input');
            title.type = 'text';
            title.className = 'text sdf-block-title';
            title.setAttribute('data-role', 'block-title');
            title.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.blockTitle'));
            title.value = block.title || '';
            head.appendChild(title);
            var clearLabel = el('label', 'sdf-clear-label');
            var clear = document.createElement('input');
            clear.type = 'checkbox';
            clear.setAttribute('data-role', 'block-clear');
            clear.checked = block.clearOnHide !== false;
            clearLabel.appendChild(clear);
            clearLabel.appendChild(document.createTextNode(' ' + AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.clearGlobal')));
            head.appendChild(clearLabel);
            head.appendChild(button('add-field', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addField'), false));
            head.appendChild(button('block-up', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.up'), blockIndex === 0));
            head.appendChild(button('block-down', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.down'), blockIndex === config.blocks.length - 1));
            head.appendChild(button('remove-block', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.removeBlock'), false));
            card.appendChild(head);
            card.appendChild(renderScope(block));
            var tree = el('div', 'sdf-tree');
            if (!block.fields.length) {
                tree.appendChild(el('p', 'sdf-block-empty', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.blockEmpty')));
            }
            var i;
            for (i = 0; i < block.fields.length; i++) {
                tree.appendChild(renderCard(block, blockIndex, i));
            }
            card.appendChild(tree);
            return card;
        }

        function renderScope(block) {
            var box = el('div', 'sdf-scope');
            box.appendChild(el('div', 'sdf-label', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whereTitle')));
            var modes = el('div', 'sdf-scope-modes');
            modes.appendChild(scopeRadio(block, 'all', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.scopeAll'), block._scope !== 'picked'));
            modes.appendChild(scopeRadio(block, 'picked', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.scopePicked'), block._scope === 'picked'));
            box.appendChild(modes);
            if (block._scope === 'picked') {
                box.appendChild(renderTypeList(block));
            }
            var placeRow = el('div', 'sdf-place');
            placeRow.appendChild(el('span', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.placeLabel')));
            placeRow.appendChild(placeSelect(block.place));
            if (block.place === 'after') {
                var after = document.createElement('input');
                after.type = 'text';
                after.className = 'text';
                after.setAttribute('data-role', 'place-after');
                after.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.placeAfter'));
                after.value = block.placeAfter || '';
                placeRow.appendChild(after);
            }
            box.appendChild(placeRow);
            if (block.place === 'after') {
                box.appendChild(el('p', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.placeAfterHint')));
            }
            return box;
        }

        function scopeRadio(block, value, text, checked) {
            var label = document.createElement('label');
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'sdf-scope-' + block.id;
            input.setAttribute('data-role', 'scope');
            input.value = value;
            input.checked = checked;
            label.appendChild(input);
            label.appendChild(document.createTextNode(' ' + text));
            return label;
        }

        function placeSelect(current) {
            var select = document.createElement('select');
            select.className = 'select';
            select.setAttribute('data-role', 'place');
            var places = [
                ['end', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.place.end')],
                ['start', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.place.start')],
                ['after', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.place.after')]
            ];
            var i;
            for (i = 0; i < places.length; i++) {
                var option = document.createElement('option');
                option.value = places[i][0];
                option.appendChild(document.createTextNode(places[i][1]));
                if (places[i][0] === (current || 'end')) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
            return select;
        }

        function renderTypeList(block) {
            var list = el('div', 'sdf-type-list');
            if (requestTypes === null) {
                list.appendChild(el('p', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typesLoading')));
            } else if (!requestTypes.length) {
                list.appendChild(el('p', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.requestTypesHint')));
            }
            var known = {};
            var i;
            var catalog = requestTypes || [];
            for (i = 0; i < catalog.length; i++) {
                known[catalog[i].id] = true;
                list.appendChild(typeCheck(block, catalog[i].id, typeCaption(catalog[i])));
            }
            for (i = 0; i < (block.requestTypeIds || []).length; i++) {
                if (!known[block.requestTypeIds[i]]) {
                    list.appendChild(typeCheck(block, block.requestTypeIds[i], String(block.requestTypeIds[i])));
                }
            }
            var manual = el('div', 'sdf-type-manual');
            var manualInput = document.createElement('input');
            manualInput.type = 'text';
            manualInput.className = 'text';
            manualInput.setAttribute('data-role', 'type-manual');
            manualInput.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typesManual'));
            manual.appendChild(manualInput);
            manual.appendChild(button('type-add', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addType'), false));
            list.appendChild(manual);
            return list;
        }

        function typeCaption(item) {
            if (item.project) {
                return item.project + ' \u2014 ' + item.name;
            }
            return item.name || String(item.id);
        }

        function typeCheck(block, id, caption) {
            var label = document.createElement('label');
            var check = document.createElement('input');
            check.type = 'checkbox';
            check.setAttribute('data-role', 'type-pick');
            check.value = String(id);
            check.checked = hasId(block.requestTypeIds, id);
            label.appendChild(check);
            label.appendChild(document.createTextNode(' ' + caption));
            return label;
        }

        function hasId(list, id) {
            var i;
            for (i = 0; i < (list || []).length; i++) {
                if (Number(list[i]) === Number(id)) {
                    return true;
                }
            }
            return false;
        }

        function loadRequestTypes() {
            AJS.$.ajax({
                url: contextPath + '/rest/servicedeskapi/servicedesk?limit=50',
                type: 'GET',
                dataType: 'json',
                cache: false
            }).done(function (data) {
                var payload = asJson(data);
                var desks = payload.values || [];
                var acc = [];
                var left = desks.length;
                if (!left) {
                    requestTypes = [];
                    render();
                    return;
                }
                function finish() {
                    left--;
                    if (left > 0) {
                        return;
                    }
                    acc.sort(function (a, b) {
                        var ap = (a.project || '') + a.name;
                        var bp = (b.project || '') + b.name;
                        return ap < bp ? -1 : (ap > bp ? 1 : 0);
                    });
                    requestTypes = acc;
                    render();
                }
                var d;
                for (d = 0; d < desks.length; d++) {
                    (function (desk) {
                        AJS.$.ajax({
                            url: contextPath + '/rest/servicedeskapi/servicedesk/' + encodeURIComponent(desk.id) + '/requesttype?limit=100',
                            type: 'GET',
                            dataType: 'json',
                            cache: false
                        }).done(function (page) {
                            var values = asJson(page).values || [];
                            var j;
                            for (j = 0; j < values.length; j++) {
                                acc.push({
                                    id: Number(values[j].id),
                                    name: values[j].name || '',
                                    project: desk.projectName || desk.projectKey || ''
                                });
                            }
                        }).always(finish);
                    })(desks[d]);
                }
            }).fail(function () {
                requestTypes = [];
                render();
            });
        }

        function asJson(data) {
            if (typeof data === 'string') {
                try {
                    return JSON.parse(data);
                } catch (e) {
                    return {};
                }
            }
            return data || {};
        }

        function renderCard(block, blockIndex, index) {
            var field = block.fields[index];
            var card = el('div', 'sdf-card');
            card.setAttribute('data-block-index', String(blockIndex));
            card.setAttribute('data-field-index', String(index));
            var depth = depthOf(block.fields, index);
            if (depth > 0) {
                card.style.marginLeft = (depth * 22) + 'px';
                card.style.boxShadow = 'inset 3px 0 0 #4c9aff';
            }
            var head = el('div', 'sdf-card-head');
            head.appendChild(el('span', 'sdf-num', String(index + 1)));
            var name = document.createElement('input');
            name.type = 'text';
            name.className = 'text sdf-name';
            name.setAttribute('data-role', 'label');
            name.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.name'));
            name.value = field.label || '';
            head.appendChild(name);
            head.appendChild(typeSelect(field.type));
            head.appendChild(button('add-child', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addChild'), false));
            head.appendChild(button('up', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.up'), previousSiblingStart(block.fields, index) < 0));
            head.appendChild(button('down', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.down'), subtreeEnd(block.fields, index) >= block.fields.length));
            head.appendChild(button('remove', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.remove'), false));
            card.appendChild(head);
            if (isChoice(field.type)) {
                card.appendChild(renderOptions(field));
            }
            card.appendChild(renderWhen(block, field, index));
            return card;
        }

        function typeSelect(current) {
            var select = document.createElement('select');
            select.className = 'select';
            select.setAttribute('data-role', 'type');
            var types = [
                ['checkbox', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.checkbox')],
                ['radio', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.radio')],
                ['select', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.select')],
                ['text', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.text')],
                ['textarea', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.textarea')]
            ];
            var i;
            for (i = 0; i < types.length; i++) {
                var option = document.createElement('option');
                option.value = types[i][0];
                option.appendChild(document.createTextNode(types[i][1]));
                if (types[i][0] === current) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
            return select;
        }

        function renderOptions(field) {
            var box = el('div', 'sdf-options');
            box.appendChild(el('div', 'sdf-label', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.options')));
            var options = field.options || [];
            var i;
            for (i = 0; i < options.length; i++) {
                var row = el('div', 'sdf-option-row');
                var input = document.createElement('input');
                input.type = 'text';
                input.className = 'text';
                input.setAttribute('data-role', 'option');
                input.setAttribute('data-option-index', String(i));
                input.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.optionPlaceholder'));
                input.value = options[i];
                row.appendChild(input);
                var remove = button('remove-option', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.remove'), false);
                remove.setAttribute('data-option-index', String(i));
                row.appendChild(remove);
                box.appendChild(row);
            }
            box.appendChild(button('add-option', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addOption'), false));
            return box;
        }

        function renderWhen(block, field, index) {
            var box = el('div', 'sdf-when');
            box.appendChild(el('span', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.showIf')));
            var select = document.createElement('select');
            select.className = 'select';
            select.setAttribute('data-role', 'when-field');
            var always = document.createElement('option');
            always.value = '';
            always.appendChild(document.createTextNode(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.always')));
            select.appendChild(always);
            var i;
            for (i = 0; i < index; i++) {
                var earlier = block.fields[i];
                var option = document.createElement('option');
                option.value = earlier.id;
                option.appendChild(document.createTextNode(earlier.label || earlier.id));
                if (field.when && field.when.fieldId === earlier.id) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
            box.appendChild(select);
            if (field.when && field.when.fieldId) {
                var parent = null;
                for (i = 0; i < index; i++) {
                    if (block.fields[i].id === field.when.fieldId) {
                        parent = block.fields[i];
                    }
                }
                var values = el('div', 'sdf-when-values');
                if (!parent || !isChoice(parent.type)) {
                    values.appendChild(el('span', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenFilled')));
                } else {
                    var mode = field.when._mode === 'selected' || (field.when.values && field.when.values.length) ? 'selected' : 'any';
                    if (field.when._mode === 'any') {
                        mode = 'any';
                    }
                    values.appendChild(modeRadio(block, index, 'any', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenAny'), mode === 'any'));
                    values.appendChild(modeRadio(block, index, 'selected', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenSelected'), mode === 'selected'));
                    var opts = parent.options || [];
                    for (i = 0; i < opts.length; i++) {
                        if (!trim(opts[i])) {
                            continue;
                        }
                        var label = document.createElement('label');
                        var check = document.createElement('input');
                        check.type = 'checkbox';
                        check.setAttribute('data-role', 'when-value');
                        check.value = opts[i];
                        check.checked = contains(field.when.values, opts[i]);
                        label.appendChild(check);
                        label.appendChild(document.createTextNode(' ' + opts[i]));
                        values.appendChild(label);
                    }
                }
                box.appendChild(values);
            }
            return box;
        }

        function modeRadio(block, index, value, text, checked) {
            var label = document.createElement('label');
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'sdf-when-mode-' + block.id + '-' + index;
            input.setAttribute('data-role', 'when-mode');
            input.value = value;
            input.checked = checked;
            label.appendChild(input);
            label.appendChild(document.createTextNode(' ' + text));
            return label;
        }

        function contains(list, value) {
            var i;
            for (i = 0; i < (list || []).length; i++) {
                if (list[i] === value) {
                    return true;
                }
            }
            return false;
        }

        function depthOf(fields, index) {
            var depth = 0;
            var guard = 0;
            var current = fields[index];
            var seen = {};
            while (current && current.when && current.when.fieldId && guard < 40) {
                if (seen[current.when.fieldId]) {
                    break;
                }
                seen[current.when.fieldId] = true;
                var parent = null;
                var i;
                for (i = 0; i < index; i++) {
                    if (fields[i].id === current.when.fieldId) {
                        parent = fields[i];
                    }
                }
                if (!parent) {
                    break;
                }
                depth++;
                current = parent;
                guard++;
            }
            return depth;
        }

        function isUnder(fields, index, ancestorId) {
            var current = fields[index];
            var guard = 0;
            var seen = {};
            while (current && current.when && current.when.fieldId && guard < 40) {
                var parentId = current.when.fieldId;
                if (parentId === ancestorId) {
                    return true;
                }
                if (seen[parentId]) {
                    return false;
                }
                seen[parentId] = true;
                var parent = null;
                var i;
                for (i = 0; i < index; i++) {
                    if (fields[i].id === parentId) {
                        parent = fields[i];
                    }
                }
                current = parent;
                guard++;
            }
            return false;
        }

        function subtreeEnd(fields, index) {
            var id = fields[index].id;
            var end = index + 1;
            while (end < fields.length && isUnder(fields, end, id)) {
                end++;
            }
            return end;
        }

        function previousSiblingStart(fields, index) {
            var s;
            for (s = index - 1; s >= 0; s--) {
                if (subtreeEnd(fields, s) === index) {
                    return s;
                }
            }
            return -1;
        }

        function moveField(blockIndex, index, delta) {
            var fields = config.blocks[blockIndex].fields;
            var end = subtreeEnd(fields, index);
            var chunk = fields.splice(index, end - index);
            var insertAt;
            if (delta < 0) {
                var prev = previousSiblingStart(fields, index);
                if (prev < 0) {
                    insertAt = index;
                } else {
                    insertAt = prev;
                }
            } else if (index >= fields.length) {
                insertAt = fields.length;
            } else {
                var nextEnd = subtreeEnd(fields, index);
                insertAt = nextEnd;
            }
            var i;
            for (i = 0; i < chunk.length; i++) {
                fields.splice(insertAt + i, 0, chunk[i]);
            }
            refresh();
        }

        function onClick(e) {
            var role = roleOf(e.target);
            if (!role) {
                return;
            }
            if (role === 'add-block') {
                addBlock();
                return;
            }
            if (role === 'save') {
                save();
                return;
            }
            if (role === 'reload') {
                reload();
                return;
            }
            if (role === 'example') {
                loadExample();
                return;
            }
            if (role === 'apply-json') {
                applyJson();
                return;
            }
            if (role === 'validate') {
                validateOnly();
                return;
            }
            if (role === 'format') {
                sync();
                return;
            }
            var loc = locate(e.target);
            if (loc.blockIndex < 0) {
                return;
            }
            if (role === 'remove-block') {
                config.blocks.splice(loc.blockIndex, 1);
                refresh();
            } else if (role === 'type-add') {
                addManualType(loc.blockIndex);
            } else if (role === 'add-field') {
                addField(loc.blockIndex, null);
            } else if (role === 'block-up') {
                moveBlock(loc.blockIndex, -1);
            } else if (role === 'block-down') {
                moveBlock(loc.blockIndex, 1);
            } else if (loc.fieldIndex < 0) {
                return;
            } else if (role === 'add-child') {
                addField(loc.blockIndex, loc.fieldIndex);
            } else if (role === 'remove') {
                removeField(loc.blockIndex, loc.fieldIndex);
            } else if (role === 'up') {
                moveField(loc.blockIndex, loc.fieldIndex, -1);
            } else if (role === 'down') {
                moveField(loc.blockIndex, loc.fieldIndex, 1);
            } else if (role === 'add-option') {
                var field = config.blocks[loc.blockIndex].fields[loc.fieldIndex];
                field.options.push('');
                refresh();
                focusOption(loc.blockIndex, loc.fieldIndex, field.options.length - 1);
            } else if (role === 'remove-option') {
                var optIndex = parseInt(e.target.getAttribute('data-option-index'), 10);
                var target = config.blocks[loc.blockIndex].fields[loc.fieldIndex];
                var removed = target.options.splice(optIndex, 1)[0];
                renameOption(config.blocks[loc.blockIndex], target.id, removed, '');
                refresh();
            }
        }

        function onInput(e) {
            var role = roleOf(e.target);
            var loc = locate(e.target);
            if (loc.blockIndex < 0) {
                return;
            }
            var block = config.blocks[loc.blockIndex];
            if (role === 'block-title') {
                block.title = e.target.value;
                sync();
                renderPreview();
            } else if (role === 'place-after') {
                block.placeAfter = e.target.value;
                sync();
            } else if (role === 'label' && loc.fieldIndex >= 0) {
                block.fields[loc.fieldIndex].label = e.target.value;
                refreshKeepingFocus();
            } else if (role === 'option' && loc.fieldIndex >= 0) {
                var optIndex = parseInt(e.target.getAttribute('data-option-index'), 10);
                var field = block.fields[loc.fieldIndex];
                var old = field.options[optIndex];
                field.options[optIndex] = e.target.value;
                renameOption(block, field.id, old, e.target.value);
                refreshKeepingFocus();
            }
        }

        function onChange(e) {
            var role = roleOf(e.target);
            var loc = locate(e.target);
            if (loc.blockIndex < 0) {
                return;
            }
            var block = config.blocks[loc.blockIndex];
            if (role === 'block-clear') {
                block.clearOnHide = e.target.checked;
                sync();
                renderPreview();
                return;
            }
            if (role === 'scope') {
                block._scope = e.target.value === 'picked' ? 'picked' : 'all';
                if (block._scope === 'all') {
                    block.requestTypeIds = [];
                    block._typesBad = false;
                }
                refresh();
                return;
            }
            if (role === 'type-pick') {
                var picked = parseInt(e.target.value, 10);
                var nextIds = [];
                var n;
                for (n = 0; n < (block.requestTypeIds || []).length; n++) {
                    if (Number(block.requestTypeIds[n]) !== picked) {
                        nextIds.push(Number(block.requestTypeIds[n]));
                    }
                }
                if (e.target.checked && picked > 0) {
                    nextIds.push(picked);
                }
                block.requestTypeIds = nextIds;
                block._scope = 'picked';
                block._typesBad = false;
                sync();
                return;
            }
            if (role === 'place') {
                block.place = e.target.value === 'start' || e.target.value === 'after' ? e.target.value : 'end';
                refresh();
                return;
            }
            if (loc.fieldIndex < 0) {
                return;
            }
            var field = block.fields[loc.fieldIndex];
            if (role === 'type') {
                field.type = e.target.value;
                if (isChoice(field.type)) {
                    if (!field.options || !field.options.length) {
                        field.options = [''];
                    }
                } else {
                    field.options = [];
                    relaxDependents(block, field.id);
                }
                refresh();
            } else if (role === 'when-field') {
                if (!e.target.value) {
                    field.when = null;
                } else {
                    field.when = {fieldId: e.target.value, values: [], negate: false, _mode: 'any'};
                }
                refresh();
            } else if (role === 'when-mode' && field.when) {
                field.when._mode = e.target.value === 'selected' ? 'selected' : 'any';
                if (field.when._mode === 'any') {
                    field.when.values = [];
                }
                sync();
                renderPreview();
            } else if (role === 'when-value' && field.when) {
                var next = [];
                var i;
                for (i = 0; i < (field.when.values || []).length; i++) {
                    if (field.when.values[i] !== e.target.value) {
                        next.push(field.when.values[i]);
                    }
                }
                if (e.target.checked) {
                    next.push(e.target.value);
                }
                field.when.values = next;
                field.when._mode = 'selected';
                sync();
                renderPreview();
            }
        }

        function addManualType(blockIndex) {
            var block = config.blocks[blockIndex];
            var card = host.querySelectorAll('.sdf-block-card')[blockIndex];
            var input = card ? card.querySelector('input[data-role="type-manual"]') : null;
            var raw = input ? trim(input.value) : '';
            if (!/^[1-9]\d*$/.test(raw)) {
                block._typesBad = !!raw;
                if (raw) {
                    showMessage('error', [AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needTypes')]);
                }
                return;
            }
            var id = parseInt(raw, 10);
            if (!hasId(block.requestTypeIds, id)) {
                block.requestTypeIds.push(id);
            }
            block._scope = 'picked';
            block._typesBad = false;
            refresh();
        }

        function readTypes(block, raw) {
            var parts = String(raw || '').split(',');
            var ids = [];
            var bad = false;
            var i;
            for (i = 0; i < parts.length; i++) {
                var part = trim(parts[i]);
                if (!part) {
                    continue;
                }
                if (!/^[1-9]\d*$/.test(part)) {
                    bad = true;
                } else {
                    ids.push(parseInt(part, 10));
                }
            }
            block.requestTypeIds = ids;
            block._typesBad = bad;
        }

        function renameOption(block, fieldId, oldValue, newValue) {
            if (oldValue === newValue) {
                return;
            }
            var i;
            var v;
            for (i = 0; i < block.fields.length; i++) {
                var when = block.fields[i].when;
                if (!when || when.fieldId !== fieldId) {
                    continue;
                }
                var next = [];
                for (v = 0; v < when.values.length; v++) {
                    if (when.values[v] === oldValue) {
                        if (newValue) {
                            next.push(newValue);
                        }
                    } else {
                        next.push(when.values[v]);
                    }
                }
                when.values = next;
            }
        }

        function relaxDependents(block, id) {
            var i;
            for (i = 0; i < block.fields.length; i++) {
                if (block.fields[i].when && block.fields[i].when.fieldId === id) {
                    block.fields[i].when.values = [];
                    block.fields[i].when._mode = 'any';
                }
            }
        }

        function refresh() {
            repair(config);
            sync();
            render();
        }

        function refreshKeepingFocus() {
            var snap = snapshotFocus();
            refresh();
            restoreFocus(snap);
        }

        function snapshotFocus() {
            var active = document.activeElement;
            if (!active || !active.getAttribute || !app.contains(active)) {
                return null;
            }
            var loc = locate(active);
            return {
                role: active.getAttribute('data-role'),
                blockIndex: loc.blockIndex,
                fieldIndex: loc.fieldIndex,
                optionIndex: active.getAttribute('data-option-index'),
                start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
                end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
            };
        }

        function restoreFocus(snap) {
            if (!snap || snap.blockIndex < 0 || !snap.role) {
                return;
            }
            var scope = host.querySelectorAll('.sdf-block-card')[snap.blockIndex];
            if (!scope) {
                return;
            }
            var nodes = scope.querySelectorAll('[data-role]');
            var found = null;
            var i;
            for (i = 0; i < nodes.length; i++) {
                if (nodes[i].getAttribute('data-role') !== snap.role) {
                    continue;
                }
                if (snap.fieldIndex >= 0) {
                    var loc = locate(nodes[i]);
                    if (loc.fieldIndex !== snap.fieldIndex) {
                        continue;
                    }
                }
                if (snap.optionIndex != null && nodes[i].getAttribute('data-option-index') !== String(snap.optionIndex)) {
                    continue;
                }
                found = nodes[i];
                break;
            }
            if (!found) {
                return;
            }
            found.focus();
            if (snap.start != null && found.setSelectionRange) {
                try {
                    found.setSelectionRange(snap.start, snap.end);
                } catch (err) {
                    // some input types reject a range
                }
            }
        }

        function focusField(blockIndex, fieldIndex) {
            var scope = host.querySelectorAll('.sdf-block-card')[blockIndex];
            if (!scope) {
                return;
            }
            var cards = scope.querySelectorAll('.sdf-card');
            var card = null;
            var i;
            for (i = 0; i < cards.length; i++) {
                if (parseInt(cards[i].getAttribute('data-field-index'), 10) === fieldIndex) {
                    card = cards[i];
                }
            }
            if (!card) {
                return;
            }
            if (card.scrollIntoView) {
                card.scrollIntoView(false);
            }
            var input = card.querySelector('input[data-role="label"]');
            if (input) {
                input.focus();
            }
        }

        function focusOption(blockIndex, fieldIndex, optionIndex) {
            restoreFocus({
                role: 'option',
                blockIndex: blockIndex,
                fieldIndex: fieldIndex,
                optionIndex: String(optionIndex),
                start: null,
                end: null
            });
        }

        function addBlock() {
            config.blocks.push({
                id: freshBlockId(config.blocks),
                title: '',
                clearOnHide: true,
                requestTypeIds: [],
                _scope: 'all',
                place: 'end',
                placeAfter: '',
                fields: []
            });
            refresh();
            var cards = host.querySelectorAll('.sdf-block-card');
            var card = cards[cards.length - 1];
            if (card && card.scrollIntoView) {
                card.scrollIntoView(false);
            }
            if (card) {
                var title = card.querySelector('input[data-role="block-title"]');
                if (title) {
                    title.focus();
                }
            }
        }

        function addField(blockIndex, parentIndex) {
            var block = config.blocks[blockIndex];
            var field = {id: nextId(block.fields), label: '', type: 'checkbox', options: [''], when: null};
            var insertAt = block.fields.length;
            if (parentIndex != null && parentIndex >= 0) {
                field.when = {fieldId: block.fields[parentIndex].id, values: [], negate: false, _mode: 'any'};
                insertAt = parentIndex + 1;
            }
            block.fields.splice(insertAt, 0, field);
            refresh();
            focusField(blockIndex, insertAt);
        }

        function removeField(blockIndex, fieldIndex) {
            var fields = config.blocks[blockIndex].fields;
            var removed = fields[fieldIndex];
            var parentId = removed.when && removed.when.fieldId;
            fields.splice(fieldIndex, 1);
            var i;
            for (i = 0; i < fields.length; i++) {
                if (fields[i].when && fields[i].when.fieldId === removed.id) {
                    if (parentId) {
                        fields[i].when.fieldId = parentId;
                    } else {
                        fields[i].when = null;
                    }
                }
            }
            refresh();
        }

        function moveBlock(index, delta) {
            var next = index + delta;
            if (next < 0 || next >= config.blocks.length) {
                return;
            }
            var item = config.blocks.splice(index, 1)[0];
            config.blocks.splice(next, 0, item);
            refresh();
        }

        function clientErrors(doc) {
            var errors = [];
            var seen = {};
            function pushText(text) {
                if (!seen[text]) {
                    seen[text] = true;
                    errors.push(text);
                }
            }
            var b;
            for (b = 0; b < config.blocks.length; b++) {
                if (config.blocks[b]._typesBad) {
                    pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needTypes'));
                }
                if (config.blocks[b]._scope === 'picked' && !(doc.blocks[b].requestTypeIds || []).length) {
                    pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.scopeEmpty'));
                }
                if ((config.blocks[b].place === 'after') && !trim(config.blocks[b].placeAfter)) {
                    pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needPlace'));
                }
                var fields = doc.blocks[b].fields;
                var i;
                for (i = 0; i < fields.length; i++) {
                    if (!fields[i].label) {
                        pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needName'));
                    }
                    if (isChoice(fields[i].type) && !fields[i].options.length) {
                        pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needOption'));
                    }
                    var when = config.blocks[b].fields[i].when;
                    if (when && when._mode === 'selected' && !(fields[i].when && fields[i].when.values.length)) {
                        pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needValue'));
                    }
                }
            }
            return errors;
        }

        function showMessage(kind, lines) {
            var box = document.getElementById('sdf-messages');
            var html = '<div class="aui-message aui-message-' + kind + '"><p>';
            var i;
            for (i = 0; i < lines.length; i++) {
                if (i) {
                    html += '<br>';
                }
                html += escapeHtml(lines[i]);
            }
            html += '</p></div>';
            box.innerHTML = html;
        }

        function escapeHtml(text) {
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function parseBody(text) {
            var data = JSON.parse(text);
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            return data;
        }

        function applyDocument(raw) {
            config = fromRaw(raw);
            refresh();
        }

        function save() {
            var doc = documentForSave();
            var errors = clientErrors(doc);
            if (errors.length) {
                showMessage('error', errors);
                return;
            }
            AJS.$.ajax({
                url: contextPath + '/rest/dynamic-fields/1.0/form',
                type: 'PUT',
                contentType: 'application/json',
                data: JSON.stringify(doc),
                dataType: 'text',
                headers: {'X-Atlassian-Token': 'no-check'}
            }).done(function (text) {
                applyDocument(parseBody(text));
                showMessage('success', [AJS.I18n.getText('ru.saael.dynamicfields.admin.saved')]);
            }).fail(function (xhr) {
                showMessage('error', errorLines(xhr));
            });
        }

        function validateOnly() {
            var doc = documentForSave();
            var errors = clientErrors(doc);
            if (errors.length) {
                showMessage('error', errors);
                return;
            }
            AJS.$.ajax({
                url: contextPath + '/rest/dynamic-fields/1.0/form/validate',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(doc),
                dataType: 'text',
                headers: {'X-Atlassian-Token': 'no-check'}
            }).done(function () {
                showMessage('success', [AJS.I18n.getText('ru.saael.dynamicfields.admin.valid')]);
            }).fail(function (xhr) {
                showMessage('error', errorLines(xhr));
            });
        }

        function reload() {
            AJS.$.ajax({
                url: contextPath + '/rest/dynamic-fields/1.0/form',
                type: 'GET',
                dataType: 'text',
                cache: false,
                headers: {'X-Atlassian-Token': 'no-check'}
            }).done(function (text) {
                applyDocument(parseBody(text));
                showMessage('success', [AJS.I18n.getText('ru.saael.dynamicfields.admin.valid')]);
            }).fail(function (xhr) {
                showMessage('error', errorLines(xhr));
            });
        }

        function loadExample() {
            if (fieldCount() && !window.confirm(AJS.I18n.getText('ru.saael.dynamicfields.admin.example.confirm'))) {
                return;
            }
            AJS.$.ajax({
                url: contextPath + '/rest/dynamic-fields/1.0/form/example',
                type: 'GET',
                dataType: 'text',
                headers: {'X-Atlassian-Token': 'no-check'}
            }).done(function (text) {
                applyDocument(parseBody(text));
                showMessage('success', [AJS.I18n.getText('ru.saael.dynamicfields.admin.example.loaded')]);
            }).fail(function (xhr) {
                showMessage('error', errorLines(xhr));
            });
        }

        function applyJson() {
            var raw;
            try {
                raw = JSON.parse(textarea.value);
            } catch (e) {
                showMessage('error', [AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.jsonError')]);
                return;
            }
            if (!raw || typeof raw !== 'object' || Number(raw.version) === 1) {
                showMessage('error', [AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.jsonError')]);
                return;
            }
            applyDocument(raw);
        }

        function errorLines(xhr) {
            var lines = [];
            try {
                var body = parseBody(xhr.responseText || '');
                if (body.errors && body.errors.length) {
                    var i;
                    for (i = 0; i < body.errors.length; i++) {
                        lines.push(body.errors[i]);
                    }
                } else if (body.error) {
                    lines.push(body.error);
                }
            } catch (e) {
                // fall through
            }
            if (!lines.length) {
                lines.push(AJS.I18n.getText('ru.saael.dynamicfields.admin.error.request'));
            }
            return lines;
        }

        function renderPreview() {
            var previous = {};
            var current = document.getElementById('sdf-preview-form');
            if (current) {
                previous = readPreview(current);
            }
            while (preview.firstChild) {
                preview.removeChild(preview.firstChild);
            }
            var form = buildPreview(config);
            preview.appendChild(form);
            restorePreview(form, previous);
            applyPreviewVisibility(form);
            form.addEventListener('change', function () {
                applyPreviewVisibility(form);
            });
            form.addEventListener('input', function () {
                applyPreviewVisibility(form);
            });
        }

        function buildPreview(cfg) {
            var root = el('div', 'sdf-preview-root');
            root.id = 'sdf-preview-form';
            var any = false;
            var b;
            for (b = 0; b < cfg.blocks.length; b++) {
                var block = cfg.blocks[b];
                if (!block.fields.length) {
                    continue;
                }
                any = true;
                var section = el('div', 'sdf-block');
                section.setAttribute('data-sdf-block', block.id);
                if (trim(block.title)) {
                    section.appendChild(el('h3', 'sdf-title', trim(block.title)));
                }
                var visible = visibility(block.fields, {});
                var i;
                for (i = 0; i < block.fields.length; i++) {
                    var node = buildField(block.fields[i], block.id);
                    var show = !!visible[block.fields[i].id];
                    node.setAttribute('data-sdf-shown', show ? '1' : '0');
                    if (!show) {
                        node.className += ' sdf-hidden';
                    }
                    section.appendChild(node);
                }
                root.appendChild(section);
            }
            if (!any) {
                root.appendChild(el('p', 'sdf-preview-empty', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.previewEmpty')));
            }
            return root;
        }

        function buildField(field, blockId) {
            var wrap = el('div', 'sdf-field');
            wrap.setAttribute('data-sdf-field', field.id);
            wrap.setAttribute('data-sdf-type', field.type || 'text');
            wrap.appendChild(el('div', 'sdf-label', field.label || ''));
            var options = field.options || [];
            var i;
            if (field.type === 'checkbox' || field.type === 'radio') {
                for (i = 0; i < options.length; i++) {
                    if (!trim(options[i])) {
                        continue;
                    }
                    var line = el('label', 'sdf-option');
                    var input = document.createElement('input');
                    input.type = field.type;
                    input.value = options[i];
                    if (field.type === 'radio') {
                        input.name = 'sdf-preview-' + blockId + '-' + field.id;
                    }
                    line.appendChild(input);
                    line.appendChild(document.createTextNode(' ' + options[i]));
                    wrap.appendChild(line);
                }
            } else if (field.type === 'select') {
                var select = document.createElement('select');
                select.className = 'sdf-select';
                var empty = document.createElement('option');
                empty.value = '';
                empty.appendChild(document.createTextNode('\u2014'));
                select.appendChild(empty);
                for (i = 0; i < options.length; i++) {
                    if (!trim(options[i])) {
                        continue;
                    }
                    var option = document.createElement('option');
                    option.value = options[i];
                    option.appendChild(document.createTextNode(options[i]));
                    select.appendChild(option);
                }
                wrap.appendChild(select);
            } else if (field.type === 'textarea') {
                var area = document.createElement('textarea');
                area.className = 'sdf-textarea';
                area.rows = 3;
                wrap.appendChild(area);
            } else {
                var text = document.createElement('input');
                text.type = 'text';
                text.className = 'sdf-input';
                wrap.appendChild(text);
            }
            return wrap;
        }

        function readPreview(root) {
            var result = {};
            var sections = root.querySelectorAll('[data-sdf-block]');
            var s;
            for (s = 0; s < sections.length; s++) {
                var id = sections[s].getAttribute('data-sdf-block');
                var values = readValues(sections[s], false);
                var fieldId;
                for (fieldId in values) {
                    if (values.hasOwnProperty(fieldId)) {
                        result[id + '|' + fieldId] = values[fieldId];
                    }
                }
            }
            return result;
        }

        function restorePreview(root, previous) {
            var sections = root.querySelectorAll('[data-sdf-block]');
            var s;
            for (s = 0; s < sections.length; s++) {
                var id = sections[s].getAttribute('data-sdf-block');
                var nodes = sections[s].querySelectorAll('[data-sdf-field]');
                var i;
                for (i = 0; i < nodes.length; i++) {
                    var fieldId = nodes[i].getAttribute('data-sdf-field');
                    var values = previous[id + '|' + fieldId] || [];
                    if (!values.length) {
                        continue;
                    }
                    restoreNode(nodes[i], values);
                }
            }
        }

        function restoreNode(node, values) {
            var type = node.getAttribute('data-sdf-type');
            if (type === 'checkbox' || type === 'radio') {
                var inputs = node.getElementsByTagName('input');
                var n;
                for (n = 0; n < inputs.length; n++) {
                    inputs[n].checked = contains(values, inputs[n].value);
                }
            } else if (type === 'select') {
                node.getElementsByTagName('select')[0].value = values[0];
            } else if (type === 'textarea') {
                node.getElementsByTagName('textarea')[0].value = values[0];
            } else {
                node.getElementsByTagName('input')[0].value = values[0];
            }
        }

        function readValues(root, onlyVisible) {
            var result = {};
            var nodes = root.querySelectorAll('[data-sdf-field]');
            var i;
            for (i = 0; i < nodes.length; i++) {
                if (onlyVisible && (' ' + nodes[i].className + ' ').indexOf(' sdf-hidden ') !== -1) {
                    continue;
                }
                result[nodes[i].getAttribute('data-sdf-field')] = readField(nodes[i]);
            }
            return result;
        }

        function readField(node) {
            var type = node.getAttribute('data-sdf-type');
            var values = [];
            var i;
            if (type === 'checkbox' || type === 'radio') {
                var inputs = node.getElementsByTagName('input');
                for (i = 0; i < inputs.length; i++) {
                    if (inputs[i].checked) {
                        values.push(inputs[i].value);
                    }
                }
            } else if (type === 'select') {
                var select = node.getElementsByTagName('select')[0];
                if (select && select.value) {
                    values.push(select.value);
                }
            } else if (type === 'textarea') {
                var area = node.getElementsByTagName('textarea')[0];
                if (area && trim(area.value)) {
                    values.push(trim(area.value));
                }
            } else {
                var text = node.getElementsByTagName('input')[0];
                if (text && trim(text.value)) {
                    values.push(trim(text.value));
                }
            }
            return values;
        }

        function applyPreviewVisibility(root) {
            var sections = root.querySelectorAll('[data-sdf-block]');
            var i;
            for (i = 0; i < sections.length; i++) {
                var block = blockById(sections[i].getAttribute('data-sdf-block'));
                if (block) {
                    applyVisibility(sections[i], block);
                }
            }
        }

        function applyVisibility(root, block) {
            var values = readValues(root, false);
            var visible = visibility(block.fields, values);
            var nodes = root.querySelectorAll('[data-sdf-field]');
            var i;
            for (i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var show = !!visible[node.getAttribute('data-sdf-field')];
                var was = node.getAttribute('data-sdf-shown') === '1';
                if (!show && was && block.clearOnHide !== false) {
                    clearNode(node);
                }
                node.setAttribute('data-sdf-shown', show ? '1' : '0');
                if (show) {
                    node.className = (' ' + node.className + ' ').replace(' sdf-hidden ', ' ').replace(/^\s+|\s+$/g, '');
                } else if ((' ' + node.className + ' ').indexOf(' sdf-hidden ') === -1) {
                    node.className += ' sdf-hidden';
                }
            }
        }

        function clearNode(node) {
            var inputs = node.getElementsByTagName('input');
            var i;
            for (i = 0; i < inputs.length; i++) {
                if (inputs[i].type === 'checkbox' || inputs[i].type === 'radio') {
                    inputs[i].checked = false;
                } else {
                    inputs[i].value = '';
                }
            }
            var areas = node.getElementsByTagName('textarea');
            for (i = 0; i < areas.length; i++) {
                areas[i].value = '';
            }
            var selects = node.getElementsByTagName('select');
            for (i = 0; i < selects.length; i++) {
                selects[i].selectedIndex = 0;
            }
        }

        function visibility(fields, values) {
            var visible = {};
            var i;
            for (i = 0; i < fields.length; i++) {
                visible[fields[i].id] = shown(fields[i], visible, values || {});
            }
            return visible;
        }

        function shown(field, visible, values) {
            var when = field.when;
            if (!when || !when.fieldId) {
                return true;
            }
            if (!visible[when.fieldId]) {
                return false;
            }
            var current = values[when.fieldId] || [];
            var expected = when.values || [];
            var match = false;
            var i;
            var a;
            var b;
            if (!expected.length) {
                for (i = 0; i < current.length; i++) {
                    if (trim(current[i])) {
                        match = true;
                    }
                }
            } else {
                for (a = 0; a < current.length; a++) {
                    for (b = 0; b < expected.length; b++) {
                        if (String(current[a]) === String(expected[b])) {
                            match = true;
                        }
                    }
                }
            }
            return when.negate ? !match : match;
        }
    }

    if (window.AJS && AJS.toInit) {
        AJS.toInit(start);
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
