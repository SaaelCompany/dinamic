package ru.saael.dynamicfields.service;

import java.util.Collections;
import java.util.List;

/**
 * Thrown when a configuration document fails validation; carries human readable messages for the admin UI.
 */
public class InvalidRulesException extends Exception {

    private final List<String> errors;

    public InvalidRulesException(List<String> errors) {
        super(errors.isEmpty() ? "Invalid rules" : errors.get(0));
        this.errors = Collections.unmodifiableList(errors);
    }

    public List<String> getErrors() {
        return errors;
    }
}
