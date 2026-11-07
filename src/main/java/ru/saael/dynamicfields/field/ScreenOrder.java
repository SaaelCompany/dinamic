package ru.saael.dynamicfields.field;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Puts the plugin's question fields on an issue screen into the same order as the form.
 * Other fields stay where they are, and the question fields gather at the first question's place.
 */
public final class ScreenOrder {

    private ScreenOrder() {
    }

    public static List<String> arrange(List<String> current, List<String> questions) {
        List<String> layout = current == null ? new ArrayList<String>() : current;
        List<String> wantedOrder = questions == null ? new ArrayList<String>() : questions;
        Set<String> ours = new HashSet<String>();
        for (int i = 0; i < wantedOrder.size(); i++) {
            if (wantedOrder.get(i) != null) {
                ours.add(wantedOrder.get(i));
            }
        }
        int first = -1;
        List<String> present = new ArrayList<String>();
        for (int i = 0; i < layout.size(); i++) {
            String id = layout.get(i);
            if (id != null && ours.contains(id)) {
                if (first < 0) {
                    first = i;
                }
                present.add(id);
            }
        }
        List<String> wanted = new ArrayList<String>();
        for (int i = 0; i < wantedOrder.size(); i++) {
            String id = wantedOrder.get(i);
            if (id != null && present.contains(id) && !wanted.contains(id)) {
                wanted.add(id);
            }
        }
        if (first < 0) {
            return new ArrayList<String>(layout);
        }
        List<String> next = new ArrayList<String>();
        for (int i = 0; i < first; i++) {
            next.add(layout.get(i));
        }
        next.addAll(wanted);
        for (int i = first; i < layout.size(); i++) {
            String id = layout.get(i);
            if (id == null || !ours.contains(id)) {
                next.add(id);
            }
        }
        return next;
    }
}
