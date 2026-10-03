package ru.saael.dynamicfields.field;

import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.jira.issue.Issue;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.saael.dynamicfields.model.AnswerRow;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;
import ru.saael.dynamicfields.service.FieldCatalogSync;
import ru.saael.dynamicfields.service.FieldCatalogSync.OwnedField;

import javax.inject.Inject;
import javax.inject.Named;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Lists the custom fields of this plugin. The administrator creates them in Jira;
 * each one becomes a block on the plugin configuration page.
 */
@Named
public class PortalFormFields {

    private static final Logger log = LoggerFactory.getLogger(PortalFormFields.class);

    static final String TYPE_KEY = "ru.saael.jira.portal-dynamic-fields:portal-form";

    private final CustomFieldManager customFieldManager;

    @Inject
    public PortalFormFields(@ComponentImport CustomFieldManager customFieldManager) {
        this.customFieldManager = customFieldManager;
    }

    public List<OwnedField> list() {
        List<CustomField> all = customFieldManager.getCustomFieldObjects();
        List<OwnedField> found = new ArrayList<OwnedField>();
        for (int i = 0; i < all.size(); i++) {
            CustomField field = all.get(i);
            if (field == null || field.getCustomFieldType() == null) {
                continue;
            }
            if (TYPE_KEY.equals(field.getCustomFieldType().getKey())) {
                found.add(new OwnedField(field.getId(), field.getName()));
            }
        }
        Collections.sort(found, new Comparator<OwnedField>() {
            @Override
            public int compare(OwnedField left, OwnedField right) {
                int byName = left.getName().compareToIgnoreCase(right.getName());
                return byName != 0 ? byName : left.getId().compareTo(right.getId());
            }
        });
        return found;
    }

    public void align(RulesConfig config) {
        if (config == null) {
            return;
        }
        try {
            FieldCatalogSync.align(config, list());
        } catch (RuntimeException e) {
            log.warn("Cannot list portal custom fields", e);
        }
    }

    public void writeOwned(Issue issue, RulesConfig form, List<AnswerRow> rows) {
        if (issue == null || form == null || form.getBlocks() == null) {
            return;
        }
        for (int i = 0; i < form.getBlocks().size(); i++) {
            FormBlock block = form.getBlocks().get(i);
            if (block == null || block.getCustomFieldId() == null || block.getCustomFieldId().trim().isEmpty()) {
                continue;
            }
            write(issue, block.getCustomFieldId().trim(), rowsFor(block, rows));
        }
    }

    public void write(Issue issue, String customFieldId, List<AnswerRow> rows) {
        if (issue == null || customFieldId == null) {
            return;
        }
        CustomField field = customFieldManager.getCustomFieldObject(customFieldId);
        if (field == null || field.getCustomFieldType() == null || !TYPE_KEY.equals(field.getCustomFieldType().getKey())) {
            return;
        }
        try {
            field.getCustomFieldType().updateValue(field, issue, summary(rows));
        } catch (RuntimeException e) {
            log.warn("Cannot store portal answers in {} on {}", field.getId(), issue.getKey(), e);
        }
    }

    private static List<AnswerRow> rowsFor(FormBlock block, List<AnswerRow> rows) {
        List<AnswerRow> owned = new ArrayList<AnswerRow>();
        if (rows == null) {
            return owned;
        }
        Set<String> questionIds = new HashSet<String>();
        if (block.getFields() != null) {
            for (int i = 0; i < block.getFields().size(); i++) {
                FormField field = block.getFields().get(i);
                if (field != null && field.getId() != null) {
                    questionIds.add(field.getId());
                }
            }
        }
        String owner = block.getCustomFieldId().trim();
        for (int i = 0; i < rows.size(); i++) {
            AnswerRow row = rows.get(i);
            if (row == null) {
                continue;
            }
            if (owner.equals(row.getOwner()) || (isBlank(row.getOwner()) && questionIds.contains(row.getFieldId()))) {
                owned.add(row);
            }
        }
        return owned;
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

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
