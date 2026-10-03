package ru.saael.dynamicfields.field;

import com.atlassian.event.api.EventListener;
import com.atlassian.event.api.EventPublisher;
import com.atlassian.jira.component.ComponentAccessor;
import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.jira.issue.Issue;
import com.atlassian.jira.issue.context.GlobalIssueContext;
import com.atlassian.jira.issue.context.JiraContextNode;
import com.atlassian.jira.issue.customfields.CustomFieldSearcher;
import com.atlassian.jira.issue.customfields.CustomFieldType;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.jira.issue.issuetype.IssueType;
import com.atlassian.plugin.event.events.PluginEnabledEvent;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.saael.dynamicfields.model.AnswerRow;

import javax.inject.Inject;
import javax.inject.Named;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Creates the single issue field "Динамические поля" and copies portal answers into it.
 * The administrator adds that field to the projects, screens and request types that need it.
 */
@Named
public class PortalFormFields {

    private static final Logger log = LoggerFactory.getLogger(PortalFormFields.class);

    static final String TYPE_KEY = "ru.saael.jira.portal-dynamic-fields:portal-form";
    static final String FIELD_NAME = "Динамические поля";
    private static final String FIELD_DESCRIPTION = "Ответы динамических полей с портала";

    private final CustomFieldManager customFieldManager;
    private final EventPublisher eventPublisher;

    @Inject
    public PortalFormFields(@ComponentImport CustomFieldManager customFieldManager,
                            @ComponentImport EventPublisher eventPublisher) {
        this.customFieldManager = customFieldManager;
        this.eventPublisher = eventPublisher;
        this.eventPublisher.register(this);
    }

    @EventListener
    public void onPluginEnabled(PluginEnabledEvent event) {
        if (event == null || event.getPlugin() == null || event.getPlugin().getKey() == null) {
            return;
        }
        if (TYPE_KEY.startsWith(event.getPlugin().getKey())) {
            ensure();
        }
    }

    public void ensure() {
        try {
            findOrCreate();
        } catch (RuntimeException e) {
            log.warn("Cannot prepare the portal issue field", e);
        }
    }

    /** Id of the issue field, or an empty string when the type is not registered yet. */
    public String id() {
        ensure();
        CustomField field = find();
        return field == null ? "" : field.getId();
    }

    public void write(Issue issue, List<AnswerRow> rows) {
        if (issue == null) {
            return;
        }
        CustomField field = find();
        if (field == null) {
            ensure();
            field = find();
        }
        if (field == null) {
            return;
        }
        try {
            field.getCustomFieldType().updateValue(field, issue, summary(rows));
        } catch (RuntimeException e) {
            log.warn("Cannot store portal answers in {} on {}", field.getId(), issue.getKey(), e);
        }
    }

    private CustomField findOrCreate() {
        CustomField existing = find();
        if (existing != null) {
            return existing;
        }
        CustomFieldType type = customFieldManager.getCustomFieldType(TYPE_KEY);
        if (type == null) {
            log.warn("Portal field type is not registered yet");
            return null;
        }
        CustomFieldSearcher searcher = customFieldManager.getCustomFieldSearcher(
                "com.atlassian.jira.plugin.system.customfieldtypes:textsearcher");
        List<JiraContextNode> contexts = Collections.singletonList(GlobalIssueContext.getInstance());
        List<IssueType> issueTypes = new ArrayList<IssueType>();
        issueTypes.add(null);
        try {
            CustomField created = create(type, searcher, contexts, issueTypes);
            customFieldManager.refresh();
            ComponentAccessor.getFieldManager().refresh();
            log.info("Created issue field {} ({})", created.getId(), FIELD_NAME);
            return created;
        } catch (RuntimeException e) {
            log.warn("Cannot create the portal issue field", e);
            return find();
        } catch (org.ofbiz.core.entity.GenericEntityException e) {
            log.warn("Cannot create the portal issue field", e);
            return find();
        }
    }

    private CustomField find() {
        List<CustomField> all = customFieldManager.getCustomFieldObjects();
        for (int i = 0; i < all.size(); i++) {
            CustomField field = all.get(i);
            if (field == null || field.getCustomFieldType() == null) {
                continue;
            }
            if (TYPE_KEY.equals(field.getCustomFieldType().getKey())) {
                return field;
            }
        }
        return null;
    }

    private CustomField create(CustomFieldType type, CustomFieldSearcher searcher,
                               List<JiraContextNode> contexts, List<IssueType> issueTypes)
            throws org.ofbiz.core.entity.GenericEntityException {
        try {
            return customFieldManager.createCustomField(
                    FIELD_NAME, FIELD_DESCRIPTION, type, searcher, contexts, issueTypes);
        } catch (RuntimeException incompatible) {
            log.info("Portal field searcher was rejected, creating the field without one");
            return customFieldManager.createCustomField(
                    FIELD_NAME, FIELD_DESCRIPTION, type, null, contexts, issueTypes);
        }
    }

    static String summary(List<AnswerRow> rows) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < rows.size(); i++) {
            AnswerRow row = rows.get(i);
            if (row == null) {
                continue;
            }
            if (text.length() > 0) {
                text.append('\n');
            }
            if (row.getLabel() != null && row.getLabel().trim().length() > 0) {
                text.append(row.getLabel().trim()).append(": ");
            }
            text.append(row.getValue() == null ? "" : row.getValue());
        }
        return text.length() == 0 ? null : text.toString();
    }
}
