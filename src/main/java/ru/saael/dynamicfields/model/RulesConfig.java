package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * The whole extra form shown on the customer portal. Version 2: the plugin owns the fields,
 * nothing is read from Jira custom fields.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class RulesConfig {

    public static final int CURRENT_VERSION = 2;

    private int version = CURRENT_VERSION;
    /** Heading above the block on the portal. Empty — the portal uses its own default. */
    private String title = "";
    private boolean clearOnHide = true;
    /** Empty — show on every request type. */
    private List<Long> requestTypeIds = new ArrayList<Long>();
    private List<FormField> fields = new ArrayList<FormField>();

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title == null ? "" : title;
    }

    public boolean isClearOnHide() {
        return clearOnHide;
    }

    public void setClearOnHide(boolean clearOnHide) {
        this.clearOnHide = clearOnHide;
    }

    public List<Long> getRequestTypeIds() {
        return requestTypeIds;
    }

    public void setRequestTypeIds(List<Long> requestTypeIds) {
        this.requestTypeIds = requestTypeIds == null ? new ArrayList<Long>() : requestTypeIds;
    }

    public List<FormField> getFields() {
        return fields;
    }

    public void setFields(List<FormField> fields) {
        this.fields = fields == null ? new ArrayList<FormField>() : fields;
    }
}
