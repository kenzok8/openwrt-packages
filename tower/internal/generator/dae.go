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
	nodes         []daeNode
	groups        []daeGroup
	rules         []daePredicate
	fallback      string
	preflight     PreflightResult
	subscriptions []daeSubscription
	lanInterface  string
}

type daeNode struct {
	uri string
}

type daeGroup struct {
	tag string
	// filters are dae `filter:` expressions, one per member pattern. Repeated
	// filter lines are "or"-ed by dae and honk, which matches how schemes store
	// node-name patterns.
	filters []string
}

type daeSubscription struct {
	tag       string
	url       string
	userAgent string
}

// daeDATPolicyRevision identifies the DAT mapping policy in preflight manifests.
const daeDATPolicyRevision = "metacubex-mrs-to-dae-dat-v2"

func DAENativeDATPolicyRevision() string {
	return daeDATPolicyRevision
}

var daeDATPolicySchemes = map[string]bool{
	"kenzok8-dae-native": true,
	"acl4ssr-online":     true,
	"acl4ssr-full":       true,
	"self-configuration": true,
}

// DAENativeRuleSet maps a MetaCubeX MRS rule set onto the geosite/geoip tag that
// dae and honk read from the device DAT files. Every path below
// /MetaCubeX/meta-rules-dat/meta/geo/ carries its tag in the filename, so the
// mapping is exact by construction; whether the device actually ships the tag is
// proven by `dae validate`, which fails loudly on an unknown code.
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
	key := strings.TrimSuffix(strings.TrimPrefix(u.Path, prefix), ".mrs")
	kind, tag, ok := strings.Cut(key, "/")
	if !ok || strings.Contains(tag, "/") || !daeGeoToken.MatchString(tag) {
		return "", false
	}
	switch kind {
	case "geosite":
		return "GEOSITE," + tag, true
	case "geoip":
		return "GEOIP," + tag, true
	default:
		return "", false
	}
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
	// dae takes a bare interface name here; anything else falls back to br-lan.
	if lan := strings.TrimSpace(opts.LANInterface); lan != "" && !strings.ContainsAny(lan, " \t\r\n'\"") {
		plan.lanInterface = lan
	}
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
	// note records an informational warning without degrading the plan. Strict
	// exports require an exact plan, and a policy substitution the user cannot
	// act on must not block the export.
	note := func(code, location, message string) {
		plan.preflight.Warnings = append(plan.preflight.Warnings, PreflightWarning{
			ID: code + "@" + location, Code: code, Location: location, Message: message,
			Informational: true,
		})
	}
	var regionIssues []PreflightIssue
	opts, regionIssues = applyServiceRegions(opts)
	for _, regionIssue := range regionIssues {
		issue(regionIssue.Code, regionIssue.Location, regionIssue.Message)
	}
	if plan.preflight.TargetPolicy == "tower-dae-acl-policy-v2" {
		var policyIssues []PreflightIssue
		var policyNotes []policyNote
		opts.Scheme, policyIssues, policyNotes = applyDAEACLPolicy(opts.Scheme)
		for _, policyIssue := range policyIssues {
			issue(policyIssue.Code, policyIssue.Location, policyIssue.Message)
		}
		for _, policyNote := range policyNotes {
			note(policyNote.code, policyNote.location, policyNote.message)
		}
	}
	nodes := FilterNodes(opts.Nodes, opts.Protocols)
	// The dae and honk cores load a fixed protocol set; silently skip unsupported
	// nodes so the exported config stays loadable by the selected core.
	{
		client := daeProtocolTarget(opts.Target)
		kept := make([]model.ProxyNode, 0, len(nodes))
		for i, n := range nodes {
			if !supportsProtocol(client, n.Kind) {
				warning("node_protocol", fmt.Sprintf("nodes[%d]", i), fmt.Sprintf("节点 %q 使用 dae 不支持的协议，已跳过", n.Name))
				continue
			}
			kept = append(kept, n)
		}
		nodes = kept
	}
	if opts.Strict && len(nodes) == 0 && len(opts.DAESubscriptions) == 0 {
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

	nodeNames := uniquedNames(nodes)
	// Subscription nodes are fetched by dae/honk itself, so their names are not
	// part of the inline node list. Group filters still have to be validated
	// against them, otherwise every group would look empty.
	names := append([]string(nil), nodeNames...)
	for _, sub := range opts.DAESubscriptions {
		if strings.TrimSpace(sub.Tag) == "" || !daeSubscriptionURL(sub.URL) {
			issue("subscription", "subscriptions", "订阅缺少可用的标签或地址")
			continue
		}
		plan.subscriptions = append(plan.subscriptions, daeSubscription{tag: sub.Tag, url: sub.URL, userAgent: sub.UserAgent})
		plan.preflight.Planned = append(plan.preflight.Planned, PreflightItem{
			Kind: "subscription", Name: sub.Tag, Location: fmt.Sprintf("subscriptions[%d]", len(plan.subscriptions)-1), URL: sub.URL,
		})
		for _, name := range sub.NodeNames {
			if name = strings.TrimSpace(name); name != "" && !containsString(names, name) {
				names = append(names, name)
			}
		}
	}
	// Fallbacks are informational: the affected subscription is still exported,
	// just with its nodes expanded instead of passed through.
	for i, message := range opts.DAESubscriptionFallbacks {
		note("subscription_fallback", fmt.Sprintf("subscriptions[%d]", i), message)
	}
	for i, node := range nodes {
		name := nodeNames[i]
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
		// Inline nodes carry no tag on purpose: honk names a tagged node after its
		// tag, while dae always uses the link's own name. Untagged entries keep the
		// airport name on both cores, so `name(regex:)` filters agree.
		plan.nodes = append(plan.nodes, daeNode{uri: link})
	}
	if len(nodes) == 0 && len(plan.subscriptions) == 0 {
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
		planGroup := daeGroup{tag: groupTags[group.Name]}
		matchedAny := false
		// matchesAll tracks whether every available node is a member, so the filter
		// line can be dropped entirely (dae treats a filterless group that way).
		matchesAll := true
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
			matched, hitsAll := false, true
			for _, name := range names {
				if !matcher.MatchString(name) || (member.Exclude != "" && matchNodePattern(member.Exclude, name)) {
					hitsAll = false
					continue
				}
				matched = true
			}
			if !matched {
				issue("group_empty", location, fmt.Sprintf("策略组 %q 的节点过滤条件没有匹配已选择节点", group.Name))
				continue
			}
			matchedAny = true
			if !hitsAll {
				matchesAll = false
			}
			expr, ok := daeGroupFilter(member)
			if !ok {
				issue("group_filter", location, fmt.Sprintf("策略组 %q 的节点过滤条件无法写成 dae filter", group.Name))
				continue
			}
			planGroup.filters = append(planGroup.filters, expr)
		}
		if !matchedAny {
			issue("group_empty", fmt.Sprintf("groups[%d]", i), fmt.Sprintf("策略组 %q 没有可用节点", group.Name))
			continue
		}
		if matchesAll {
			// A group that matches every available node needs no filter at all: dae
			// treats a filterless group as "all nodes", subscriptions included.
			planGroup.filters = nil
		}
		plan.groups = append(plan.groups, planGroup)
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
				converted, err := daePredicateFor(body, target)
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
				converted, err := daePredicateFor(body, target)
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
		converted, err := daePredicateFor(rule.Body, target)
		if err != nil {
			issue("rule_condition", location, err.Error())
			continue
		}
		plan.rules = append(plan.rules, converted)
	}
	if plan.fallback == "" {
		issue("rule_fallback", "rules", "方案需要一条最后的 FINAL/MATCH 规则作为 dae fallback")
	}
	if daeProtocolTarget(opts.Target) == model.ClientHonk {
		if count := daeDomainPredicateCount(plan.rules); count > honkDomainPredicateLimit {
			issue("honk_domain_predicates", "rules", fmt.Sprintf("honk 内核路由只支持 %d 个域名谓词，当前方案需要 %d 个；请改用基于 MetaCubeX geosite 规则集的方案", honkDomainPredicateLimit, count))
		}
	}
	finalizeDAEPlan(&plan, opts)
	return plan, plan.preflight
}

// policyNote is a non-blocking observation produced by the DAE policy lowering.
type policyNote struct {
	code     string
	location string
	message  string
}

// applyDAEACLPolicy lowers an ACL4SSR-style scheme onto dae's static policy
// model: REJECT becomes block, a group whose default member is another group
// collapses to that member, and a node-pattern default becomes an auto-measuring
// group.
//
// dae and honk cannot switch a group at runtime, so the group that carries the
// FINAL rule has to resolve to a real proxy. A scheme whose fallback chain ends
// at DIRECT (Self-Configuration starts every select group with DIRECT) would
// otherwise export a config that proxies nothing while still reporting an exact
// preflight, so the fallback chain prefers its first proxy-capable member and the
// substitution is reported as a warning.
func applyDAEACLPolicy(source *model.RuleScheme) (*model.RuleScheme, []PreflightIssue, []policyNote) {
	if source == nil {
		return nil, nil, nil
	}
	clone := *source
	clone.Groups = nil
	clone.Rules = append([]model.RuleSchemeRule(nil), source.Rules...)
	groups := make(map[string]model.RuleSchemeGroup, len(source.Groups))
	for _, group := range source.Groups {
		groups[group.Name] = group
	}
	// proxyPath marks the groups reachable from the FINAL rule. Only those must
	// proxy; a group such as 国内流量 keeps its own DIRECT default.
	proxyPath := make(map[string]bool, len(source.Groups))
	fallbackGroup := ""
	for _, rule := range source.Rules {
		if rule.Final {
			fallbackGroup = strings.TrimSpace(rule.Group)
		}
	}
	if fallbackGroup != "" {
		var walk func(string)
		walk = func(name string) {
			if proxyPath[name] {
				return
			}
			group, ok := groups[name]
			if !ok {
				return
			}
			proxyPath[name] = true
			if len(group.Members) == 0 {
				return
			}
			if first := group.Members[0]; first.Type == model.MemberReference && !builtinPolicy(first.Value) {
				walk(strings.TrimSpace(first.Value))
			}
		}
		walk(fallbackGroup)
	}

	type resolved struct {
		kind     string
		members  []model.RuleGroupMember
		deviated bool
	}
	cache := make(map[string]resolved)
	visiting := make(map[string]bool)
	var resolve func(string) (resolved, error)
	resolve = func(name string) (resolved, error) {
		cacheKey := name
		preferProxy := proxyPath[name]
		if value, ok := cache[cacheKey]; ok {
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
		defer delete(visiting, name)

		resolveMember := func(member model.RuleGroupMember) (resolved, error) {
			switch member.Type {
			case model.MemberNodePattern:
				return resolved{kind: "auto", members: []model.RuleGroupMember{member}}, nil
			case model.MemberReference:
				switch strings.ToUpper(strings.TrimSpace(member.Value)) {
				case "DIRECT":
					return resolved{kind: "DIRECT"}, nil
				case "REJECT":
					return resolved{kind: "BLOCK"}, nil
				case "REJECT-DROP":
					return resolved{}, fmt.Errorf("REJECT-DROP 的静默丢弃语义不能由 DAE block 保留")
				default:
					return resolve(member.Value)
				}
			default:
				return resolved{}, fmt.Errorf("策略组默认成员类型不受支持")
			}
		}

		var first resolved
		for i, member := range group.Members {
			value, err := resolveMember(member)
			if err != nil {
				return resolved{}, err
			}
			if i == 0 {
				first = value
			}
			if !preferProxy {
				break
			}
			if value.kind == "auto" {
				if i > 0 {
					value.deviated = true
				}
				cache[cacheKey] = value
				return value, nil
			}
		}
		cache[cacheKey] = first
		return first, nil
	}

	issues := make([]PreflightIssue, 0)
	notes := make([]policyNote, 0)
	noted := make(map[string]bool, len(source.Groups))
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
		if proxyPath[groupName] && value.kind != "auto" {
			issues = append(issues, PreflightIssue{
				Code: "group_no_proxy", Severity: "blocking", Location: fmt.Sprintf("rules[%d].group", i),
				Message: fmt.Sprintf("策略组 %q 位于兜底路径上，但它的成员里没有可代理的节点或自动测速组，DAE 无法代理流量", groupName),
			})
			continue
		}
		if value.deviated && !noted[groupName] {
			noted[groupName] = true
			notes = append(notes, policyNote{
				code: "group_default_proxy", location: fmt.Sprintf("groups[%q]", groupName),
				message: fmt.Sprintf("策略组 %q 在源方案里默认直连，而 DAE/Honk 无法在运行中切换策略，已改用组内第一个代理成员生成自动测速组", groupName),
			})
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
	return &clone, issues, notes
}

func finalizeDAEPlan(plan *daePlan, opts Options) {
	filtered := opts
	filtered.Nodes = FilterNodes(opts.Nodes, opts.Protocols)
	// Strict only asks for the digest check; it never changes the rendered
	// output, so it must stay out of the digest itself.
	payload := struct {
		Target         model.ClientTarget
		TargetPolicy   string
		Nodes          []model.ProxyNode
		Protocols      []model.ProxyKind
		Scheme         *model.RuleScheme
		Policy         string
		ServiceRegions map[string]string
		RuleSetLines   map[string][]string
		Planned        []PreflightItem
		Warnings       []PreflightWarning
		Issues         []PreflightIssue
		LANInterface   string
		Subscriptions  []DAESubscriptionDigest
	}{
		Target: filtered.Target, TargetPolicy: plan.preflight.TargetPolicy,
		Nodes: filtered.Nodes, Protocols: filtered.Protocols,
		Scheme: filtered.Scheme, Policy: daeDATPolicyRevision,
		ServiceRegions: filtered.ServiceRegions,
		RuleSetLines:   opts.RuleSetLines,
		LANInterface:   plan.lanInterface,
		Subscriptions:  daeSubscriptionDigests(filtered.DAESubscriptions),
		Planned:        plan.preflight.Planned,
		Warnings:       plan.preflight.Warnings, Issues: plan.preflight.Issues,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		plan.preflight.PlanDigest = ""
		return
	}
	digest := sha256.Sum256(data)
	plan.preflight.PlanDigest = fmt.Sprintf("%x", digest[:])
}

// DAESubscriptionDigest is the part of a subscription that changes the rendered
// config. The fetched node names only feed group validation and rotate between
// two independent fetches, so they stay out of the plan digest.
type DAESubscriptionDigest struct {
	Tag       string
	URL       string
	UserAgent string
}

func daeSubscriptionDigests(subscriptions []DAESubscription) []DAESubscriptionDigest {
	if len(subscriptions) == 0 {
		return nil
	}
	out := make([]DAESubscriptionDigest, 0, len(subscriptions))
	for _, sub := range subscriptions {
		out = append(out, DAESubscriptionDigest{Tag: sub.Tag, URL: sub.URL, UserAgent: sub.UserAgent})
	}
	return out
}

// daeProtocolTarget narrows a target to the core whose protocol set applies.
// Only honk differs: its Rust core implements no SSR dialer.
func daeProtocolTarget(target model.ClientTarget) model.ClientTarget {
	if target == model.ClientHonk {
		return model.ClientHonk
	}
	return model.ClientDAE
}

// daeSubscriptionURL reports whether a subscription URL can be written into the
// single-quoted dae `subscription` block as-is.
func daeSubscriptionURL(raw string) bool {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	return !strings.ContainsAny(raw, "'\"\r\n")
}

// daeGroupFilter renders one scheme member as a dae `filter:` expression. dae
// and honk both accept regular expressions through `name(regex: ...)`, and a
// repeated filter line is "or"-ed, which is exactly how schemes store node-name
// patterns. Patterns that cannot survive single quoting fall back to enumerating
// node tags.
func daeGroupFilter(member model.RuleGroupMember) (string, bool) {
	pattern := strings.TrimSpace(member.Value)
	if pattern == "" || strings.ContainsAny(pattern, "'\r\n") {
		return "", false
	}
	if _, err := regexp.Compile(pattern); err != nil {
		return "", false
	}
	expr := "name(regex: '" + pattern + "')"
	exclude := strings.TrimSpace(member.Exclude)
	if exclude == "" {
		return expr, true
	}
	if strings.ContainsAny(exclude, "'\r\n") {
		return "", false
	}
	if _, err := regexp.Compile(exclude); err != nil {
		return "", false
	}
	return expr + " && !name(regex: '" + exclude + "')", true
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
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
		model.KindShadowsocks:  {"ss": true},
		model.KindShadowsocksR: {"ssr": true},
		model.KindVMess:        {"vmess": true}, model.KindVLESS: {"vless": true},
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

// daePredicate is one structured routing condition. Keeping conditions
// structured lets consecutive rules that share a function, key and target
// collapse into a single dae predicate, which keeps the file small and stays
// inside honk's routing predicate budget.
type daePredicate struct {
	funcName string
	key      string
	value    string
	target   string
}

func (p daePredicate) render(arguments []string) string {
	parts := make([]string, 0, len(arguments))
	for _, argument := range arguments {
		if p.key == "" {
			parts = append(parts, argument)
			continue
		}
		parts = append(parts, p.key+": "+argument)
	}
	return p.funcName + "(" + strings.Join(parts, ", ") + ") -> " + p.target
}

func daeRule(body, target string) (string, error) {
	predicate, err := daePredicateFor(body, target)
	if err != nil {
		return "", err
	}
	return predicate.render([]string{predicate.value}), nil
}

// daePredicateFor parses one scheme rule body into a dae routing predicate.
func daePredicateFor(body, target string) (daePredicate, error) {
	fail := func(format string, args ...any) (daePredicate, error) {
		return daePredicate{}, fmt.Errorf(format, args...)
	}
	fields := strings.Split(body, ",")
	if len(fields) != 2 {
		return fail("dae 导出不支持规则条件 %q", body)
	}
	kind := strings.ToUpper(strings.TrimSpace(fields[0]))
	value := strings.TrimSpace(fields[1])
	predicate := daePredicate{value: value, target: target}
	if value == "" || strings.ContainsAny(value, "'\"\r\n()") {
		return fail("dae 导出不支持空值或含引号/换行的规则条件")
	}
	switch kind {
	case "PROCESS-NAME":
		if !daeProcessName.MatchString(value) {
			return fail("dae 导出遇到无效进程名条件")
		}
		if strings.Contains(value, " ") {
			predicate.value = "'" + value + "'"
		}
		predicate.funcName = "pname"
		return predicate, nil
	case "DOMAIN", "DOMAIN-SUFFIX", "DOMAIN-KEYWORD", "GEOSITE":
		if kind == "GEOSITE" {
			if !daeGeoToken.MatchString(value) {
				return fail("dae 导出遇到无效 geosite 标识 %q", value)
			}
		} else if !daeToken.MatchString(value) || strings.Contains(value, "*") {
			return fail("dae 导出遇到无效域名条件 %q", value)
		}
		predicate.funcName, predicate.key = "domain", map[string]string{
			"DOMAIN": "full", "DOMAIN-SUFFIX": "suffix", "DOMAIN-KEYWORD": "keyword", "GEOSITE": "geosite",
		}[kind]
		return predicate, nil
	case "GEOIP":
		if !daeGeoToken.MatchString(value) {
			return fail("dae 导出遇到无效 geoip 标识 %q", value)
		}
		predicate.funcName, predicate.key = "dip", "geoip"
		return predicate, nil
	case "IP-CIDR", "IP-CIDR6":
		if _, _, err := net.ParseCIDR(value); err != nil {
			return fail("dae 导出遇到无效 CIDR %q", value)
		}
		predicate.funcName = "dip"
		predicate.value = "'" + value + "'"
		return predicate, nil
	case "MATCH", "FINAL":
		return fail("FINAL/MATCH 必须由方案的 Final 标记表示")
	default:
		return fail("dae 导出暂不支持 %s 规则", kind)
	}
}

// daeRemoteDNS is the resolver used for non-China answers. The IP literal needs no
// bootstrap lookup, and the TLS server name keeps certificate validation working.
const daeRemoteDNS = "https://1.1.1.1/dns-query?tls_server_name=one.one.one.one"

// honkDomainPredicateLimit is honk's hard cap on distinct domain predicates in
// one routing policy (ROUTING_FACT_CAPACITY in its eBPF map).
const honkDomainPredicateLimit = 256

// daeMaxPredicateArguments caps how many conditions share one rendered line so a
// merged rule stays readable and parsable.
const daeMaxPredicateArguments = 96

// renderDAEPredicates emits routing lines, merging every run of consecutive
// predicates with the same function, key and target. Merging never reorders
// rules across different targets, so routing precedence is preserved.
func renderDAEPredicates(predicates []daePredicate) []string {
	lines := make([]string, 0, len(predicates))
	for i := 0; i < len(predicates); {
		head := predicates[i]
		arguments := []string{head.value}
		j := i + 1
		for j < len(predicates) && len(arguments) < daeMaxPredicateArguments {
			next := predicates[j]
			if next.funcName != head.funcName || next.key != head.key || next.target != head.target {
				break
			}
			arguments = append(arguments, next.value)
			j++
		}
		lines = append(lines, head.render(arguments))
		i = j
	}
	return lines
}

// daeDomainPredicateCount reports how many domain predicates the routing table
// ends up with after merging: honk caps them at 256.
func daeDomainPredicateCount(predicates []daePredicate) int {
	count := 0
	for _, line := range renderDAEPredicates(predicates) {
		if strings.HasPrefix(line, "domain(") {
			count++
		}
	}
	return count
}

var (
	daeToken       = regexp.MustCompile(`^[A-Za-z0-9_*.-]+$`)
	daeGeoToken    = regexp.MustCompile(`^[A-Za-z0-9_!@.-]+$`)
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
		lan := plan.lanInterface
		if lan == "" {
			lan = "br-lan"
		}
		b.WriteString("global {\n")
		b.WriteString("    tproxy_port: 12345\n")
		b.WriteString("    lan_interface: " + lan + "\n")
		b.WriteString("    wan_interface: auto\n")
		b.WriteString("    auto_config_kernel_parameter: true\n")
		b.WriteString("    dial_mode: domain\n")
		b.WriteString("}\n\n")
	}
	b.WriteString("dns {\n")
	b.WriteString("    upstream {\n")
	b.WriteString("        cndns: 'udp://dns.alidns.com:53'\n")
	// The remote resolver is an IP literal DoH endpoint: a hostname upstream such as
	// dns.google has to be bootstrapped first and that lookup is blocked on most
	// mainland networks, which turned every foreign answer into SERVFAIL.
	// honk accepts a per-upstream detour and can send the query through the proxy;
	// dae rejects that syntax, so it dials the IP directly.
	if honkVariant && plan.fallback != "" {
		b.WriteString("        remotedns: '" + daeRemoteDNS + "' -> " + plan.fallback + "\n")
	} else {
		b.WriteString("        remotedns: '" + daeRemoteDNS + "'\n")
	}
	b.WriteString("    }\n")
	b.WriteString("    routing {\n")
	b.WriteString("        request {\n")
	b.WriteString("            qname(geosite:cn) -> cndns\n")
	b.WriteString("            fallback: remotedns\n")
	b.WriteString("        }\n")
	b.WriteString("    }\n")
	b.WriteString("}\n\n")
	if len(plan.subscriptions) > 0 {
		b.WriteString("# Airport endpoints are fetched by the core itself, so node changes\n")
		b.WriteString("# upstream are picked up without regenerating this file.\n")
		b.WriteString("subscription {\n")
		for _, sub := range plan.subscriptions {
			if !honkVariant {
				b.WriteString("    " + sub.tag + ": '" + sub.url + "'\n")
				continue
			}
			b.WriteString("    " + sub.tag + ": '" + sub.url + "' {\n")
			if sub.userAgent != "" {
				b.WriteString("        ua: '" + sub.userAgent + "'\n")
			}
			// A fresh config has no working node yet, so the download must not be
			// routed through the proxy it is meant to populate.
			b.WriteString("        route: direct\n")
			b.WriteString("    }\n")
		}
		b.WriteString("}\n\n")
	}
	if len(plan.nodes) > 0 {
		b.WriteString("node {\n")
		for _, node := range plan.nodes {
			b.WriteString("    '" + node.uri + "'\n")
		}
		b.WriteString("}\n\n")
	}
	if len(plan.groups) > 0 {
		b.WriteString("group {\n")
		for _, group := range plan.groups {
			b.WriteString("    " + group.tag + " {\n")
			for _, filter := range group.filters {
				b.WriteString("        filter: " + filter + "\n")
			}
			b.WriteString("        policy: min_moving_avg\n")
			b.WriteString("    }\n")
		}
		b.WriteString("}\n\n")
	}
	b.WriteString("routing {\n")
	for _, rule := range renderDAEPredicates(plan.rules) {
		b.WriteString("    " + rule + "\n")
	}
	b.WriteString("    fallback: " + plan.fallback + "\n")
	b.WriteString("}\n")
	return b.String()
}
