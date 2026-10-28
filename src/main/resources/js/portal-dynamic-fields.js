/**
 * Customer-portal questions owned by this plugin.
 * ES5, no libraries. The questions are painted into the custom field Dynamic fields
 * when that field is on the request type, and answers are stored on the issue.
 */
(function () {
    'use strict';

    var PENDING_KEY = 'sdf-pending';
    var PENDING_MS = 120000;
    var config = null;
    var answersState = {};
    var scheduled = false;
    var lastHref = '';

    function trim(value) {
        return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function debug() {
        try {
            if (!window.console || !window.localStorage || localStorage.getItem('sdf.debug') !== 'true') {
                return;
            }
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[sdf]');
            console.log.apply(console, args);
        } catch (e) {
            // localStorage can throw
        }
    }

    function contextPath() {
        if (window.AJS && AJS.contextPath) {
            return AJS.contextPath();
        }
        return '';
    }

    function rest(path) {
        return contextPath() + '/rest/dynamic-fields/1.0' + path;
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
        if (!el) {
            return;
        }
        el.className = (' ' + el.className + ' ').replace(' ' + name + ' ', ' ').replace(/^\s+|\s+$/g, '');
    }

    function visibility(fields, values) {
        var visible = {};
        var list = fields || [];
        for (var i = 0; i < list.length; i++) {
            visible[list[i].id] = shown(list[i], visible, values || {});
        }
        return visible;
    }

    function flatText(value) {
        return String(value == null ? '' : value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
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

    function shown(field, visible, values) {
        var when = field.when;
        if (!when || !when.fieldId) {
            return true;
        }
        if (!conditionMatches(when, visible, values)) {
            return false;
        }
        var also = when.also || [];
        var i;
        for (i = 0; i < also.length; i++) {
            if (also[i] && also[i].fieldId && !conditionMatches(also[i], visible, values)) {
                return false;
            }
        }
        return true;
    }

    function ownedField(node, el) {
        var current = el;
        while (current) {
            if (current.getAttribute && current.getAttribute('data-sdf-field')) {
                return current === node;
            }
            current = current.parentNode;
        }
        return false;
    }

    function firstOwned(node, tag) {
        var list = node.getElementsByTagName(tag);
        var i;
        for (i = 0; i < list.length; i++) {
            if (ownedField(node, list[i])) {
                return list[i];
            }
        }
        return null;
    }

    function readField(node) {
        var type = node.getAttribute('data-sdf-type');
        var values = [];
        var i;
        if (type === 'checkbox' || type === 'radio') {
            var inputs = node.getElementsByTagName('input');
            for (i = 0; i < inputs.length; i++) {
                if (ownedField(node, inputs[i]) && inputs[i].checked) {
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

    function fieldNodes(root) {
        if (!root || !root.querySelectorAll) {
            return [];
        }
        var home = root.getAttribute && root.getAttribute('data-sdf-block');
        if (!home) {
            return root.querySelectorAll('[data-sdf-field]');
        }
        var scope = formOf(root) || root;
        var all = scope.querySelectorAll('[data-sdf-field]');
        var out = [];
        var i;
        for (i = 0; i < all.length; i++) {
            if (all[i].getAttribute('data-sdf-home') === home) {
                out.push(all[i]);
            }
        }
        return out;
    }

    function readValues(root, onlyVisible) {
        var result = {};
        if (!root || !root.querySelectorAll) {
            return result;
        }
        var nodes = fieldNodes(root);
        for (var i = 0; i < nodes.length; i++) {
            if (onlyVisible && hasClass(nodes[i], 'sdf-hidden')) {
                continue;
            }
            result[nodes[i].getAttribute('data-sdf-field')] = readField(nodes[i]);
        }
        return result;
    }

    function clearNode(node) {
        var inputs = node.getElementsByTagName('input');
        var i;
        for (i = 0; i < inputs.length; i++) {
            if (!ownedField(node, inputs[i])) {
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
            if (!ownedField(node, areas[i])) {
                continue;
            }
            areas[i].value = '';
        }
        var selects = node.getElementsByTagName('select');
        for (i = 0; i < selects.length; i++) {
            if (!ownedField(node, selects[i])) {
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
            paintPickerFromSelect(selects[i]);
        }
    }

    function applyVisibility(root, cfg) {
        if (!root || !cfg) {
            return;
        }
        var values = readValues(root, false);
        mergePortalAnswers(root, cfg, values);
        var visible = visibility(cfg.fields, values);
        var nodes = fieldNodes(root);
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var show = !!visible[node.getAttribute('data-sdf-field')];
            var was = node.getAttribute('data-sdf-shown') === '1';
            if (!show && was && cfg.clearOnHide !== false) {
                clearNode(node);
            }
            node.setAttribute('data-sdf-shown', show ? '1' : '0');
            if (show) {
                removeClass(node, 'sdf-hidden');
            } else {
                addClass(node, 'sdf-hidden');
                var openPicker = node.querySelector('.sdf-picker.is-open');
                if (openPicker) {
                    closePicker(openPicker);
                }
            }
        }
        placeBetween(root, cfg.fields);
    }

    function configField(id) {
        var blocks = blocksOf(config);
        var b;
        var f;
        for (b = 0; b < blocks.length; b++) {
            var fields = blocks[b] && blocks[b].fields ? blocks[b].fields : [];
            for (f = 0; f < fields.length; f++) {
                if (fields[f] && fields[f].id === id) {
                    return fields[f];
                }
            }
        }
        return null;
    }

    // Checkbox and radio rows join the host list. Any other question stays its own field there.
    function rowsInline(field, byId) {
        if (!field || !field.after || !field.after.fieldId) {
            return false;
        }
        if (field.type !== 'checkbox' && field.type !== 'radio') {
            return false;
        }
        var host = byId && byId[field.after.fieldId];
        if (!host) {
            host = configField(field.after.fieldId);
        }
        return !!(host && (host.type === 'checkbox' || host.type === 'radio'));
    }

    function parkAtEnd(section, field, hostField, flatten) {
        var node = nodeByHome(section, field.id);
        var host = nodeByHome(section, hostField.id);
        if (!node || !host || host === node || nodeContains(node, host)) {
            return false;
        }
        var choices = choicesOf(host);
        if (!choices || nodeContains(node, choices)) {
            return false;
        }
        if (choices.lastChild !== node) {
            choices.appendChild(node);
        }
        if (flatten) {
            addClass(node, 'sdf-rowfield');
        } else {
            removeClass(node, 'sdf-rowfield');
        }
        return true;
    }

    // A follow-up tied to one checkbox or radio answer sits under that answer,
    // including an answer of an existing Jira checkbox field.
    function placeBetween(section, fields) {
        if (!section || !fields || !fields.length) {
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
            var placed = fields[i] && fields[i].after;
            if (placed && placed.fieldId && !trim(placed.option) && byId[placed.fieldId]) {
                if (parkAtEnd(section, fields[i], byId[placed.fieldId], rowsInline(fields[i], byId))) {
                    continue;
                }
            }
            var anchor = followAnchor(fields[i], byId);
            if (!anchor) {
                continue;
            }
            var node = nodeByHome(section, fields[i].id);
            var host = anchorHost(section, anchor);
            if (!node || !host || host === node || nodeContains(node, host)) {
                continue;
            }
            var slot = anchorSlot(host, anchor.values);
            if (!slot || nodeContains(node, slot)) {
                continue;
            }
            if (node.parentNode !== slot) {
                slot.appendChild(node);
            }
            if (rowsInline(fields[i], byId)) {
                addClass(node, 'sdf-rowfield');
            } else {
                removeClass(node, 'sdf-rowfield');
            }
        }
        alignPortalSlots(section);
    }

    // A Jira radio or checkbox keeps its mark in a 20px padding. A follow-up
    // placed in that padding sits to the right of the question. Pull the slot
    // back to the question's own left edge.
    function alignPortalSlots(section) {
        if (!section || !section.querySelectorAll || !window.getComputedStyle) {
            return;
        }
        var slots = section.querySelectorAll('[data-sdf-portal-slot]');
        var i;
        for (i = 0; i < slots.length; i++) {
            alignPortalSlot(slots[i]);
        }
    }

    function alignPortalSlot(slot) {
        var host = portalFieldHost(slot);
        var edge = slotContentLeft(slot);
        if (!host || edge == null) {
            return;
        }
        var target = contentLeft(host);
        var delta = edge - target;
        if (Math.abs(delta) < 1) {
            return;
        }
        var current = parseFloat(window.getComputedStyle(slot).marginLeft) || 0;
        slot.style.marginLeft = String(Math.round(current - delta)) + 'px';
    }

    function portalFieldHost(slot) {
        var node = slot.parentNode;
        while (node && node !== document.body) {
            if (hasClass(node, 'field-group') && !hasClass(node, 'sdf-field')) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function contentLeft(node) {
        var box = node.getBoundingClientRect();
        var pad = parseFloat(window.getComputedStyle(node).paddingLeft) || 0;
        return box.left + pad;
    }

    function slotContentLeft(slot) {
        var nodes = slot.getElementsByTagName('div');
        var i;
        var field = null;
        for (i = 0; i < nodes.length; i++) {
            if (!hasClass(nodes[i], 'sdf-field') || nodes[i].getAttribute('data-sdf-shown') === '0') {
                continue;
            }
            field = nodes[i];
            break;
        }
        if (!field) {
            var slotBox = slot.getBoundingClientRect();
            if (slotBox.width < 1) {
                return null;
            }
            return contentLeft(slot);
        }
        var kids = field.children;
        for (i = 0; i < kids.length; i++) {
            if (hasClass(kids[i], 'field-label') || hasClass(kids[i], 'sdf-label')) {
                var labelBox = kids[i].getBoundingClientRect();
                if (labelBox.width > 1) {
                    return labelBox.left;
                }
            }
        }
        var fieldBox = field.getBoundingClientRect();
        if (fieldBox.width < 1) {
            return null;
        }
        return contentLeft(field);
    }

    function nodeContains(parent, child) {
        var current = child;
        while (current) {
            if (current === parent) {
                return true;
            }
            current = current.parentNode;
        }
        return false;
    }

    function nodeByHome(section, fieldId) {
        var scope = formOf(section) || section;
        if (!scope || !scope.querySelectorAll) {
            return null;
        }
        var home = section.getAttribute('data-sdf-block');
        var all = scope.querySelectorAll('[data-sdf-field]');
        var i;
        for (i = 0; i < all.length; i++) {
            if (all[i].getAttribute('data-sdf-field') !== fieldId) {
                continue;
            }
            var marked = all[i].getAttribute('data-sdf-home');
            if (home && marked && marked !== home) {
                continue;
            }
            return all[i];
        }
        return null;
    }

    function followAnchor(field, byId) {
        var placed = placedAfter(field, byId);
        if (placed) {
            return placed;
        }
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
                return {
                    portal: true,
                    fieldId: current.when.fieldId,
                    fieldName: current.when.fieldName || '',
                    values: current.when.values
                };
            }
            var parent = byId[current.when.fieldId];
            if (!parent) {
                return null;
            }
            if (parent.type === 'checkbox' || parent.type === 'radio') {
                if (current.when._mode === 'any' || !(current.when.values || []).length) {
                    return null;
                }
                return {portal: false, fieldId: parent.id, values: current.when.values};
            }
            current = parent;
        }
        return null;
    }

    function placedAfter(field, byId) {
        if (!field || !field.after || !field.after.fieldId || !trim(field.after.option)) {
            return null;
        }
        var host = byId[field.after.fieldId];
        if (!host || (host.type !== 'checkbox' && host.type !== 'radio')) {
            return null;
        }
        return {portal: false, fieldId: host.id, values: [trim(field.after.option)]};
    }

    function anchorHost(section, anchor) {
        var existing = nodeByHome(section, anchor.fieldId);
        if (existing && choicesOf(existing)) {
            return existing;
        }
        if (!anchor.portal) {
            return existing;
        }
        var form = formOf(section);
        if (!form) {
            return null;
        }
        return findPortalGroup(form, anchor.fieldId, anchor.fieldName);
    }

    function choicesOf(node) {
        if (!node || !node.getElementsByTagName) {
            return null;
        }
        var lists = node.getElementsByTagName('div');
        var i;
        for (i = 0; i < lists.length; i++) {
            if (!hasClass(lists[i], 'sdf-choices')) {
                continue;
            }
            if (ownerOf(lists[i]) === node) {
                return lists[i];
            }
        }
        return null;
    }

    function ownerOf(node) {
        var current = node;
        while (current) {
            if (current.getAttribute && current.getAttribute('data-sdf-field')) {
                return current;
            }
            current = current.parentNode;
        }
        return null;
    }

    function anchorSlot(host, values) {
        var choices = choicesOf(host);
        if (choices) {
            return ownSlot(choices, values);
        }
        return portalChoiceSlot(host, values);
    }

    function ownSlot(choices, values) {
        var rows = [];
        var i;
        for (i = 0; i < choices.children.length; i++) {
            if (hasClass(choices.children[i], 'sdf-under') || choices.children[i].getAttribute('data-sdf-field')) {
                continue;
            }
            rows.push(choices.children[i]);
        }
        var fallback = null;
        var picked = null;
        for (i = 0; i < rows.length; i++) {
            var input = rowChoiceInput(rows[i]);
            if (!input || !valueHit(input.value, values)) {
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
        return slotAfter(row, rowChoiceInput(row).value, false);
    }

    function valueHit(value, values) {
        var i;
        var flat = flatText(value);
        for (i = 0; i < (values || []).length; i++) {
            if (String(value) === String(values[i]) || (flat && flat === flatText(values[i]))) {
                return true;
            }
        }
        return false;
    }

    function rowChoiceInput(row) {
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

    function slotAfter(row, key, portal) {
        var next = row.nextSibling;
        while (next && next.nodeType !== 1) {
            next = next.nextSibling;
        }
        if (next && next.getAttribute && next.getAttribute('data-sdf-under') === key && (!portal || next.getAttribute('data-sdf-portal-slot') === '1')) {
            return next;
        }
        var slot = document.createElement('div');
        slot.className = 'sdf-under';
        slot.setAttribute('data-sdf-under', key);
        if (portal) {
            slot.setAttribute('data-sdf-portal-slot', '1');
        }
        if (row.nextSibling) {
            row.parentNode.insertBefore(slot, row.nextSibling);
        } else {
            row.parentNode.appendChild(slot);
        }
        return slot;
    }

    function portalChoiceSlot(group, values) {
        var rows = portalChoiceRows(group);
        var i;
        var fallback = null;
        var picked = null;
        var fallbackKey = '';
        var pickedKey = '';
        for (i = 0; i < rows.length; i++) {
            var input = rowChoiceInput(rows[i]);
            if (!input) {
                continue;
            }
            var key = matchedLabel(input, values);
            if (!key) {
                continue;
            }
            if (!fallback) {
                fallback = rows[i];
                fallbackKey = key;
            }
            if (input.checked) {
                picked = rows[i];
                pickedKey = key;
                break;
            }
        }
        if (!picked && !fallback) {
            return null;
        }
        return slotAfter(picked || fallback, picked ? pickedKey : fallbackKey, true);
    }

    function matchedLabel(input, values) {
        var labels = choiceLabels(input);
        var i;
        var j;
        for (j = 0; j < (values || []).length; j++) {
            var expected = flatText(values[j]);
            if (!expected) {
                continue;
            }
            for (i = 0; i < labels.length; i++) {
                if (labels[i] === expected) {
                    return expected;
                }
            }
        }
        return '';
    }

    function choiceLabels(input) {
        var out = [];
        function add(text) {
            var flat = flatText(text);
            var i;
            if (!flat) {
                return;
            }
            for (i = 0; i < out.length; i++) {
                if (out[i] === flat) {
                    return;
                }
            }
            out.push(flat);
        }
        add(input.value);
        var id = input.id;
        if (id && input.ownerDocument) {
            var labels = input.ownerDocument.getElementsByTagName('label');
            var n;
            for (n = 0; n < labels.length; n++) {
                if (labels[n].getAttribute('for') === id) {
                    add(labels[n].textContent);
                }
            }
        }
        var parent = input.parentNode;
        if (parent && parent.tagName && parent.tagName.toLowerCase() === 'label') {
            add(parent.textContent);
        }
        var sib = input.nextSibling;
        while (sib) {
            if (sib.nodeType === 1 && sib.tagName && sib.tagName.toLowerCase() === 'label') {
                add(sib.textContent);
                break;
            }
            sib = sib.nextSibling;
        }
        return out;
    }

    function portalChoiceRows(group) {
        var inputs = group.getElementsByTagName('input');
        var rows = [];
        var i;
        for (i = 0; i < inputs.length; i++) {
            var type = String(inputs[i].type || '').toLowerCase();
            if (type !== 'checkbox' && type !== 'radio') {
                continue;
            }
            if (insideOwn(inputs[i])) {
                continue;
            }
            var row = choiceRow(inputs[i], group);
            if (row && !nodeListed(rows, row)) {
                rows.push(row);
            }
        }
        return rows;
    }

    function nodeListed(list, node) {
        var i;
        for (i = 0; i < list.length; i++) {
            if (list[i] === node) {
                return true;
            }
        }
        return false;
    }

    function choiceRow(input, stop) {
        var node = input;
        while (node.parentNode && node.parentNode !== stop && node.parentNode !== document.body) {
            if (countChoices(node.parentNode) > 1) {
                return node;
            }
            node = node.parentNode;
        }
        return node;
    }

    function countChoices(root) {
        var inputs = root.getElementsByTagName('input');
        var n = 0;
        var i;
        for (i = 0; i < inputs.length; i++) {
            var type = String(inputs[i].type || '').toLowerCase();
            if ((type === 'checkbox' || type === 'radio') && !insideOwn(inputs[i])) {
                n++;
            }
        }
        return n;
    }

    var pickerEvents = false;

    function pickerSelect(picker) {
        return picker.getElementsByTagName('select')[0];
    }

    function paintPicker(picker) {
        var select = pickerSelect(picker);
        var label = picker.querySelector('.sdf-picker-value');
        if (!select || !label) {
            return;
        }
        var option = select.options[select.selectedIndex];
        label.textContent = option ? option.text : '';
    }

    function paintPickerFromSelect(select) {
        var picker = select ? select.parentNode : null;
        while (picker && picker !== document) {
            if (hasClass(picker, 'sdf-picker')) {
                paintPicker(picker);
                return;
            }
            picker = picker.parentNode;
        }
    }

    function fireChange(node) {
        var ev = document.createEvent('HTMLEvents');
        ev.initEvent('change', true, false);
        node.dispatchEvent(ev);
    }

    function placePickerMenu(picker) {
        var trigger = picker.querySelector('.sdf-picker-trigger');
        var menu = picker.querySelector('.sdf-picker-menu');
        if (!trigger || !menu) {
            return;
        }
        var rect = trigger.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom - 1) + 'px';
        menu.style.width = rect.width + 'px';
    }

    function repositionOpenPickers() {
        var open = document.querySelectorAll('.sdf-picker.is-open');
        var i;
        for (i = 0; i < open.length; i++) {
            placePickerMenu(open[i]);
        }
    }

    function revealOption(list, option) {
        if (!list || !option) {
            return;
        }
        if (option.offsetTop < list.scrollTop) {
            list.scrollTop = option.offsetTop;
        } else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
            list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
        }
    }

    function renderPickerOptions(picker) {
        var select = pickerSelect(picker);
        var queryNode = picker.querySelector('.sdf-picker-query');
        var list = picker.querySelector('.sdf-picker-list');
        var query = trim(queryNode ? queryNode.value : '').toLowerCase();
        var current = select ? select.value : '';
        var active = -1;
        var shown = 0;
        var i;
        while (list.firstChild) {
            list.removeChild(list.firstChild);
        }
        if (!select) {
            return;
        }
        for (i = 0; i < select.options.length; i++) {
            var text = select.options[i].text || '';
            if (query && text.toLowerCase().indexOf(query) === -1) {
                continue;
            }
            var item = document.createElement('li');
            item.className = 'sdf-picker-option';
            item.setAttribute('role', 'option');
            item.setAttribute('data-sdf-value', select.options[i].value);
            item.appendChild(document.createTextNode(text));
            if (!query && select.options[i].value === current && active < 0) {
                active = shown;
                addClass(item, 'is-active');
                item.setAttribute('aria-selected', 'true');
            } else {
                item.setAttribute('aria-selected', 'false');
            }
            list.appendChild(item);
            shown++;
        }
        if (!shown) {
            var empty = document.createElement('li');
            empty.className = 'sdf-picker-empty';
            empty.appendChild(document.createTextNode(AJS.I18n.getText('ru.saael.dynamicfields.portal.noMatches')));
            list.appendChild(empty);
            picker.setAttribute('data-sdf-active', '-1');
            return;
        }
        if (active < 0) {
            active = 0;
            addClass(list.children[0], 'is-active');
            list.children[0].setAttribute('aria-selected', 'true');
        }
        picker.setAttribute('data-sdf-active', String(active));
    }

    function closePicker(picker) {
        if (!picker) {
            return;
        }
        removeClass(picker, 'is-open');
        var trigger = picker.querySelector('.sdf-picker-trigger');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'false');
        }
    }

    function openPicker(picker) {
        var open = document.querySelectorAll('.sdf-picker.is-open');
        var i;
        for (i = 0; i < open.length; i++) {
            if (open[i] !== picker) {
                closePicker(open[i]);
            }
        }
        var query = picker.querySelector('.sdf-picker-query');
        if (query) {
            query.value = '';
        }
        renderPickerOptions(picker);
        addClass(picker, 'is-open');
        var trigger = picker.querySelector('.sdf-picker-trigger');
        if (trigger) {
            trigger.setAttribute('aria-expanded', 'true');
        }
        placePickerMenu(picker);
        var list = picker.querySelector('.sdf-picker-list');
        var active = picker.querySelector('.sdf-picker-option.is-active');
        revealOption(list, active);
        if (query) {
            query.focus();
        }
    }

    function choosePicker(picker, value) {
        var select = pickerSelect(picker);
        if (!select) {
            return;
        }
        select.value = value;
        paintPicker(picker);
        closePicker(picker);
        var trigger = picker.querySelector('.sdf-picker-trigger');
        if (trigger) {
            trigger.focus();
        }
        fireChange(select);
    }

    function movePicker(picker, delta) {
        var items = picker.querySelectorAll('.sdf-picker-option');
        if (!items.length) {
            return;
        }
        var index = parseInt(picker.getAttribute('data-sdf-active') || '0', 10);
        if (isNaN(index) || index < 0) {
            index = 0;
        }
        index += delta;
        if (index < 0) {
            index = items.length - 1;
        }
        if (index >= items.length) {
            index = 0;
        }
        var i;
        for (i = 0; i < items.length; i++) {
            removeClass(items[i], 'is-active');
            items[i].setAttribute('aria-selected', i === index ? 'true' : 'false');
        }
        addClass(items[index], 'is-active');
        picker.setAttribute('data-sdf-active', String(index));
        revealOption(picker.querySelector('.sdf-picker-list'), items[index]);
    }

    function optionFromEvent(list, target) {
        var node = target;
        while (node && node !== list) {
            if (hasClass(node, 'sdf-picker-option')) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function wirePickerEvents() {
        if (pickerEvents) {
            return;
        }
        pickerEvents = true;
        document.addEventListener('mousedown', function (e) {
            var open = document.querySelectorAll('.sdf-picker.is-open');
            var i;
            for (i = 0; i < open.length; i++) {
                if (!open[i].contains(e.target)) {
                    closePicker(open[i]);
                }
            }
        }, true);
        window.addEventListener('resize', repositionOpenPickers);
        document.addEventListener('scroll', function (e) {
            if (e.target && hasClass(e.target, 'sdf-picker-list')) {
                return;
            }
            repositionOpenPickers();
        }, true);
    }

    function mountSinglePicker(select) {
        var picker = document.createElement('div');
        picker.className = 'sdf-picker';
        select.parentNode.insertBefore(picker, select);
        picker.appendChild(select);
        addClass(select, 'sdf-native');
        select.tabIndex = -1;
        select.setAttribute('aria-hidden', 'true');

        var trigger = document.createElement('div');
        trigger.className = 'sdf-picker-trigger';
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('tabindex', '0');
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        var value = document.createElement('span');
        value.className = 'sdf-picker-value';
        var caret = document.createElement('span');
        caret.className = 'sdf-picker-caret';
        caret.setAttribute('aria-hidden', 'true');
        trigger.appendChild(value);
        trigger.appendChild(caret);
        picker.appendChild(trigger);

        var menu = document.createElement('div');
        menu.className = 'sdf-picker-menu';
        var search = document.createElement('div');
        search.className = 'sdf-picker-search';
        var query = document.createElement('input');
        query.type = 'text';
        query.className = 'sdf-picker-query';
        query.setAttribute('form', 'sdf-unattached');
        query.setAttribute('autocomplete', 'off');
        query.setAttribute('aria-label', AJS.I18n.getText('ru.saael.dynamicfields.portal.search'));
        search.appendChild(query);
        var list = document.createElement('ul');
        list.className = 'sdf-picker-list';
        list.setAttribute('role', 'listbox');
        menu.appendChild(search);
        menu.appendChild(list);
        picker.appendChild(menu);

        paintPicker(picker);
        wirePickerEvents();

        trigger.onmousedown = function (e) {
            e.preventDefault();
            if (hasClass(picker, 'is-open')) {
                closePicker(picker);
            } else {
                openPicker(picker);
            }
        };
        trigger.onkeydown = function (e) {
            var code = e.keyCode || e.which;
            if (code === 13 || code === 32 || code === 40) {
                e.preventDefault();
                if (!hasClass(picker, 'is-open')) {
                    openPicker(picker);
                }
            } else if (code === 27) {
                closePicker(picker);
            }
        };
        query.oninput = function () {
            renderPickerOptions(picker);
        };
        query.onkeydown = function (e) {
            var code = e.keyCode || e.which;
            if (code === 40) {
                e.preventDefault();
                movePicker(picker, 1);
            } else if (code === 38) {
                e.preventDefault();
                movePicker(picker, -1);
            } else if (code === 13) {
                e.preventDefault();
                var items = picker.querySelectorAll('.sdf-picker-option');
                var index = parseInt(picker.getAttribute('data-sdf-active') || '0', 10);
                if (items[index]) {
                    choosePicker(picker, items[index].getAttribute('data-sdf-value'));
                }
            } else if (code === 27) {
                e.preventDefault();
                closePicker(picker);
                trigger.focus();
            }
        };
        list.onmousedown = function (e) {
            var option = optionFromEvent(list, e.target);
            if (!option) {
                return;
            }
            e.preventDefault();
            choosePicker(picker, option.getAttribute('data-sdf-value'));
        };
        list.onmousemove = function (e) {
            var option = optionFromEvent(list, e.target);
            var items;
            var i;
            if (!option) {
                return;
            }
            items = picker.querySelectorAll('.sdf-picker-option');
            for (i = 0; i < items.length; i++) {
                removeClass(items[i], 'is-active');
                items[i].setAttribute('aria-selected', 'false');
                if (items[i] === option) {
                    addClass(option, 'is-active');
                    option.setAttribute('aria-selected', 'true');
                    picker.setAttribute('data-sdf-active', String(i));
                }
            }
        };
    }

    function buildField(field, blockId) {
        var wrap = document.createElement('div');
        wrap.className = 'field-group sdf-field';
        wrap.setAttribute('data-sdf-field', field.id);
        wrap.setAttribute('data-sdf-type', field.type || 'text');
        if (field.required) {
            wrap.setAttribute('data-sdf-required', '1');
        }
        if (trim(field.label) || field.required) {
            var label = document.createElement('label');
            label.className = 'field-label';
            label.appendChild(document.createTextNode(trim(field.label)));
            if (field.required) {
                var mark = document.createElement('span');
                mark.className = 'sdf-req';
                mark.appendChild(document.createTextNode(' *'));
                label.appendChild(mark);
            }
            wrap.appendChild(label);
        }
        var options = field.options || [];
        var i;
        if (field.type === 'checkbox' || field.type === 'radio') {
            var choices = document.createElement('div');
            choices.className = 'sdf-choices';
            for (i = 0; i < options.length; i++) {
                var line = document.createElement('div');
                line.className = field.type;
                var input = document.createElement('input');
                input.className = field.type;
                input.type = field.type;
                input.id = 'sdf-' + (blockId || 'main') + '-' + field.id + '-' + i;
                input.value = options[i];
                input.checked = listHas(field.defaults, options[i]);
                // Not a successful control of the Jira request form, so the portal does not submit it.
                input.setAttribute('form', 'sdf-unattached');
                if (field.type === 'radio') {
                    input.setAttribute('name', 'sdf-' + (blockId || 'main') + '-' + field.id);
                }
                var caption = document.createElement('label');
                caption.setAttribute('for', input.id);
                caption.appendChild(document.createTextNode(options[i]));
                line.appendChild(input);
                line.appendChild(caption);
                choices.appendChild(line);
            }
            wrap.appendChild(choices);
        } else if (field.type === 'select' || field.type === 'multiselect') {
            var select = document.createElement('select');
            select.className = 'select full-width-field';
            select.setAttribute('form', 'sdf-unattached');
            if (field.type === 'multiselect') {
                select.multiple = true;
                select.size = options.length > 6 ? 6 : Math.max(options.length, 2);
            } else if (!(field.hideBlank && listHasAny(field.defaults))) {
                var empty = document.createElement('option');
                empty.value = '';
                empty.appendChild(document.createTextNode(blankCaption(field)));
                select.appendChild(empty);
            }
            for (i = 0; i < options.length; i++) {
                var option = document.createElement('option');
                option.value = options[i];
                option.selected = listHas(field.defaults, options[i]);
                option.appendChild(document.createTextNode(options[i]));
                select.appendChild(option);
            }
            wrap.appendChild(select);
            if (field.type === 'select') {
                mountSinglePicker(select);
            }
        } else if (field.type === 'textarea') {
            var area = document.createElement('textarea');
            area.className = 'textarea full-width-field';
            area.setAttribute('rows', '3');
            area.setAttribute('form', 'sdf-unattached');
            area.value = (field.defaults && field.defaults.length) ? field.defaults[0] : '';
            wrap.appendChild(area);
        } else {
            var text = document.createElement('input');
            text.type = portalInputKind(field.type);
            text.className = 'text full-width-field';
            text.setAttribute('form', 'sdf-unattached');
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
        var help = document.createElement('div');
        help.className = 'description sdf-help';
        help.appendChild(document.createTextNode(text));
        wrap.appendChild(help);
    }

    function listHas(list, value) {
        var i;
        for (i = 0; i < (list || []).length; i++) {
            if (list[i] === value) {
                return true;
            }
        }
        return false;
    }

    function listHasAny(list) {
        var i;
        for (i = 0; i < (list || []).length; i++) {
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

    function portalInputKind(type) {
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

    function buildSection(cfg) {
        var section = document.createElement('div');
        section.className = 'sdf-block sdf-portal-block';
        section.setAttribute('data-sdf-block', cfg.id || 'block');
        if (cfg.title && trim(cfg.title)) {
            var title = document.createElement('h3');
            title.className = 'sdf-title';
            title.appendChild(document.createTextNode(trim(cfg.title)));
            section.appendChild(title);
        }
        var visible = visibility(cfg.fields, {});
        for (var i = 0; i < cfg.fields.length; i++) {
            var node = buildField(cfg.fields[i], cfg.id);
            node.setAttribute('data-sdf-home', cfg.id || 'block');
            var show = !!visible[cfg.fields[i].id];
            node.setAttribute('data-sdf-shown', show ? '1' : '0');
            if (!show) {
                addClass(node, 'sdf-hidden');
            }
            section.appendChild(node);
        }
        return section;
    }

    function blocksOf(cfg) {
        if (!cfg) {
            return [];
        }
        if (cfg.blocks && cfg.blocks.length) {
            return cfg.blocks;
        }
        if (cfg.fields && cfg.fields.length) {
            return [{
                id: 'main',
                title: cfg.title || '',
                clearOnHide: cfg.clearOnHide !== false,
                requestTypeIds: cfg.requestTypeIds || [],
                place: cfg.place || 'end',
                placeAfter: cfg.placeAfter || '',
                anchorFieldId: cfg.anchorFieldId || '',
                anchorValues: cfg.anchorValues || [],
                fields: cfg.fields
            }];
        }
        return [];
    }

    function visibleBlocks() {
        var all = blocksOf(config);
        var out = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].fields && all[i].fields.length && requestTypeMatches(all[i])) {
                out.push(all[i]);
            }
        }
        return out;
    }

    function findBlock(id) {
        var all = blocksOf(config);
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === id) {
                return all[i];
            }
        }
        return null;
    }

    function repaint(root) {
        if (!root || !root.querySelectorAll) {
            return;
        }
        var sections = root.querySelectorAll('[data-sdf-block]');
        for (var i = 0; i < sections.length; i++) {
            var block = findBlock(sections[i].getAttribute('data-sdf-block'));
            if (block) {
                applyVisibility(sections[i], block);
            }
        }
    }

    function isCreatePage() {
        return /\/portal\/\d+\/create\/\d+/.test(location.pathname);
    }

    function requestTypeMatches(cfg) {
        return !!(cfg && cfg.fields && cfg.fields.length);
    }

    function issueKeyFromPath() {
        var match = location.pathname.match(/\/([A-Z][A-Z0-9]+-\d+)\/?$/);
        return match ? match[1] : null;
    }

    function normalizeLabel(value) {
        var text = trim(value).toLowerCase();
        text = text.replace(/\s*\*\s*$/, '');
        text = text.replace(/\s*\([^)]*\)\s*$/, '');
        return trim(text);
    }

    function fieldGroups(formEl) {
        var out = [];
        var nodes = formEl.children;
        var i;
        for (i = 0; i < nodes.length; i++) {
            if (hasClass(nodes[i], 'field-group')) {
                out.push(nodes[i]);
            }
        }
        return out;
    }

    function buttonsOf(formEl) {
        var nodes = formEl.children;
        var i;
        for (i = 0; i < nodes.length; i++) {
            if (hasClass(nodes[i], 'buttons-container')) {
                return nodes[i];
            }
        }
        return null;
    }

    function nextReal(node) {
        var n = node.nextSibling;
        while (n && n.nodeType === 1 && hasClass(n, 'sdf-portal-block')) {
            n = n.nextSibling;
        }
        return n;
    }

    function anchorFor(formEl, block) {
        var place = block.place || 'end';
        var groups = fieldGroups(formEl);
        if (place === 'start') {
            return groups.length ? groups[0] : buttonsOf(formEl);
        }
        if (place === 'after') {
            var group = anchorGroup(formEl, block);
            if (group) {
                return nextReal(group);
            }
        }
        return buttonsOf(formEl);
    }

    function alreadyPlaced(formEl, nodes, anchor) {
        var n = anchor ? anchor.previousSibling : formEl.lastChild;
        var i;
        for (i = nodes.length - 1; i >= 0; i--) {
            if (n !== nodes[i]) {
                return false;
            }
            n = n.previousSibling;
        }
        return true;
    }

    function wireForm(formEl) {
        if (formEl.getAttribute('data-sdf-wired') === '1') {
            return;
        }
        formEl.setAttribute('data-sdf-wired', '1');
        function onEvent(e) {
            applyAnchors(formEl);
            var node = e.target;
            while (node && node !== formEl) {
                if (node.getAttribute && node.getAttribute('data-sdf-block')) {
                    var block = findBlock(node.getAttribute('data-sdf-block'));
                    if (block) {
                        applyVisibility(node, block);
                    }
                    return;
                }
                node = node.parentNode;
            }
            var sections = formEl.querySelectorAll('[data-sdf-block]');
            var i;
            for (i = 0; i < sections.length; i++) {
                var outside = findBlock(sections[i].getAttribute('data-sdf-block'));
                if (outside) {
                    applyVisibility(sections[i], outside);
                }
            }
        }
        formEl.addEventListener('change', onEvent);
        formEl.addEventListener('input', onEvent);
    }

    function findHost() {
        var host = document.querySelector('.sdf-cf-form');
        if (host) {
            return host;
        }
        var id = config && config.portalFieldId;
        if (!id || !/^customfield_\d+$/.test(id)) {
            return null;
        }
        var named = document.querySelector('[name="' + id + '"]');
        if (!named) {
            return null;
        }
        addClass(named, 'sdf-cf-value');
        named.style.display = 'none';
        var group = named.parentNode;
        var slot = document.createElement('div');
        slot.className = 'sdf-cf-form';
        if (named.nextSibling) {
            group.insertBefore(slot, named.nextSibling);
        } else {
            group.appendChild(slot);
        }
        return slot;
    }

    function hideFieldChrome(host) {
        var areas = document.querySelectorAll('.sdf-cf-value');
        var i;
        for (i = 0; i < areas.length; i++) {
            areas[i].style.display = 'none';
        }
        var group = host;
        while (group && group !== document.body && !hasClass(group, 'field-group')) {
            group = group.parentNode;
        }
        if (!group || group === document.body) {
            return;
        }
        var children = group.children;
        for (i = 0; i < children.length; i++) {
            var child = children[i];
            if (child.tagName && child.tagName.toLowerCase() === 'label') {
                child.style.display = 'none';
            }
        }
    }

    function removeOutside(host) {
        var nodes = document.querySelectorAll('.sdf-portal-block');
        var i;
        for (i = nodes.length - 1; i >= 0; i--) {
            if (host.contains && host.contains(nodes[i])) {
                continue;
            }
            if (nodes[i].parentNode) {
                nodes[i].parentNode.removeChild(nodes[i]);
            }
        }
    }

    function renderInsideField(host, blocks) {
        hideFieldChrome(host);
        var keep = {};
        var i;
        for (i = 0; i < blocks.length; i++) {
            keep[blocks[i].id] = true;
        }
        var stale = host.querySelectorAll('.sdf-portal-block');
        for (i = stale.length - 1; i >= 0; i--) {
            if (!keep[stale[i].getAttribute('data-sdf-block')] && stale[i].parentNode) {
                stale[i].parentNode.removeChild(stale[i]);
            }
        }
        var formEl = formOf(host);
        if (formEl) {
            wireForm(formEl);
        }
        for (i = 0; i < blocks.length; i++) {
            var block = blocks[i];
            var node = host.querySelector('[data-sdf-block="' + block.id + '"]');
            var scope = formEl || document;
            if (node && blockHasGap(scope, block)) {
                dropHome(scope, block.id);
                node = null;
            }
            if (!node) {
                node = buildSection(block);
                host.appendChild(node);
            }
            applyVisibility(node, block);
            removeClass(node, 'sdf-hidden');
        }
    }

    function blockHasGap(scope, block) {
        var i;
        for (i = 0; i < block.fields.length; i++) {
            if (!block.fields[i] || !block.fields[i].id) {
                continue;
            }
            if (!findHome(scope, block.id, block.fields[i].id)) {
                return true;
            }
        }
        return false;
    }

    function findHome(scope, blockId, fieldId) {
        if (!scope || !scope.querySelectorAll) {
            return null;
        }
        var all = scope.querySelectorAll('[data-sdf-field]');
        var i;
        for (i = 0; i < all.length; i++) {
            if (all[i].getAttribute('data-sdf-field') === fieldId && all[i].getAttribute('data-sdf-home') === blockId) {
                return all[i];
            }
        }
        return null;
    }

    function dropHome(scope, blockId) {
        if (!scope || !scope.querySelectorAll) {
            return;
        }
        var all = scope.querySelectorAll('[data-sdf-home], [data-sdf-block]');
        var i;
        for (i = all.length - 1; i >= 0; i--) {
            var item = all[i];
            if (item.getAttribute('data-sdf-home') === blockId || item.getAttribute('data-sdf-block') === blockId) {
                if (item.parentNode) {
                    item.parentNode.removeChild(item);
                }
            }
        }
    }

    function joinAnswer(values) {
        var out = [];
        var i;
        for (i = 0; i < (values || []).length; i++) {
            if (trim(values[i])) {
                out.push(trim(values[i]));
            }
        }
        return out.join(', ');
    }

    function answerSummary(root) {
        var lines = [];
        var scope = root && root.querySelectorAll ? root : document;
        var sections = scope.querySelectorAll('.sdf-portal-block');
        var s;
        for (s = 0; s < sections.length; s++) {
            if (hasClass(sections[s], 'sdf-hidden')) {
                continue;
            }
            var id = sections[s].getAttribute('data-sdf-block');
            var block = findBlock(id);
            if (block) {
                applyVisibility(sections[s], block);
            }
            var values = readValues(sections[s], true);
            var fields = (block && block.fields) || [];
            var i;
            for (i = 0; i < fields.length; i++) {
                var text = joinAnswer(values[fields[i].id]);
                if (!text) {
                    continue;
                }
                var label = trim(fields[i].label);
                lines.push(label ? (label + ': ' + text) : text);
            }
        }
        return lines.join('\n');
    }

    function syncFieldValue() {
        var hosts = document.querySelectorAll('.sdf-cf-form');
        var i;
        for (i = 0; i < hosts.length; i++) {
            var area = hosts[i].parentNode ? hosts[i].parentNode.querySelector('.sdf-cf-value') : null;
            if (area && typeof area.value === 'string') {
                // The portal field is a 255-character Jira text field. The full
                // answers are stored on the issue after the request is created.
                area.value = '.';
            }
        }
    }

    function blocksFor(owner) {
        var all = visibleBlocks();
        var out = [];
        var i;
        for (i = 0; i < all.length; i++) {
            if (owner && all[i].customFieldId === owner) {
                out.push(all[i]);
            }
        }
        return out;
    }

    function collectHosts() {
        var blocks = blocksOf(config);
        var i;
        for (i = 0; i < blocks.length; i++) {
            var owner = blocks[i].customFieldId;
            if (!owner || !/^customfield_\d+$/.test(owner)) {
                continue;
            }
            if (document.querySelector('.sdf-cf-form[data-sdf-owner="' + owner + '"]')) {
                continue;
            }
            var named = document.querySelector('[name="' + owner + '"]');
            if (!named) {
                continue;
            }
            addClass(named, 'sdf-cf-value');
            named.style.display = 'none';
            var slot = document.createElement('div');
            slot.className = 'sdf-cf-form';
            slot.setAttribute('data-sdf-owner', owner);
            if (named.nextSibling) {
                named.parentNode.insertBefore(slot, named.nextSibling);
            } else {
                named.parentNode.appendChild(slot);
            }
        }
        return document.querySelectorAll('.sdf-cf-form');
    }

    function removeLoose() {
        var nodes = document.querySelectorAll('.sdf-portal-block');
        var i;
        for (i = nodes.length - 1; i >= 0; i--) {
            var parent = nodes[i].parentNode;
            var inside = false;
            while (parent) {
                if (hasClass(parent, 'sdf-cf-form')) {
                    inside = true;
                    break;
                }
                parent = parent.parentNode;
            }
            if (!inside && nodes[i].parentNode) {
                nodes[i].parentNode.removeChild(nodes[i]);
            }
        }
    }

    function ensureForm() {
        if (!isCreatePage()) {
            return;
        }
        var hosts = collectHosts();
        var i;
        for (i = 0; i < hosts.length; i++) {
            renderInsideField(hosts[i], blocksFor(hosts[i].getAttribute('data-sdf-owner')));
        }
        removeLoose();
    }

        function fieldGroupOf(node, formEl) {
            var current = node;
            while (current && current !== formEl) {
                if (hasClass(current, 'field-group')) {
                    return current;
                }
                current = current.parentNode;
            }
            return null;
        }

        function anchorGroup(formEl, block) {
            var fieldId = block && block.anchorFieldId;
            var i;
            if (fieldId && /^[A-Za-z0-9_]+$/.test(fieldId)) {
                var named = formEl.querySelectorAll('[name="' + fieldId + '"]');
                for (i = 0; i < named.length; i++) {
                    var group = fieldGroupOf(named[i], formEl);
                    if (group) {
                        return group;
                    }
                }
            }
            var wanted = normalizeLabel(block && block.placeAfter);
            var groups = fieldGroups(formEl);
            for (i = 0; i < groups.length; i++) {
                var label = groups[i].querySelector('label');
                if (wanted && label && normalizeLabel(label.textContent) === wanted) {
                    return groups[i];
                }
            }
            return null;
        }

        function insideOwn(node) {
            var current = node;
            while (current) {
                if (current.getAttribute && (current.getAttribute('data-sdf-field') || current.getAttribute('data-sdf-block'))) {
                    return true;
                }
                current = current.parentNode;
            }
            return false;
        }

        function isOwnGroup(group) {
            if (!group) {
                return false;
            }
            if (group.getAttribute && (group.getAttribute('data-sdf-field') || group.getAttribute('data-sdf-block'))) {
                return true;
            }
            if (hasClass(group, 'sdf-field') || hasClass(group, 'sdf-portal-block') || hasClass(group, 'sdf-cf-form')) {
                return true;
            }
            return !!(group.querySelector && group.querySelector('.sdf-cf-form, .sdf-portal-block'));
        }

        function findPortalGroup(scope, fieldId, fieldName) {
            var i;
            if (fieldId && /^[A-Za-z0-9_]+$/.test(fieldId) && scope.querySelectorAll) {
                var named = scope.querySelectorAll('[name="' + fieldId + '"], [data-field-id="' + fieldId + '"]');
                for (i = 0; i < named.length; i++) {
                    if (insideOwn(named[i])) {
                        continue;
                    }
                    var group = fieldGroupOf(named[i], scope);
                    if (group && !isOwnGroup(group)) {
                        return group;
                    }
                }
            }
            var wanted = normalizeLabel(fieldName);
            if (!wanted || !scope.querySelectorAll) {
                return null;
            }
            var groups = scope.querySelectorAll('.field-group');
            for (i = 0; i < groups.length; i++) {
                if (isOwnGroup(groups[i])) {
                    continue;
                }
                var label = groups[i].querySelector('label');
                if (label && normalizeLabel(label.textContent) === wanted) {
                    return groups[i];
                }
            }
            return null;
        }

        function pushTexts(out, nodes) {
            var i;
            for (i = 0; i < nodes.length; i++) {
                var text = nodes[i].textContent;
                if (trim(text)) {
                    out.push(text);
                }
            }
        }

        function readControl(node, out) {
            if (!node || !node.tagName) {
                return;
            }
            var type = String(node.type || '').toLowerCase();
            if (type === 'submit' || type === 'button') {
                return;
            }
            if (type === 'hidden') {
                if (node.value) {
                    out.push(node.value);
                }
                return;
            }
            if (type === 'checkbox' || type === 'radio') {
                if (!node.checked) {
                    return;
                }
                if (node.value) {
                    out.push(node.value);
                }
                if (node.parentNode && node.parentNode.textContent) {
                    out.push(node.parentNode.textContent);
                }
                return;
            }
            if (node.tagName === 'SELECT') {
                var option = node.options[node.selectedIndex];
                if (!option) {
                    return;
                }
                if (option.value) {
                    out.push(option.value);
                }
                if (option.text) {
                    out.push(option.text);
                }
                return;
            }
            if (node.value) {
                out.push(node.value);
            }
        }

        function readPortalField(scope, fieldId, fieldName) {
            var out = [];
            if (!scope || !scope.querySelectorAll) {
                return out;
            }
            var group = findPortalGroup(scope, fieldId, fieldName);
            var current = readGroupValues(group);
            var i;
            for (i = 0; i < current.length; i++) {
                out.push(current[i]);
            }
            if (group) {
                pushTexts(out, group.querySelectorAll('.react-select__single-value, .react-select__multi-value__label'));
            } else if (fieldId && /^[A-Za-z0-9_]+$/.test(fieldId)) {
                var named = scope.querySelectorAll('[name="' + fieldId + '"]');
                for (i = 0; i < named.length; i++) {
                    if (!insideOwn(named[i])) {
                        readControl(named[i], out);
                    }
                }
            }
            if (fieldId && /^[A-Za-z0-9_]+$/.test(fieldId)) {
                var hidden = scope.querySelectorAll('input[type="hidden"][name="' + fieldId + '"]');
                for (i = 0; i < hidden.length; i++) {
                    if (insideOwn(hidden[i])) {
                        continue;
                    }
                    if (hidden[i].value) {
                        out.push(hidden[i].value);
                    }
                }
            }
            return out;
        }

        function mergePortalAnswers(root, cfg, values) {
            var fields = (cfg && cfg.fields) || [];
            var scope = formOf(root) || document;
            var i;
            for (i = 0; i < fields.length; i++) {
                var pending = portalConditions(fields[i].when);
                var n;
                for (n = 0; n < pending.length; n++) {
                    var when = pending[n];
                    if (values[when.fieldId] && values[when.fieldId].length) {
                        continue;
                    }
                    var read = readPortalField(scope, when.fieldId, when.fieldName);
                    if (read.length) {
                        values[when.fieldId] = read;
                    }
                }
            }
        }

        function portalConditions(when) {
            var out = [];
            if (!when) {
                return out;
            }
            if (when.source === 'portal' && when.fieldId) {
                out.push(when);
            }
            var also = when.also || [];
            var i;
            for (i = 0; i < also.length; i++) {
                if (also[i] && also[i].source === 'portal' && also[i].fieldId) {
                    out.push(also[i]);
                }
            }
            return out;
        }

        function readGroupValues(group) {
            var out = [];
            if (!group) {
                return out;
            }
            var nodes = group.querySelectorAll('input, select, textarea');
            var i;
            for (i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                if (insideOwn(node)) {
                    continue;
                }
                if (node.type === 'hidden' || node.type === 'submit' || node.type === 'button') {
                    continue;
                }
                if (node.type === 'checkbox' || node.type === 'radio') {
                    if (!node.checked) {
                        continue;
                    }
                    if (node.value) {
                        out.push(node.value);
                    }
                    if (node.parentNode && node.parentNode.textContent) {
                        out.push(node.parentNode.textContent);
                    }
                } else if (node.tagName === 'SELECT') {
                    var option = node.options[node.selectedIndex];
                    if (option) {
                        if (option.value) {
                            out.push(option.value);
                        }
                        if (option.text) {
                            out.push(option.text);
                        }
                    }
                } else if (node.value) {
                    out.push(node.value);
                }
            }
            return out;
        }

        function anchorMatches(formEl, block) {
            var wanted = (block && block.anchorValues) || [];
            if (!wanted.length || !block || block.place !== 'after') {
                return true;
            }
            var group = anchorGroup(formEl, block);
            if (!group) {
                return true;
            }
            var current = readGroupValues(group);
            var i;
            var j;
            for (i = 0; i < wanted.length; i++) {
                for (j = 0; j < current.length; j++) {
                    if (normalizeLabel(wanted[i]) === normalizeLabel(current[j])) {
                        return true;
                    }
                }
            }
            return false;
        }

        function applyAnchors(formEl) {
            if (!formEl) {
                return;
            }
            var sections = formEl.querySelectorAll('.sdf-portal-block');
            var i;
            for (i = 0; i < sections.length; i++) {
                var parent = sections[i].parentNode;
                var inside = false;
                while (parent) {
                    if (hasClass(parent, 'sdf-cf-form')) {
                        inside = true;
                        break;
                    }
                    parent = parent.parentNode;
                }
                if (inside) {
                    removeClass(sections[i], 'sdf-hidden');
                    continue;
                }
                var block = findBlock(sections[i].getAttribute('data-sdf-block'));
                if (block && anchorMatches(formEl, block)) {
                    removeClass(sections[i], 'sdf-hidden');
                } else if (block) {
                    addClass(sections[i], 'sdf-hidden');
                }
            }
        }

    function removeForm() {
        var nodes = document.querySelectorAll('.sdf-portal-block');
        var i;
        for (i = nodes.length - 1; i >= 0; i--) {
            if (nodes[i].parentNode) {
                nodes[i].parentNode.removeChild(nodes[i]);
            }
        }
    }

    function ourFieldIds() {
        var ids = {};
        var blocks = blocksOf(config);
        var i;
        for (i = 0; i < blocks.length; i++) {
            if (blocks[i].customFieldId) {
                ids[blocks[i].customFieldId] = blocks[i];
            }
        }
        return ids;
    }

    function detailSignature(groups) {
        var parts = [];
        var i;
        var j;
        for (i = 0; i < groups.length; i++) {
            parts.push(groups[i].owner);
            for (j = 0; j < groups[i].rows.length; j++) {
                parts.push(groups[i].rows[j].label || '');
                parts.push(groups[i].rows[j].value || '');
            }
        }
        return parts.join('\n');
    }

    function questionFieldIds() {
        var ids = [];
        var seen = {};
        var blocks = blocksOf(config);
        var b;
        var f;
        var id;
        for (b = 0; b < blocks.length; b++) {
            var fields = blocks[b] && blocks[b].fields ? blocks[b].fields : [];
            for (f = 0; f < fields.length; f++) {
                id = fields[f] && fields[f].jiraFieldId;
                if (!id || !/^customfield_\d+$/.test(id) || seen[id]) {
                    continue;
                }
                seen[id] = true;
                ids.push(id);
            }
        }
        return ids;
    }

    function hideBox(node) {
        var box = node;
        while (box && box !== document.body && !hasClass(box, 'request-fields') && !hasClass(box, 'activity-item')) {
            if (box.tagName === 'DL' || hasClass(box, 'cv-request-field') || hasClass(box, 'field-group')) {
                box.style.display = 'none';
                box.setAttribute('data-sdf-native-hidden', '1');
                return;
            }
            box = box.parentNode;
        }
        if (node && node.style) {
            node.style.display = 'none';
            node.setAttribute('data-sdf-native-hidden', '1');
        }
    }

    function fieldCaption(node) {
        var caption = node.querySelector('dt, .cv-request-field-label, label');
        return caption ? trim(caption.textContent) : '';
    }

    function hideNativeQuestionFields(rows) {
        var ids = questionFieldIds();
        var i;
        var n;
        var nodes;
        var wanted = {};
        for (i = 0; i < ids.length; i++) {
            nodes = document.querySelectorAll('[data-test-id="' + ids[i] + '"], [name="' + ids[i] + '"]');
            for (n = 0; n < nodes.length; n++) {
                hideBox(nodes[n]);
            }
        }
        rows = rows || [];
        for (i = 0; i < rows.length; i++) {
            var label = rows[i] && normalizeLabel(rows[i].label);
            if (label) {
                wanted[label] = true;
            }
        }
        nodes = document.querySelectorAll('dl, .cv-request-field, .field-group');
        for (i = 0; i < nodes.length; i++) {
            if (hasClass(nodes[i], 'sdf-detail-row') || nodes[i].getAttribute('data-test-id') === 'description') {
                continue;
            }
            var caption = normalizeLabel(fieldCaption(nodes[i]));
            if (caption && wanted[caption]) {
                hideBox(nodes[i]);
            }
        }
        collapseAdditional();
    }

    function collapseAdditional() {
        var headings = document.querySelectorAll('h1, h2, h3, h4');
        var i;
        var section;
        var fields;
        var visible;
        var n;
        var text;
        for (i = 0; i < headings.length; i++) {
            text = trim(headings[i].textContent);
            if (text !== 'Дополнительно' && text !== 'Additional information') {
                continue;
            }
            section = headings[i].parentNode;
            if (!section || section === document.body || section.id === 'content') {
                continue;
            }
            if (section.querySelector && section.querySelector('.activity-item, .request-fields')) {
                continue;
            }
            fields = section.querySelectorAll('dl, .field-group, .cv-request-field');
            visible = false;
            for (n = 0; n < fields.length; n++) {
                if (fields[n].getAttribute('data-sdf-native-hidden') === '1' || fields[n].style.display === 'none') {
                    continue;
                }
                visible = true;
                break;
            }
            if (!visible) {
                section.style.display = 'none';
            }
        }
    }

    function detailRows(rows) {
        var ordered = [];
        var used = {};
        var blocks = blocksOf(config);
        var b;
        var f;
        var i;
        var field;
        for (b = 0; b < blocks.length; b++) {
            var fields = blocks[b] && blocks[b].fields ? blocks[b].fields : [];
            for (f = 0; f < fields.length; f++) {
                field = fields[f];
                if (!field || !field.id) {
                    continue;
                }
                for (i = 0; i < rows.length; i++) {
                    if (used[i] || !rows[i] || rows[i].fieldId !== field.id) {
                        continue;
                    }
                    if (rows[i].owner && blocks[b].customFieldId && rows[i].owner !== blocks[b].customFieldId) {
                        continue;
                    }
                    used[i] = true;
                    ordered.push(rows[i]);
                }
            }
        }
        for (i = 0; i < rows.length; i++) {
            if (!used[i] && rows[i]) {
                ordered.push(rows[i]);
            }
        }
        return ordered;
    }

    function isChoiceType(type) {
        return type === 'checkbox' || type === 'radio' || type === 'multiselect';
    }

    function choiceLines(row) {
        var lines = [];
        var items = row && row.items ? row.items : [];
        var i;
        if (row && isChoiceType(row.type)) {
            for (i = 0; i < items.length; i++) {
                if (trim(items[i])) {
                    lines.push(trim(items[i]));
                }
            }
            if (!lines.length && trim(row.value)) {
                lines.push(trim(row.value));
            }
        }
        return lines;
    }

    function insertLines(prev, option, lines) {
        var at = prev.lines.length;
        var i;
        if (option) {
            for (i = 0; i < prev.lines.length; i++) {
                if (prev.lines[i] === option) {
                    at = i + 1;
                }
            }
        }
        for (i = lines.length - 1; i >= 0; i--) {
            prev.lines.splice(at, 0, lines[i]);
        }
        prev.value = prev.lines.join('\n');
    }

    // Rows placed inside another field stay in that list. A separate field keeps its own row.
    function presentRows(rows) {
        var ordered = detailRows(rows);
        var out = [];
        var i;
        var j;
        for (i = 0; i < ordered.length; i++) {
            var row = ordered[i];
            if (!row) {
                continue;
            }
            var lines = choiceLines(row);
            var field = configField(row.fieldId);
            if (rowsInline(field, null) && lines.length) {
                var hostId = field.after.fieldId;
                var prev = null;
                var p;
                for (p = 0; p < out.length; p++) {
                    if (out[p].fieldId === hostId) {
                        prev = out[p];
                    }
                }
                if (!prev) {
                    var host = configField(hostId);
                    prev = {
                        owner: row.owner || '',
                        fieldId: hostId,
                        label: host && host.label ? host.label : '',
                        type: host && host.type ? host.type : 'checkbox',
                        lines: [],
                        value: ''
                    };
                    out.push(prev);
                }
                if (!prev.lines) {
                    prev.lines = [];
                }
                insertLines(prev, trim(field.after.option), lines);
                continue;
            }
            var shown = [];
            for (j = 0; j < lines.length; j++) {
                shown.push(lines[j]);
            }
            out.push({
                owner: row.owner || '',
                fieldId: row.fieldId,
                label: row.label,
                type: row.type,
                lines: shown,
                value: row.value || ''
            });
        }
        return out;
    }

    function buildDetailRow(owner, row, sample) {
        var dl = document.createElement('dl');
        dl.className = ((sample && sample.className) ? sample.className + ' ' : '') + 'sdf-detail-row';
        dl.setAttribute('data-sdf-owner', owner || '');
        if (trim(row.label)) {
            var dt = document.createElement('dt');
            var sampleDt = sample ? sample.querySelector('dt') : null;
            if (sampleDt && sampleDt.className) {
                dt.className = sampleDt.className;
            }
            dt.appendChild(document.createTextNode(trim(row.label)));
            dl.appendChild(dt);
        }
        var dd = document.createElement('dd');
        var sampleDd = sample ? sample.querySelector('dd') : null;
        if (sampleDd && sampleDd.className) {
            dd.className = sampleDd.className;
        }
        dd.appendChild(document.createTextNode(row.value || ''));
        dl.appendChild(dd);
        return dl;
    }

    /**
     * Shows every answer inside Подробности, in the same label-and-value rows as the other request fields.
     */
    function renderDetails(rows) {
        var panel = document.querySelector('.activity-item.request-fields');
        if (!panel || !rows || !rows.length) {
            return false;
        }
        hideNativeQuestionFields(rows);
        var ordered = presentRows(rows);
        if (!ordered.length) {
            return false;
        }
        var signature = detailSignature([{owner: 'details', rows: ordered}]);
        if (panel.getAttribute('data-sdf-details') === signature && panel.querySelector('.sdf-detail-row')) {
            return true;
        }
        var sample = null;
        var dls = panel.querySelectorAll('dl');
        var i;
        for (i = 0; i < dls.length; i++) {
            if (hasClass(dls[i], 'sdf-detail-row') || dls[i].getAttribute('data-sdf-native-hidden') === '1') {
                continue;
            }
            sample = dls[i];
            break;
        }
        var parent = sample ? sample.parentNode : panel;
        var stale = panel.querySelectorAll('.sdf-detail-row');
        for (i = stale.length - 1; i >= 0; i--) {
            if (stale[i].parentNode) {
                stale[i].parentNode.removeChild(stale[i]);
            }
        }
        var owners = ourFieldIds();
        var anchor = null;
        var owner;
        for (owner in owners) {
            if (!owners.hasOwnProperty(owner)) {
                continue;
            }
            var source = panel.querySelector('dl[data-test-id="' + owner + '"]');
            if (!source) {
                continue;
            }
            source.style.display = 'none';
            source.setAttribute('data-sdf-replaced', '1');
            anchor = source;
        }
        var description = panel.querySelector('dl[data-test-id="description"]');
        var after = anchor;
        for (i = 0; i < ordered.length; i++) {
            var node = buildDetailRow(ordered[i].owner || '', ordered[i], sample);
            if (after && after.parentNode) {
                if (after.nextSibling) {
                    after.parentNode.insertBefore(node, after.nextSibling);
                } else {
                    after.parentNode.appendChild(node);
                }
            } else if (description && description.parentNode) {
                description.parentNode.insertBefore(node, description);
            } else {
                parent.appendChild(node);
            }
            after = node;
        }
        panel.setAttribute('data-sdf-details', signature);
        return !!panel.querySelector('.sdf-detail-row');
    }

    function renderAnswers(rows) {
        if (renderDetails(rows)) {
            removeAnswers();
            return;
        }
        removeAnswers();
    }

    function removeAnswers() {
        var existing = document.getElementById('sdf-portal-answers');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
    }

    function loadAnswers(key) {
        var state = answersState[key];
        if (state && (state.loading || state.rows)) {
            if (state.rows) {
                renderAnswers(state.rows);
            }
            return;
        }
        answersState[key] = {loading: true, rows: null};
        getJson(rest('/answers/' + encodeURIComponent(key)), function (status, text) {
            var rows = [];
            if (status === 200) {
                try {
                    rows = (JSON.parse(text).rows) || [];
                } catch (e) {
                    rows = [];
                }
            }
            answersState[key] = {loading: false, rows: rows};
            if (issueKeyFromPath() === key && !isCreatePage()) {
                renderAnswers(rows);
            }
        });
    }

    function getJson(url, cb) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                cb(xhr.status, xhr.responseText || '');
            }
        };
        xhr.send();
    }

    function putJson(url, body, cb) {
        var xhr = new XMLHttpRequest();
        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('X-Atlassian-Token', 'no-check');
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                cb(xhr.status, xhr.responseText || '');
            }
        };
        xhr.send(body);
    }

    function readPending() {
        try {
            var raw = sessionStorage.getItem(PENDING_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    function writePending(value) {
        try {
            sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
        } catch (e) {
            // ignore quota / private mode
        }
    }

    function clearPending() {
        try {
            sessionStorage.removeItem(PENDING_KEY);
        } catch (e) {
            // ignore
        }
    }

    function hasAny(values) {
        if (!values) {
            return false;
        }
        for (var key in values) {
            if (values.hasOwnProperty(key) && values[key] && values[key].length) {
                return true;
            }
        }
        return false;
    }

    function hasAnyBlocks(blocks) {
        if (!blocks) {
            return false;
        }
        for (var id in blocks) {
            if (blocks.hasOwnProperty(id) && hasAny(blocks[id])) {
                return true;
            }
        }
        return false;
    }

    function portalSections() {
        if (!document.querySelectorAll) {
            return [];
        }
        return document.querySelectorAll('.sdf-portal-block');
    }

    function remember() {
        var sections = portalSections();
        if (!sections.length) {
            return;
        }
        var blocks = {};
        for (var i = 0; i < sections.length; i++) {
            var id = sections[i].getAttribute('data-sdf-block');
            if (hasClass(sections[i], 'sdf-hidden')) {
                blocks[id] = {};
                continue;
            }
            var block = findBlock(id);
            if (block) {
                applyVisibility(sections[i], block);
            }
            blocks[id] = readValues(sections[i], true);
        }
        writePending({t: Date.now(), blocks: blocks, sent: null});
        debug('remember', blocks);
    }

    function stripPortalNames() {
        var sections = portalSections();
        var i;
        var n;
        for (i = 0; i < sections.length; i++) {
            var nodes = fieldNodes(sections[i]);
            for (n = 0; n < nodes.length; n++) {
                stripNames(nodes[n]);
            }
        }
    }

    function stripNames(block) {
        if (!block) {
            return;
        }
        var tags = ['input', 'select', 'textarea'];
        for (var t = 0; t < tags.length; t++) {
            var nodes = block.getElementsByTagName(tags[t]);
            for (var i = 0; i < nodes.length; i++) {
                nodes[i].removeAttribute('name');
            }
        }
    }

    function submitPending(issueKey) {
        var pending = readPending();
        if (!pending || !issueKey) {
            return;
        }
        if (Date.now() - pending.t > PENDING_MS) {
            clearPending();
            return;
        }
        var payload;
        if (pending.blocks) {
            if (!hasAnyBlocks(pending.blocks)) {
                clearPending();
                return;
            }
            payload = {blocks: pending.blocks};
        } else if (pending.values && hasAny(pending.values)) {
            payload = {values: pending.values};
        } else {
            clearPending();
            return;
        }
        if (pending.sent === issueKey) {
            return;
        }
        pending.sent = issueKey;
        writePending(pending);
        debug('put answers', issueKey);
        putJson(rest('/answers/' + encodeURIComponent(issueKey)), JSON.stringify(payload), function (status, text) {
            debug('put status', status, text);
            if (status >= 200 && status < 300) {
                clearPending();
                answersState[issueKey] = null;
                if (issueKeyFromPath() === issueKey) {
                    loadAnswers(issueKey);
                }
            } else if (status >= 400 && status < 500) {
                clearPending();
            } else {
                var again = readPending();
                if (again && again.sent === issueKey) {
                    again.sent = null;
                    writePending(again);
                }
            }
        });
    }

    function extractKey(text) {
        if (!text) {
            return null;
        }
        var body = String(text);
        var match = body.match(/"issueKey"\s*:\s*"([A-Z][A-Z0-9]+-\d+)"/);
        if (match) {
            return match[1];
        }
        match = body.match(/"key"\s*:\s*"([A-Z][A-Z0-9]+-\d+)"/);
        return match ? match[1] : null;
    }

    function isCreateUrl(url) {
        var value = String(url || '');
        if (/comment|attachment|avatar/i.test(value)) {
            return false;
        }
        return /request/i.test(value);
    }

    function hookTransport() {
        var proto = XMLHttpRequest.prototype;
        if (proto._sdfHooked) {
            return;
        }
        proto._sdfHooked = true;
        var origOpen = proto.open;
        var origSend = proto.send;
        proto.open = function (method, url) {
            this._sdfMethod = method;
            this._sdfUrl = url;
            return origOpen.apply(this, arguments);
        };
        proto.send = function () {
            var xhr = this;
            var method = String(xhr._sdfMethod || '').toUpperCase();
            var url = String(xhr._sdfUrl || '');
            if (method === 'POST' && isCreateUrl(url)) {
                debug('watch', url);
                xhr.addEventListener('load', function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        var key = extractKey(xhr.responseText);
                        debug('response key', key, url);
                        if (key) {
                            submitPending(key);
                        }
                    }
                });
            }
            return origSend.apply(this, arguments);
        };
        if (window.fetch && !window.fetch._sdfHooked) {
            var origFetch = window.fetch;
            var wrapped = function (input, init) {
                var method = (init && init.method) || (input && input.method) || 'GET';
                var url = typeof input === 'string' ? input : (input && input.url) || '';
                var result = origFetch.apply(window, arguments);
                if (String(method).toUpperCase() === 'POST' && isCreateUrl(url) && result && result.then) {
                    result.then(function (response) {
                        try {
                            if (!response || !response.clone) {
                                return;
                            }
                            response.clone().text().then(function (text) {
                                var key = extractKey(text);
                                if (key) {
                                    submitPending(key);
                                }
                            });
                        } catch (e) {
                            // ignore
                        }
                    });
                }
                return result;
            };
            wrapped._sdfHooked = true;
            window.fetch = wrapped;
        }
    }

    function isSubmitControl(node) {
        if (!node || !node.tagName) {
            return false;
        }
        var tag = node.tagName.toLowerCase();
        if (tag === 'input' && String(node.type).toLowerCase() === 'submit') {
            return true;
        }
        if (tag === 'button') {
            var type = (node.getAttribute('type') || 'submit').toLowerCase();
            if (type === 'submit' || hasClass(node, 'js-submit-button')) {
                return true;
            }
        }
        return false;
    }

    function formOf(node) {
        while (node && node !== document) {
            if (node.tagName && node.tagName.toLowerCase() === 'form') {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function fieldBox(node) {
        while (node && node !== document) {
            if (node.getAttribute && node.getAttribute('data-sdf-field')) {
                return node;
            }
            node = node.parentNode;
        }
        return null;
    }

    function clearRequiredMark(node) {
        removeClass(node, 'sdf-invalid');
        var notes = node.getElementsByClassName ? node.getElementsByClassName('sdf-required-error') : [];
        var copy = [];
        var i;
        for (i = 0; i < notes.length; i++) {
            copy.push(notes[i]);
        }
        for (i = 0; i < copy.length; i++) {
            if (copy[i].parentNode) {
                copy[i].parentNode.removeChild(copy[i]);
            }
        }
    }

    function missingRequired() {
        var sections = portalSections();
        var missing = [];
        var s;
        var i;
        for (s = 0; s < sections.length; s++) {
            if (hasClass(sections[s], 'sdf-hidden')) {
                continue;
            }
            var nodes = fieldNodes(sections[s]);
            for (i = 0; i < nodes.length; i++) {
                if (nodes[i].getAttribute('data-sdf-required') !== '1') {
                    continue;
                }
                if (hasClass(nodes[i], 'sdf-hidden') || nodes[i].getAttribute('data-sdf-shown') === '0') {
                    clearRequiredMark(nodes[i]);
                    continue;
                }
                clearRequiredMark(nodes[i]);
                if (!readField(nodes[i]).length) {
                    missing.push(nodes[i]);
                }
            }
        }
        return missing;
    }

    function showRequired(nodes) {
        var i;
        for (i = 0; i < nodes.length; i++) {
            addClass(nodes[i], 'sdf-invalid');
            var note = document.createElement('div');
            note.className = 'error sdf-required-error';
            note.appendChild(document.createTextNode(AJS.I18n.getText('ru.saael.dynamicfields.portal.required')));
            nodes[i].appendChild(note);
        }
        if (nodes.length && nodes[0].scrollIntoView) {
            nodes[0].scrollIntoView(true);
        }
    }

    function blockRequired(e) {
        var missing = missingRequired();
        if (!missing.length) {
            return false;
        }
        showRequired(missing);
        if (e && e.preventDefault) {
            e.preventDefault();
        }
        if (e && e.stopPropagation) {
            e.stopPropagation();
        }
        return true;
    }

    function onActivate(target, e) {
        var node = target;
        if (node && node.nodeType !== 1) {
            node = node.parentNode;
        }
        var control = node;
        while (control && control !== document) {
            if (isSubmitControl(control)) {
                break;
            }
            control = control.parentNode;
        }
        if (!control || control === document) {
            return;
        }
        var formEl = formOf(control);
        if (!formEl || !formEl.querySelector || !formEl.querySelector('[data-sdf-block]')) {
            return;
        }
        if (blockRequired(e)) {
            return;
        }
        syncFieldValue();
        remember();
        stripPortalNames();
    }

    function flushPending() {
        var pending = readPending();
        if (!pending || !pending.t) {
            return;
        }
        if (Date.now() - pending.t > PENDING_MS) {
            clearPending();
            return;
        }
        if (isCreatePage()) {
            return;
        }
        var key = issueKeyFromPath();
        if (key) {
            submitPending(key);
        }
    }

    function onTick() {
        if (!config) {
            return;
        }
        if (isCreatePage() && blocksOf(config).length) {
            ensureForm();
            removeAnswers();
        } else {
            removeForm();
            var key = issueKeyFromPath();
            if (key) {
                loadAnswers(key);
            } else {
                removeAnswers();
            }
        }
        flushPending();
    }

    function schedule() {
        if (scheduled) {
            return;
        }
        scheduled = true;
        setTimeout(function () {
            scheduled = false;
            onTick();
        }, 200);
    }

    function boot() {
        if (document.getElementById('sdf-app')) {
            return;
        }
        hookTransport();
        document.addEventListener('click', function (e) {
            onActivate(e.target, e);
        }, true);
        document.addEventListener('input', function (e) {
            var box = fieldBox(e.target);
            if (box) {
                clearRequiredMark(box);
            }
        }, true);
        document.addEventListener('change', function (e) {
            var box = fieldBox(e.target);
            if (box) {
                clearRequiredMark(box);
            }
        }, true);
        document.addEventListener('submit', function (e) {
            var formEl = e.target;
            if (formEl && formEl.querySelector && formEl.querySelector('[data-sdf-block]')) {
                if (blockRequired(e)) {
                    return;
                }
                syncFieldValue();
                remember();
                stripPortalNames();
            }
        }, true);
        if (window.MutationObserver && document.documentElement) {
            var observer = new MutationObserver(function () {
                schedule();
            });
            observer.observe(document.documentElement, {childList: true, subtree: true});
        }
        lastHref = location.href;
        setInterval(function () {
            if (location.href !== lastHref) {
                lastHref = location.href;
                onTick();
            } else {
                flushPending();
                if (isCreatePage() && config && blocksOf(config).length) {
                    ensureForm();
                } else if (!isCreatePage()) {
                    var key = issueKeyFromPath();
                    if (key && answersState[key] && answersState[key].rows) {
                        renderAnswers(answersState[key].rows);
                    }
                }
            }
        }, 700);
        getJson(rest('/form'), function (status, text) {
            if (status === 200) {
                try {
                    config = JSON.parse(text);
                } catch (e) {
                    config = null;
                }
            }
            debug('config', status, blocksOf(config).length);
            onTick();
        });
        window.SaaelDynamicFields = {
            visibility: visibility,
            getConfig: function () {
                return config;
            },
            readValues: function () {
                var sections = portalSections();
                var blocks = {};
                for (var i = 0; i < sections.length; i++) {
                    blocks[sections[i].getAttribute('data-sdf-block')] = readValues(sections[i], true);
                }
                return blocks;
            },
            reload: function () {
                config = null;
                getJson(rest('/form'), function (status, text) {
                    if (status === 200) {
                        try {
                            config = JSON.parse(text);
                        } catch (e) {
                            config = null;
                        }
                    }
                    removeForm();
                    onTick();
                });
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
