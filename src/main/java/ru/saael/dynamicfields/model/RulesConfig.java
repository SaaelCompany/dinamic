package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnore;
import org.codehaus.jackson.annotate.JsonIgnoreProperties;
import org.codehaus.jackson.map.annotate.JsonSerialize;

import java.util.ArrayList;
import java.util.List;

/**
 * Every extra block shown on the customer portal. Version 3 stores one or more blocks.
 * A stored version 2 document (a single form) is wrapped into one block before validation.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
@JsonSerialize(include = JsonSerialize.Inclusion.NON_NULL)
public class RulesConfig {

    public static final int CURRENT_VERSION = 3;

    private int version = CURRENT_VERSION;
    private List<FormBlock> blocks = new ArrayList<FormBlock>();

    public int getVersion() {
        return version;
    }

    public void setVersion(int version) {
        this.version = version;
    }

    public List<FormBlock> getBlocks() {
        return blocks;
    }

    public void setBlocks(List<FormBlock> blocks) {
        this.blocks = blocks == null ? new ArrayList<FormBlock>() : blocks;
    }

    @JsonIgnore
    public int fieldCount() {
        int count = 0;
        for (FormBlock block : blocks) {
            if (block != null && block.getFields() != null) {
                count += block.getFields().size();
            }
        }
        return count;
    }
}
