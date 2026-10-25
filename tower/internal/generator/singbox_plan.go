package generator

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

type PreflightStatus string

const (
	PreflightExact       PreflightStatus = "exact"
	PreflightDegraded    PreflightStatus = "degraded"
	PreflightUnsupported PreflightStatus = "unsupported"
)

type PreflightIssue struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Location string `json:"location"`
	Message  string `json:"message"`
}

type PreflightWarning struct {
	ID       string `json:"id"`
	Code     string `json:"code"`
	Location string `json:"location"`
	Message  string `json:"message"`
}

type PreflightItem struct {
	Kind          string `json:"kind"`
	Name          string `json:"name"`
	Location      string `json:"location"`
	URL           string `json:"url,omitempty"`
	SourceURL     string `json:"source_url,omitempty"`
	Format        string `json:"format,omitempty"`
	SourceFormat  string `json:"source_format,omitempty"`
	Author        string `json:"author,omitempty"`
	License       string `json:"license,omitempty"`
	MappingReason string `json:"mapping_reason,omitempty"`
	ExpandedRules int    `json:"expanded_rules,omitempty"`
}

type PreflightResult struct {
	Status       PreflightStatus    `json:"status"`
	PlanDigest   string             `json:"plan_digest"`
	TargetPolicy string             `json:"target_policy,omitempty"`
	PolicyNote   string             `json:"policy_note,omitempty"`
	Issues       []PreflightIssue   `json:"issues,omitempty"`
	Warnings     []PreflightWarning `json:"warnings,omitempty"`
	Planned      []PreflightItem    `json:"planned"`
}

// Preflight validates and compiles a sing-box-family export without rendering it.
func Preflight(opts Options) PreflightResult {
	if !opts.Target.Supported() || opts.Target.Family() != model.FamilySingBox {
		return PreflightResult{Status: PreflightUnsupported, Issues: []PreflightIssue{{Code: "target", Severity: "blocking", Location: "target", Message: "预检目标不是已支持的 sing-box 客户端"}}, Planned: []PreflightItem{}}
	}
	_, result := compileSingBox(opts)
	return result
}

func requireStrictExactPlan(opts Options, result PreflightResult) error {
	if result.Status != PreflightExact {
		return &PreflightError{Result: result}
	}
	if opts.PlanDigest == "" || opts.PlanDigest != result.PlanDigest {
		result.Status = PreflightUnsupported
		result.Issues = append(result.Issues, PreflightIssue{
			Code: "plan_digest", Severity: "blocking", Location: "plan_digest",
			Message: "严格导出需要与当前预检完全匹配的计划摘要",
		})
		return &PreflightError{Result: result}
	}
	return nil
}

type PreflightError struct {
	Result PreflightResult
}

func (e *PreflightError) Error() string {
	if len(e.Result.Issues) == 0 {
		return "sing-box 导出预检失败"
	}
	return e.Result.Issues[0].Message
}

type singBoxPlan struct {
	opts   Options
	result PreflightResult
}

const singBoxGeoIPCNURL = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.mrs"
const singBoxGeoIPCNRevision = "0a9e013b5bb8971992bc09ebfe1b889cd74d65d0"

// SingBoxGeoIPCNRuleSet returns the canonical synthetic resource used to
// represent GEOIP,CN during sing-box preflight and generation. Services can
// use it to prefetch/cache the exact same source without duplicating its URL.
func SingBoxGeoIPCNRuleSet() model.RuleSchemeRuleSet {
	return model.RuleSchemeRuleSet{
		Tag:      "tower-geoip-cn",
		URL:      singBoxGeoIPCNURL,
		Behavior: "ipcidr",
		Format:   "mrs",
		Interval: 86400,
		Author:   "MetaCubeX",
	}
}

// mapSingBoxGeoIPCN expresses the bounded GEOIP,CN condition using the
// matching MetaCubeX GeoIP source, whose sing branch publishes the same set
// as a sing-box SRS file. Other GEOIP values remain unsupported.
func mapSingBoxGeoIPCN(scheme *model.RuleScheme) (*model.RuleScheme, []int) {
	if scheme == nil {
		return nil, nil
	}
	copyScheme := *scheme
	copyScheme.Rules = append([]model.RuleSchemeRule(nil), scheme.Rules...)
	var mappedRules []int
	for i := range copyScheme.Rules {
		rule := &copyScheme.Rules[i]
		if rule.Final || rule.Resource != nil {
			continue
		}
		fields := splitRuleFields(rule.Body)
		if len(fields) != 2 || !strings.EqualFold(strings.TrimSpace(fields[0]), "GEOIP") || !strings.EqualFold(strings.TrimSpace(fields[1]), "CN") {
			continue
		}
		rule.Body = ""
		resource := SingBoxGeoIPCNRuleSet()
		rule.Resource = &resource
		mappedRules = append(mappedRules, i)
	}
	return &copyScheme, mappedRules
}

func compileSingBox(opts Options) (singBoxPlan, PreflightResult) {
	opts.Nodes = FilterNodes(opts.Nodes, opts.Protocols)
	var regionIssues []PreflightIssue
	opts, regionIssues = applyServiceRegions(opts)
	digestOptions := opts
	plan := singBoxPlan{opts: opts, result: PreflightResult{Status: PreflightExact, Planned: []PreflightItem{}}}
	plan.result.TargetPolicy, plan.result.PolicyNote = SchemeTargetPolicy(opts.Target, schemeID(opts.Scheme))
	for _, regionIssue := range regionIssues {
		plan.issueAt(regionIssue.Code, regionIssue.Message, regionIssue.Location)
	}
	if opts.Strict && len(opts.Nodes) == 0 {
		plan.issueAt("nodes_empty", "严格导出至少需要一个已选择的节点", "nodes")
	}
	unsupportedNodes := make(map[model.ProxyKind]int)
	if opts.Scheme == nil {
		plan.result.Planned = append(plan.result.Planned,
			PreflightItem{Kind: "group", Name: selectGroupName, Location: "defaults.selector"},
			PreflightItem{Kind: "group", Name: autoGroupName, Location: "defaults.urltest"},
			PreflightItem{Kind: "group", Name: singBoxDirectTag, Location: "defaults.direct"},
		)
		for i, node := range opts.Nodes {
			tag := displayName(node)
			plan.result.Planned = append(plan.result.Planned, PreflightItem{Kind: "node", Name: tag, Location: fmt.Sprintf("nodes[%d]", i)})
			if isReservedSingBoxTag(tag) || tag == selectGroupName || tag == autoGroupName {
				plan.issueAt("tag_collision", fmt.Sprintf("节点 tag %q 与内置或默认策略组 tag 冲突", tag), fmt.Sprintf("nodes[%d].tag", i))
			}
			if !SupportsProtocol(opts.Target, node.Kind) || singBoxOutbound(node, displayName(node)) == nil {
				unsupportedNodes[node.Kind]++
			}
		}
		plan.issueUnsupportedNodes(unsupportedNodes)
		finalizeSingBoxPlan(&plan, digestOptions)
		return plan, plan.result
	}

	// The source tree has three Clash-family bundled schemes. Convert only the
	// proven GEOIP,CN predicate before validation and provider planning.
	if opts.PreferRuleSets {
		var mappedRules []int
		opts.Scheme, mappedRules = mapSingBoxGeoIPCN(opts.Scheme)
		if plan.result.TargetPolicy == "" {
			for _, i := range mappedRules {
				location := fmt.Sprintf("rules[%d]", i)
				plan.warningAt("geoip_cn", "GEOIP,CN 已替换为固定 MetaCubeX sing SRS 快照；数据集与原规则来源可能不同", location)
			}
		}
	}
	scheme := opts.Scheme
	names := uniquedNames(opts.Nodes)
	nameSet := make(map[string]bool, len(names))
	for i, name := range names {
		nameSet[name] = true
		plan.result.Planned = append(plan.result.Planned, PreflightItem{Kind: "node", Name: name, Location: fmt.Sprintf("nodes[%d]", i)})
		if isReservedSingBoxTag(name) {
			plan.issueAt("tag_collision", fmt.Sprintf("节点 tag %q 与 sing-box 内置 tag 冲突", name), fmt.Sprintf("nodes[%d].tag", i))
		}
	}
	for i, node := range opts.Nodes {
		if !SupportsProtocol(opts.Target, node.Kind) || singBoxOutbound(node, names[i]) == nil {
			unsupportedNodes[node.Kind]++
		}
	}
	plan.issueUnsupportedNodes(unsupportedNodes)
	plan.validateNetwork(scheme.NetworkSettings)
	groupNames := plan.validateGroups(scheme.Groups, names, nameSet)
	plan.validateRules(scheme, groupNames, opts.Target, opts.PreferRuleSets)
	plan.validateResources(scheme.Rules, opts)

	if len(plan.result.Issues) == 0 {
		prepared, err := prepareScheme(scheme, names)
		if err != nil {
			plan.issue("scheme", err.Error())
		} else {
			plan.opts.Scheme = prepared
			plannedRules, providers, err := planSchemeRules(plan.opts)
			if err != nil {
				plan.issue("resource", err.Error())
			} else {
				plan.opts.plannedRules = plannedRules
				plan.opts.plannedProviders = providers
				plan.validatePlannedRules(plannedRules, groupNames)
				providerTags := make(map[string]bool)
				for _, provider := range providers {
					if providerTags[provider.id] || groupNames[provider.id] || nameSet[provider.id] || isReservedSingBoxTag(provider.id) {
						plan.issueAt("tag_collision", fmt.Sprintf("规则集 tag %q 与其他配置 tag 冲突", provider.id), "resources["+provider.id+"].tag")
					}
					providerTags[provider.id] = true
				}
			}
		}
	}
	finalizeSingBoxPlan(&plan, digestOptions)
	return plan, plan.result
}

func finalizeSingBoxPlan(plan *singBoxPlan, opts Options) {
	payload := struct {
		Target         model.ClientTarget
		TargetPolicy   string
		Nodes          []model.ProxyNode
		Protocols      []model.ProxyKind
		ServiceRegions map[string]string
		Scheme         *model.RuleScheme
		PreferRuleSets bool
		Strict         bool
		RuleSetLines   map[string][]string
		Planned        []PreflightItem
		Warnings       []PreflightWarning
		Issues         []PreflightIssue
	}{
		Target: opts.Target, TargetPolicy: plan.result.TargetPolicy,
		Nodes: opts.Nodes, Protocols: opts.Protocols, ServiceRegions: opts.ServiceRegions,
		Scheme: opts.Scheme, PreferRuleSets: opts.PreferRuleSets,
		Strict:       opts.Strict,
		RuleSetLines: opts.RuleSetLines, Planned: plan.result.Planned,
		Warnings: plan.result.Warnings, Issues: plan.result.Issues,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		plan.result.PlanDigest = ""
		return
	}
	digest := sha256.Sum256(data)
	plan.result.PlanDigest = fmt.Sprintf("%x", digest[:])
}

func acceptDegradedPlan(opts Options, result *PreflightResult) bool {
	warningIDs := make([]string, 0, len(result.Warnings))
	for _, warning := range result.Warnings {
		warningIDs = append(warningIDs, warning.ID)
	}
	accepted := append([]string(nil), opts.AcceptedDegradations...)
	sort.Strings(warningIDs)
	sort.Strings(accepted)
	valid := opts.PlanDigest != "" && opts.PlanDigest == result.PlanDigest && len(accepted) == len(warningIDs)
	if valid {
		for i := range warningIDs {
			if accepted[i] == "" || accepted[i] != warningIDs[i] || (i > 0 && accepted[i] == accepted[i-1]) {
				valid = false
				break
			}
		}
	}
	if valid {
		return true
	}
	result.Status = PreflightUnsupported
	result.Issues = append(result.Issues, PreflightIssue{
		Code: "degradation_not_accepted", Severity: "blocking", Location: "degradations",
		Message: "降级导出需要匹配本次预检摘要，并逐项确认当前全部 warning",
	})
	return false
}

func (p *singBoxPlan) issue(code, message string) {
	p.issueAt(code, message, "scheme")
}

func (p *singBoxPlan) issueAt(code, message, location string) {
	p.result.Status = PreflightUnsupported
	p.result.Issues = append(p.result.Issues, PreflightIssue{Code: code, Severity: "blocking", Location: location, Message: message})
}

func (p *singBoxPlan) warningAt(code, message, location string) {
	for _, warning := range p.result.Warnings {
		if warning.Code == code && warning.Location == location {
			return
		}
	}
	p.result.Warnings = append(p.result.Warnings, PreflightWarning{
		ID: code + "@" + location, Code: code, Location: location, Message: message,
	})
	if p.result.Status == PreflightExact {
		p.result.Status = PreflightDegraded
	}
}

func (p *singBoxPlan) issueUnsupportedNodes(counts map[model.ProxyKind]int) {
	kinds := make([]string, 0, len(counts))
	for kind := range counts {
		kinds = append(kinds, string(kind))
	}
	sort.Strings(kinds)
	for _, kind := range kinds {
		p.issueAt("node_protocol", fmt.Sprintf("%d 个 %s 节点不支持 sing-box；请在节点列表筛选该协议并清空选择", counts[model.ProxyKind(kind)], kind), "nodes")
	}
}

func (p *singBoxPlan) validateNetwork(settings *model.RuleSchemeNetworkSettings) {
	if settings == nil {
		return
	}
	if settings.IPv6Enabled != nil || len(settings.DNSServers) > 0 || len(settings.FallbackDNSServers) > 0 || len(settings.EncryptedDNSServers) > 0 {
		p.issueAt("network_settings", "方案包含当前 sing-box 导出器未应用的网络或 DNS 设置", "network_settings")
	}
}

func (p *singBoxPlan) validateGroups(groups []model.RuleSchemeGroup, nodeNames []string, nodeSet map[string]bool) map[string]bool {
	known := map[string]bool{"DIRECT": true, "REJECT": true}
	groupSet := make(map[string]model.RuleSchemeGroup, len(groups))
	for i, group := range groups {
		location := fmt.Sprintf("groups[%d]", i)
		p.result.Planned = append(p.result.Planned, PreflightItem{Kind: "group", Name: group.Name, Location: location})
		if strings.TrimSpace(group.Name) == "" {
			p.issueAt("group_name", "方案包含名称为空的策略组", location+".name")
			continue
		}
		if known[group.Name] || nodeSet[group.Name] || groupSet[group.Name].Name != "" || isReservedSingBoxTag(group.Name) {
			p.issueAt("tag_collision", fmt.Sprintf("策略组 %q 与内置或已有 tag 冲突", group.Name), location+".name")
		}
		known[group.Name] = true
		groupSet[group.Name] = group
		if group.Kind != model.KindSelect && group.Kind != model.KindURLTest {
			p.issueAt("group_kind", fmt.Sprintf("策略组 %q 的类型 %q 暂不支持 sing-box", group.Name, group.Kind), location+".kind")
		}
	}
	for i, group := range groups {
		location := fmt.Sprintf("groups[%d]", i)
		if len(group.Members) == 0 {
			p.issueAt("group_empty", fmt.Sprintf("策略组 %q 没有成员", group.Name), location+".members")
		}
		for j, member := range group.Members {
			memberLocation := fmt.Sprintf("%s.members[%d]", location, j)
			switch member.Type {
			case model.MemberReference:
				if isSingBoxReject(member.Value) {
					continue
				}
				if isSingBoxRejectDrop(member.Value) {
					p.issueAt("group_reference", fmt.Sprintf("sing-box block outbound 不能保留策略组 %q 中 REJECT-DROP 的静默丢弃语义", group.Name), memberLocation)
					continue
				}
				if !known[member.Value] {
					p.issueAt("group_reference", fmt.Sprintf("策略组 %q 引用了未知组 %q", group.Name, member.Value), memberLocation)
				}
			case model.MemberNodePattern:
				if strings.TrimSpace(member.Value) == "" || !validNodePattern(member.Value) || (member.Exclude != "" && !validNodePattern(member.Exclude)) {
					p.issueAt("group_pattern", fmt.Sprintf("策略组 %q 含无效节点正则", group.Name), memberLocation)
				}
			default:
				p.issueAt("group_member", fmt.Sprintf("策略组 %q 含不支持的成员类型 %q", group.Name, member.Type), memberLocation+".type")
			}
		}
	}
	state := map[string]int{}
	var visit func(string)
	visit = func(name string) {
		if state[name] == 1 {
			p.issue("group_cycle", fmt.Sprintf("策略组引用形成循环：%q", name))
			return
		}
		if state[name] == 2 {
			return
		}
		state[name] = 1
		for _, member := range groupSet[name].Members {
			if member.Type == model.MemberReference && groupSet[member.Value].Name != "" {
				visit(member.Value)
			}
		}
		state[name] = 2
	}
	for _, group := range groups {
		if group.Name != "" {
			visit(group.Name)
		}
	}
	return known
}

func isReservedSingBoxTag(tag string) bool {
	switch strings.ToUpper(strings.TrimSpace(tag)) {
	case "DIRECT", "REJECT", "REJECT-DROP":
		return true
	default:
		return false
	}
}

func validNodePattern(pattern string) bool {
	const prefix = "^(?!.*((?i)"
	const suffix = ")).*$"
	if strings.HasPrefix(pattern, prefix) && strings.HasSuffix(pattern, suffix) {
		_, err := regexp.Compile("(?i)(?:" + strings.TrimSuffix(strings.TrimPrefix(pattern, prefix), suffix) + ")")
		return err == nil
	}
	_, err := regexp.Compile(pattern)
	return err == nil
}

func (p *singBoxPlan) validateRules(scheme *model.RuleScheme, groups map[string]bool, target model.ClientTarget, preferRuleSets bool) {
	finals := 0
	for i, rule := range scheme.Rules {
		location := fmt.Sprintf("rules[%d]", i)
		name := rule.Body
		mappedMRS := false
		if rule.Final {
			name = "MATCH"
			finals++
			if i != len(scheme.Rules)-1 {
				p.issueAt("match_position", "MATCH/FINAL 必须是方案最后一条规则", location)
			}
			if rule.Resource != nil || strings.TrimSpace(rule.Body) != "" || len(rule.Options) > 0 {
				p.issueAt("match_shape", "MATCH/FINAL 不能带条件、资源或选项", location)
			}
			if !groups[rule.Group] || isSingBoxReject(rule.Group) || isSingBoxRejectDrop(rule.Group) {
				p.issueAt("match_target", fmt.Sprintf("MATCH/FINAL 指向无效 outbound %q", rule.Group), location+".group")
			}
		} else if rule.Resource == nil {
			if isURLRegexRule(rule.Body) {
				if p.result.TargetPolicy == "" {
					p.warnInlineURLRegex(scheme, rule, i, location)
				}
			} else {
				p.validateRuleBodyAt(rule.Body, location+".body")
			}
		} else {
			mappedURL, mapping, mapped := mapSingBoxMRS(*rule.Resource)
			mappedMRS = preferRuleSets && (singBoxMRSMappingAllowed(target) || target == model.ClientClashooSB) && mapped
			name = firstNonEmpty(rule.Resource.Tag, rule.Resource.URL)
			outputURL := rule.Resource.URL
			outputFormat := rule.Resource.Format
			mappingReason := ""
			author := rule.Resource.Author
			license := rule.Resource.License
			if mappedMRS {
				if author == "" {
					author = "MetaCubeX"
				}
				if license == "" {
					license = "GPL-3.0"
				}
				if target == model.ClientClashooSB {
					outputURL, _ = ClashooInlineSourceURL(*rule.Resource)
					outputFormat = "inline"
					mappingReason = "将经 allowlist 核验的 MetaCubeX MRS 映射为 sing 分支 JSON inline 规则；只接受已验证 matcher 子集，不保证规则逐条等价"
				} else {
					outputURL = mappedURL
					outputFormat = "binary"
					mappingReason = mapping.reason
				}
			}
			p.result.Planned = append(p.result.Planned, PreflightItem{
				Kind: "resource", Name: name, Location: location + ".resource",
				URL: outputURL, SourceURL: rule.Resource.URL, Format: outputFormat, SourceFormat: rule.Resource.Format,
				Author: author, License: license, MappingReason: mappingReason,
			})
			name = "RULE-SET " + name + " -> " + rule.Group
			p.validateResource(*rule.Resource, rule.Options, mappedMRS, location+".resource")
		}
		if rule.Group == "" || (!groups[rule.Group] && !builtinRulePolicy(rule.Group)) {
			p.issueAt("rule_target", fmt.Sprintf("规则 %q 指向未知策略 %q", name, rule.Group), location+".group")
		}
		if !rule.Final {
			kind := "rule"
			if rule.Resource == nil && isURLRegexRule(rule.Body) {
				kind = "omitted_rule"
			}
			p.result.Planned = append(p.result.Planned, PreflightItem{Kind: kind, Name: name, Location: location})
		} else {
			p.result.Planned = append(p.result.Planned, PreflightItem{Kind: "rule", Name: "MATCH", Location: location})
		}
		// This target emits only a rule_set reference and never adds a resolve action.
		validMappedNoResolve := mappedMRS && rule.Resource != nil && strings.EqualFold(strings.TrimSpace(rule.Resource.Behavior), "ipcidr") && isNoResolve(rule.Options)
		if len(rule.Options) > 0 && !validMappedNoResolve && !validIPNoResolve(rule.Body, rule.Options) {
			p.issueAt("rule_options", fmt.Sprintf("规则 %q 含 sing-box 导出器未映射的选项", name), location+".options")
		}
	}
	if finals != 1 {
		p.issueAt("match_count", fmt.Sprintf("方案必须恰有一条 MATCH/FINAL 兜底规则，当前为 %d 条", finals), "rules")
	}
}

func isURLRegexRule(body string) bool {
	fields := splitRuleFields(body)
	return len(fields) > 0 && strings.EqualFold(strings.TrimSpace(fields[0]), "URL-REGEX")
}

func schemeSourceFile(scheme *model.RuleScheme) string {
	if scheme == nil {
		return "scheme"
	}
	switch scheme.ID {
	case "acl4ssr-online":
		return "ACL4SSR_Online.ini"
	case "acl4ssr-full":
		return "ACL4SSR_Online_Full.ini"
	case "self-configuration":
		return "Self_Configuration.ini"
	}
	if source, err := url.Parse(scheme.SourceURL); err == nil && path.Base(source.Path) != "." && path.Base(source.Path) != "/" {
		return path.Base(source.Path)
	}
	if scheme.ID != "" {
		return scheme.ID
	}
	return "scheme"
}

func (p *singBoxPlan) warnInlineURLRegex(scheme *model.RuleScheme, rule model.RuleSchemeRule, index int, location string) {
	sourceFile := schemeSourceFile(scheme)
	lineNumber := 0
	if scheme != nil && scheme.RawConfig != "" {
		needle := strings.TrimSpace(strings.TrimPrefix(rule.Body, splitRuleFields(rule.Body)[0]+","))
		for i, line := range strings.Split(scheme.RawConfig, "\n") {
			if !strings.Contains(strings.ToUpper(line), "URL-REGEX") || !strings.Contains(line, needle) || !strings.Contains(line, rule.Group) {
				continue
			}
			lineNumber = i + 1
			break
		}
	}
	if lineNumber > 0 {
		location = fmt.Sprintf("%s:%d", sourceFile, lineNumber)
	} else {
		location = fmt.Sprintf("%s:rules[%d]", sourceFile, index)
	}
	p.warningAt("url_regex", fmt.Sprintf("%s 的 URL-REGEX 不能等价转换为 sing-box 域名匹配，已省略；策略组 %q", location, rule.Group), location)
}

func builtinRulePolicy(policy string) bool {
	switch strings.TrimSpace(policy) {
	case "DIRECT":
		return true
	}
	return isSingBoxReject(policy)
}

func isNoResolve(options []string) bool {
	return len(options) == 1 && strings.EqualFold(strings.TrimSpace(options[0]), "no-resolve")
}

func validIPNoResolve(body string, options []string) bool {
	if !isNoResolve(options) {
		return false
	}
	fields := splitRuleFields(body)
	if len(fields) != 2 {
		return false
	}
	switch strings.ToUpper(fields[0]) {
	case "IP-CIDR", "IP-CIDR6", "IP6-CIDR":
		return true
	default:
		return false
	}
}

func (p *singBoxPlan) validateRuleBody(body string) {
	p.validateRuleBodyAt(body, "rules")
}

func (p *singBoxPlan) validateRuleBodyAt(body, location string) {
	fields := splitRuleFields(body)
	if len(fields) < 2 || strings.TrimSpace(fields[0]) == "" || strings.TrimSpace(fields[1]) == "" {
		p.issueAt("rule_empty", fmt.Sprintf("规则 %q 缺少类型或匹配值", body), location)
		return
	}
	kind := strings.ToUpper(fields[0])
	if singBoxRuleFields[kind] == "" {
		if kind == "URL-REGEX" {
			p.issueAt("rule_type", "URL-REGEX 匹配完整 URL，sing-box domain_regex 只匹配域名，无法等价转换", location)
			return
		}
		p.issueAt("rule_type", fmt.Sprintf("规则类型 %q 暂不支持 sing-box", kind), location)
		return
	}
	if len(fields) != 2 {
		p.issueAt("rule_options", fmt.Sprintf("规则 %q 含无法映射的行内选项或多余字段", body), location)
		return
	}
	value := strings.TrimSpace(fields[1])
	switch kind {
	case "DOMAIN-REGEX":
		if _, err := regexp.Compile(value); err != nil {
			p.issueAt("rule_value", fmt.Sprintf("规则正则 %q 无效：%v", value, err), location)
		}
	case "IP-CIDR", "IP-CIDR6", "IP6-CIDR":
		if _, _, err := net.ParseCIDR(value); err != nil {
			p.issueAt("rule_value", fmt.Sprintf("IP 规则值 %q 无效", value), location)
		}
	}
}

func (p *singBoxPlan) validateResource(resource model.RuleSchemeRuleSet, options []string, mapped bool, location string) {
	parsed, err := url.Parse(resource.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		p.issueAt("resource_url", fmt.Sprintf("规则集 URL %q 无效或不受支持", resource.URL), location+".url")
	}
	validNoResolve := mapped && strings.EqualFold(strings.TrimSpace(resource.Behavior), "ipcidr") && len(options) == 1 && strings.EqualFold(options[0], "no-resolve")
	if len(resource.Options) > 0 || (len(options) > 0 && !validNoResolve) {
		p.issueAt("resource_options", fmt.Sprintf("规则集 %q 含 sing-box 导出器未映射的选项", resource.URL), location+".options")
	}
	format := strings.ToLower(strings.TrimSpace(resource.Format))
	if format == "mrs" {
		if !mapped {
			p.issueAt("resource_format", fmt.Sprintf("规则集 %q 是未映射的 Mihomo MRS，当前目标没有可用 SRS 资源", resource.URL), location+".format")
		}
	} else if format != "" && format != "json" && format != "source" && format != "text" && format != "yaml" {
		p.issueAt("resource_format", fmt.Sprintf("规则集 %q 使用不支持的格式 %q", resource.URL, resource.Format), location+".format")
	}
	if strings.EqualFold(strings.TrimSpace(resource.Behavior), "classical") && format != "json" && format != "source" {
		return
	}
	if format == "json" || format == "source" {
		return
	}
	if strings.EqualFold(strings.TrimSpace(resource.Behavior), "domain") || strings.EqualFold(strings.TrimSpace(resource.Behavior), "ipcidr") {
		return
	}
	if resource.Behavior != "" {
		p.issueAt("resource_behavior", fmt.Sprintf("规则集 %q 使用不支持的行为 %q", resource.URL, resource.Behavior), location+".behavior")
	}
}

func (p *singBoxPlan) validateResources(rules []model.RuleSchemeRule, opts Options) {
	for i, rule := range rules {
		if rule.Resource == nil {
			continue
		}
		resource := *rule.Resource
		location := fmt.Sprintf("rules[%d].resource", i)
		lines, ok := opts.RuleSetLines[resource.URL]
		if opts.Target == model.ClientClashooSB && opts.PreferRuleSets && hasSingBoxSourceURL(resource) {
			p.issueAt("resource_target", fmt.Sprintf("规则集 %s 会被 Clashoo sing-box 导入器丢弃，当前没有本地 SRS 资源", resource.URL), location)
			continue
		}
		if strings.EqualFold(strings.TrimSpace(resource.Format), "mrs") {
			if opts.Target == model.ClientClashooSB && opts.PreferRuleSets {
				sourceURL, mapped := ClashooInlineSourceURL(resource)
				if !mapped {
					continue
				}
				lines, ok := opts.RuleSetLines[resource.URL]
				if !ok || len(lines) == 0 {
					p.issueAt("resource_cache", fmt.Sprintf("规则集 %s 缺少 Clashoo inline JSON 缓存（来源 %s）", resource.URL, sourceURL), location)
					continue
				}
				if _, err := ParseClashooInlineRuleSet([]byte(strings.Join(lines, "\n"))); err != nil {
					p.issueAt("resource_source", fmt.Sprintf("规则集 %s 的 inline JSON 无效：%v", resource.URL, err), location)
				}
				continue
			}
			if opts.PreferRuleSets && singBoxMRSMappingAllowed(opts.Target) {
				if _, _, mapped := mapSingBoxMRS(resource); mapped {
					continue
				}
			}
			continue
		}
		if opts.PreferRuleSets && isSingBoxSource(resource, lines) {
			if !ok || len(lines) == 0 {
				p.issueAt("resource_cache", fmt.Sprintf("规则集 %s 缺少 sing-box source JSON 缓存", resource.URL), location)
				continue
			}
			if err := nativeSourceValid(resource, lines); err != nil {
				p.issueAt("resource_source", fmt.Sprintf("规则集 %s 不是受支持子集内的有效 sing-box source JSON：%v", resource.URL, err), location)
			}
			continue
		}
		if !ok || len(lines) == 0 {
			p.issueAt("resource_cache", fmt.Sprintf("规则集 %s 没有可用的本地缓存", resource.URL), location)
			continue
		}
		expanded, err := resourceLines(resource, lines)
		if err != nil {
			p.issueAt("resource_format", err.Error(), location)
			continue
		}
		validRules := 0
		for lineIndex, line := range expanded {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "//") {
				continue
			}
			if isURLRegexRule(line) {
				validRules++
				if p.result.TargetPolicy != "" {
					continue
				}
				sourceLine := ruleSourceLine(resource, opts.RuleSetLines[resource.URL], lineIndex)
				warningLocation := fmt.Sprintf("rules[%d].resource.%s", i, sourceLine)
				p.warningAt("url_regex", fmt.Sprintf("%s 的 URL-REGEX 不能等价转换为 sing-box 域名匹配，已省略；策略组 %q", sourceLine, rule.Group), warningLocation)
				continue
			}
			body, options := normalizeResourceLine(resource, line)
			if body == "" {
				p.issueAt("resource_line", fmt.Sprintf("规则集 %s 含无法识别的规则行 %q", resource.URL, line), location)
				continue
			}
			validRules++
			p.validateRuleBodyAt(body, location)
			if len(resource.Options) > 0 || (len(options) > 0 && !validIPNoResolve(body, options)) || (len(rule.Options) > 0 && !validIPNoResolve(body, rule.Options)) {
				p.issueAt("resource_options", fmt.Sprintf("规则集 %s 含 sing-box 导出器未映射的规则选项", resource.URL), location)
			}
		}
		if validRules == 0 {
			p.issueAt("resource_empty", fmt.Sprintf("规则集 %s 没有可用规则", resource.URL), location)
		}
	}
}

func (p *singBoxPlan) validatePlannedRules(rules []plannedRule, groups map[string]bool) {
	for i, planned := range rules {
		if planned.rule.Final {
			continue
		}
		if planned.native {
			continue
		}
		location := fmt.Sprintf("expanded_rules[%d]", i)
		p.validateRuleBodyAt(planned.rule.Body, location)
		if !groups[planned.rule.Group] && !builtinRulePolicy(planned.rule.Group) {
			p.issueAt("rule_target", fmt.Sprintf("展开后的规则指向未知策略 %q", planned.rule.Group), location+".group")
		}
	}
}

// nativeSourceValid checks a bounded matcher subset; it is not full sing-box schema validation.
func nativeSourceValid(resource model.RuleSchemeRuleSet, lines []string) error {
	if strings.EqualFold(strings.TrimSpace(resource.Format), "mrs") {
		return errors.New("Mihomo MRS cannot be consumed as a sing-box source")
	}
	if !isSingBoxSource(resource, lines) {
		return errors.New("expected a valid sing-box source JSON rule set")
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal([]byte(strings.Join(lines, "\n")), &doc); err != nil {
		return err
	}
	rootKeys := make([]string, 0, len(doc))
	for key := range doc {
		rootKeys = append(rootKeys, key)
	}
	sort.Strings(rootKeys)
	for _, key := range rootKeys {
		if key != "version" && key != "rules" {
			return fmt.Errorf("unsupported source field %q", key)
		}
	}
	var version int
	var rules []json.RawMessage
	if err := json.Unmarshal(doc["version"], &version); err != nil || version != 1 {
		return errors.New("sing-box source JSON requires version 1")
	}
	if err := json.Unmarshal(doc["rules"], &rules); err != nil || len(rules) == 0 {
		return errors.New("sing-box source JSON requires version 1 and non-empty rules")
	}
	allowed := map[string]bool{
		"domain": true, "domain_suffix": true, "domain_keyword": true,
		"domain_regex": true, "ip_cidr": true, "process_name": true,
	}
	for index, raw := range rules {
		var rule map[string]json.RawMessage
		if err := json.Unmarshal(raw, &rule); err != nil || len(rule) == 0 {
			return fmt.Errorf("rule %d is not an object", index)
		}
		conditions := 0
		ruleKeys := make([]string, 0, len(rule))
		for key := range rule {
			ruleKeys = append(ruleKeys, key)
		}
		sort.Strings(ruleKeys)
		for _, key := range ruleKeys {
			value := rule[key]
			if key == "invert" {
				var invert bool
				if err := json.Unmarshal(value, &invert); err != nil || (string(value) != "true" && string(value) != "false") {
					return fmt.Errorf("rule %d has invalid invert value", index)
				}
				continue
			}
			if !allowed[key] {
				return fmt.Errorf("rule %d uses unsupported field %q", index, key)
			}
			var values []string
			if err := json.Unmarshal(value, &values); err != nil || len(values) == 0 {
				return fmt.Errorf("rule %d field %q must be a non-empty string array", index, key)
			}
			for _, item := range values {
				if strings.TrimSpace(item) == "" {
					return fmt.Errorf("rule %d field %q contains an empty value", index, key)
				}
				if key == "domain_regex" {
					if _, err := regexp.Compile(item); err != nil {
						return fmt.Errorf("rule %d has invalid domain_regex: %w", index, err)
					}
				}
				if key == "ip_cidr" {
					if _, _, err := net.ParseCIDR(item); err != nil {
						return fmt.Errorf("rule %d has invalid ip_cidr %q", index, item)
					}
				}
			}
			conditions++
		}
		if conditions == 0 {
			return fmt.Errorf("rule %d has no supported matcher", index)
		}
	}
	return nil
}
