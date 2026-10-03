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
        var selectedType = 0;
        var typePicked = false;
        var selectedProject = '';
        var projectChosen = false;
        var selectedField = {blockIndex: -1, index: 0};
        var pendingLink = null;
        var ignoreLinkClickUntil = 0;
        var ignorePickUntil = 0;
        var dragLink = null;
        var dragMove = null;
        var NODE_W = 280;
        var NODE_HEAD = 42;
        var NODE_ROW = 28;
        var portalFields = null;
        var portalFieldsFor = 0;

        app.addEventListener('click', onClick);
        app.addEventListener('input', onInput);
        app.addEventListener('change', onChange);
        app.addEventListener('mousedown', onPortDown);
        app.addEventListener('mousedown', onQuestionDown);

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
                place: src.place === 'start' || src.place === 'after' ? src.place : 'end',
                placeAfter: src.placeAfter == null ? '' : String(src.placeAfter),
                anchorFieldId: src.anchorFieldId == null ? '' : String(src.anchorFieldId),
                anchorValues: stringList(src.anchorValues),
                fields: normalizeFields(src.fields || [])
            };
        }

        function stringList(raw) {
            var out = [];
            var list = raw || [];
            var i;
            for (i = 0; i < list.length; i++) {
                if (list[i] != null && String(list[i])) {
                    out.push(String(list[i]));
                }
            }
            return out;
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
                    blankLabel: src.blankLabel == null ? '' : String(src.blankLabel),
                    hideBlank: !!src.hideBlank,
                    defaults: stringList(src.defaults),
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
                block.requestTypeIds = ids.length ? [ids[0]] : [];
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
            return type === 'checkbox' || type === 'radio' || type === 'select' || type === 'multiselect';
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
                var defaults = [];
                var d;
                for (d = 0; d < (src.defaults || []).length; d++) {
                    var one = keepBlank ? String(src.defaults[d] == null ? '' : src.defaults[d]) : trim(src.defaults[d]);
                    if (keepBlank || one) {
                        defaults.push(one);
                    }
                }
                var field = {
                    id: src.id,
                    label: keepBlank ? (src.label || '') : trim(src.label),
                    type: src.type || 'text',
                    options: options,
                    blankLabel: src.blankLabel || '',
                    hideBlank: !!src.hideBlank,
                    defaults: defaults
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
            return {
                id: block.id,
                title: keepBlank ? (block.title || '') : trim(block.title || ''),
                clearOnHide: block.clearOnHide !== false,
                requestTypeIds: block.requestTypeIds || [],
                place: block.place || 'end',
                placeAfter: block.placeAfter || '',
                anchorFieldId: block.anchorFieldId || '',
                anchorValues: block.place === 'after' ? (block.anchorValues || []) : [],
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
            var primary = role === 'add-field' || role === 'add-child' || role === 'add-option' || role === 'open-type';
            node.className = 'aui-button aui-button-compact' + (primary ? '' : ' aui-button-subtle');
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
                    if (fieldIndex < 0 && node.getAttribute('data-field-index') != null && (hasClass(node, 'sdf-card') || hasClass(node, 'sdf-node'))) {
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
            ensureType();
            while (host.firstChild) {
                host.removeChild(host.firstChild);
            }
            var visible = visibleBlockIndexes();
            var empty = document.getElementById('sdf-empty');
            empty.style.display = visible.length ? 'none' : 'block';
            var note = empty.querySelector('p');
            var exampleBtn = document.getElementById('sdf-example-empty');
            if (!config.blocks.length) {
                note.textContent = AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.empty');
                exampleBtn.style.display = '';
            } else if (!Number(selectedType)) {
                note.textContent = AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.unassignedHint');
                exampleBtn.style.display = 'none';
            } else {
                note.textContent = AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typeEmpty');
                exampleBtn.style.display = 'none';
            }
            document.getElementById('sdf-block-count').textContent =
                AJS.I18n.getText('ru.saael.dynamicfields.admin.blocks.count') + ' ' + visible.length;
            document.getElementById('sdf-count').textContent =
                AJS.I18n.getText('ru.saael.dynamicfields.admin.fields.count') + ' ' + visibleFieldCount();
            var i;
            for (i = 0; i < visible.length; i++) {
                host.appendChild(renderBlock(config.blocks[visible[i]], visible[i]));
            }
            syncProject();
            renderTypeNav();
            renderPreview();
            loadPortalFields();
        }

        function renderBlock(block, blockIndex) {
            var card = el('section', 'sdf-block-card');
            card.setAttribute('data-block-index', String(blockIndex));
            var bar = el('div', 'sdf-block-bar');
            var actions = el('div', 'aui-buttons');
            actions.appendChild(button('add-field', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addField'), false));
            var order = visibleBlockIndexes();
            var pos = indexOfNumber(order, blockIndex);
            actions.appendChild(button('block-up', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.up'), pos <= 0));
            actions.appendChild(button('block-down', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.down'), pos < 0 || pos === order.length - 1));
            actions.appendChild(button('remove-block', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.removeBlock'), false));
            bar.appendChild(actions);
            card.appendChild(bar);
            card.appendChild(renderScope(block));
            card.appendChild(renderCanvas(block, blockIndex));
            var editIndex = editedIndex(block, blockIndex);
            if (editIndex >= 0) {
                card.appendChild(renderCard(block, blockIndex, editIndex));
            }
            return card;
        }

        function editedIndex(block, blockIndex) {
            if (!block.fields.length) {
                return -1;
            }
            if (selectedField.blockIndex === blockIndex && selectedField.index >= 0 && selectedField.index < block.fields.length) {
                return selectedField.index;
            }
            if (selectedField.blockIndex < 0) {
                selectedField = {blockIndex: blockIndex, index: 0};
                return 0;
            }
            return -1;
        }

        function renderScope(block) {
            var box = el('form', 'aui sdf-scope');
            box.onsubmit = function () {
                return false;
            };
            var title = document.createElement('input');
            title.type = 'text';
            title.className = 'text';
            title.setAttribute('data-role', 'block-title');
            title.value = block.title || '';
            var titleGroup = group(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.blockTitle'), title, null);
            var clearLabel = el('label', 'sdf-inline-check sdf-clear-label');
            var clear = document.createElement('input');
            clear.type = 'checkbox';
            clear.setAttribute('data-role', 'block-clear');
            clear.checked = block.clearOnHide !== false;
            clearLabel.appendChild(clear);
            clearLabel.appendChild(document.createTextNode(' ' + AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.clearGlobal')));
            titleGroup.querySelector('.sdf-field-value').appendChild(clearLabel);
            box.appendChild(titleGroup);
            box.appendChild(group(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typeOwner'), blockTypeSelect(block), null));
            var placeRow = el('div', 'sdf-place');
            placeRow.appendChild(placeSelect(block.place));
            if (block.place === 'after') {
                placeRow.appendChild(anchorControl(block));
            }
            var placeGroup = group(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.placeLabel'), placeRow, null);
            if (block.place === 'after') {
                var placeValue = placeGroup.querySelector('.sdf-field-value');
                placeValue.appendChild(el('div', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.placeAfterHint')));
                placeValue.appendChild(anchorValuesBox(block));
            }
            box.appendChild(placeGroup);
            return box;
        }

        function blockTypeSelect(block) {
            var select = document.createElement('select');
            select.className = 'select';
            select.setAttribute('data-role', 'block-type');
            var current = (block.requestTypeIds && block.requestTypeIds.length) ? Number(block.requestTypeIds[0]) : 0;
            var blank = document.createElement('option');
            blank.value = '';
            blank.appendChild(document.createTextNode(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typeUnset')));
            if (!current) {
                blank.selected = true;
            }
            select.appendChild(blank);
            var options = typeOptions();
            var groups = [];
            var grouped = {};
            var i;
            for (i = 0; i < options.length; i++) {
                var key = options[i].project || '';
                if (!grouped[key]) {
                    grouped[key] = [];
                    groups.push(key);
                }
                grouped[key].push(options[i]);
            }
            for (i = 0; i < groups.length; i++) {
                var parent = select;
                if (groups[i]) {
                    parent = document.createElement('optgroup');
                    parent.label = groups[i];
                    select.appendChild(parent);
                }
                var list = grouped[groups[i]];
                var j;
                for (j = 0; j < list.length; j++) {
                    var option = document.createElement('option');
                    option.value = String(list[j].id);
                    option.appendChild(document.createTextNode(list[j].name || list[j].label));
                    if (list[j].id === current) {
                        option.selected = true;
                    }
                    parent.appendChild(option);
                }
            }
            return select;
        }

        function typeOptions() {
            var items = [];
            var seen = {};
            var catalog = requestTypes || [];
            var i;
            for (i = 0; i < catalog.length; i++) {
                var id = Number(catalog[i].id);
                if (!id || seen[id]) {
                    continue;
                }
                seen[id] = true;
                items.push({
                    id: id,
                    name: catalog[i].name || String(id),
                    project: catalog[i].project || '',
                    deskId: catalog[i].deskId || '',
                    label: typeCaption(catalog[i])
                });
            }
            for (i = 0; i < config.blocks.length; i++) {
                var ids = config.blocks[i].requestTypeIds || [];
                if (ids.length && !seen[Number(ids[0])]) {
                    var extra = Number(ids[0]);
                    if (extra > 0) {
                        seen[extra] = true;
                        items.push({id: extra, name: String(extra), project: '', deskId: '', label: String(extra)});
                    }
                }
            }
            return items;
        }

        function blockOnType(block, typeId) {
            var ids = (block && block.requestTypeIds) || [];
            if (!Number(typeId)) {
                return !ids.length;
            }
            return ids.length > 0 && Number(ids[0]) === Number(typeId);
        }

        function visibleBlockIndexes() {
            var out = [];
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                if (blockOnType(config.blocks[i], selectedType)) {
                    out.push(i);
                }
            }
            return out;
        }

        function visibleFieldCount() {
            var n = 0;
            var order = visibleBlockIndexes();
            var i;
            for (i = 0; i < order.length; i++) {
                n += config.blocks[order[i]].fields.length;
            }
            return n;
        }

        function indexOfNumber(list, value) {
            var i;
            for (i = 0; i < list.length; i++) {
                if (list[i] === value) {
                    return i;
                }
            }
            return -1;
        }

        function countForType(typeId) {
            var n = 0;
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                if (blockOnType(config.blocks[i], typeId)) {
                    n++;
                }
            }
            return n;
        }

        function ensureType() {
            if (typePicked) {
                return;
            }
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                if ((config.blocks[i].requestTypeIds || []).length) {
                    selectedType = Number(config.blocks[i].requestTypeIds[0]);
                    typePicked = true;
                    return;
                }
            }
            if (config.blocks.length) {
                selectedType = 0;
                typePicked = true;
                return;
            }
            if (requestTypes && requestTypes.length) {
                selectedType = Number(requestTypes[0].id);
                typePicked = true;
            }
        }

        function renderTypeNav() {
            var nav = document.getElementById('sdf-type-nav');
            if (!nav) {
                return;
            }
            while (nav.firstChild) {
                nav.removeChild(nav.firstChild);
            }
            nav.className = 'aui-navgroup aui-navgroup-vertical sdf-type-nav';
            var inner = el('div', 'aui-navgroup-inner');
            var projects = projectNames();
            if (projects.length) {
                var projectBox = el('div', 'sdf-project');
                projectBox.appendChild(el('div', 'aui-nav-heading', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.projectNav')));
                projectBox.appendChild(projectSelect(projects));
                inner.appendChild(projectBox);
            }
            inner.appendChild(el('div', 'aui-nav-heading', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typeNav')));
            var list = el('ul', 'aui-nav');
            var options = typesInProject();
            var i;
            if (countForType(0) > 0 || !Number(selectedType)) {
                list.appendChild(typeLink(0, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.unassigned'), countForType(0), !Number(selectedType)));
            }
            for (i = 0; i < options.length; i++) {
                list.appendChild(typeLink(options[i].id, options[i].name || options[i].label, countForType(options[i].id), Number(selectedType) === options[i].id));
            }
            if (requestTypes === null) {
                var loading = el('li');
                loading.appendChild(el('span', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typesLoading')));
                list.appendChild(loading);
            }
            inner.appendChild(list);
            if (!requestTypes || !requestTypes.length) {
                var manual = el('div', 'sdf-type-manual');
                var manualInput = document.createElement('input');
                manualInput.type = 'text';
                manualInput.className = 'text';
                manualInput.setAttribute('data-role', 'type-manual');
                manualInput.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typesManual'));
                manual.appendChild(manualInput);
                manual.appendChild(button('open-type', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addType'), false));
                inner.appendChild(manual);
            }
            var hint = !Number(selectedType)
                ? AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.unassignedHint')
                : AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.viewingHint');
            inner.appendChild(el('p', 'description', hint));
            nav.appendChild(inner);
        }

        function typeLink(id, label, count, selected) {
            var item = el('li', selected ? 'aui-nav-selected' : null);
            var link = document.createElement('a');
            link.href = '#sdf-app';
            link.setAttribute('data-role', 'current-type');
            link.setAttribute('data-value', String(id));
            link.appendChild(document.createTextNode(label));
            if (count) {
                link.appendChild(document.createTextNode(' '));
                link.appendChild(el('span', 'aui-lozenge aui-lozenge-subtle', String(count)));
            }
            item.appendChild(link);
            return item;
        }

        function projectNames() {
            var seen = {};
            var out = [];
            var options = typeOptions();
            var i;
            for (i = 0; i < options.length; i++) {
                if (!options[i].project || seen[options[i].project]) {
                    continue;
                }
                seen[options[i].project] = true;
                out.push(options[i].project);
            }
            out.sort();
            return out;
        }

        function typesInProject() {
            var options = typeOptions();
            var out = [];
            var i;
            for (i = 0; i < options.length; i++) {
                if (!options[i].project || options[i].project === selectedProject) {
                    out.push(options[i]);
                }
            }
            return out;
        }

        function projectSelect(projects) {
            var select = document.createElement('select');
            select.className = 'select';
            select.setAttribute('data-role', 'current-project');
            var i;
            for (i = 0; i < projects.length; i++) {
                var option = document.createElement('option');
                option.value = projects[i];
                option.appendChild(document.createTextNode(projects[i]));
                if (projects[i] === selectedProject) {
                    option.selected = true;
                }
                select.appendChild(option);
            }
            return select;
        }

        function syncProject() {
            if (projectChosen || !(selectedType > 0)) {
                return;
            }
            var options = typeOptions();
            var i;
            for (i = 0; i < options.length; i++) {
                if (options[i].id === Number(selectedType) && options[i].project) {
                    selectedProject = options[i].project;
                    projectChosen = true;
                    return;
                }
            }
        }

        function typeRecord(typeId) {
            var options = typeOptions();
            var i;
            for (i = 0; i < options.length; i++) {
                if (options[i].id === Number(typeId)) {
                    return options[i];
                }
            }
            return null;
        }

        function portalFieldById(fieldId) {
            var list = portalFields || [];
            var i;
            for (i = 0; i < list.length; i++) {
                if (list[i].fieldId === fieldId) {
                    return list[i];
                }
            }
            return null;
        }

        function loadPortalFields() {
            if (!(selectedType > 0)) {
                portalFields = [];
                portalFieldsFor = 0;
                return;
            }
            if (portalFieldsFor === selectedType) {
                return;
            }
            var type = typeRecord(selectedType);
            if (!type || !type.deskId) {
                if (requestTypes) {
                    portalFields = [];
                    portalFieldsFor = selectedType;
                }
                return;
            }
            portalFieldsFor = selectedType;
            portalFields = null;
            AJS.$.ajax({
                url: contextPath + '/rest/servicedeskapi/servicedesk/' + encodeURIComponent(type.deskId) + '/requesttype/' + encodeURIComponent(String(type.id)) + '/field',
                type: 'GET',
                dataType: 'json',
                cache: false
            }).done(function (data) {
                if (portalFieldsFor !== Number(type.id)) {
                    return;
                }
                var payload = asJson(data);
                var values = payload.requestTypeFields || payload.values || [];
                var list = [];
                var i;
                for (i = 0; i < values.length; i++) {
                    var item = values[i] || {};
                    var choices = [];
                    var raw = item.validValues || [];
                    var v;
                    for (v = 0; v < raw.length; v++) {
                        var label = raw[v].label || raw[v].value || '';
                        if (label) {
                            choices.push(String(label));
                        }
                    }
                    if (item.fieldId) {
                        list.push({
                            fieldId: String(item.fieldId),
                            name: String(item.name || item.fieldId),
                            values: choices
                        });
                    }
                }
                portalFields = list;
                render();
            }).fail(function () {
                if (portalFieldsFor === Number(type.id)) {
                    portalFields = [];
                    render();
                }
            });
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

        function typeCaption(item) {
            if (item.project) {
                return item.project + ' \u2014 ' + item.name;
            }
            return item.name || String(item.id);
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
                                    project: desk.projectName || desk.projectKey || '',
                                    deskId: String(desk.id)
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

        function anchorControl(block) {
            if (portalFields === null) {
                return el('span', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldsLoading'));
            }
            if (!portalFields.length) {
                var input = document.createElement('input');
                input.type = 'text';
                input.className = 'text';
                input.setAttribute('data-role', 'place-after');
                input.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.placeAfter'));
                input.value = block.placeAfter || '';
                return input;
            }
            var select = document.createElement('select');
            select.className = 'select';
            select.setAttribute('data-role', 'anchor-field');
            var blank = document.createElement('option');
            blank.value = '';
            blank.appendChild(document.createTextNode(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.anchorNone')));
            select.appendChild(blank);
            var known = false;
            var i;
            for (i = 0; i < portalFields.length; i++) {
                var field = portalFields[i];
                var option = document.createElement('option');
                option.value = field.fieldId;
                option.appendChild(document.createTextNode(field.name));
                if (block.anchorFieldId === field.fieldId || (!block.anchorFieldId && block.placeAfter === field.name)) {
                    option.selected = true;
                    known = true;
                }
                select.appendChild(option);
            }
            if (!known && block.placeAfter) {
                var extra = document.createElement('option');
                extra.value = 'label:' + block.placeAfter;
                extra.appendChild(document.createTextNode(block.placeAfter));
                extra.selected = true;
                select.appendChild(extra);
            }
            return select;
        }

        function anchorValuesBox(block) {
            var box = el('div', 'sdf-when-values');
            var field = portalFieldById(block.anchorFieldId);
            if (!field || !field.values.length) {
                return box;
            }
            box.appendChild(el('div', 'sdf-label', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.anchorWhen')));
            var i;
            for (i = 0; i < field.values.length; i++) {
                var label = document.createElement('label');
                var check = document.createElement('input');
                check.type = 'checkbox';
                check.setAttribute('data-role', 'anchor-value');
                check.value = field.values[i];
                check.checked = contains(block.anchorValues, field.values[i]);
                label.appendChild(check);
                label.appendChild(document.createTextNode(' ' + field.values[i]));
                box.appendChild(label);
            }
            return box;
        }

        function renderCanvas(block, blockIndex) {
            var wrap = el('div', 'sdf-canvas-wrap');
            wrap.appendChild(el('p', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeHint')));
            if (pendingLink && pendingLink.blockIndex === blockIndex) {
                wrap.appendChild(el('p', 'sdf-link-banner', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeLinking')));
            }
            var canvas = el('div', 'sdf-canvas');
            var laid = layoutNodes(block);
            if (!laid.length) {
                canvas.appendChild(el('p', 'sdf-block-empty', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.blockEmpty')));
                wrap.appendChild(canvas);
                return wrap;
            }
            var maxX = 200;
            var maxY = 80;
            var i;
            for (i = 0; i < laid.length; i++) {
                if (laid[i].x + NODE_W + 24 > maxX) {
                    maxX = laid[i].x + NODE_W + 24;
                }
                if (laid[i].y + laid[i].h + 16 > maxY) {
                    maxY = laid[i].y + laid[i].h + 16;
                }
            }
            if (maxY < 200) {
                maxY = 200;
            }
            var board = el('div', 'sdf-board');
            board.style.width = maxX + 'px';
            board.style.height = maxY + 'px';
            board.appendChild(edgeSvg(block, blockIndex, laid, maxX, maxY));
            for (i = 0; i < laid.length; i++) {
                board.appendChild(nodeButton(block, blockIndex, laid[i]));
            }
            canvas.appendChild(board);
            wrap.appendChild(canvas);
            return wrap;
        }

        function filledOptions(field) {
            var out = [];
            var i;
            for (i = 0; i < (field.options || []).length; i++) {
                if (trim(field.options[i])) {
                    out.push(field.options[i]);
                }
            }
            return out;
        }

        function nodeBoxHeight(field) {
            var rows = isChoice(field.type) ? filledOptions(field).length : 1;
            if (!rows) {
                rows = 1;
            }
            return 8 + NODE_HEAD + rows * NODE_ROW + 8;
        }

        function layoutNodes(block) {
            var columns = [];
            var i;
            for (i = 0; i < block.fields.length; i++) {
                var depth = depthOf(block.fields, i);
                if (!columns[depth]) {
                    columns[depth] = [];
                }
                columns[depth].push(i);
            }
            var laid = [];
            var col;
            for (col = 0; col < columns.length; col++) {
                var indexes = columns[col] || [];
                var y = 16;
                var row;
                for (row = 0; row < indexes.length; row++) {
                    var index = indexes[row];
                    var field = block.fields[index];
                    var options = isChoice(field.type) ? filledOptions(field) : [''];
                    if (!options.length) {
                        options = [''];
                    }
                    var item = {
                        index: index,
                        x: 16 + col * (NODE_W + 88),
                        y: y,
                        h: nodeBoxHeight(field),
                        ports: []
                    };
                    var p;
                    for (p = 0; p < options.length; p++) {
                        item.ports.push({
                            option: options[p],
                            y: 8 + NODE_HEAD + p * NODE_ROW + NODE_ROW / 2
                        });
                    }
                    laid.push(item);
                    y += item.h + 16;
                }
            }
            return laid;
        }

        function edgeSvg(block, blockIndex, laid, width, height) {
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'sdf-edges');
            svg.setAttribute('width', String(width));
            svg.setAttribute('height', String(height));
            var indexAt = {};
            var i;
            for (i = 0; i < laid.length; i++) {
                indexAt[laid[i].index] = i;
            }
            function leftOf(at) {
                return {x: laid[at].x, y: laid[at].y + laid[at].h / 2};
            }
            function portPoint(item, option) {
                var ports = item.ports || [];
                var n;
                for (n = 0; n < ports.length; n++) {
                    if (option && ports[n].option === option) {
                        return {x: item.x + NODE_W, y: item.y + ports[n].y};
                    }
                }
                return {x: item.x + NODE_W, y: item.y + 22};
            }
            function line(from, to, childIndex) {
                var mid = (from.x + to.x) / 2;
                var d = 'M ' + from.x + ' ' + from.y + ' C ' + mid + ' ' + from.y + ', ' + mid + ' ' + to.y + ', ' + to.x + ' ' + to.y;
                var hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                hit.setAttribute('d', d);
                hit.setAttribute('fill', 'none');
                hit.setAttribute('stroke', 'transparent');
                hit.setAttribute('stroke-width', '22');
                hit.setAttribute('data-role', 'unlink');
                hit.setAttribute('data-block-index', String(blockIndex));
                hit.setAttribute('data-field-index', String(childIndex));
                hit.setAttribute('class', 'sdf-edge-hit');
                svg.appendChild(hit);
                var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', d);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#4c9aff');
                path.setAttribute('stroke-width', '1.5');
                path.setAttribute('class', 'sdf-edge');
                svg.appendChild(path);
            }
            for (i = 0; i < block.fields.length; i++) {
                if (indexAt[i] == null) {
                    continue;
                }
                var parentAt = -1;
                var parentId = block.fields[i].when && block.fields[i].when.fieldId;
                if (parentId) {
                    var p;
                    for (p = 0; p < i; p++) {
                        if (block.fields[p].id === parentId) {
                            parentAt = indexAt[p];
                        }
                    }
                }
                if (parentAt < 0) {
                    continue;
                }
                var when = block.fields[i].when;
                var values = when.values || [];
                if (!values.length || when._mode === 'any') {
                    line({x: laid[parentAt].x + NODE_W, y: laid[parentAt].y + 22}, leftOf(indexAt[i]), i);
                } else {
                    var v;
                    for (v = 0; v < values.length; v++) {
                        line(portPoint(laid[parentAt], values[v]), leftOf(indexAt[i]), i);
                    }
                }
            }
            return svg;
        }

        function nodeButton(block, blockIndex, laid) {
            var field = block.fields[laid.index];
            var node = el('div', 'sdf-node');
            node.style.left = laid.x + 'px';
            node.style.top = laid.y + 'px';
            node.style.width = NODE_W + 'px';
            node.style.height = laid.h + 'px';
            node.setAttribute('data-role', 'pick-node');
            node.setAttribute('data-block-index', String(blockIndex));
            node.setAttribute('data-field-index', String(laid.index));
            if (selectedField.blockIndex === blockIndex && selectedField.index === laid.index) {
                node.className += ' sdf-node-selected';
            }
            var question = el('div', 'sdf-node-question');
            question.setAttribute('data-role', 'pick-node');
            question.appendChild(el('span', 'sdf-node-kicker', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.name')));
            var title = trim(field.label) || AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.questionOptional');
            question.appendChild(el('span', 'sdf-node-title', title));
            node.appendChild(question);
            var answers = el('div', 'sdf-node-answers');
            if (isChoice(field.type)) {
                var opts = filledOptions(field);
                var o;
                if (!opts.length) {
                    answers.appendChild(el('div', 'sdf-port-empty', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addOption')));
                }
                for (o = 0; o < opts.length; o++) {
                    answers.appendChild(portRow(blockIndex, laid.index, opts[o], opts[o]));
                }
            } else {
                answers.appendChild(portRow(blockIndex, laid.index, '', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeNext')));
            }
            node.appendChild(answers);
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'sdf-node-del';
            remove.setAttribute('data-role', 'remove');
            remove.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeRemove'));
            remove.appendChild(document.createTextNode('\u00d7'));
            node.appendChild(remove);
            return node;
        }

        function portRow(blockIndex, fieldIndex, option, text) {
            var row = el('div', 'sdf-port-row');
            row.appendChild(el('span', 'sdf-port-text', text));
            var add = document.createElement('button');
            add.type = 'button';
            add.className = 'sdf-port-add';
            add.setAttribute('data-role', 'add-from-answer');
            add.setAttribute('data-option', option);
            add.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeAdd'));
            add.appendChild(document.createTextNode('+'));
            row.appendChild(add);
            var port = document.createElement('button');
            port.type = 'button';
            port.className = 'sdf-port';
            port.setAttribute('data-role', 'link-from');
            port.setAttribute('data-option', option);
            port.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeConnect'));
            if (pendingLink && pendingLink.blockIndex === blockIndex && pendingLink.fieldIndex === fieldIndex && pendingLink.option === option) {
                port.className += ' sdf-port-armed';
            }
            row.appendChild(port);
            return row;
        }

        function typeName(type) {
            if (type === 'checkbox') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.checkbox');
            }
            if (type === 'radio') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.radio');
            }
            if (type === 'select') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.select');
            }
            if (type === 'multiselect') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.multiselect');
            }
            if (type === 'textarea') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.textarea');
            }
            if (type === 'number') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.number');
            }
            if (type === 'date') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.date');
            }
            if (type === 'time') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.time');
            }
            if (type === 'datetime') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.datetime');
            }
            if (type === 'url') {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.url');
            }
            return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.text');
        }

        function renderCard(block, blockIndex, index) {
            var field = block.fields[index];
            var card = el('form', 'sdf-card aui');
            card.setAttribute('data-block-index', String(blockIndex));
            card.setAttribute('data-field-index', String(index));
            card.onsubmit = function () {
                return false;
            };
            card.appendChild(group(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.name'), questionInput(field), AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.questionHint')));
            card.appendChild(group(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typeLabel'), typeSelect(field.type), null));
            if (isChoice(field.type)) {
                card.appendChild(renderOptions(field));
            }
            if (field.type === 'select') {
                card.appendChild(renderBlank(field));
            }
            card.appendChild(renderDefault(field));
            card.appendChild(group(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldId'), idInput(field), AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.automationHint')));
            card.appendChild(renderWhen(block, field, index));
            var buttons = el('div', 'buttons-container');
            var row = el('div', 'buttons');
            row.appendChild(button('add-child', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addChild'), false));
            row.appendChild(button('up', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.up'), previousSiblingStart(block.fields, index) < 0));
            row.appendChild(button('down', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.down'), subtreeEnd(block.fields, index) >= block.fields.length));
            if (field.when && field.when.fieldId) {
                row.appendChild(button('unlink-field', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.unlink'), false));
            }
            row.appendChild(button('remove', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.remove'), false));
            buttons.appendChild(row);
            card.appendChild(buttons);
            return card;
        }

        function group(labelText, control, description) {
            var box = el('div', 'field-group');
            box.appendChild(el('label', null, labelText));
            var value = el('div', 'sdf-field-value');
            value.appendChild(control);
            if (description) {
                value.appendChild(el('div', 'description', description));
            }
            box.appendChild(value);
            return box;
        }

        function questionInput(field) {
            var name = document.createElement('input');
            name.type = 'text';
            name.className = 'text long-field';
            name.setAttribute('data-role', 'label');
            name.value = field.label || '';
            return name;
        }

        function idInput(field) {
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'text';
            input.readOnly = true;
            input.value = field.id || '';
            return input;
        }

        function renderBlank(field) {
            var box = el('div', 'field-group');
            box.appendChild(el('label', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.blankLabel')));
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'text';
            input.setAttribute('data-role', 'blank-label');
            input.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.portal.blank'));
            input.value = field.blankLabel || '';
            var value = el('div', 'sdf-field-value');
            value.appendChild(input);
            var hide = document.createElement('label');
            hide.className = 'sdf-inline-check';
            var check = document.createElement('input');
            check.type = 'checkbox';
            check.setAttribute('data-role', 'hide-blank');
            check.checked = !!field.hideBlank;
            hide.appendChild(check);
            hide.appendChild(document.createTextNode(' ' + AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.hideBlank')));
            value.appendChild(hide);
            value.appendChild(el('div', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.blankHint')));
            box.appendChild(value);
            return box;
        }

        function renderDefault(field) {
            var box = el('div', 'field-group');
            box.appendChild(el('label', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.defaultValue')));
            var value = el('div', 'sdf-field-value');
            if (isChoice(field.type)) {
                var opts = filledOptions(field);
                if (!opts.length) {
                    value.appendChild(el('div', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needOption')));
                    box.appendChild(value);
                    return box;
                }
                var multiple = field.type === 'checkbox' || field.type === 'multiselect';
                if (!multiple) {
                    var noneLabel = document.createElement('label');
                    noneLabel.className = 'sdf-inline-check';
                    var none = document.createElement('input');
                    none.type = 'radio';
                    none.name = 'sdf-default-' + field.id;
                    none.setAttribute('data-role', 'default-choice');
                    none.value = '';
                    none.checked = !(field.defaults && field.defaults.length);
                    noneLabel.appendChild(none);
                    noneLabel.appendChild(document.createTextNode(' ' + AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.defaultNone')));
                    value.appendChild(noneLabel);
                }
                var i;
                for (i = 0; i < opts.length; i++) {
                    var label = document.createElement('label');
                    label.className = 'sdf-inline-check';
                    var input = document.createElement('input');
                    input.type = multiple ? 'checkbox' : 'radio';
                    input.name = 'sdf-default-' + field.id;
                    input.setAttribute('data-role', 'default-choice');
                    input.value = opts[i];
                    input.checked = contains(field.defaults, opts[i]);
                    label.appendChild(input);
                    label.appendChild(document.createTextNode(' ' + opts[i]));
                    value.appendChild(label);
                }
                box.appendChild(value);
                return box;
            }
            var inputText = document.createElement('input');
            inputText.type = inputKind(field.type);
            inputText.className = 'text';
            inputText.setAttribute('data-role', 'default-text');
            inputText.value = (field.defaults && field.defaults.length) ? field.defaults[0] : '';
            value.appendChild(inputText);
            box.appendChild(value);
            return box;
        }

        function inputKind(type) {
            if (type === 'number') {
                return 'number';
            }
            if (type === 'date') {
                return 'date';
            }
            if (type === 'time') {
                return 'time';
            }
            if (type === 'datetime') {
                return 'datetime-local';
            }
            if (type === 'url') {
                return 'url';
            }
            return 'text';
        }

        function typeSelect(current) {
            var select = document.createElement('select');
            select.className = 'select';
            select.setAttribute('data-role', 'type');
            var types = [
                ['checkbox', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.checkbox')],
                ['radio', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.radio')],
                ['select', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.select')],
                ['multiselect', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.multiselect')],
                ['text', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.text')],
                ['textarea', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.textarea')],
                ['number', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.number')],
                ['date', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.date')],
                ['time', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.time')],
                ['datetime', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.datetime')],
                ['url', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.url')]
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
            var box = el('div', 'field-group sdf-options');
            box.appendChild(el('label', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.options')));
            var value = el('div', 'sdf-field-value');
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
                value.appendChild(row);
            }
            value.appendChild(button('add-option', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addOption'), false));
            box.appendChild(value);
            return box;
        }

        function renderWhen(block, field, index) {
            var box = el('div', 'field-group');
            box.appendChild(el('label', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.showIf')));
            var value = el('div', 'sdf-field-value');
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
            value.appendChild(select);
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
                        label.className = 'sdf-inline-check';
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
                value.appendChild(values);
            }
            box.appendChild(value);
            return box;
        }

        function modeRadio(block, index, value, text, checked) {
            var label = document.createElement('label');
            label.className = 'sdf-inline-check';
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

        function fieldAt(node) {
            while (node && node !== app) {
                if (node.getAttribute && node.getAttribute('data-field-index') != null && (hasClass(node, 'sdf-node') || hasClass(node, 'sdf-card'))) {
                    return {
                        blockIndex: parseInt(node.getAttribute('data-block-index'), 10) || 0,
                        fieldIndex: parseInt(node.getAttribute('data-field-index'), 10) || 0
                    };
                }
                node = node.parentNode;
            }
            return null;
        }

        function optionOf(node) {
            while (node && node !== app) {
                if (node.getAttribute && node.getAttribute('data-role') && node.getAttribute('data-option') != null) {
                    return node.getAttribute('data-option') || '';
                }
                node = node.parentNode;
            }
            return '';
        }

        function connectFields(blockIndex, fromIndex, option, toIndex) {
            var fields = config.blocks[blockIndex].fields;
            if (!fields[fromIndex] || !fields[toIndex] || fromIndex === toIndex) {
                return;
            }
            if (isUnder(fields, fromIndex, fields[toIndex].id)) {
                pendingLink = null;
                showMessage('error', [AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeCycle')]);
                return;
            }
            var sourceId = fields[fromIndex].id;
            if (toIndex < fromIndex) {
                var end = subtreeEnd(fields, toIndex);
                var chunk = fields.splice(toIndex, end - toIndex);
                fromIndex -= chunk.length;
                var insertAt = subtreeEnd(fields, fromIndex);
                var n;
                for (n = 0; n < chunk.length; n++) {
                    fields.splice(insertAt + n, 0, chunk[n]);
                }
                toIndex = insertAt;
            }
            fields[toIndex].when = {
                fieldId: sourceId,
                values: option ? [option] : [],
                negate: false,
                _mode: option ? 'selected' : 'any'
            };
            pendingLink = null;
            selectedField = {blockIndex: blockIndex, index: toIndex};
            refresh();
        }

        function onPortDown(e) {
            if (roleOf(e.target) !== 'link-from') {
                return;
            }
            if (e.button) {
                return;
            }
            var source = fieldAt(e.target);
            var board = e.target;
            while (board && board !== app && !hasClass(board, 'sdf-board')) {
                board = board.parentNode;
            }
            if (!source || !board) {
                return;
            }
            var boardBox = board.getBoundingClientRect();
            var portBox = e.target.getBoundingClientRect();
            dragLink = {
                blockIndex: source.blockIndex,
                fieldIndex: source.fieldIndex,
                option: optionOf(e.target),
                moved: false,
                board: board,
                x0: e.clientX,
                y0: e.clientY,
                x: portBox.left + portBox.width / 2 - boardBox.left,
                y: portBox.top + portBox.height / 2 - boardBox.top
            };
            document.addEventListener('mousemove', onPortMove);
            document.addEventListener('mouseup', onPortUp);
        }

        function onPortMove(e) {
            if (!dragLink) {
                return;
            }
            if (Math.abs(e.clientX - dragLink.x0) + Math.abs(e.clientY - dragLink.y0) > 4) {
                dragLink.moved = true;
            }
            var boardBox = dragLink.board.getBoundingClientRect();
            paintRubber(dragLink.board, dragLink.x, dragLink.y, e.clientX - boardBox.left, e.clientY - boardBox.top);
        }

        function onPortUp(e) {
            document.removeEventListener('mousemove', onPortMove);
            document.removeEventListener('mouseup', onPortUp);
            if (!dragLink) {
                return;
            }
            var info = dragLink;
            dragLink = null;
            clearRubber(info.board);
            if (!info.moved) {
                return;
            }
            ignoreLinkClickUntil = new Date().getTime() + 400;
            var under = document.elementFromPoint(e.clientX, e.clientY);
            var target = fieldAt(under);
            if (target && target.blockIndex === info.blockIndex && target.fieldIndex !== info.fieldIndex) {
                connectFields(info.blockIndex, info.fieldIndex, info.option, target.fieldIndex);
            }
        }

        function paintRubber(board, x1, y1, x2, y2) {
            var svg = board.querySelector('.sdf-rubber');
            if (!svg) {
                svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('class', 'sdf-rubber');
                board.appendChild(svg);
            }
            svg.setAttribute('width', board.style.width || '0');
            svg.setAttribute('height', board.style.height || '0');
            while (svg.firstChild) {
                svg.removeChild(svg.firstChild);
            }
            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            var mid = (x1 + x2) / 2;
            path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + mid + ' ' + y1 + ', ' + mid + ' ' + y2 + ', ' + x2 + ' ' + y2);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', '#0052cc');
            path.setAttribute('stroke-width', '1.5');
            svg.appendChild(path);
        }

        function onQuestionDown(e) {
            if (e.button || roleOf(e.target) !== 'pick-node') {
                return;
            }
            var tag = e.target.tagName ? e.target.tagName.toLowerCase() : '';
            if (tag === 'button' || tag === 'input' || tag === 'select') {
                return;
            }
            var source = fieldAt(e.target);
            if (!source) {
                return;
            }
            dragMove = {
                blockIndex: source.blockIndex,
                fieldIndex: source.fieldIndex,
                x0: e.clientX,
                y0: e.clientY,
                moved: false
            };
            document.addEventListener('mousemove', onQuestionMove);
            document.addEventListener('mouseup', onQuestionUp);
        }

        function onQuestionMove(e) {
            if (!dragMove) {
                return;
            }
            if (Math.abs(e.clientX - dragMove.x0) + Math.abs(e.clientY - dragMove.y0) > 6) {
                dragMove.moved = true;
            }
            clearDropMarks();
            if (!dragMove.moved) {
                return;
            }
            var under = document.elementFromPoint(e.clientX, e.clientY);
            var target = fieldAt(under);
            if (target && target.blockIndex === dragMove.blockIndex && target.fieldIndex !== dragMove.fieldIndex) {
                var mark = under;
                while (mark && mark !== app && !hasClass(mark, 'sdf-node')) {
                    mark = mark.parentNode;
                }
                if (mark && mark.className.indexOf('sdf-node-drop') < 0) {
                    mark.className += ' sdf-node-drop';
                }
            }
        }

        function onQuestionUp(e) {
            document.removeEventListener('mousemove', onQuestionMove);
            document.removeEventListener('mouseup', onQuestionUp);
            if (!dragMove) {
                return;
            }
            var info = dragMove;
            dragMove = null;
            clearDropMarks();
            if (!info.moved) {
                return;
            }
            ignorePickUntil = new Date().getTime() + 400;
            var target = fieldAt(document.elementFromPoint(e.clientX, e.clientY));
            if (target && target.blockIndex === info.blockIndex && target.fieldIndex !== info.fieldIndex) {
                moveNodeTo(info.blockIndex, info.fieldIndex, target.fieldIndex);
            }
        }

        function clearDropMarks() {
            var nodes = app.getElementsByClassName('sdf-node-drop');
            var copy = [];
            var i;
            for (i = 0; i < nodes.length; i++) {
                copy.push(nodes[i]);
            }
            for (i = 0; i < copy.length; i++) {
                copy[i].className = copy[i].className.replace(' sdf-node-drop', '');
            }
        }

        function moveNodeTo(blockIndex, fromIndex, toIndex) {
            var fields = config.blocks[blockIndex].fields;
            if (!fields[fromIndex] || !fields[toIndex] || fromIndex === toIndex) {
                return;
            }
            if (isUnder(fields, toIndex, fields[fromIndex].id)) {
                return;
            }
            var end = subtreeEnd(fields, fromIndex);
            var chunk = fields.splice(fromIndex, end - fromIndex);
            if (toIndex > fromIndex) {
                toIndex -= chunk.length;
            }
            var n;
            for (n = 0; n < chunk.length; n++) {
                fields.splice(toIndex + n, 0, chunk[n]);
            }
            selectedField = {blockIndex: blockIndex, index: toIndex};
            refresh();
        }

        function clearRubber(board) {
            if (!board) {
                return;
            }
            var svg = board.querySelector('.sdf-rubber');
            if (svg && svg.parentNode) {
                svg.parentNode.removeChild(svg);
            }
        }

        function onClick(e) {
            var role = roleOf(e.target);
            if (!role) {
                return;
            }
            if (role === 'link-from') {
                if (new Date().getTime() < ignoreLinkClickUntil) {
                    return;
                }
                if (e.preventDefault) {
                    e.preventDefault();
                }
                var source = fieldAt(e.target);
                if (!source) {
                    return;
                }
                var option = optionOf(e.target);
                if (pendingLink && pendingLink.blockIndex === source.blockIndex && pendingLink.fieldIndex === source.fieldIndex && pendingLink.option === option) {
                    pendingLink = null;
                } else {
                    pendingLink = {blockIndex: source.blockIndex, fieldIndex: source.fieldIndex, option: option};
                    selectedField = {blockIndex: source.blockIndex, index: source.fieldIndex};
                }
                refresh();
                return;
            }
            if (role === 'current-type') {
                if (e.preventDefault) {
                    e.preventDefault();
                }
                var holder = e.target;
                while (holder && holder !== app && !(holder.getAttribute && holder.getAttribute('data-value'))) {
                    holder = holder.parentNode;
                }
                if (!holder || !holder.getAttribute) {
                    return;
                }
                selectedType = parseInt(holder.getAttribute('data-value'), 10) || 0;
                typePicked = true;
                refresh();
                return;
            }
            if (role === 'unlink' || role === 'unlink-field') {
                if (e.preventDefault) {
                    e.preventDefault();
                }
                var linked = e.target;
                while (linked && linked !== app && !(linked.getAttribute && linked.getAttribute('data-field-index') != null)) {
                    linked = linked.parentNode;
                }
                if (!linked) {
                    return;
                }
                var linkBlock = parseInt(linked.getAttribute('data-block-index'), 10) || 0;
                var linkField = parseInt(linked.getAttribute('data-field-index'), 10) || 0;
                if (config.blocks[linkBlock] && config.blocks[linkBlock].fields[linkField]) {
                    config.blocks[linkBlock].fields[linkField].when = null;
                    selectedField = {blockIndex: linkBlock, index: linkField};
                    refresh();
                }
                return;
            }
            if (role === 'pick-node') {
                if (new Date().getTime() < ignorePickUntil) {
                    return;
                }
                if (e.preventDefault) {
                    e.preventDefault();
                }
                var picked = fieldAt(e.target);
                if (!picked) {
                    return;
                }
                if (pendingLink && pendingLink.blockIndex === picked.blockIndex && pendingLink.fieldIndex !== picked.fieldIndex) {
                    connectFields(picked.blockIndex, pendingLink.fieldIndex, pendingLink.option, picked.fieldIndex);
                    return;
                }
                pendingLink = null;
                selectedField = {blockIndex: picked.blockIndex, index: picked.fieldIndex};
                refresh();
                return;
            }
            if (role === 'add-block') {
                addBlock();
                return;
            }
            if (role === 'open-type') {
                openTypedId();
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
            } else if (role === 'add-field') {
                addField(loc.blockIndex, null);
            } else if (role === 'block-up') {
                moveBlock(loc.blockIndex, -1);
            } else if (role === 'block-down') {
                moveBlock(loc.blockIndex, 1);
            } else if (loc.fieldIndex < 0) {
                return;
            } else if (role === 'add-from-answer') {
                addField(loc.blockIndex, loc.fieldIndex, optionOf(e.target));
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
            } else if (role === 'blank-label' && loc.fieldIndex >= 0) {
                block.fields[loc.fieldIndex].blankLabel = e.target.value;
                sync();
                renderPreview();
            } else if (role === 'default-text' && loc.fieldIndex >= 0) {
                block.fields[loc.fieldIndex].defaults = trim(e.target.value) ? [e.target.value] : [];
                sync();
                renderPreview();
            }
        }

        function onChange(e) {
            var role = roleOf(e.target);
            if (role === 'current-project') {
                selectedProject = e.target.value;
                projectChosen = true;
                var choices = typesInProject();
                var next = 0;
                var n;
                for (n = 0; n < choices.length; n++) {
                    if (choices[n].project === selectedProject && countForType(choices[n].id)) {
                        next = choices[n].id;
                        break;
                    }
                }
                if (!next) {
                    for (n = 0; n < choices.length; n++) {
                        if (choices[n].project === selectedProject) {
                            next = choices[n].id;
                            break;
                        }
                    }
                }
                selectedType = next;
                typePicked = true;
                selectedField = {blockIndex: -1, index: 0};
                refresh();
                return;
            }
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
            if (role === 'block-type') {
                var typeId = parseInt(e.target.value, 10) || 0;
                block.requestTypeIds = typeId > 0 ? [typeId] : [];
                if (typeId > 0 && typeId !== Number(selectedType)) {
                    showMessage('success', [AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.moved')]);
                }
                sync();
                refresh();
                return;
            }
            if (role === 'place') {
                block.place = e.target.value === 'start' || e.target.value === 'after' ? e.target.value : 'end';
                if (block.place !== 'after') {
                    block.anchorFieldId = '';
                    block.placeAfter = '';
                    block.anchorValues = [];
                }
                refresh();
                return;
            }
            if (role === 'anchor-field') {
                var raw = e.target.value || '';
                if (!raw) {
                    block.anchorFieldId = '';
                    block.placeAfter = '';
                } else if (raw.indexOf('label:') === 0) {
                    block.anchorFieldId = '';
                    block.placeAfter = raw.substring(6);
                } else {
                    var bound = portalFieldById(raw);
                    block.anchorFieldId = raw;
                    block.placeAfter = bound ? bound.name : block.placeAfter;
                }
                block.anchorValues = [];
                block.place = 'after';
                sync();
                refresh();
                return;
            }
            if (role === 'anchor-value') {
                var values = [];
                var kept = block.anchorValues || [];
                var v;
                for (v = 0; v < kept.length; v++) {
                    if (kept[v] !== e.target.value) {
                        values.push(kept[v]);
                    }
                }
                if (e.target.checked) {
                    values.push(e.target.value);
                }
                block.anchorValues = values;
                sync();
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
            } else if (role === 'hide-blank') {
                field.hideBlank = !!e.target.checked;
                refresh();
            } else if (role === 'default-choice') {
                var chosen = [];
                var kept = field.defaults || [];
                var n;
                for (n = 0; n < kept.length; n++) {
                    if (kept[n] !== e.target.value) {
                        chosen.push(kept[n]);
                    }
                }
                if (e.target.checked) {
                    if (e.target.type === 'radio') {
                        chosen = e.target.value ? [e.target.value] : [];
                    } else {
                        chosen.push(e.target.value);
                    }
                }
                field.defaults = chosen;
                sync();
                renderPreview();
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

        function openTypedId() {
            var input = document.querySelector('#sdf-type-nav input[data-role="type-manual"]');
            var raw = input ? trim(input.value) : '';
            if (!/^[1-9]\d*$/.test(raw)) {
                showMessage('error', [AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needTypes')]);
                return;
            }
            selectedType = parseInt(raw, 10);
            typePicked = true;
            refresh();
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
            var scope = host.querySelector('.sdf-block-card[data-block-index="' + blockIndex + '"]');
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
            if (!(selectedType > 0)) {
                showMessage('error', [AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.pickTypeFirst')]);
                return;
            }
            config.blocks.push({
                id: freshBlockId(config.blocks),
                title: '',
                clearOnHide: true,
                requestTypeIds: [selectedType],
                place: 'end',
                placeAfter: '',
                anchorFieldId: '',
                anchorValues: [],
                fields: []
            });
            refresh();
            var card = host.querySelector('.sdf-block-card[data-block-index="' + (config.blocks.length - 1) + '"]');
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

        function addField(blockIndex, parentIndex, option) {
            var block = config.blocks[blockIndex];
            var field = {id: nextId(block.fields), label: '', type: 'checkbox', options: [''], when: null};
            var insertAt = block.fields.length;
            if (parentIndex != null && parentIndex >= 0) {
                field.when = {
                    fieldId: block.fields[parentIndex].id,
                    values: option ? [option] : [],
                    negate: false,
                    _mode: option ? 'selected' : 'any'
                };
                insertAt = parentIndex + 1;
            }
            pendingLink = null;
            block.fields.splice(insertAt, 0, field);
            selectedField = {blockIndex: blockIndex, index: insertAt};
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
            var order = visibleBlockIndexes();
            var pos = indexOfNumber(order, index);
            var nextPos = pos + delta;
            if (pos < 0 || nextPos < 0 || nextPos >= order.length) {
                return;
            }
            var other = order[nextPos];
            var item = config.blocks[index];
            config.blocks[index] = config.blocks[other];
            config.blocks[other] = item;
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
                if (!(config.blocks[b].requestTypeIds || []).length) {
                    pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.scopeEmpty'));
                }
                if ((config.blocks[b].place === 'after') && !trim(config.blocks[b].placeAfter)) {
                    pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needPlace'));
                }
                var fields = doc.blocks[b].fields;
                var i;
                for (i = 0; i < fields.length; i++) {
                    if (isChoice(fields[i].type)) {
                        if (!fields[i].options.length) {
                            pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needOption'));
                        }
                    } else if (!fields[i].label) {
                        pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needName'));
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
                var keep = selectedType;
                applyDocument(parseBody(text));
                if (!(keep > 0) && requestTypes && requestTypes.length) {
                    keep = Number(requestTypes[0].id);
                }
                if (keep > 0) {
                    selectedType = keep;
                    typePicked = true;
                    var i;
                    for (i = 0; i < config.blocks.length; i++) {
                        if (!(config.blocks[i].requestTypeIds || []).length) {
                            config.blocks[i].requestTypeIds = [selectedType];
                        }
                    }
                    sync();
                    refresh();
                }
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
                if (!block.fields.length || !blockOnType(block, selectedType)) {
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
            if (trim(field.label)) {
                wrap.appendChild(el('div', 'sdf-label', trim(field.label)));
            }
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
                    input.checked = contains(field.defaults, options[i]);
                    if (field.type === 'radio') {
                        input.name = 'sdf-preview-' + blockId + '-' + field.id;
                    }
                    line.appendChild(input);
                    line.appendChild(document.createTextNode(' ' + options[i]));
                    wrap.appendChild(line);
                }
            } else if (field.type === 'select' || field.type === 'multiselect') {
                var select = document.createElement('select');
                select.className = 'sdf-select';
                if (field.type === 'multiselect') {
                    select.multiple = true;
                    select.size = options.length > 6 ? 6 : Math.max(options.length, 2);
                } else if (!(field.hideBlank && hasDefault(field))) {
                    var empty = document.createElement('option');
                    empty.value = '';
                    empty.appendChild(document.createTextNode(blankCaption(field)));
                    select.appendChild(empty);
                }
                for (i = 0; i < options.length; i++) {
                    if (!trim(options[i])) {
                        continue;
                    }
                    var option = document.createElement('option');
                    option.value = options[i];
                    option.selected = contains(field.defaults, options[i]);
                    option.appendChild(document.createTextNode(options[i]));
                    select.appendChild(option);
                }
                wrap.appendChild(select);
            } else if (field.type === 'textarea') {
                var area = document.createElement('textarea');
                area.className = 'sdf-textarea';
                area.rows = 3;
                area.value = (field.defaults && field.defaults.length) ? field.defaults[0] : '';
                wrap.appendChild(area);
            } else {
                var text = document.createElement('input');
                text.type = inputKind(field.type);
                text.className = 'sdf-input';
                text.value = (field.defaults && field.defaults.length) ? field.defaults[0] : '';
                wrap.appendChild(text);
            }
            return wrap;
        }

        function hasDefault(field) {
            var list = field.defaults || [];
            var i;
            for (i = 0; i < list.length; i++) {
                if (trim(list[i])) {
                    return true;
                }
            }
            return false;
        }

        function blankCaption(field) {
            if (field.blankLabel && trim(field.blankLabel)) {
                return trim(field.blankLabel);
            }
            return AJS.I18n.getText('ru.saael.dynamicfields.portal.blank');
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
            } else if (type === 'select' || type === 'multiselect') {
                var select = node.getElementsByTagName('select')[0];
                if (select && select.multiple) {
                    var opts = select.options;
                    var m;
                    for (m = 0; m < opts.length; m++) {
                        opts[m].selected = contains(values, opts[m].value);
                    }
                } else if (select) {
                    select.value = values[0];
                }
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
            } else if (type === 'select' || type === 'multiselect') {
                var select = node.getElementsByTagName('select')[0];
                if (select && select.multiple) {
                    var opts = select.options;
                    for (i = 0; i < opts.length; i++) {
                        if (opts[i].selected && opts[i].value) {
                            values.push(opts[i].value);
                        }
                    }
                } else if (select && select.value) {
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
