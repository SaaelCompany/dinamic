package ru.saael.dynamicfields.service;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

public class ProjectFieldKindsTest {

    @Test
    public void dropdownsStayDropdowns() {
        assertEquals(ProjectFieldKinds.SELECT, ProjectFieldKinds.control(
                "com.atlassian.jira.plugin.system.customfieldtypes:select"));
        assertEquals(ProjectFieldKinds.SELECT, ProjectFieldKinds.control(
                "com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect"));
    }

    @Test
    public void checkboxesAndOrganizationsStayCheckboxes() {
        assertEquals(ProjectFieldKinds.CHECKBOXES, ProjectFieldKinds.control(
                "com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes"));
        assertEquals(ProjectFieldKinds.CHECKBOXES, ProjectFieldKinds.control(
                "com.atlassian.jira.plugin.system.customfieldtypes:multiselect"));
        assertEquals(ProjectFieldKinds.CHECKBOXES, ProjectFieldKinds.control(
                "com.atlassian.servicedesk:sd-customer-organizations"));
    }

    @Test
    public void radiosStayRadios() {
        assertEquals(ProjectFieldKinds.RADIO, ProjectFieldKinds.control(
                "com.atlassian.jira.plugin.system.customfieldtypes:radiobuttons"));
    }

    @Test
    public void textFieldsHaveNoChoices() {
        assertEquals(ProjectFieldKinds.TEXT, ProjectFieldKinds.control(
                "com.atlassian.jira.plugin.system.customfieldtypes:textfield"));
        assertEquals(ProjectFieldKinds.TEXT, ProjectFieldKinds.control(null));
    }
}
