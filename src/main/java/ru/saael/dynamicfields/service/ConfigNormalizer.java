package ru.saael.dynamicfields.service;

import org.codehaus.jackson.JsonNode;
import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.node.ArrayNode;
import org.codehaus.jackson.node.ObjectNode;
import ru.saael.dynamicfields.model.RulesConfig;

import java.io.IOException;
import java.util.Collections;

/**
 * Turns a stored version 2 document (one form at the top level) into version 3 (a list of blocks).
 * Version 1 documents described Jira custom fields and are rejected.
 */
public final class ConfigNormalizer {

    private ConfigNormalizer() {
    }

    public static String toCurrent(String json, ObjectMapper mapper) throws IOException, InvalidRulesException {
        JsonNode root = mapper.readTree(json);
        if (root == null || !root.isObject()) {
            throw new InvalidRulesException(Collections.singletonList("Configuration must be a JSON object"));
        }
        ObjectNode obj = (ObjectNode) root;
        boolean hasBlocks = obj.has("blocks") && obj.get("blocks").isArray();
        if (!hasBlocks) {
            int version = obj.has("version") && obj.get("version").isNumber() ? obj.get("version").asInt() : 2;
            if (obj.has("version") && version != 2 && version != RulesConfig.CURRENT_VERSION) {
                throw new InvalidRulesException(Collections.singletonList(
                        "Unsupported \"version\": " + version + " (expected " + RulesConfig.CURRENT_VERSION + ")"));
            }
            return mapper.writeValueAsString(wrapLegacy(obj, mapper));
        }
        obj.put("version", RulesConfig.CURRENT_VERSION);
        return mapper.writeValueAsString(obj);
    }

    private static ObjectNode wrapLegacy(ObjectNode legacy, ObjectMapper mapper) {
        ObjectNode block = mapper.createObjectNode();
        block.put("id", "main");
        JsonNode title = legacy.get("title");
        block.put("title", title == null || title.isNull() ? "" : title.asText());
        JsonNode clear = legacy.get("clearOnHide");
        block.put("clearOnHide", clear == null || clear.isNull() ? true : clear.asBoolean(true));
        JsonNode types = legacy.get("requestTypeIds");
        if (types != null && types.isArray()) {
            block.put("requestTypeIds", types);
        } else {
            block.putArray("requestTypeIds");
        }
        JsonNode fields = legacy.get("fields");
        if (fields != null && fields.isArray()) {
            block.put("fields", fields);
        } else {
            block.putArray("fields");
        }
        ObjectNode next = mapper.createObjectNode();
        next.put("version", RulesConfig.CURRENT_VERSION);
        ArrayNode blocks = next.putArray("blocks");
        blocks.add(block);
        return next;
    }
}
