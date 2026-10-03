package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.AnswerDocument;
import ru.saael.dynamicfields.model.AnswerRow;

import java.util.List;
import java.util.Map;

/**
 * Stores portal answers against an issue. The customer does not need edit permission:
 * the reporter of a just-created request may write, and anyone who can browse the issue may read.
 */
public interface AnswersService {

    AnswerDocument read(String issueKey) throws AnswerRejectedException;

    /** Rows for the issue details field. Empty when the issue has no portal answers. */
    List<AnswerRow> storedRows(String issueKey);

    /** Rows that belong to one plugin custom field. */
    List<AnswerRow> storedRows(String issueKey, String customFieldId);

    /**
     * @param blocks block id → field id → values; {@code null} means the body used the legacy flat {@code values} map
     * @param legacyValues flat field id → values from plugin 2.0, used only when {@code blocks} is null
     */
    void save(String issueKey, Map<String, Map<String, List<String>>> blocks, Map<String, List<String>> legacyValues)
            throws AnswerRejectedException;

    /** True when the current user may see the issue and it has at least one stored answer. */
    boolean hasRows(String issueKey);
}
