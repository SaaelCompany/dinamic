package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.Condition;
import ru.saael.dynamicfields.model.Rule;
import ru.saael.dynamicfields.model.RulesConfig;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Structural validation of a {@link RulesConfig}. Pure, stateless, unit-testable.
 */
public final class RulesValidator {

    private static final Pattern FIELD_ID = Pattern.compile("^[A-Za-z0-9_][A-Za-z0-9_:.\\-]*$");

    private RulesValidator() {
    }

    /**
     * @return list of validation errors; empty when the configuration is valid
     */
    public static List<String> validate(RulesConfig config) {
        List<String> errors = new ArrayList<String>();
        if (config == null) {
            errors.add("Configuration is empty");
            return errors;
        }
        if (config.getVersion() != RulesConfig.CURRENT_VERSION) {
            errors.add("Unsupported \"version\": " + config.getVersion()
                    + " (expected " + RulesConfig.CURRENT_VERSION + ")");
        }
        for (String selector : config.getContainerSelectors()) {
            if (isBlank(selector)) {
                errors.add("\"containerSelectors\" must not contain empty entries");
                break;
            }
        }

        Set<String> ids = new HashSet<String>();
        Map<String, Set<String>> dependsOn = new HashMap<String, Set<String>>();
        List<Rule> rules = config.getRules();
        for (int i = 0; i < rules.size(); i++) {
            Rule rule = rules.get(i);
            String label = ruleLabel(rule, i);
            if (rule == null) {
                errors.add(label + ": rule is null");
                continue;
            }
            if (!isBlank(rule.getId()) && !ids.add(rule.getId())) {
                errors.add(label + ": duplicate rule id \"" + rule.getId() + "\"");
            }
            Condition when = rule.getWhen();
            if (when == null) {
                errors.add(label + ": \"when\" is required");
            } else if (isBlank(when.getFieldId())) {
                errors.add(label + ": \"when.fieldId\" is required");
            } else if (!FIELD_ID.matcher(when.getFieldId()).matches()) {
                errors.add(label + ": \"when.fieldId\" has invalid format: \"" + when.getFieldId() + "\"");
            } else {
                for (String value : when.getValues()) {
                    if (value == null) {
                        errors.add(label + ": \"when.values\" must not contain null");
                        break;
                    }
                }
            }
            if (rule.getShow().isEmpty()) {
                errors.add(label + ": \"show\" must list at least one field");
            }
            for (String target : rule.getShow()) {
                if (isBlank(target)) {
                    errors.add(label + ": \"show\" contains an empty field id");
                } else if (!FIELD_ID.matcher(target).matches()) {
                    errors.add(label + ": \"show\" contains field id with invalid format: \"" + target + "\"");
                } else if (when != null && target.equals(when.getFieldId())) {
                    errors.add(label + ": field \"" + target + "\" cannot show itself");
                } else if (when != null && !isBlank(when.getFieldId())) {
                    Set<String> parents = dependsOn.get(target);
                    if (parents == null) {
                        parents = new LinkedHashSet<String>();
                        dependsOn.put(target, parents);
                    }
                    parents.add(when.getFieldId());
                }
            }
            if (rule.getPortalId() != null && rule.getPortalId() <= 0) {
                errors.add(label + ": \"portalId\" must be a positive number");
            }
            for (Long requestTypeId : rule.getRequestTypeIds()) {
                if (requestTypeId == null || requestTypeId <= 0) {
                    errors.add(label + ": \"requestTypeIds\" must contain positive numbers only");
                    break;
                }
            }
        }

        String cycle = findCycle(dependsOn);
        if (cycle != null) {
            errors.add("Circular dependency between fields: " + cycle
                    + " (such fields would never become visible)");
        }
        return errors;
    }

    private static String ruleLabel(Rule rule, int index) {
        if (rule != null && !isBlank(rule.getId())) {
            return "Rule \"" + rule.getId() + "\"";
        }
        return "Rule #" + (index + 1);
    }

    /**
     * Depth-first search for a cycle in the "field -> fields it depends on" graph.
     *
     * @return textual description of the first cycle found, or {@code null}
     */
    private static String findCycle(Map<String, Set<String>> dependsOn) {
        Set<String> done = new HashSet<String>();
        for (String start : dependsOn.keySet()) {
            List<String> path = new ArrayList<String>();
            String cycle = dfs(start, dependsOn, done, new HashSet<String>(), path);
            if (cycle != null) {
                return cycle;
            }
        }
        return null;
    }

    private static String dfs(String node, Map<String, Set<String>> graph, Set<String> done,
                              Set<String> onPath, List<String> path) {
        if (done.contains(node)) {
            return null;
        }
        if (!onPath.add(node)) {
            StringBuilder sb = new StringBuilder();
            boolean inCycle = false;
            for (String step : path) {
                if (step.equals(node)) {
                    inCycle = true;
                }
                if (inCycle) {
                    sb.append(step).append(" -> ");
                }
            }
            return sb.append(node).toString();
        }
        path.add(node);
        Set<String> parents = graph.get(node);
        if (parents != null) {
            for (String parent : parents) {
                String cycle = dfs(parent, graph, done, onPath, path);
                if (cycle != null) {
                    return cycle;
                }
            }
        }
        path.remove(path.size() - 1);
        onPath.remove(node);
        done.add(node);
        return null;
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }
}
