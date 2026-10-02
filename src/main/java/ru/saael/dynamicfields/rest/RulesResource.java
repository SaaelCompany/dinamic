package ru.saael.dynamicfields.rest;

import com.atlassian.plugins.rest.common.security.AnonymousAllowed;
import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.node.ArrayNode;
import org.codehaus.jackson.node.ObjectNode;
import ru.saael.dynamicfields.service.AdminAccess;
import ru.saael.dynamicfields.service.InvalidRulesException;
import ru.saael.dynamicfields.service.RulesService;

import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.POST;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.CacheControl;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

/**
 * REST API: {@code /rest/dynamic-fields/1.0/rules}
 * <ul>
 *   <li>{@code GET  /rules}          - rules for the customer portal (anonymous allowed, portals may be public);</li>
 *   <li>{@code PUT  /rules}          - save rules (Jira administrators only);</li>
 *   <li>{@code POST /rules/validate} - validate without saving (Jira administrators only);</li>
 *   <li>{@code GET  /rules/example}  - bundled example (Jira administrators only).</li>
 * </ul>
 */
@Path("/rules")
@Produces(MediaType.APPLICATION_JSON)
public class RulesResource {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final RulesService rulesService;
    private final AdminAccess adminAccess;

    @Inject
    public RulesResource(RulesService rulesService, AdminAccess adminAccess) {
        this.rulesService = rulesService;
        this.adminAccess = adminAccess;
    }

    @GET
    @AnonymousAllowed
    public Response getRules() {
        CacheControl cacheControl = new CacheControl();
        cacheControl.setNoCache(true);
        cacheControl.setNoStore(true);
        return Response.ok(rulesService.getConfigJson()).cacheControl(cacheControl).build();
    }

    @GET
    @Path("/example")
    public Response getExample() {
        if (!adminAccess.isAdmin()) {
            return forbidden();
        }
        return Response.ok(rulesService.getExampleJson()).build();
    }

    @PUT
    @Consumes(MediaType.APPLICATION_JSON)
    public Response saveRules(String body) {
        if (!adminAccess.isAdmin()) {
            return forbidden();
        }
        try {
            String stored = rulesService.saveConfigJson(body);
            return Response.ok(stored).build();
        } catch (InvalidRulesException e) {
            return validationError(e);
        }
    }

    @POST
    @Path("/validate")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response validateRules(String body) {
        if (!adminAccess.isAdmin()) {
            return forbidden();
        }
        try {
            rulesService.parse(body);
            ObjectNode ok = MAPPER.createObjectNode();
            ok.put("valid", true);
            return Response.ok(ok.toString()).build();
        } catch (InvalidRulesException e) {
            return validationError(e);
        }
    }

    private static Response forbidden() {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("error", "Jira administrator permission is required");
        return Response.status(Response.Status.FORBIDDEN).entity(node.toString()).build();
    }

    private static Response validationError(InvalidRulesException e) {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("valid", false);
        ArrayNode errors = node.putArray("errors");
        for (String error : e.getErrors()) {
            errors.add(error);
        }
        return Response.status(Response.Status.BAD_REQUEST).entity(node.toString()).build();
    }
}
