package generator

import (
	"fmt"
	"net"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/kenzok8/tower/internal/model"
)

var regionCodes = map[string]bool{
	"hk": true, "tw": true, "sg": true, "jp": true, "kr": true,
	"us": true, "uk": true, "de": true, "fr": true, "ca": true,
	"au": true, "in": true,
}

var regionAliases = map[string][]string{
	"hk": {"香港", "hong kong", "hongkong", "🇭🇰"},
	"tw": {"台湾", "臺灣", "taiwan", "🇹🇼"},
	"sg": {"新加坡", "singapore", "🇸🇬"},
	"jp": {"日本", "japan", "🇯🇵"},
	"kr": {"韩国", "韓國", "south korea", "korea", "🇰🇷"},
	"us": {"美国", "美國", "united states", "🇺🇸"},
	"uk": {"英国", "英國", "united kingdom", "great britain", "🇬🇧"},
	"de": {"德国", "德國", "germany", "🇩🇪"},
	"fr": {"法国", "法國", "france", "🇫🇷"},
	"ca": {"加拿大", "canada", "🇨🇦"},
	"au": {"澳大利亚", "澳洲", "australia", "🇦🇺"},
	"in": {"印度", "india", "🇮🇳"},
}

var regionAliasOrder = []string{"hk", "tw", "sg", "jp", "kr", "us", "uk", "de", "fr", "ca", "au", "in"}

// EffectiveRegion derives a supported region code without persisting a guess.
// An explicit valid CountryOverride takes precedence over the display name.
func EffectiveRegion(node model.ProxyNode) string {
	if code := normalizeRegionCode(node.CountryOverride); code != "" {
		return code
	}
	name := strings.ToLower(node.Name)
	for _, code := range regionAliasOrder {
		aliases := regionAliases[code]
		for _, alias := range aliases {
			if strings.Contains(name, alias) {
				return code
			}
		}
	}
	fields := strings.FieldsFunc(name, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r)
	})
	for _, field := range fields {
		if code := normalizeRegionCode(field); code != "" {
			return code
		}
	}
	return ""
}

func normalizeRegionCode(value string) string {
	code := strings.ToLower(strings.TrimSpace(value))
	if regionCodes[code] {
		return code
	}
	return ""
}

// SupportedRegion reports whether code is accepted by service-region filters.
func SupportedRegion(code string) bool {
	return normalizeRegionCode(code) != ""
}

var serviceRegionAliases = map[string][]string{
	"claude":  {"claude", "anthropic"},
	"openai":  {"openai"},
	"gemini":  {"gemini"},
	"netflix": {"netflix"},
}

type serviceRegionRule struct {
	name       string
	geositeTag string
	geoipTag   string
}

var serviceRegionRuleOrder = []string{"claude", "openai", "gemini", "netflix"}

var serviceRegionRules = map[string]serviceRegionRule{
	"claude":  {name: "Claude", geositeTag: "anthropic"},
	"openai":  {name: "OpenAI", geositeTag: "openai"},
	"gemini":  {name: "Gemini", geositeTag: "google-gemini"},
	"netflix": {name: "Netflix", geositeTag: "netflix", geoipTag: "netflix"},
}

func SchemeTargetPolicy(target model.ClientTarget, schemeID string) (string, string) {
	switch {
	case target.Family() == model.FamilySingBox && isACL4SSRScheme(schemeID):
		return "tower-singbox-acl-policy-v2", "sing-box 专用策略：GEOIP,CN 使用固定 MetaCubeX SRS；服务地区选择使用独立 MetaCubeX 服务规则组；URL-REGEX 省略，REJECT 保留为可选 block。"
	case target.Family() == model.FamilyDAE && isACL4SSRScheme(schemeID):
		return "tower-dae-acl-policy-v2", "DAE 专用策略：REJECT 首项组固定为 block，DIRECT 首项组固定直连，其余选择组转自动测速并保留节点过滤；服务地区选择使用独立 geosite/geoip DAT 规则组；URL-REGEX 省略，REJECT-DROP 阻断。"
	case target.Family() == model.FamilyDAE && schemeID == "kenzok8-dae-native":
		return "tower-dae-kenzok8-policy-v2", "DAE 专用策略：将 allowlist 内的 MetaCubeX MRS 映射到本机 geosite/geoip DAT 标签；按地区选择服务时使用独立 DAT 规则组，生成前由设备 dae validate 核验。"
	default:
		return "", ""
	}
}

func schemeID(scheme *model.RuleScheme) string {
	if scheme == nil {
		return ""
	}
	return scheme.ID
}

func isACL4SSRScheme(id string) bool {
	switch id {
	case "acl4ssr-online", "acl4ssr-full", "self-configuration":
		return true
	default:
		return false
	}
}

// PrepareServiceRegionPolicy applies the same ephemeral service-rule lowering
// used by preflight so the service can load any newly added rule sources.
func PrepareServiceRegionPolicy(opts Options) Options {
	prepared, _ := applyServiceRegions(opts)
	return prepared
}

func applyServiceRegions(opts Options) (Options, []PreflightIssue) {
	if len(opts.ServiceRegions) == 0 {
		return opts, nil
	}
	if opts.Scheme == nil {
		return opts, []PreflightIssue{{Code: "service_region_scheme", Severity: "blocking", Location: "service_regions", Message: "服务地区选择需要规则方案"}}
	}
	copyScheme := *opts.Scheme
	copyScheme.Groups = append([]model.RuleSchemeGroup(nil), opts.Scheme.Groups...)
	copyScheme.Rules = append([]model.RuleSchemeRule(nil), opts.Scheme.Rules...)
	for i := range copyScheme.Groups {
		copyScheme.Groups[i].Members = append([]model.RuleGroupMember(nil), opts.Scheme.Groups[i].Members...)
	}
	issues := make([]PreflightIssue, 0)
	targetPolicy, _ := SchemeTargetPolicy(opts.Target, opts.Scheme.ID)
	aclTargetPolicy := targetPolicy == "tower-singbox-acl-policy-v2" || targetPolicy == "tower-dae-acl-policy-v2" || targetPolicy == "tower-dae-kenzok8-policy-v2"
	services := orderedServiceRegionKeys(opts.ServiceRegions)
	for _, service := range services {
		region := normalizeRegionCode(opts.ServiceRegions[service])
		aliases, supported := serviceRegionAliases[strings.ToLower(strings.TrimSpace(service))]
		if !supported || region == "" {
			issues = append(issues, PreflightIssue{Code: "service_region_value", Severity: "blocking", Location: "service_regions." + service, Message: "服务名称或地区代码不受支持"})
			continue
		}
		if aclTargetPolicy {
			if targetPolicy == "tower-singbox-acl-policy-v2" && !opts.PreferRuleSets {
				issues = append(issues, PreflightIssue{Code: "service_region_rule_source", Severity: "blocking", Location: "service_regions." + service, Message: "此目标需要启用原生规则集，才能加载服务地区规则"})
				continue
			}
			if err := appendServiceRegionRules(&copyScheme, opts, strings.ToLower(strings.TrimSpace(service)), region); err != nil {
				issues = append(issues, PreflightIssue{Code: "service_region_empty", Severity: "blocking", Location: "service_regions." + service, Message: err.Error()})
			}
			continue
		}
		matchedGroup := false
		for i := range copyScheme.Groups {
			group := &copyScheme.Groups[i]
			if !matchesServiceGroup(group.Name, aliases) {
				continue
			}
			matchedGroup = true
			patterns, err := serviceRegionNodePatterns(opts, region)
			if err != nil {
				issues = append(issues, PreflightIssue{Code: "service_region_empty", Severity: "blocking", Location: "service_regions." + service, Message: fmt.Sprintf("%s 没有可用于所选地区的已选节点", service)})
				continue
			}
			group.Members = []model.RuleGroupMember{{Type: model.MemberNodePattern, Value: "^(?:" + strings.Join(patterns, "|") + ")$"}}
		}
		if !matchedGroup {
			issues = append(issues, PreflightIssue{Code: "service_region_group", Severity: "blocking", Location: "service_regions." + service, Message: fmt.Sprintf("当前方案没有可按地区筛选的 %s 策略组", service)})
		}
	}
	copy := copyScheme
	opts.Scheme = &copy
	return opts, issues
}

func orderedServiceRegionKeys(values map[string]string) []string {
	keysByName := make(map[string]string, len(values))
	for key := range values {
		keysByName[strings.ToLower(strings.TrimSpace(key))] = key
	}
	keys := make([]string, 0, len(values))
	for _, name := range serviceRegionRuleOrder {
		if key, ok := keysByName[name]; ok {
			keys = append(keys, key)
			delete(keysByName, name)
		}
	}
	var rest []string
	for _, key := range keysByName {
		rest = append(rest, key)
	}
	sort.Strings(rest)
	return append(keys, rest...)
}

func appendServiceRegionRules(scheme *model.RuleScheme, opts Options, service, region string) error {
	spec, ok := serviceRegionRules[service]
	if !ok {
		return fmt.Errorf("不支持服务地区策略 %s", service)
	}
	groupName := fmt.Sprintf("Tower-Service-%s-%s", spec.name, region)
	for _, group := range scheme.Groups {
		if group.Name == groupName {
			return nil
		}
	}
	patterns, err := serviceRegionNodePatterns(opts, region)
	if err != nil {
		return fmt.Errorf("%s 没有可用于所选地区的已选节点", service)
	}
	kind := model.KindURLTest
	if opts.Target.Family() == model.FamilyDAE {
		kind = model.KindDAENativeAuto
	}
	scheme.Groups = append(scheme.Groups, model.RuleSchemeGroup{
		Name: groupName, Kind: kind,
		Members: []model.RuleGroupMember{{Type: model.MemberNodePattern, Value: "^(?:" + strings.Join(patterns, "|") + ")$"}},
	})
	resource := func(sourceType, tag string) *model.RuleSchemeRuleSet {
		behavior := "domain"
		if sourceType == "geoip" {
			behavior = "ipcidr"
		}
		return &model.RuleSchemeRuleSet{
			Tag:    "tower-service-" + service + "-" + region + "-" + sourceType + "-" + tag,
			URL:    fmt.Sprintf("https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/%s/%s.mrs", sourceType, tag),
			Format: "mrs", Behavior: behavior, Interval: 86400, Author: "MetaCubeX", License: "GPL-3.0",
		}
	}
	injected := []model.RuleSchemeRule{{Group: groupName, Resource: resource("geosite", spec.geositeTag)}}
	if spec.geoipTag != "" {
		injected = append(injected, model.RuleSchemeRule{Group: groupName, Resource: resource("geoip", spec.geoipTag), Options: []string{"no-resolve"}})
	}
	insertAt := firstServiceRuleInsertionPoint(scheme)
	scheme.Rules = append(scheme.Rules, make([]model.RuleSchemeRule, len(injected))...)
	copy(scheme.Rules[insertAt+len(injected):], scheme.Rules[insertAt:len(scheme.Rules)-len(injected)])
	copy(scheme.Rules[insertAt:], injected)
	return nil
}

func serviceRegionNodePatterns(opts Options, region string) ([]string, error) {
	nodes := FilterNodes(opts.Nodes, opts.Protocols)
	names := uniquedNames(nodes)
	patterns := make([]string, 0)
	for i, node := range nodes {
		if SupportsProtocol(opts.Target, node.Kind) && EffectiveRegion(node) == region {
			patterns = append(patterns, regexp.QuoteMeta(names[i]))
		}
	}
	if len(patterns) == 0 {
		return nil, fmt.Errorf("no selected nodes match the region")
	}
	return patterns, nil
}

func firstServiceRuleInsertionPoint(scheme *model.RuleScheme) int {
	groupNames := make(map[string]string, len(scheme.Groups))
	for _, group := range scheme.Groups {
		groupNames[group.Name] = strings.ToLower(group.Name)
	}
	for i, rule := range scheme.Rules {
		if rule.Final || !isSafePrefixRule(rule, groupNames) {
			return i
		}
	}
	return len(scheme.Rules)
}

func isSafePrefixRule(rule model.RuleSchemeRule, groupNames map[string]string) bool {
	if rule.Final {
		return false
	}
	if rule.Resource != nil && strings.HasPrefix(rule.Resource.Tag, "tower-service-") {
		return true
	}
	group := strings.ToLower(strings.TrimSpace(rule.Group))
	groupName := groupNames[rule.Group]
	if group == "reject" || group == "block" || containsAny(groupName, "广告", "banad", "banprogramad", "reject", "block", "拦截", "净化") {
		return true
	}
	if rule.Resource != nil {
		source := strings.ToLower(rule.Resource.Tag + " " + rule.Resource.URL)
		safeDirectSource := containsAny(source, "localareanetwork.list", "unban.list", "/lan.list", "private.list")
		safePrivateMRS := rule.Resource.Format == "mrs" && ((rule.Resource.Behavior == "domain" && rule.Resource.URL == "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/private.mrs") || (rule.Resource.Behavior == "ipcidr" && rule.Resource.URL == "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/private.mrs"))
		safeBlockSource := containsAny(source, "banad.list", "banprogramad.list")
		if (safeDirectSource || safePrivateMRS) && (group == "direct" || strings.Contains(groupName, "直连")) {
			return true
		}
		if safeBlockSource && containsAny(groupName, "广告", "ban", "reject", "block", "拦截", "净化") {
			return true
		}
	}
	if group == "direct" || strings.Contains(groupName, "直连") {
		return isPrivateDirectRule(rule.Body)
	}
	return false
}

func isPrivateDirectRule(body string) bool {
	fields := strings.Split(body, ",")
	if len(fields) != 2 {
		return false
	}
	kind, value := strings.ToUpper(strings.TrimSpace(fields[0])), strings.ToLower(strings.TrimSpace(fields[1]))
	switch kind {
	case "GEOIP":
		return value == "private"
	case "GEOSITE":
		return value == "private"
	case "DOMAIN", "DOMAIN-SUFFIX":
		return value == "localhost" || value == "local" || value == "lan" || value == "home.arpa"
	case "IP-CIDR", "IP-CIDR6", "IP6-CIDR":
		_, network, err := net.ParseCIDR(value)
		if err != nil {
			return false
		}
		ip := network.IP
		return ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast()
	default:
		return false
	}
}

func containsAny(value string, needles ...string) bool {
	for _, needle := range needles {
		if strings.Contains(value, needle) {
			return true
		}
	}
	return false
}

func matchesServiceGroup(groupName string, aliases []string) bool {
	name := strings.ToLower(groupName)
	for _, alias := range aliases {
		if strings.Contains(name, alias) {
			return true
		}
	}
	return false
}
