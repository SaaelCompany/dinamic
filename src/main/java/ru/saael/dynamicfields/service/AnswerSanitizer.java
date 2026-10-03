package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.AnswerRow;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Drops anything the published form does not define: unknown fields, options that do not exist,
 * blank text. Choice values are matched by the option text.
 */
public final class AnswerSanitizer {

    public static final int MAX_TEXT = 2000;

    private AnswerSanitizer() {
    }

    public static Map<String, List<String>> sanitize(RulesConfig form, Map<String, List<String>> raw) {
        Map<String, List<String>> clean = new LinkedHashMap<String, List<String>>();
        if (raw == null || form == null) {
            return clean;
        }
        for (FormField field : form.getFields()) {
            List<String> incoming = raw.get(field.getId());
            if (incoming == null) {
                continue;
            }
            List<String> kept = new ArrayList<String>();
            for (String value : incoming) {
                if (value == null) {
                    continue;
                }
                String trimmed = value.trim();
                if (trimmed.isEmpty()) {
                    continue;
                }
                if (trimmed.length() > MAX_TEXT) {
                    trimmed = trimmed.substring(0, MAX_TEXT);
                }
                if (field.hasOptions()) {
                    if (field.getOptions().contains(trimmed) && !kept.contains(trimmed)) {
                        kept.add(trimmed);
                    }
                } else if (kept.isEmpty()) {
                    kept.add(trimmed);
                }
            }
            if (!kept.isEmpty()) {
                clean.put(field.getId(), kept);
            }
        }
        return clean;
    }

    public static List<AnswerRow> rows(RulesConfig form, Map<String, List<String>> values) {
        List<AnswerRow> rows = new ArrayList<AnswerRow>();
        if (form == null || values == null) {
            return rows;
        }
        for (FormField field : form.getFields()) {
            List<String> selected = values.get(field.getId());
            if (selected == null || selected.isEmpty()) {
                continue;
            }
            StringBuilder text = new StringBuilder();
            for (String value : selected) {
                if (text.length() > 0) {
                    text.append(", ");
                }
                text.append(value);
            }
            rows.add(new AnswerRow(field.getLabel(), text.toString()));
        }
        return rows;
    }
}
