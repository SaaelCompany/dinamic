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
    /** Name of the Jira text field used by automation. Empty means the question label, then the id. */
    private String issueName;
    private String label;
    /** Help shown under the question on the portal. Empty means no help. */
    private String help;
    private String type = TEXT;
    private List<String> options = new ArrayList<String>();
    /**
     * One entry per option row. Empty means the row is a normal answer.
     * A field id means that question is drawn at this position, between the neighbouring rows.
     * The nested question does not need a visibility link.
     */
    private List<String> nests = new ArrayList<String>();
    /** Text of the empty dropdown row. Empty means the portal default, usually Not selected. */
    private String blankLabel = "";
    /** When true and a default exists, the dropdown has no empty row. */
    private boolean hideBlank;
    /** The customer cannot send the request while this visible question is empty. */
    private boolean required;
    /** Header color on the builder canvas, {@code #rrggbb}. Empty keeps the automatic color. */
    private String color;
    private List<String> defaults = new ArrayList<String>();
    /** {@code null} — the field is always visible. Otherwise it is visible only while the condition holds. */
    private Condition when;
    /** {@code null} — the question stays in the block order. Otherwise it is drawn after that answer and stays visible. */
    private FieldAfter after;
    /** {@code null} — the question stays in the block order. Otherwise it is drawn between the rows of that field. */
    private FieldAmong among;

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

    public String getIssueName() {
        return issueName;
    }

    public void setIssueName(String issueName) {
        this.issueName = issueName;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getHelp() {
        return help;
    }

    public void setHelp(String help) {
        if (help == null) {
            this.help = null;
            return;
        }
        String trimmed = help.trim();
        this.help = trimmed.isEmpty() ? null : trimmed;
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

    public List<String> getNests() {
        return nests;
    }

    public void setNests(List<String> nests) {
        this.nests = nests == null ? new ArrayList<String>() : nests;
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

    @JsonSerialize(include = JsonSerialize.Inclusion.NON_DEFAULT)
    public boolean isRequired() {
        return required;
    }

    public void setRequired(boolean required) {
        this.required = required;
    }

    public String getColor() {
        return color;
    }

    public void setColor(String color) {
        this.color = color == null ? null : color.trim();
        if (this.color != null && this.color.length() == 0) {
            this.color = null;
        }
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

    public FieldAfter getAfter() {
        return after;
    }

    public void setAfter(FieldAfter after) {
        this.after = after;
    }

    public FieldAmong getAmong() {
        return among;
    }

    public void setAmong(FieldAmong among) {
        this.among = among;
    }

    @JsonIgnore
    public boolean hasOptions() {
        return CHECKBOX.equals(type) || RADIO.equals(type) || SELECT.equals(type) || MULTISELECT.equals(type);
    }
}
