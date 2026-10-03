package ru.saael.dynamicfields.service;

import org.junit.Test;
import ru.saael.dynamicfields.model.Condition;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;
import ru.saael.dynamicfields.service.FieldCatalogSync.OwnedField;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class FieldCatalogSyncTest {

    @Test
    public void newCustomFieldBecomesAnEmptyBlock() {
        RulesConfig config = new RulesConfig();
        FieldCatalogSync.align(config, Collections.singletonList(new OwnedField("customfield_10150", "Анкета")));

        assertEquals(1, config.getBlocks().size());
        FormBlock block = config.getBlocks().get(0);
        assertEquals("customfield_10150", block.getCustomFieldId());
        assertEquals("Анкета", block.getCustomFieldName());
        assertEquals("f10150", block.getId());
        assertTrue(block.getFields().isEmpty());
    }

    @Test
    public void existingQuestionsStayWithTheirFieldAndASecondFieldIsAdded() {
        FormBlock saved = block("main", null, "Категория");
        RulesConfig config = new RulesConfig();
        config.setBlocks(Collections.singletonList(saved));

        FieldCatalogSync.align(config, Arrays.asList(
                new OwnedField("customfield_10138", "Динамические поля"),
                new OwnedField("customfield_10200", "Закупка")));

        assertEquals(2, config.getBlocks().size());
        assertEquals("customfield_10138", config.getBlocks().get(0).getCustomFieldId());
        assertEquals("main", config.getBlocks().get(0).getId());
        assertEquals("Категория", config.getBlocks().get(0).getFields().get(0).getLabel());
        assertEquals("customfield_10200", config.getBlocks().get(1).getCustomFieldId());
        assertEquals("f10200", config.getBlocks().get(1).getId());
        assertTrue(config.getBlocks().get(1).getFields().isEmpty());
    }

    @Test
    public void removedCustomFieldDropsItsBlock() {
        FormBlock saved = block("main", "customfield_10138", "Категория");
        RulesConfig config = new RulesConfig();
        config.setBlocks(Collections.singletonList(saved));

        FieldCatalogSync.align(config, Collections.<OwnedField>emptyList());

        assertTrue(config.getBlocks().isEmpty());
    }

    @Test
    public void newerFieldStaysEmptyWhenOlderQuestionsWereNotSavedYet() {
        FormBlock first = block("main", null, "Категория");
        FormBlock second = block("block1", null, "Телефон");
        RulesConfig config = new RulesConfig();
        config.getBlocks().add(first);
        config.getBlocks().add(second);

        FieldCatalogSync.align(config, Arrays.asList(
                new OwnedField("customfield_10139", "Анкета сотрудника"),
                new OwnedField("customfield_10138", "Динамические поля")));

        FormBlock created = find(config, "customfield_10139");
        FormBlock older = find(config, "customfield_10138");
        assertTrue(created.getFields().isEmpty());
        assertEquals("f10139", created.getId());
        assertEquals("main", older.getId());
        assertEquals(2, older.getFields().size());
        assertEquals("Категория", older.getFields().get(0).getLabel());
        assertEquals("Телефон", older.getFields().get(1).getLabel());
    }

    @Test
    public void deletedFieldDoesNotDonateItsQuestions() {
        RulesConfig config = new RulesConfig();
        config.getBlocks().add(block("main", "customfield_10138", "Категория"));
        config.getBlocks().add(block("old", "customfield_10001", "Секрет"));

        FieldCatalogSync.align(config, Collections.singletonList(new OwnedField("customfield_10138", "Динамические поля")));

        assertEquals(1, config.getBlocks().size());
        assertEquals(1, config.getBlocks().get(0).getFields().size());
        assertEquals("Категория", config.getBlocks().get(0).getFields().get(0).getLabel());
    }

    @Test
    public void extraOldBlockIsMergedWhenOnlyOneFieldRemains() {
        FormBlock first = block("main", null, "Категория");
        FormBlock second = block("block1", null, "Телефон");
        FormField child = new FormField();
        child.setId("field1");
        child.setLabel("Добавочный");
        Condition when = new Condition();
        when.setFieldId("field1");
        child.setWhen(when);
        second.getFields().add(child);
        RulesConfig config = new RulesConfig();
        config.getBlocks().add(first);
        config.getBlocks().add(second);

        FieldCatalogSync.align(config, Collections.singletonList(new OwnedField("customfield_10138", "Динамические поля")));

        assertEquals(1, config.getBlocks().size());
        FormBlock block = config.getBlocks().get(0);
        assertEquals("customfield_10138", block.getCustomFieldId());
        assertEquals(3, block.getFields().size());
        assertEquals("block1_field1", block.getFields().get(1).getId());
        assertEquals("block1_field1", block.getFields().get(2).getWhen().getFieldId());
    }

    private static FormBlock find(RulesConfig config, String customFieldId) {
        for (int i = 0; i < config.getBlocks().size(); i++) {
            if (customFieldId.equals(config.getBlocks().get(i).getCustomFieldId())) {
                return config.getBlocks().get(i);
            }
        }
        throw new AssertionError(customFieldId);
    }

    private static FormBlock block(String id, String customFieldId, String question) {
        FormBlock block = new FormBlock();
        block.setId(id);
        block.setCustomFieldId(customFieldId);
        FormField field = new FormField();
        field.setId("field1");
        field.setLabel(question);
        block.getFields().add(field);
        return block;
    }
}
