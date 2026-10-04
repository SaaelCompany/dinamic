package ru.saael.dynamicfields.service;

import ru.saael.dynamicfields.model.RulesConfig;

/**
 * Persistence + (de)serialisation of the dynamic field rules.
 */
public interface RulesService {

    /** Currently stored configuration; never {@code null} (an empty configuration when nothing was saved yet). */
    RulesConfig getConfig();

    /** The stored configuration as pretty-printed JSON. */
    String getConfigJson();

    /** Example configuration bundled with the plugin (used by the "insert example" button). */
    String getExampleJson();

    /**
     * Validates and stores the configuration.
     *
     * @return the normalised (re-serialised) JSON that was stored
     * @throws InvalidRulesException when the JSON cannot be parsed or fails {@link RulesValidator}
     */
    String saveConfigJson(String json) throws InvalidRulesException;

    /** Parses JSON into a configuration object, without storing it. */
    RulesConfig parse(String json) throws InvalidRulesException;

    String toJson(RulesConfig config);
}
