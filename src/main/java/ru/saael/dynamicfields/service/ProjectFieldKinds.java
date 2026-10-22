package ru.saael.dynamicfields.service;

/**
 * How an existing Jira field should be picked in the builder.
 * A dropdown stays a dropdown, checkboxes stay checkboxes.
 */
public final class ProjectFieldKinds {

    public static final String TEXT = "text";
    public static final String SELECT = "select";
    public static final String CHECKBOXES = "checkboxes";
    public static final String RADIO = "radio";

    private ProjectFieldKinds() {
    }

    public static String control(String typeKey) {
        if (typeKey == null) {
            return TEXT;
        }
        String key = typeKey.toLowerCase();
        if (key.contains("organization")) {
            return CHECKBOXES;
        }
        if (key.endsWith(":multicheckboxes") || key.endsWith(":multiselect")) {
            return CHECKBOXES;
        }
        if (key.endsWith(":radiobuttons")) {
            return RADIO;
        }
        if (key.endsWith(":cascadingselect") || key.endsWith(":select")) {
            return SELECT;
        }
        return TEXT;
    }
}
