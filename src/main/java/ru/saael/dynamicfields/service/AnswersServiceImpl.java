package ru.saael.dynamicfields.service;

import com.atlassian.jira.entity.property.JsonEntityPropertyManager;
import com.atlassian.jira.issue.Issue;
import com.atlassian.jira.issue.IssueManager;
import com.atlassian.jira.permission.GlobalPermissionKey;
import com.atlassian.jira.permission.ProjectPermissions;
import com.atlassian.jira.security.GlobalPermissionManager;
import com.atlassian.jira.security.PermissionManager;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.spring.scanner.annotation.export.ExportAsService;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import com.atlassian.sal.api.pluginsettings.PluginSettings;
import com.atlassian.sal.api.pluginsettings.PluginSettingsFactory;
import org.codehaus.jackson.map.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.saael.dynamicfields.model.AnswerDocument;
import ru.saael.dynamicfields.model.AnswerRow;
import ru.saael.dynamicfields.model.FormField;
import ru.saael.dynamicfields.model.RulesConfig;

import javax.inject.Inject;
import javax.inject.Named;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

@ExportAsService(AnswersService.class)
@Named
public class AnswersServiceImpl implements AnswersService {

    private static final Logger log = LoggerFactory.getLogger(AnswersServiceImpl.class);

    static final String KEY_PREFIX = "ru.saael.dynamicfields.answer.";
    /** Issue entity property read by Automation for Jira as issue.properties.sdf.answers. */
    static final String PROPERTY_KEY = "sdf.answers";
    private static final String ISSUE_PROPERTY = "IssueProperty";
    /** A reporter may attach answers only to a request they just created. */
    static final long MAX_AGE_MS = 30L * 60L * 1000L;
    private static final Pattern ISSUE_KEY = Pattern.compile("^[A-Z][A-Z0-9]+-\\d+$");

    private static volatile AnswersService installed;

    private final PluginSettingsFactory pluginSettingsFactory;
    private final IssueManager issueManager;
    private final PermissionManager permissionManager;
    private final GlobalPermissionManager globalPermissionManager;
    private final RulesService rulesService;
    private final AdminAccess adminAccess;
    private final JsonEntityPropertyManager entityPropertyManager;
    private final ObjectMapper mapper = new ObjectMapper();

    @Inject
    public AnswersServiceImpl(@ComponentImport PluginSettingsFactory pluginSettingsFactory,
                              @ComponentImport IssueManager issueManager,
                              @ComponentImport PermissionManager permissionManager,
                              @ComponentImport GlobalPermissionManager globalPermissionManager,
                              RulesService rulesService,
                              AdminAccess adminAccess,
                              @ComponentImport JsonEntityPropertyManager entityPropertyManager) {
        this.pluginSettingsFactory = pluginSettingsFactory;
        this.issueManager = issueManager;
        this.permissionManager = permissionManager;
        this.globalPermissionManager = globalPermissionManager;
        this.rulesService = rulesService;
        this.adminAccess = adminAccess;
        this.entityPropertyManager = entityPropertyManager;
        installed = this;
    }

    /** Fallback for the issue panel, which is not a Spring bean. */
    public static AnswersService installed() {
        return installed;
    }

    @Override
    public AnswerDocument read(String issueKey) throws AnswerRejectedException {
        Issue issue = requireReadable(issueKey);
        return load(issue.getKey());
    }

    @Override
    public void save(String issueKey, Map<String, Map<String, List<String>>> blocks, Map<String, List<String>> legacyValues)
            throws AnswerRejectedException {
        Issue issue = requireWritable(issueKey);
        RulesConfig form = rulesService.getConfig();
        Map<String, Map<String, List<String>>> clean = AnswerSanitizer.sanitize(form, blocks, legacyValues);
        List<AnswerRow> rows = AnswerSanitizer.rows(form, clean);
        AnswerDocument document = new AnswerDocument();
        document.setBlocks(clean);
        document.setValues(flatten(clean));
        document.setRows(rows);
        try {
            settings().put(KEY_PREFIX + issue.getKey(), mapper.writeValueAsString(document));
        } catch (IOException e) {
            throw new IllegalStateException("Cannot store portal answers", e);
        }
        publishProperty(issue, document, form);
        log.info("Stored {} portal answer(s) on {}", rows.size(), issue.getKey());
    }

    /**
     * Copies answers onto the issue so Automation for Jira can read
     * {@code issue.properties.sdf.answers.values.<field id>}.
     */
    private void publishProperty(Issue issue, AnswerDocument document, RulesConfig form) {
        try {
            Map<String, String> values = new LinkedHashMap<String, String>();
            Map<String, List<String>> flat = document.getValues();
            if (flat != null) {
                for (Map.Entry<String, List<String>> entry : flat.entrySet()) {
                    values.put(entry.getKey(), join(entry.getValue()));
                }
            }
            Map<String, String> labels = new LinkedHashMap<String, String>();
            if (form != null && form.getBlocks() != null) {
                for (int b = 0; b < form.getBlocks().size(); b++) {
                    if (form.getBlocks().get(b) == null || form.getBlocks().get(b).getFields() == null) {
                        continue;
                    }
                    List<FormField> fields = form.getBlocks().get(b).getFields();
                    for (int i = 0; i < fields.size(); i++) {
                        if (fields.get(i) != null && fields.get(i).getId() != null) {
                            labels.put(fields.get(i).getId(), fields.get(i).getLabel() == null ? "" : fields.get(i).getLabel());
                        }
                    }
                }
            }
            Map<String, Object> property = new LinkedHashMap<String, Object>();
            property.put("values", values);
            property.put("labels", labels);
            entityPropertyManager.put(ISSUE_PROPERTY, issue.getId(), PROPERTY_KEY, mapper.writeValueAsString(property));
        } catch (RuntimeException e) {
            log.warn("Cannot publish portal answers on {} as an issue property", issue.getKey(), e);
        } catch (IOException e) {
            log.warn("Cannot publish portal answers on {} as an issue property", issue.getKey(), e);
        }
    }

    private static String join(List<String> values) {
        if (values == null || values.isEmpty()) {
            return "";
        }
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                text.append(", ");
            }
            text.append(values.get(i) == null ? "" : values.get(i));
        }
        return text.toString();
    }

    @Override
    public boolean hasRows(String issueKey) {
        try {
            AnswerDocument document = read(issueKey);
            return document.getRows() != null && !document.getRows().isEmpty();
        } catch (AnswerRejectedException e) {
            return false;
        }
    }

    private Issue requireReadable(String issueKey) throws AnswerRejectedException {
        Issue issue = find(issueKey);
        ApplicationUser user = adminAccess.currentUser();
        if (user == null || !canBrowse(user, issue)) {
            throw new AnswerRejectedException(403, "Browse permission is required");
        }
        return issue;
    }

    private Issue requireWritable(String issueKey) throws AnswerRejectedException {
        Issue issue = find(issueKey);
        ApplicationUser user = adminAccess.currentUser();
        if (user == null || !canWrite(user, issue)) {
            throw new AnswerRejectedException(403, "You cannot save answers for this request");
        }
        return issue;
    }

    private Issue find(String issueKey) throws AnswerRejectedException {
        if (issueKey == null || !ISSUE_KEY.matcher(issueKey).matches()) {
            throw new AnswerRejectedException(400, "Invalid issue key");
        }
        Issue issue = issueManager.getIssueByCurrentKey(issueKey);
        if (issue == null) {
            throw new AnswerRejectedException(404, "Issue not found");
        }
        return issue;
    }

    private boolean canBrowse(ApplicationUser user, Issue issue) {
        return isAdmin(user) || permissionManager.hasPermission(ProjectPermissions.BROWSE_PROJECTS, issue, user);
    }

    private boolean canWrite(ApplicationUser user, Issue issue) {
        if (isAdmin(user) || permissionManager.hasPermission(ProjectPermissions.EDIT_ISSUES, issue, user)) {
            return true;
        }
        if (issue.getReporter() == null || !user.getKey().equals(issue.getReporter().getKey())) {
            return false;
        }
        if (issue.getCreated() == null) {
            return false;
        }
        long age = System.currentTimeMillis() - issue.getCreated().getTime();
        return age >= 0 && age <= MAX_AGE_MS;
    }

    private boolean isAdmin(ApplicationUser user) {
        return globalPermissionManager.hasPermission(GlobalPermissionKey.ADMINISTER, user);
    }

    private static Map<String, List<String>> flatten(Map<String, Map<String, List<String>>> blocks) {
        Map<String, List<String>> flat = new LinkedHashMap<String, List<String>>();
        if (blocks == null) {
            return flat;
        }
        for (Map<String, List<String>> fields : blocks.values()) {
            if (fields == null) {
                continue;
            }
            flat.putAll(fields);
        }
        return flat;
    }

    private AnswerDocument load(String issueKey) {
        Object raw = settings().get(KEY_PREFIX + issueKey);
        if (raw == null || raw.toString().trim().isEmpty()) {
            return new AnswerDocument();
        }
        try {
            AnswerDocument document = mapper.readValue(raw.toString(), AnswerDocument.class);
            return document == null ? new AnswerDocument() : document;
        } catch (IOException e) {
            log.warn("Stored portal answers for {} are unreadable, ignoring them", issueKey);
            return new AnswerDocument();
        }
    }

    private PluginSettings settings() {
        return pluginSettingsFactory.createGlobalSettings();
    }
}
