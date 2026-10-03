package ru.saael.dynamicfields.panel;

import com.atlassian.plugin.PluginParseException;
import com.atlassian.plugin.web.Condition;
import ru.saael.dynamicfields.service.AnswersService;

import java.util.Map;

/**
 * Hides the issue panel when this request has no portal answers.
 */
public class AnswersCondition implements Condition {

    @Override
    public void init(Map<String, String> params) throws PluginParseException {
    }

    @Override
    public boolean shouldDisplay(Map<String, Object> context) {
        String issueKey = PanelSupport.issueKey(context);
        if (issueKey == null) {
            return false;
        }
        AnswersService service = PanelSupport.service();
        return service != null && service.hasRows(issueKey);
    }
}
