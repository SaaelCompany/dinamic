package ru.saael.dynamicfields.service;

import org.junit.Test;
import ru.saael.dynamicfields.model.Condition;
import ru.saael.dynamicfields.model.Rule;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class RulesValidatorTest {

    private static Rule rule(String id, String trigger, List<String> values, String... show) {
        Rule rule = new Rule();
        rule.setId(id);
        Condition when = new Condition();
        when.setFieldId(trigger);
        when.setValues(values);
        rule.setWhen(when);
        rule.setShow(Arrays.asList(show));
        return rule;
    }

    private static RulesConfig config(Rule... rules) {
        RulesConfig config = new RulesConfig();
        config.setRules(Arrays.asList(rules));
        return config;
    }

    @Test
    public void emptyConfigurationIsValid() {
        assertTrue(RulesValidator.validate(new RulesConfig()).isEmpty());
    }

    @Test
    public void nestedRulesAreValid() {
        RulesConfig config = config(
                rule("medical", "customfield_10100", Arrays.asList("Медицинский сотрудник"), "customfield_10101"),
                rule("main", "customfield_10101", Arrays.asList("Основная специальность"),
                        "customfield_10102", "customfield_10103"),
                rule("additional", "customfield_10101", Arrays.asList("Дополнительная специальность"),
                        "customfield_10104"),
                rule("certs", "customfield_10103", Arrays.<String>asList(), "customfield_10105"));
        assertEquals(Arrays.<String>asList(), RulesValidator.validate(config));
    }

    @Test
    public void missingConditionIsReported() {
        Rule rule = rule("r1", "customfield_10100", Arrays.<String>asList(), "customfield_10101");
        rule.setWhen(null);
        List<String> errors = RulesValidator.validate(config(rule));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("\"when\" is required"));
    }

    @Test
    public void emptyShowIsReported() {
        Rule rule = rule("r1", "customfield_10100", Arrays.<String>asList());
        List<String> errors = RulesValidator.validate(config(rule));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("\"show\""));
    }

    @Test
    public void selfReferenceIsReported() {
        Rule rule = rule("r1", "customfield_10100", Arrays.<String>asList(), "customfield_10100");
        List<String> errors = RulesValidator.validate(config(rule));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("cannot show itself"));
    }

    @Test
    public void circularDependencyIsReported() {
        RulesConfig config = config(
                rule("a", "customfield_1", Arrays.<String>asList(), "customfield_2"),
                rule("b", "customfield_2", Arrays.<String>asList(), "customfield_3"),
                rule("c", "customfield_3", Arrays.<String>asList(), "customfield_1"));
        List<String> errors = RulesValidator.validate(config);
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).startsWith("Circular dependency"));
    }

    @Test
    public void duplicateIdsAndBadScopesAreReported() {
        Rule first = rule("dup", "customfield_1", Arrays.<String>asList(), "customfield_2");
        Rule second = rule("dup", "customfield_1", Arrays.<String>asList(), "customfield_3");
        second.setPortalId(0L);
        second.setRequestTypeIds(Arrays.asList(5L, -1L));
        List<String> errors = RulesValidator.validate(config(first, second));
        assertEquals(errors.toString(), 3, errors.size());
    }

    @Test
    public void invalidFieldIdFormatIsReported() {
        Rule rule = rule("r1", "customfield_10100\"]", Arrays.<String>asList(), "ok_field");
        List<String> errors = RulesValidator.validate(config(rule));
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("invalid format"));
    }

    @Test
    public void unsupportedVersionIsReported() {
        RulesConfig config = new RulesConfig();
        config.setVersion(42);
        List<String> errors = RulesValidator.validate(config);
        assertEquals(1, errors.size());
        assertTrue(errors.get(0), errors.get(0).contains("version"));
    }
}
