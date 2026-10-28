package ru.saael.dynamicfields.service;

import org.junit.Test;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class IssueFieldSyncTest {

    @Test
    public void questionNameBecomesTheJiraFieldName() {
        assertEquals("Специальность", IssueFieldSync.fieldName(null, "Специальность", "field5", new HashSet<String>()));
    }

    @Test
    public void blankQuestionUsesItsId() {
        assertEquals("field5", IssueFieldSync.fieldName(null, "  ", "field5", new HashSet<String>()));
    }

    @Test
    public void customIssueNameWinsOverTheQuestion() {
        assertEquals("Филиал", IssueFieldSync.fieldName("Филиал", "Специальность", "field5", new HashSet<String>()));
    }

    @Test
    public void blankIssueNameUsesTheQuestion() {
        assertEquals("Специальность", IssueFieldSync.fieldName("  ", "Специальность", "field5", new HashSet<String>()));
    }

    @Test
    public void duplicateNamesGetASuffix() {
        assertEquals("Специальность 2", IssueFieldSync.fieldName(
                null, "Специальность", "field9", new HashSet<String>(Arrays.asList("специальность"))));
    }

    @Test
    public void sameQuestionIdInAnotherBlockIsADifferentField() {
        assertFalse(IssueFieldSync.marker("main", "field1").equals(IssueFieldSync.marker("block1", "field1")));
    }

    @Test
    public void questionStillInTheFormKeepsItsJiraField() {
        assertFalse(IssueFieldSync.orphan("sdf:main:field1", Collections.singleton("sdf:main:field1")));
    }

    @Test
    public void deletedQuestionIsRemovedFromJiraFields() {
        assertTrue(IssueFieldSync.orphan("sdf:main:field1", Collections.singleton("sdf:main:field2")));
        assertTrue(IssueFieldSync.orphan("sdf:main:field1", Collections.<String>emptySet()));
        assertTrue(IssueFieldSync.orphan("sdf:main:field1", null));
    }

    @Test
    public void fieldsThisPluginDidNotCreateStay() {
        Set<String> kept = Collections.emptySet();
        assertFalse(IssueFieldSync.orphan(null, kept));
        assertFalse(IssueFieldSync.orphan("", kept));
        assertFalse(IssueFieldSync.orphan("Организации", kept));
        assertFalse(IssueFieldSync.orphan("sdf", kept));
    }

    @Test
    public void keptMarkersIgnoreBlankQuestionsAndKeepTheRest() {
        RulesConfig config = new RulesConfig();
        FormBlock block = new FormBlock();
        block.setId("main");
        FormField kept = new FormField();
        kept.setId("field1");
        FormField blank = new FormField();
        blank.setId("  ");
        block.getFields().add(kept);
        block.getFields().add(blank);
        block.getFields().add(null);
        config.getBlocks().add(block);
        FormBlock other = new FormBlock();
        other.setId("block1");
        FormField sameId = new FormField();
        sameId.setId("field1");
        other.getFields().add(sameId);
        config.getBlocks().add(other);

        Set<String> markers = IssueFieldSync.keptMarkers(config);
        assertEquals(2, markers.size());
        assertTrue(markers.contains("sdf:main:field1"));
        assertTrue(markers.contains("sdf:block1:field1"));
        assertFalse(IssueFieldSync.orphan("sdf:main:field1", markers));
        assertTrue(IssueFieldSync.orphan("sdf:main:field9", markers));
    }

    @Test
    public void checkboxQuestionBecomesACheckboxField() {
        assertEquals("com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes",
                IssueFieldSync.fieldTypeKey("checkbox"));
        assertEquals("com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes",
                IssueFieldSync.fieldTypeKey("multiselect"));
        assertTrue(IssueFieldSync.checks("checkbox"));
    }

    @Test
    public void textQuestionStaysATextArea() {
        assertEquals("com.atlassian.jira.plugin.system.customfieldtypes:textarea",
                IssueFieldSync.fieldTypeKey("text"));
        assertEquals("com.atlassian.jira.plugin.system.customfieldtypes:textarea",
                IssueFieldSync.fieldTypeKey("select"));
        assertFalse(IssueFieldSync.checks("radio"));
    }

    @Test
    public void emptyFormKeepsNoQuestionMarkers() {
        assertTrue(IssueFieldSync.keptMarkers(new RulesConfig()).isEmpty());
        assertTrue(IssueFieldSync.keptMarkers(null).isEmpty());
    }
}
