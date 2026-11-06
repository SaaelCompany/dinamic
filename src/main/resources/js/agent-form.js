/* global AJS */
(function () {
    'use strict';

    var configCache = null;
    var loading = false;
    var waiters = [];
    var scheduled = false;

    function trim(value) {
        return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function hasClass(el, name) {
        return !!el && (' ' + el.className + ' ').indexOf(' ' + name + ' ') !== -1;
    }

    function addClass(el, name) {
        if (el && !hasClass(el, name)) {
            el.className += (el.className ? ' ' : '') + name;
        }
    }

    function removeClass(el, name) {
        if (!el || !el.className) {
            return;
        }
        el.className = trim((' ' + el.className + ' ').replace(' ' + name + ' ', ' '));
    }

    function issueForms() {
        var all = document.getElementsByTagName('form');
        var out = [];
        var i;
        for (i = 0; i < all.length; i++) {
            var id = all[i].id || '';
            var action = all[i].getAttribute('action') || '';
            if (id === 'issue-create' || id === 'issue-edit' || action.indexOf('CreateIssue') >= 0 || action.indexOf('EditIssue') >= 0) {
                out.push(all[i]);
            }
        }
        return out;
    }

    function load(done) {
        if (configCache) {
            done(configCache);
            return;
        }
        waiters.push(done);
        if (loading) {
            return;
        }
        loading = true;
        var path = '';
        if (window.AJS && AJS.contextPath) {
            path = AJS.contextPath();
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', path + '/rest/dynamic-fields/1.0/form', true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) {
                return;
            }
            loading = false;
            var parsed = null;
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    parsed = JSON.parse(xhr.responseText);
                } catch (err) {
                    parsed = null;
                }
            }
            configCache = parsed || {blocks: []};
            var pending = waiters;
            waiters = [];
            var i;
            for (i = 0; i < pending.length; i++) {
                pending[i](configCache);
            }
        };
        xhr.send(null);
    }

    function questionsOf(config) {
        var byMarker = {};
        var byJira = {};
        var list = [];
        var blocks = config && config.blocks ? config.blocks : [];
        var b;
        var i;
        for (b = 0; b < blocks.length; b++) {
            var block = blocks[b];
            var fields = block && block.fields ? block.fields : [];
            for (i = 0; i < fields.length; i++) {
                var field = fields[i];
                if (!field || !field.id) {
                    continue;
                }
                var item = {field: field, block: block, marker: 'sdf:' + block.id + ':' + field.id};
                byMarker[item.marker] = item;
                if (field.jiraFieldId) {
                    byJira[field.jiraFieldId] = item;
                }
                list.push(item);
            }
        }
        return {byMarker: byMarker, byJira: byJira, list: list};
    }

    function markerText(group) {
        var nodes = group.querySelectorAll('.description, .aui-field-description');
        var i;
        for (i = 0; i < nodes.length; i++) {
            var text = trim(nodes[i].textContent || nodes[i].innerText || '');
            if (text.indexOf('sdf:') === 0) {
                addClass(nodes[i], 'sdf-agent-marker');
                return text;
            }
        }
        return '';
    }

    function jiraIdOf(group) {
        var nodes = group.querySelectorAll('textarea, input, select');
        var i;
        for (i = 0; i < nodes.length; i++) {
            if (hasClass(nodes[i], 'sdf-agent-control')) {
                continue;
            }
            var name = nodes[i].getAttribute('name') || '';
            if (name.indexOf('customfield_') === 0) {
                return name;
            }
        }
        return '';
    }

    function fieldGroups(form) {
        var nodes = form.querySelectorAll('.field-group');
        var out = [];
        var i;
        for (i = 0; i < nodes.length; i++) {
            out.push(nodes[i]);
        }
        return out;
    }

    function natives(group) {
        var nodes = group.querySelectorAll('textarea, input, select');
        var out = [];
        var i;
        for (i = 0; i < nodes.length; i++) {
            if (hasClass(nodes[i], 'sdf-agent-control')) {
                continue;
            }
            var type = (nodes[i].type || '').toLowerCase();
            if (type === 'hidden' || type === 'button' || type === 'submit') {
                continue;
            }
            out.push(nodes[i]);
        }
        return out;
    }

    function hideNative(node) {
        addClass(node, 'sdf-agent-native');
        var box = node.parentNode;
        if (box && box !== node && (hasClass(box, 'checkbox') || hasClass(box, 'radio'))) {
            addClass(box, 'sdf-agent-native');
        }
    }

    function optionText(node) {
        if (!node) {
            return '';
        }
        var id = node.id;
        if (id) {
            var label = document.querySelector('label[for="' + id + '"]');
            if (label) {
                return trim(label.textContent || label.innerText || '');
            }
        }
        return trim(node.value || '');
    }

    function buildWidget(item, nativeNodes) {
        var field = item.field;
        var widget = document.createElement('div');
        widget.className = 'sdf-agent';
        var type = field.type || 'text';
        var options = field.options || [];
        var i;
        if (type === 'checkbox' || type === 'radio') {
            for (i = 0; i < options.length; i++) {
                if (!trim(options[i])) {
                    continue;
                }
                var line = document.createElement('div');
                line.className = type;
                var input = document.createElement('input');
                input.className = type + ' sdf-agent-control';
                input.type = type;
                input.value = options[i];
                input.id = 'sdf-agent-' + item.block.id + '-' + field.id + '-' + i;
                input.setAttribute('form', 'sdf-unattached');
                if (type === 'radio') {
                    input.name = 'sdf-agent-' + item.block.id + '-' + field.id;
                }
                var caption = document.createElement('label');
                caption.setAttribute('for', input.id);
                caption.appendChild(document.createTextNode(options[i]));
                line.appendChild(input);
                line.appendChild(document.createTextNode(' '));
                line.appendChild(caption);
                widget.appendChild(line);
            }
        } else if (type === 'select' || type === 'multiselect') {
            var select = document.createElement('select');
            select.className = 'select sdf-agent-control';
            select.setAttribute('form', 'sdf-unattached');
            if (type === 'multiselect') {
                select.multiple = true;
                select.size = options.length > 6 ? 6 : Math.max(options.length, 2);
            } else {
                var empty = document.createElement('option');
                empty.value = '';
                var blank = field.blankLabel && trim(field.blankLabel) ? trim(field.blankLabel) : '';
                if (!blank && window.AJS && AJS.I18n) {
                    blank = AJS.I18n.getText('ru.saael.dynamicfields.portal.blank');
                }
                if (!blank || blank === 'ru.saael.dynamicfields.portal.blank') {
                    blank = '\u041d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u043e';
                }
                empty.appendChild(document.createTextNode(blank));
                select.appendChild(empty);
            }
            for (i = 0; i < options.length; i++) {
                if (!trim(options[i])) {
                    continue;
                }
                var option = document.createElement('option');
                option.value = options[i];
                option.appendChild(document.createTextNode(options[i]));
                select.appendChild(option);
            }
            widget.appendChild(select);
        } else if (type === 'textarea') {
            var area = document.createElement('textarea');
            area.className = 'textarea sdf-agent-control';
            area.rows = 3;
            area.setAttribute('form', 'sdf-unattached');
            widget.appendChild(area);
        } else {
            var text = document.createElement('input');
            text.type = type === 'number' || type === 'date' || type === 'time' || type === 'url' ? type : 'text';
            if (type === 'datetime') {
                text.type = 'datetime-local';
            }
            text.className = 'text long-field sdf-agent-control';
            text.setAttribute('form', 'sdf-unattached');
            widget.appendChild(text);
        }
        if (trim(field.help || '')) {
            var help = document.createElement('div');
            help.className = 'description sdf-agent-help';
            help.appendChild(document.createTextNode(trim(field.help)));
            widget.appendChild(help);
        }
        rememberNative(widget, field, nativeNodes);
        return widget;
    }

    function rememberNative(widget, field, nativeNodes) {
        var type = field.type || 'text';
        var current = [];
        var i;
        if (type === 'checkbox' || type === 'radio') {
            for (i = 0; i < nativeNodes.length; i++) {
                if (nativeNodes[i].checked) {
                    current.push(optionText(nativeNodes[i]) || nativeNodes[i].value);
                }
            }
        } else if (nativeNodes[0] && nativeNodes[0].value) {
            current = String(nativeNodes[0].value).split(',');
        }
        var controls = widget.querySelectorAll('.sdf-agent-control');
        for (i = 0; i < controls.length; i++) {
            var control = controls[i];
            if (control.tagName && control.tagName.toLowerCase() === 'select') {
                var n;
                for (n = 0; n < control.options.length; n++) {
                    var picked = false;
                    var c;
                    for (c = 0; c < current.length; c++) {
                        if (trim(current[c]) === control.options[n].value) {
                            picked = true;
                        }
                    }
                    control.options[n].selected = picked;
                }
            } else if (control.type === 'checkbox' || control.type === 'radio') {
                var on = false;
                var v;
                for (v = 0; v < current.length; v++) {
                    if (trim(current[v]) === control.value) {
                        on = true;
                    }
                }
                control.checked = on;
            } else {
                control.value = current.length ? trim(current.join(', ')) : '';
            }
        }
    }

    function widgetValues(group) {
        var widget = group.querySelector('.sdf-agent');
        var values = [];
        if (!widget) {
            return values;
        }
        var controls = widget.querySelectorAll('.sdf-agent-control');
        var i;
        for (i = 0; i < controls.length; i++) {
            var control = controls[i];
            if (control.tagName && control.tagName.toLowerCase() === 'select') {
                var n;
                for (n = 0; n < control.options.length; n++) {
                    if (control.options[n].selected && control.options[n].value) {
                        values.push(control.options[n].value);
                    }
                }
            } else if ((control.type === 'checkbox' || control.type === 'radio') && control.checked) {
                values.push(control.value);
            } else if (control.type !== 'checkbox' && control.type !== 'radio' && trim(control.value)) {
                values.push(trim(control.value));
            }
        }
        return values;
    }

    function writeNative(group, values) {
        var nodes = natives(group);
        if (!nodes.length) {
            return;
        }
        var checks = true;
        var i;
        for (i = 0; i < nodes.length; i++) {
            var type = (nodes[i].type || '').toLowerCase();
            if (type !== 'checkbox' && type !== 'radio') {
                checks = false;
            }
        }
        if (checks && nodes.length && (nodes[0].type === 'checkbox' || nodes[0].type === 'radio')) {
            for (i = 0; i < nodes.length; i++) {
                var label = optionText(nodes[i]);
                var on = false;
                var v;
                for (v = 0; v < values.length; v++) {
                    if (values[v] === label || values[v] === nodes[i].value) {
                        on = true;
                    }
                }
                nodes[i].checked = on;
            }
            return;
        }
        var text = [];
        for (i = 0; i < values.length; i++) {
            if (trim(values[i])) {
                text.push(trim(values[i]));
            }
        }
        nodes[0].value = text.join(', ');
    }

    function syncGroup(group) {
        writeNative(group, widgetValues(group));
    }

    function decorate(form, index) {
        var groups = fieldGroups(form);
        var i;
        for (i = 0; i < groups.length; i++) {
            var group = groups[i];
            var marker = markerText(group);
            var jiraId = jiraIdOf(group);
            var item = (jiraId && index.byJira[jiraId]) || (marker && index.byMarker[marker]) || null;
            if (!item) {
                continue;
            }
            group.setAttribute('data-sdf-question', item.field.id);
            group.setAttribute('data-sdf-block', item.block.id);
            group.setAttribute('data-sdf-type', item.field.type || 'text');
            if (group.querySelector('.sdf-agent')) {
                continue;
            }
            var nativeNodes = natives(group);
            var n;
            for (n = 0; n < nativeNodes.length; n++) {
                hideNative(nativeNodes[n]);
            }
            var widget = buildWidget(item, nativeNodes);
            group.appendChild(widget);
            widget.addEventListener('change', onWidget);
            widget.addEventListener('input', onWidget);
            syncGroup(group);
        }
        placeAmong(form, index.list);
        applyVisibility(form, index.list);
    }

    function onWidget(e) {
        var group = e.target;
        while (group && group !== document.body) {
            if (hasClass(group, 'field-group')) {
                break;
            }
            group = group.parentNode;
        }
        if (!group || !hasClass(group, 'field-group')) {
            return;
        }
        syncGroup(group);
        var form = group;
        while (form && form.tagName && form.tagName.toLowerCase() !== 'form') {
            form = form.parentNode;
        }
        if (form && configCache) {
            applyVisibility(form, questionsOf(configCache).list);
        }
    }

    function placeAmong(form, list) {
        var tail = {};
        var i;
        for (i = 0; i < list.length; i++) {
            var field = list[i].field;
            var group = form.querySelector('.field-group[data-sdf-question="' + field.id + '"]');
            if (!group) {
                continue;
            }
            if (!field.among || !field.among.fieldId) {
                removeClass(group, 'sdf-agent-among');
                tail[field.id] = group;
                continue;
            }
            var host = form.querySelector('.field-group[data-sdf-question="' + field.among.fieldId + '"]');
            var after = host && tail[field.among.fieldId] ? tail[field.among.fieldId] : host;
            if (after && after.parentNode) {
                if (after.nextSibling !== group) {
                    after.parentNode.insertBefore(group, after.nextSibling);
                }
                addClass(group, 'sdf-agent-among');
                tail[field.among.fieldId] = group;
            }
        }
    }

    function valuesOf(form, list) {
        var values = {};
        var i;
        for (i = 0; i < list.length; i++) {
            var group = form.querySelector('.field-group[data-sdf-question="' + list[i].field.id + '"]');
            values[list[i].field.id] = group ? widgetValues(group) : [];
        }
        var nodes = form.querySelectorAll('textarea, input, select');
        for (i = 0; i < nodes.length; i++) {
            if (hasClass(nodes[i], 'sdf-agent-control') || hasClass(nodes[i], 'sdf-agent-native')) {
                continue;
            }
            var name = nodes[i].getAttribute('name') || nodes[i].id || '';
            if (name.indexOf('customfield_') !== 0) {
                continue;
            }
            if (!values[name]) {
                values[name] = [];
            }
            var type = (nodes[i].type || '').toLowerCase();
            if ((type === 'checkbox' || type === 'radio') && !nodes[i].checked) {
                continue;
            }
            if (nodes[i].tagName && nodes[i].tagName.toLowerCase() === 'select') {
                var n;
                for (n = 0; n < nodes[i].options.length; n++) {
                    if (nodes[i].options[n].selected && nodes[i].options[n].value) {
                        values[name].push(nodes[i].options[n].text || nodes[i].options[n].value);
                    }
                }
            } else if (trim(nodes[i].value)) {
                values[name].push(trim(nodes[i].value));
            }
        }
        return values;
    }

    function conditionMatches(when, visible, values) {
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
                if (trim(current[i])) {
                    match = true;
                }
            }
        } else {
            for (a = 0; a < current.length; a++) {
                for (b = 0; b < expected.length; b++) {
                    if (trim(current[a]) && trim(current[a]) === trim(expected[b])) {
                        match = true;
                    }
                }
            }
        }
        return when.negate ? !match : match;
    }

    function shown(field, visible, values) {
        if (field.after && field.after.fieldId && trim(field.after.option || '')) {
            if (!visible[field.after.fieldId]) {
                return false;
            }
            var current = values[field.after.fieldId] || [];
            var hit = false;
            var i;
            for (i = 0; i < current.length; i++) {
                if (String(current[i]) === trim(field.after.option)) {
                    hit = true;
                }
            }
            if (!hit) {
                return false;
            }
        }
        var when = field.when;
        if (!when || !when.fieldId) {
            return true;
        }
        var also = when.also || [];
        if (when.join === 'or') {
            if (conditionMatches(when, visible, values)) {
                return true;
            }
            for (i = 0; i < also.length; i++) {
                if (also[i] && also[i].fieldId && conditionMatches(also[i], visible, values)) {
                    return true;
                }
            }
            return false;
        }
        if (!conditionMatches(when, visible, values)) {
            return false;
        }
        for (i = 0; i < also.length; i++) {
            if (also[i] && also[i].fieldId && !conditionMatches(also[i], visible, values)) {
                return false;
            }
        }
        return true;
    }

    function applyVisibility(form, list) {
        var values = valuesOf(form, list);
        var visible = {};
        var byBlock = {};
        var i;
        for (i = 0; i < list.length; i++) {
            var blockId = list[i].block.id;
            if (!byBlock[blockId]) {
                byBlock[blockId] = [];
            }
            byBlock[blockId].push(list[i].field);
        }
        var blockId;
        for (blockId in byBlock) {
            if (!byBlock.hasOwnProperty(blockId)) {
                continue;
            }
            var fields = byBlock[blockId];
            for (i = 0; i < fields.length; i++) {
                visible[fields[i].id] = shown(fields[i], visible, values);
            }
        }
        var groups = form.querySelectorAll('.field-group[data-sdf-question]');
        for (i = 0; i < groups.length; i++) {
            var id = groups[i].getAttribute('data-sdf-question');
            if (visible[id]) {
                removeClass(groups[i], 'sdf-agent-off');
            } else {
                addClass(groups[i], 'sdf-agent-off');
            }
        }
    }

    function run() {
        var forms = issueForms();
        if (!forms.length) {
            return;
        }
        load(function (config) {
            var index = questionsOf(config);
            var i;
            for (i = 0; i < forms.length; i++) {
                if (!document.body || !document.body.contains(forms[i])) {
                    continue;
                }
                decorate(forms[i], index);
            }
        });
    }

    function schedule() {
        if (scheduled) {
            return;
        }
        scheduled = true;
        setTimeout(function () {
            scheduled = false;
            run();
        }, 60);
    }

    function boot() {
        schedule();
        if (window.AJS && AJS.$) {
            AJS.$(document).bind('dialogContentReady', function () {
                configCache = null;
                schedule();
            });
        }
        if (window.MutationObserver && document.body) {
            var observer = new MutationObserver(function () {
                if (issueForms().length) {
                    schedule();
                }
            });
            observer.observe(document.body, {childList: true, subtree: true});
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
