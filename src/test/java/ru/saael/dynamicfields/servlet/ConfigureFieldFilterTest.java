package ru.saael.dynamicfields.servlet;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ConfigureFieldFilterTest {

    @Test
    public void acceptsOnlyCustomFieldIds() {
        assertTrue(ConfigureFieldFilter.isFieldId("customfield_10139"));
        assertFalse(ConfigureFieldFilter.isFieldId("customfield_"));
        assertFalse(ConfigureFieldFilter.isFieldId("summary"));
        assertFalse(ConfigureFieldFilter.isFieldId("customfield_10139;drop"));
    }
}
