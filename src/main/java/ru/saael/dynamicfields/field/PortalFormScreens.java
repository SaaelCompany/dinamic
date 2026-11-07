package ru.saael.dynamicfields.field;

import com.atlassian.event.api.EventListener;
import com.atlassian.event.api.EventPublisher;
import com.atlassian.jira.event.issue.field.CustomFieldCreatedEvent;
import com.atlassian.jira.issue.CustomFieldManager;
import com.atlassian.jira.issue.fields.CustomField;
import com.atlassian.jira.issue.fields.screen.FieldScreen;
import com.atlassian.jira.issue.fields.screen.FieldScreenLayoutItem;
import com.atlassian.jira.issue.fields.screen.FieldScreenScheme;
import com.atlassian.jira.issue.fields.screen.FieldScreenTab;
import com.atlassian.jira.issue.fields.screen.issuetype.IssueTypeScreenScheme;
import com.atlassian.jira.issue.fields.screen.issuetype.IssueTypeScreenSchemeEntity;
import com.atlassian.jira.issue.fields.screen.issuetype.IssueTypeScreenSchemeManager;
import com.atlassian.jira.issue.operation.IssueOperation;
import com.atlassian.jira.issue.operation.IssueOperations;
import com.atlassian.jira.project.Project;
import com.atlassian.jira.project.ProjectManager;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.inject.Inject;
import javax.inject.Named;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Jira Service Management offers a field in Request types only when that field
 * is already on the create screen of the request issue type.
 */
@Named
public class PortalFormScreens {

    private static final Logger log = LoggerFactory.getLogger(PortalFormScreens.class);
    private static final String SERVICE_DESK = "service_desk";

    private final CustomFieldManager customFieldManager;
    private final ProjectManager projectManager;
    private final IssueTypeScreenSchemeManager issueTypeScreenSchemeManager;
    private final EventPublisher eventPublisher;

    @Inject
    public PortalFormScreens(@ComponentImport CustomFieldManager customFieldManager,
                             @ComponentImport ProjectManager projectManager,
                             @ComponentImport IssueTypeScreenSchemeManager issueTypeScreenSchemeManager,
                             @ComponentImport EventPublisher eventPublisher) {
        this.customFieldManager = customFieldManager;
        this.projectManager = projectManager;
        this.issueTypeScreenSchemeManager = issueTypeScreenSchemeManager;
        this.eventPublisher = eventPublisher;
        eventPublisher.register(this);
        placeAll();
    }

    /**
     * Puts each question field on the view and edit screens, in the given order,
     * so the created request lists them like ordinary Jira fields.
     */
    public void placeQuestions(List<CustomField> fields) {
        if (fields == null || fields.isEmpty()) {
            return;
        }
        try {
            List<Project> projects = projectManager.getProjectObjects();
            List<String> order = new ArrayList<String>();
            for (int i = 0; i < fields.size(); i++) {
                CustomField field = fields.get(i);
                if (field == null || field.getDescription() == null || !field.getDescription().startsWith("sdf:")) {
                    continue;
                }
                order.add(field.getId());
                place(field, projects, IssueOperations.VIEW_ISSUE_OPERATION);
                place(field, projects, IssueOperations.EDIT_ISSUE_OPERATION);
            }
            orderScreens(order, projects);
        } catch (RuntimeException e) {
            log.warn("Cannot put question fields on the issue screen", e);
        }
    }

    private void orderScreens(List<String> order, List<Project> projects) {
        if (order.isEmpty() || projects == null) {
            return;
        }
        Set<Long> seen = new HashSet<Long>();
        IssueOperation[] operations = new IssueOperation[] {
                IssueOperations.VIEW_ISSUE_OPERATION,
                IssueOperations.EDIT_ISSUE_OPERATION
        };
        for (int i = 0; i < projects.size(); i++) {
            Project project = projects.get(i);
            if (!isServiceDesk(project)) {
                continue;
            }
            IssueTypeScreenScheme scheme = issueTypeScreenSchemeManager.getIssueTypeScreenScheme(project);
            if (scheme == null || scheme.getEntities() == null) {
                continue;
            }
            for (IssueTypeScreenSchemeEntity entity : scheme.getEntities()) {
                FieldScreenScheme screens = entity.getFieldScreenScheme();
                if (screens == null) {
                    continue;
                }
                for (int o = 0; o < operations.length; o++) {
                    FieldScreen screen = screens.getFieldScreen(operations[o]);
                    if (screen == null || screen.getId() == null || !seen.add(screen.getId())) {
                        continue;
                    }
                    orderScreen(screen, order);
                }
            }
        }
    }

    private void orderScreen(FieldScreen screen, List<String> order) {
        List<FieldScreenTab> tabs = screen.getTabs();
        if (tabs == null) {
            return;
        }
        for (int t = 0; t < tabs.size(); t++) {
            FieldScreenTab tab = tabs.get(t);
            if (tab == null || tab.getFieldScreenLayoutItems() == null) {
                continue;
            }
            List<FieldScreenLayoutItem> items = tab.getFieldScreenLayoutItems();
            List<String> current = new ArrayList<String>();
            List<Integer> slots = new ArrayList<Integer>();
            for (int i = 0; i < items.size(); i++) {
                String id = items.get(i) == null ? null : items.get(i).getFieldId();
                current.add(id);
                if (id != null && order.contains(id)) {
                    slots.add(Integer.valueOf(i));
                }
            }
            List<String> next = ScreenOrder.arrange(current, order);
            if (next.equals(current) || slots.isEmpty()) {
                continue;
            }
            int first = slots.get(0).intValue();
            for (int s = slots.size() - 1; s >= 0; s--) {
                tab.removeFieldScreenLayoutItem(slots.get(s).intValue());
            }
            List<String> wanted = new ArrayList<String>();
            for (int i = 0; i < order.size(); i++) {
                if (current.contains(order.get(i)) && !wanted.contains(order.get(i))) {
                    wanted.add(order.get(i));
                }
            }
            for (int w = 0; w < wanted.size(); w++) {
                tab.addFieldScreenLayoutItem(wanted.get(w), first + w);
            }
            tab.store();
            log.info("Ordered question fields on screen {}", screen.getName());
        }
    }

    @EventListener
    public void onCustomFieldCreated(CustomFieldCreatedEvent event) {
        if (event == null || !PortalFormFields.TYPE_KEY.equals(event.getFieldType())) {
            return;
        }
        CustomField field = customFieldManager.getCustomFieldObject(event.getCustomFieldId());
        if (field == null) {
            return;
        }
        try {
            place(field, projectManager.getProjectObjects(), IssueOperations.CREATE_ISSUE_OPERATION);
        } catch (RuntimeException e) {
            log.warn("Cannot put the new dynamic field on service project screens", e);
        }
    }

    public void placeAll() {
        try {
            List<CustomField> all = customFieldManager.getCustomFieldObjects();
            List<Project> projects = projectManager.getProjectObjects();
            for (int i = 0; i < all.size(); i++) {
                CustomField field = all.get(i);
                if (!isOurs(field)) {
                    continue;
                }
                place(field, projects, IssueOperations.CREATE_ISSUE_OPERATION);
            }
        } catch (RuntimeException e) {
            log.warn("Cannot put dynamic fields on service project screens", e);
        }
    }

    private void place(CustomField field, List<Project> projects, IssueOperation operation) {
        if (field == null || projects == null) {
            return;
        }
        Set<Long> seen = new HashSet<Long>();
        for (int i = 0; i < projects.size(); i++) {
            Project project = projects.get(i);
            if (!isServiceDesk(project)) {
                continue;
            }
            IssueTypeScreenScheme scheme = issueTypeScreenSchemeManager.getIssueTypeScreenScheme(project);
            if (scheme == null) {
                continue;
            }
            Collection<IssueTypeScreenSchemeEntity> entities = scheme.getEntities();
            if (entities == null) {
                continue;
            }
            for (IssueTypeScreenSchemeEntity entity : entities) {
                FieldScreenScheme screens = entity.getFieldScreenScheme();
                if (screens == null) {
                    continue;
                }
                addToScreen(screens.getFieldScreen(operation), field.getId(), seen);
            }
        }
    }

    private void addToScreen(FieldScreen screen, String fieldId, Set<Long> seen) {
        if (screen == null || screen.getId() == null || fieldId == null) {
            return;
        }
        if (!seen.add(screen.getId()) || screen.containsField(fieldId)) {
            return;
        }
        FieldScreenTab tab = screen.getTab(0);
        if (tab == null) {
            List<FieldScreenTab> tabs = screen.getTabs();
            tab = tabs == null || tabs.isEmpty() ? screen.addTab("Field Tab") : tabs.get(0);
        }
        tab.addFieldScreenLayoutItem(fieldId);
        log.info("Added {} to create screen {}", fieldId, screen.getName());
    }

    private static boolean isOurs(CustomField field) {
        return field != null
                && field.getCustomFieldType() != null
                && PortalFormFields.TYPE_KEY.equals(field.getCustomFieldType().getKey());
    }

    private static boolean isServiceDesk(Project project) {
        return project != null
                && project.getProjectTypeKey() != null
                && SERVICE_DESK.equals(project.getProjectTypeKey().getKey());
    }

    void unregister() {
        eventPublisher.unregister(this);
    }
}
