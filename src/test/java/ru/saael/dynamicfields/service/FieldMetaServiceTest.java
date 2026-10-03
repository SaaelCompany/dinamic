package ru.saael.dynamicfields.service;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class FieldMetaServiceTest {

    @Test
    public void mapsJiraCustomFieldTypeKeys() {
        assertEquals("checkbox", FieldMetaService.mapType(
                "com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes"));
        assertEquals("radio", FieldMetaService.mapType(
                "com.atlassian.jira.plugin.system.customfieldtypes:radiobuttons"));
        assertEquals("select", FieldMetaService.mapType(
                "com.atlassian.jira.plugin.system.customfieldtypes:select"));
        assertEquals("cascading", FieldMetaService.mapType(
                "com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect"));
        assertEquals("text", FieldMetaService.mapType(
                "com.atlassian.jira.plugin.system.customfieldtypes:textfield"));
        assertEquals("textarea", FieldMetaService.mapType(
                "com.atlassian.jira.plugin.system.customfieldtypes:textarea"));
        assertEquals("other", FieldMetaService.mapType(null));
        assertEquals("other", FieldMetaService.mapType("com.example:unknown"));
    }
}
