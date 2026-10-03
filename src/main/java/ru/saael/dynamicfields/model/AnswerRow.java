package ru.saael.dynamicfields.model;

/**
 * One line of a submitted answer, ready to show to an agent or the customer.
 */
public class AnswerRow {

    private String label;
    private String value;

    public AnswerRow() {
    }

    public AnswerRow(String label, String value) {
        this.label = label;
        this.value = value;
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
