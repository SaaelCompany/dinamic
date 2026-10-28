package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

/**
 * Puts a question in the rows of an earlier checkbox or radio field.
 * {@link #option} is the row it follows. A blank option means the end of that list.
 * The question stays visible; this is only a place, not a hide condition.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class FieldAfter {

    private String fieldId;
    private String option;

    public String getFieldId() {
        return fieldId;
    }

    public void setFieldId(String fieldId) {
        this.fieldId = fieldId;
    }

    public String getOption() {
        return option;
    }

    public void setOption(String option) {
        this.option = option == null ? null : option.trim();
        if (this.option != null && this.option.isEmpty()) {
            this.option = null;
        }
    }
}
