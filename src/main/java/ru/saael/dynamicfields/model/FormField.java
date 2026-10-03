package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnore;
import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * One question drawn on the customer portal. Saving the form also creates a Jira text field
 * ({@link #jiraFieldId}) so automation can pick it by the question name.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class FormField {

    public static final String CHECKBOX = "checkbox";
    public static final String RADIO = "radio";
    public static final String SELECT = "select";
    public static final String MULTISELECT = "multiselect";
    public static final String TEXT = "text";
    public static final String TEXTAREA = "textarea";
    public static final String NUMBER = "number";
    public static final String DATE = "date";
    public static final String TIME = "time";
    public static final String DATETIME = "datetime";
    public static final String URL = "url";

    private String id;
    /** Jira custom field id, for example {@code customfield_10100}. Empty until the form is saved. */
    private String jiraFieldId;
    private String label;
    private String type = TEXT;
    private List<String> options = new ArrayList<String>();
    /** Text of the empty dropdown row. Empty means the portal default, usually Not selected. */
    private String blankLabel = "";
    /** When true and a default exists, the dropdown has no empty row. */
    private boolean hideBlank;
    private List<String> defaults = new ArrayList<String>();
    /** {@code null} — the field is always visible. Otherwise it is visible only while the condition holds. */
    private Condition when;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getJiraFieldId() {
        return jiraFieldId;
    }

    public void setJiraFieldId(String jiraFieldId) {
        this.jiraFieldId = jiraFieldId;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public List<String> getOptions() {
        return options;
    }

    public void setOptions(List<String> options) {
        this.options = options == null ? new ArrayList<String>() : options;
    }

    public String getBlankLabel() {
        return blankLabel;
    }

    public void setBlankLabel(String blankLabel) {
        this.blankLabel = blankLabel == null ? "" : blankLabel;
    }

    public boolean isHideBlank() {
        return hideBlank;
    }

    public void setHideBlank(boolean hideBlank) {
        this.hideBlank = hideBlank;
    }

    public List<String> getDefaults() {
        return defaults;
    }

    public void setDefaults(List<String> defaults) {
        this.defaults = defaults == null ? new ArrayList<String>() : defaults;
    }

    public Condition getWhen() {
        return when;
    }

    public void setWhen(Condition when) {
        this.when = when;
    }

    @JsonIgnore
    public boolean hasOptions() {
        return CHECKBOX.equals(type) || RADIO.equals(type) || SELECT.equals(type) || MULTISELECT.equals(type);
    }
}
