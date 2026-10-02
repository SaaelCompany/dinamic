package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * Trigger of a rule: "field {@code fieldId} has one of {@code values}".
 * <p>
 * Semantics on the portal side:
 * <ul>
 *   <li>empty {@code values} - matches when the field has any value (any checkbox ticked, option chosen, text typed);</li>
 *   <li>non-empty {@code values} - matches when at least one of the current values of the field equals one of the
 *       listed values. Both option ids ("10101") and option labels ("Медицинский сотрудник") are accepted;</li>
 *   <li>{@code negate} inverts the result.</li>
 * </ul>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class Condition {

    private String fieldId;
    private List<String> values = new ArrayList<String>();
    private boolean negate;

    public String getFieldId() {
        return fieldId;
    }

    public void setFieldId(String fieldId) {
        this.fieldId = fieldId;
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
