package ru.saael.dynamicfields.service;

import com.atlassian.jira.permission.GlobalPermissionKey;
import com.atlassian.jira.security.GlobalPermissionManager;
import com.atlassian.jira.security.JiraAuthenticationContext;
import com.atlassian.jira.user.ApplicationUser;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;

import javax.inject.Inject;
import javax.inject.Named;

/**
 * Only Jira administrators may read/change the configuration page and the admin REST endpoints.
 */
@Named
public class AdminAccess {

    private final JiraAuthenticationContext authenticationContext;
    private final GlobalPermissionManager globalPermissionManager;

    @Inject
    public AdminAccess(@ComponentImport JiraAuthenticationContext authenticationContext,
                       @ComponentImport GlobalPermissionManager globalPermissionManager) {
        this.authenticationContext = authenticationContext;
        this.globalPermissionManager = globalPermissionManager;
    }

    public ApplicationUser currentUser() {
        return authenticationContext.getLoggedInUser();
    }

    public boolean isAdmin() {
        ApplicationUser user = currentUser();
        return user != null && globalPermissionManager.hasPermission(GlobalPermissionKey.ADMINISTER, user);
    }
}
