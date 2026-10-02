package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * Root of the configuration document stored in plugin settings and served to the customer portal.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class RulesConfig {

    public static final int CURRENT_VERSION = 1;

    private int version = CURRENT_VERSION;
    /** Reset the value of a field when it gets hidden (so stale answers are not submitted). */
    private boolean clearOnHide = true;
    /** Optional CSS selectors that identify the wrapper element of a field on the portal form. */
    private List<String> containerSelectors = new ArrayList<String>();
    private List<Rule> rules = new ArrayList<Rule>();

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public boolean isClearOnHide() {
        return clearOnHide;
    }

    public void setClearOnHide(boolean clearOnHide) {
        this.clearOnHide = clearOnHide;
    }

    public List<String> getContainerSelectors() {
        return containerSelectors;
    }

    public void setContainerSelectors(List<String> containerSelectors) {
        this.containerSelectors = containerSelectors == null ? new ArrayList<String>() : containerSelectors;
    }

    public List<Rule> getRules() {
        return rules;
    }

    public void setRules(List<Rule> rules) {
        this.rules = rules == null ? new ArrayList<Rule>() : rules;
    }
}
