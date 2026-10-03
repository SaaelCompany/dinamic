package ru.saael.dynamicfields.field;

import com.atlassian.jira.component.ComponentAccessor;
import com.atlassian.jira.issue.Issue;
import com.atlassian.jira.issue.customfields.impl.GenericTextCFType;
import com.atlassian.jira.issue.customfields.manager.GenericConfigManager;
import com.atlassian.jira.issue.customfields.persistence.CustomFieldValuePersister;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.jira.issue.fields.TextFieldCharacterLengthValidator;
import com.atlassian.jira.issue.fields.layout.field.FieldLayoutItem;
import com.atlassian.jira.security.JiraAuthenticationContext;
import ru.saael.dynamicfields.model.AnswerRow;
import ru.saael.dynamicfields.service.AnswersService;
import ru.saael.dynamicfields.service.AnswersServiceImpl;

import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * One issue field that shows the portal answers in the issue details
 * and accepts the same text when the field is on a screen.
 */
public class PortalFormCFType extends GenericTextCFType {

    public PortalFormCFType() {
        this(ComponentAccessor.getComponent(CustomFieldValuePersister.class),
                ComponentAccessor.getComponent(GenericConfigManager.class),
                ComponentAccessor.getComponent(TextFieldCharacterLengthValidator.class),
                ComponentAccessor.getComponent(JiraAuthenticationContext.class));
    }

    public PortalFormCFType(CustomFieldValuePersister persister,
                            GenericConfigManager genericConfigManager,
                            TextFieldCharacterLengthValidator validator,
                            JiraAuthenticationContext authenticationContext) {
        super(persister, genericConfigManager, validator, authenticationContext);
    }

    @Override
    public Map<String, Object> getVelocityParameters(Issue issue, CustomField field, FieldLayoutItem layout) {
        Map<String, Object> params = super.getVelocityParameters(issue, field, layout);
        params.put("sdfRows", rows(issue));
        return params;
    }

    private static List<AnswerRow> rows(Issue issue) {
        if (issue == null || issue.getKey() == null) {
            return Collections.emptyList();
        }
        AnswersService service = AnswersServiceImpl.installed();
        if (service == null) {
            return Collections.emptyList();
        }
        try {
            return service.storedRows(issue.getKey());
        } catch (RuntimeException e) {
            return Collections.emptyList();
        }
    }
}
