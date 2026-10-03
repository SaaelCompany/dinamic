package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Answers stored for one issue. {@code rows} is a snapshot of labels at submit time, so a later
 * edit of the form does not rewrite history.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class AnswerDocument {

    private Map<String, List<String>> values = new LinkedHashMap<String, List<String>>();
    private List<AnswerRow> rows = new ArrayList<AnswerRow>();

    public Map<String, List<String>> getValues() {
        return values;
    }

    public void setValues(Map<String, List<String>> values) {
        this.values = values == null ? new LinkedHashMap<String, List<String>>() : values;
    }

    public List<AnswerRow> getRows() {
        return rows;
    }

    public void setRows(List<AnswerRow> rows) {
        this.rows = rows == null ? new ArrayList<AnswerRow>() : rows;
    }
}
