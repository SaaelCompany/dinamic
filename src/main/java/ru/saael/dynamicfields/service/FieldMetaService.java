package ru.saael.dynamicfields.service;

import com.atlassian.jira.issue.customfields.manager.OptionsManager;
import com.atlassian.jira.issue.customfields.option.Option;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.jira.issue.fields.config.FieldConfig;
import com.atlassian.jira.issue.fields.config.FieldConfigScheme;
import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.saael.dynamicfields.model.FieldMeta;

import javax.inject.Inject;
import javax.inject.Named;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Collects the fields (and their options) the visual rule builder can offer.
 */
@Named
public class FieldMetaService {

    private static final Logger log = LoggerFactory.getLogger(FieldMetaService.class);

    private final CustomFieldManager customFieldManager;
    private final OptionsManager optionsManager;

    @Inject
    public FieldMetaService(@ComponentImport CustomFieldManager customFieldManager,
                            @ComponentImport OptionsManager optionsManager) {
        this.customFieldManager = customFieldManager;
        this.optionsManager = optionsManager;
    }

    public List<FieldMeta> allFields() {
        List<FieldMeta> result = new ArrayList<FieldMeta>();
        List<CustomField> customFields = new ArrayList<CustomField>(customFieldManager.getCustomFieldObjects());
        customFields.sort(new Comparator<CustomField>() {
            @Override
            public int compare(CustomField a, CustomField b) {
                return a.getName().compareToIgnoreCase(b.getName());
            }
        });
        for (CustomField customField : customFields) {
            String type = mapType(customField.getCustomFieldType().getKey());
            FieldMeta meta = new FieldMeta(customField.getId(), customField.getName(), type, true);
            if (hasOptions(type)) {
                collectOptions(customField, meta);
            }
            result.add(meta);
        }
        // the system fields a portal form can contain
        result.add(new FieldMeta("summary", "Summary", "text", false));
        result.add(new FieldMeta("description", "Description", "textarea", false));
        result.add(new FieldMeta("priority", "Priority", "select", false));
        result.add(new FieldMeta("duedate", "Due date", "date", false));
        result.add(new FieldMeta("labels", "Labels", "other", false));
        result.add(new FieldMeta("components", "Component/s", "multiselect", false));
        result.add(new FieldMeta("attachment", "Attachment", "other", false));
        return result;
    }

    private void collectOptions(CustomField customField, FieldMeta meta) {
        Set<String> seen = new HashSet<String>();
        try {
            for (FieldConfigScheme scheme : customField.getConfigurationSchemes()) {
                Map<String, FieldConfig> configs = scheme.getConfigs();
                if (configs == null) {
                    continue;
                }
                for (FieldConfig config : configs.values()) {
                    if (config == null || optionsManager.getOptions(config) == null) {
                        continue;
                    }
                    for (Option option : optionsManager.getOptions(config).getRootOptions()) {
                        addOption(meta, seen, option);
                    }
                }
            }
        } catch (RuntimeException e) {
            log.debug("Cannot read options of {}", customField.getId(), e);
        }
    }

    private static void addOption(FieldMeta meta, Set<String> seen, Option option) {
        if (option == null || Boolean.TRUE.equals(option.getDisabled())) {
            return;
        }
        String id = String.valueOf(option.getOptionId());
        if (seen.add(id)) {
            meta.getOptions().add(new FieldMeta.OptionMeta(id, option.getValue()));
        }
    }

    static String mapType(String typeKey) {
        String key = typeKey == null ? "" : typeKey.substring(typeKey.lastIndexOf(':') + 1);
        if (key.equals("multicheckboxes")) {
            return "checkbox";
        }
        if (key.equals("radiobuttons")) {
            return "radio";
        }
        if (key.equals("select")) {
            return "select";
        }
        if (key.equals("multiselect") || key.equals("multiversion") || key.equals("version")) {
            return "multiselect";
        }
        if (key.equals("cascadingselect")) {
            return "cascading";
        }
        if (key.equals("textfield") || key.equals("url") || key.equals("readonlyfield")) {
            return "text";
        }
        if (key.equals("textarea")) {
            return "textarea";
        }
        if (key.equals("float") || key.equals("importid")) {
            return "number";
        }
        if (key.equals("datepicker") || key.equals("datetime")) {
            return "date";
        }
        if (key.equals("userpicker") || key.equals("multiuserpicker")) {
            return "user";
        }
        return "other";
    }

    private static boolean hasOptions(String type) {
        return type.equals("checkbox") || type.equals("radio") || type.equals("select")
                || type.equals("multiselect") || type.equals("cascading");
    }
}
