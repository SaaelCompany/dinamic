package ru.saael.dynamicfields.rest;

import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.node.ObjectNode;
import ru.saael.dynamicfields.service.AdminAccess;
import ru.saael.dynamicfields.service.ProjectFields;

import javax.inject.Inject;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;

/**
 * Existing Jira fields an administrator can use as a trigger for a dynamic question.
 * {@code GET /rest/dynamic-fields/1.0/project-fields}
 */
@Path("/project-fields")
@Produces(MediaType.APPLICATION_JSON)
public class ProjectFieldsResource {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ProjectFields projectFields;
    private final AdminAccess adminAccess;

    @Inject
    public ProjectFieldsResource(ProjectFields projectFields, AdminAccess adminAccess) {
        this.projectFields = projectFields;
        this.adminAccess = adminAccess;
    }

    @GET
    public Response list() {
        if (!adminAccess.isAdmin()) {
            ObjectNode node = MAPPER.createObjectNode();
            node.put("error", "Jira administrator permission is required");
            return Response.status(Response.Status.FORBIDDEN).entity(node.toString()).build();
        }
        return Response.ok(projectFields.toJson()).build();
    }
}
