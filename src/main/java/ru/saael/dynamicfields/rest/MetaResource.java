package ru.saael.dynamicfields.rest;

import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.node.ObjectNode;
import ru.saael.dynamicfields.service.AdminAccess;
import ru.saael.dynamicfields.service.FieldMetaService;

import javax.inject.Inject;
import javax.ws.rs.GET;
import javax.ws.rs.Path;
import javax.ws.rs.Produces;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import java.io.IOException;

/**
 * Metadata for the visual rule builder: {@code GET /rest/dynamic-fields/1.0/meta/fields} (administrators only).
 */
@Path("/meta")
@Produces(MediaType.APPLICATION_JSON)
public class MetaResource {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final FieldMetaService fieldMetaService;
    private final AdminAccess adminAccess;

    @Inject
    public MetaResource(FieldMetaService fieldMetaService, AdminAccess adminAccess) {
        this.fieldMetaService = fieldMetaService;
        this.adminAccess = adminAccess;
    }

    @GET
    @Path("/fields")
    public Response fields() throws IOException {
        if (!adminAccess.isAdmin()) {
            ObjectNode node = MAPPER.createObjectNode();
            node.put("error", "Jira administrator permission is required");
            return Response.status(Response.Status.FORBIDDEN).entity(node.toString()).build();
        }
        return Response.ok(MAPPER.writeValueAsString(fieldMetaService.allFields())).build();
    }
}
