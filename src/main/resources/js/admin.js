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
        var onlyField = app.getAttribute('data-only-field') || '';
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
        var selectedBlockId = '';
        var pendingLink = null;
        var ignoreLinkClickUntil = 0;
        var ignorePickUntil = 0;
        var dragLink = null;
        var dragMove = null;
        var NODE_W = 250;
        var NODE_HEAD = 40;
        var NODE_ROW = 32;
        var NODE_COLORS = ['#1d7afc', '#6554c0', '#ff8b00', '#00875a', '#00b8d9', '#e3497a'];
        var portalFields = null;
        var portalFieldsFor = 0;
        var projectFields = null;
        var projectFieldsLoading = false;
        var projectFieldQuery = '';
        var rebuildingWhenOptions = false;

        app.addEventListener('click', onClick);
        app.addEventListener('input', onInput);
        app.addEventListener('change', onChange);
        app.addEventListener('mousedown', onPortDown);
        app.addEventListener('mousedown', onQuestionDown);
        app.addEventListener('contextmenu', onContextMenu);
        app.addEventListener('scroll', onCanvasScroll, true);

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
                customFieldId: src.customFieldId ? String(src.customFieldId) : '',
                customFieldName: src.customFieldName ? String(src.customFieldName) : '',
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
                        fieldName: src.when.fieldName ? String(src.when.fieldName) : '',
                        source: src.when.source === 'portal' ? 'portal' : '',
                        values: values,
                        negate: !!src.when.negate,
                        _mode: values.length ? 'selected' : 'any'
                    };
                }
                fields.push({
                    id: src.id ? String(src.id) : '',
                    jiraFieldId: src.jiraFieldId ? String(src.jiraFieldId) : '',
                    issueName: src.issueName == null ? '' : String(src.issueName),
                    label: src.label == null ? '' : String(src.label),
                    help: src.help == null ? '' : String(src.help),
                    type: src.type || 'text',
                    options: options,
                    blankLabel: src.blankLabel == null ? '' : String(src.blankLabel),
                    hideBlank: !!src.hideBlank,
                    required: !!src.required,
                    color: normalizeColor(src.color),
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
                if (field.when && field.when.source !== 'portal' && !seen[field.when.fieldId]) {
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

        function normalizeColor(value) {
            var text = trim(value);
            var match = /^#([0-9a-fA-F]{6})$/.exec(text);
            if (match) {
                return '#' + match[1].toLowerCase();
            }
            var short = /^#([0-9a-fA-F]{3})$/.exec(text);
            if (!short) {
                return '';
            }
            var hex = short[1];
            return ('#' + hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2)).toLowerCase();
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
            var portal = when.source === 'portal';
            var values = [];
            var keepValues = portal ? when._mode !== 'any' : (parent && isChoice(parent.type) && when._mode !== 'any');
            if (keepValues) {
                var v;
                for (v = 0; v < (when.values || []).length; v++) {
                    var item = trim(when.values[v]);
                    if (item) {
                        values.push(item);
                    }
                }
            }
            var out = {fieldId: when.fieldId, values: values, negate: false};
            if (portal) {
                out.source = 'portal';
                if (trim(when.fieldName)) {
                    out.fieldName = trim(when.fieldName);
                }
            }
            return out;
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
                var helpRaw = src.help == null ? '' : String(src.help);
                var help = keepBlank ? helpRaw : trim(helpRaw);
                if (help) {
                    field.help = help;
                }
                if (src.required) {
                    field.required = true;
                }
                var color = normalizeColor(src.color);
                if (color) {
                    field.color = color;
                }
                if (src.jiraFieldId) {
                    field.jiraFieldId = src.jiraFieldId;
                }
                var issueName = trim(src.issueName || '');
                var automaticName = trim(src.label) || src.id || '';
                if (issueName && issueName !== automaticName) {
                    field.issueName = issueName;
                }
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
                customFieldId: block.customFieldId || '',
                customFieldName: block.customFieldName || '',
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

        function insideEditor(node) {
            while (node && node !== app) {
                if (hasClass(node, 'sdf-node-editor') || hasClass(node, 'sdf-float')) {
                    return true;
                }
                node = node.parentNode;
            }
            return false;
        }

        function insideFloat(node) {
            while (node && node !== app) {
                if (hasClass(node, 'sdf-float') || hasClass(node, 'sdf-menu')) {
                    return true;
                }
                node = node.parentNode;
            }
            return false;
        }

        function insideMenu(node) {
            while (node && node !== app) {
                if (hasClass(node, 'sdf-menu')) {
                    return true;
                }
                node = node.parentNode;
            }
            return false;
        }

        function insideCanvas(node) {
            while (node && node !== app) {
                if (hasClass(node, 'sdf-canvas') || hasClass(node, 'sdf-board') || hasClass(node, 'sdf-node')) {
                    return true;
                }
                node = node.parentNode;
            }
            return false;
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
            if (!config.blocks.length) {
                note.textContent = AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.empty');
            } else if (!Number(selectedType)) {
                note.textContent = AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.unassignedHint');
            } else {
                note.textContent = AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typeEmpty');
            }
            document.getElementById('sdf-block-count').textContent =
                AJS.I18n.getText('ru.saael.dynamicfields.admin.blocks.count') + ' ' + listedBlockIndexes().length;
            document.getElementById('sdf-count').textContent =
                AJS.I18n.getText('ru.saael.dynamicfields.admin.fields.count') + ' ' + listedFieldCount();
            var i;
            for (i = 0; i < visible.length; i++) {
                host.appendChild(renderBlock(config.blocks[visible[i]], visible[i]));
            }
            placeFloats();
            syncProject();
            renderTypeNav();
            renderPreview();
            loadPortalFields();
            loadProjectFields();
        }

        function renderBlock(block, blockIndex) {
            var card = el('section', 'sdf-block-card');
            card.setAttribute('data-block-index', String(blockIndex));
            var bar = el('div', 'sdf-block-bar');
            bar.appendChild(el('h3', 'sdf-block-name', block.customFieldName || block.customFieldId || block.title || ''));
            var actions = el('div', 'aui-buttons');
            actions.appendChild(button('add-field', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addField'), false));
            bar.appendChild(actions);
            card.appendChild(bar);
            card.appendChild(renderScope(block));
            card.appendChild(renderCanvas(block, blockIndex));
            var editIndex = editedIndex(block, blockIndex);
            if (editIndex >= 0) {
                card.appendChild(renderFloat(block, blockIndex, editIndex));
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
            return -1;
        }

        function renderFloat(block, blockIndex, index) {
            var field = block.fields[index];
            var panel = el('div', 'sdf-float');
            panel.setAttribute('data-block-index', String(blockIndex));
            panel.setAttribute('data-field-index', String(index));
            var head = el('div', 'sdf-float-head');
            var title = el('strong', 'sdf-float-title');
            title.appendChild(document.createTextNode(trim(field.label) || AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.questionOptional')));
            if (field.required) {
                title.appendChild(el('span', 'sdf-req', ' *'));
            }
            head.appendChild(title);
            var close = document.createElement('button');
            close.type = 'button';
            close.className = 'sdf-float-close';
            close.setAttribute('data-role', 'close-field');
            close.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.closeSettings'));
            close.appendChild(document.createTextNode('\u00d7'));
            head.appendChild(close);
            panel.appendChild(head);
            panel.appendChild(renderCard(block, blockIndex, index));
            return panel;
        }

        function placeFloats() {
            var panels = host.querySelectorAll('.sdf-float');
            var i;
            for (i = 0; i < panels.length; i++) {
                var panel = panels[i];
                var card = panel.parentNode;
                var node = null;
                var nodes = card.querySelectorAll('.sdf-node');
                var n;
                for (n = 0; n < nodes.length; n++) {
                    if (nodes[n].getAttribute('data-field-index') === panel.getAttribute('data-field-index')) {
                        node = nodes[n];
                    }
                }
                if (!node) {
                    continue;
                }
                var nodeBox = node.getBoundingClientRect();
                var cardBox = card.getBoundingClientRect();
                var width = panel.offsetWidth || 480;
                var left = nodeBox.right - cardBox.left + 18;
                var top = nodeBox.top - cardBox.top;
                if (left + width > card.clientWidth - 8) {
                    var leftSide = nodeBox.left - cardBox.left - width - 18;
                    if (leftSide >= 8) {
                        left = leftSide;
                    } else {
                        left = Math.max(8, card.clientWidth - width - 8);
                        top = nodeBox.bottom - cardBox.top + 12;
                    }
                }
                var minTop = 8;
                if (top < minTop) {
                    top = minTop;
                }
                panel.style.left = Math.round(left) + 'px';
                panel.style.top = Math.round(top) + 'px';
            }
        }

        function onCanvasScroll(e) {
            if (e.target && hasClass(e.target, 'sdf-canvas')) {
                placeFloats();
            }
        }

        function closeMenu() {
            var menus = app.querySelectorAll('.sdf-menu');
            var i;
            for (i = 0; i < menus.length; i++) {
                if (menus[i].parentNode) {
                    menus[i].parentNode.removeChild(menus[i]);
                }
            }
        }

        function openMenu(x, y, blockIndex) {
            closeMenu();
            var menu = el('div', 'sdf-menu');
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';
            var item = button('context-add-field', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addField'), false);
            item.setAttribute('data-block-index', String(blockIndex));
            menu.appendChild(item);
            app.appendChild(menu);
            var box = menu.getBoundingClientRect();
            if (box.right > window.innerWidth - 8) {
                menu.style.left = Math.max(8, window.innerWidth - box.width - 8) + 'px';
            }
            if (box.bottom > window.innerHeight - 8) {
                menu.style.top = Math.max(8, window.innerHeight - box.height - 8) + 'px';
            }
        }

        function onContextMenu(e) {
            if (insideFloat(e.target) || !insideCanvas(e.target)) {
                return;
            }
            if (e.preventDefault) {
                e.preventDefault();
            }
            var card = e.target;
            while (card && card !== app && !hasClass(card, 'sdf-block-card')) {
                card = card.parentNode;
            }
            if (!card || card === app) {
                return;
            }
            openMenu(e.clientX, e.clientY, parseInt(card.getAttribute('data-block-index'), 10) || 0);
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

        function shownBlock(block) {
            return !onlyField || block.customFieldId === onlyField;
        }

        function shownInBuilder(block) {
            if (!shownBlock(block)) {
                return false;
            }
            if (onlyField) {
                return true;
            }
            var listed = listedBlockIndexes();
            if (listed.length < 2) {
                return true;
            }
            return block.id === selectedBlockId;
        }

        function listedBlockIndexes() {
            var out = [];
            var i;
            for (i = 0; i < config.blocks.length; i++) {
                if (shownBlock(config.blocks[i])) {
                    out.push(i);
                }
            }
            return out;
        }

        function ensureActiveBlock() {
            var listed = listedBlockIndexes();
            if (!listed.length) {
                selectedBlockId = '';
                return;
            }
            var i;
            for (i = 0; i < listed.length; i++) {
                if (config.blocks[listed[i]].id === selectedBlockId) {
                    return;
                }
            }
            selectedBlockId = config.blocks[listed[0]].id;
        }

        function visibleBlockIndexes() {
            ensureActiveBlock();
            var listed = listedBlockIndexes();
            if (onlyField || listed.length < 2) {
                return listed;
            }
            var out = [];
            var i;
            for (i = 0; i < listed.length; i++) {
                if (config.blocks[listed[i]].id === selectedBlockId) {
                    out.push(listed[i]);
                }
            }
            return out.length ? out : listed;
        }

        function listedFieldCount() {
            var n = 0;
            var order = listedBlockIndexes();
            var i;
            for (i = 0; i < order.length; i++) {
                n += config.blocks[order[i]].fields.length;
            }
            return n;
        }

        function blockCaption(block) {
            return block.customFieldName || block.title || block.customFieldId || block.id || '';
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
            var listed = listedBlockIndexes();
            if (onlyField || listed.length < 2) {
                nav.style.display = 'none';
                return;
            }
            nav.style.display = 'block';
            var inner = el('div', 'aui-navgroup-inner');
            var heading = el('div', 'aui-nav-heading');
            var strong = document.createElement('strong');
            strong.appendChild(document.createTextNode(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldsNav')));
            heading.appendChild(strong);
            inner.appendChild(heading);
            var list = el('ul', 'aui-nav');
            var i;
            for (i = 0; i < listed.length; i++) {
                var block = config.blocks[listed[i]];
                list.appendChild(fieldNavItem(block, block.id === selectedBlockId));
            }
            inner.appendChild(list);
            nav.appendChild(inner);
        }

        function fieldNavItem(block, selected) {
            var item = el('li', selected ? 'aui-nav-selected' : null);
            var link = document.createElement('a');
            link.href = '#sdf-app';
            link.setAttribute('data-role', 'pick-block');
            link.setAttribute('data-value', block.id);
            var caption = blockCaption(block);
            link.title = caption;
            link.appendChild(el('span', 'sdf-nav-name', caption));
            link.appendChild(el('span', 'aui-lozenge aui-lozenge-subtle', String((block.fields || []).length)));
            item.appendChild(link);
            return item;
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
                renderKeepingFocus();
            }).fail(function () {
                if (portalFieldsFor === Number(type.id)) {
                    portalFields = [];
                    renderKeepingFocus();
                }
            });
        }

        function projectFieldById(id) {
            var list = projectFields || [];
            var i;
            for (i = 0; i < list.length; i++) {
                if (list[i].id === id) {
                    return list[i];
                }
            }
            return null;
        }

        function loadProjectFields() {
            if (projectFieldsLoading || projectFields) {
                return;
            }
            projectFieldsLoading = true;
            AJS.$.ajax({
                url: contextPath + '/rest/dynamic-fields/1.0/project-fields',
                type: 'GET',
                dataType: 'json',
                cache: false
            }).done(function (data) {
                var payload = asJson(data);
                var raw = payload.fields || [];
                var list = [];
                var i;
                for (i = 0; i < raw.length; i++) {
                    var item = raw[i] || {};
                    if (!item.id) {
                        continue;
                    }
                    var values = [];
                    var incoming = item.values || [];
                    var v;
                    for (v = 0; v < incoming.length; v++) {
                        if (incoming[v] != null && String(incoming[v])) {
                            values.push(String(incoming[v]));
                        }
                    }
                    list.push({
                        id: String(item.id),
                        name: String(item.name || item.id),
                        project: item.project ? String(item.project) : '',
                        control: item.control || (values.length ? 'select' : 'text'),
                        values: values
                    });
                }
                projectFields = list;
                projectFieldsLoading = false;
                renderKeepingFocus();
            }).fail(function () {
                projectFields = [];
                projectFieldsLoading = false;
                renderKeepingFocus();
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
                    renderKeepingFocus();
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
                    renderKeepingFocus();
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
                renderKeepingFocus();
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
            editedIndex(block, blockIndex);
            var wrap = el('div', 'sdf-canvas-wrap');
            wrap.appendChild(el('p', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeHint')));
            if (pendingLink && pendingLink.blockIndex === blockIndex) {
                wrap.appendChild(el('p', 'sdf-link-banner', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeLinking')));
            }
            var canvas = el('div', 'sdf-canvas');
            var laid = layoutNodes(block, blockIndex);
            if (!laid.length) {
                canvas.appendChild(el('p', 'sdf-block-empty', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.blockEmpty')));
                wrap.appendChild(canvas);
                return wrap;
            }
            var maxX = 200;
            var maxY = 80;
            var i;
            for (i = 0; i < laid.length; i++) {
                if (laid[i].x + NODE_W + 40 > maxX) {
                    maxX = laid[i].x + NODE_W + 40;
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

        function nodeExtra(field) {
            return field.when && field.when.source === 'portal' ? 22 : 0;
        }

        function nodeAccent(index) {
            return NODE_COLORS[index % NODE_COLORS.length];
        }

        function nodeColor(field, index) {
            return normalizeColor(field && field.color) || nodeAccent(index);
        }

        function nodeBoxHeight(field) {
            var rows = isChoice(field.type) ? filledOptions(field).length : 1;
            if (!rows) {
                rows = 1;
            }
            return NODE_HEAD + nodeExtra(field) + rows * NODE_ROW + 6;
        }

        function layoutNodes(block, blockIndex) {
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
                            y: NODE_HEAD + nodeExtra(field) + p * NODE_ROW + NODE_ROW / 2
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
                return {x: item.x + NODE_W, y: item.y + item.h / 2};
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
                    line({x: laid[parentAt].x + NODE_W, y: laid[parentAt].y + laid[parentAt].h / 2}, leftOf(indexAt[i]), i);
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
            var color = nodeColor(field, laid.index);
            var node = el('div', 'sdf-node');
            node.style.left = laid.x + 'px';
            node.style.top = laid.y + 'px';
            node.style.width = NODE_W + 'px';
            node.style.height = laid.h + 'px';
            node.style.setProperty('--sdf-accent', color);
            node.setAttribute('data-role', 'pick-node');
            node.setAttribute('data-block-index', String(blockIndex));
            node.setAttribute('data-field-index', String(laid.index));
            if (selectedField.blockIndex === blockIndex && selectedField.index === laid.index) {
                node.className += ' sdf-node-selected';
            }
            var head = el('div', 'sdf-node-head');
            head.style.background = color;
            head.setAttribute('data-role', 'pick-node');
            var title = el('span', 'sdf-node-title');
            title.appendChild(document.createTextNode(trim(field.label) || AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.questionOptional')));
            if (field.required) {
                title.appendChild(el('span', 'sdf-node-req', ' *'));
            }
            head.appendChild(title);
            head.appendChild(el('span', 'sdf-node-kind', typeName(field.type)));
            var remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'sdf-node-del';
            remove.setAttribute('data-role', 'remove');
            remove.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeRemove'));
            remove.appendChild(document.createTextNode('\u00d7'));
            head.appendChild(remove);
            node.appendChild(head);
            var body = el('div', 'sdf-node-body');
            if (field.when && field.when.source === 'portal') {
                body.appendChild(el('div', 'sdf-node-when', portalKicker(field.when)));
            }
            if (isChoice(field.type)) {
                var opts = filledOptions(field);
                var o;
                if (!opts.length) {
                    body.appendChild(el('div', 'sdf-port-empty', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addOption')));
                }
                for (o = 0; o < opts.length; o++) {
                    body.appendChild(portRow(blockIndex, laid.index, opts[o], opts[o]));
                }
            } else {
                body.appendChild(portRow(blockIndex, laid.index, '', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeNext')));
            }
            node.appendChild(body);
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
            card.appendChild(group(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldHelp'), helpInput(field), AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldHelpHint')));
            card.appendChild(group(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.typeLabel'), typeSelect(field.type), null));
            card.appendChild(renderRequired(field));
            card.appendChild(renderColor(field, index));
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

        function renderRequired(field) {
            var box = el('div', 'field-group');
            var label = document.createElement('label');
            label.className = 'sdf-inline-check';
            var check = document.createElement('input');
            check.type = 'checkbox';
            check.setAttribute('data-role', 'field-required');
            check.checked = !!field.required;
            label.appendChild(check);
            label.appendChild(document.createTextNode(' ' + AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.required')));
            box.appendChild(label);
            box.appendChild(el('div', 'description', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.requiredHint')));
            return box;
        }

        function renderColor(field, index) {
            var box = el('div', 'field-group');
            box.appendChild(el('label', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeColor')));
            var value = el('div', 'sdf-field-value sdf-colors');
            var current = normalizeColor(field.color);
            var auto = document.createElement('button');
            auto.type = 'button';
            auto.className = 'sdf-swatch sdf-swatch-auto' + (current ? '' : ' sdf-swatch-on');
            auto.setAttribute('data-role', 'node-color');
            auto.setAttribute('data-color', '');
            auto.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeColorAuto'));
            auto.style.background = nodeAccent(index);
            value.appendChild(auto);
            var i;
            for (i = 0; i < NODE_COLORS.length; i++) {
                var swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.className = 'sdf-swatch' + (current === NODE_COLORS[i] ? ' sdf-swatch-on' : '');
                swatch.setAttribute('data-role', 'node-color');
                swatch.setAttribute('data-color', NODE_COLORS[i]);
                swatch.style.background = NODE_COLORS[i];
                value.appendChild(swatch);
            }
            var picker = document.createElement('input');
            picker.type = 'color';
            picker.setAttribute('data-role', 'node-color-picker');
            picker.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeColorCustom'));
            picker.value = current || nodeAccent(index);
            value.appendChild(picker);
            box.appendChild(value);
            return box;
        }

        function paintSwatches(origin, color) {
            var box = origin;
            while (box && box !== app && !hasClass(box, 'sdf-colors')) {
                box = box.parentNode;
            }
            if (!box || box === app) {
                return;
            }
            var saved = color || '';
            var swatches = box.querySelectorAll('.sdf-swatch');
            var i;
            for (i = 0; i < swatches.length; i++) {
                var chosen = swatches[i].getAttribute('data-color') || '';
                var name = 'sdf-swatch' + (chosen ? '' : ' sdf-swatch-auto');
                if (chosen === saved) {
                    name += ' sdf-swatch-on';
                }
                swatches[i].className = name;
            }
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

        function helpInput(field) {
            var help = document.createElement('textarea');
            help.className = 'textarea long-field';
            help.setAttribute('rows', '3');
            help.setAttribute('data-role', 'help');
            help.setAttribute('maxlength', '2000');
            help.value = field.help || '';
            return help;
        }

        function automaticIssueName(field) {
            return trim(field.label) || field.id || '';
        }

        function idInput(field) {
            var input = document.createElement('input');
            input.type = 'text';
            input.className = 'text long-field';
            input.setAttribute('data-role', 'issue-name');
            input.setAttribute('maxlength', '240');
            input.setAttribute('placeholder', automaticIssueName(field) || AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldPending'));
            input.value = trim(field.issueName) ? field.issueName : automaticIssueName(field);
            return input;
        }

        function applyIssueName(field, typed) {
            var value = typed == null ? '' : String(typed);
            var automatic = automaticIssueName(field);
            if (!trim(value) || trim(value) === automatic) {
                field.issueName = '';
            } else {
                field.issueName = value;
            }
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
            box.setAttribute('data-part', 'defaults');
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
                input.setAttribute('autocomplete', 'off');
                input.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.optionPlaceholder'));
                input.value = options[i];
                row.appendChild(input);
                if (field.type === 'checkbox' || field.type === 'radio') {
                    var nest = document.createElement('button');
                    nest.type = 'button';
                    nest.className = 'sdf-option-add';
                    nest.setAttribute('data-role', 'add-from-answer');
                    nest.setAttribute('data-option', options[i]);
                    nest.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.nodeAdd'));
                    nest.disabled = !trim(options[i]);
                    nest.appendChild(document.createTextNode('+'));
                    row.appendChild(nest);
                }
                var remove = document.createElement('button');
                remove.type = 'button';
                remove.className = 'sdf-option-del';
                remove.setAttribute('data-role', 'remove-option');
                remove.setAttribute('data-option-index', String(i));
                remove.setAttribute('title', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.remove'));
                remove.appendChild(document.createTextNode('\u00d7'));
                row.appendChild(remove);
                value.appendChild(row);
            }
            value.appendChild(button('add-option', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addOption'), false));
            box.appendChild(value);
            return box;
        }

        function portalKicker(when) {
            var name = trim(when.fieldName) || when.fieldId;
            var bits = [];
            if (when._mode !== 'any') {
                var i;
                for (i = 0; i < (when.values || []).length; i++) {
                    if (trim(when.values[i])) {
                        bits.push(trim(when.values[i]));
                    }
                }
            }
            if (!bits.length) {
                return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.portalKicker', name);
            }
            return AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.portalKickerValues', name, bits.join(', '));
        }

        function projectQueryMatches(item) {
            var query = trim(projectFieldQuery).toLowerCase();
            if (!query) {
                return true;
            }
            var name = String(item.name || '').toLowerCase();
            var id = String(item.id || '').toLowerCase();
            var project = String(item.project || '').toLowerCase();
            return name.indexOf(query) >= 0 || id.indexOf(query) >= 0 || project.indexOf(query) >= 0;
        }

        function portalChoiceList(when) {
            var out = [];
            var seen = {};
            function add(text) {
                var item = trim(text);
                if (!item || seen[item]) {
                    return;
                }
                seen[item] = true;
                out.push(item);
            }
            var catalog = projectFieldById(when.fieldId);
            var list = catalog && catalog.values ? catalog.values : [];
            var i;
            for (i = 0; i < list.length; i++) {
                add(list[i]);
            }
            var saved = when.values || [];
            for (i = 0; i < saved.length; i++) {
                add(saved[i]);
            }
            return out;
        }

        function fillWhenOptions(select, block, field, index) {
            rebuildingWhenOptions = true;
            try {
            while (select.firstChild) {
                select.removeChild(select.firstChild);
            }
            var selectedKey = '';
            if (field.when && field.when.source === 'portal') {
                selectedKey = 'portal:' + field.when.fieldId;
            } else if (field.when && field.when.fieldId) {
                selectedKey = field.when.fieldId;
            }
            var always = document.createElement('option');
            always.value = '';
            always.appendChild(document.createTextNode(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.always')));
            if (!selectedKey) {
                always.selected = true;
            }
            select.appendChild(always);
            if (index > 0) {
                var own = document.createElement('optgroup');
                own.label = AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.ownQuestions');
                var i;
                for (i = 0; i < index; i++) {
                    var earlier = block.fields[i];
                    var option = document.createElement('option');
                    option.value = earlier.id;
                    option.appendChild(document.createTextNode(earlier.label || earlier.id));
                    if (selectedKey === earlier.id) {
                        option.selected = true;
                    }
                    own.appendChild(option);
                }
                select.appendChild(own);
            }
            var catalog = projectFields || [];
            var projectGroup = document.createElement('optgroup');
            projectGroup.label = AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.projectFields');
            var added = {};
            var n;
            for (n = 0; n < catalog.length; n++) {
                if (!projectQueryMatches(catalog[n])) {
                    continue;
                }
                appendProjectOption(projectGroup, catalog[n], selectedKey);
                added[catalog[n].id] = true;
            }
            if (field.when && field.when.source === 'portal' && field.when.fieldId && !added[field.when.fieldId]) {
                var current = projectFieldById(field.when.fieldId);
                appendProjectOption(projectGroup, current || {
                    id: field.when.fieldId,
                    name: field.when.fieldName || field.when.fieldId,
                    project: ''
                }, selectedKey);
            }
            if (projectGroup.firstChild) {
                select.appendChild(projectGroup);
            }
            } finally {
                rebuildingWhenOptions = false;
            }
        }

        function appendProjectOption(parent, item, selectedKey) {
            var option = document.createElement('option');
            option.value = 'portal:' + item.id;
            var label = item.name || item.id;
            if (item.project) {
                label += ' (' + item.project + ')';
            }
            option.appendChild(document.createTextNode(label));
            if (option.value === selectedKey) {
                option.selected = true;
            }
            parent.appendChild(option);
        }

        function renderWhen(block, field, index) {
            var box = el('div', 'field-group');
            box.appendChild(el('label', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.showIf')));
            var value = el('div', 'sdf-field-value sdf-when-value');
            if (projectFields && projectFields.length) {
                var filter = document.createElement('input');
                filter.type = 'text';
                filter.className = 'text sdf-project-filter';
                filter.setAttribute('data-role', 'project-field-filter');
                filter.setAttribute('autocomplete', 'off');
                filter.setAttribute('placeholder', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldFilter'));
                filter.value = projectFieldQuery;
                value.appendChild(filter);
            }
            var select = document.createElement('select');
            select.className = 'select';
            select.setAttribute('data-role', 'when-field');
            fillWhenOptions(select, block, field, index);
            value.appendChild(select);
            if (projectFields === null) {
                value.appendChild(el('div', 'sdf-when-hint', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.projectFieldsLoading')));
            } else if (!projectFields.length) {
                value.appendChild(el('div', 'sdf-when-hint', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.projectFieldsEmpty')));
            }
            if (field.when && field.when.fieldId) {
                value.appendChild(renderWhenValues(block, field, index));
            }
            box.appendChild(value);
            return box;
        }

        function portalControl(when) {
            var catalog = projectFieldById(when.fieldId);
            if (catalog && catalog.control) {
                return catalog.control;
            }
            return portalChoiceList(when).length ? 'select' : 'text';
        }

        function renderWhenValues(block, field, index) {
            var values = el('div', 'sdf-when-values');
            var when = field.when;
            if (when.source === 'portal') {
                var portalOptions = portalChoiceList(when);
                var control = portalControl(when);
                if (control === 'radio' && portalOptions.length) {
                    appendPortalRadios(values, block, index, when, portalOptions);
                } else if ((control === 'select' || control === 'checkboxes' || portalOptions.length) && portalOptions.length) {
                    if (control === 'select') {
                        values.appendChild(el('div', 'sdf-when-hint', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.portalOr')));
                    }
                    appendPortalAny(values, when);
                    appendWhenChecks(values, when, portalOptions);
                } else {
                    values.appendChild(el('span', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.portalFilled')));
                }
                return values;
            }
            var parent = null;
            var i;
            for (i = 0; i < index; i++) {
                if (block.fields[i].id === when.fieldId) {
                    parent = block.fields[i];
                }
            }
            if (!parent || !isChoice(parent.type)) {
                values.appendChild(el('span', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenFilled')));
                return values;
            }
            appendWhenModes(values, block, index, when);
            var opts = [];
            var raw = parent.options || [];
            for (i = 0; i < raw.length; i++) {
                if (trim(raw[i])) {
                    opts.push(raw[i]);
                }
            }
            appendWhenChecks(values, when, opts);
            return values;
        }

        function appendPortalRadios(values, block, index, when, opts) {
            values.appendChild(portalRadio(block, index, '', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenAny'), when._mode === 'any'));
            var i;
            for (i = 0; i < opts.length; i++) {
                var picked = when._mode !== 'any' && contains(when.values, opts[i]);
                values.appendChild(portalRadio(block, index, opts[i], opts[i], picked));
            }
        }

        function portalRadio(block, index, value, text, checked) {
            var label = document.createElement('label');
            label.className = 'sdf-inline-check';
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'sdf-portal-radio-' + block.id + '-' + index;
            input.setAttribute('data-role', 'when-portal-radio');
            input.value = value;
            input.checked = checked;
            label.appendChild(input);
            label.appendChild(document.createTextNode(' ' + text));
            return label;
        }

        function appendPortalAny(values, when) {
            var label = document.createElement('label');
            label.className = 'sdf-inline-check';
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.setAttribute('data-role', 'when-portal-any');
            input.checked = when._mode === 'any';
            label.appendChild(input);
            label.appendChild(document.createTextNode(' ' + AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenAny')));
            values.appendChild(label);
        }

        function appendWhenModes(values, block, index, when) {
            var mode = when._mode === 'selected' || (when.values && when.values.length) ? 'selected' : 'any';
            if (when._mode === 'any') {
                mode = 'any';
            }
            values.appendChild(modeRadio(block, index, 'any', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenAny'), mode === 'any'));
            values.appendChild(modeRadio(block, index, 'selected', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenSelected'), mode === 'selected'));
        }

        function appendWhenChecks(values, when, opts) {
            var i;
            for (i = 0; i < opts.length; i++) {
                var label = document.createElement('label');
                label.className = 'sdf-inline-check';
                var check = document.createElement('input');
                check.type = 'checkbox';
                check.setAttribute('data-role', 'when-value');
                check.value = opts[i];
                check.checked = contains(when.values, opts[i]);
                label.appendChild(check);
                label.appendChild(document.createTextNode(' ' + opts[i]));
                values.appendChild(label);
            }
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
            if (selectedField.blockIndex === blockIndex && selectedField.index === index) {
                selectedField = {blockIndex: blockIndex, index: insertAt};
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
            if (e.button || roleOf(e.target) !== 'pick-node' || insideEditor(e.target)) {
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
            var inMenu = insideMenu(e.target);
            if (!inMenu) {
                closeMenu();
            }
            var role = roleOf(e.target);
            if (role === 'close-field') {
                if (e.preventDefault) {
                    e.preventDefault();
                }
                selectedField = {blockIndex: -1, index: -1};
                refresh();
                return;
            }
            if (role === 'context-add-field') {
                if (e.preventDefault) {
                    e.preventDefault();
                }
                closeMenu();
                addField(parseInt(e.target.getAttribute('data-block-index'), 10) || 0, null);
                return;
            }
            if (role === 'node-color') {
                if (e.preventDefault) {
                    e.preventDefault();
                }
                var colorLoc = locate(e.target);
                if (colorLoc.blockIndex < 0 || colorLoc.fieldIndex < 0) {
                    return;
                }
                var pickedColor = normalizeColor(e.target.getAttribute('data-color'));
                config.blocks[colorLoc.blockIndex].fields[colorLoc.fieldIndex].color = pickedColor;
                sync();
                patchNodeColor(colorLoc.blockIndex, colorLoc.fieldIndex);
                paintSwatches(e.target, pickedColor);
                return;
            }
            if (!role) {
                if (!insideFloat(e.target) && insideCanvas(e.target) && selectedField.blockIndex >= 0) {
                    selectedField = {blockIndex: -1, index: -1};
                    refresh();
                }
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
            if (role === 'pick-block') {
                if (e.preventDefault) {
                    e.preventDefault();
                }
                var pickedBlock = e.target;
                while (pickedBlock && pickedBlock !== app && !(pickedBlock.getAttribute && pickedBlock.getAttribute('data-value'))) {
                    pickedBlock = pickedBlock.parentNode;
                }
                if (!pickedBlock || !pickedBlock.getAttribute) {
                    return;
                }
                selectedBlockId = pickedBlock.getAttribute('data-value') || '';
                var pickedIndex = -1;
                var bi;
                for (bi = 0; bi < config.blocks.length; bi++) {
                    if (config.blocks[bi].id === selectedBlockId) {
                        pickedIndex = bi;
                    }
                }
                selectedField = {blockIndex: pickedIndex, index: 0};
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
                if (insideEditor(e.target) || new Date().getTime() < ignorePickUntil) {
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
            if (role === 'project-field-filter' && loc.fieldIndex >= 0) {
                projectFieldQuery = e.target.value;
                var holder = e.target.parentNode;
                var whenSelect = holder ? holder.querySelector('select[data-role="when-field"]') : null;
                if (whenSelect) {
                    fillWhenOptions(whenSelect, block, block.fields[loc.fieldIndex], loc.fieldIndex);
                }
                return;
            }
            if (role === 'block-title') {
                block.title = e.target.value;
                sync();
                renderPreview();
            } else if (role === 'place-after') {
                block.placeAfter = e.target.value;
                sync();
            } else if (role === 'label' && loc.fieldIndex >= 0) {
                block.fields[loc.fieldIndex].label = e.target.value;
                // The question box stays in the page. Rebuilding it here removed the
                // focused input, and the browser then left the new box without a caret.
                sync();
                patchQuestionTitle(loc.blockIndex, loc.fieldIndex);
                patchIssueName(loc.blockIndex, loc.fieldIndex);
                renderPreview();
            } else if (role === 'help' && loc.fieldIndex >= 0) {
                block.fields[loc.fieldIndex].help = e.target.value;
                sync();
                renderPreview();
            } else if (role === 'issue-name' && loc.fieldIndex >= 0) {
                applyIssueName(block.fields[loc.fieldIndex], e.target.value);
                sync();
            } else if (role === 'option' && loc.fieldIndex >= 0) {
                var optIndex = parseInt(e.target.getAttribute('data-option-index'), 10);
                var field = block.fields[loc.fieldIndex];
                if (!field || !field.options || isNaN(optIndex) || optIndex < 0 || optIndex >= field.options.length) {
                    return;
                }
                var old = field.options[optIndex];
                field.options[optIndex] = e.target.value;
                renameOption(block, field.id, old, e.target.value);
                var optionRow = e.target.parentNode;
                if (optionRow && optionRow.getElementsByTagName) {
                    var optionButtons = optionRow.getElementsByTagName('button');
                    var optionButton;
                    for (optionButton = 0; optionButton < optionButtons.length; optionButton++) {
                        if (optionButtons[optionButton].getAttribute('data-role') === 'add-from-answer') {
                            optionButtons[optionButton].setAttribute('data-option', e.target.value);
                            optionButtons[optionButton].disabled = !trim(e.target.value);
                        }
                    }
                }
                sync();
                replaceCanvas(loc.blockIndex);
                replaceDefaults(loc.blockIndex, loc.fieldIndex);
                renderPreview();
            } else if (role === 'blank-label' && loc.fieldIndex >= 0) {
                block.fields[loc.fieldIndex].blankLabel = e.target.value;
                sync();
                renderPreview();
            } else if (role === 'default-text' && loc.fieldIndex >= 0) {
                block.fields[loc.fieldIndex].defaults = trim(e.target.value) ? [e.target.value] : [];
                sync();
                renderPreview();
            } else if (role === 'node-color-picker' && loc.fieldIndex >= 0) {
                var picked = normalizeColor(e.target.value);
                block.fields[loc.fieldIndex].color = picked;
                sync();
                patchNodeColor(loc.blockIndex, loc.fieldIndex);
                paintSwatches(e.target, picked);
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
            if (role === 'issue-name') {
                if (!trim(field.issueName)) {
                    e.target.value = automaticIssueName(field);
                }
                return;
            }
            if (role === 'field-required') {
                field.required = !!e.target.checked;
                sync();
                patchQuestionTitle(loc.blockIndex, loc.fieldIndex);
                renderPreview();
                return;
            }
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
                if (rebuildingWhenOptions) {
                    return;
                }
                var chosen = e.target.value || '';
                if (!chosen) {
                    field.when = null;
                } else if (chosen.indexOf('portal:') === 0) {
                    var portalId = chosen.substring('portal:'.length);
                    var catalog = projectFieldById(portalId);
                    var knownName = catalog && catalog.name ? catalog.name : '';
                    if (!knownName && field.when && field.when.fieldId === portalId && field.when.fieldName) {
                        knownName = field.when.fieldName;
                    }
                    var optionCount = catalog && catalog.values ? catalog.values.length : 0;
                    var choice = catalog && (catalog.control === 'select' || catalog.control === 'checkboxes' || catalog.control === 'radio');
                    field.when = {
                        fieldId: portalId,
                        fieldName: knownName,
                        source: 'portal',
                        values: [],
                        negate: false,
                        _mode: (choice && optionCount) || optionCount ? 'selected' : 'any'
                    };
                } else {
                    field.when = {fieldId: chosen, values: [], negate: false, _mode: 'any', source: ''};
                }
                refresh();
            } else if (role === 'when-portal-radio' && field.when) {
                if (!e.target.value) {
                    field.when._mode = 'any';
                    field.when.values = [];
                } else {
                    field.when._mode = 'selected';
                    field.when.values = [e.target.value];
                }
                sync();
                renderPreview();
            } else if (role === 'when-portal-any' && field.when) {
                if (e.target.checked) {
                    field.when._mode = 'any';
                    field.when.values = [];
                } else {
                    field.when._mode = 'selected';
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
                if (field.when.source === 'portal') {
                    refresh();
                } else {
                    sync();
                    renderPreview();
                }
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
            for (i = 0; i < block.fields.length; i++) {
                var field = block.fields[i];
                if (field.id === fieldId) {
                    field.defaults = renameList(field.defaults, oldValue, newValue);
                }
                var when = field.when;
                if (when && when.fieldId === fieldId) {
                    when.values = renameList(when.values, oldValue, newValue);
                }
            }
        }

        function renameList(list, oldValue, newValue) {
            var next = [];
            var source = list || [];
            var v;
            for (v = 0; v < source.length; v++) {
                if (source[v] === oldValue) {
                    if (newValue) {
                        next.push(newValue);
                    }
                } else {
                    next.push(source[v]);
                }
            }
            return next;
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

        function renderKeepingFocus() {
            var snap = snapshotFocus();
            render();
            restoreFocus(snap);
        }

        function blockCard(blockIndex) {
            return host.querySelector('.sdf-block-card[data-block-index="' + blockIndex + '"]');
        }

        function fieldCard(blockIndex, fieldIndex) {
            var scope = blockCard(blockIndex);
            if (!scope) {
                return null;
            }
            var cards = scope.querySelectorAll('.sdf-card');
            var i;
            for (i = 0; i < cards.length; i++) {
                if (parseInt(cards[i].getAttribute('data-field-index'), 10) === fieldIndex) {
                    return cards[i];
                }
            }
            return null;
        }

        function patchNodeColor(blockIndex, fieldIndex) {
            var scope = blockCard(blockIndex);
            var field = config.blocks[blockIndex] && config.blocks[blockIndex].fields[fieldIndex];
            if (!scope || !field) {
                return;
            }
            var color = nodeColor(field, fieldIndex);
            var nodes = scope.querySelectorAll('.sdf-node');
            var i;
            for (i = 0; i < nodes.length; i++) {
                if (parseInt(nodes[i].getAttribute('data-field-index'), 10) !== fieldIndex) {
                    continue;
                }
                nodes[i].style.setProperty('--sdf-accent', color);
                var head = nodes[i].querySelector('.sdf-node-head');
                if (head) {
                    head.style.background = color;
                }
                return;
            }
        }

        function patchQuestionTitle(blockIndex, fieldIndex) {
            var scope = blockCard(blockIndex);
            var field = config.blocks[blockIndex] && config.blocks[blockIndex].fields[fieldIndex];
            if (!scope || !field) {
                return;
            }
            var nodes = scope.querySelectorAll('.sdf-node');
            var i;
            for (i = 0; i < nodes.length; i++) {
                if (parseInt(nodes[i].getAttribute('data-field-index'), 10) !== fieldIndex) {
                    continue;
                }
                var title = nodes[i].querySelector('.sdf-node-title');
                if (title) {
                    title.textContent = trim(field.label) || AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.questionOptional');
                    if (field.required) {
                        title.appendChild(el('span', 'sdf-node-req', ' *'));
                    }
                }
                var panel = scope.querySelector('.sdf-float');
                if (panel && panel.getAttribute('data-field-index') === String(fieldIndex)) {
                    var floatTitle = panel.querySelector('.sdf-float-title');
                    if (floatTitle) {
                        floatTitle.textContent = trim(field.label) || AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.questionOptional');
                        if (field.required) {
                            floatTitle.appendChild(el('span', 'sdf-req', ' *'));
                        }
                    }
                }
                return;
            }
        }

        function patchIssueName(blockIndex, fieldIndex) {
            var field = config.blocks[blockIndex] && config.blocks[blockIndex].fields[fieldIndex];
            var card = fieldCard(blockIndex, fieldIndex);
            if (!field || !card || trim(field.issueName)) {
                return;
            }
            var input = card.querySelector('input[data-role="issue-name"]');
            if (!input || document.activeElement === input) {
                return;
            }
            var auto = automaticIssueName(field);
            input.value = auto;
            input.setAttribute('placeholder', auto || AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldPending'));
        }

        function replaceCanvas(blockIndex) {
            var card = blockCard(blockIndex);
            if (!card || !config.blocks[blockIndex]) {
                return;
            }
            var current = card.querySelector('.sdf-canvas-wrap');
            if (!current || !current.parentNode) {
                return;
            }
            var snap = snapshotFocus();
            var kept = current.querySelector('.sdf-node-editor');
            var editorScroll = kept ? kept.scrollTop : 0;
            if (kept && kept.parentNode) {
                kept.parentNode.removeChild(kept);
            }
            var scrolled = current.querySelector('.sdf-canvas');
            var top = scrolled ? scrolled.scrollTop : 0;
            var left = scrolled ? scrolled.scrollLeft : 0;
            var fresh = renderCanvas(config.blocks[blockIndex], blockIndex);
            var freshEditor = fresh.querySelector('.sdf-node-editor');
            if (kept && freshEditor && freshEditor.parentNode) {
                freshEditor.parentNode.replaceChild(kept, freshEditor);
            }
            current.parentNode.replaceChild(fresh, current);
            var next = fresh.querySelector('.sdf-canvas');
            if (next) {
                next.scrollTop = top;
                next.scrollLeft = left;
            }
            if (kept) {
                kept.scrollTop = editorScroll;
            }
            restoreFocus(snap);
            placeFloats();
        }

        function replaceDefaults(blockIndex, fieldIndex) {
            var card = fieldCard(blockIndex, fieldIndex);
            var field = config.blocks[blockIndex] && config.blocks[blockIndex].fields[fieldIndex];
            if (!card || !field) {
                return;
            }
            var current = card.querySelector('[data-part="defaults"]');
            if (!current || !current.parentNode) {
                return;
            }
            current.parentNode.replaceChild(renderDefault(field), current);
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
            if (!snap || snap.blockIndex < 0 || snap.blockIndex !== snap.blockIndex || !snap.role) {
                return;
            }
            var scope = blockCard(snap.blockIndex);
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
            focusLater(found, snap.start, snap.end);
        }

        function focusLater(node, start, end) {
            function apply() {
                if (!node || !node.focus || !document.documentElement || !document.documentElement.contains(node)) {
                    return;
                }
                node.focus();
                if (start != null && node.setSelectionRange) {
                    try {
                        node.setSelectionRange(start, end);
                    } catch (err) {
                        // some input types reject a range
                    }
                }
            }
            apply();
            setTimeout(apply, 0);
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
                focusLater(input, null, null);
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
            if (selectedField.blockIndex === blockIndex) {
                if (selectedField.index === fieldIndex) {
                    selectedField = {blockIndex: -1, index: -1};
                } else if (selectedField.index > fieldIndex) {
                    selectedField.index -= 1;
                }
            }
            var i;
            for (i = 0; i < fields.length; i++) {
                if (fields[i].when && fields[i].when.fieldId === removed.id) {
                    if (removed.when && removed.when.source === 'portal') {
                        fields[i].when = {
                            fieldId: removed.when.fieldId,
                            fieldName: removed.when.fieldName || '',
                            source: 'portal',
                            values: (removed.when.values || []).slice(),
                            negate: !!removed.when.negate,
                            _mode: removed.when._mode || 'any'
                        };
                    } else if (parentId) {
                        fields[i].when.fieldId = parentId;
                        fields[i].when.source = '';
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
                if (!shownInBuilder(block) || !block.fields.length) {
                    continue;
                }
                any = true;
                var section = el('div', 'sdf-block');
                section.setAttribute('data-sdf-block', block.id);
                if (trim(block.title)) {
                    section.appendChild(el('h3', 'sdf-title', trim(block.title)));
                }
                var parents = externalParents(block);
                var p;
                for (p = 0; p < parents.length; p++) {
                    section.appendChild(buildExternal(parents[p]));
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

        function externalParents(block) {
            var list = [];
            var seen = {};
            var i;
            for (i = 0; i < block.fields.length; i++) {
                var when = block.fields[i].when;
                if (!when || when.source !== 'portal' || !when.fieldId || seen[when.fieldId]) {
                    continue;
                }
                seen[when.fieldId] = true;
                var catalog = projectFieldById(when.fieldId);
                var values = [];
                var known = {};
                var source = catalog && catalog.values ? catalog.values : [];
                var v;
                for (v = 0; v < source.length; v++) {
                    if (trim(source[v]) && !known[source[v]]) {
                        known[source[v]] = true;
                        values.push(source[v]);
                    }
                }
                var saved = when.values || [];
                for (v = 0; v < saved.length; v++) {
                    if (trim(saved[v]) && !known[saved[v]]) {
                        known[saved[v]] = true;
                        values.push(saved[v]);
                    }
                }
                list.push({
                    id: when.fieldId,
                    name: (catalog && catalog.name) || when.fieldName || when.fieldId,
                    control: catalog && catalog.control,
                    values: values
                });
            }
            return list;
        }

        function buildExternal(item) {
            var wrap = el('div', 'sdf-field sdf-external');
            wrap.setAttribute('data-sdf-external', '1');
            wrap.setAttribute('data-sdf-field', item.id);
            wrap.setAttribute('data-sdf-shown', '1');
            wrap.appendChild(el('div', 'sdf-label', item.name));
            var control = item.control || (item.values.length ? 'select' : 'text');
            if ((control === 'checkboxes' || control === 'radio') && item.values.length) {
                wrap.setAttribute('data-sdf-type', control === 'radio' ? 'radio' : 'checkbox');
                var choices = el('div', 'sdf-choices');
                var n;
                for (n = 0; n < item.values.length; n++) {
                    var line = el('label', 'sdf-option');
                    var input = document.createElement('input');
                    input.type = control === 'radio' ? 'radio' : 'checkbox';
                    input.value = item.values[n];
                    if (control === 'radio') {
                        input.name = 'sdf-external-' + item.id;
                    }
                    line.appendChild(input);
                    line.appendChild(document.createTextNode(' ' + item.values[n]));
                    choices.appendChild(line);
                }
                wrap.appendChild(choices);
            } else if (item.values.length) {
                wrap.setAttribute('data-sdf-type', 'select');
                var select = document.createElement('select');
                select.className = 'sdf-select';
                var empty = document.createElement('option');
                empty.value = '';
                empty.appendChild(document.createTextNode(AJS.I18n.getText('ru.saael.dynamicfields.portal.blank')));
                select.appendChild(empty);
                var i;
                for (i = 0; i < item.values.length; i++) {
                    var option = document.createElement('option');
                    option.value = item.values[i];
                    option.appendChild(document.createTextNode(item.values[i]));
                    select.appendChild(option);
                }
                wrap.appendChild(select);
            } else {
                wrap.setAttribute('data-sdf-type', 'text');
                var text = document.createElement('input');
                text.type = 'text';
                text.className = 'sdf-input';
                wrap.appendChild(text);
            }
            return wrap;
        }

        function buildField(field, blockId) {
            var wrap = el('div', 'sdf-field');
            wrap.setAttribute('data-sdf-field', field.id);
            wrap.setAttribute('data-sdf-type', field.type || 'text');
            if (field.required) {
                wrap.setAttribute('data-sdf-required', '1');
            }
            if (trim(field.label) || field.required) {
                var caption = el('div', 'sdf-label');
                caption.appendChild(document.createTextNode(trim(field.label)));
                if (field.required) {
                    caption.appendChild(el('span', 'sdf-req', ' *'));
                }
                wrap.appendChild(caption);
            }
            var options = field.options || [];
            var i;
            if (field.type === 'checkbox' || field.type === 'radio') {
                var choices = el('div', 'sdf-choices');
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
                    choices.appendChild(line);
                }
                wrap.appendChild(choices);
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
            appendHelp(wrap, field);
            return wrap;
        }

        function appendHelp(wrap, field) {
            var text = trim(field.help || '');
            if (!text) {
                return;
            }
            var help = el('div', 'sdf-help');
            help.appendChild(document.createTextNode(text));
            wrap.appendChild(help);
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

        function ownedControl(node, el) {
            var current = el;
            while (current) {
                if (current.getAttribute && current.getAttribute('data-sdf-field')) {
                    return current === node;
                }
                current = current.parentNode;
            }
            return false;
        }

        function restoreNode(node, values) {
            var type = node.getAttribute('data-sdf-type');
            if (type === 'checkbox' || type === 'radio') {
                var inputs = node.getElementsByTagName('input');
                var n;
                for (n = 0; n < inputs.length; n++) {
                    if (!ownedControl(node, inputs[n])) {
                        continue;
                    }
                    inputs[n].checked = contains(values, inputs[n].value);
                }
            } else if (type === 'select' || type === 'multiselect') {
                var select = firstOwned(node, 'select');
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
                var area = firstOwned(node, 'textarea');
                if (area) {
                    area.value = values[0];
                }
            } else {
                var text = firstOwned(node, 'input');
                if (text) {
                    text.value = values[0];
                }
            }
        }

        function firstOwned(node, tag) {
            var list = node.getElementsByTagName(tag);
            var i;
            for (i = 0; i < list.length; i++) {
                if (ownedControl(node, list[i])) {
                    return list[i];
                }
            }
            return null;
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
                    if (ownedControl(node, inputs[i]) && inputs[i].checked) {
                        values.push(inputs[i].value);
                    }
                }
            } else if (type === 'select' || type === 'multiselect') {
                var select = firstOwned(node, 'select');
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
                var area = firstOwned(node, 'textarea');
                if (area && trim(area.value)) {
                    values.push(trim(area.value));
                }
            } else {
                var text = firstOwned(node, 'input');
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
                if (node.getAttribute('data-sdf-external') === '1') {
                    node.setAttribute('data-sdf-shown', '1');
                    node.className = (' ' + node.className + ' ').replace(' sdf-hidden ', ' ').replace(/^\s+|\s+$/g, '');
                    continue;
                }
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
            placeBetween(root, block.fields);
        }

        function clearNode(node) {
            var inputs = node.getElementsByTagName('input');
            var i;
            for (i = 0; i < inputs.length; i++) {
                if (!ownedControl(node, inputs[i])) {
                    continue;
                }
                if (inputs[i].type === 'checkbox' || inputs[i].type === 'radio') {
                    inputs[i].checked = false;
                } else {
                    inputs[i].value = '';
                }
            }
            var areas = node.getElementsByTagName('textarea');
            for (i = 0; i < areas.length; i++) {
                if (!ownedControl(node, areas[i])) {
                    continue;
                }
                areas[i].value = '';
            }
            var selects = node.getElementsByTagName('select');
            for (i = 0; i < selects.length; i++) {
                if (!ownedControl(node, selects[i])) {
                    continue;
                }
                if (selects[i].multiple) {
                    var opts = selects[i].options;
                    var n;
                    for (n = 0; n < opts.length; n++) {
                        opts[n].selected = false;
                    }
                } else {
                    selects[i].selectedIndex = 0;
                }
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

        function flatText(value) {
            return String(value == null ? '' : value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        }

        function shown(field, visible, values) {
            var when = field.when;
            if (!when || !when.fieldId) {
                return true;
            }
            var portal = when.source === 'portal';
            if (!portal && !visible[when.fieldId]) {
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
                    if (portal ? flatText(current[i]) : trim(current[i])) {
                        match = true;
                    }
                }
            } else {
                for (a = 0; a < current.length; a++) {
                    for (b = 0; b < expected.length; b++) {
                        if (portal) {
                            if (flatText(current[a]) && flatText(current[a]) === flatText(expected[b])) {
                                match = true;
                            }
                        } else if (String(current[a]) === String(expected[b])) {
                            match = true;
                        }
                    }
                }
            }
            return when.negate ? !match : match;
        }

        function placeBetween(section, fields) {
            if (!section || !fields) {
                return;
            }
            var byId = {};
            var i;
            for (i = 0; i < fields.length; i++) {
                if (fields[i] && fields[i].id) {
                    byId[fields[i].id] = fields[i];
                }
            }
            for (i = 0; i < fields.length; i++) {
                var anchor = previewAnchor(fields[i], byId);
                if (!anchor) {
                    continue;
                }
                var node = previewNode(section, fields[i].id);
                var host = previewNode(section, anchor.fieldId);
                if (!node || !host || host === node || previewContains(node, host)) {
                    continue;
                }
                var slot = previewSlot(host, anchor.values);
                if (!slot || previewContains(node, slot)) {
                    continue;
                }
                if (node.parentNode !== slot) {
                    slot.appendChild(node);
                }
            }
        }

        function previewContains(parent, child) {
            var current = child;
            while (current) {
                if (current === parent) {
                    return true;
                }
                current = current.parentNode;
            }
            return false;
        }

        function previewNode(section, fieldId) {
            if (!section || !section.querySelectorAll) {
                return null;
            }
            var all = section.querySelectorAll('[data-sdf-field]');
            var i;
            for (i = 0; i < all.length; i++) {
                if (all[i].getAttribute('data-sdf-field') === fieldId) {
                    return all[i];
                }
            }
            return null;
        }

        function previewAnchor(field, byId) {
            var seen = {};
            var current = field;
            while (current && current.when && current.when.fieldId) {
                if (seen[current.id]) {
                    return null;
                }
                seen[current.id] = true;
                if (current.when.source === 'portal') {
                    if (current.when._mode === 'any' || !(current.when.values || []).length) {
                        return null;
                    }
                    return {fieldId: current.when.fieldId, values: current.when.values};
                }
                var parent = byId[current.when.fieldId];
                if (!parent) {
                    return null;
                }
                if (parent.type === 'checkbox' || parent.type === 'radio') {
                    if (current.when._mode === 'any' || !(current.when.values || []).length) {
                        return null;
                    }
                    return {fieldId: parent.id, values: current.when.values};
                }
                current = parent;
            }
            return null;
        }

        function previewChoices(node) {
            if (!node || !node.getElementsByTagName) {
                return null;
            }
            var divs = node.getElementsByTagName('div');
            var i;
            for (i = 0; i < divs.length; i++) {
                if (!hasClass(divs[i], 'sdf-choices')) {
                    continue;
                }
                var owner = divs[i];
                while (owner) {
                    if (owner.getAttribute && owner.getAttribute('data-sdf-field')) {
                        break;
                    }
                    owner = owner.parentNode;
                }
                if (owner === node) {
                    return divs[i];
                }
            }
            return null;
        }

        function previewSlot(host, values) {
            var choices = previewChoices(host);
            if (!choices) {
                return null;
            }
            var rows = [];
            var i;
            for (i = 0; i < choices.children.length; i++) {
                if (!hasClass(choices.children[i], 'sdf-under')) {
                    rows.push(choices.children[i]);
                }
            }
            var fallback = null;
            var picked = null;
            for (i = 0; i < rows.length; i++) {
                var input = previewChoiceInput(rows[i]);
                if (!input || !previewValueHit(input.value, values)) {
                    continue;
                }
                if (!fallback) {
                    fallback = rows[i];
                }
                if (input.checked) {
                    picked = rows[i];
                    break;
                }
            }
            var row = picked || fallback;
            if (!row) {
                return null;
            }
            var key = previewChoiceInput(row).value;
            var next = row.nextSibling;
            while (next && next.nodeType !== 1) {
                next = next.nextSibling;
            }
            if (next && next.getAttribute && next.getAttribute('data-sdf-under') === key) {
                return next;
            }
            var slot = document.createElement('div');
            slot.className = 'sdf-under';
            slot.setAttribute('data-sdf-under', key);
            if (row.nextSibling) {
                choices.insertBefore(slot, row.nextSibling);
            } else {
                choices.appendChild(slot);
            }
            return slot;
        }

        function previewChoiceInput(row) {
            var inputs = row.getElementsByTagName('input');
            var i;
            for (i = 0; i < inputs.length; i++) {
                var type = String(inputs[i].type || '').toLowerCase();
                if (type !== 'checkbox' && type !== 'radio') {
                    continue;
                }
                var current = inputs[i];
                var nested = false;
                while (current && current !== row) {
                    if (current.getAttribute && current.getAttribute('data-sdf-field')) {
                        nested = true;
                        break;
                    }
                    current = current.parentNode;
                }
                if (!nested) {
                    return inputs[i];
                }
            }
            return null;
        }

        function previewValueHit(value, values) {
            var i;
            for (i = 0; i < (values || []).length; i++) {
                if (String(value) === String(values[i]) || flatText(value) === flatText(values[i])) {
                    return true;
                }
            }
            return false;
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
