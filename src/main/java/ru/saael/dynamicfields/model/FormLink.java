package ru.saael.dynamicfields.model;

import org.codehaus.jackson.annotate.JsonIgnoreProperties;

import java.util.List;

/**
 * A link shown on the portal for a link question. The address is what the customer opens.
 * Empty text shows the address itself.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class FormLink {

    private String text = "";
    private String href = "";

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text == null ? "" : text;
    }

    public String getHref() {
        return href;
    }

    public void setHref(String href) {
        this.href = href == null ? "" : href;
    }

    /** True when at least one row has an address, so the question is display content. */
    public static boolean hasAddress(List<FormLink> links) {
        if (links == null) {
            return false;
        }
        for (int i = 0; i < links.size(); i++) {
            FormLink link = links.get(i);
            if (link != null && link.getHref() != null && link.getHref().trim().length() > 0) {
                return true;
            }
        }
        return false;
    }

    /**
     * An address the portal may open. {@code http}, {@code https} and {@code mailto} pass through.
     * A host with a dot is accepted and the portal prefixes {@code https://}.
     * {@code javascript:} and {@code data:} are rejected.
     */
    public static boolean acceptable(String raw) {
        if (raw == null) {
            return false;
        }
        String text = raw.trim();
        if (text.isEmpty()) {
            return false;
        }
        String lower = text.toLowerCase();
        if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
            return false;
        }
        if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:")) {
            return true;
        }
        if (text.indexOf(' ') >= 0 || text.indexOf('\\') >= 0 || text.indexOf('<') >= 0 || text.indexOf('"') >= 0) {
            return false;
        }
        return text.indexOf('.') >= 0;
    }
}
