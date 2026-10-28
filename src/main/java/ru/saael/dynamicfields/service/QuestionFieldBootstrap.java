package ru.saael.dynamicfields.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.saael.dynamicfields.model.RulesConfig;

import javax.inject.Inject;
import javax.inject.Named;

/**
 * Creates the Jira field for every saved question and puts it on the issue screen
 * when the plugin starts, so a new request does not wait for another save in the builder.
 */
@Named
public class QuestionFieldBootstrap {

    private static final Logger log = LoggerFactory.getLogger(QuestionFieldBootstrap.class);

    @Inject
    public QuestionFieldBootstrap(RulesService rulesService) {
        try {
            RulesConfig config = rulesService.getConfig();
            if (config.fieldCount() == 0) {
                return;
            }
            // Saving writes the Jira field id onto each question. The customer portal
            // uses that id to hide the native copy and show one plain row in Подробности.
            rulesService.saveConfigJson(rulesService.toJson(config));
        } catch (InvalidRulesException e) {
            log.warn("Cannot prepare question fields: {}", e.getMessage());
        } catch (RuntimeException e) {
            log.warn("Cannot prepare question fields", e);
        }
    }
}
