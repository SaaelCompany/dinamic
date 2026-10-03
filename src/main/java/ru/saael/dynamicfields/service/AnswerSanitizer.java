package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.AnswerRow;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Drops anything the published form does not define: unknown blocks, unknown fields, options
 * that do not exist, blank text. Choice values are matched by the option text.
 */
public final class AnswerSanitizer {

    public static final int MAX_TEXT = 2000;

    private AnswerSanitizer() {
    }

    /**
     * @param rawBlocks block id → field id → values, or {@code null} when the caller sent the legacy flat map
     * @param legacy   flat field id → values from plugin 2.0; ignored when {@code rawBlocks} is not null
     */
    public static Map<String, Map<String, List<String>>> sanitize(RulesConfig form,
                                                                  Map<String, Map<String, List<String>>> rawBlocks,
                                                                  Map<String, List<String>> legacy) {
        Map<String, Map<String, List<String>>> clean = new LinkedHashMap<String, Map<String, List<String>>>();
        if (form == null || form.getBlocks() == null) {
            return clean;
        }
        boolean namespaced = rawBlocks != null;
        for (FormBlock block : form.getBlocks()) {
            if (block == null || isBlank(block.getId())) {
                continue;
            }
            Map<String, List<String>> incoming;
            if (namespaced) {
                incoming = rawBlocks.get(block.getId());
            } else {
                incoming = legacy;
            }
            Map<String, List<String>> kept = sanitizeFields(block.getFields(), incoming);
            if (!kept.isEmpty()) {
                clean.put(block.getId(), kept);
            }
        }
        return clean;
    }

    public static List<AnswerRow> rows(RulesConfig form, Map<String, Map<String, List<String>>> blocks) {
        List<AnswerRow> rows = new ArrayList<AnswerRow>();
        if (form == null || form.getBlocks() == null || blocks == null) {
            return rows;
        }
        for (FormBlock block : form.getBlocks()) {
            if (block == null) {
                continue;
            }
            Map<String, List<String>> values = blocks.get(block.getId());
            if (values == null) {
                continue;
            }
            String group = block.getTitle() == null ? "" : block.getTitle().trim();
            List<FormField> fields = block.getFields() == null ? Collections.<FormField>emptyList() : block.getFields();
            for (FormField field : fields) {
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
                AnswerRow row = new AnswerRow(field.getLabel(), text.toString());
                row.setFieldId(field.getId());
                if (!group.isEmpty()) {
                    row.setGroup(group);
                }
                rows.add(row);
            }
        }
        return rows;
    }

    private static Map<String, List<String>> sanitizeFields(List<FormField> fields, Map<String, List<String>> raw) {
        Map<String, List<String>> clean = new LinkedHashMap<String, List<String>>();
        if (raw == null || fields == null) {
            return clean;
        }
        for (FormField field : fields) {
            if (field == null || isBlank(field.getId())) {
                continue;
            }
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
                    if (field.getOptions() != null && field.getOptions().contains(trimmed) && !kept.contains(trimmed)) {
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

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
