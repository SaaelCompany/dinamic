package ru.saael.dynamicfields.service;

import org.junit.Test;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.Arrays;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.Set;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

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
    public void existingJiraFieldIsNotDeletedWithTheCanvasNode() {
        RulesConfig config = new RulesConfig();
        FormBlock block = new FormBlock();
        block.setId("main");
        FormField node = new FormField();
        node.setId("field1");
        node.setPortalFieldId("customfield_10100");
        block.getFields().add(node);
        config.getBlocks().add(block);

        Set<String> ids = IssueFieldSync.existingFieldIds(config);
        assertTrue(ids.contains("customfield_10100"));
        assertFalse(IssueFieldSync.orphan("Организации", IssueFieldSync.keptMarkers(config)));
        assertFalse(IssueFieldSync.orphan("customfield_10100", IssueFieldSync.keptMarkers(config)));

        node.setPortalFieldId(null);
        assertTrue(IssueFieldSync.existingFieldIds(config).isEmpty());
        assertTrue(IssueFieldSync.existingFieldIds(null).isEmpty());
    }

    @Test
    public void checkboxQuestionBecomesACheckboxField() {
        assertEquals(IssueFieldSync.CHECKBOX_TYPE, IssueFieldSync.fieldTypeKey("checkbox"));
        assertEquals(IssueFieldSync.MULTI_TYPE, IssueFieldSync.fieldTypeKey("multiselect"));
        assertEquals(IssueFieldSync.CHECKBOX_SEARCHER, IssueFieldSync.searcherKeyFor("checkbox"));
        assertTrue(IssueFieldSync.checks("checkbox"));
        assertTrue(IssueFieldSync.pluginType(IssueFieldSync.CHECKBOX_TYPE));
    }

    @Test
    public void eachQuestionBecomesTheMatchingJiraField() {
        assertEquals(IssueFieldSync.TEXT_TYPE, IssueFieldSync.fieldTypeKey("text"));
        assertEquals(IssueFieldSync.TEXT_TYPE, IssueFieldSync.fieldTypeKey("time"));
        assertEquals(IssueFieldSync.TYPE_KEY, IssueFieldSync.fieldTypeKey("textarea"));
        assertEquals(IssueFieldSync.DATE_TYPE, IssueFieldSync.fieldTypeKey("date"));
        assertEquals(IssueFieldSync.DATETIME_TYPE, IssueFieldSync.fieldTypeKey("datetime"));
        assertEquals(IssueFieldSync.NUMBER_TYPE, IssueFieldSync.fieldTypeKey("number"));
        assertEquals(IssueFieldSync.URL_TYPE, IssueFieldSync.fieldTypeKey("url"));
        assertEquals(IssueFieldSync.SELECT_TYPE, IssueFieldSync.fieldTypeKey("select"));
        assertEquals(IssueFieldSync.RADIO_TYPE, IssueFieldSync.fieldTypeKey("radio"));
        assertEquals(IssueFieldSync.DATE_SEARCHER, IssueFieldSync.searcherKeyFor("date"));
        assertEquals(IssueFieldSync.DATETIME_SEARCHER, IssueFieldSync.searcherKeyFor("datetime"));
        assertEquals(IssueFieldSync.NUMBER_SEARCHER, IssueFieldSync.searcherKeyFor("number"));
        assertEquals(IssueFieldSync.URL_SEARCHER, IssueFieldSync.searcherKeyFor("url"));
        assertEquals(IssueFieldSync.CHECKBOX_SEARCHER, IssueFieldSync.searcherKeyFor("select"));
        assertEquals(IssueFieldSync.SEARCHER_KEY, IssueFieldSync.searcherKeyFor("time"));
        assertEquals(IssueFieldSync.TYPE_KEY, IssueFieldSync.fieldTypeKey("unknown"));
        assertFalse(IssueFieldSync.checks("radio"));
        assertTrue(IssueFieldSync.options("select"));
        assertTrue(IssueFieldSync.pluginType(IssueFieldSync.DATE_TYPE));
        assertTrue(IssueFieldSync.pluginType(IssueFieldSync.DATETIME_TYPE));
        assertTrue(IssueFieldSync.pluginType(IssueFieldSync.SELECT_TYPE));
        assertTrue(IssueFieldSync.pluginType(IssueFieldSync.TYPE_KEY));
        assertFalse(IssueFieldSync.pluginType("com.atlassian.jira.plugin.system.customfieldtypes:userpicker"));
        assertFalse(IssueFieldSync.pluginType("ru.saael.jira.portal-dynamic-fields:portal-form"));
        assertFalse(IssueFieldSync.pluginType(null));
    }

    @Test
    public void dateNumberAndTimeValuesKeepTheirShape() {
        Date date = IssueFieldSync.parseDate("2026-11-06");
        Calendar calendar = Calendar.getInstance();
        calendar.setTime(date);
        assertEquals(2026, calendar.get(Calendar.YEAR));
        assertEquals(Calendar.NOVEMBER, calendar.get(Calendar.MONTH));
        assertEquals(6, calendar.get(Calendar.DAY_OF_MONTH));
        assertEquals(0, calendar.get(Calendar.HOUR_OF_DAY));

        Date stamp = IssueFieldSync.parseDateTime("2026-11-06T18:30");
        calendar.setTime(stamp);
        assertEquals(18, calendar.get(Calendar.HOUR_OF_DAY));
        assertEquals(30, calendar.get(Calendar.MINUTE));
        assertNull(IssueFieldSync.parseDate("  "));
        assertNull(IssueFieldSync.parseDateTime(""));
        assertEquals(Double.valueOf(3.5), IssueFieldSync.parseNumber("3,5"));
        assertNull(IssueFieldSync.parseNumber("  "));
        try {
            IssueFieldSync.parseDate("06.11.2026");
            fail("a date must be yyyy-MM-dd");
        } catch (IllegalArgumentException expected) {
            assertEquals("06.11.2026", expected.getMessage());
        }
    }

    @Test
    public void emptyFormKeepsNoQuestionMarkers() {
        assertTrue(IssueFieldSync.keptMarkers(new RulesConfig()).isEmpty());
        assertTrue(IssueFieldSync.keptMarkers(null).isEmpty());
    }
}
