package ru.saael.dynamicfields.service;

import org.junit.Test;

import java.util.Arrays;
import java.util.HashSet;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

public class IssueFieldSyncTest {

    @Test
    public void questionNameBecomesTheJiraFieldName() {
        assertEquals("Специальность", IssueFieldSync.fieldName("Специальность", "field5", new HashSet<String>()));
    }

    @Test
    public void blankQuestionUsesItsId() {
        assertEquals("field5", IssueFieldSync.fieldName("  ", "field5", new HashSet<String>()));
    }

    @Test
    public void duplicateNamesGetASuffix() {
        assertEquals("Специальность 2", IssueFieldSync.fieldName(
                "Специальность", "field9", new HashSet<String>(Arrays.asList("специальность"))));
    }

    @Test
    public void sameQuestionIdInAnotherBlockIsADifferentField() {
        assertFalse(IssueFieldSync.marker("main", "field1").equals(IssueFieldSync.marker("block1", "field1")));
    }
}
