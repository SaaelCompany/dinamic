package ru.saael.dynamicfields.servlet;

import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import com.atlassian.sal.api.auth.LoginUriProvider;
import com.atlassian.sal.api.message.I18nResolver;
import com.atlassian.templaterenderer.TemplateRenderer;
import com.atlassian.webresource.api.assembler.PageBuilderService;
import ru.saael.dynamicfields.field.PortalFormFields;
import ru.saael.dynamicfields.field.PortalFormScreens;
import ru.saael.dynamicfields.service.AdminAccess;
import ru.saael.dynamicfields.service.RulesService;

import javax.inject.Inject;
import javax.servlet.ServletException;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;

/**
 * Administration page: {@code /plugins/servlet/dynamic-fields/admin}.
 */
public class AdminServlet extends HttpServlet {

    private static final String TEMPLATE = "/templates/admin.vm";
    private static final String ADMIN_RESOURCES = "ru.saael.jira.portal-dynamic-fields:admin-resources";

    private final TemplateRenderer templateRenderer;
    private final PageBuilderService pageBuilderService;
    private final LoginUriProvider loginUriProvider;
    private final I18nResolver i18n;
    private final AdminAccess adminAccess;
    private final RulesService rulesService;
    private final CustomFieldManager customFieldManager;
    private final PortalFormScreens portalFormScreens;

    @Inject
    public AdminServlet(@ComponentImport TemplateRenderer templateRenderer,
                        @ComponentImport PageBuilderService pageBuilderService,
                        @ComponentImport LoginUriProvider loginUriProvider,
                        @ComponentImport I18nResolver i18n,
                        @ComponentImport CustomFieldManager customFieldManager,
                        AdminAccess adminAccess,
                        RulesService rulesService,
                        PortalFormScreens portalFormScreens) {
        this.templateRenderer = templateRenderer;
        this.pageBuilderService = pageBuilderService;
        this.loginUriProvider = loginUriProvider;
        this.i18n = i18n;
        this.customFieldManager = customFieldManager;
        this.adminAccess = adminAccess;
        this.rulesService = rulesService;
        this.portalFormScreens = portalFormScreens;
    }

    @Override
    protected void doGet(HttpServletRequest request, HttpServletResponse response)
            throws ServletException, IOException {
        if (adminAccess.currentUser() == null) {
            response.sendRedirect(loginUriProvider.getLoginUri(requestUri(request)).toASCIIString());
            return;
        }
        if (!adminAccess.isAdmin()) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "Jira administrator permission is required");
            return;
        }

        portalFormScreens.placeAll();
        String onlyFieldId = onlyField(request);
        String fieldName = fieldName(onlyFieldId);

        Map<String, Object> context = new HashMap<String, Object>();
        context.put("contextPath", request.getContextPath());
        context.put("i18n", i18n);
        context.put("rulesJsonHtml", escapeHtml(rulesService.getConfigJson()));
        context.put("fieldCount", rulesService.getConfig().fieldCount());
        context.put("blockCount", rulesService.getConfig().getBlocks().size());
        context.put("onlyFieldId", onlyFieldId);
        context.put("fieldName", escapeHtml(fieldName));
        context.put("pageTitle", escapeHtml(fieldName.isEmpty()
                ? i18n.getText("ru.saael.dynamicfields.admin.title")
                : fieldName));

        pageBuilderService.assembler().resources().requireWebResource(ADMIN_RESOURCES);
        response.setContentType("text/html;charset=utf-8");
        templateRenderer.render(TEMPLATE, context, response.getWriter());
    }

    private String onlyField(HttpServletRequest request) {
        Object forwarded = request.getAttribute(ConfigureFieldFilter.FIELD_ATTRIBUTE);
        String raw = forwarded == null ? request.getParameter("customFieldId") : String.valueOf(forwarded);
        if (!ConfigureFieldFilter.isFieldId(raw)) {
            return "";
        }
        return isOurs(raw) ? raw : "";
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

    private String fieldName(String fieldId) {
        if (fieldId.isEmpty()) {
            return "";
        }
        try {
            CustomField field = customFieldManager.getCustomFieldObject(fieldId);
            return field == null || field.getName() == null ? fieldId : field.getName();
        } catch (RuntimeException e) {
            return fieldId;
        }
    }

    private static String escapeHtml(String text) {
        StringBuilder sb = new StringBuilder(text.length() + 32);
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
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

    private static URI requestUri(HttpServletRequest request) {
        StringBuffer url = request.getRequestURL();
        if (request.getQueryString() != null) {
            url.append('?').append(request.getQueryString());
        }
        return URI.create(url.toString());
    }
}
