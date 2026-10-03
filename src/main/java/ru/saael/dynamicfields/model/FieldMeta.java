package ru.saael.dynamicfields.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Description of a Jira field for the visual rule builder: id, name, control type and (for option based
 * fields) the list of options.
 */
public class FieldMeta {

    public static class OptionMeta {
        private final String id;
        private final String label;

        public OptionMeta(String id, String label) {
            this.id = id;
            this.label = label;
        }

        public String getId() {
            return id;
        }

        public String getLabel() {
            return label;
        }
    }

    private final String id;
    private final String name;
    /** checkbox, radio, select, multiselect, cascading, text, textarea, number, date, user, other */
    private final String type;
    private final boolean custom;
    private final List<OptionMeta> options = new ArrayList<OptionMeta>();

    public FieldMeta(String id, String name, String type, boolean custom) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.custom = custom;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getType() {
        return type;
    }

    public boolean isCustom() {
        return custom;
    }

    public List<OptionMeta> getOptions() {
        return options;
    }
}
