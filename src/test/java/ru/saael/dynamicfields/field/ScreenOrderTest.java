package ru.saael.dynamicfields.field;

import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;

import static org.junit.Assert.assertEquals;

public class ScreenOrderTest {

    @Test
    public void questionFieldsGatherInFormOrder() {
        assertEquals(Arrays.asList("summary", "fieldB", "fieldA", "description"),
                ScreenOrder.arrange(
                        Arrays.asList("summary", "fieldA", "description", "fieldB"),
                        Arrays.asList("fieldB", "fieldA")));
    }

    @Test
    public void screenWithoutQuestionsStaysAsItIs() {
        assertEquals(Arrays.asList("summary", "description"),
                ScreenOrder.arrange(Arrays.asList("summary", "description"), Arrays.asList("fieldA")));
        assertEquals(Collections.emptyList(), ScreenOrder.arrange(null, null));
    }
}
