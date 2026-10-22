package ru.saael.dynamicfields.service;

import com.atlassian.jira.component.ComponentAccessor;
import com.atlassian.jira.user.ApplicationUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Names of Jira Service Management organizations. The Organizations field is a portal
 * dropdown, but its values are not custom-field options, so {@code OptionsManager} cannot see them.
 * Jira Software without Service Management simply has no such service.
 */
final class OrganizationDirectory {

    private static final Logger log = LoggerFactory.getLogger(OrganizationDirectory.class);
    private static final String SERVICE = "com.atlassian.servicedesk.api.organization.OrganizationService";

    private OrganizationDirectory() {
    }

    static List<String> names(ApplicationUser user) {
        if (user == null) {
            return Collections.emptyList();
        }
        Object service = service();
        if (service == null) {
            return Collections.emptyList();
        }
        Method method = findGetOrganizations(service.getClass());
        if (method == null) {
            log.debug("OrganizationService has no getOrganizations method");
            return Collections.emptyList();
        }
        List<String> names = new ArrayList<String>();
        int start = 0;
        int guard = 0;
        while (start < 5000 && guard < 50) {
            guard++;
            Object page = page(service, method, user, start);
            if (page == null) {
                break;
            }
            List<?> results = results(page);
            if (results == null || results.isEmpty()) {
                break;
            }
            for (int i = 0; i < results.size(); i++) {
                String name = nameOf(results.get(i));
                if (name != null && !name.trim().isEmpty()) {
                    names.add(name.trim());
                }
            }
            start += results.size();
            if (!hasNext(page)) {
                break;
            }
        }
        return names;
    }

    private static Object service() {
        try {
            Class<?> type = Class.forName(SERVICE);
            Object instance = ComponentAccessor.getOSGiComponentInstanceOfType(type);
            if (instance == null) {
                instance = ComponentAccessor.getComponentOfType(type);
            }
            return instance;
        } catch (ClassNotFoundException e) {
            log.debug("Jira Service Management organizations are not installed");
            return null;
        } catch (RuntimeException e) {
            log.debug("Cannot reach the organization service", e);
            return null;
        }
    }

    private static Method findGetOrganizations(Class<?> type) {
        Method[] methods = type.getMethods();
        for (int i = 0; i < methods.length; i++) {
            Method method = methods[i];
            if (!"getOrganizations".equals(method.getName()) || method.getParameterTypes().length != 3) {
                continue;
            }
            Class<?>[] params = method.getParameterTypes();
            if (ApplicationUser.class.isAssignableFrom(params[0])
                    && (params[1] == int.class || params[1] == Integer.class)
                    && (params[2] == int.class || params[2] == Integer.class)) {
                return method;
            }
        }
        return null;
    }

    private static Object page(Object service, Method method, ApplicationUser user, int start) {
        try {
            Object raw = method.invoke(service, user, Integer.valueOf(start), Integer.valueOf(100));
            return unwrap(raw);
        } catch (Exception e) {
            log.debug("Cannot list organizations from " + start, e);
            return null;
        }
    }

    private static Object unwrap(Object value) {
        if (value == null) {
            return null;
        }
        String type = value.getClass().getName();
        try {
            if (type.endsWith(".Either")) {
                Object right = value.getClass().getMethod("isRight").invoke(value);
                if (!(right instanceof Boolean) || !((Boolean) right).booleanValue()) {
                    return null;
                }
                return unwrap(value.getClass().getMethod("right").invoke(value));
            }
            if (type.endsWith(".Option")) {
                Object defined = value.getClass().getMethod("isDefined").invoke(value);
                if (!(defined instanceof Boolean) || !((Boolean) defined).booleanValue()) {
                    return null;
                }
                return value.getClass().getMethod("get").invoke(value);
            }
        } catch (Exception e) {
            log.debug("Cannot unwrap " + type, e);
            return null;
        }
        return value;
    }

    private static List<?> results(Object page) {
        try {
            Object raw = page.getClass().getMethod("getResults").invoke(page);
            if (raw instanceof List) {
                return (List<?>) raw;
            }
        } catch (Exception e) {
            log.debug("Organization page has no results", e);
        }
        return null;
    }

    private static boolean hasNext(Object page) {
        try {
            Object raw = page.getClass().getMethod("hasNextPage").invoke(page);
            return raw instanceof Boolean && ((Boolean) raw).booleanValue();
        } catch (Exception e) {
            return false;
        }
    }

    private static String nameOf(Object organization) {
        if (organization == null) {
            return null;
        }
        try {
            Object name = organization.getClass().getMethod("getName").invoke(organization);
            return name == null ? null : String.valueOf(name);
        } catch (Exception e) {
            return null;
        }
    }
}
