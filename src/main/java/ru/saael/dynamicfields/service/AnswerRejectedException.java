package ru.saael.dynamicfields.service;

/**
 * A read or write of portal answers was refused. {@code status} is the HTTP status the REST layer should return.
 */
public class AnswerRejectedException extends Exception {

    private final int status;

    public AnswerRejectedException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
