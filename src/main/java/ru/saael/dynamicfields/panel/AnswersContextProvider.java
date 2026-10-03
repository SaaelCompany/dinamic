package ru.saael.dynamicfields.panel;

import com.atlassian.plugin.PluginParseException;
import com.atlassian.plugin.web.ContextProvider;
import ru.saael.dynamicfields.model.AnswerRow;
import ru.saael.dynamicfields.service.AnswerRejectedException;
import ru.saael.dynamicfields.service.AnswersService;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Puts already-escaped answer lines into the issue panel template.
 */
public class AnswersContextProvider implements ContextProvider {

    @Override
    public void init(Map<String, String> params) throws PluginParseException {
    }

    @Override
    public Map<String, Object> getContextMap(Map<String, Object> context) {
        List<AnswerRow> rows = Collections.emptyList();
        String issueKey = PanelSupport.issueKey(context);
        AnswersService service = PanelSupport.service();
        if (issueKey != null && service != null) {
            try {
                rows = PanelSupport.escapedRows(service.read(issueKey).getRows());
            } catch (AnswerRejectedException ignored) {
                rows = Collections.emptyList();
            }
        }
        Map<String, Object> model = new HashMap<String, Object>();
        model.put("sdfRows", rows);
        return model;
    }
}
