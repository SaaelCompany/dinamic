package ru.saael.dynamicfields.service;

import org.codehaus.jackson.map.ObjectMapper;
import org.junit.Test;
import ru.saael.dynamicfields.model.Condition;
import ru.saael.dynamicfields.model.FormBlock;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import java.io.InputStream;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class RulesValidatorTest {

    private static FormField field(String id, String label, String type, String... options) {
        FormField field = new FormField();
        field.setId(id);
        field.setLabel(label);
        field.setType(type);
        field.setOptions(Arrays.asList(options));
        return field;
    }

    private static FormField when(FormField field, String parent, String... values) {
        Condition condition = new Condition();
        condition.setFieldId(parent);
        condition.setValues(Arrays.asList(values));
        field.setWhen(condition);
        return field;
    }

    private static RulesConfig config(FormField... fields) {
        return config("main", "Дополнительно", fields);
    }

    private static RulesConfig config(String blockId, String title, FormField... fields) {
        FormBlock block = new FormBlock();
        block.setId(blockId);
        block.setTitle(title);
        block.setFields(Arrays.asList(fields));
        RulesConfig config = new RulesConfig();
        config.setBlocks(Collections.singletonList(block));
        return config;
    }

    @Test
    public void emptyConfigurationIsValid() {
        assertTrue(RulesValidator.validate(new RulesConfig()).isEmpty());
    }

    @Test
    public void nestedMedicalFormIsValid() {
        RulesConfig config = config(
                field("category", "Категория сотрудника", FormField.CHECKBOX, "Медицинский сотрудник"),
                when(field("specialty", "Специальность", FormField.CHECKBOX, "Основная специальность"),
                        "category", "Медицинский сотрудник"),
                when(field("profile", "Профиль", FormField.SELECT, "Терапевт"),
                        "specialty", "Основная специальность"),
                when(field("experience", "Стаж", FormField.TEXT),
                        "specialty", "Основная специальность"),
                when(field("certs", "Сертификаты", FormField.CHECKBOX, "Есть сертификаты"),
                        "profile"),
                when(field("certlist", "Перечень", FormField.TEXTAREA),
                        "certs", "Есть сертификаты"));
        assertEquals(Collections.<String>emptyList(), RulesValidator.validate(config));
    }

    @Test
    public void bundledExampleIsValid() throws Exception {
        InputStream in = RulesValidatorTest.class.getResourceAsStream("/example-form.json");
        assertTrue(in != null);
        RulesConfig config = new ObjectMapper().readValue(in, RulesConfig.class);
        assertEquals(Collections.<String>emptyList(), RulesValidator.validate(config));
        assertEquals(1, config.getBlocks().size());
        assertEquals(7, config.getBlocks().get(0).getFields().size());
    }

    @Test
    public void version2DocumentBecomesOneBlock() throws Exception {
        String legacy = "{\"version\":2,\"title\":\"Дополнительно\",\"clearOnHide\":true,\"requestTypeIds\":[],"
                + "\"fields\":[{\"id\":\"category\",\"label\":\"Категория\",\"type\":\"text\"}]}";
        ObjectMapper mapper = new ObjectMapper();
        String current = ConfigNormalizer.toCurrent(legacy, mapper);
        RulesConfig config = mapper.readValue(current, RulesConfig.class);
        assertEquals(Collections.<String>emptyList(), RulesValidator.validate(config));
        assertEquals(3, config.getVersion());
        assertEquals("main", config.getBlocks().get(0).getId());
        assertEquals("Дополнительно", config.getBlocks().get(0).getTitle());
        assertEquals(1, config.getBlocks().get(0).getFields().size());
    }

    @Test
    public void version1IsNotMigrated() throws Exception {
        try {
            ConfigNormalizer.toCurrent("{\"version\":1,\"rules\":[]}", new ObjectMapper());
            assertTrue("version 1 must be rejected", false);
        } catch (InvalidRulesException e) {
            assertTrue(e.getErrors().get(0), e.getErrors().get(0).contains("version"));
        }
    }

    @Test
    public void sameFieldIdInAnotherBlockIsAllowed() {
        RulesConfig first = config("main", "One", field("note", "Note", FormField.TEXT));
        FormBlock second = new FormBlock();
        second.setId("extra");
        second.setTitle("Two");
        second.setFields(Collections.singletonList(field("note", "Other note", FormField.TEXT)));
        List<FormBlock> blocks = new java.util.ArrayList<FormBlock>();
        blocks.add(first.getBlocks().get(0));
        blocks.add(second);
        RulesConfig config = new RulesConfig();
        config.setBlocks(blocks);
        assertEquals(Collections.<String>emptyList(), RulesValidator.validate(config));
    }

    @Test
    public void oldVersionIsRejected() {
        RulesConfig config = new RulesConfig();
        config.setVersion(1);
        List<String> errors = RulesValidator.validate(config);
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("version"));
    }

    @Test
    public void missingLabelIsReported() {
        List<String> errors = RulesValidator.validate(config(field("category", "  ", FormField.TEXT)));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("name is required"));
    }

    @Test
    public void choiceMayOmitTheQuestion() {
        List<String> errors = RulesValidator.validate(config(
                field("category", "  ", FormField.RADIO, "Медицинский сотрудник")));
        assertEquals(Collections.<String>emptyList(), errors);
    }

    @Test
    public void choiceWithoutOptionsIsReported() {
        List<String> errors = RulesValidator.validate(config(
                field("category", "Категория", FormField.CHECKBOX)));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("option"));
    }

    @Test
    public void selfDependencyIsReported() {
        FormField field = field("category", "Категория", FormField.CHECKBOX, "Да");
        when(field, "category", "Да");
        List<String> errors = RulesValidator.validate(config(field));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("itself"));
    }

    @Test
    public void laterFieldIsReported() {
        RulesConfig config = config(
                when(field("child", "Child", FormField.TEXT), "parent"),
                field("parent", "Parent", FormField.TEXT));
        List<String> errors = RulesValidator.validate(config);
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("later"));
    }

    @Test
    public void placeAfterRequiresAFieldName() {
        RulesConfig config = config(field("note", "Note", FormField.TEXT));
        config.getBlocks().get(0).setPlace("after");
        config.getBlocks().get(0).setPlaceAfter("  ");
        List<String> errors = RulesValidator.validate(config);
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("follow"));
    }

    @Test
    public void duplicateIdIsReported() {
        RulesConfig config = config(
                field("category", "One", FormField.TEXT),
                field("category", "Two", FormField.TEXT));
        List<String> errors = RulesValidator.validate(config);
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("duplicate"));
    }
}
