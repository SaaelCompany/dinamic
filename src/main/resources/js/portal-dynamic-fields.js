/*
 * Portal Dynamic Fields - customer portal runtime.
 *
 * Loads the rules from /rest/dynamic-fields/1.0/rules and, on every change of the request form,
 * decides which fields have to be visible:
 *
 *   - a field that is not a target of any applicable rule is always visible;
 *   - a target field is visible only while at least one rule that lists it in "show" matches
 *     AND the trigger field of that rule is itself visible (=> unlimited nesting / cascading hide).
 *
 * Written in ES5 without any library dependency on purpose: the customer portal only guarantees
 * a very small set of globals.
 */
(function (window, document) {
    'use strict';

    if (window.SaaelDynamicFields) {
        return;
    }

    var REST_PATH = '/rest/dynamic-fields/1.0/rules';
    var HIDDEN_CLASS = 'sdf-hidden';
    var HIDDEN_ATTR = 'data-sdf-hidden-field';
    var DEBOUNCE_MS = 30;
    var DEFAULT_CONTAINER_SELECTORS = [
        '[data-field-id]',
        '.cv-field-group',
        '.sd-field-group',
        '.field-group',
        '.cv-request-field',
        '.form-field'
    ];
    var VALUE_PLACEHOLDERS = { '': true, '-1': true };

    var config = null;
    var timer = null;
    var debug = false;

    try {
        debug = window.localStorage && window.localStorage.getItem('sdf.debug') === 'true';
    } catch (e) {
        debug = false;
    }

    function log() {
        if (debug && window.console && window.console.log) {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[dynamic-fields]');
            window.console.log.apply(window.console, args);
        }
    }

    /* ------------------------------------------------------------------ helpers */

    function contextPath() {
        if (window.AJS && typeof window.AJS.contextPath === 'function') {
            return window.AJS.contextPath() || '';
        }
        var meta = document.querySelector('meta[name="ajs-context-path"]');
        return meta ? (meta.getAttribute('content') || '') : '';
    }

    function matchesSelector(el, selector) {
        var fn = el.matches || el.msMatchesSelector || el.webkitMatchesSelector;
        try {
            return fn ? fn.call(el, selector) : false;
        } catch (e) {
            return false;
        }
    }

    function closest(el, selector) {
        var node = el;
        while (node && node.nodeType === 1) {
            if (matchesSelector(node, selector)) {
                return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    function normalise(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').replace(/^ | $/g, '').toLowerCase();
    }

    function tidy(value) {
        return String(value == null ? '' : value).replace(/\s+/g, ' ').replace(/^ | $/g, '');
    }

    function toArray(list) {
        return Array.prototype.slice.call(list || []);
    }

    function escapeAttr(value) {
        return String(value).replace(/["\\]/g, '\\$&');
    }

    function pageScope() {
        var match = /\/servicedesk\/customer\/portal\/(\d+)(?:\/create\/(\d+))?/.exec(window.location.pathname);
        return {
            portalId: match ? Number(match[1]) : null,
            requestTypeId: match && match[2] ? Number(match[2]) : null
        };
    }

    function ruleApplies(rule, scope) {
        if (!rule || !rule.when || !rule.when.fieldId || !rule.show || !rule.show.length) {
            return false;
        }
        if (rule.portalId != null && scope.portalId !== Number(rule.portalId)) {
            return false;
        }
        if (rule.requestTypeIds && rule.requestTypeIds.length) {
            if (scope.requestTypeId == null) {
                return false;
            }
            var found = false;
            for (var i = 0; i < rule.requestTypeIds.length; i++) {
                if (Number(rule.requestTypeIds[i]) === scope.requestTypeId) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                return false;
            }
        }
        return true;
    }

    /* ------------------------------------------------------------- field lookup */

    /**
     * Base field id of a form control: "customfield_10100" for name="customfield_10100",
     * name="customfield_10100:1" (cascading select) or id="customfield_10100-10001" (checkbox option).
     */
    function fieldOf(control) {
        var name = control.getAttribute('name');
        if (name) {
            return name.split(':')[0];
        }
        var id = control.id || '';
        if (!id) {
            return null;
        }
        id = id.replace(/^s2id_/, '');
        return id.replace(/[-:].*$/, '');
    }

    function isControl(el) {
        var tag = el.tagName;
        return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    }

    function fieldElements(fieldId) {
        var id = escapeAttr(fieldId);
        var selector = '[name="' + id + '"],[id="' + id + '"],[name^="' + id + ':"],[id^="' + id + ':"],' +
            '[id^="' + id + '-"],[id="s2id_' + id + '"],[data-field-id="' + id + '"]';
        var elements;
        try {
            elements = toArray(document.querySelectorAll(selector));
        } catch (e) {
            return [];
        }
        return elements.filter(function (el) {
            // "customfield_10100-" would also match ids of unrelated widgets; keep only form-ish elements
            return isControl(el) || el.hasAttribute('data-field-id') || /^s2id_/.test(el.id || '') ||
                matchesSelector(el, 'select, .select2-container, .aui-select, .checkbox, .radio');
        });
    }

    function fieldControls(fieldId) {
        return fieldElements(fieldId).filter(isControl);
    }

    /** Helper inputs of widgets (select2 search box, focusser, ...) do not represent a Jira field. */
    function isAuxiliaryControl(c) {
        if (c.getAttribute('name')) {
            return false;
        }
        if (c.type === 'hidden' || /^s2id_autogen/.test(c.id || '')) {
            return true;
        }
        return !!closest(c, '.select2-container, .select2-drop, .aui-select, .aui-datepicker-dialog');
    }

    /**
     * @param stopAtButtons treat buttons as a boundary too (used while climbing up the tree, so that a
     *                      lonely field never swallows the submit button or the whole page)
     */
    function containsOtherField(root, fieldId, stopAtButtons) {
        if (root.tagName === 'FORM' || root === document.body || root === document.documentElement) {
            return true;
        }
        var controls = root.querySelectorAll('input,select,textarea,button');
        for (var i = 0; i < controls.length; i++) {
            var c = controls[i];
            if (c.tagName === 'BUTTON' || c.type === 'submit' || c.type === 'button') {
                if (stopAtButtons) {
                    return true;
                }
                continue;
            }
            if (isAuxiliaryControl(c)) {
                continue;
            }
            var owner = fieldOf(c);
            if (owner && owner !== fieldId) {
                return true;
            }
        }
        return false;
    }

    var MAX_CLIMB = 6;

    function heuristicContainer(el, fieldId) {
        var candidate = el;
        var node = el;
        var depth = 0;
        while (depth < MAX_CLIMB && node.parentElement && !containsOtherField(node.parentElement, fieldId, true)) {
            node = node.parentElement;
            candidate = node;
            depth++;
        }
        return candidate;
    }

    function containerSelectors() {
        var custom = (config && config.containerSelectors) || [];
        return custom.concat(DEFAULT_CONTAINER_SELECTORS);
    }

    function containerOf(el, fieldId) {
        var selectors = containerSelectors();
        for (var i = 0; i < selectors.length; i++) {
            var found = closest(el, selectors[i]);
            if (found && !containsOtherField(found, fieldId)) {
                return found;
            }
        }
        return heuristicContainer(el, fieldId);
    }

    function containersOf(fieldId) {
        var containers = [];
        fieldElements(fieldId).forEach(function (el) {
            var container = containerOf(el, fieldId);
            if (container && containers.indexOf(container) === -1) {
                containers.push(container);
            }
        });
        return containers;
    }

    /* ------------------------------------------------------------ field values */

    function labelOf(control) {
        var label = null;
        if (control.id) {
            label = document.querySelector('label[for="' + escapeAttr(control.id) + '"]');
        }
        if (!label) {
            label = closest(control, 'label');
        }
        return label ? label.textContent : '';
    }

    /** @return array of {id, label} for every current value of the field (empty array = no value). */
    function readValues(fieldId) {
        var values = [];
        fieldControls(fieldId).forEach(function (control) {
            var type = (control.type || '').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
                if (control.checked) {
                    values.push({ id: control.value || 'on', label: labelOf(control) });
                }
            } else if (control.tagName === 'SELECT') {
                toArray(control.options).forEach(function (option) {
                    if (option.selected && !VALUE_PLACEHOLDERS[option.value]) {
                        values.push({ id: option.value, label: option.text });
                    }
                });
            } else if (type !== 'submit' && type !== 'button' && type !== 'file') {
                var raw = control.value;
                if (raw != null && String(raw).replace(/\s/g, '') !== '' && !VALUE_PLACEHOLDERS[raw]) {
                    String(raw).split(',').forEach(function (part) {
                        values.push({ id: part, label: part });
                    });
                }
            }
        });
        return values;
    }

    function conditionMatches(condition) {
        var current = readValues(condition.fieldId);
        var expected = condition.values || [];
        var result;
        if (!expected.length) {
            result = current.length > 0;
        } else {
            var wanted = {};
            expected.forEach(function (v) {
                wanted[normalise(v)] = true;
            });
            result = current.some(function (v) {
                return wanted[normalise(v.id)] || wanted[normalise(v.label)];
            });
        }
        return condition.negate ? !result : result;
    }

    /* ----------------------------------------------------------- show / hide */

    function setNativeValue(control, value) {
        var proto = control.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
        var descriptor = proto && Object.getOwnPropertyDescriptor(proto.prototype, 'value');
        if (descriptor && descriptor.set) {
            descriptor.set.call(control, value);
        } else {
            control.value = value;
        }
    }

    function fire(control, type) {
        var event;
        try {
            event = new window.Event(type, { bubbles: true });
        } catch (e) {
            event = document.createEvent('Event');
            event.initEvent(type, true, true);
        }
        control.dispatchEvent(event);
    }

    function clearField(fieldId) {
        fieldControls(fieldId).forEach(function (control) {
            var type = (control.type || '').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
                if (control.checked) {
                    // a real click keeps Backbone/React state in sync with the DOM
                    control.click();
                }
            } else if (control.tagName === 'SELECT') {
                if (readValues(fieldId).length === 0) {
                    return;
                }
                toArray(control.options).forEach(function (option) {
                    option.selected = VALUE_PLACEHOLDERS[option.value] && !control.multiple;
                });
                if (window.jQuery && window.jQuery.fn && window.jQuery.fn.auiSelect2) {
                    try {
                        window.jQuery(control).auiSelect2('val', control.multiple ? [] : '');
                    } catch (e) {
                        // not a select2 element
                    }
                }
                fire(control, 'change');
            } else if (type !== 'submit' && type !== 'button' && type !== 'file') {
                if (control.value) {
                    setNativeValue(control, '');
                    fire(control, 'input');
                    fire(control, 'change');
                }
            }
        });
    }

    function setVisible(fieldId, visible, clearOnHide) {
        var containers = containersOf(fieldId);
        var wasVisible = false;
        containers.forEach(function (container) {
            if (visible) {
                if (container.classList.contains(HIDDEN_CLASS)) {
                    container.classList.remove(HIDDEN_CLASS);
                    container.removeAttribute('aria-hidden');
                    container.removeAttribute(HIDDEN_ATTR);
                }
            } else if (!container.classList.contains(HIDDEN_CLASS)) {
                wasVisible = true;
                container.classList.add(HIDDEN_CLASS);
                container.setAttribute('aria-hidden', 'true');
                container.setAttribute(HIDDEN_ATTR, fieldId);
            }
        });
        // clear only on the visible -> hidden transition; clearing a hidden field again would loop
        // (a single select without an empty option always reports a value)
        if (!visible && clearOnHide && wasVisible) {
            clearField(fieldId);
        }
        if (containers.length) {
            log(fieldId, visible ? 'shown' : 'hidden', containers);
        }
    }

    /* -------------------------------------------------------------- evaluate */

    function evaluate() {
        timer = null;
        if (!config || !config.rules || !config.rules.length) {
            return;
        }
        var scope = pageScope();
        var rules = config.rules.filter(function (rule) {
            return ruleApplies(rule, scope);
        });
        if (!rules.length) {
            return;
        }

        var rulesByTarget = {};
        rules.forEach(function (rule) {
            rule.show.forEach(function (target) {
                (rulesByTarget[target] = rulesByTarget[target] || []).push(rule);
            });
        });

        var memo = {};
        var stack = {};

        function isVisible(fieldId) {
            if (!rulesByTarget[fieldId]) {
                return true;
            }
            if (Object.prototype.hasOwnProperty.call(memo, fieldId)) {
                return memo[fieldId];
            }
            if (stack[fieldId]) {
                return false; // circular dependency: fail closed
            }
            stack[fieldId] = true;
            var visible = false;
            var candidates = rulesByTarget[fieldId];
            for (var i = 0; i < candidates.length && !visible; i++) {
                var rule = candidates[i];
                visible = isVisible(rule.when.fieldId) && conditionMatches(rule.when);
            }
            delete stack[fieldId];
            memo[fieldId] = visible;
            return visible;
        }

        function clearOnHideFor(fieldId) {
            var candidates = rulesByTarget[fieldId];
            for (var i = 0; i < candidates.length; i++) {
                if (candidates[i].clearOnHide != null) {
                    return !!candidates[i].clearOnHide;
                }
            }
            return config.clearOnHide !== false;
        }

        Object.keys(rulesByTarget).forEach(function (fieldId) {
            setVisible(fieldId, isVisible(fieldId), clearOnHideFor(fieldId));
        });
    }

    function scheduleEvaluate() {
        if (timer !== null) {
            return;
        }
        timer = window.setTimeout(evaluate, DEBOUNCE_MS);
    }

    /* ----------------------------------------------------------------- setup */

    function loadRules(callback) {
        var xhr = new window.XMLHttpRequest();
        xhr.open('GET', contextPath() + REST_PATH, true);
        xhr.setRequestHeader('Accept', 'application/json');
        xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) {
                return;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    config = JSON.parse(xhr.responseText);
                } catch (e) {
                    config = null;
                    log('cannot parse rules', e);
                }
            } else {
                log('cannot load rules, HTTP ' + xhr.status);
            }
            if (callback) {
                callback(config);
            }
        };
        xhr.send(null);
    }

    function install() {
        ['change', 'input', 'click', 'keyup'].forEach(function (type) {
            document.addEventListener(type, scheduleEvaluate, true);
        });
        if (window.MutationObserver) {
            var observer = new window.MutationObserver(scheduleEvaluate);
            observer.observe(document.documentElement, { childList: true, subtree: true });
        } else {
            window.setInterval(scheduleEvaluate, 1000);
        }
        window.addEventListener('popstate', scheduleEvaluate);
        window.addEventListener('hashchange', scheduleEvaluate);
    }

    function start() {
        loadRules(function (loaded) {
            log('rules loaded', loaded);
            install();
            evaluate();
        });
    }

    /**
     * Inventory of the fields currently rendered on the page: id, label, control type and options.
     * Meant to be run from the browser console by the administrator to collect ids for the rules:
     *   console.table(SaaelDynamicFields.listFields())
     */
    function listFields() {
        var byId = {};
        var order = [];
        toArray(document.querySelectorAll('input,select,textarea')).forEach(function (control) {
            if (isAuxiliaryControl(control) || control.type === 'submit' || control.type === 'button') {
                return;
            }
            var fieldId = fieldOf(control);
            if (!fieldId || /^(atl_token|os_|jira\.|sd-)/.test(fieldId)) {
                return;
            }
            // hidden inputs of the form itself (projectId, pid, ...) are not fields a rule can use
            if (control.type === 'hidden' && !/^customfield_/.test(fieldId)) {
                return;
            }
            var entry = byId[fieldId];
            if (!entry) {
                var container = containerOf(control, fieldId);
                var label = container && container.querySelector('label, legend');
                entry = byId[fieldId] = {
                    fieldId: fieldId,
                    label: label ? tidy(label.textContent).replace(/\s*\((необязательно|optional)\)$/i, '') : '',
                    type: control.tagName === 'SELECT' ? (control.multiple ? 'multiselect' : 'select')
                        : (control.type || control.tagName.toLowerCase()),
                    options: []
                };
                order.push(fieldId);
            }
            var type = (control.type || '').toLowerCase();
            if (type === 'checkbox' || type === 'radio') {
                entry.options.push(control.value + ' = ' + tidy(labelOf(control)));
            } else if (control.tagName === 'SELECT') {
                toArray(control.options).forEach(function (option) {
                    if (!VALUE_PLACEHOLDERS[option.value]) {
                        entry.options.push(option.value + ' = ' + tidy(option.text));
                    }
                });
            }
        });
        return order.map(function (fieldId) {
            var entry = byId[fieldId];
            entry.options = entry.options.join(' | ');
            return entry;
        });
    }

    window.SaaelDynamicFields = {
        reload: start,
        evaluate: evaluate,
        getConfig: function () {
            return config;
        },
        readValues: readValues,
        containersOf: containersOf,
        listFields: listFields
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})(window, document);
