package ru.saael.dynamicfields.service;

import com.atlassian.plugin.spring.scanner.annotation.export.ExportAsService;
import com.atlassian.plugin.spring.scanner.annotation.imports.ComponentImport;
import com.atlassian.sal.api.pluginsettings.PluginSettings;
import com.atlassian.sal.api.pluginsettings.PluginSettingsFactory;
import org.codehaus.jackson.map.DeserializationConfig;
import org.codehaus.jackson.map.ObjectMapper;
import org.codehaus.jackson.map.SerializationConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import ru.saael.dynamicfields.field.PortalFormFields;
import ru.saael.dynamicfields.model.RulesConfig;

import javax.inject.Inject;
import javax.inject.Named;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

@ExportAsService(RulesService.class)
@Named
public class RulesServiceImpl implements RulesService {

    private static final Logger log = LoggerFactory.getLogger(RulesServiceImpl.class);

    static final String SETTINGS_KEY = "ru.saael.dynamicfields.rules";
    private static final String EXAMPLE_RESOURCE = "/example-form.json";

    private final PluginSettingsFactory pluginSettingsFactory;
    private final IssueFieldSync issueFieldSync;
    private final PortalFormFields portalFormFields;
    private final ObjectMapper mapper;

    @Inject
    public RulesServiceImpl(@ComponentImport PluginSettingsFactory pluginSettingsFactory,
                            IssueFieldSync issueFieldSync,
                            PortalFormFields portalFormFields) {
        this.pluginSettingsFactory = pluginSettingsFactory;
        this.issueFieldSync = issueFieldSync;
        this.portalFormFields = portalFormFields;
        this.mapper = new ObjectMapper();
        this.mapper.configure(DeserializationConfig.Feature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        this.mapper.configure(SerializationConfig.Feature.INDENT_OUTPUT, true);
    }

    @Override
    public RulesConfig getConfig() {
        String json = readStored();
        if (json == null || json.trim().isEmpty()) {
            return new RulesConfig();
        }
        try {
            return parse(json);
        } catch (InvalidRulesException e) {
            // Should never happen: only validated documents are stored. Fail safe -> no rules.
            log.warn("Stored dynamic field rules are corrupted, ignoring them: {}", e.getMessage());
            return new RulesConfig();
        }
    }

    @Override
    public String getConfigJson() {
        return toJson(getConfig());
    }

    @Override
    public String getExampleJson() {
        InputStream in = RulesServiceImpl.class.getResourceAsStream(EXAMPLE_RESOURCE);
        if (in == null) {
            return toJson(new RulesConfig());
        }
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.warn("Cannot read bundled example rules", e);
            return toJson(new RulesConfig());
        } finally {
            try {
                in.close();
            } catch (IOException ignored) {
                // nothing to do
            }
        }
    }

    @Override
    public String saveConfigJson(String json) throws InvalidRulesException {
        RulesConfig config = parse(json);
        portalFormFields.ensure();
        issueFieldSync.ensureFields(config);
        String normalised = toJson(config);
        settings().put(SETTINGS_KEY, normalised);
        log.info("Portal form updated: {} block(s), {} field(s)", config.getBlocks().size(), config.fieldCount());
        return normalised;
    }

    @Override
    public RulesConfig parse(String json) throws InvalidRulesException {
        if (json == null || json.trim().isEmpty()) {
            throw new InvalidRulesException(Collections.singletonList("Configuration is empty"));
        }
        RulesConfig config;
        try {
            config = mapper.readValue(ConfigNormalizer.toCurrent(json, mapper), RulesConfig.class);
        } catch (InvalidRulesException e) {
            throw e;
        } catch (IOException e) {
            throw new InvalidRulesException(Collections.singletonList("Invalid JSON: " + e.getMessage()));
        }
        java.util.List<String> errors = RulesValidator.validate(config);
        if (!errors.isEmpty()) {
            throw new InvalidRulesException(errors);
        }
        return config;
    }

    @Override
    public String toJson(RulesConfig config) {
        try {
            return mapper.writeValueAsString(config);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot serialise rules", e);
        }
    }

    private String readStored() {
        Object value = settings().get(SETTINGS_KEY);
        return value == null ? null : value.toString();
    }

    private PluginSettings settings() {
        return pluginSettingsFactory.createGlobalSettings();
    }
}
