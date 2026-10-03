package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.Condition;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * One plugin custom field is one block in the admin page.
 * Fields the administrator creates in Jira appear here; fields removed in Jira disappear.
 */
public final class FieldCatalogSync {

    private FieldCatalogSync() {
    }

    public static final class OwnedField {
        private final String id;
        private final String name;

        public OwnedField(String id, String name) {
            this.id = id;
            this.name = name == null ? "" : name;
        }

        public String getId() {
            return id;
        }

        public String getName() {
            return name;
        }
    }

    public static void align(RulesConfig config, List<OwnedField> fields) {
        if (config.getBlocks() == null) {
            config.setBlocks(new ArrayList<FormBlock>());
        }
        List<FormBlock> source = new ArrayList<FormBlock>(config.getBlocks());
        boolean[] used = new boolean[source.size()];
        List<FormBlock> aligned = new ArrayList<FormBlock>();
        List<OwnedField> live = fields == null ? new ArrayList<OwnedField>() : fields;
        for (int f = 0; f < live.size(); f++) {
            OwnedField field = live.get(f);
            if (field == null || isBlank(field.getId())) {
                continue;
            }
            String fieldId = field.getId().trim();
            int index = find(source, used, fieldId);
            FormBlock block;
            if (index >= 0) {
                used[index] = true;
                block = source.get(index);
            } else if (isOldest(field, live)) {
                index = findOrphan(source, used);
                if (index >= 0) {
                    used[index] = true;
                    block = source.get(index);
                    block.setCustomFieldId(fieldId);
                } else {
                    block = emptyBlock(fieldId, aligned);
                }
            } else {
                block = emptyBlock(fieldId, aligned);
            }
            block.setCustomFieldName(field.getName());
            if (isBlank(block.getId())) {
                block.setId(freshId(fieldId, aligned));
            }
            if (block.getFields() == null) {
                block.setFields(new ArrayList<FormField>());
            }
            aligned.add(block);
        }
        FormBlock home = oldestBlock(aligned, live);
        if (home != null) {
            for (int i = 0; i < source.size(); i++) {
                if (used[i] || source.get(i) == null || !isBlank(source.get(i).getCustomFieldId())) {
                    continue;
                }
                absorb(home, source.get(i));
            }
        }
        config.setBlocks(aligned);
    }

    private static FormBlock emptyBlock(String fieldId, List<FormBlock> aligned) {
        FormBlock block = new FormBlock();
        block.setId(freshId(fieldId, aligned));
        block.setCustomFieldId(fieldId);
        block.setTitle("");
        block.setFields(new ArrayList<FormField>());
        return block;
    }

    /**
     * Questions saved before a field was chosen stay on the oldest plugin field.
     * A field created later always starts empty.
     */
    private static boolean isOldest(OwnedField field, List<OwnedField> live) {
        long id = numericId(field.getId());
        for (int i = 0; i < live.size(); i++) {
            OwnedField other = live.get(i);
            if (other == null || isBlank(other.getId()) || other == field) {
                continue;
            }
            if (numericId(other.getId()) < id) {
                return false;
            }
        }
        return true;
    }

    private static FormBlock oldestBlock(List<FormBlock> aligned, List<OwnedField> live) {
        OwnedField oldest = null;
        for (int i = 0; i < live.size(); i++) {
            OwnedField field = live.get(i);
            if (field == null || isBlank(field.getId())) {
                continue;
            }
            if (oldest == null || numericId(field.getId()) < numericId(oldest.getId())) {
                oldest = field;
            }
        }
        if (oldest == null) {
            return null;
        }
        String id = oldest.getId().trim();
        for (int i = 0; i < aligned.size(); i++) {
            FormBlock block = aligned.get(i);
            if (block != null && id.equals(trim(block.getCustomFieldId()))) {
                return block;
            }
        }
        return null;
    }

    private static long numericId(String customFieldId) {
        String raw = customFieldId == null ? "" : customFieldId.trim();
        if (raw.startsWith("customfield_")) {
            raw = raw.substring("customfield_".length());
        }
        try {
            return Long.parseLong(raw);
        } catch (NumberFormatException e) {
            return Long.MAX_VALUE;
        }
    }

    private static int find(List<FormBlock> source, boolean[] used, String customFieldId) {
        for (int i = 0; i < source.size(); i++) {
            if (used[i] || source.get(i) == null) {
                continue;
            }
            if (customFieldId.equals(trim(source.get(i).getCustomFieldId()))) {
                return i;
            }
        }
        return -1;
    }

    private static int findOrphan(List<FormBlock> source, boolean[] used) {
        for (int i = 0; i < source.size(); i++) {
            if (used[i] || source.get(i) == null) {
                continue;
            }
            if (isBlank(source.get(i).getCustomFieldId())) {
                return i;
            }
        }
        return -1;
    }

    private static void absorb(FormBlock target, FormBlock extra) {
        if (extra.getFields() == null) {
            return;
        }
        if (target.getFields() == null) {
            target.setFields(new ArrayList<FormField>());
        }
        Set<String> taken = new HashSet<String>();
        for (int i = 0; i < target.getFields().size(); i++) {
            FormField field = target.getFields().get(i);
            if (field != null && !isBlank(field.getId())) {
                taken.add(field.getId());
            }
        }
        String prefix = isBlank(extra.getId()) ? "extra" : extra.getId().trim();
        for (int i = 0; i < extra.getFields().size(); i++) {
            FormField field = extra.getFields().get(i);
            if (field == null || isBlank(field.getId())) {
                continue;
            }
            if (taken.contains(field.getId())) {
                String renamed = unique(prefix + "_" + field.getId(), taken);
                retarget(extra.getFields(), field.getId(), renamed);
                field.setId(renamed);
            }
            taken.add(field.getId());
            target.getFields().add(field);
        }
    }

    private static void retarget(List<FormField> fields, String from, String to) {
        for (int i = 0; i < fields.size(); i++) {
            FormField field = fields.get(i);
            if (field == null) {
                continue;
            }
            Condition when = field.getWhen();
            if (when != null && from.equals(when.getFieldId())) {
                when.setFieldId(to);
            }
        }
    }

    private static String freshId(String customFieldId, List<FormBlock> aligned) {
        String raw = customFieldId.startsWith("customfield_")
                ? "f" + customFieldId.substring("customfield_".length())
                : "f" + customFieldId;
        Set<String> taken = new HashSet<String>();
        for (int i = 0; i < aligned.size(); i++) {
            if (aligned.get(i) != null && aligned.get(i).getId() != null) {
                taken.add(aligned.get(i).getId());
            }
        }
        return unique(raw, taken);
    }

    private static String unique(String base, Set<String> taken) {
        String id = base;
        int n = 2;
        while (taken.contains(id)) {
            id = base + n;
            n++;
        }
        return id;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
