/**
 * Form builder. Renders from the JSON already printed into the page — it does not ask Jira for custom fields.
 */
(function () {
    'use strict';

    function start() {
        var app = document.getElementById('sdf-app');
        if (!app) {
            return;
        }
        var contextPath = app.getAttribute('data-context-path') || '';
        var list = document.getElementById('sdf-fields');
        var preview = document.getElementById('sdf-preview');
        var textarea = document.getElementById('sdf-rules');
        var config = parseInitial(textarea.value);

        document.getElementById('sdf-add').addEventListener('click', addField);
        document.getElementById('sdf-save').addEventListener('click', save);
        document.getElementById('sdf-reload').addEventListener('click', reload);
        document.getElementById('sdf-example').addEventListener('click', loadExample);
        document.getElementById('sdf-example-empty').addEventListener('click', loadExample);
        document.getElementById('sdf-apply-json').addEventListener('click', applyJson);
        document.getElementById('sdf-validate').addEventListener('click', validateOnly);
        document.getElementById('sdf-format').addEventListener('click', function () {
            sync();
        });
        document.getElementById('sdf-title').addEventListener('input', function () {
            config.title = document.getElementById('sdf-title').value;
            sync();
            renderPreview();
        });
        document.getElementById('sdf-clear').addEventListener('change', function () {
            config.clearOnHide = document.getElementById('sdf-clear').checked;
            sync();
        });
        document.getElementById('sdf-request-types').addEventListener('input', function () {
            readTypes();
            sync();
        });
        list.addEventListener('click', onListClick);
        list.addEventListener('input', onListInput);
        list.addEventListener('change', onListChange);

        fillHeader();
        renderCards();
        renderPreview();
        sync();

        function parseInitial(text) {
            try {
                var raw = JSON.parse(text);
                if (raw && raw.version && Number(raw.version) !== 2) {
                    return emptyConfig();
                }
                var cfg = normalize(raw);
                repair(cfg);
                return cfg;
            } catch (e) {
                return emptyConfig();
            }
        }

        function emptyConfig() {
            return {version: 2, title: '', clearOnHide: true, requestTypeIds: [], fields: []};
        }

        function normalize(raw) {
            var cfg = raw || {};
            var fields = [];
            var incoming = cfg.fields || [];
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
                    when = {fieldId: String(src.when.fieldId), values: values, negate: !!src.when.negate};
                }
                fields.push({
                    id: src.id ? String(src.id) : '',
                    label: src.label == null ? '' : String(src.label),
                    type: src.type || 'text',
                    options: options,
                    when: when
                });
            }
            return {
                version: 2,
                title: cfg.title == null ? '' : String(cfg.title),
                clearOnHide: cfg.clearOnHide !== false,
                requestTypeIds: [],
                fields: fields,
                _rawTypeIds: cfg.requestTypeIds || []
            };
        }

        function repair(cfg) {
            var seen = {};
            var ids = [];
            var rawIds = cfg._rawTypeIds || cfg.requestTypeIds || [];
            var r;
            for (r = 0; r < rawIds.length; r++) {
                var number = Number(rawIds[r]);
                if (number > 0) {
                    ids.push(number);
                }
            }
            cfg.requestTypeIds = ids;
            delete cfg._rawTypeIds;
            var i;
            for (i = 0; i < cfg.fields.length; i++) {
                var field = cfg.fields[i];
                if (!field.id) {
                    field.id = nextId(cfg.fields);
                }
                if (field.when && !seen[field.when.fieldId]) {
                    field.when = null;
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

        function isChoice(type) {
            return type === 'checkbox' || type === 'radio' || type === 'select';
        }

        function trim(value) {
            return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
        }

        function fillHeader() {
            document.getElementById('sdf-title').value = config.title || '';
            document.getElementById('sdf-clear').checked = config.clearOnHide !== false;
            document.getElementById('sdf-request-types').value = (config.requestTypeIds || []).join(', ');
        }

        function readTypes() {
            var raw = document.getElementById('sdf-request-types').value;
            var parts = raw.split(',');
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
            config.requestTypeIds = ids;
            config._typesBad = bad;
        }

        function editorDocument() {
            var fields = [];
            var i;
            for (i = 0; i < config.fields.length; i++) {
                var src = config.fields[i];
                var field = {
                    id: src.id,
                    label: src.label || '',
                    type: src.type || 'text',
                    options: isChoice(src.type) ? (src.options || []) : []
                };
                if (src.when && src.when.fieldId) {
                    field.when = {
                        fieldId: src.when.fieldId,
                        values: src.when.values || [],
                        negate: !!src.when.negate
                    };
                }
                fields.push(field);
            }
            return {
                version: 2,
                title: config.title || '',
                clearOnHide: config.clearOnHide !== false,
                requestTypeIds: config.requestTypeIds || [],
                fields: fields
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

        function fieldById(id) {
            var i;
            for (i = 0; i < config.fields.length; i++) {
                if (config.fields[i].id === id) {
                    return config.fields[i];
                }
            }
            return null;
        }

        function renderCards() {
            while (list.firstChild) {
                list.removeChild(list.firstChild);
            }
            document.getElementById('sdf-empty').style.display = config.fields.length ? 'none' : 'block';
            document.getElementById('sdf-count').textContent =
                AJS.I18n.getText('ru.saael.dynamicfields.admin.fields.count') + ' ' + config.fields.length;
            var i;
            for (i = 0; i < config.fields.length; i++) {
                list.appendChild(renderCard(config.fields[i], i));
            }
        }

        function renderCard(field, index) {
            var card = el('div', 'sdf-card');
            card.setAttribute('data-index', String(index));
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
            head.appendChild(button('up', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.up'), index === 0));
            head.appendChild(button('down', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.down'), index === config.fields.length - 1));
            head.appendChild(button('remove', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.remove'), false));
            card.appendChild(head);
            if (isChoice(field.type)) {
                card.appendChild(renderOptions(field));
            }
            card.appendChild(renderWhen(field, index));
            return card;
        }

        function button(role, text, disabled) {
            var node = document.createElement('button');
            node.type = 'button';
            node.className = 'aui-button aui-button-subtle';
            node.setAttribute('data-role', role);
            node.appendChild(document.createTextNode(text));
            if (disabled) {
                node.disabled = true;
            }
            return node;
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

        function renderWhen(field, index) {
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
                var earlier = config.fields[i];
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
                var parent = fieldById(field.when.fieldId);
                var values = el('div', 'sdf-when-values');
                if (!parent || !isChoice(parent.type)) {
                    values.appendChild(el('span', null, AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenFilled')));
                } else {
                    var mode = (field.when.values && field.when.values.length) ? 'selected' : 'any';
                    values.appendChild(modeRadio(index, 'any', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenAny'), mode === 'any'));
                    values.appendChild(modeRadio(index, 'selected', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.whenSelected'), mode === 'selected'));
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

        function modeRadio(index, value, text, checked) {
            var label = document.createElement('label');
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'sdf-when-mode-' + index;
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

        function cardIndex(node) {
            while (node && node !== list) {
                if (node.getAttribute && node.getAttribute('data-index') != null && hasClass(node, 'sdf-card')) {
                    return parseInt(node.getAttribute('data-index'), 10);
                }
                node = node.parentNode;
            }
            return -1;
        }

        function hasClass(node, name) {
            return !!node && (' ' + node.className + ' ').indexOf(' ' + name + ' ') !== -1;
        }

        function onListClick(e) {
            var role = roleOf(e.target);
            if (!role) {
                return;
            }
            var index = cardIndex(e.target);
            if (index < 0) {
                return;
            }
            if (role === 'remove') {
                removeField(index);
            } else if (role === 'up') {
                move(index, -1);
            } else if (role === 'down') {
                move(index, 1);
            } else if (role === 'add-option') {
                config.fields[index].options.push('');
                refresh();
            } else if (role === 'remove-option') {
                var optIndex = parseInt(e.target.getAttribute('data-option-index'), 10);
                var removed = config.fields[index].options.splice(optIndex, 1)[0];
                renameOption(config.fields[index].id, removed, '');
                refresh();
            }
        }

        function onListInput(e) {
            var role = roleOf(e.target);
            var index = cardIndex(e.target);
            if (index < 0) {
                return;
            }
            if (role === 'label') {
                config.fields[index].label = e.target.value;
                sync();
                renderPreview();
            } else if (role === 'option') {
                var optIndex = parseInt(e.target.getAttribute('data-option-index'), 10);
                var old = config.fields[index].options[optIndex];
                config.fields[index].options[optIndex] = e.target.value;
                renameOption(config.fields[index].id, old, e.target.value);
                sync();
                renderPreview();
            }
        }

        function onListChange(e) {
            var role = roleOf(e.target);
            var index = cardIndex(e.target);
            if (index < 0) {
                return;
            }
            if (role === 'type') {
                var field = config.fields[index];
                field.type = e.target.value;
                if (isChoice(field.type)) {
                    if (!field.options || !field.options.length) {
                        field.options = [''];
                    }
                } else {
                    field.options = [];
                    relaxDependents(field.id);
                }
                refresh();
            } else if (role === 'when-field') {
                if (!e.target.value) {
                    config.fields[index].when = null;
                } else {
                    config.fields[index].when = {fieldId: e.target.value, values: [], negate: false};
                }
                refresh();
            } else if (role === 'when-mode') {
                if (e.target.value === 'any' && config.fields[index].when) {
                    config.fields[index].when.values = [];
                    sync();
                    renderPreview();
                }
            } else if (role === 'when-value') {
                var when = config.fields[index].when;
                if (!when) {
                    return;
                }
                var next = [];
                var i;
                for (i = 0; i < (when.values || []).length; i++) {
                    if (when.values[i] !== e.target.value) {
                        next.push(when.values[i]);
                    }
                }
                if (e.target.checked) {
                    next.push(e.target.value);
                }
                when.values = next;
                var selected = e.target.parentNode.parentNode.querySelector('input[data-role="when-mode"][value="selected"]');
                if (selected) {
                    selected.checked = true;
                }
                sync();
                renderPreview();
            }
        }

        function roleOf(node) {
            while (node && node !== list) {
                if (node.getAttribute && node.getAttribute('data-role')) {
                    return node.getAttribute('data-role');
                }
                node = node.parentNode;
            }
            return null;
        }

        function renameOption(fieldId, oldValue, newValue) {
            if (oldValue === newValue) {
                return;
            }
            var i;
            var v;
            for (i = 0; i < config.fields.length; i++) {
                var when = config.fields[i].when;
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

        function relaxDependents(id) {
            var i;
            for (i = 0; i < config.fields.length; i++) {
                if (config.fields[i].when && config.fields[i].when.fieldId === id) {
                    config.fields[i].when.values = [];
                }
            }
        }

        function refresh() {
            repair(config);
            sync();
            renderCards();
            renderPreview();
        }

        function addField() {
            config.fields.push({id: nextId(config.fields), label: '', type: 'checkbox', options: [''], when: null});
            refresh();
            var inputs = list.querySelectorAll('input[data-role="label"]');
            if (inputs.length) {
                inputs[inputs.length - 1].focus();
            }
        }

        function removeField(index) {
            var id = config.fields[index].id;
            config.fields.splice(index, 1);
            var i;
            for (i = 0; i < config.fields.length; i++) {
                if (config.fields[i].when && config.fields[i].when.fieldId === id) {
                    config.fields[i].when = null;
                }
            }
            refresh();
        }

        function move(index, delta) {
            var next = index + delta;
            if (next < 0 || next >= config.fields.length) {
                return;
            }
            var item = config.fields.splice(index, 1)[0];
            config.fields.splice(next, 0, item);
            refresh();
        }

        function whenModeFromDom(index) {
            var card = list.querySelector('.sdf-card[data-index="' + index + '"]');
            if (!card) {
                return null;
            }
            var selected = card.querySelector('input[data-role="when-mode"][value="selected"]');
            if (selected && selected.checked) {
                return 'selected';
            }
            var any = card.querySelector('input[data-role="when-mode"][value="any"]');
            if (any && any.checked) {
                return 'any';
            }
            return null;
        }

        function documentForSave() {
            readTypes();
            config.title = document.getElementById('sdf-title').value;
            config.clearOnHide = document.getElementById('sdf-clear').checked;
            var fields = [];
            var i;
            for (i = 0; i < config.fields.length; i++) {
                var src = config.fields[i];
                var options = [];
                if (isChoice(src.type)) {
                    var o;
                    for (o = 0; o < (src.options || []).length; o++) {
                        var text = trim(src.options[o]);
                        if (text) {
                            options.push(text);
                        }
                    }
                }
                var field = {id: src.id, label: trim(src.label), type: src.type, options: options};
                if (src.when && src.when.fieldId) {
                    var values = [];
                    var parent = fieldById(src.when.fieldId);
                    var mode = whenModeFromDom(i);
                    if (parent && isChoice(parent.type) && mode !== 'any') {
                        var v;
                        for (v = 0; v < (src.when.values || []).length; v++) {
                            var item = trim(src.when.values[v]);
                            if (item) {
                                values.push(item);
                            }
                        }
                    }
                    field.when = {fieldId: src.when.fieldId, values: values, negate: false};
                }
                fields.push(field);
            }
            return {
                version: 2,
                title: trim(config.title || ''),
                clearOnHide: !!config.clearOnHide,
                requestTypeIds: config.requestTypeIds || [],
                fields: fields
            };
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
            if (config._typesBad) {
                pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needTypes'));
            }
            var i;
            for (i = 0; i < doc.fields.length; i++) {
                if (!doc.fields[i].label) {
                    pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needName'));
                }
                if (isChoice(doc.fields[i].type) && !doc.fields[i].options.length) {
                    pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needOption'));
                }
                if (doc.fields[i].when && whenModeFromDom(i) === 'selected' && !doc.fields[i].when.values.length) {
                    pushText(AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needValue'));
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
            config = normalize(raw);
            repair(config);
            fillHeader();
            renderCards();
            renderPreview();
            sync();
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
            if (config.fields.length && !window.confirm(AJS.I18n.getText('ru.saael.dynamicfields.admin.example.confirm'))) {
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
            if (raw && raw.version && Number(raw.version) !== 2) {
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
                previous = readValues(current, false);
            }
            while (preview.firstChild) {
                preview.removeChild(preview.firstChild);
            }
            if (!config.fields.length) {
                preview.appendChild(el('p', 'sdf-preview-empty', AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.previewEmpty')));
                return;
            }
            var form = buildPreview(config);
            preview.appendChild(form);
            restore(form, previous);
            applyVisibility(form, config);
            form.addEventListener('change', function () {
                applyVisibility(form, config);
            });
            form.addEventListener('input', function () {
                applyVisibility(form, config);
            });
        }

        function buildPreview(cfg) {
            var block = el('div', 'sdf-block');
            block.id = 'sdf-preview-form';
            if (trim(cfg.title)) {
                block.appendChild(el('h3', 'sdf-title', trim(cfg.title)));
            }
            var visible = visibility(cfg.fields, {});
            var i;
            for (i = 0; i < cfg.fields.length; i++) {
                var node = buildField(cfg.fields[i]);
                var show = !!visible[cfg.fields[i].id];
                node.setAttribute('data-sdf-shown', show ? '1' : '0');
                if (!show) {
                    node.className += ' sdf-hidden';
                }
                block.appendChild(node);
            }
            return block;
        }

        function buildField(field) {
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
                        input.name = 'sdf-preview-' + field.id;
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

        function restore(root, previous) {
            var nodes = root.querySelectorAll('[data-sdf-field]');
            var i;
            for (i = 0; i < nodes.length; i++) {
                var id = nodes[i].getAttribute('data-sdf-field');
                var values = previous[id] || [];
                if (!values.length) {
                    continue;
                }
                var type = nodes[i].getAttribute('data-sdf-type');
                if (type === 'checkbox' || type === 'radio') {
                    var inputs = nodes[i].getElementsByTagName('input');
                    var n;
                    for (n = 0; n < inputs.length; n++) {
                        inputs[n].checked = contains(values, inputs[n].value);
                    }
                } else if (type === 'select') {
                    nodes[i].getElementsByTagName('select')[0].value = values[0];
                } else if (type === 'textarea') {
                    nodes[i].getElementsByTagName('textarea')[0].value = values[0];
                } else {
                    nodes[i].getElementsByTagName('input')[0].value = values[0];
                }
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

        function applyVisibility(root, cfg) {
            var values = readValues(root, false);
            var visible = visibility(cfg.fields, values);
            var nodes = root.querySelectorAll('[data-sdf-field]');
            var i;
            for (i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var show = !!visible[node.getAttribute('data-sdf-field')];
                var was = node.getAttribute('data-sdf-shown') === '1';
                if (!show && was && cfg.clearOnHide !== false) {
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
