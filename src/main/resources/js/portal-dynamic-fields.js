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

    function readValues(root, onlyVisible) {
        var result = {};
        if (!root || !root.querySelectorAll) {
            return result;
        }
        var nodes = root.querySelectorAll('[data-sdf-field]');
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

    function applyVisibility(root, cfg) {
        if (!root || !cfg) {
            return;
        }
        var values = readValues(root, false);
        var visible = visibility(cfg.fields, values);
        var nodes = root.querySelectorAll('[data-sdf-field]');
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
            }
        }
    }

    function buildField(field, blockId) {
        var wrap = document.createElement('div');
        wrap.className = 'field-group sdf-field';
        wrap.setAttribute('data-sdf-field', field.id);
        wrap.setAttribute('data-sdf-type', field.type || 'text');
        if (trim(field.label)) {
            var label = document.createElement('label');
            label.appendChild(document.createTextNode(trim(field.label)));
            wrap.appendChild(label);
        }
        var options = field.options || [];
        var i;
        if (field.type === 'checkbox' || field.type === 'radio') {
            var choices = document.createElement('div');
            choices.className = 'sdf-choices';
            for (i = 0; i < options.length; i++) {
                var line = document.createElement('label');
                line.className = field.type === 'checkbox' ? 'checkbox' : 'radio';
                var input = document.createElement('input');
                input.type = field.type;
                input.value = options[i];
                input.checked = listHas(field.defaults, options[i]);
                // Not a successful control of the Jira request form, so the portal does not submit it.
                input.setAttribute('form', 'sdf-unattached');
                if (field.type === 'radio') {
                    input.setAttribute('name', 'sdf-' + (blockId || 'main') + '-' + field.id);
                }
                line.appendChild(input);
                line.appendChild(document.createTextNode(' ' + options[i]));
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
        } else if (field.type === 'textarea') {
            var area = document.createElement('textarea');
            area.className = 'textarea';
            area.setAttribute('rows', '3');
            area.setAttribute('form', 'sdf-unattached');
            area.value = (field.defaults && field.defaults.length) ? field.defaults[0] : '';
            wrap.appendChild(area);
        } else {
            var text = document.createElement('input');
            text.type = portalInputKind(field.type);
            text.className = 'text';
            text.setAttribute('form', 'sdf-unattached');
            text.value = (field.defaults && field.defaults.length) ? field.defaults[0] : '';
            wrap.appendChild(text);
        }
        return wrap;
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
        removeOutside(host);
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
            if (!node) {
                node = buildSection(block);
                host.appendChild(node);
            }
            applyVisibility(node, block);
            removeClass(node, 'sdf-hidden');
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

    function answerSummary() {
        var lines = [];
        var sections = document.querySelectorAll('.sdf-portal-block');
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
        var areas = document.querySelectorAll('.sdf-cf-value');
        if (!areas.length) {
            return;
        }
        var text = answerSummary();
        var i;
        for (i = 0; i < areas.length; i++) {
            if (typeof areas[i].value === 'string') {
                areas[i].value = text;
            }
        }
    }

    function ensureForm() {
        if (!isCreatePage()) {
            return;
        }
        var blocks = visibleBlocks();
        var host = findHost();
        if (host) {
            renderInsideField(host, blocks);
            return;
        }
        var formEl = document.querySelector('form.cp-request-form');
        if (!formEl) {
            return;
        }
        var keep = {};
        var i;
        for (i = 0; i < blocks.length; i++) {
            keep[blocks[i].id] = true;
        }
        var stale = formEl.querySelectorAll('.sdf-portal-block');
        for (i = stale.length - 1; i >= 0; i--) {
            if (!keep[stale[i].getAttribute('data-sdf-block')] && stale[i].parentNode) {
                stale[i].parentNode.removeChild(stale[i]);
            }
        }
        if (!blocks.length) {
            return;
        }
        wireForm(formEl);
        var groups = [];
        for (i = 0; i < blocks.length; i++) {
            var block = blocks[i];
            var node = formEl.querySelector('[data-sdf-block="' + block.id + '"]');
            if (!node) {
                node = buildSection(block);
            }
            var anchor = anchorFor(formEl, block);
            var found = null;
            var g;
            for (g = 0; g < groups.length; g++) {
                if (groups[g].anchor === anchor) {
                    found = groups[g];
                }
            }
            if (!found) {
                found = {anchor: anchor, nodes: []};
                groups.push(found);
            }
            found.nodes.push(node);
        }
        for (i = 0; i < groups.length; i++) {
            var nodes = groups[i].nodes;
            var before = groups[i].anchor;
            if (alreadyPlaced(formEl, nodes, before)) {
                continue;
            }
            var n;
            for (n = 0; n < nodes.length; n++) {
                if (before && before.parentNode === formEl) {
                    formEl.insertBefore(nodes[n], before);
                } else {
                    formEl.appendChild(nodes[n]);
                }
            }
        }
            applyAnchors(formEl);
            debug('form arranged', blocks.length);
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

        function readGroupValues(group) {
            var out = [];
            if (!group) {
                return out;
            }
            var nodes = group.querySelectorAll('input, select, textarea');
            var i;
            for (i = 0; i < nodes.length; i++) {
                var node = nodes[i];
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

    function answersMount() {
        var selectors = [
            '.cv-request-details',
            '.js-request-details',
            '.request-details',
            '.cv-request-content',
            '.cp-request-content',
            '#content'
        ];
        for (var i = 0; i < selectors.length; i++) {
            var el = document.querySelector(selectors[i]);
            if (el) {
                return el;
            }
        }
        return null;
    }

    function fallbackHeading() {
        try {
            return AJS.I18n.getText('ru.saael.dynamicfields.portal.answers');
        } catch (e) {
            return 'Answers';
        }
    }

    function renderAnswers(rows) {
        var existing = document.getElementById('sdf-portal-answers');
        if (!rows || !rows.length) {
            if (existing && existing.parentNode) {
                existing.parentNode.removeChild(existing);
            }
            return;
        }
        var mount = answersMount();
        if (!mount) {
            return;
        }
        var host = existing || document.createElement('div');
        host.id = 'sdf-portal-answers';
        host.className = 'sdf-answers';
        var header = mount.querySelector ? mount.querySelector('.cv-page-title, .vp-request-header') : null;
        if (header && header.parentNode === mount) {
            if (header.nextSibling) {
                mount.insertBefore(host, header.nextSibling);
            } else {
                mount.appendChild(host);
            }
        } else if (host.parentNode !== mount) {
            mount.insertBefore(host, mount.firstChild);
        }
        while (host.firstChild) {
            host.removeChild(host.firstChild);
        }
        var distinct = [];
        var g;
        for (g = 0; g < rows.length; g++) {
            var groupName = rows[g].group || '';
            if (groupName && (distinct.length === 0 || distinct[distinct.length - 1] !== groupName)) {
                distinct.push(groupName);
            }
        }
        var blocks = blocksOf(config);
        var heading = fallbackHeading();
        if (distinct.length === 1) {
            heading = distinct[0];
        } else if (!distinct.length && blocks.length === 1 && trim(blocks[0].title)) {
            heading = trim(blocks[0].title);
        }
        var title = document.createElement('h3');
        title.className = 'sdf-title';
        title.appendChild(document.createTextNode(heading));
        host.appendChild(title);
        var lastGroup = distinct.length === 1 ? distinct[0] : '';
        for (var i = 0; i < rows.length; i++) {
            var group = rows[i].group || '';
            if (distinct.length > 1 && group && group !== lastGroup) {
                var sub = document.createElement('div');
                sub.className = 'sdf-answer-group';
                sub.appendChild(document.createTextNode(group));
                host.appendChild(sub);
                lastGroup = group;
            }
            var label = document.createElement('div');
            label.className = 'sdf-answer-label';
            label.appendChild(document.createTextNode(rows[i].label || ''));
            var value = document.createElement('div');
            value.className = 'sdf-answer-value';
            value.appendChild(document.createTextNode(rows[i].value || ''));
            host.appendChild(label);
            host.appendChild(value);
        }
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
        var sections = document.querySelectorAll('.sdf-portal-block');
        for (var i = 0; i < sections.length; i++) {
            stripNames(sections[i]);
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

    function onActivate(target) {
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
        if (isCreatePage() && visibleBlocks().length) {
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
            onActivate(e.target);
        }, true);
        document.addEventListener('submit', function (e) {
            var formEl = e.target;
            if (formEl && formEl.querySelector && formEl.querySelector('[data-sdf-block]')) {
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
                if (isCreatePage() && config && visibleBlocks().length) {
                    ensureForm();
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
