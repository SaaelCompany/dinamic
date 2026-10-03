package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.Condition;
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
 * Structural validation of portal blocks. A field may depend only on a field listed above it
 * in the same block, which makes cycles impossible. Field ids are unique inside one block.
 */
public final class RulesValidator {

    private static final Pattern FIELD_ID = Pattern.compile("^[A-Za-z][A-Za-z0-9_-]{0,40}$");
    private static final List<String> TYPES = Arrays.asList(
            FormField.CHECKBOX, FormField.RADIO, FormField.SELECT, FormField.TEXT, FormField.TEXTAREA);
    private static final List<String> PLACES = Arrays.asList("end", "start", "after");

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
            if (isBlank(field.getLabel())) {
                errors.add(label + ": name is required");
            }
            if (!TYPES.contains(field.getType())) {
                errors.add(label + ": unknown type \"" + field.getType() + "\"");
            } else if (field.hasOptions()) {
                if (field.getOptions() == null || field.getOptions().isEmpty()) {
                    errors.add(label + ": add at least one option");
                }
                Set<String> options = new HashSet<String>();
                List<String> declared = field.getOptions() == null ? new ArrayList<String>() : field.getOptions();
                for (String option : declared) {
                    if (isBlank(option)) {
                        errors.add(label + ": an option is empty");
                    } else if (!options.add(option)) {
                        errors.add(label + ": duplicate option \"" + option + "\"");
                    }
                }
            }
            Condition when = field.getWhen();
            if (when != null) {
                if (isBlank(when.getFieldId())) {
                    errors.add(label + ": \"when.fieldId\" is required");
                } else if (when.getFieldId().equals(field.getId())) {
                    errors.add(label + ": a field cannot depend on itself");
                } else if (!earlier.contains(when.getFieldId())) {
                    errors.add(label + ": condition refers to unknown or later field \"" + when.getFieldId() + "\"");
                }
            }
            if (!isBlank(field.getId())) {
                earlier.add(field.getId());
            }
        }
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
