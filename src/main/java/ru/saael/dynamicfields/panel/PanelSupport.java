package ru.saael.dynamicfields.panel;

import com.atlassian.jira.component.ComponentAccessor;
import com.atlassian.jira.issue.Issue;
import ru.saael.dynamicfields.model.AnswerRow;
import ru.saael.dynamicfields.service.AnswersService;
import ru.saael.dynamicfields.service.AnswersServiceImpl;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The issue panel is created by the plugin system, not by Spring, so the service is looked up here.
 */
final class PanelSupport {

    private PanelSupport() {
    }

    static AnswersService service() {
        try {
            AnswersService osgi = ComponentAccessor.getOSGiComponentInstanceOfType(AnswersService.class);
            if (osgi != null) {
                return osgi;
            }
        } catch (RuntimeException ignored) {
            // fall through to the instance published by the Spring bean
        }
        return AnswersServiceImpl.installed();
    }

    static String issueKey(Map<String, Object> context) {
        if (context == null) {
            return null;
        }
        Object issue = context.get("issue");
        if (issue instanceof Issue) {
            return ((Issue) issue).getKey();
        }
        return null;
    }

    static List<AnswerRow> escapedRows(List<AnswerRow> rows) {
        List<AnswerRow> escaped = new ArrayList<AnswerRow>();
        if (rows == null) {
            return escaped;
        }
        for (AnswerRow row : rows) {
            if (row == null) {
                continue;
            }
            escaped.add(new AnswerRow(escape(row.getLabel()), escape(row.getValue())));
        }
        return escaped;
    }

    static String escape(String value) {
        if (value == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '&':
                    sb.append("&amp;");
                    break;
                case '<':
                    sb.append("&lt;");
                    break;
                case '>':
                    sb.append("&gt;");
                    break;
                case '"':
                    sb.append("&quot;");
                    break;
                case '\'':
                    sb.append("&#39;");
                    break;
                default:
                    sb.append(c);
            }
        }
        return sb.toString();
    }
}
