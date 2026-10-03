/**
 * Customer-portal form owned entirely by this plugin.
 * ES5, no libraries. Fields are not Jira custom fields: the block is painted here,
 * and answers are stored by the plugin when the request is created.
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
            selects[i].selectedIndex = 0;
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

    function buildField(field) {
        var wrap = document.createElement('div');
        wrap.className = 'sdf-field';
        wrap.setAttribute('data-sdf-field', field.id);
        wrap.setAttribute('data-sdf-type', field.type || 'text');
        var label = document.createElement('div');
        label.className = 'sdf-label';
        label.appendChild(document.createTextNode(field.label || ''));
        wrap.appendChild(label);
        var options = field.options || [];
        var i;
        if (field.type === 'checkbox' || field.type === 'radio') {
            for (i = 0; i < options.length; i++) {
                var line = document.createElement('label');
                line.className = 'sdf-option';
                var input = document.createElement('input');
                input.type = field.type;
                input.value = options[i];
                // Not a successful control of the Jira request form, so the portal does not submit it.
                input.setAttribute('form', 'sdf-unattached');
                if (field.type === 'radio') {
                    input.setAttribute('name', 'sdf-' + field.id);
                }
                line.appendChild(input);
                line.appendChild(document.createTextNode(' ' + options[i]));
                wrap.appendChild(line);
            }
        } else if (field.type === 'select') {
            var select = document.createElement('select');
            select.className = 'sdf-select';
            select.setAttribute('form', 'sdf-unattached');
            var empty = document.createElement('option');
            empty.value = '';
            empty.appendChild(document.createTextNode('\u2014'));
            select.appendChild(empty);
            for (i = 0; i < options.length; i++) {
                var option = document.createElement('option');
                option.value = options[i];
                option.appendChild(document.createTextNode(options[i]));
                select.appendChild(option);
            }
            wrap.appendChild(select);
        } else if (field.type === 'textarea') {
            var area = document.createElement('textarea');
            area.className = 'sdf-textarea';
            area.setAttribute('rows', '3');
            area.setAttribute('form', 'sdf-unattached');
            wrap.appendChild(area);
        } else {
            var text = document.createElement('input');
            text.type = 'text';
            text.className = 'sdf-input';
            text.setAttribute('form', 'sdf-unattached');
            wrap.appendChild(text);
        }
        return wrap;
    }

    function buildForm(cfg) {
        var block = document.createElement('div');
        block.id = 'sdf-portal-form';
        block.className = 'sdf-block';
        if (cfg.title && trim(cfg.title)) {
            var title = document.createElement('h3');
            title.className = 'sdf-title';
            title.appendChild(document.createTextNode(cfg.title));
            block.appendChild(title);
        }
        var visible = visibility(cfg.fields, {});
        for (var i = 0; i < cfg.fields.length; i++) {
            var node = buildField(cfg.fields[i]);
            var show = !!visible[cfg.fields[i].id];
            node.setAttribute('data-sdf-shown', show ? '1' : '0');
            if (!show) {
                addClass(node, 'sdf-hidden');
            }
            block.appendChild(node);
        }
        return block;
    }

    function isCreatePage() {
        return /\/portal\/\d+\/create\/\d+/.test(location.pathname);
    }

    function requestTypeMatches(cfg) {
        var ids = (cfg && cfg.requestTypeIds) || [];
        if (!ids.length) {
            return true;
        }
        var match = location.pathname.match(/\/create\/(\d+)/);
        if (!match) {
            return false;
        }
        var id = parseInt(match[1], 10);
        for (var i = 0; i < ids.length; i++) {
            if (Number(ids[i]) === id) {
                return true;
            }
        }
        return false;
    }

    function issueKeyFromPath() {
        var match = location.pathname.match(/\/([A-Z][A-Z0-9]+-\d+)\/?$/);
        return match ? match[1] : null;
    }

    function insertBeforeSubmit(formEl, block) {
        var submit = formEl.querySelector('button[type="submit"], input[type="submit"], .js-submit-button');
        if (!submit) {
            formEl.appendChild(block);
            return;
        }
        var parent = submit;
        while (parent.parentNode && parent.parentNode !== formEl) {
            parent = parent.parentNode;
        }
        if (parent.parentNode === formEl) {
            formEl.insertBefore(block, parent);
        } else {
            submit.parentNode.insertBefore(block, submit);
        }
    }

    function ensureForm() {
        if (!config || !config.fields || !config.fields.length || !isCreatePage() || !requestTypeMatches(config)) {
            return;
        }
        var formEl = document.querySelector('form.cp-request-form');
        if (!formEl) {
            return;
        }
        var existing = document.getElementById('sdf-portal-form');
        if (existing && formEl.contains && formEl.contains(existing)) {
            return;
        }
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        var block = buildForm(config);
        insertBeforeSubmit(formEl, block);
        block.addEventListener('change', function () {
            applyVisibility(block, config);
        });
        block.addEventListener('input', function () {
            applyVisibility(block, config);
        });
        debug('form inserted', config.fields.length);
    }

    function removeForm() {
        var existing = document.getElementById('sdf-portal-form');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
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
        var title = document.createElement('h3');
        title.className = 'sdf-title';
        var heading = (config && trim(config.title)) ? trim(config.title) : fallbackHeading();
        title.appendChild(document.createTextNode(heading));
        host.appendChild(title);
        for (var i = 0; i < rows.length; i++) {
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

    function remember() {
        var block = document.getElementById('sdf-portal-form');
        if (!block) {
            return;
        }
        applyVisibility(block, config);
        var values = readValues(block, true);
        writePending({t: Date.now(), values: values, sent: null});
        debug('remember', values);
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
        if (!hasAny(pending.values)) {
            clearPending();
            return;
        }
        if (pending.sent === issueKey) {
            return;
        }
        pending.sent = issueKey;
        writePending(pending);
        debug('put answers', issueKey);
        putJson(rest('/answers/' + encodeURIComponent(issueKey)), JSON.stringify({values: pending.values}), function (status, text) {
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
        if (!formEl || !formEl.querySelector || !formEl.querySelector('#sdf-portal-form')) {
            return;
        }
        remember();
        stripNames(document.getElementById('sdf-portal-form'));
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
        if (isCreatePage() && requestTypeMatches(config)) {
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
            if (formEl && formEl.querySelector && formEl.querySelector('#sdf-portal-form')) {
                remember();
                stripNames(document.getElementById('sdf-portal-form'));
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
                if (isCreatePage() && config && !document.getElementById('sdf-portal-form')) {
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
            debug('config', status, config && config.fields ? config.fields.length : 0);
            onTick();
        });
        window.SaaelDynamicFields = {
            visibility: visibility,
            getConfig: function () {
                return config;
            },
            readValues: function () {
                var block = document.getElementById('sdf-portal-form');
                return readValues(block, true);
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
