// Package rules parses rule schemes (subconverter .ini and Clash YAML) and
// bundles the offline ACL4SSR presets shipped with the plugin.
//
// A rule scheme carries strategy groups plus routing rules. Both source
// formats are reduced to model.RuleScheme: groups become named strategy groups
// with reference / node-pattern members, and rules become (group, body) pairs
// with a FINAL marker for the MATCH fallback.
package rules

import (
	"fmt"
	"net/url"
	"path"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/kenzok8/tower/internal/model"
)

// Resolver turns a ruleset target (a URL for .ini, or a rule-provider name for
// Clash YAML) into raw rule lines. Bundled presets use a local-file resolver;
// user imports use an HTTP resolver.
type Resolver func(source string) ([]string, error)

// Parse auto-detects the format and parses a rule scheme.
func Parse(text string, resolve Resolver) (*model.RuleScheme, error) {
	t := strings.TrimSpace(text)
	switch {
	case strings.Contains(t, "custom_proxy_group="):
		return parseINI(t, resolve)
	case strings.Contains(t, "proxy-groups:"):
		return parseClashYAML(t)
	case strings.Contains(strings.ToLower(t), "[proxy group]") && strings.Contains(strings.ToLower(t), "[rule]"):
		return parseSurge(t)
	default:
		return nil, fmt.Errorf("unsupported rule configuration")
	}
}

func parseSurge(text string) (*model.RuleScheme, error) {
	section := ""
	var groupLines, ruleLines []string
	settings := &model.RuleSchemeNetworkSettings{}
	for _, raw := range strings.Split(text, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			section = strings.ToLower(strings.TrimSpace(line[1 : len(line)-1]))
			continue
		}
		switch section {
		case "proxy group":
			groupLines = append(groupLines, line)
		case "rule":
			ruleLines = append(ruleLines, line)
		case "general":
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				switch strings.ToLower(strings.TrimSpace(parts[0])) {
				case "ipv6":
					if value, err := strconv.ParseBool(strings.TrimSpace(parts[1])); err == nil {
						settings.IPv6Enabled = &value
					}
				case "dns-server":
					settings.DNSServers = splitNetworkList(parts[1])
				case "encrypted-dns-server":
					settings.EncryptedDNSServers = splitNetworkList(parts[1])
				}
			}
		}
	}

	var rawGroups []struct {
		name   string
		kind   model.RuleGroupKind
		fields []string
	}
	groupNames := make(map[string]bool)
	for _, line := range groupLines {
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		fields := splitRule(strings.TrimSpace(parts[1]))
		if name == "" || len(fields) < 1 {
			continue
		}
		kind := normalizeKind(fields[0])
		if kind == "" {
			continue
		}
		groupNames[name] = true
		rawGroups = append(rawGroups, struct {
			name   string
			kind   model.RuleGroupKind
			fields []string
		}{name, kind, fields[1:]})
	}
	var groups []model.RuleSchemeGroup
	for _, raw := range rawGroups {
		g := model.RuleSchemeGroup{Name: raw.name, Kind: raw.kind}
		for _, item := range raw.fields {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			if strings.HasPrefix(item, "url=") {
				g.URL = strings.TrimPrefix(item, "url=")
				continue
			}
			if strings.HasPrefix(item, "interval=") {
				g.Interval, _ = strconv.Atoi(strings.TrimPrefix(item, "interval="))
				continue
			}
			if strings.HasPrefix(item, "tolerance=") {
				g.Tolerance, _ = strconv.Atoi(strings.TrimPrefix(item, "tolerance="))
				continue
			}
			if groupNames[item] || isBuiltinPolicy(item) {
				g.Members = append(g.Members, model.RuleGroupMember{Type: model.MemberReference, Value: item})
			} else {
				g.Members = append(g.Members, model.RuleGroupMember{Type: model.MemberNodePattern, Value: "^" + regexp.QuoteMeta(item) + "$"})
			}
		}
		groups = append(groups, g)
	}
	if len(groups) == 0 {
		return nil, fmt.Errorf("no Surge proxy groups found")
	}

	var rules []model.RuleSchemeRule
	for _, line := range ruleLines {
		fields := splitRule(line)
		if len(fields) < 2 {
			continue
		}
		switch strings.ToUpper(fields[0]) {
		case "FINAL", "MATCH":
			rules = append(rules, model.RuleSchemeRule{Group: fields[1], Final: true, Options: fields[2:]})
		case "RULE-SET":
			if len(fields) < 3 {
				return nil, fmt.Errorf("invalid Surge RULE-SET: %s", line)
			}
			u, err := url.Parse(strings.TrimSpace(fields[1]))
			if err != nil || u.Scheme != "https" || u.Host == "" {
				return nil, fmt.Errorf("Surge rule-set URL must use HTTPS")
			}
			rules = append(rules, model.RuleSchemeRule{Group: fields[2], Options: fields[3:], Resource: &model.RuleSchemeRuleSet{URL: u.String(), Behavior: "classical", Format: "text"}})
		default:
			if len(fields) < 3 {
				return nil, fmt.Errorf("invalid Surge rule: %s", line)
			}
			body := strings.Join(fields[:2], ",")
			rules = append(rules, model.RuleSchemeRule{Group: fields[2], Body: body, Options: fields[3:]})
		}
	}
	if len(rules) == 0 {
		return nil, fmt.Errorf("no Surge rules found")
	}
	return &model.RuleScheme{Groups: groups, Rules: rules, NetworkSettings: emptyNetworkSettings(settings)}, nil
}

// parseINI reads the subconverter remote-config dialect used by ACL4SSR:
//
//	ruleset=<组名>,<URL>            remote list
//	ruleset=<组名>,[]<内联规则>      inline rule (GEOIP,CN or FINAL)
//	custom_proxy_group=<名>`<类型>`<成员>`…[`<测速URL>`<间隔,容差>]
func parseINI(text string, resolve Resolver) (*model.RuleScheme, error) {
	var groups []model.RuleSchemeGroup
	var rules []model.RuleSchemeRule
	settings := &model.RuleSchemeNetworkSettings{}

	for _, raw := range strings.Split(text, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") ||
			strings.HasPrefix(line, "[") {
			continue
		}

		if v, ok := valueOf(strings.ToLower(line), "ipv6="); ok {
			if value, err := strconv.ParseBool(v); err == nil {
				settings.IPv6Enabled = &value
			}
		} else if v, ok := valueOf(strings.ToLower(line), "dns-server="); ok {
			settings.DNSServers = splitNetworkList(v)
		} else if v, ok := valueOf(strings.ToLower(line), "encrypted-dns-server="); ok {
			settings.EncryptedDNSServers = splitNetworkList(v)
		} else if v, ok := valueOf(line, "ruleset="); ok {
			parsed, resource, err := parseRuleset(v)
			if err != nil {
				return nil, err
			}
			if resource != nil {
				// Resolve once while importing bundled presets to validate that the
				// referenced offline source exists, but retain only its URL here.
				if resolve != nil {
					if _, err := resolve(resource.URL); err != nil {
						return nil, err
					}
				}
				rules = append(rules, model.RuleSchemeRule{Group: resourceGroup(v), Resource: resource})
			} else {
				rules = append(rules, parsed...)
			}
		} else if v, ok := valueOf(line, "custom_proxy_group="); ok {
			if g, ok := parseGroup(v); ok {
				groups = append(groups, g)
			}
		}
	}

	if len(groups) == 0 {
		return nil, fmt.Errorf("no strategy groups found")
	}
	if len(rules) == 0 {
		return nil, fmt.Errorf("no rules found")
	}
	return &model.RuleScheme{Groups: groups, Rules: rules, NetworkSettings: emptyNetworkSettings(settings)}, nil
}

func splitNetworkList(raw string) []string {
	var out []string
	for _, value := range splitRule(raw) {
		value = strings.Trim(strings.TrimSpace(value), "\"'")
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func emptyNetworkSettings(settings *model.RuleSchemeNetworkSettings) *model.RuleSchemeNetworkSettings {
	if settings == nil || (settings.IPv6Enabled == nil && len(settings.DNSServers) == 0 && len(settings.FallbackDNSServers) == 0 && len(settings.EncryptedDNSServers) == 0) {
		return nil
	}
	return settings
}

func valueOf(line, prefix string) (string, bool) {
	if !strings.HasPrefix(line, prefix) {
		return "", false
	}
	return strings.TrimSpace(strings.TrimPrefix(line, prefix)), true
}

// parseRuleset expands one ruleset= directive into rule entries.
func parseRuleset(value string) ([]model.RuleSchemeRule, *model.RuleSchemeRuleSet, error) {
	comma := strings.Index(value, ",")
	if comma < 0 {
		return nil, nil, fmt.Errorf("invalid ruleset: %s", value)
	}
	group := strings.TrimSpace(value[:comma])
	target := strings.TrimSpace(value[comma+1:])
	if group == "" || target == "" {
		return nil, nil, fmt.Errorf("invalid ruleset: %s", value)
	}

	// Inline rule: ruleset=组名,[]GEOIP,CN or []FINAL
	if strings.HasPrefix(target, "[]") {
		body := strings.TrimSpace(target[2:])
		if body == "" {
			return nil, nil, fmt.Errorf("invalid ruleset: %s", value)
		}
		if strings.EqualFold(body, "FINAL") {
			return []model.RuleSchemeRule{{Group: group, Final: true}}, nil, nil
		}
		condition, options := splitRuleOptions(body)
		return []model.RuleSchemeRule{{Group: group, Body: condition, Options: options}}, nil, nil
	}

	u, err := url.Parse(target)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return nil, nil, fmt.Errorf("ruleset URL must use HTTPS: %s", target)
	}
	format := "text"
	if ext := strings.ToLower(path.Ext(u.Path)); ext == ".yaml" || ext == ".yml" {
		format = "yaml"
	}
	return nil, &model.RuleSchemeRuleSet{URL: u.String(), Behavior: "classical", Format: format}, nil
}

func resourceGroup(value string) string {
	comma := strings.Index(value, ",")
	if comma < 0 {
		return ""
	}
	return strings.TrimSpace(value[:comma])
}

// parseGroup reads one custom_proxy_group= directive.
func parseGroup(value string) (model.RuleSchemeGroup, bool) {
	fields := strings.Split(value, "`")
	for i := range fields {
		fields[i] = strings.TrimSpace(fields[i])
	}
	if len(fields) < 2 || fields[0] == "" {
		return model.RuleSchemeGroup{}, false
	}

	group := model.RuleSchemeGroup{
		Name: fields[0],
		Kind: normalizeKind(fields[1]),
	}
	if group.Kind == "" {
		return model.RuleSchemeGroup{}, false
	}

	for i := 2; i < len(fields); i++ {
		entry := fields[i]
		if entry == "" {
			continue
		}
		switch {
		case strings.HasPrefix(entry, "[]"):
			if ref := strings.TrimSpace(entry[2:]); ref != "" {
				group.Members = append(group.Members, model.RuleGroupMember{Type: model.MemberReference, Value: ref})
			}
		case strings.HasPrefix(entry, "http://") || strings.HasPrefix(entry, "https://"):
			group.URL = entry
		case isTimingField(entry):
			group.Interval, group.Tolerance = parseTiming(entry)
		default:
			group.Members = append(group.Members, model.RuleGroupMember{Type: model.MemberNodePattern, Value: entry})
		}
	}
	return group, true
}

// isTimingField reports whether an entry is the trailing url-test tuning field
// (e.g. "300,,50" or "300,100,50").
func isTimingField(entry string) bool {
	if !strings.Contains(entry, ",") {
		return false
	}
	for _, part := range strings.Split(entry, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		if _, err := strconv.Atoi(part); err != nil {
			return false
		}
	}
	return true
}

func parseTiming(entry string) (interval, tolerance int) {
	parts := strings.Split(entry, ",")
	if len(parts) >= 1 {
		if v, err := strconv.Atoi(strings.TrimSpace(parts[0])); err == nil {
			interval = v
		}
	}
	if len(parts) >= 3 {
		if v, err := strconv.Atoi(strings.TrimSpace(parts[2])); err == nil {
			tolerance = v
		}
	}
	return interval, tolerance
}

// parseClashYAML reads a Clash/mihomo YAML document's proxy-groups and rules.
func parseClashYAML(text string) (*model.RuleScheme, error) {
	var doc struct {
		Summary string `yaml:"tower-summary"`
		IPv6    *bool  `yaml:"ipv6"`
		DNS     struct {
			NameServers []string `yaml:"nameserver"`
			Fallback    []string `yaml:"fallback"`
		} `yaml:"dns"`
		RuleProviders map[string]struct {
			Type       string `yaml:"type"`
			URL        string `yaml:"url"`
			Interval   int    `yaml:"interval"`
			Behavior   string `yaml:"behavior"`
			Format     string `yaml:"format"`
			Author     string `yaml:"tower-author"`
			License    string `yaml:"tower-license"`
			Project    string `yaml:"tower-project-url"`
			LicenseURL string `yaml:"tower-license-url"`
		} `yaml:"rule-providers"`
		ProxyGroups []struct {
			Name              string   `yaml:"name"`
			IconURL           string   `yaml:"icon"`
			Type              string   `yaml:"type"`
			Proxies           []string `yaml:"proxies"`
			IncludeAllProxies bool     `yaml:"include-all-proxies"`
			IncludeAll        bool     `yaml:"include-all"`
			Filter            string   `yaml:"filter"`
			URL               string   `yaml:"url"`
			Interval          int      `yaml:"interval"`
			Tolerance         int      `yaml:"tolerance"`
		} `yaml:"proxy-groups"`
		Rules []string `yaml:"rules"`
	}
	if err := yaml.Unmarshal([]byte(text), &doc); err != nil {
		return nil, fmt.Errorf("invalid YAML: %w", err)
	}
	if len(doc.ProxyGroups) == 0 {
		return nil, fmt.Errorf("no proxy-groups found")
	}

	names := map[string]bool{}
	for _, pg := range doc.ProxyGroups {
		names[pg.Name] = true
	}

	var groups []model.RuleSchemeGroup
	for _, pg := range doc.ProxyGroups {
		iconURL := strings.TrimSpace(pg.IconURL)
		if iconURL != "" {
			u, err := url.Parse(iconURL)
			if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil {
				return nil, fmt.Errorf("proxy group %q icon must be a credential-free HTTPS URL", pg.Name)
			}
		}
		g := model.RuleSchemeGroup{
			Name:      pg.Name,
			IconURL:   iconURL,
			Kind:      normalizeKind(pg.Type),
			URL:       pg.URL,
			Interval:  pg.Interval,
			Tolerance: pg.Tolerance,
		}
		if g.Kind == "" {
			g.Kind = model.KindSelect
		}
		for _, member := range pg.Proxies {
			member = strings.TrimSpace(member)
			if member == "" {
				continue
			}
			if names[member] || isBuiltinPolicy(member) {
				g.Members = append(g.Members, model.RuleGroupMember{Type: model.MemberReference, Value: member})
			} else {
				// A non-group, non-builtin member is a node name: match it
				// exactly, the same way Tower's Clash importer does.
				g.Members = append(g.Members, model.RuleGroupMember{Type: model.MemberNodePattern, Value: "^" + regexp.QuoteMeta(member) + "$"})
			}
		}
		if pg.IncludeAllProxies || pg.IncludeAll {
			filter := strings.TrimSpace(pg.Filter)
			if filter == "" {
				filter = ".*"
			}
			member, err := parseNodeFilter(filter)
			if err != nil {
				return nil, fmt.Errorf("proxy group %q has invalid node filter: %w", pg.Name, err)
			}
			g.Members = append(g.Members, member)
		}
		groups = append(groups, g)
	}

	var rules []model.RuleSchemeRule
	for _, line := range doc.Rules {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := splitRule(line)
		if len(fields) < 2 {
			continue
		}
		switch strings.ToUpper(fields[0]) {
		case "MATCH":
			rules = append(rules, model.RuleSchemeRule{Group: fields[1], Final: true})
		case "RULE-SET":
			if len(fields) < 3 {
				return nil, fmt.Errorf("invalid RULE-SET rule: %s", line)
			}
			provider, ok := doc.RuleProviders[fields[1]]
			if !ok {
				return nil, fmt.Errorf("RULE-SET references unknown provider %q", fields[1])
			}
			if !strings.EqualFold(provider.Type, "http") {
				return nil, fmt.Errorf("rule provider %q: only HTTP providers are supported", fields[1])
			}
			u, err := url.Parse(strings.TrimSpace(provider.URL))
			if err != nil || u.Scheme != "https" || u.Host == "" {
				return nil, fmt.Errorf("rule provider %q must use an HTTPS URL", fields[1])
			}
			behavior := strings.ToLower(strings.TrimSpace(provider.Behavior))
			if behavior == "" {
				behavior = "classical"
			}
			format := strings.ToLower(strings.TrimSpace(provider.Format))
			if format == "" {
				format = "yaml"
			}
			if behavior != "classical" && behavior != "domain" && behavior != "ipcidr" {
				return nil, fmt.Errorf("rule provider %q has unsupported behavior %q", fields[1], behavior)
			}
			if format != "text" && format != "yaml" && format != "mrs" {
				return nil, fmt.Errorf("rule provider %q has unsupported format %q", fields[1], format)
			}
			if format == "mrs" && behavior == "classical" {
				return nil, fmt.Errorf("rule provider %q: MRS requires domain or ipcidr behavior", fields[1])
			}
			options := append([]string(nil), fields[3:]...)
			rules = append(rules, model.RuleSchemeRule{
				Group: fields[2], Options: options,
				Resource: &model.RuleSchemeRuleSet{
					Tag: fields[1], URL: u.String(), Behavior: behavior,
					Format: format, Interval: provider.Interval,
					Author: provider.Author, License: provider.License,
					ProjectURL: provider.Project, LicenseURL: provider.LicenseURL,
				},
			})
		default:
			if len(fields) < 3 {
				continue
			}
			body := fields[0] + "," + fields[1]
			options := append([]string(nil), fields[3:]...)
			rules = append(rules, model.RuleSchemeRule{Group: fields[2], Body: body, Options: options})
		}
	}
	if len(rules) == 0 {
		return nil, fmt.Errorf("no rules found")
	}

	settings := &model.RuleSchemeNetworkSettings{IPv6Enabled: doc.IPv6, DNSServers: doc.DNS.NameServers, FallbackDNSServers: doc.DNS.Fallback}
	return &model.RuleScheme{Summary: doc.Summary, Groups: groups, Rules: rules, NetworkSettings: emptyNetworkSettings(settings)}, nil
}

// parseNodeFilter accepts Go regular expressions and the include/exclude
// lookahead form used by some Mihomo templates. RE2 cannot execute lookaheads,
// so preserve the two conditions separately for the generator.
func parseNodeFilter(filter string) (model.RuleGroupMember, error) {
	member := model.RuleGroupMember{Type: model.MemberNodePattern, Value: filter}
	const prefix = "(?=.*("
	const separator = "))^((?!("
	const suffix = ")).)*$"
	if strings.HasPrefix(filter, prefix) && strings.HasSuffix(filter, suffix) {
		parts := strings.SplitN(strings.TrimSuffix(strings.TrimPrefix(filter, prefix), suffix), separator, 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return member, fmt.Errorf("unsupported lookahead pattern")
		}
		member.Value = parts[0]
		member.Exclude = parts[1]
	}
	if _, err := regexp.Compile(member.Value); err != nil {
		return member, err
	}
	if member.Exclude != "" {
		if _, err := regexp.Compile(member.Exclude); err != nil {
			return member, err
		}
	}
	return member, nil
}

func splitRuleOptions(body string) (string, []string) {
	fields := splitRule(body)
	if len(fields) < 2 {
		return body, nil
	}
	conditionEnd := len(fields)
	for conditionEnd > 2 && isRuleOption(fields[conditionEnd-1]) {
		conditionEnd--
	}
	if conditionEnd == len(fields) {
		return body, nil
	}
	return strings.Join(fields[:conditionEnd], ","), fields[conditionEnd:]
}

func isRuleOption(value string) bool {
	return strings.EqualFold(value, "no-resolve") || strings.EqualFold(value, "src") || strings.EqualFold(value, "extended-matching")
}

// splitRule splits a rule line on commas, honoring double-quoted segments.
func splitRule(line string) []string {
	var out []string
	var cur strings.Builder
	quoted := false
	for _, r := range line {
		switch {
		case r == '"':
			quoted = !quoted
			cur.WriteRune(r)
		case r == ',' && !quoted:
			out = append(out, strings.TrimSpace(cur.String()))
			cur.Reset()
		default:
			cur.WriteRune(r)
		}
	}
	out = append(out, strings.TrimSpace(cur.String()))
	return out
}

func normalizeKind(raw string) model.RuleGroupKind {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "select", "selector", "static":
		return model.KindSelect
	case "url-test", "urltest", "auto":
		return model.KindURLTest
	case "fallback":
		return model.KindFallback
	case "load-balance", "loadbalance", "load_balance":
		return model.KindLoadBalance
	case "dae-native-auto", "native-auto":
		return model.KindDAENativeAuto
	default:
		return ""
	}
}

func isBuiltinPolicy(name string) bool {
	switch strings.ToUpper(name) {
	case "DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE":
		return true
	default:
		return false
	}
}

// LocalRuleFilename maps a raw.githubusercontent.com ACL4SSR path back to the
// flattened filename shipped under /etc/tower/rules/.
func LocalRuleFilename(source string) string {
	u, err := url.Parse(source)
	if err != nil {
		return ""
	}
	p := u.Path
	if idx := strings.Index(p, "/Clash/"); idx >= 0 {
		p = p[idx+len("/Clash/"):]
	} else if idx := strings.LastIndex(p, "/"); idx >= 0 {
		p = p[idx+1:]
	}
	return "ACL4SSR_" + strings.ReplaceAll(p, "/", "_")
}

// RawFileURL converts common GitHub and Gitee browser URLs to raw file URLs.
func RawFileURL(source string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(source))
	if err != nil || u.Host == "" || u.Scheme != "https" || u.User != nil {
		return "", fmt.Errorf("配置链接必须是无凭据的 HTTPS URL")
	}
	switch strings.ToLower(u.Host) {
	case "github.com":
		parts := strings.Split(strings.Trim(u.Path, "/"), "/")
		if len(parts) >= 5 && parts[2] == "blob" {
			u.Host = "raw.githubusercontent.com"
			parts = append(parts[:2], append(parts[3:4], parts[4:]...)...)
			u.Path = "/" + strings.Join(parts, "/")
		}
	case "gitee.com":
		if strings.Contains(u.Path, "/blob/") {
			u.Path = strings.Replace(u.Path, "/blob/", "/raw/", 1)
		}
	}
	return u.String(), nil
}
