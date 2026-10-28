package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.Condition;
import ru.saael.dynamicfields.model.FieldAfter;
import ru.saael.dynamicfields.model.FieldAmong;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Structural validation of portal blocks. A question may depend on a question listed above it
 * in the same block, which makes cycles impossible, or on a field that already exists in Jira.
 * Field ids are unique inside one block.
 */
public final class RulesValidator {

    private static final Pattern FIELD_ID = Pattern.compile("^[A-Za-z][A-Za-z0-9_-]{0,40}$");
    /** Jira custom field id, or a short system field id such as priority. */
    private static final Pattern PROJECT_FIELD_ID = Pattern.compile(
            "^(?:customfield_\\d+|[A-Za-z][A-Za-z0-9_]{0,40})$");
    private static final List<String> TYPES = Arrays.asList(
            FormField.CHECKBOX, FormField.RADIO, FormField.SELECT, FormField.MULTISELECT,
            FormField.TEXT, FormField.TEXTAREA, FormField.NUMBER,
            FormField.DATE, FormField.TIME, FormField.DATETIME, FormField.URL);
    private static final List<String> PLACES = Arrays.asList("end", "start", "after");
    private static final int HELP_LIMIT = 2000;

    private RulesValidator() {
    }

    public static List<String> validate(RulesConfig config) {
        List<String> errors = new ArrayList<String>();
        if (config == null) {
            errors.add("Configuration is empty");
            return errors;
        }
        if (config.getVersion() != RulesConfig.CURRENT_VERSION) {
            errors.add("Unsupported \"version\": " + config.getVersion()
                    + " (expected " + RulesConfig.CURRENT_VERSION + ")");
        }
        Set<String> blockIds = new HashSet<String>();
        List<FormBlock> blocks = config.getBlocks() == null ? new ArrayList<FormBlock>() : config.getBlocks();
        for (int b = 0; b < blocks.size(); b++) {
            FormBlock block = blocks.get(b);
            String blockName = blockName(block, b);
            if (block == null) {
                errors.add(blockName + ": block is empty");
                continue;
            }
            if (isBlank(block.getId())) {
                errors.add(blockName + ": \"id\" is required");
            } else if (!FIELD_ID.matcher(block.getId()).matches()) {
                errors.add(blockName + ": \"id\" has invalid format: \"" + block.getId() + "\"");
            } else if (!blockIds.add(block.getId())) {
                errors.add(blockName + ": duplicate id \"" + block.getId() + "\"");
            }
            String place = block.getPlace() == null || block.getPlace().trim().isEmpty() ? "end" : block.getPlace().trim();
            if (!PLACES.contains(place)) {
                errors.add(blockName + ": unknown place \"" + place + "\"");
            } else if ("after".equals(place) && isBlank(block.getPlaceAfter())) {
                errors.add(blockName + ": name the field the block should follow");
            }
            validateFields(block.getFields(), errors);
            List<Long> typeIds = block.getRequestTypeIds();
            if (typeIds == null) {
                continue;
            }
            for (Long requestTypeId : typeIds) {
                if (requestTypeId == null || requestTypeId <= 0) {
                    errors.add(blockName + ": \"requestTypeIds\" must contain positive numbers only");
                    break;
                }
            }
        }
        return errors;
    }

    private static void validateFields(List<FormField> fields, List<String> errors) {
        Set<String> ids = new HashSet<String>();
        List<String> earlier = new ArrayList<String>();
        List<FormField> list = fields == null ? new ArrayList<FormField>() : fields;
        for (int i = 0; i < list.size(); i++) {
            FormField field = list.get(i);
            String label = fieldLabel(field, i);
            if (field == null) {
                errors.add(label + ": field is empty");
                continue;
            }
            if (isBlank(field.getId())) {
                errors.add(label + ": \"id\" is required");
            } else if (!FIELD_ID.matcher(field.getId()).matches()) {
                errors.add(label + ": \"id\" has invalid format: \"" + field.getId() + "\"");
            } else if (!ids.add(field.getId())) {
                errors.add(label + ": duplicate id \"" + field.getId() + "\"");
            }
            if (isBlank(field.getLabel()) && (field.getType() == null || !field.hasOptions())) {
                errors.add(label + ": name is required");
            }
            if (field.getHelp() != null && field.getHelp().length() > HELP_LIMIT) {
                errors.add(label + ": help text is longer than " + HELP_LIMIT + " characters");
            }
            if (!TYPES.contains(field.getType())) {
                errors.add(label + ": unknown type \"" + field.getType() + "\"");
            } else if (field.hasOptions()) {
                if (field.getOptions() == null || field.getOptions().isEmpty()) {
                    errors.add(label + ": add at least one option");
                }
                Set<String> options = new HashSet<String>();
                List<String> declared = field.getOptions() == null ? new ArrayList<String>() : field.getOptions();
                List<String> nests = field.getNests() == null ? new ArrayList<String>() : field.getNests();
                for (int o = 0; o < declared.size(); o++) {
                    String option = declared.get(o);
                    String nest = o < nests.size() && nests.get(o) != null ? nests.get(o).trim() : "";
                    if (!nest.isEmpty()) {
                        continue;
                    }
                    if (isBlank(option)) {
                        errors.add(label + ": an option is empty");
                    } else if (!options.add(option)) {
                        errors.add(label + ": duplicate option \"" + option + "\"");
                    }
                }
            }
            checkNests(errors, label, field, list);
            checkCondition(errors, label, field.getWhen(), field.getId(), earlier, "when");
            checkAfter(errors, label, field.getAfter(), field.getId(), list, i);
            checkAmong(errors, label, field, list, i);
            if (!isBlank(field.getId())) {
                earlier.add(field.getId());
            }
        }
    }

    private static void checkNests(List<String> errors, String label, FormField field, List<FormField> fields) {
        List<String> nests = field.getNests();
        if (nests == null || nests.isEmpty()) {
            return;
        }
        boolean host = FormField.CHECKBOX.equals(field.getType()) || FormField.RADIO.equals(field.getType());
        List<String> options = field.getOptions() == null ? new ArrayList<String>() : field.getOptions();
        Set<String> usedHere = new HashSet<String>();
        for (int i = 0; i < nests.size() && i < options.size(); i++) {
            String nest = nests.get(i) == null ? "" : nests.get(i).trim();
            if (nest.isEmpty()) {
                continue;
            }
            if (!host) {
                errors.add(label + ": a nested field can sit only among checkbox or radio rows");
                return;
            }
            if (nest.equals(field.getId())) {
                errors.add(label + ": a field cannot be nested into itself");
                continue;
            }
            if (!usedHere.add(nest)) {
                errors.add(label + ": field \"" + nest + "\" is nested more than once");
            }
            if (fieldById(fields, nest) == null) {
                errors.add(label + ": nested field \"" + nest + "\" is not in this block");
                continue;
            }
            if (reaches(fields, nest, field.getId(), new HashSet<String>())) {
                errors.add(label + ": fields cannot nest each other");
            }
            if (nestedElsewhere(fields, field.getId(), nest)) {
                errors.add(label + ": field \"" + nest + "\" is already nested in another field");
            }
        }
    }

    private static boolean nestedElsewhere(List<FormField> fields, String ownerId, String childId) {
        for (int i = 0; i < fields.size(); i++) {
            FormField other = fields.get(i);
            if (other == null || ownerId.equals(other.getId()) || other.getNests() == null) {
                continue;
            }
            for (int n = 0; n < other.getNests().size(); n++) {
                String nest = other.getNests().get(n);
                if (nest != null && childId.equals(nest.trim())) {
                    return true;
                }
            }
        }
        return false;
    }

    private static boolean reaches(List<FormField> fields, String from, String target, Set<String> seen) {
        if (from == null || !seen.add(from)) {
            return false;
        }
        FormField field = fieldById(fields, from);
        if (field == null || field.getNests() == null) {
            return false;
        }
        for (int i = 0; i < field.getNests().size(); i++) {
            String nest = field.getNests().get(i);
            if (nest == null || nest.trim().isEmpty()) {
                continue;
            }
            String id = nest.trim();
            if (id.equals(target) || reaches(fields, id, target, seen)) {
                return true;
            }
        }
        return false;
    }

    private static FormField fieldById(List<FormField> fields, String id) {
        for (int i = 0; i < fields.size(); i++) {
            FormField field = fields.get(i);
            if (field != null && id.equals(field.getId())) {
                return field;
            }
        }
        return null;
    }

    private static void checkCondition(List<String> errors, String label, Condition when, String selfId,
            List<String> earlier, String path) {
        if (when == null) {
            return;
        }
        if (isBlank(when.getFieldId())) {
            errors.add(label + ": \"" + path + ".fieldId\" is required");
        } else if (when.getFieldId().equals(selfId)) {
            errors.add(label + ": a field cannot depend on itself");
        } else if ("portal".equals(when.getSource())) {
            if (!PROJECT_FIELD_ID.matcher(when.getFieldId()).matches()) {
                errors.add(label + ": project field \"" + when.getFieldId() + "\" is not a Jira field");
            }
        } else if (!earlier.contains(when.getFieldId())) {
            errors.add(label + ": condition refers to unknown or later field \"" + when.getFieldId() + "\"");
        }
        if (when.getAlso() == null) {
            return;
        }
        for (int i = 0; i < when.getAlso().size(); i++) {
            checkCondition(errors, label, when.getAlso().get(i), selfId, earlier, path + ".also[" + i + "]");
        }
    }

    private static void checkAfter(List<String> errors, String label, FieldAfter after, String selfId,
            List<FormField> fields, int index) {
        if (after == null) {
            return;
        }
        if (isBlank(after.getFieldId())) {
            errors.add(label + ": \"after.fieldId\" is required");
            return;
        }
        if (after.getFieldId().equals(selfId)) {
            errors.add(label + ": a field cannot be placed after itself");
            return;
        }
        FormField host = null;
        for (int i = 0; i < index; i++) {
            FormField candidate = fields.get(i);
            if (candidate != null && after.getFieldId().equals(candidate.getId())) {
                host = candidate;
            }
        }
        if (host == null) {
            errors.add(label + ": placement refers to unknown or later field \"" + after.getFieldId() + "\"");
            return;
        }
        if (!FormField.CHECKBOX.equals(host.getType()) && !FormField.RADIO.equals(host.getType())) {
            errors.add(label + ": a question can sit between the rows of a checkbox or radio field only");
            return;
        }
        if (isBlank(after.getOption())) {
            errors.add(label + ": \"after.option\" is required");
            return;
        }
        boolean found = false;
        if (host.getOptions() != null) {
            for (String option : host.getOptions()) {
                if (after.getOption().equals(option)) {
                    found = true;
                }
            }
        }
        if (!found) {
            errors.add(label + ": placement option \"" + after.getOption() + "\" is not on the field");
        }
    }

    private static void checkAmong(List<String> errors, String label, FormField field, List<FormField> fields, int index) {
        FieldAmong among = field.getAmong();
        if (among == null) {
            return;
        }
        if (isBlank(among.getFieldId())) {
            errors.add(label + ": \"among.fieldId\" is required");
            return;
        }
        if (among.getFieldId().equals(field.getId())) {
            errors.add(label + ": a field cannot sit inside itself");
            return;
        }
        FormField host = null;
        for (int i = 0; i < index; i++) {
            FormField candidate = fields.get(i);
            if (candidate != null && among.getFieldId().equals(candidate.getId())) {
                host = candidate;
            }
        }
        if (host == null) {
            errors.add(label + ": position refers to unknown or later field \"" + among.getFieldId() + "\"");
            return;
        }
        if (!FormField.CHECKBOX.equals(host.getType()) && !FormField.RADIO.equals(host.getType())) {
            errors.add(label + ": a question can sit between the rows of a checkbox or radio field only");
            return;
        }
        if (!among.isBefore()) {
            if (isBlank(among.getOption())) {
                errors.add(label + ": \"among.option\" is required");
                return;
            }
            boolean found = false;
            if (host.getOptions() != null) {
                for (String option : host.getOptions()) {
                    if (among.getOption().equals(option)) {
                        found = true;
                    }
                }
            }
            if (!found) {
                errors.add(label + ": position option \"" + among.getOption() + "\" is not on the field");
            }
        }
        if (amongReaches(fields, host.getId(), field.getId(), new HashSet<String>())) {
            errors.add(label + ": fields cannot sit inside each other");
        }
    }

    private static boolean amongReaches(List<FormField> fields, String from, String target, Set<String> seen) {
        if (from == null || !seen.add(from)) {
            return false;
        }
        FormField field = fieldById(fields, from);
        if (field == null || field.getAmong() == null || isBlank(field.getAmong().getFieldId())) {
            return false;
        }
        String id = field.getAmong().getFieldId().trim();
        return id.equals(target) || amongReaches(fields, id, target, seen);
    }

    private static String blockName(FormBlock block, int index) {
        if (block != null && !isBlank(block.getTitle())) {
            return "Block \"" + block.getTitle() + "\"";
        }
        if (block != null && !isBlank(block.getId())) {
            return "Block \"" + block.getId() + "\"";
        }
        return "Block #" + (index + 1);
    }

    private static String fieldLabel(FormField field, int index) {
        if (field != null && !isBlank(field.getLabel())) {
            return "Field \"" + field.getLabel() + "\"";
        }
        return "Field #" + (index + 1);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
