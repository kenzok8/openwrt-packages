package generator

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"

	"github.com/kenzok8/tower/internal/model"
	"github.com/kenzok8/tower/internal/parser"
)

type daePlan struct {
	nodes     []daeNode
	groups    []daeGroup
	rules     []string
	fallback  string
	preflight PreflightResult
}

type daeNode struct {
	tag string
	uri string
}

type daeGroup struct {
	tag   string
	nodes []string
}

// daeDATTags maps only known MetaCubeX MRS paths to the corresponding
// geosite/geoip tags consumed by dae's DAT files. The caller still validates
// the generated config against the device's installed DAT assets.
var daeDATTags = map[string]string{
	"geosite/private.mrs":         "GEOSITE,private",
	"geosite/openai.mrs":          "GEOSITE,openai",
	"geosite/anthropic.mrs":       "GEOSITE,anthropic",
	"geosite/google-gemini.mrs":   "GEOSITE,google-gemini",
	"geosite/twitter.mrs":         "GEOSITE,twitter",
	"geosite/youtube.mrs":         "GEOSITE,youtube",
	"geosite/google.mrs":          "GEOSITE,google",
	"geosite/github.mrs":          "GEOSITE,github",
	"geosite/netflix.mrs":         "GEOSITE,netflix",
	"geosite/paypal.mrs":          "GEOSITE,paypal",
	"geosite/onedrive.mrs":        "GEOSITE,onedrive",
	"geosite/microsoft.mrs":       "GEOSITE,microsoft",
	"geosite/apple-cn.mrs":        "GEOSITE,apple-cn",
	"geosite/tiktok.mrs":          "GEOSITE,tiktok",
	"geosite/gfw.mrs":             "GEOSITE,gfw",
	"geosite/geolocation-!cn.mrs": "GEOSITE,geolocation-!cn",
	"geosite/cn.mrs":              "GEOSITE,cn",
	"geoip/cn.mrs":                "GEOIP,cn",
	"geoip/google.mrs":            "GEOIP,google",
	"geoip/netflix.mrs":           "GEOIP,netflix",
}

const daeDATPolicyRevision = "metacubex-mrs-to-dae-dat-v1"

func DAENativeDATPolicyRevision() string {
	return daeDATPolicyRevision
}

var daeDATPolicySchemes = map[string]bool{
	"kenzok8-dae-native": true,
	"acl4ssr-online":     true,
	"acl4ssr-full":       true,
	"self-configuration": true,
}

// DAENativeRuleSet returns the explicit native DAT predicate for an allowlisted
// MetaCubeX source. Other source URLs must use the validated cached expansion.
func DAENativeRuleSet(schemeID string, source model.RuleSchemeRuleSet) (string, bool) {
	if !daeDATPolicySchemes[schemeID] {
		return "", false
	}
	if !strings.EqualFold(strings.TrimSpace(source.Format), "mrs") {
		return "", false
	}
	u, err := url.Parse(strings.TrimSpace(source.URL))
	if err != nil || u.Scheme != "https" || u.Host != "raw.githubusercontent.com" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
		return "", false
	}
	const prefix = "/MetaCubeX/meta-rules-dat/meta/geo/"
	if !strings.HasPrefix(u.Path, prefix) {
		return "", false
	}
	key := strings.TrimPrefix(u.Path, prefix)
	if strings.Contains(key, "/") && strings.Count(key, "/") != 1 {
		return "", false
	}
	body, ok := daeDATTags[key]
	return body, ok
}

// DAEPreflight reports whether this scheme can be represented by dae's native
// node, group-filter, and routing-rule model without dropping semantics.
func DAEPreflight(opts Options) PreflightResult {
	_, result := compileDAE(opts)
	return result
}

// GenerateDAE renders a native dae config.dae file. Dae node links are retained
// verbatim from RawURI; this is intentionally separate from daed's GraphQL API.
func GenerateDAE(opts Options) (string, error) {
	plan, result := compileDAE(opts)
	if opts.Strict {
		if err := requireStrictExactPlan(opts, result); err != nil {
			return "", err
		}
		return renderDAE(plan, opts.Target == model.ClientHonk), nil
	}
	if result.Status == PreflightUnsupported {
		return "", &PreflightError{Result: result}
	}
	if result.Status == PreflightDegraded && !acceptDegradedPlan(opts, &result) {
		return "", &PreflightError{Result: result}
	}
	return renderDAE(plan, opts.Target == model.ClientHonk), nil
}

func compileDAE(opts Options) (daePlan, PreflightResult) {
	plan := daePlan{preflight: PreflightResult{Status: PreflightExact, Planned: []PreflightItem{}}}
	plan.preflight.TargetPolicy, plan.preflight.PolicyNote = SchemeTargetPolicy(opts.Target, schemeID(opts.Scheme))
	issue := func(code, location, message string) {
		plan.preflight.Status = PreflightUnsupported
		plan.preflight.Issues = append(plan.preflight.Issues, PreflightIssue{
			Code: code, Severity: "blocking", Location: location, Message: message,
		})
	}
	warning := func(code, location, message string) {
		if plan.preflight.Status == PreflightExact {
			plan.preflight.Status = PreflightDegraded
		}
		plan.preflight.Warnings = append(plan.preflight.Warnings, PreflightWarning{
			ID: code + "@" + location, Code: code, Location: location, Message: message,
		})
	}
	var regionIssues []PreflightIssue
	opts, regionIssues = applyServiceRegions(opts)
	for _, regionIssue := range regionIssues {
		issue(regionIssue.Code, regionIssue.Location, regionIssue.Message)
	}
	if plan.preflight.TargetPolicy == "tower-dae-acl-policy-v2" {
		var policyIssues []PreflightIssue
		opts.Scheme, policyIssues = applyDAEACLPolicy(opts.Scheme)
		for _, policyIssue := range policyIssues {
			issue(policyIssue.Code, policyIssue.Location, policyIssue.Message)
		}
	}
	nodes := FilterNodes(opts.Nodes, opts.Protocols)
	// The dae core loads a fixed protocol set (no SSR/HTTP/WireGuard/Snell);
	// silently skip unsupported nodes so the exported config stays loadable by
	// both daed and honk.
	{
		kept := make([]model.ProxyNode, 0, len(nodes))
		for i, n := range nodes {
			if !supportsProtocol(model.ClientDAE, n.Kind) {
				warning("node_protocol", fmt.Sprintf("nodes[%d]", i), fmt.Sprintf("节点 %q 使用 dae 不支持的协议，已跳过", n.Name))
				continue
			}
			kept = append(kept, n)
		}
		nodes = kept
	}
	if opts.Strict && len(nodes) == 0 {
		issue("nodes_empty", "nodes", "严格导出至少需要一个已选择的节点")
	}
	if opts.Scheme == nil {
		issue("scheme", "scheme", "dae 导出需要规则方案")
		finalizeDAEPlan(&plan, opts)
		return plan, plan.preflight
	}
	if opts.Scheme.NetworkSettings != nil {
		n := opts.Scheme.NetworkSettings
		if n.IPv6Enabled != nil || len(n.DNSServers) > 0 || len(n.FallbackDNSServers) > 0 || len(n.EncryptedDNSServers) > 0 {
			issue("network_settings", "network_settings", "dae 导出暂不支持方案中的网络或 DNS 设置")
		}
	}

	names := uniquedNames(nodes)
	nodeTags := make(map[string]string, len(nodes))
	for i, node := range nodes {
		name := names[i]
		tag := fmt.Sprintf("node_%03d", i+1)
		plan.preflight.Planned = append(plan.preflight.Planned, PreflightItem{Kind: "node", Name: name, Location: fmt.Sprintf("nodes[%d]", i)})
		if node.Kind == model.KindShadowsocks && node.UDPRelayEnabled != nil && !*node.UDPRelayEnabled {
			issue("node_udp_relay", fmt.Sprintf("nodes[%d]", i), fmt.Sprintf("节点 %q 禁用 UDP，但 dae URI 无法保留该设置", name))
			continue
		}
		link := Link(node)
		if !validDAENodeURI(node, link) {
			issue("node_uri", fmt.Sprintf("nodes[%d]", i), fmt.Sprintf("节点 %q 无法转换为 dae 支持的 URI", name))
			continue
		}
		nodeTags[name] = tag
		plan.nodes = append(plan.nodes, daeNode{tag: tag, uri: link})
	}
	if len(nodes) == 0 {
		issue("nodes_empty", "nodes", "至少需要一个已选择的节点")
	}

	groupTags := make(map[string]string, len(opts.Scheme.Groups))
	groups := make(map[string]model.RuleSchemeGroup, len(opts.Scheme.Groups))
	for i, group := range opts.Scheme.Groups {
		location := fmt.Sprintf("groups[%d]", i)
		plan.preflight.Planned = append(plan.preflight.Planned, PreflightItem{Kind: "group", Name: group.Name, Location: location})
		if strings.TrimSpace(group.Name) == "" || groups[group.Name].Name != "" {
			issue("group_name", location+".name", "方案包含空名称或重复名称的策略组")
			continue
		}
		if group.Kind != model.KindDAENativeAuto && group.Kind != model.KindURLTest {
			issue("group_kind", location+".kind", fmt.Sprintf("策略组 %q 的类型 %q 与 dae 自动测速组不等价", group.Name, group.Kind))
			continue
		}
		if group.Kind == model.KindURLTest {
			warning("group_policy", location+".kind", fmt.Sprintf("策略组 %q 的 URLTest 将映射为 dae min_moving_avg，测速与节点选择细节存在差异", group.Name))
		}
		if group.URL != "" || group.Interval != 0 || group.Tolerance != 0 {
			issue("group_options", location, fmt.Sprintf("策略组 %q 含 dae 导出器未映射的测速参数", group.Name))
		}
		groupTags[group.Name] = fmt.Sprintf("group_%03d", i+1)
		groups[group.Name] = group
	}

	for i, group := range opts.Scheme.Groups {
		if groupTags[group.Name] == "" || (group.Kind != model.KindURLTest && group.Kind != model.KindDAENativeAuto) {
			continue
		}
		var members []string
		for j, member := range group.Members {
			location := fmt.Sprintf("groups[%d].members[%d]", i, j)
			if member.Type != model.MemberNodePattern {
				issue("group_member", location, fmt.Sprintf("策略组 %q 含 dae 导出器不支持的嵌套组或内置策略引用", group.Name))
				continue
			}
			matcher, err := regexp.Compile(member.Value)
			if err != nil {
				issue("group_pattern", location, fmt.Sprintf("策略组 %q 含无效节点匹配正则", group.Name))
				continue
			}
			matched := false
			for _, name := range names {
				if matcher.MatchString(name) && (member.Exclude == "" || !matchNodePattern(member.Exclude, name)) {
					if tag := nodeTags[name]; tag != "" {
						members = append(members, tag)
						matched = true
					}
				}
			}
			if !matched {
				issue("group_empty", location, fmt.Sprintf("策略组 %q 的节点过滤条件没有匹配已选择节点", group.Name))
			}
		}
		members = dedupStrings(members)
		if len(members) == 0 {
			issue("group_empty", fmt.Sprintf("groups[%d]", i), fmt.Sprintf("策略组 %q 没有可用节点", group.Name))
			continue
		}
		plan.groups = append(plan.groups, daeGroup{tag: groupTags[group.Name], nodes: members})
	}

	if len(opts.Scheme.Rules) == 0 {
		issue("rules_empty", "rules", "方案没有路由规则")
	}
	for i, rule := range opts.Scheme.Rules {
		location := fmt.Sprintf("rules[%d]", i)
		target := ""
		switch strings.ToUpper(strings.TrimSpace(rule.Group)) {
		case "DIRECT":
			target = "direct"
		case "BLOCK":
			target = "block"
		case "REJECT", "REJECT-DROP":
			issue("rule_target", location, fmt.Sprintf("dae 原生 block 与 %s 的拒绝/丢弃语义未验证等价", rule.Group))
			continue
		default:
			target = groupTags[rule.Group]
		}
		if target == "" {
			issue("rule_target", location, fmt.Sprintf("规则指向 dae 不支持或不存在的策略组 %q", rule.Group))
			continue
		}
		if rule.Final {
			if strings.TrimSpace(rule.Body) != "" || rule.Resource != nil || len(rule.Options) > 0 {
				issue("rule_final_fields", location, "FINAL/MATCH 兜底规则不能附带条件、资源或修饰项")
				continue
			}
			if i != len(opts.Scheme.Rules)-1 {
				issue("rule_order", location, "FINAL/MATCH 必须是规则列表的最后一条，dae 将其写为 routing fallback")
			}
			if plan.fallback != "" {
				issue("rule_fallback", location, "方案包含多个 FINAL/MATCH 规则")
			}
			plan.fallback = target
			continue
		}
		if rule.Resource != nil {
			if body, ok := DAENativeRuleSet(opts.Scheme.ID, *rule.Resource); ok {
				options := append(append([]string(nil), rule.Resource.Options...), rule.Options...)
				if len(options) > 0 {
					for _, option := range options {
						if !strings.EqualFold(strings.TrimSpace(option), "no-resolve") || !strings.HasPrefix(body, "GEOIP,") {
							issue("rule_options", location, "dae DAT 规则集包含不支持的修饰项")
							body = ""
							break
						}
					}
				}
				if body == "" {
					continue
				}
				converted, err := daeRule(body, target)
				if err != nil {
					issue("rule_resource", location, err.Error())
					continue
				}
				plan.preflight.Planned = append(plan.preflight.Planned, PreflightItem{
					Kind: "resource", Name: rule.Resource.Tag, Location: location + ".resource",
					URL: rule.Resource.URL, SourceURL: rule.Resource.URL,
					Format: "dae-dat", SourceFormat: rule.Resource.Format,
					MappingReason: daeDATPolicyRevision,
					ExpandedRules: 1,
				})
				plan.rules = append(plan.rules, converted)
				continue
			}
			bodies, err := daeResourceBodies(*rule.Resource, rule.Options, opts.RuleSetLines, plan.preflight.TargetPolicy != "")
			if err != nil {
				issue("rule_resource", location, err.Error())
				continue
			}
			resource := rule.Resource
			actualURL := resource.URL
			outputFormat := "inline"
			mappingReason := "按源规则顺序内联到 dae routing"
			if strings.EqualFold(strings.TrimSpace(resource.Format), "mrs") {
				actualURL, _ = MRSYAMLSourceURL(*resource)
				mappingReason = "使用已验证的同路径 YAML 规则源并按 payload 顺序内联"
			}
			author, license := resource.Author, resource.License
			if strings.EqualFold(strings.TrimSpace(resource.Format), "mrs") {
				if author == "" {
					author = "MetaCubeX"
				}
				if license == "" {
					license = "GPL-3.0"
				}
			}
			name := resource.Tag
			if name == "" {
				name = resource.URL
			}
			plan.preflight.Planned = append(plan.preflight.Planned, PreflightItem{
				Kind: "resource", Name: name, Location: location + ".resource",
				URL: actualURL, SourceURL: resource.URL, Format: outputFormat,
				SourceFormat: resource.Format, Author: author, License: license,
				MappingReason: mappingReason, ExpandedRules: len(bodies),
			})
			for lineIndex, body := range bodies {
				converted, err := daeRule(body, target)
				if err != nil {
					issue("rule_resource", fmt.Sprintf("%s.payload[%d]", location, lineIndex), err.Error())
					continue
				}
				plan.rules = append(plan.rules, converted)
			}
			continue
		}
		if len(rule.Options) > 0 {
			issue("rule_options", location, "dae 导出暂不支持规则修饰项")
			continue
		}
		if isURLRegexRule(rule.Body) && plan.preflight.TargetPolicy != "" {
			plan.preflight.Planned = append(plan.preflight.Planned, PreflightItem{Kind: "omitted_rule", Name: "URL-REGEX", Location: location})
			continue
		}
		converted, err := daeRule(rule.Body, target)
		if err != nil {
			issue("rule_condition", location, err.Error())
			continue
		}
		plan.rules = append(plan.rules, converted)
	}
	if plan.fallback == "" {
		issue("rule_fallback", "rules", "方案需要一条最后的 FINAL/MATCH 规则作为 dae fallback")
	}
	finalizeDAEPlan(&plan, opts)
	return plan, plan.preflight
}

func applyDAEACLPolicy(source *model.RuleScheme) (*model.RuleScheme, []PreflightIssue) {
	if source == nil {
		return nil, nil
	}
	clone := *source
	clone.Groups = nil
	clone.Rules = append([]model.RuleSchemeRule(nil), source.Rules...)
	groups := make(map[string]model.RuleSchemeGroup, len(source.Groups))
	for _, group := range source.Groups {
		groups[group.Name] = group
	}
	type resolved struct {
		kind    string
		members []model.RuleGroupMember
	}
	cache := make(map[string]resolved)
	visiting := make(map[string]bool)
	var resolve func(string) (resolved, error)
	resolve = func(name string) (resolved, error) {
		if value, ok := cache[name]; ok {
			return value, nil
		}
		if visiting[name] {
			return resolved{}, fmt.Errorf("策略组引用形成循环")
		}
		group, ok := groups[name]
		if !ok {
			return resolved{}, fmt.Errorf("策略组引用了未知组")
		}
		if len(group.Members) == 0 {
			return resolved{}, fmt.Errorf("策略组没有默认成员")
		}
		visiting[name] = true
		member := group.Members[0]
		var value resolved
		if member.Type == model.MemberNodePattern {
			value = resolved{kind: "auto", members: []model.RuleGroupMember{member}}
		} else if member.Type == model.MemberReference {
			switch strings.ToUpper(strings.TrimSpace(member.Value)) {
			case "DIRECT":
				value.kind = "DIRECT"
			case "REJECT":
				value.kind = "BLOCK"
			case "REJECT-DROP":
				delete(visiting, name)
				return resolved{}, fmt.Errorf("REJECT-DROP 的静默丢弃语义不能由 DAE block 保留")
			default:
				var err error
				value, err = resolve(member.Value)
				if err != nil {
					delete(visiting, name)
					return resolved{}, err
				}
			}
		} else {
			delete(visiting, name)
			return resolved{}, fmt.Errorf("策略组默认成员类型不受支持")
		}
		delete(visiting, name)
		cache[name] = value
		return value, nil
	}
	issues := make([]PreflightIssue, 0)
	created := make(map[string]bool)
	for i := range clone.Rules {
		groupName := clone.Rules[i].Group
		switch strings.ToUpper(strings.TrimSpace(groupName)) {
		case "DIRECT", "BLOCK":
			continue
		case "REJECT":
			clone.Rules[i].Group = "BLOCK"
			continue
		case "REJECT-DROP":
			issues = append(issues, PreflightIssue{Code: "reject_drop", Severity: "blocking", Location: fmt.Sprintf("rules[%d].group", i), Message: "REJECT-DROP 的静默丢弃语义不能由 DAE block 保留"})
			continue
		}
		value, err := resolve(groupName)
		if err != nil {
			issues = append(issues, PreflightIssue{Code: "group_default", Severity: "blocking", Location: fmt.Sprintf("rules[%d].group", i), Message: fmt.Sprintf("无法解析策略组 %q 的默认成员：%v", groupName, err)})
			continue
		}
		if value.kind == "auto" {
			clone.Rules[i].Group = groupName
			if !created[groupName] {
				group := groups[groupName]
				group.Kind = model.KindDAENativeAuto
				group.Members = value.members
				group.URL = ""
				group.Interval = 0
				group.Tolerance = 0
				clone.Groups = append(clone.Groups, group)
				created[groupName] = true
			}
		} else {
			clone.Rules[i].Group = value.kind
		}
	}
	return &clone, issues
}

func finalizeDAEPlan(plan *daePlan, opts Options) {
	filtered := opts
	filtered.Nodes = FilterNodes(opts.Nodes, opts.Protocols)
	payload := struct {
		Target         model.ClientTarget
		TargetPolicy   string
		Nodes          []model.ProxyNode
		Protocols      []model.ProxyKind
		Scheme         *model.RuleScheme
		Policy         string
		ServiceRegions map[string]string
		Strict         bool
		RuleSetLines   map[string][]string
		Planned        []PreflightItem
		Warnings       []PreflightWarning
		Issues         []PreflightIssue
	}{
		Target: filtered.Target, TargetPolicy: plan.preflight.TargetPolicy,
		Nodes: filtered.Nodes, Protocols: filtered.Protocols,
		Scheme: filtered.Scheme, Policy: daeDATPolicyRevision,
		ServiceRegions: filtered.ServiceRegions, Strict: filtered.Strict,
		RuleSetLines: opts.RuleSetLines,
		Planned:      plan.preflight.Planned,
		Warnings:     plan.preflight.Warnings, Issues: plan.preflight.Issues,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		plan.preflight.PlanDigest = ""
		return
	}
	digest := sha256.Sum256(data)
	plan.preflight.PlanDigest = fmt.Sprintf("%x", digest[:])
}

func validDAENodeURI(node model.ProxyNode, link string) bool {
	if link == "" || strings.ContainsAny(link, "'\"\r\n") {
		return false
	}
	if node.Kind == model.KindHysteria2 {
		parsed := parser.ParseURI(link, "")
		return parsed != nil && parsed.Kind == node.Kind && parsed.Server == node.Server &&
			parsed.PortHopping == node.PortHopping &&
			(node.PortHopping != "" || parsed.Port == node.Port)
	}
	u, err := url.Parse(link)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}
	allowed := map[model.ProxyKind]map[string]bool{
		model.KindShadowsocks: {"ss": true},
		model.KindVMess: {"vmess": true}, model.KindVLESS: {"vless": true},
		model.KindTrojan: {"trojan": true}, model.KindHysteria: {"hysteria": true},
		model.KindHysteria2: {"hysteria2": true, "hy2": true}, model.KindTUIC: {"tuic": true},
		model.KindSOCKS5: {"socks5": true}, model.KindAnyTLS: {"anytls": true},
	}
	return allowed[node.Kind][strings.ToLower(u.Scheme)]
}

func daeResourceBodies(source model.RuleSchemeRuleSet, ruleOptions []string, cached map[string][]string, allowURLRegex ...bool) ([]string, error) {
	resource := source
	format := strings.ToLower(strings.TrimSpace(resource.Format))
	mappedMRS := format == "mrs"
	if mappedMRS {
		yamlURL, ok := MRSYAMLSourceURL(resource)
		if !ok {
			return nil, fmt.Errorf("MRS 规则集 %s 没有已验证的 YAML 展开映射", resource.URL)
		}
		resource.URL = yamlURL
		resource.Format = "yaml"
	}
	lines, ok := cached[resource.URL]
	if !ok || len(lines) == 0 {
		return nil, fmt.Errorf("规则集 %s 没有已验证的本地内容快照", resource.URL)
	}
	values, err := resourceLines(resource, lines)
	if err != nil {
		return nil, err
	}
	baseOptions := append(append([]string(nil), source.Options...), ruleOptions...)
	out := make([]string, 0, len(values))
	for i, raw := range values {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "//") {
			continue
		}
		if isURLRegexRule(line) && len(allowURLRegex) > 0 && allowURLRegex[0] {
			continue
		}
		var body string
		options := append([]string(nil), baseOptions...)
		if mappedMRS {
			body, err = normalizeMappedMRSYAMLLine(source, line)
		} else {
			switch strings.ToLower(strings.TrimSpace(source.Behavior)) {
			case "domain", "ipcidr":
				body, err = normalizeMappedMRSYAMLLine(source, line)
			case "classical":
				fields := splitRuleFields(line)
				if len(fields) < 2 {
					err = fmt.Errorf("classical 规则必须包含类型和值")
				} else {
					body = strings.Join(fields[:2], ",")
					options = append(options, fields[2:]...)
				}
			default:
				err = fmt.Errorf("dae 不支持规则集 behavior %q", source.Behavior)
			}
		}
		if err != nil {
			return nil, fmt.Errorf("规则集 %s payload[%d]：%w", resource.URL, i, err)
		}
		noResolve := false
		for _, option := range options {
			if strings.EqualFold(strings.TrimSpace(option), "no-resolve") && !noResolve {
				noResolve = true
				continue
			}
			return nil, fmt.Errorf("dae 不支持规则集修饰项 %q", option)
		}
		if noResolve {
			kind := strings.ToUpper(strings.TrimSpace(strings.SplitN(body, ",", 2)[0]))
			if kind != "IP-CIDR" && kind != "IP-CIDR6" {
				return nil, fmt.Errorf("no-resolve 仅支持 IP-CIDR 规则")
			}
		}
		out = append(out, body)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("规则集 %s 没有可展开的规则", resource.URL)
	}
	return out, nil
}

func daeRule(body, target string) (string, error) {
	fields := strings.Split(body, ",")
	if len(fields) != 2 {
		return "", fmt.Errorf("dae 导出不支持规则条件 %q", body)
	}
	kind := strings.ToUpper(strings.TrimSpace(fields[0]))
	value := strings.TrimSpace(fields[1])
	if value == "" || strings.ContainsAny(value, "'\"\r\n()") {
		return "", fmt.Errorf("dae 导出不支持空值或含引号/换行的规则条件")
	}
	switch kind {
	case "PROCESS-NAME":
		if !daeProcessName.MatchString(value) {
			return "", fmt.Errorf("dae 导出遇到无效进程名条件")
		}
		if strings.Contains(value, " ") {
			value = "'" + value + "'"
		}
		return fmt.Sprintf("pname(%s) -> %s", value, target), nil
	case "DOMAIN":
		if !daeToken.MatchString(value) || strings.Contains(value, "*") {
			return "", fmt.Errorf("dae 导出遇到无效域名条件 %q", value)
		}
		return fmt.Sprintf("domain(full: %s) -> %s", value, target), nil
	case "DOMAIN-SUFFIX":
		if !daeToken.MatchString(value) || strings.Contains(value, "*") {
			return "", fmt.Errorf("dae 导出遇到无效域名后缀 %q", value)
		}
		return fmt.Sprintf("domain(suffix: %s) -> %s", value, target), nil
	case "DOMAIN-KEYWORD":
		if !daeToken.MatchString(value) || strings.Contains(value, "*") {
			return "", fmt.Errorf("dae 导出遇到无效域名关键词 %q", value)
		}
		return fmt.Sprintf("domain(keyword: %s) -> %s", value, target), nil
	case "GEOSITE":
		if !daeGeoToken.MatchString(value) {
			return "", fmt.Errorf("dae 导出遇到无效 geosite 标识 %q", value)
		}
		return fmt.Sprintf("domain(geosite: %s) -> %s", value, target), nil
	case "GEOIP":
		if !daeGeoToken.MatchString(value) {
			return "", fmt.Errorf("dae 导出遇到无效 geoip 标识 %q", value)
		}
		return fmt.Sprintf("dip(geoip: %s) -> %s", value, target), nil
	case "IP-CIDR", "IP-CIDR6":
		if _, _, err := net.ParseCIDR(value); err != nil {
			return "", fmt.Errorf("dae 导出遇到无效 CIDR %q", value)
		}
		return fmt.Sprintf("dip('%s') -> %s", value, target), nil
	case "MATCH", "FINAL":
		return "", fmt.Errorf("FINAL/MATCH 必须由方案的 Final 标记表示")
	default:
		return "", fmt.Errorf("dae 导出暂不支持 %s 规则", kind)
	}
}

var (
	daeToken       = regexp.MustCompile(`^[A-Za-z0-9_*.-]+$`)
	daeGeoToken    = regexp.MustCompile(`^[A-Za-z0-9_!.-]+$`)
	daeProcessName = regexp.MustCompile(`^[A-Za-z0-9_. -]+$`)
)

func renderDAE(plan daePlan, honkVariant bool) string {
	var b strings.Builder
	b.WriteString("# Generated locally by Tower as a native dae config.dae file.\n")
	b.WriteString("# Review LAN and DNS settings before replacing an existing dae config.\n\n")
	if honkVariant {
		// Honk keeps its global/native_api in /etc/honk/system.dae; reference it
		// so the exported config stays loadable while Doona stays available.
		b.WriteString("include {\n")
		b.WriteString("    system.dae\n")
		b.WriteString("}\n\n")
	} else {
		b.WriteString("global {\n")
		b.WriteString("    tproxy_port: 12345\n")
		b.WriteString("    lan_interface: br-lan\n")
		b.WriteString("    wan_interface: auto\n")
		b.WriteString("    auto_config_kernel_parameter: true\n")
		b.WriteString("    dial_mode: domain\n")
		b.WriteString("}\n\n")
	}
	b.WriteString("dns {\n")
	b.WriteString("    upstream {\n")
	b.WriteString("        cndns: 'udp://dns.alidns.com:53'\n")
	b.WriteString("        fallbackdns: 'tcp+udp://dns.google:53'\n")
	b.WriteString("    }\n")
	b.WriteString("    routing {\n")
	b.WriteString("        request {\n")
	b.WriteString("            qname(geosite:cn) -> cndns\n")
	b.WriteString("            fallback: fallbackdns\n")
	b.WriteString("        }\n")
	b.WriteString("    }\n")
	b.WriteString("}\n\n")
	b.WriteString("node {\n")
	for _, node := range plan.nodes {
		b.WriteString("    " + node.tag + ": '" + node.uri + "'\n")
	}
	b.WriteString("}\n\n")
	if len(plan.groups) > 0 {
		b.WriteString("group {\n")
		for _, group := range plan.groups {
			b.WriteString("    " + group.tag + " {\n")
			b.WriteString("        filter: name(" + strings.Join(group.nodes, ", ") + ")\n")
			b.WriteString("        policy: min_moving_avg\n")
			b.WriteString("    }\n")
		}
		b.WriteString("}\n\n")
	}
	b.WriteString("routing {\n")
	for _, rule := range plan.rules {
		b.WriteString("    " + rule + "\n")
	}
	b.WriteString("    fallback: " + plan.fallback + "\n")
	b.WriteString("}\n")
	return b.String()
}
