/* Portal Dynamic Fields - administration page */
AJS.toInit(function ($) {
    'use strict';

    var form = $('#sdf-form');
    if (!form.length) {
        return;
    }

    var REST = (form.data('context-path') || AJS.contextPath() || '') + '/rest/dynamic-fields/1.0/rules';
    var editor = $('#sdf-rules');
    var messages = $('#sdf-messages');
    var buttons = $('#sdf-save, #sdf-validate, #sdf-format, #sdf-example, #sdf-reload');

    // literal keys only: the jsI18n web-resource transformer rewrites these calls at serve time
    var MSG = {
        invalid: AJS.I18n.getText('ru.saael.dynamicfields.admin.invalid'),
        valid: AJS.I18n.getText('ru.saael.dynamicfields.admin.valid'),
        saved: AJS.I18n.getText('ru.saael.dynamicfields.admin.saved'),
        exampleConfirm: AJS.I18n.getText('ru.saael.dynamicfields.admin.example.confirm'),
        requestFailed: AJS.I18n.getText('ru.saael.dynamicfields.admin.error.request'),
        rulesCount: function (count) {
            return AJS.I18n.getText('ru.saael.dynamicfields.admin.rules.count', count);
        }
    };

    function clearMessages() {
        messages.empty();
    }

    function showMessage(type, title, items) {
        clearMessages();
        var box = $('<div class="aui-message"></div>').addClass('aui-message-' + type);
        box.append($('<p class="title"></p>').append($('<strong></strong>').text(title)));
        if (items && items.length) {
            var list = $('<ul class="sdf-errors"></ul>');
            $.each(items, function (i, item) {
                list.append($('<li></li>').text(item));
            });
            box.append(list);
        }
        messages.append(box);
    }

    function flag(type, title) {
        if (AJS.flag) {
            AJS.flag({ type: type, title: title, close: 'auto' });
        }
    }

    function parseLocally() {
        try {
            return { value: JSON.parse(editor.val()) };
        } catch (e) {
            return { error: 'Invalid JSON: ' + e.message };
        }
    }

    function format() {
        var parsed = parseLocally();
        if (parsed.error) {
            showMessage('error', MSG.invalid, [parsed.error]);
            return false;
        }
        editor.val(JSON.stringify(parsed.value, null, 2));
        return true;
    }

    function updateCount(config) {
        var count = config && config.rules ? config.rules.length : 0;
        $('#sdf-rules-count').text(MSG.rulesCount(count));
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

    function send(method, url, body, onSuccess) {
        busy(true);
        $.ajax({
            type: method,
            url: url,
            data: body,
            contentType: 'application/json; charset=utf-8',
            dataType: 'text',
            headers: { 'X-Atlassian-Token': 'no-check' }
        }).done(function (response) {
            onSuccess(response);
        }).fail(function (xhr) {
            showMessage('error', MSG.invalid, errorsOf(xhr));
        }).always(function () {
            busy(false);
        });
    }

    $('#sdf-format').on('click', function () {
        if (format()) {
            clearMessages();
        }
    });

    $('#sdf-validate').on('click', function () {
        var parsed = parseLocally();
        if (parsed.error) {
            showMessage('error', MSG.invalid, [parsed.error]);
            return;
        }
        send('POST', REST + '/validate', editor.val(), function () {
            showMessage('success', MSG.valid);
        });
    });

    $('#sdf-save').on('click', function () {
        var parsed = parseLocally();
        if (parsed.error) {
            showMessage('error', MSG.invalid, [parsed.error]);
            return;
        }
        send('PUT', REST, editor.val(), function (stored) {
            editor.val(stored);
            try {
                updateCount(JSON.parse(stored));
            } catch (e) {
                // keep the old counter
            }
            showMessage('success', MSG.saved);
            flag('success', MSG.saved);
        });
    });

    $('#sdf-example').on('click', function () {
        if (editor.val().replace(/\s/g, '') !== '' && !window.confirm(MSG.exampleConfirm)) {
            return;
        }
        busy(true);
        $.ajax({ type: 'GET', url: REST + '/example', dataType: 'text' })
            .done(function (example) {
                editor.val(example);
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
        $.ajax({ type: 'GET', url: REST, dataType: 'text', cache: false })
            .done(function (stored) {
                editor.val(stored);
                try {
                    updateCount(JSON.parse(stored));
                } catch (e) {
                    // ignore
                }
                clearMessages();
            })
            .fail(function (xhr) {
                showMessage('error', MSG.requestFailed, errorsOf(xhr));
            })
            .always(function () {
                busy(false);
            });
    });

    // Tab inserts two spaces instead of leaving the editor
    editor.on('keydown', function (e) {
        if (e.key === 'Tab' || e.keyCode === 9) {
            e.preventDefault();
            var el = this;
            var start = el.selectionStart;
            var end = el.selectionEnd;
            el.value = el.value.substring(0, start) + '  ' + el.value.substring(end);
            el.selectionStart = el.selectionEnd = start + 2;
        }
    });
});
