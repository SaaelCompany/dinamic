package ru.saael.dynamicfields.service;

import com.atlassian.event.api.EventPublisher;
import com.atlassian.jira.event.issue.IssueEvent;
import com.atlassian.jira.event.type.EventDispatchOption;
import com.atlassian.jira.exception.RemoveException;
import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.jira.issue.Issue;
import com.atlassian.jira.issue.IssueManager;
import com.atlassian.jira.issue.context.GlobalIssueContext;
import com.atlassian.jira.issue.context.JiraContextNode;
import com.atlassian.jira.issue.customfields.CustomFieldSearcher;
import com.atlassian.jira.issue.customfields.CustomFieldType;
import com.atlassian.jira.issue.customfields.manager.OptionsManager;
import com.atlassian.jira.issue.customfields.option.Option;
import com.atlassian.jira.issue.customfields.option.Options;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.jira.issue.fields.config.FieldConfig;
import com.atlassian.jira.issue.fields.config.FieldConfigScheme;
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
import java.util.Calendar;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Turns each portal question into a Jira field of the same kind, named after the question,
 * copies the customer's answer into that field, and deletes the Jira field
 * when the question is removed from the saved form.
 * A field that already existed in Jira is never created again and never deleted.
 */
@Named
public class IssueFieldSync {

    private static final Logger log = LoggerFactory.getLogger(IssueFieldSync.class);

    private static final String SYSTEM = "com.atlassian.jira.plugin.system.customfieldtypes:";

    static final String TEXT_TYPE = SYSTEM + "textfield";
    static final String TYPE_KEY = SYSTEM + "textarea";
    static final String DATE_TYPE = SYSTEM + "datepicker";
    static final String DATETIME_TYPE = SYSTEM + "datetime";
    static final String NUMBER_TYPE = SYSTEM + "float";
    static final String URL_TYPE = SYSTEM + "url";
    static final String SELECT_TYPE = SYSTEM + "select";
    static final String RADIO_TYPE = SYSTEM + "radiobuttons";
    static final String MULTI_TYPE = SYSTEM + "multiselect";
    static final String CHECKBOX_TYPE = SYSTEM + "multicheckboxes";

    static final String SEARCHER_KEY = SYSTEM + "textsearcher";
    static final String DATE_SEARCHER = SYSTEM + "daterange";
    static final String DATETIME_SEARCHER = SYSTEM + "datetimerange";
    static final String NUMBER_SEARCHER = SYSTEM + "exactnumber";
    static final String URL_SEARCHER = SYSTEM + "exacttextsearcher";
    static final String CHECKBOX_SEARCHER = SYSTEM + "multiselectsearcher";

    private final CustomFieldManager customFieldManager;
    private final OptionsManager optionsManager;
    private final FieldManager fieldManager;
    private final IssueManager issueManager;
    private final IssueIndexingService indexingService;
    private final EventPublisher eventPublisher;

    @Inject
    public IssueFieldSync(@ComponentImport CustomFieldManager customFieldManager,
                          @ComponentImport OptionsManager optionsManager,
                          @ComponentImport FieldManager fieldManager,
                          @ComponentImport IssueManager issueManager,
                          @ComponentImport IssueIndexingService indexingService,
                          @ComponentImport EventPublisher eventPublisher) {
        this.customFieldManager = customFieldManager;
        this.optionsManager = optionsManager;
        this.fieldManager = fieldManager;
        this.issueManager = issueManager;
        this.indexingService = indexingService;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Creates or renames the Jira field for every question, stores its id on the question,
     * then removes Jira fields whose questions are no longer in the form.
     */
    public void ensureFields(RulesConfig config) throws InvalidRulesException {
        if (customFieldManager.getCustomFieldType(TYPE_KEY) == null) {
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
                    if (field.getPortalFieldId() != null && field.getPortalFieldId().trim().length() > 0) {
                        continue;
                    }
                    try {
                        bind(block.getId(), field, reserved);
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
        removeGoneFields(config, errors);
        customFieldManager.refresh();
        fieldManager.refresh();
        if (!errors.isEmpty()) {
            throw new InvalidRulesException(errors);
        }
    }

    /**
     * Deletes textarea fields this plugin created for questions that are not in {@code config}.
     * A field is ours when its description is {@code sdf:blockId:fieldId}. Other custom fields stay.
     */
    private void removeGoneFields(RulesConfig config, List<String> errors) {
        if (config == null || config.getBlocks() == null) {
            return;
        }
        Set<String> kept = keptMarkers(config);
        Set<String> existingIds = existingFieldIds(config);
        List<CustomField> existing = customFieldManager.getCustomFieldObjects();
        if (existing == null || existing.isEmpty()) {
            return;
        }
        List<CustomField> snapshot = new ArrayList<CustomField>(existing);
        for (int i = 0; i < snapshot.size(); i++) {
            CustomField candidate = snapshot.get(i);
            if (candidate == null || existingIds.contains(candidate.getId())) {
                continue;
            }
            if (!ownedByPlugin(candidate) || !orphan(candidate.getDescription(), kept)) {
                continue;
            }
            try {
                customFieldManager.removeCustomField(candidate);
                log.info("Removed Jira field {} ({}) because its portal question was deleted",
                        candidate.getId(), candidate.getName());
            } catch (RemoveException e) {
                errors.add(deleteError(candidate, e.getMessage()));
            } catch (RuntimeException e) {
                errors.add(deleteError(candidate, e.getMessage()));
            }
        }
    }

    private static boolean ownedByPlugin(CustomField field) {
        if (field.getDescription() == null || !field.getDescription().startsWith("sdf:")) {
            return false;
        }
        if (field.getCustomFieldType() == null || field.getCustomFieldType().getKey() == null) {
            return false;
        }
        return pluginType(field.getCustomFieldType().getKey());
    }

    private static String deleteError(CustomField field, String message) {
        String name = field.getName() == null || field.getName().trim().isEmpty() ? field.getId() : field.getName();
        return "Cannot delete the Jira field \"" + name + "\": " + message;
    }

    /**
     * Markers of questions that must keep their Jira field. A blank question id was never bound.
     */
    static Set<String> keptMarkers(RulesConfig config) {
        Set<String> kept = new HashSet<String>();
        if (config == null || config.getBlocks() == null) {
            return kept;
        }
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
                kept.add(marker(block.getId(), field.getId()));
            }
        }
        return kept;
    }

    /**
     * Jira fields placed on the canvas as existing fields. Removing the node must not delete them.
     * Only a field this plugin created, marked {@code sdf:blockId:fieldId}, can be removed.
     */
    static Set<String> existingFieldIds(RulesConfig config) {
        Set<String> ids = new HashSet<String>();
        if (config == null || config.getBlocks() == null) {
            return ids;
        }
        for (int b = 0; b < config.getBlocks().size(); b++) {
            FormBlock block = config.getBlocks().get(b);
            if (block == null || block.getFields() == null) {
                continue;
            }
            for (int i = 0; i < block.getFields().size(); i++) {
                FormField field = block.getFields().get(i);
                if (field == null || field.getPortalFieldId() == null) {
                    continue;
                }
                String id = field.getPortalFieldId().trim();
                if (!id.isEmpty()) {
                    ids.add(id);
                }
            }
        }
        return ids;
    }

    /**
     * True when {@code description} is a marker of a question that is no longer saved.
     * Descriptions this plugin did not write are never orphans.
     */
    static boolean orphan(String description, Set<String> kept) {
        if (description == null || !description.startsWith("sdf:")) {
            return false;
        }
        return kept == null || !kept.contains(description);
    }

    /**
     * Writes each answer into its Jira field and publishes an issue-updated event
     * so an automation rule can see the values.
     */
    public void writeAnswers(Issue issue, RulesConfig form, Map<String, Map<String, List<String>>> blocks, ApplicationUser user) {
        if (issue == null || form == null || form.getBlocks() == null) {
            return;
        }
        boolean changed = false;
        for (int b = 0; b < form.getBlocks().size(); b++) {
            FormBlock block = form.getBlocks().get(b);
            if (block == null || block.getFields() == null) {
                continue;
            }
            Map<String, List<String>> values = blocks == null || block.getId() == null ? null : blocks.get(block.getId());
            for (int i = 0; i < block.getFields().size(); i++) {
                FormField field = block.getFields().get(i);
                if (field == null) {
                    continue;
                }
                CustomField customField = locate(block.getId(), field);
                if (customField == null) {
                    continue;
                }
                List<String> selected = values == null ? null : values.get(field.getId());
                try {
                    if (options(field.getType()) && optionField(customField)) {
                        if (multiField(customField)) {
                            if (sameChoices(customField, issue, selected)) {
                                continue;
                            }
                            updateChoices(customField, issue, selected);
                        } else if (sameSingle(customField, issue, selected)) {
                            continue;
                        } else {
                            updateSingle(customField, issue, selected);
                        }
                    } else {
                        Object next = scalar(customField, selected);
                        if (sameObject(customField, issue, next)) {
                            continue;
                        }
                        updateObject(customField, issue, next);
                    }
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

    private void bind(String blockId, FormField field, Set<String> reserved) throws GenericEntityException {
        String wanted = fieldTypeKey(field.getType());
        CustomField current = locate(blockId, field);
        if (current != null && !sameType(current, wanted)) {
            try {
                customFieldManager.removeCustomField(current);
                log.info("Removed {} so \"{}\" can be stored as {}", current.getId(), display(field), wanted);
                current = null;
                customFieldManager.refresh();
            } catch (RemoveException e) {
                log.warn("Cannot replace {} with checkboxes: {}", current.getId(), e.getMessage());
            }
        }
        CustomFieldType type = customFieldManager.getCustomFieldType(wanted);
        String searcherKey = searcherKeyFor(field.getType());
        if (type == null) {
            type = customFieldManager.getCustomFieldType(TYPE_KEY);
            searcherKey = SEARCHER_KEY;
        }
        CustomFieldSearcher searcher = customFieldManager.getCustomFieldSearcher(searcherKey);
        if (searcher == null && type != null) {
            searcher = customFieldManager.getDefaultSearcher(type);
        }
        if (current != null && !sameType(current, wanted)) {
            type = current.getCustomFieldType();
            CustomFieldSearcher kept = type == null ? null : customFieldManager.getDefaultSearcher(type);
            if (kept != null) {
                searcher = kept;
            }
        }
        if (type == null || searcher == null) {
            throw new GenericEntityException("Jira field type is not available");
        }
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
        if (options(field.getType()) && optionField(current)) {
            syncOptions(current, field.getOptions());
        }
    }

    /**
     * Question fields in form order. The issue screen uses this order.
     */
    public List<CustomField> questionFields(RulesConfig config) {
        List<CustomField> found = new ArrayList<CustomField>();
        if (config == null || config.getBlocks() == null) {
            return found;
        }
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
                if (field.getPortalFieldId() != null && field.getPortalFieldId().trim().length() > 0) {
                    continue;
                }
                CustomField customField = locate(block.getId(), field);
                if (customField != null) {
                    found.add(customField);
                }
            }
        }
        return found;
    }

    static boolean checks(String questionType) {
        return FormField.CHECKBOX.equals(questionType) || FormField.MULTISELECT.equals(questionType);
    }

    static boolean options(String questionType) {
        return checks(questionType) || FormField.SELECT.equals(questionType) || FormField.RADIO.equals(questionType);
    }

    /**
     * Jira custom field type for a question. Time has no field of its own in Jira, so it is a text field.
     * An unknown type stays a text area, which is what older versions of this plugin created.
     */
    static String fieldTypeKey(String questionType) {
        if (FormField.TEXT.equals(questionType) || FormField.TIME.equals(questionType)) {
            return TEXT_TYPE;
        }
        if (FormField.DATE.equals(questionType)) {
            return DATE_TYPE;
        }
        if (FormField.DATETIME.equals(questionType)) {
            return DATETIME_TYPE;
        }
        if (FormField.NUMBER.equals(questionType)) {
            return NUMBER_TYPE;
        }
        if (FormField.URL.equals(questionType)) {
            return URL_TYPE;
        }
        if (FormField.SELECT.equals(questionType)) {
            return SELECT_TYPE;
        }
        if (FormField.RADIO.equals(questionType)) {
            return RADIO_TYPE;
        }
        if (FormField.MULTISELECT.equals(questionType)) {
            return MULTI_TYPE;
        }
        if (FormField.CHECKBOX.equals(questionType)) {
            return CHECKBOX_TYPE;
        }
        return TYPE_KEY;
    }

    static String searcherKeyFor(String questionType) {
        String type = fieldTypeKey(questionType);
        if (DATE_TYPE.equals(type)) {
            return DATE_SEARCHER;
        }
        if (DATETIME_TYPE.equals(type)) {
            return DATETIME_SEARCHER;
        }
        if (NUMBER_TYPE.equals(type)) {
            return NUMBER_SEARCHER;
        }
        if (URL_TYPE.equals(type)) {
            return URL_SEARCHER;
        }
        if (SELECT_TYPE.equals(type) || RADIO_TYPE.equals(type) || MULTI_TYPE.equals(type) || CHECKBOX_TYPE.equals(type)) {
            return CHECKBOX_SEARCHER;
        }
        return SEARCHER_KEY;
    }

    /**
     * Types this plugin creates. A Jira field is removed only when its description is an {@code sdf:}
     * marker and its type is one of these. Any other field, including one placed on the canvas as an
     * existing field, stays.
     */
    static boolean pluginType(String typeKey) {
        return TEXT_TYPE.equals(typeKey) || TYPE_KEY.equals(typeKey)
                || DATE_TYPE.equals(typeKey) || DATETIME_TYPE.equals(typeKey)
                || NUMBER_TYPE.equals(typeKey) || URL_TYPE.equals(typeKey)
                || SELECT_TYPE.equals(typeKey) || RADIO_TYPE.equals(typeKey)
                || MULTI_TYPE.equals(typeKey) || CHECKBOX_TYPE.equals(typeKey);
    }

    private static boolean sameType(CustomField field, String typeKey) {
        return field != null && field.getCustomFieldType() != null && typeKey.equals(field.getCustomFieldType().getKey());
    }

    private static boolean optionField(CustomField field) {
        return sameType(field, SELECT_TYPE) || sameType(field, RADIO_TYPE)
                || sameType(field, MULTI_TYPE) || sameType(field, CHECKBOX_TYPE);
    }

    private static boolean multiField(CustomField field) {
        return sameType(field, MULTI_TYPE) || sameType(field, CHECKBOX_TYPE);
    }

    private void syncOptions(CustomField field, List<String> wanted) {
        FieldConfig config = onlyConfig(field);
        if (config == null || wanted == null) {
            return;
        }
        Options options = optionsManager.getOptions(config);
        if (options == null) {
            return;
        }
        long sequence = 0L;
        List<Option> existing = options.getRootOptions();
        if (existing != null) {
            for (int i = 0; i < existing.size(); i++) {
                Long current = existing.get(i).getSequence();
                if (current != null && current.longValue() >= sequence) {
                    sequence = current.longValue() + 1L;
                }
            }
        }
        for (int i = 0; i < wanted.size(); i++) {
            String value = wanted.get(i) == null ? "" : wanted.get(i).trim();
            if (value.isEmpty()) {
                continue;
            }
            if (value.length() > 255) {
                value = value.substring(0, 255);
            }
            if (options.getOptionForValue(value, null) != null) {
                continue;
            }
            optionsManager.createOption(config, null, Long.valueOf(sequence), value);
            sequence++;
        }
    }

    private void updateChoices(CustomField field, Issue issue, List<String> values) {
        FieldConfig config = field.getRelevantConfig(issue);
        if (config == null) {
            config = onlyConfig(field);
        }
        if (config == null) {
            return;
        }
        Options options = optionsManager.getOptions(config);
        if (options == null) {
            return;
        }
        Collection<Option> selected = new ArrayList<Option>();
        if (values != null) {
            for (int i = 0; i < values.size(); i++) {
                String text = values.get(i) == null ? "" : values.get(i).trim();
                if (text.isEmpty()) {
                    continue;
                }
                Option option = options.getOptionForValue(text, null);
                if (option != null && !selected.contains(option)) {
                    selected.add(option);
                }
            }
        }
        field.getCustomFieldType().updateValue(field, issue, selected);
    }

    private void updateSingle(CustomField field, Issue issue, List<String> values) {
        FieldConfig config = field.getRelevantConfig(issue);
        if (config == null) {
            config = onlyConfig(field);
        }
        if (config == null) {
            return;
        }
        Options options = optionsManager.getOptions(config);
        if (options == null) {
            return;
        }
        Option selected = null;
        String wanted = firstValue(values);
        if (!wanted.isEmpty()) {
            selected = options.getOptionForValue(wanted, null);
            if (selected == null) {
                throw new IllegalArgumentException(wanted);
            }
        }
        field.getCustomFieldType().updateValue(field, issue, selected);
    }

    private boolean sameSingle(CustomField field, Issue issue, List<String> values) {
        String wanted = firstValue(values);
        Object current = field.getValue(issue);
        String have = "";
        if (current instanceof Option) {
            have = ((Option) current).getValue() == null ? "" : ((Option) current).getValue();
        } else if (current != null) {
            have = String.valueOf(current).trim();
        }
        return have.equals(wanted);
    }

    private boolean sameChoices(CustomField field, Issue issue, List<String> values) {
        Set<String> wanted = new HashSet<String>();
        if (values != null) {
            for (int i = 0; i < values.size(); i++) {
                if (values.get(i) != null && values.get(i).trim().length() > 0) {
                    wanted.add(values.get(i).trim());
                }
            }
        }
        Set<String> have = new HashSet<String>();
        Object current = field.getValue(issue);
        if (current instanceof Collection) {
            Collection<?> items = (Collection<?>) current;
            for (Object item : items) {
                if (item instanceof Option) {
                    have.add(((Option) item).getValue());
                } else if (item != null) {
                    have.add(String.valueOf(item));
                }
            }
        }
        return have.equals(wanted);
    }

    private static FieldConfig onlyConfig(CustomField field) {
        List<FieldConfigScheme> schemes = field.getConfigurationSchemes();
        if (schemes == null) {
            return null;
        }
        for (int i = 0; i < schemes.size(); i++) {
            FieldConfig config = schemes.get(i).getOneAndOnlyConfig();
            if (config != null) {
                return config;
            }
        }
        return null;
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
    private static void updateObject(CustomField customField, Issue issue, Object value) {
        CustomFieldType type = customField.getCustomFieldType();
        type.updateValue(customField, issue, value);
    }

    /**
     * Value stored in Jira for a text, number, date, date-time, link, or time question.
     * A date field receives a {@link Date}, a number field a {@link Double}, and the rest a string.
     * Time is a string because Jira has no time custom field.
     */
    static Object scalar(CustomField customField, List<String> values) {
        String actual = customField == null || customField.getCustomFieldType() == null
                ? "" : customField.getCustomFieldType().getKey();
        if (DATE_TYPE.equals(actual)) {
            return parseDate(firstValue(values));
        }
        if (DATETIME_TYPE.equals(actual)) {
            return parseDateTime(firstValue(values));
        }
        if (NUMBER_TYPE.equals(actual)) {
            return parseNumber(firstValue(values));
        }
        return text(values);
    }

    static Date parseDate(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.isEmpty()) {
            return null;
        }
        if (text.length() >= 10 && text.charAt(4) == '-' && text.charAt(7) == '-') {
            return at(text.substring(0, 10), 0, 0, 0);
        }
        throw new IllegalArgumentException(text);
    }

    static Date parseDateTime(String raw) {
        String text = raw == null ? "" : raw.trim().replace(' ', 'T');
        if (text.isEmpty()) {
            return null;
        }
        if (text.length() >= 16 && text.charAt(4) == '-' && text.charAt(7) == '-' && text.charAt(10) == 'T') {
            int hour = Integer.parseInt(text.substring(11, 13));
            int minute = Integer.parseInt(text.substring(14, 16));
            int second = 0;
            if (text.length() >= 19 && text.charAt(16) == ':') {
                second = Integer.parseInt(text.substring(17, 19));
            }
            return at(text.substring(0, 10), hour, minute, second);
        }
        throw new IllegalArgumentException(text);
    }

    static Double parseNumber(String raw) {
        String text = raw == null ? "" : raw.trim().replace(',', '.');
        if (text.isEmpty()) {
            return null;
        }
        return Double.valueOf(text);
    }

    private static Date at(String day, int hour, int minute, int second) {
        Calendar calendar = Calendar.getInstance();
        calendar.setLenient(false);
        calendar.set(Calendar.YEAR, Integer.parseInt(day.substring(0, 4)));
        calendar.set(Calendar.MONTH, Integer.parseInt(day.substring(5, 7)) - 1);
        calendar.set(Calendar.DAY_OF_MONTH, Integer.parseInt(day.substring(8, 10)));
        calendar.set(Calendar.HOUR_OF_DAY, hour);
        calendar.set(Calendar.MINUTE, minute);
        calendar.set(Calendar.SECOND, second);
        calendar.set(Calendar.MILLISECOND, 0);
        return calendar.getTime();
    }

    private static boolean sameObject(CustomField customField, Issue issue, Object next) {
        Object current = customField.getValue(issue);
        if (next instanceof Date && current instanceof Date) {
            return ((Date) next).getTime() == ((Date) current).getTime();
        }
        if (next instanceof Number && current instanceof Number) {
            return Double.compare(((Number) next).doubleValue(), ((Number) current).doubleValue()) == 0;
        }
        if (next == null) {
            return current == null || textOf(current).isEmpty();
        }
        return textOf(current).equals(textOf(next));
    }

    private static String firstValue(List<String> values) {
        if (values == null) {
            return "";
        }
        for (int i = 0; i < values.size(); i++) {
            if (values.get(i) != null && values.get(i).trim().length() > 0) {
                return values.get(i).trim();
            }
        }
        return "";
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
