package ru.saael.dynamicfields.rest;

import org.codehaus.jackson.JsonNode;
import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.node.ObjectNode;
import ru.saael.dynamicfields.model.AnswerDocument;
import ru.saael.dynamicfields.service.AnswerRejectedException;
import ru.saael.dynamicfields.service.AnswersService;

import javax.inject.Inject;
import javax.ws.rs.Consumes;
import javax.ws.rs.GET;
import javax.ws.rs.PUT;
import javax.ws.rs.Path;
import javax.ws.rs.PathParam;
import javax.ws.rs.Produces;
import javax.ws.rs.core.CacheControl;
import javax.ws.rs.core.MediaType;
import javax.ws.rs.core.Response;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code /rest/dynamic-fields/1.0/answers/{issueKey}} — read and write the portal answers of one request.
 * Not anonymous: the caller must be able to browse the issue, and writing is limited further.
 */
@Path("/answers")
@Produces(MediaType.APPLICATION_JSON)
public class AnswersResource {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final AnswersService answersService;

    @Inject
    public AnswersResource(AnswersService answersService) {
        this.answersService = answersService;
    }

    @GET
    @Path("/{issueKey}")
    public Response get(@PathParam("issueKey") String issueKey) {
        try {
            AnswerDocument document = answersService.read(issueKey);
            CacheControl cacheControl = new CacheControl();
            cacheControl.setNoCache(true);
            cacheControl.setNoStore(true);
            return Response.ok(MAPPER.writeValueAsString(document)).cacheControl(cacheControl).build();
        } catch (AnswerRejectedException e) {
            return error(e.getStatus(), e.getMessage());
        } catch (IOException e) {
            return error(500, "Cannot read answers");
        }
    }

    @PUT
    @Path("/{issueKey}")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response put(@PathParam("issueKey") String issueKey, String body) {
        Map<String, List<String>> values;
        try {
            values = parseValues(body);
        } catch (IOException e) {
            return error(400, "Invalid JSON");
        }
        try {
            answersService.save(issueKey, values);
            return Response.ok(MAPPER.writeValueAsString(answersService.read(issueKey))).build();
        } catch (AnswerRejectedException e) {
            return error(e.getStatus(), e.getMessage());
        } catch (IOException e) {
            return error(500, "Cannot store answers");
        }
    }

    private static Map<String, List<String>> parseValues(String body) throws IOException {
        Map<String, List<String>> values = new LinkedHashMap<String, List<String>>();
        if (body == null || body.trim().isEmpty()) {
            return values;
        }
        JsonNode root = MAPPER.readTree(body);
        JsonNode node = root.get("values");
        if (node == null || !node.isObject()) {
            return values;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = node.getFields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> entry = fields.next();
            List<String> list = new ArrayList<String>();
            JsonNode raw = entry.getValue();
            if (raw != null && raw.isArray()) {
                for (JsonNode item : raw) {
                    if (item != null && item.isTextual()) {
                        list.add(item.getTextValue());
                    }
                }
            } else if (raw != null && raw.isTextual()) {
                list.add(raw.getTextValue());
            }
            values.put(entry.getKey(), list);
        }
        return values;
    }

    private static Response error(int status, String message) {
        ObjectNode node = MAPPER.createObjectNode();
        node.put("error", message == null ? "" : message);
        return Response.status(status).entity(node.toString()).build();
    }
}
