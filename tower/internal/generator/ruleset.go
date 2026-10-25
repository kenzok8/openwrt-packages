package generator

import (
	"crypto/sha1"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"path"
	"regexp"
	"strings"

	"github.com/kenzok8/tower/internal/model"
	yamlv3 "gopkg.in/yaml.v3"
)

type plannedRule struct {
	rule       model.RuleSchemeRule
	native     bool
	providerID string
}

type plannedProvider struct {
	id       string
	resource model.RuleSchemeRuleSet
	format   string
}

type singBoxMRSMapping struct {
	behavior string
	path     string
	reason   string
}

var singBoxMRSMappings = map[string]singBoxMRSMapping{
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/private.mrs":         {behavior: "domain", path: "/geosite/private.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/openai.mrs":          {behavior: "domain", path: "/geosite/openai.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/anthropic.mrs":       {behavior: "domain", path: "/geosite/anthropic.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/google-gemini.mrs":   {behavior: "domain", path: "/geosite/google-gemini.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/twitter.mrs":         {behavior: "domain", path: "/geosite/twitter.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/youtube.mrs":         {behavior: "domain", path: "/geosite/youtube.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/google.mrs":          {behavior: "domain", path: "/geosite/google.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/github.mrs":          {behavior: "domain", path: "/geosite/github.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/netflix.mrs":         {behavior: "domain", path: "/geosite/netflix.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/paypal.mrs":          {behavior: "domain", path: "/geosite/paypal.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/onedrive.mrs":        {behavior: "domain", path: "/geosite/onedrive.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/microsoft.mrs":       {behavior: "domain", path: "/geosite/microsoft.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/apple-cn.mrs":        {behavior: "domain", path: "/geosite/apple-cn.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/tiktok.mrs":          {behavior: "domain", path: "/geosite/tiktok.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/gfw.mrs":             {behavior: "domain", path: "/geosite/gfw.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/geolocation-!cn.mrs": {behavior: "domain", path: "/geosite/geolocation-!cn.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs":              {behavior: "domain", path: "/geosite/cn.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.mrs":                {behavior: "ipcidr", path: "/geoip/cn.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geoip/google.mrs":            {behavior: "ipcidr", path: "/geoip/google.srs"},
	"/MetaCubeX/meta-rules-dat/meta/geo/geoip/netflix.mrs":           {behavior: "ipcidr", path: "/geoip/netflix.srs"},
}

func mapSingBoxMRS(resource model.RuleSchemeRuleSet) (string, singBoxMRSMapping, bool) {
	if !strings.EqualFold(strings.TrimSpace(resource.Format), "mrs") {
		return "", singBoxMRSMapping{}, false
	}
	u, err := url.Parse(resource.URL)
	if err != nil || u.Scheme != "https" || u.Host != "raw.githubusercontent.com" || u.User != nil ||
		u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || u.RawFragment != "" || strings.Contains(resource.URL, "#") || u.Opaque != "" ||
		u.EscapedPath() != u.Path {
		return "", singBoxMRSMapping{}, false
	}
	mapping, ok := singBoxMRSMappings[u.Path]
	if !ok || resource.Behavior != mapping.behavior {
		return "", singBoxMRSMapping{}, false
	}
	syntheticGeoIPCN := resource.Tag == "tower-geoip-cn" && resource.URL == singBoxGeoIPCNURL &&
		u.Path == "/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.mrs"
	if syntheticGeoIPCN {
		mapping.reason = "固定到 MetaCubeX sing 分支 revision " + singBoxGeoIPCNRevision + "；GeoIP 数据快照可能与原始 GEOIP,CN 数据源不同"
		return "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/" + singBoxGeoIPCNRevision + "/geo/geoip/cn.srs", mapping, true
	}
	mapping.reason = "准确映射到 MetaCubeX sing 分支同类别 SRS；上下游会动态更新，内容快照不保证逐条相同"
	return "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing/geo" + mapping.path, mapping, true
}

// MRSYAMLSourceURL returns the matching text source for a curated MetaCubeX MRS.
// Surge and Shadowrocket need its payload expanded into their own rule syntax.
func MRSYAMLSourceURL(resource model.RuleSchemeRuleSet) (string, bool) {
	if _, _, ok := mapSingBoxMRS(resource); !ok {
		return "", false
	}
	return strings.TrimSuffix(resource.URL, ".mrs") + ".yaml", true
}

func singBoxMRSMappingAllowed(target model.ClientTarget) bool {
	switch target {
	case model.ClientSingBox, model.ClientHiddify, model.ClientMomo:
		return true
	default:
		return false
	}
}

// ClashooInlineSourceURL returns the curated sing-branch JSON source used to
// build an inline rule set for Clashoo's sing-box importer.
func ClashooInlineSourceURL(resource model.RuleSchemeRuleSet) (string, bool) {
	_, _, ok := mapSingBoxMRS(resource)
	if !ok {
		return "", false
	}
	u, _ := url.Parse(resource.URL)
	if resource.Tag == "tower-geoip-cn" && resource.URL == singBoxGeoIPCNURL {
		return "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/" + singBoxGeoIPCNRevision + "/geo/geoip/cn.json", true
	}
	path := strings.TrimPrefix(strings.TrimSuffix(u.Path, ".mrs"), "/MetaCubeX/meta-rules-dat/meta")
	return "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/refs/heads/sing" + path + ".json", true
}

// ParseClashooInlineRuleSet validates the bounded sing rule-source subset that
// Clashoo can safely embed as an inline rule set.
func ParseClashooInlineRuleSet(data []byte) ([]map[string][]string, error) {
	if len(data) == 0 || len(data) > 4<<20 {
		return nil, fmt.Errorf("sing 规则源 JSON 大小无效")
	}
	var doc struct {
		Version int                          `json:"version"`
		Rules   []map[string]json.RawMessage `json:"rules"`
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("sing 规则源 JSON 无效：%w", err)
	}
	if doc.Version != 2 || len(doc.Rules) == 0 {
		return nil, fmt.Errorf("sing 规则源必须是 version 2 且包含 rules")
	}
	var root map[string]json.RawMessage
	if err := json.Unmarshal(data, &root); err != nil {
		return nil, err
	}
	for key := range root {
		if key != "version" && key != "rules" {
			return nil, fmt.Errorf("sing 规则源含不支持字段 %q", key)
		}
	}
	allowed := map[string]bool{"domain": true, "domain_suffix": true, "domain_keyword": true, "domain_regex": true, "ip_cidr": true}
	parsed := make([]map[string][]string, 0, len(doc.Rules))
	for i, sourceRule := range doc.Rules {
		if len(sourceRule) == 0 {
			return nil, fmt.Errorf("sing 规则源 rules[%d] 为空", i)
		}
		rule := make(map[string][]string, len(sourceRule))
		for field, raw := range sourceRule {
			if !allowed[field] {
				return nil, fmt.Errorf("sing 规则源 rules[%d] 含不支持字段 %q", i, field)
			}
			var values []string
			if err := json.Unmarshal(raw, &values); err != nil {
				var value string
				if err := json.Unmarshal(raw, &value); err != nil {
					return nil, fmt.Errorf("sing 规则源 rules[%d].%s 必须是字符串或非空字符串数组", i, field)
				}
				values = []string{value}
			}
			if len(values) == 0 {
				return nil, fmt.Errorf("sing 规则源 rules[%d].%s 不能为空", i, field)
			}
			for _, value := range values {
				if strings.TrimSpace(value) == "" {
					return nil, fmt.Errorf("sing 规则源 rules[%d].%s 包含空值", i, field)
				}
				if field == "domain_regex" {
					if _, err := regexp.Compile(value); err != nil {
						return nil, fmt.Errorf("sing 规则源 rules[%d].%s 正则无效: %w", i, field, err)
					}
				}
				if field == "ip_cidr" {
					if _, _, err := net.ParseCIDR(value); err != nil {
						return nil, fmt.Errorf("sing 规则源 rules[%d].%s CIDR 无效", i, field)
					}
				}
			}
			rule[field] = values
		}
		parsed = append(parsed, rule)
	}
	return parsed, nil
}

func planSchemeRules(opts Options) ([]plannedRule, []plannedProvider, error) {
	if opts.Scheme == nil {
		return nil, nil, nil
	}
	var rules []plannedRule
	var providers []plannedProvider
	providerSeen := make(map[string]string)
	clashTarget := opts.Target.Family() == model.FamilyClash
	surgeTarget := opts.Target.Family() == model.FamilySurge
	shadowrocketTarget := opts.Target.Family() == model.FamilyShadowrocket
	singBoxTarget := opts.Target.Family() == model.FamilySingBox

	for _, source := range opts.Scheme.Rules {
		if source.Resource == nil {
			if singBoxTarget && isURLRegexRule(source.Body) {
				continue
			}
			rules = append(rules, plannedRule{rule: source})
			continue
		}
		resource := *source.Resource
		format := strings.ToLower(strings.TrimSpace(resource.Format))
		if format == "" {
			format = "text"
		}
		mappedURL, _, mapped := mapSingBoxMRS(resource)
		mappedMRS := opts.PreferRuleSets && singBoxTarget && singBoxMRSMappingAllowed(opts.Target) && mapped
		mappedClashoo := opts.PreferRuleSets && opts.Target == model.ClientClashooSB && mapped
		native := mappedMRS || mappedClashoo || opts.PreferRuleSets && ((clashTarget && (format == "text" || format == "yaml" || format == "mrs")) || (surgeTarget && format == "text") || (singBoxTarget && opts.Target != model.ClientClashooSB && isSingBoxSource(resource, opts.RuleSetLines[resource.URL])))
		if native {
			id := ruleSetID(resource)
			rules = append(rules, plannedRule{rule: source, native: true, providerID: id})
			if clashTarget || singBoxTarget {
				providerResource := resource
				providerFormat := "source"
				if mappedMRS {
					providerResource.URL = mappedURL
					providerFormat = "binary"
				} else if mappedClashoo {
					providerFormat = "inline"
				}
				if previousURL, ok := providerSeen[id]; ok {
					if previousURL != providerResource.URL {
						return nil, nil, fmt.Errorf("规则集标识 %q 被不同资源 URL 共用", id)
					}
				} else {
					providerSeen[id] = providerResource.URL
					providers = append(providers, plannedProvider{id: id, resource: providerResource, format: providerFormat})
				}
			}
			continue
		}
		mappedMRSYAML := false
		if (surgeTarget || shadowrocketTarget) && format == "mrs" {
			yamlURL, ok := MRSYAMLSourceURL(resource)
			if !ok {
				return nil, nil, fmt.Errorf("MRS 规则集 %s 暂不支持本地展开", resource.URL)
			}
			resource.URL = yamlURL
			resource.Format = "yaml"
			mappedMRSYAML = true
		}

		lines, ok := opts.RuleSetLines[resource.URL]
		if !ok || len(lines) == 0 {
			return nil, nil, fmt.Errorf("规则集 %s 没有可用的本地缓存；请刷新规则后重试", resource.URL)
		}
		var err error
		lines, err = resourceLines(resource, lines)
		if err != nil {
			return nil, nil, err
		}
		for i, line := range lines {
			line = strings.TrimSpace(line)
			if !mappedMRSYAML && (line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "//")) {
				continue
			}
			if singBoxTarget && isURLRegexRule(line) {
				continue
			}
			var body string
			var options []string
			if mappedMRSYAML {
				body, err = normalizeMappedMRSYAMLLine(resource, line)
				if err != nil {
					return nil, nil, fmt.Errorf("规则集 %s 的 payload[%d] %q：%w", resource.URL, i, line, err)
				}
			} else {
				body, options = normalizeResourceLine(resource, line)
			}
			if body == "" {
				continue
			}
			options = append(options, source.Options...)
			rule := model.RuleSchemeRule{Group: source.Group, Body: body, Options: dedupStrings(options)}
			rules = append(rules, plannedRule{rule: rule})
		}
	}
	return rules, providers, nil
}

func normalizeMappedMRSYAMLLine(resource model.RuleSchemeRuleSet, line string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(resource.Behavior)) {
	case "domain":
		kind := "DOMAIN"
		if strings.HasPrefix(line, "+.") {
			kind = "DOMAIN-SUFFIX"
			line = strings.TrimPrefix(line, "+.")
		}
		if line == "" || len(line) > 253 || strings.HasPrefix(line, ".") || strings.HasSuffix(line, ".") ||
			strings.Contains(line, "..") || strings.ContainsAny(line, "*+/:@,#; \t\r\n") {
			return "", fmt.Errorf("不支持的域名规则")
		}
		return kind + "," + line, nil
	case "ipcidr":
		ip, _, err := net.ParseCIDR(line)
		if err != nil {
			return "", fmt.Errorf("无效的 CIDR")
		}
		if ip.To4() != nil {
			return "IP-CIDR," + line, nil
		}
		return "IP-CIDR6," + line, nil
	default:
		return "", fmt.Errorf("不支持的规则类型 %q", resource.Behavior)
	}
}

// ValidateMRSYAMLSource rejects entries that cannot be represented by Surge
// and Shadowrocket before the downloaded source replaces an existing cache.
func ValidateMRSYAMLSource(resource model.RuleSchemeRuleSet, data []byte) error {
	_, err := CountMRSYAMLSourceRules(resource, data)
	return err
}

// CountMRSYAMLSourceRules validates and counts the decoded payload entries.
func CountMRSYAMLSourceRules(resource model.RuleSchemeRuleSet, data []byte) (int, error) {
	yamlURL, ok := MRSYAMLSourceURL(resource)
	if !ok {
		return 0, fmt.Errorf("MRS 规则集 %s 暂不支持本地展开", resource.URL)
	}
	resource.URL = yamlURL
	resource.Format = "yaml"
	lines, err := resourceLines(resource, strings.Split(string(data), "\n"))
	if err != nil {
		return 0, err
	}
	for i, line := range lines {
		if _, err := normalizeMappedMRSYAMLLine(resource, strings.TrimSpace(line)); err != nil {
			return 0, fmt.Errorf("规则集 %s 的 payload[%d] %q：%w", yamlURL, i, line, err)
		}
	}
	return len(lines), nil
}

func resourceLines(resource model.RuleSchemeRuleSet, lines []string) ([]string, error) {
	switch strings.ToLower(strings.TrimSpace(resource.Format)) {
	case "", "text":
		return lines, nil
	case "yaml":
		var doc struct {
			Payload []string `yaml:"payload"`
		}
		if err := yamlv3.Unmarshal([]byte(strings.Join(lines, "\n")), &doc); err != nil {
			return nil, fmt.Errorf("无法展开 YAML 规则集 %s：%w", resource.URL, err)
		}
		if len(doc.Payload) == 0 {
			return nil, fmt.Errorf("YAML 规则集 %s 没有 payload", resource.URL)
		}
		return doc.Payload, nil
	case "mrs":
		return nil, fmt.Errorf("MRS 规则集 %s 暂不支持本地展开", resource.URL)
	default:
		return nil, fmt.Errorf("规则集 %s 使用不支持的格式 %q", resource.URL, resource.Format)
	}
}

func ruleSourceLine(resource model.RuleSchemeRuleSet, rawLines []string, lineIndex int) string {
	sourceFile := "resource"
	if source, err := url.Parse(resource.URL); err == nil && source.Path != "" {
		sourceFile = path.Base(source.Path)
	}
	lineNumber := lineIndex + 1
	format := strings.ToLower(strings.TrimSpace(resource.Format))
	if format == "yaml" || strings.HasSuffix(strings.ToLower(sourceFile), ".yaml") || strings.HasSuffix(strings.ToLower(sourceFile), ".yml") {
		var doc yamlv3.Node
		if err := yamlv3.Unmarshal([]byte(strings.Join(rawLines, "\n")), &doc); err == nil && len(doc.Content) > 0 {
			root := doc.Content[0]
			for i := 0; i+1 < len(root.Content); i += 2 {
				if root.Content[i].Value == "payload" && root.Content[i+1].Kind == yamlv3.SequenceNode && lineIndex < len(root.Content[i+1].Content) {
					lineNumber = root.Content[i+1].Content[lineIndex].Line
					break
				}
			}
		}
	}
	return fmt.Sprintf("%s:%d", sourceFile, lineNumber)
}

// isSingBoxSource reports whether a remote rule set is a sing-box "source"
// file (JSON whose root object carries a rules array) that sing-box can consume
// natively through route.rule_set.
func isSingBoxSource(resource model.RuleSchemeRuleSet, lines []string) bool {
	if !hasSingBoxSourceURL(resource) {
		return false
	}
	var doc map[string]any
	if err := json.Unmarshal([]byte(strings.Join(lines, "\n")), &doc); err != nil {
		return false
	}
	rules, ok := doc["rules"].([]any)
	return ok && rules != nil
}

func hasSingBoxSourceURL(resource model.RuleSchemeRuleSet) bool {
	u, err := url.Parse(resource.URL)
	if err != nil || !strings.EqualFold(path.Ext(u.Path), ".json") {
		return false
	}
	format := strings.ToLower(strings.TrimSpace(resource.Format))
	if format == "mrs" || (format != "json" && format != "source") {
		return false
	}
	return true
}

func ruleSetID(resource model.RuleSchemeRuleSet) string {
	if tag := safeProviderName(resource.Tag); tag != "" {
		return tag
	}
	h := sha1.Sum([]byte(resource.URL))
	return fmt.Sprintf("tower-%x", h[:6])
}

func safeProviderName(raw string) string {
	raw = strings.ToLower(strings.TrimSpace(raw))
	var b strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), "-_")
}

func normalizeResourceLine(resource model.RuleSchemeRuleSet, line string) (string, []string) {
	behavior := strings.ToLower(strings.TrimSpace(resource.Behavior))
	if behavior == "domain" {
		domain := strings.TrimPrefix(line, "+.")
		domain = strings.TrimPrefix(domain, ".")
		return "DOMAIN-SUFFIX," + domain, nil
	}
	if behavior == "ipcidr" {
		kind := "IP-CIDR"
		if strings.Contains(line, ":") {
			kind = "IP-CIDR6"
		}
		return kind + "," + line, nil
	}
	fields := splitRuleFields(line)
	if len(fields) < 2 {
		return "", nil
	}
	conditionEnd := len(fields)
	for conditionEnd > 2 && isInlineRuleOption(fields[conditionEnd-1]) {
		conditionEnd--
	}
	return strings.Join(fields[:conditionEnd], ","), fields[conditionEnd:]
}

func renderRule(rule plannedRule, target model.ClientTarget) string {
	if rule.rule.Final {
		if target.Family() == model.FamilySurge {
			return "FINAL," + confName(rule.rule.Group)
		}
		return "MATCH," + rule.rule.Group
	}
	if rule.native {
		value := rule.rule.Resource.URL
		if target.Family() == model.FamilyClash {
			value = rule.providerID
		}
		fields := []string{"RULE-SET", value, policyName(rule.rule.Group, target)}
		fields = append(fields, rule.rule.Options...)
		return strings.Join(fields, ",")
	}
	fields := splitRuleFields(rule.rule.Body)
	if len(fields) == 0 {
		return ""
	}
	conditionEnd := len(fields)
	options := append([]string(nil), rule.rule.Options...)
	for conditionEnd > 2 && isInlineRuleOption(fields[conditionEnd-1]) {
		conditionEnd--
		options = append([]string{fields[conditionEnd]}, options...)
	}
	fields = fields[:conditionEnd]
	fields = append(fields, policyName(rule.rule.Group, target))
	fields = append(fields, options...)
	return strings.Join(fields, ",")
}

func splitRuleFields(line string) []string {
	var fields []string
	var current strings.Builder
	quoted := false
	for _, r := range line {
		switch {
		case r == '"':
			quoted = !quoted
			current.WriteRune(r)
		case r == ',' && !quoted:
			fields = append(fields, strings.TrimSpace(current.String()))
			current.Reset()
		default:
			current.WriteRune(r)
		}
	}
	fields = append(fields, strings.TrimSpace(current.String()))
	return fields
}

func isInlineRuleOption(value string) bool {
	return strings.EqualFold(value, "no-resolve") || strings.EqualFold(value, "src") || strings.EqualFold(value, "extended-matching")
}

func policyName(name string, target model.ClientTarget) string {
	if target.Family() == model.FamilySurge || target.Family() == model.FamilyShadowrocket {
		return confName(name)
	}
	return name
}
