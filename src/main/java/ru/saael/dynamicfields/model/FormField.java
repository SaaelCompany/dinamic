package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnore;
import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * One field of the form the plugin draws on the customer portal. It is not a Jira custom field:
 * the definition lives in the plugin and the answer is stored by the plugin.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class FormField {

    public static final String CHECKBOX = "checkbox";
    public static final String RADIO = "radio";
    public static final String SELECT = "select";
    public static final String TEXT = "text";
    public static final String TEXTAREA = "textarea";

    private String id;
    private String label;
    private String type = TEXT;
    private List<String> options = new ArrayList<String>();
    /** {@code null} — the field is always visible. Otherwise it is visible only while the condition holds. */
    private Condition when;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
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

    public Condition getWhen() {
        return when;
    }

    public void setWhen(Condition when) {
        this.when = when;
    }

    @JsonIgnore
    public boolean hasOptions() {
        return CHECKBOX.equals(type) || RADIO.equals(type) || SELECT.equals(type);
    }
}
