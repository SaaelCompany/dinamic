package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * One "when X then show Y" rule.
 * <p>
 * Every field listed in {@link #show} of at least one applicable rule is hidden by default and becomes visible
 * only while a rule targeting it matches <b>and</b> the trigger field of that rule is itself visible. This is what
 * gives unlimited nesting: hiding "Medical staff" automatically hides "Main specialty", which in turn hides
 * everything that depends on it.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class Rule {

    private String id;
    private String description;
    /** Restrict the rule to one customer portal (service desk). {@code null} = every portal. */
    private Long portalId;
    /** Restrict the rule to the given request types. Empty = every request type. */
    private List<Long> requestTypeIds = new ArrayList<Long>();
    private Condition when;
    private List<String> show = new ArrayList<String>();
    /** Per-rule override of {@link RulesConfig#isClearOnHide()}. */
    private Boolean clearOnHide;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public Long getPortalId() {
        return portalId;
    }

    public void setPortalId(Long portalId) {
        this.portalId = portalId;
    }

    public List<Long> getRequestTypeIds() {
        return requestTypeIds;
    }

    public void setRequestTypeIds(List<Long> requestTypeIds) {
        this.requestTypeIds = requestTypeIds == null ? new ArrayList<Long>() : requestTypeIds;
    }

    public Condition getWhen() {
        return when;
    }

    public void setWhen(Condition when) {
        this.when = when;
    }

    public List<String> getShow() {
        return show;
    }

    public void setShow(List<String> show) {
        this.show = show == null ? new ArrayList<String>() : show;
    }

    public Boolean getClearOnHide() {
        return clearOnHide;
    }

    public void setClearOnHide(Boolean clearOnHide) {
        this.clearOnHide = clearOnHide;
    }
}
