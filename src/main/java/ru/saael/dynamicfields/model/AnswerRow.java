package ru.saael.dynamicfields.model;

/**
 * One line of a submitted answer, ready to show to an agent or the customer.
 */
public class AnswerRow {

    /** Block title at submit time. Empty for answers saved before blocks existed. */
    private String group;
    private String fieldId;
    private String label;
    private String value;

    public AnswerRow() {
    }

    public AnswerRow(String label, String value) {
        this.label = label;
        this.value = value;
    }

    public String getGroup() {
        return group;
    }

    public void setGroup(String group) {
        this.group = group;
    }

    public String getFieldId() {
        return fieldId;
    }

    public void setFieldId(String fieldId) {
        this.fieldId = fieldId;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getValue() {
        return value;
    }

    public void setValue(String value) {
        this.value = value;
    }
}
