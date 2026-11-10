package ru.saael.dynamicfields.service;

import org.junit.Test;
import ru.saael.dynamicfields.model.Condition;
import ru.saael.dynamicfields.model.FieldAfter;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.FormLink;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class RequiredAnswersTest {

    @Test
    public void visibleRequiredQuestionMustBeFilled() {
        RulesConfig form = form(true, null);
        assertEquals(Collections.singletonList("Дата"),
                RequiredAnswers.missing(form, answers("main", "date", Collections.<String>emptyList()), null));

        Map<String, Map<String, List<String>>> filled = answers("main", "date", Collections.singletonList("2026-11-06"));
        assertTrue(RequiredAnswers.missing(form, filled, null).isEmpty());
    }

    @Test
    public void hiddenRequiredQuestionCanStayEmpty() {
        Condition when = new Condition();
        when.setFieldId("kind");
        when.setValues(Collections.singletonList("Срочно"));
        RulesConfig form = form(true, when);
        Map<String, Map<String, List<String>>> answers = answers("main", "kind", Collections.singletonList("Обычно"));
        assertTrue(RequiredAnswers.missing(form, answers, null).isEmpty());

        answers.get("main").put("kind", Collections.singletonList("Срочно"));
        assertEquals(Collections.singletonList("Дата"), RequiredAnswers.missing(form, answers, null));
    }

    @Test
    public void existingPortalFieldIsNotAPluginQuestion() {
        RulesConfig form = form(true, null);
        form.getBlocks().get(0).getFields().get(1).setPortalFieldId("customfield_10100");
        assertTrue(RequiredAnswers.missing(form, answers("main", "date", Collections.<String>emptyList()), null).isEmpty());
    }

    @Test
    public void questionAfterAnUntickedOptionIsHidden() {
        FormField host = choice("kind", "Вид");
        FormField date = text("date", "Дата");
        date.setRequired(true);
        FieldAfter after = new FieldAfter();
        after.setFieldId("kind");
        after.setOption("Срочно");
        date.setAfter(after);
        RulesConfig form = config(host, date);
        Map<String, Map<String, List<String>>> answers = answers("main", "kind", Collections.singletonList("Обычно"));
        assertTrue(RequiredAnswers.missing(form, answers, null).isEmpty());
    }

    @Test
    public void portalConditionUsesTheIssueValue() {
        Condition when = new Condition();
        when.setSource("portal");
        when.setFieldId("customfield_10100");
        when.setValues(Collections.singletonList("Врач"));
        RulesConfig form = form(true, when);
        Map<String, List<String>> portal = new LinkedHashMap<String, List<String>>();
        portal.put("customfield_10100", Collections.singletonList("Медсестра"));
        assertTrue(RequiredAnswers.missing(form, answers("main", "kind", Collections.<String>emptyList()), portal).isEmpty());
        assertTrue(RequiredAnswers.portalIds(form).contains("customfield_10100"));
    }

    @Test
    public void configuredLinksAreShownNotAnswered() {
        FormField docs = new FormField();
        docs.setId("docs");
        docs.setLabel("Документы");
        docs.setType(FormField.URL);
        docs.setRequired(true);
        FormLink item = new FormLink();
        item.setText("Инструкция");
        item.setHref("https://example.test/guide");
        docs.setLinks(Collections.singletonList(item));
        assertTrue(RequiredAnswers.missing(config(docs),
                answers("main", "docs", Collections.<String>emptyList()), null).isEmpty());
    }

    @Test
    public void urlWithoutLinksStillNeedsAnAnswer() {
        FormField docs = new FormField();
        docs.setId("docs");
        docs.setLabel("Документы");
        docs.setType(FormField.URL);
        docs.setRequired(true);
        assertEquals(Collections.singletonList("Документы"),
                RequiredAnswers.missing(config(docs),
                        answers("main", "docs", Collections.<String>emptyList()), null));
    }

    private static RulesConfig form(boolean required, Condition when) {
        FormField kind = choice("kind", "Вид");
        FormField date = text("date", "Дата");
        date.setRequired(required);
        date.setWhen(when);
        return config(kind, date);
    }

    private static RulesConfig config(FormField... fields) {
        FormBlock block = new FormBlock();
        block.setId("main");
        block.setFields(Arrays.asList(fields));
        RulesConfig config = new RulesConfig();
        config.setBlocks(Collections.singletonList(block));
        return config;
    }

    private static FormField choice(String id, String label) {
        FormField field = new FormField();
        field.setId(id);
        field.setLabel(label);
        field.setType(FormField.SELECT);
        field.setOptions(Arrays.asList("Обычно", "Срочно"));
        return field;
    }

    private static FormField text(String id, String label) {
        FormField field = new FormField();
        field.setId(id);
        field.setLabel(label);
        field.setType(FormField.DATE);
        return field;
    }

    private static Map<String, Map<String, List<String>>> answers(String block, String field, List<String> values) {
        Map<String, List<String>> fields = new LinkedHashMap<String, List<String>>();
        fields.put(field, values);
        Map<String, Map<String, List<String>>> blocks = new LinkedHashMap<String, Map<String, List<String>>>();
        blocks.put(block, fields);
        return blocks;
    }
}
