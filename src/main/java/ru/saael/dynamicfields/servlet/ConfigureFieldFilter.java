package ru.saael.dynamicfields.servlet;

import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import ru.saael.dynamicfields.field.PortalFormFields;

import javax.inject.Inject;
import javax.inject.Named;
import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Custom fields → Configure opens the question builder for a field of this plugin.
 */
@Named
public class ConfigureFieldFilter implements Filter {

    static final String FIELD_ATTRIBUTE = "sdf.fieldId";

    private final CustomFieldManager customFieldManager;

    @Inject
    public ConfigureFieldFilter(@ComponentImport CustomFieldManager customFieldManager) {
        this.customFieldManager = customFieldManager;
    }

    @Override
    public void init(FilterConfig filterConfig) {
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        if (!(request instanceof HttpServletRequest) || !(response instanceof HttpServletResponse)) {
            chain.doFilter(request, response);
            return;
        }
        HttpServletRequest http = (HttpServletRequest) request;
        if (http.getParameter("screens") != null) {
            chain.doFilter(request, response);
            return;
        }
        String fieldId = first(http.getParameter("customFieldId"), http.getParameter("fieldId"));
        if (!isFieldId(fieldId) || !isOurs(fieldId)) {
            chain.doFilter(request, response);
            return;
        }
        http.setAttribute(FIELD_ATTRIBUTE, fieldId);
        http.getRequestDispatcher("/plugins/servlet/dynamic-fields/admin").forward(request, response);
    }

    @Override
    public void destroy() {
    }

    private boolean isOurs(String fieldId) {
        try {
            CustomField field = customFieldManager.getCustomFieldObject(fieldId);
            return field != null
                    && field.getCustomFieldType() != null
                    && PortalFormFields.TYPE_KEY.equals(field.getCustomFieldType().getKey());
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static String first(String primary, String fallback) {
        if (primary != null && !primary.trim().isEmpty()) {
            return primary.trim();
        }
        return fallback == null ? "" : fallback.trim();
    }

    static boolean isFieldId(String fieldId) {
        if (fieldId == null || !fieldId.startsWith("customfield_")) {
            return false;
        }
        for (int i = "customfield_".length(); i < fieldId.length(); i++) {
            if (!Character.isDigit(fieldId.charAt(i))) {
                return false;
            }
        }
        return fieldId.length() > "customfield_".length();
    }
}
