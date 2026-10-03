/* Portal Dynamic Fields - visual rule builder on the administration page. */
AJS.toInit(function ($) {
    'use strict';

    var app = $('#sdf-app');
    if (!app.length) {
        return;
    }

    var BASE = (app.data('context-path') || AJS.contextPath() || '') + '/rest/dynamic-fields/1.0';
    var editor = $('#sdf-rules');
    var messages = $('#sdf-messages');
    var list = $('#sdf-rules-list');
    var buttons = $('#sdf-save, #sdf-validate, #sdf-format, #sdf-example, #sdf-reload, #sdf-apply-json, #sdf-add-rule');

    // literal keys only: the jsI18n transformer rewrites these calls at serve time
    var MSG = {
        invalid: AJS.I18n.getText('ru.saael.dynamicfields.admin.invalid'),
        valid: AJS.I18n.getText('ru.saael.dynamicfields.admin.valid'),
        saved: AJS.I18n.getText('ru.saael.dynamicfields.admin.saved'),
        exampleConfirm: AJS.I18n.getText('ru.saael.dynamicfields.admin.example.confirm'),
        requestFailed: AJS.I18n.getText('ru.saael.dynamicfields.admin.error.request'),
        rulesCount: function (count) {
            return AJS.I18n.getText('ru.saael.dynamicfields.admin.rules.count', count);
        },
        addRule: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addRule'),
        empty: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.empty'),
        ifWord: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.if'),
        showWord: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.show'),
        opIs: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.op.is'),
        opAny: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.op.any'),
        opNot: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.op.not'),
        addField: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.addField'),
        remove: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.remove'),
        up: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.up'),
        down: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.down'),
        extra: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.extra'),
        portal: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.portal'),
        requestTypes: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.requestTypes'),
        clearRule: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.clearRule'),
        clearInherit: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.clearInherit'),
        clearYes: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.clearYes'),
        clearNo: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.clearNo'),
        comment: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.comment'),
        previewEmpty: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.previewEmpty'),
        customGroup: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.customGroup'),
        systemGroup: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.systemGroup'),
        missingField: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.missingField'),
        extraValue: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.extraValue'),
        pickField: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.pickField'),
        none: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.none'),
        fieldsError: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.fieldsError'),
        needValue: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.needValue'),
        typeLabel: function (type) {
            var names = {
                checkbox: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.checkbox'),
                radio: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.radio'),
                select: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.select'),
                multiselect: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.multiselect'),
                cascading: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.cascading'),
                text: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.text'),
                textarea: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.textarea'),
                number: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.number'),
                date: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.date'),
                user: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.user'),
                other: AJS.I18n.getText('ru.saael.dynamicfields.admin.builder.type.other')
            };
            return names[type] || names.other;
        }
    };

    var state = { version: 1, clearOnHide: true, containerSelectors: [], rules: [] };
    var fields = [];
    var fieldsById = {};
    var jsonDirty = false;
    var previewKey = '';
    var idSeq = 1;

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function clearMessages() {
        messages.empty();
    }

    function showMessage(type, title, items) {
        clearMessages();
        var box = $('<div class="aui-message"></div>').addClass('aui-message-' + type);
        box.append($('<p class="title"></p>').append($('<strong></strong>').text(title)));
        if (items && items.length) {
            var ul = $('<ul class="sdf-errors"></ul>');
            $.each(items, function (i, item) {
                ul.append($('<li></li>').text(item));
            });
            box.append(ul);
        }
        messages.append(box);
    }

    function flag(type, title) {
        if (AJS.flag) {
            AJS.flag({ type: type, title: title, close: 'auto' });
        }
    }

    function errorsOf(xhr) {
        try {
            var payload = JSON.parse(xhr.responseText);
            if (payload.errors && payload.errors.length) {
                return payload.errors;
            }
            if (payload.error) {
                return [payload.error];
            }
        } catch (e) {
            // not JSON
        }
        return ['HTTP ' + xhr.status + ' ' + (xhr.statusText || '')];
    }

    function busy(isBusy) {
        buttons.prop('disabled', isBusy);
        buttons.toggleClass('sdf-busy', isBusy);
    }

    function nextId() {
        var id;
        do {
            id = 'rule-' + (idSeq++);
        } while (state.rules.some(function (rule) { return rule.id === id; }));
        return id;
    }

    function blankRule() {
        return {
            id: nextId(),
            description: '',
            portalId: '',
            requestTypeIds: [],
            when: { fieldId: '', values: [], negate: false },
            operator: 'is',
            show: [''],
            clearOnHide: null
        };
    }

    function operatorOf(rule) {
        return rule.operator || 'is';
    }

    function normalize(config) {
        state.version = config.version || 1;
        state.clearOnHide = config.clearOnHide !== false;
        state.containerSelectors = config.containerSelectors || [];
        state.rules = (config.rules || []).map(function (rule, index) {
            var when = rule.when || {};
            return {
                id: rule.id || ('rule-' + (index + 1)),
                description: rule.description || '',
                portalId: rule.portalId == null ? '' : rule.portalId,
                requestTypeIds: rule.requestTypeIds || [],
                when: {
                    fieldId: when.fieldId || '',
                    values: when.values ? when.values.slice() : [],
                    negate: !!when.negate
                },
                operator: when.negate ? 'not' : (when.values && when.values.length ? 'is' : 'any'),
                show: rule.show && rule.show.length ? rule.show.slice() : [''],
                clearOnHide: rule.clearOnHide === true || rule.clearOnHide === false ? rule.clearOnHide : null
            };
        });
        state.rules.forEach(function (rule) {
            var match = /^rule-(\d+)$/.exec(rule.id);
            if (match) {
                idSeq = Math.max(idSeq, Number(match[1]) + 1);
            }
        });
        $('#sdf-clear-on-hide').prop('checked', state.clearOnHide);
    }

    function cleanState(preview) {
        return {
            version: state.version || 1,
            clearOnHide: state.clearOnHide !== false,
            containerSelectors: state.containerSelectors || [],
            rules: state.rules.map(function (rule, index) {
                var out = {
                    id: rule.id || ('rule-' + (index + 1)),
                    when: {
                        fieldId: rule.when.fieldId,
                        // an "is" / "is not" condition without a chosen value must not fall back to "any value"
                        values: operatorOf(rule) === 'any' ? []
                            : ((rule.when.values && rule.when.values.length) ? rule.when.values.slice() : (preview ? ['\u0000'] : [])),
                        negate: operatorOf(rule) === 'not'
                    },
                    show: (rule.show || []).filter(function (id) { return !!id; })
                };
                if (rule.description) {
                    out.description = rule.description;
                }
                if (rule.portalId !== '' && rule.portalId != null) {
                    out.portalId = Number(rule.portalId);
                }
                if (rule.requestTypeIds && rule.requestTypeIds.length) {
                    out.requestTypeIds = rule.requestTypeIds.map(Number);
                }
                if (rule.clearOnHide === true || rule.clearOnHide === false) {
                    out.clearOnHide = rule.clearOnHide;
                }
                return out;
            })
        };
    }

    function fieldOptionsHtml(selectedId) {
        var html = '<option value="">' + escapeHtml(MSG.pickField) + '</option>';
        function group(label, items) {
            if (!items.length) {
                return '';
            }
            var chunk = '<optgroup label="' + escapeHtml(label) + '">';
            items.forEach(function (field) {
                chunk += '<option value="' + escapeHtml(field.id) + '"' + (field.id === selectedId ? ' selected' : '') + '>'
                    + escapeHtml(field.name + ' — ' + MSG.typeLabel(field.type)) + '</option>';
            });
            return chunk + '</optgroup>';
        }
        html += group(MSG.customGroup, fields.filter(function (field) { return field.custom; }));
        html += group(MSG.systemGroup, fields.filter(function (field) { return !field.custom; }));
        if (selectedId && !fieldsById[selectedId]) {
            html += '<option value="' + escapeHtml(selectedId) + '" selected>'
                + escapeHtml(selectedId + ' (' + MSG.missingField + ')') + '</option>';
        }
        return html;
    }

    function valuesHtml(rule) {
        if (operatorOf(rule) === 'any') {
            return '';
        }
        var field = fieldsById[rule.when.fieldId];
        var html = '<div class="sdf-values">';
        var known = {};
        if (field && field.options && field.options.length) {
            field.options.forEach(function (option) {
                var checked = (rule.when.values || []).some(function (value) {
                    return String(value) === String(option.label) || String(value) === String(option.id);
                });
                if (checked) {
                    known[String(option.label)] = true;
                    known[String(option.id)] = true;
                }
                html += '<label class="sdf-option"><input type="checkbox" data-prop="value-option" data-label="'
                    + escapeHtml(option.label) + '"' + (checked ? ' checked' : '') + '> '
                    + escapeHtml(option.label) + '</label>';
            });
        }
        var extra = (rule.when.values || []).filter(function (value) { return !known[String(value)]; });
        html += '<input class="text sdf-extra" type="text" data-prop="extra" placeholder="' + escapeHtml(MSG.extraValue)
            + '" value="' + escapeHtml(extra.join(', ')) + '">';
        return html + '</div>';
    }

    function ruleHtml(rule, index) {
        var clear = rule.clearOnHide === true ? 'true' : (rule.clearOnHide === false ? 'false' : '');
        var shows = (rule.show || ['']).map(function (fieldId, showIndex) {
            return '<div class="sdf-show-row" data-show-index="' + showIndex + '">'
                + '<select data-prop="show">' + fieldOptionsHtml(fieldId) + '</select>'
                + '<button type="button" class="sdf-icon-button" data-action="remove-show" title="' + escapeHtml(MSG.remove) + '">\u00d7</button>'
                + '</div>';
        }).join('');
        return '<div class="sdf-rule" data-index="' + index + '">'
            + '<div class="sdf-rule-head">'
            + '<span class="sdf-rule-num">' + (index + 1) + '</span>'
            + '<input class="text sdf-comment" type="text" data-prop="description" placeholder="' + escapeHtml(MSG.comment) + '" value="' + escapeHtml(rule.description) + '">'
            + '<button type="button" class="sdf-icon-button" data-action="up" title="' + escapeHtml(MSG.up) + '">\u2191</button>'
            + '<button type="button" class="sdf-icon-button" data-action="down" title="' + escapeHtml(MSG.down) + '">\u2193</button>'
            + '<button type="button" class="aui-button aui-button-subtle" data-action="delete">' + escapeHtml(MSG.remove) + '</button>'
            + '</div>'
            + '<div class="sdf-row">'
            + '<span class="sdf-kw">' + escapeHtml(MSG.ifWord) + '</span>'
            + '<select data-prop="fieldId">' + fieldOptionsHtml(rule.when.fieldId) + '</select>'
            + '<select data-prop="operator">'
            + '<option value="is"' + (operatorOf(rule) === 'is' ? ' selected' : '') + '>' + escapeHtml(MSG.opIs) + '</option>'
            + '<option value="any"' + (operatorOf(rule) === 'any' ? ' selected' : '') + '>' + escapeHtml(MSG.opAny) + '</option>'
            + '<option value="not"' + (operatorOf(rule) === 'not' ? ' selected' : '') + '>' + escapeHtml(MSG.opNot) + '</option>'
            + '</select>'
            + valuesHtml(rule)
            + '</div>'
            + '<div class="sdf-row sdf-show">'
            + '<span class="sdf-kw">' + escapeHtml(MSG.showWord) + '</span>'
            + '<div>' + shows
            + '<button type="button" class="aui-button aui-button-link" data-action="add-show">' + escapeHtml(MSG.addField) + '</button>'
            + '</div></div>'
            + '<details class="sdf-scope"><summary>' + escapeHtml(MSG.extra) + '</summary>'
            + '<div class="sdf-scope-body">'
            + '<div><label>' + escapeHtml(MSG.portal) + '</label><input class="text" type="text" data-prop="portalId" value="' + escapeHtml(rule.portalId) + '"></div>'
            + '<div><label>' + escapeHtml(MSG.requestTypes) + '</label><input class="text" type="text" data-prop="requestTypes" value="' + escapeHtml((rule.requestTypeIds || []).join(', ')) + '"></div>'
            + '<div><label>' + escapeHtml(MSG.clearRule) + '</label><select data-prop="clearOnHide">'
            + '<option value=""' + (clear === '' ? ' selected' : '') + '>' + escapeHtml(MSG.clearInherit) + '</option>'
            + '<option value="true"' + (clear === 'true' ? ' selected' : '') + '>' + escapeHtml(MSG.clearYes) + '</option>'
            + '<option value="false"' + (clear === 'false' ? ' selected' : '') + '>' + escapeHtml(MSG.clearNo) + '</option>'
            + '</select></div>'
            + '</div></details>'
            + '</div>';
    }

    function previewControl(field) {
        var id = field.id;
        if (field.type === 'checkbox' || field.type === 'radio') {
            var boxes = (field.options || []).map(function (option, index) {
                var controlId = 'pv-' + id + '-' + index;
                return '<div class="' + field.type + '"><input type="' + field.type + '" name="' + escapeHtml(id)
                    + '" id="' + controlId + '" value="' + escapeHtml(option.id) + '">'
                    + '<label for="' + controlId + '">' + escapeHtml(option.label) + '</label></div>';
            }).join('');
            return '<fieldset class="field-group group"><legend class="field-label">' + escapeHtml(field.name)
                + '</legend>' + boxes + '</fieldset>';
        }
        var control;
        if (field.type === 'select' || field.type === 'multiselect' || field.type === 'cascading') {
            var multiple = field.type === 'multiselect' ? ' multiple' : '';
            var options = '<option value="-1">' + escapeHtml(MSG.none) + '</option>';
            (field.options || []).forEach(function (option) {
                options += '<option value="' + escapeHtml(option.id) + '">' + escapeHtml(option.label) + '</option>';
            });
            control = '<select' + multiple + ' name="' + escapeHtml(id) + '" id="pv-' + escapeHtml(id) + '">' + options + '</select>';
        } else if (field.type === 'textarea') {
            control = '<textarea name="' + escapeHtml(id) + '" id="pv-' + escapeHtml(id) + '" rows="3"></textarea>';
        } else {
            control = '<input class="text" type="text" name="' + escapeHtml(id) + '" id="pv-' + escapeHtml(id) + '">';
        }
        return '<div class="field-group"><label class="field-label" for="pv-' + escapeHtml(id) + '">'
            + escapeHtml(field.name) + '</label><div class="field-container">' + control + '</div></div>';
    }

    function previewFieldIds() {
        var ids = [];
        state.rules.forEach(function (rule) {
            [rule.when.fieldId].concat(rule.show || []).forEach(function (id) {
                if (id && ids.indexOf(id) === -1) {
                    ids.push(id);
                }
            });
        });
        return ids;
    }

    function renderPreview(ids) {
        var preview = $('#sdf-preview');
        if (!ids.length) {
            preview.html('<p class="sdf-preview-empty">' + escapeHtml(MSG.previewEmpty) + '</p>');
            return;
        }
        preview.html(ids.map(function (id) {
            var field = fieldsById[id] || { id: id, name: id, type: 'text', options: [] };
            return previewControl(field);
        }).join(''));
    }

    /** Rules whose "is" / "is not" condition has no value yet, so they cannot be saved. */
    function rulesMissingValue() {
        var numbers = [];
        state.rules.forEach(function (rule, index) {
            if (rule.when.fieldId && operatorOf(rule) !== 'any' && !(rule.when.values || []).length) {
                numbers.push(String(index + 1));
            }
        });
        return numbers;
    }

    function pushEngine() {
        var cleaned = cleanState(false);
        if (!jsonDirty) {
            editor.val(JSON.stringify(cleaned, null, 2));
        }
        $('#sdf-rules-count').text(MSG.rulesCount(cleaned.rules.length));
        if (window.SaaelDynamicFields && window.SaaelDynamicFields.setConfig) {
            window.SaaelDynamicFields.setConfig(cleanState(true));
        }
    }

    function updatePreview() {
        var ids = previewFieldIds();
        var key = ids.join('\n');
        if (key !== previewKey) {
            previewKey = key;
            renderPreview(ids);
        }
        pushEngine();
    }

    function renderRules() {
        $('#sdf-loading').hide();
        $('#sdf-empty').toggle(state.rules.length === 0);
        list.html(state.rules.map(ruleHtml).join(''));
        updatePreview();
    }

    function cardIndex(el) {
        return Number($(el).closest('.sdf-rule').attr('data-index'));
    }

    function syncValues(rule, box) {
        var values = [];
        box.find('[data-prop="value-option"]:checked').each(function () {
            values.push($(this).attr('data-label'));
        });
        $.trim(box.find('[data-prop="extra"]').val() || '').split(',').forEach(function (part) {
            part = $.trim(part);
            if (part && values.indexOf(part) === -1) {
                values.push(part);
            }
        });
        rule.when.values = values;
    }

    function parseRequestTypes(text) {
        var ids = [];
        String(text || '').split(/[,;\s]+/).forEach(function (part) {
            if (/^\d+$/.test(part)) {
                ids.push(Number(part));
            }
        });
        return ids;
    }

    function documentJson() {
        if (!jsonDirty) {
            return JSON.stringify(cleanState(), null, 2);
        }
        return editor.val();
    }

    list.on('click', '[data-action]', function () {
        var index = cardIndex(this);
        var rule = state.rules[index];
        var action = $(this).attr('data-action');
        if (action === 'delete') {
            state.rules.splice(index, 1);
        } else if (action === 'up' && index > 0) {
            state.rules.splice(index - 1, 2, state.rules[index], state.rules[index - 1]);
        } else if (action === 'down' && index < state.rules.length - 1) {
            state.rules.splice(index, 2, state.rules[index + 1], state.rules[index]);
        } else if (action === 'add-show') {
            rule.show.push('');
        } else if (action === 'remove-show') {
            rule.show.splice(Number($(this).closest('[data-show-index]').attr('data-show-index')), 1);
            if (!rule.show.length) {
                rule.show.push('');
            }
        } else {
            return;
        }
        renderRules();
    });

    list.on('change', '[data-prop]', function () {
        var rule = state.rules[cardIndex(this)];
        var prop = $(this).attr('data-prop');
        if (prop === 'fieldId') {
            rule.when.fieldId = this.value;
            rule.when.values = [];
            renderRules();
        } else if (prop === 'operator') {
            rule.operator = this.value;
            rule.when.negate = this.value === 'not';
            if (this.value === 'any') {
                rule.when.values = [];
            }
            renderRules();
        } else if (prop === 'show') {
            rule.show[Number($(this).closest('[data-show-index]').attr('data-show-index'))] = this.value;
            updatePreview();
        } else if (prop === 'clearOnHide') {
            rule.clearOnHide = this.value === '' ? null : this.value === 'true';
            pushEngine();
        } else if (prop === 'value-option') {
            syncValues(rule, $(this).closest('.sdf-values'));
            pushEngine();
        }
    });

    list.on('input', '[data-prop="description"], [data-prop="extra"], [data-prop="portalId"], [data-prop="requestTypes"]', function () {
        var rule = state.rules[cardIndex(this)];
        var prop = $(this).attr('data-prop');
        if (prop === 'description') {
            rule.description = this.value;
        } else if (prop === 'portalId') {
            rule.portalId = $.trim(this.value);
        } else if (prop === 'requestTypes') {
            rule.requestTypeIds = parseRequestTypes(this.value);
        } else if (prop === 'extra') {
            syncValues(rule, $(this).closest('.sdf-values'));
        }
        pushEngine();
    });

    $('#sdf-add-rule').on('click', function () {
        state.rules.push(blankRule());
        renderRules();
    });

    $('#sdf-clear-on-hide').on('change', function () {
        state.clearOnHide = this.checked;
        pushEngine();
    });

    editor.on('input', function () {
        jsonDirty = true;
    });

    editor.on('keydown', function (e) {
        if (e.key === 'Tab' || e.keyCode === 9) {
            e.preventDefault();
            var start = this.selectionStart;
            var end = this.selectionEnd;
            this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 2;
            jsonDirty = true;
        }
    });

    function applyDocument(text) {
        var parsed = JSON.parse(text);
        jsonDirty = false;
        previewKey = '';
        normalize(parsed);
        renderRules();
        return parsed;
    }

    $('#sdf-apply-json').on('click', function () {
        try {
            applyDocument(editor.val());
            clearMessages();
        } catch (e) {
            showMessage('error', MSG.invalid, [e.message]);
        }
    });

    $('#sdf-format').on('click', function () {
        try {
            editor.val(JSON.stringify(JSON.parse(documentJson()), null, 2));
            clearMessages();
        } catch (e) {
            showMessage('error', MSG.invalid, [e.message]);
        }
    });

    function post(method, url, body, onSuccess) {
        busy(true);
        $.ajax({
            type: method,
            url: url,
            data: body,
            contentType: 'application/json; charset=utf-8',
            dataType: 'text',
            headers: { 'X-Atlassian-Token': 'no-check' }
        }).done(onSuccess).fail(function (xhr) {
            showMessage('error', MSG.invalid, errorsOf(xhr));
        }).always(function () {
            busy(false);
        });
    }

    $('#sdf-validate').on('click', function () {
        var body;
        try {
            body = JSON.stringify(JSON.parse(documentJson()));
        } catch (e) {
            showMessage('error', MSG.invalid, [e.message]);
            return;
        }
        post('POST', BASE + '/rules/validate', body, function () {
            showMessage('success', MSG.valid);
        });
    });

    $('#sdf-save').on('click', function () {
        if (!jsonDirty) {
            var missing = rulesMissingValue();
            if (missing.length) {
                showMessage('error', MSG.invalid, [MSG.needValue + ' (' + missing.join(', ') + ')']);
                return;
            }
        }
        var body;
        try {
            body = JSON.stringify(JSON.parse(documentJson()));
        } catch (e) {
            showMessage('error', MSG.invalid, [e.message]);
            return;
        }
        post('PUT', BASE + '/rules', body, function (stored) {
            applyDocument(stored);
            showMessage('success', MSG.saved);
            flag('success', MSG.saved);
        });
    });

    $('#sdf-example').on('click', function () {
        if (state.rules.length && !window.confirm(MSG.exampleConfirm)) {
            return;
        }
        busy(true);
        $.ajax({ type: 'GET', url: BASE + '/rules/example', dataType: 'text' })
            .done(function (example) {
                applyDocument(example);
                clearMessages();
            })
            .fail(function (xhr) {
                showMessage('error', MSG.requestFailed, errorsOf(xhr));
            })
            .always(function () {
                busy(false);
            });
    });

    $('#sdf-reload').on('click', function () {
        busy(true);
        $.ajax({ type: 'GET', url: BASE + '/rules', dataType: 'text', cache: false })
            .done(function (stored) {
                applyDocument(stored);
                clearMessages();
            })
            .fail(function (xhr) {
                showMessage('error', MSG.requestFailed, errorsOf(xhr));
            })
            .always(function () {
                busy(false);
            });
    });

    function loadFields() {
        $.ajax({ type: 'GET', url: BASE + '/meta/fields', dataType: 'json' })
            .done(function (loaded) {
                fields = loaded || [];
                fieldsById = {};
                fields.forEach(function (field) {
                    fieldsById[field.id] = field;
                });
            })
            .fail(function (xhr) {
                showMessage('error', MSG.fieldsError, errorsOf(xhr));
            })
            .always(function () {
                try {
                    normalize(JSON.parse(editor.val()));
                } catch (e) {
                    normalize({ rules: [] });
                }
                renderRules();
            });
    }

    loadFields();
});
