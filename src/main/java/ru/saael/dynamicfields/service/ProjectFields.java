package ru.saael.dynamicfields.service;

import com.atlassian.jira.config.ConstantsManager;
import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.jira.issue.customfields.manager.OptionsManager;
import com.atlassian.jira.issue.customfields.option.Option;
import com.atlassian.jira.issue.customfields.option.Options;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.jira.issue.fields.Field;
import com.atlassian.jira.issue.fields.FieldManager;
import com.atlassian.jira.issue.fields.config.FieldConfig;
import com.atlassian.jira.issue.fields.config.FieldConfigScheme;
import com.atlassian.jira.issue.priority.Priority;
import com.atlassian.jira.project.Project;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.node.ArrayNode;
import org.codehaus.jackson.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.saael.dynamicfields.field.PortalFormFields;

import javax.inject.Inject;
import javax.inject.Named;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Fields that already exist in Jira and can be used as a trigger:
 * "when Доступ equals X, show the first dynamic question".
 * Generated answer fields of this plugin are left out.
 */
@Named
public class ProjectFields {

    private static final Logger log = LoggerFactory.getLogger(ProjectFields.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final CustomFieldManager customFieldManager;
    private final OptionsManager optionsManager;
    private final FieldManager fieldManager;
    private final ConstantsManager constantsManager;

    @Inject
    public ProjectFields(@ComponentImport CustomFieldManager customFieldManager,
                         @ComponentImport OptionsManager optionsManager,
                         @ComponentImport FieldManager fieldManager,
                         @ComponentImport ConstantsManager constantsManager) {
        this.customFieldManager = customFieldManager;
        this.optionsManager = optionsManager;
        this.fieldManager = fieldManager;
        this.constantsManager = constantsManager;
    }

    public String toJson() {
        ObjectNode root = MAPPER.createObjectNode();
        ArrayNode fields = root.putArray("fields");
        List<ListedField> list = list();
        for (int i = 0; i < list.size(); i++) {
            ListedField field = list.get(i);
            ObjectNode node = fields.addObject();
            node.put("id", field.getId());
            node.put("name", field.getName());
            node.put("project", field.getProject());
            ArrayNode values = node.putArray("values");
            List<String> options = field.getValues();
            for (int v = 0; v < options.size(); v++) {
                values.add(options.get(v));
            }
        }
        try {
            return MAPPER.writeValueAsString(root);
        } catch (IOException e) {
            log.warn("Cannot write the project field list", e);
            return "{\"fields\":[]}";
        }
    }

    public List<ListedField> list() {
        Map<String, Accumulator> byId = new LinkedHashMap<String, Accumulator>();
        try {
            collectCustomFields(byId);
        } catch (RuntimeException e) {
            log.warn("Cannot list project custom fields", e);
        }
        addSystem(byId, "summary", "Summary");
        addSystem(byId, "description", "Description");
        addPriority(byId);
        List<ListedField> found = new ArrayList<ListedField>();
        for (Accumulator acc : byId.values()) {
            found.add(new ListedField(acc.id, acc.name, projectLabel(acc), new ArrayList<String>(acc.values)));
        }
        Collections.sort(found, new Comparator<ListedField>() {
            @Override
            public int compare(ListedField left, ListedField right) {
                int byName = left.getName().compareToIgnoreCase(right.getName());
                return byName != 0 ? byName : left.getId().compareTo(right.getId());
            }
        });
        return found;
    }

    private void collectCustomFields(Map<String, Accumulator> byId) {
        List<CustomField> all = customFieldManager.getCustomFieldObjects();
        if (all == null) {
            return;
        }
        for (int i = 0; i < all.size(); i++) {
            try {
                absorb(byId, all.get(i));
            } catch (RuntimeException e) {
                log.debug("Skip a custom field while listing project fields", e);
            }
        }
    }

    private void absorb(Map<String, Accumulator> byId, CustomField field) {
        if (field == null || isBlank(field.getId()) || isBlank(field.getName())) {
            return;
        }
        if (field.getCustomFieldType() != null
                && PortalFormFields.TYPE_KEY.equals(field.getCustomFieldType().getKey())) {
            return;
        }
        String description = field.getDescription();
        if (description != null && description.startsWith("sdf:")) {
            return;
        }
        Accumulator acc = byId.get(field.getId());
        if (acc == null) {
            acc = new Accumulator(field.getId(), field.getName().trim());
            byId.put(field.getId(), acc);
        }
        List<FieldConfigScheme> schemes = field.getConfigurationSchemes();
        if (schemes == null) {
            return;
        }
        for (int s = 0; s < schemes.size(); s++) {
            FieldConfigScheme scheme = schemes.get(s);
            if (scheme == null) {
                continue;
            }
            if (scheme.isGlobal() || scheme.isAllProjects()) {
                acc.global = true;
            }
            List<Project> projects = scheme.getAssociatedProjectObjects();
            if (projects != null) {
                for (int p = 0; p < projects.size(); p++) {
                    Project project = projects.get(p);
                    if (project != null && !isBlank(project.getKey())) {
                        acc.projects.add(project.getKey());
                    }
                }
            }
            Map<String, FieldConfig> configs = scheme.getConfigs();
            if (configs == null) {
                continue;
            }
            for (FieldConfig config : configs.values()) {
                if (config == null) {
                    continue;
                }
                Options options = optionsManager.getOptions(config);
                if (options == null) {
                    continue;
                }
                for (int o = 0; o < options.size(); o++) {
                    addOption(acc, options.get(o));
                }
            }
        }
    }

    private static void addOption(Accumulator acc, Option option) {
        if (option == null || Boolean.TRUE.equals(option.getDisabled())) {
            return;
        }
        String value = option.getValue();
        if (value == null) {
            return;
        }
        value = value.trim();
        if (!value.isEmpty()) {
            acc.values.add(value);
        }
    }

    private void addSystem(Map<String, Accumulator> byId, String id, String fallback) {
        if (byId.containsKey(id)) {
            return;
        }
        byId.put(id, new Accumulator(id, fieldName(id, fallback)));
    }

    private void addPriority(Map<String, Accumulator> byId) {
        if (byId.containsKey("priority")) {
            return;
        }
        Accumulator acc = new Accumulator("priority", fieldName("priority", "Priority"));
        try {
            Collection<Priority> priorities = constantsManager.getPriorities();
            if (priorities != null) {
                for (Priority priority : priorities) {
                    if (priority != null && !isBlank(priority.getName())) {
                        acc.values.add(priority.getName().trim());
                    }
                }
            }
        } catch (RuntimeException e) {
            log.debug("Cannot list priorities", e);
        }
        byId.put("priority", acc);
    }

    private String fieldName(String id, String fallback) {
        try {
            Field field = fieldManager.getField(id);
            if (field != null && !isBlank(field.getName())) {
                return field.getName().trim();
            }
        } catch (RuntimeException e) {
            log.debug("Cannot read the name of " + id, e);
        }
        return fallback;
    }

    private static String projectLabel(Accumulator acc) {
        if (acc.global || acc.projects.isEmpty()) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        int shown = 0;
        for (String key : acc.projects) {
            if (shown == 3) {
                break;
            }
            if (shown > 0) {
                builder.append(", ");
            }
            builder.append(key);
            shown++;
        }
        if (acc.projects.size() > 3) {
            builder.append("...");
        }
        return builder.toString();
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static final class Accumulator {
        private final String id;
        private final String name;
        private final LinkedHashSet<String> projects = new LinkedHashSet<String>();
        private final LinkedHashSet<String> values = new LinkedHashSet<String>();
        private boolean global;

        private Accumulator(String id, String name) {
            this.id = id;
            this.name = name;
        }
    }

    public static final class ListedField {
        private final String id;
        private final String name;
        private final String project;
        private final List<String> values;

        public ListedField(String id, String name, String project, List<String> values) {
            this.id = id;
            this.name = name;
            this.project = project == null ? "" : project;
            this.values = values == null ? new ArrayList<String>() : values;
        }

        public String getId() {
            return id;
        }

        public String getName() {
            return name;
        }

        public String getProject() {
            return project;
        }

        public List<String> getValues() {
            return values;
        }
    }
}
