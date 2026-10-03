package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * One independent group of questions on the customer portal. Several blocks can be published
 * at once, each with its own title, fields and request types.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class FormBlock {

    private String id;
    private String title = "";
    private boolean clearOnHide = true;
    /** Empty — show on every request type. */
    private List<Long> requestTypeIds = new ArrayList<Long>();
    private List<FormField> fields = new ArrayList<FormField>();

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
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
