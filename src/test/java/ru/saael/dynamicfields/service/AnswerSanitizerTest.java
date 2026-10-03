package ru.saael.dynamicfields.service;

import org.junit.Test;
import ru.saael.dynamicfields.model.AnswerRow;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

public class AnswerSanitizerTest {

    private static RulesConfig form() {
        FormField category = new FormField();
        category.setId("category");
        category.setLabel("Категория");
        category.setType(FormField.CHECKBOX);
        category.setOptions(Arrays.asList("Медицинский сотрудник", "Административный персонал"));

        FormField note = new FormField();
        note.setId("note");
        note.setLabel("Комментарий");
        note.setType(FormField.TEXTAREA);

        FormBlock block = new FormBlock();
        block.setId("main");
        block.setTitle("Дополнительно");
        block.setFields(Arrays.asList(category, note));
        RulesConfig config = new RulesConfig();
        config.setBlocks(Collections.singletonList(block));
        return config;
    }

    @Test
    public void dropsUnknownFieldsAndUnknownOptions() {
        Map<String, List<String>> raw = new LinkedHashMap<String, List<String>>();
        raw.put("missing", Collections.singletonList("x"));
        raw.put("category", Arrays.asList("Нет такого", "Медицинский сотрудник", "Медицинский сотрудник"));
        raw.put("note", Arrays.asList("  первый  ", "второй"));

        Map<String, List<String>> clean = AnswerSanitizer.sanitize(form(), null, raw).get("main");
        assertFalse(clean.containsKey("missing"));
        assertEquals(Collections.singletonList("Медицинский сотрудник"), clean.get("category"));
        assertEquals(Collections.singletonList("первый"), clean.get("note"));
    }

    @Test
    public void truncatesTextAndBuildsRowsInFormOrder() {
        StringBuilder longText = new StringBuilder();
        for (int i = 0; i < AnswerSanitizer.MAX_TEXT + 25; i++) {
            longText.append('a');
        }
        Map<String, List<String>> raw = new LinkedHashMap<String, List<String>>();
        raw.put("note", Collections.singletonList(longText.toString()));
        raw.put("category", Arrays.asList("Административный персонал", "Медицинский сотрудник"));

        Map<String, List<String>> clean = AnswerSanitizer.sanitize(form(), null, raw).get("main");
        assertEquals(AnswerSanitizer.MAX_TEXT, clean.get("note").get(0).length());

        Map<String, Map<String, List<String>>> blocks = new LinkedHashMap<String, Map<String, List<String>>>();
        blocks.put("main", clean);
        List<AnswerRow> rows = AnswerSanitizer.rows(form(), blocks);
        assertEquals(2, rows.size());
        assertEquals("Дополнительно", rows.get(0).getGroup());
        assertEquals("Категория", rows.get(0).getLabel());
        assertEquals("Административный персонал, Медицинский сотрудник", rows.get(0).getValue());
        assertEquals("Комментарий", rows.get(1).getLabel());
    }
}
