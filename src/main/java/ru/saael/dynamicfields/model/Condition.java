package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * Trigger of a rule: "field {@code fieldId} has one of {@code values}".
 * <p>
 * {@code source} is empty when {@code fieldId} is an earlier question in the same block.
 * {@code source} {@code "portal"} means {@code fieldId} is a field that already exists in Jira
 * (for example {@code customfield_10201}, shown to the administrator as {@code fieldName} "Доступ").
 * The question stays hidden until that field equals one of {@code values}.
 * <p>
 * Semantics on the portal side:
 * <ul>
 *   <li>empty {@code values} - matches when the field has any value (any checkbox ticked, option chosen, text typed);</li>
 *   <li>non-empty {@code values} - matches when at least one of the current values of the field equals one of the
 *       listed values. Both option ids ("10101") and option labels ("Открытый") are accepted;</li>
 *   <li>{@code negate} inverts the result.</li>
 * </ul>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class Condition {

    private String fieldId;
    /** {@code "portal"} when the trigger is an existing Jira field. Empty for a question in this block. */
    private String source;
    /** Display name of a portal field, for example "Доступ". Empty for a question in this block. */
    private String fieldName;
    private List<String> values = new ArrayList<String>();
    private boolean negate;

    public String getFieldId() {
        return fieldId;
    }

    public void setFieldId(String fieldId) {
        this.fieldId = fieldId;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public String getFieldName() {
        return fieldName;
    }

    public void setFieldName(String fieldName) {
        this.fieldName = fieldName;
    }

    public List<String> getValues() {
        return values;
    }

    public void setValues(List<String> values) {
        this.values = values == null ? new ArrayList<String>() : values;
    }

    public boolean isNegate() {
        return negate;
    }

    public void setNegate(boolean negate) {
        this.negate = negate;
    }
}
