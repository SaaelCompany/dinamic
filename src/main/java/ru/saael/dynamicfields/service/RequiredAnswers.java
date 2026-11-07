package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.Condition;
import ru.saael.dynamicfields.model.FieldAfter;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A required question must have an answer while it is visible.
 * A question hidden by its condition is not required.
 */
public final class RequiredAnswers {

    private RequiredAnswers() {
    }

    public static List<String> missing(RulesConfig form,
                                       Map<String, Map<String, List<String>>> answers,
                                       Map<String, List<String>> portal) {
        List<String> missing = new ArrayList<String>();
        if (form == null || form.getBlocks() == null) {
            return missing;
        }
        for (int b = 0; b < form.getBlocks().size(); b++) {
            FormBlock block = form.getBlocks().get(b);
            if (block == null || block.getFields() == null) {
                continue;
            }
            Map<String, List<String>> values = new HashMap<String, List<String>>();
            if (portal != null) {
                values.putAll(portal);
            }
            Map<String, List<String>> blockAnswers = answers == null || block.getId() == null
                    ? null : answers.get(block.getId());
            if (blockAnswers != null) {
                values.putAll(blockAnswers);
            }
            Map<String, Boolean> visible = new HashMap<String, Boolean>();
            List<FormField> fields = block.getFields();
            for (int i = 0; i < fields.size(); i++) {
                FormField field = fields.get(i);
                if (field == null || field.getId() == null) {
                    continue;
                }
                visible.put(field.getId(), Boolean.valueOf(shown(field, visible, values)));
            }
            for (int i = 0; i < fields.size(); i++) {
                FormField field = fields.get(i);
                if (field == null || field.getId() == null || !field.isRequired()) {
                    continue;
                }
                if (field.getPortalFieldId() != null && field.getPortalFieldId().trim().length() > 0) {
                    continue;
                }
                if (!Boolean.TRUE.equals(visible.get(field.getId()))) {
                    continue;
                }
                if (!hasText(values.get(field.getId()))) {
                    String label = field.getLabel() == null ? "" : field.getLabel().trim();
                    missing.add(label.isEmpty() ? field.getId() : label);
                }
            }
        }
        return missing;
    }

    public static Set<String> portalIds(RulesConfig form) {
        Set<String> ids = new HashSet<String>();
        if (form == null || form.getBlocks() == null) {
            return ids;
        }
        for (int b = 0; b < form.getBlocks().size(); b++) {
            FormBlock block = form.getBlocks().get(b);
            if (block == null || block.getFields() == null) {
                continue;
            }
            for (int i = 0; i < block.getFields().size(); i++) {
                FormField field = block.getFields().get(i);
                if (field != null) {
                    collectPortal(field.getWhen(), ids);
                }
            }
        }
        return ids;
    }

    public static String message(List<String> labels) {
        StringBuilder out = new StringBuilder("Fill in the required question before sending the request");
        if (labels == null || labels.isEmpty()) {
            return out.toString();
        }
        out.append(": ");
        for (int i = 0; i < labels.size(); i++) {
            if (i > 0) {
                out.append(", ");
            }
            out.append(labels.get(i) == null ? "" : labels.get(i));
        }
        return out.toString();
    }

    private static void collectPortal(Condition when, Set<String> ids) {
        if (when == null) {
            return;
        }
        if ("portal".equals(when.getSource()) && when.getFieldId() != null && when.getFieldId().trim().length() > 0) {
            ids.add(when.getFieldId().trim());
        }
        if (when.getAlso() == null) {
            return;
        }
        for (int i = 0; i < when.getAlso().size(); i++) {
            collectPortal(when.getAlso().get(i), ids);
        }
    }

    private static boolean shown(FormField field, Map<String, Boolean> visible, Map<String, List<String>> values) {
        if (!afterShown(field, visible, values)) {
            return false;
        }
        Condition when = field.getWhen();
        if (when == null || when.getFieldId() == null || when.getFieldId().trim().isEmpty()) {
            return true;
        }
        return conditionsHold(when, visible, values);
    }

    private static boolean afterShown(FormField field, Map<String, Boolean> visible, Map<String, List<String>> values) {
        FieldAfter after = field.getAfter();
        if (after == null || after.getFieldId() == null || after.getOption() == null) {
            return true;
        }
        if (!Boolean.TRUE.equals(visible.get(after.getFieldId()))) {
            return false;
        }
        List<String> current = values.get(after.getFieldId());
        if (current == null) {
            return false;
        }
        for (int i = 0; i < current.size(); i++) {
            if (after.getOption().equals(current.get(i))) {
                return true;
            }
        }
        return false;
    }

    private static boolean conditionsHold(Condition when, Map<String, Boolean> visible, Map<String, List<String>> values) {
        List<Condition> also = when.getAlso() == null ? new ArrayList<Condition>() : when.getAlso();
        if ("or".equals(when.getJoin())) {
            if (conditionMatches(when, visible, values)) {
                return true;
            }
            for (int i = 0; i < also.size(); i++) {
                Condition extra = also.get(i);
                if (extra != null && extra.getFieldId() != null && conditionMatches(extra, visible, values)) {
                    return true;
                }
            }
            return false;
        }
        if (!conditionMatches(when, visible, values)) {
            return false;
        }
        for (int i = 0; i < also.size(); i++) {
            Condition extra = also.get(i);
            if (extra != null && extra.getFieldId() != null && !conditionMatches(extra, visible, values)) {
                return false;
            }
        }
        return true;
    }

    private static boolean conditionMatches(Condition when, Map<String, Boolean> visible, Map<String, List<String>> values) {
        if (when == null || when.getFieldId() == null || when.getFieldId().trim().isEmpty()) {
            return true;
        }
        boolean portal = "portal".equals(when.getSource());
        if (!portal && !Boolean.TRUE.equals(visible.get(when.getFieldId()))) {
            return false;
        }
        List<String> current = values.get(when.getFieldId());
        if (current == null) {
            current = new ArrayList<String>();
        }
        List<String> expected = when.getValues() == null ? new ArrayList<String>() : when.getValues();
        boolean match = false;
        if (expected.isEmpty()) {
            for (int i = 0; i < current.size(); i++) {
                String text = portal ? flat(current.get(i)) : trim(current.get(i));
                if (!text.isEmpty()) {
                    match = true;
                }
            }
        } else {
            for (int a = 0; a < current.size(); a++) {
                for (int b = 0; b < expected.size(); b++) {
                    if (portal) {
                        String left = flat(current.get(a));
                        if (!left.isEmpty() && left.equals(flat(expected.get(b)))) {
                            match = true;
                        }
                    } else if (current.get(a) != null && current.get(a).equals(expected.get(b))) {
                        match = true;
                    }
                }
            }
        }
        return when.isNegate() ? !match : match;
    }

    private static boolean hasText(List<String> values) {
        if (values == null) {
            return false;
        }
        for (int i = 0; i < values.size(); i++) {
            if (values.get(i) != null && values.get(i).trim().length() > 0) {
                return true;
            }
        }
        return false;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static String flat(String value) {
        return trim(value).replace('\u00a0', ' ').replaceAll("\\s+", " ");
    }
}
