package ru.saael.dynamicfields.service;

import com.atlassian.event.api.EventPublisher;
import com.atlassian.jira.event.issue.IssueEvent;
import com.atlassian.jira.event.type.EventDispatchOption;
import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.jira.issue.Issue;
import com.atlassian.jira.issue.IssueManager;
import com.atlassian.jira.issue.context.GlobalIssueContext;
import com.atlassian.jira.issue.context.JiraContextNode;
import com.atlassian.jira.issue.customfields.CustomFieldSearcher;
import com.atlassian.jira.issue.customfields.CustomFieldType;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.jira.issue.fields.FieldManager;
import com.atlassian.jira.issue.index.IssueIndexingService;
import com.atlassian.jira.issue.issuetype.IssueType;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import org.ofbiz.core.entity.GenericEntityException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import javax.inject.Inject;
import javax.inject.Named;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Turns each portal question into a Jira text field named after the question,
 * then copies the customer's answer into that field.
 */
@Named
public class IssueFieldSync {

    private static final Logger log = LoggerFactory.getLogger(IssueFieldSync.class);

    static final String TYPE_KEY = "com.atlassian.jira.plugin.system.customfieldtypes:textarea";
    static final String SEARCHER_KEY = "com.atlassian.jira.plugin.system.customfieldtypes:textsearcher";

    private final CustomFieldManager customFieldManager;
    private final FieldManager fieldManager;
    private final IssueManager issueManager;
    private final IssueIndexingService indexingService;
    private final EventPublisher eventPublisher;

    @Inject
    public IssueFieldSync(@ComponentImport CustomFieldManager customFieldManager,
                          @ComponentImport FieldManager fieldManager,
                          @ComponentImport IssueManager issueManager,
                          @ComponentImport IssueIndexingService indexingService,
                          @ComponentImport EventPublisher eventPublisher) {
        this.customFieldManager = customFieldManager;
        this.fieldManager = fieldManager;
        this.issueManager = issueManager;
        this.indexingService = indexingService;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Creates or renames the Jira field for every question and stores its id on the question.
     */
    public void ensureFields(RulesConfig config) throws InvalidRulesException {
        CustomFieldType type = customFieldManager.getCustomFieldType(TYPE_KEY);
        CustomFieldSearcher searcher = customFieldManager.getCustomFieldSearcher(SEARCHER_KEY);
        if (searcher == null && type != null) {
            searcher = customFieldManager.getDefaultSearcher(type);
        }
        if (type == null || searcher == null) {
            throw new InvalidRulesException(Collections.singletonList(
                    "Jira text field type is not available, so the questions cannot become issue fields"));
        }
        List<String> errors = new ArrayList<String>();
        Set<String> reserved = new HashSet<String>();
        if (config != null && config.getBlocks() != null) {
            for (int b = 0; b < config.getBlocks().size(); b++) {
                FormBlock block = config.getBlocks().get(b);
                if (block == null || block.getFields() == null) {
                    continue;
                }
                for (int i = 0; i < block.getFields().size(); i++) {
                    FormField field = block.getFields().get(i);
                    if (field == null || field.getId() == null || field.getId().trim().isEmpty()) {
                        continue;
                    }
                    try {
                        bind(block.getId(), field, type, searcher, reserved);
                    } catch (GenericEntityException e) {
                        errors.add("Cannot create the Jira field for \"" + display(field) + "\": " + e.getMessage());
                    } catch (RuntimeException e) {
                        errors.add("Cannot create the Jira field for \"" + display(field) + "\": " + e.getMessage());
                    }
                }
            }
        }
        if (!errors.isEmpty()) {
            throw new InvalidRulesException(errors);
        }
        customFieldManager.refresh();
        fieldManager.refresh();
    }

    /**
     * Writes each answer into its Jira field and publishes an issue-updated event
     * so an automation rule can see the values.
     */
    public void writeAnswers(Issue issue, RulesConfig form, Map<String, List<String>> values, ApplicationUser user) {
        if (issue == null || form == null || form.getBlocks() == null) {
            return;
        }
        boolean changed = false;
        for (int b = 0; b < form.getBlocks().size(); b++) {
            FormBlock block = form.getBlocks().get(b);
            if (block == null || block.getFields() == null) {
                continue;
            }
            for (int i = 0; i < block.getFields().size(); i++) {
                FormField field = block.getFields().get(i);
                if (field == null) {
                    continue;
                }
                CustomField customField = locate(block.getId(), field);
                if (customField == null) {
                    continue;
                }
                String next = text(values == null ? null : values.get(field.getId()));
                if (same(customField, issue, next)) {
                    continue;
                }
                try {
                    update(customField, issue, next);
                    changed = true;
                } catch (RuntimeException e) {
                    log.warn("Cannot write portal answer into {} on {}", customField.getId(), issue.getKey(), e);
                }
            }
        }
        if (!changed) {
            return;
        }
        Issue fresh = issueManager.getIssueObject(issue.getId());
        if (fresh == null) {
            fresh = issue;
        }
        try {
            indexingService.reIndex(fresh);
        } catch (RuntimeException e) {
            log.warn("Cannot reindex {} after portal answers", issue.getKey(), e);
        } catch (com.atlassian.jira.issue.index.IndexException e) {
            log.warn("Cannot reindex {} after portal answers", issue.getKey(), e);
        }
        try {
            Map<String, Object> params = new HashMap<String, Object>();
            eventPublisher.publish(new IssueEvent(
                    fresh, params, user, EventDispatchOption.ISSUE_UPDATED.getEventTypeId(), false));
        } catch (RuntimeException e) {
            log.warn("Cannot publish an update for {} after portal answers", issue.getKey(), e);
        }
    }

    private void bind(String blockId, FormField field, CustomFieldType type, CustomFieldSearcher searcher, Set<String> reserved)
            throws GenericEntityException {
        CustomField current = locate(blockId, field);
        Set<String> taken = new HashSet<String>(reserved);
        List<CustomField> existing = customFieldManager.getCustomFieldObjects();
        for (int i = 0; i < existing.size(); i++) {
            CustomField other = existing.get(i);
            if (other == null || other.getName() == null) {
                continue;
            }
            if (current != null && current.getId().equals(other.getId())) {
                continue;
            }
            taken.add(other.getName().toLowerCase());
        }
        String name = fieldName(field.getIssueName(), field.getLabel(), field.getId(), taken);
        reserved.add(name.toLowerCase());
        String description = marker(blockId, field.getId());
        if (current == null) {
            List<JiraContextNode> contexts = Collections.singletonList(GlobalIssueContext.getInstance());
            List<IssueType> issueTypes = new ArrayList<IssueType>();
            issueTypes.add(null);
            current = customFieldManager.createCustomField(name, description, type, searcher, contexts, issueTypes);
            log.info("Created Jira field {} ({}) for portal question {}", current.getId(), name, field.getId());
        } else if (!name.equals(current.getName()) || !description.equals(current.getDescription())) {
            customFieldManager.updateCustomField(current.getIdAsLong(), name, description, searcher);
            log.info("Renamed Jira field {} to {}", current.getId(), name);
        }
        field.setJiraFieldId(current.getId());
    }

    private CustomField locate(String blockId, FormField field) {
        String expected = marker(blockId, field.getId());
        if (field.getJiraFieldId() != null && field.getJiraFieldId().trim().length() > 0) {
            CustomField byId = customFieldManager.getCustomFieldObject(field.getJiraFieldId().trim());
            if (byId != null && expected.equals(byId.getDescription())) {
                return byId;
            }
        }
        if (field.getId() == null) {
            return null;
        }
        List<CustomField> all = customFieldManager.getCustomFieldObjects();
        for (int i = 0; i < all.size(); i++) {
            CustomField candidate = all.get(i);
            if (candidate != null && expected.equals(candidate.getDescription())) {
                return candidate;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private static void update(CustomField customField, Issue issue, String value) {
        CustomFieldType type = customField.getCustomFieldType();
        type.updateValue(customField, issue, value);
    }

    private static boolean same(CustomField customField, Issue issue, String next) {
        Object current = customField.getValue(issue);
        return textOf(current).equals(next == null ? "" : next);
    }

    private static String text(List<String> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            String item = values.get(i) == null ? "" : values.get(i).trim();
            if (item.isEmpty()) {
                continue;
            }
            if (out.length() > 0) {
                out.append(", ");
            }
            out.append(item);
        }
        return out.length() == 0 ? null : out.toString();
    }

    private static String textOf(Object value) {
        if (value == null) {
            return "";
        }
        return String.valueOf(value).trim();
    }

    private static String display(FormField field) {
        String named = fieldName(field.getIssueName(), field.getLabel(), field.getId(), null);
        return named == null || named.trim().isEmpty() ? field.getId() : named;
    }

    static String marker(String blockId, String fieldId) {
        String block = blockId == null || blockId.trim().isEmpty() ? "block" : blockId.trim();
        String field = fieldId == null ? "" : fieldId.trim();
        return "sdf:" + block + ":" + field;
    }

    /**
     * Name shown in the automation field list. A custom name wins, then the question, then the id.
     * A repeated name gets a numeric suffix.
     */
    static String fieldName(String issueName, String label, String id, Set<String> takenLower) {
        String base = firstText(issueName, label, id);
        if (base.isEmpty()) {
            base = "portal";
        }
        if (base.length() > 240) {
            base = base.substring(0, 240);
        }
        String name = base;
        int n = 2;
        while (takenLower != null && takenLower.contains(name.toLowerCase())) {
            String suffix = " " + n;
            int room = 255 - suffix.length();
            String stem = base.length() > room ? base.substring(0, room) : base;
            name = stem + suffix;
            n++;
            if (n > 500) {
                break;
            }
        }
        return name;
    }

    private static String firstText(String... parts) {
        if (parts == null) {
            return "";
        }
        for (int i = 0; i < parts.length; i++) {
            if (parts[i] != null && parts[i].trim().length() > 0) {
                return parts[i].trim();
            }
        }
        return "";
    }
}
