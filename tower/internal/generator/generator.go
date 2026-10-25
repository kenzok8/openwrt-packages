// Package generator turns a node list into a client configuration.
//
// It ports the Swift ConfigurationGenerator. Each client family emits a
// different wire format (Clash YAML, sing-box JSON, Surge INI, …). Node names
// are untrusted airport input and are escaped before being written.
package generator

import (
	"crypto/sha1"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/kenzok8/tower/internal/model"
)

// Options are the inputs to a single configuration generation.
type Options struct {
	Target model.ClientTarget
	Nodes  []model.ProxyNode
	// Protocols is the set of enabled proxy kinds. Nil means all protocols.
	Protocols []model.ProxyKind
	// Scheme replaces the built-in proxy groups and rules. Nil keeps the
	// minimal select + url-test fallback.
	Scheme *model.RuleScheme
	// PreferRuleSets keeps supported remote resources as client-native links.
	// When false (or unsupported for a target), cached lines are inlined.
	PreferRuleSets bool
	RuleSetLines   map[string][]string
	// PlanDigest and AcceptedDegradations bind a degraded export to the exact
	// preflight plan and warnings the caller acknowledged.
	PlanDigest           string
	AcceptedDegradations []string
	ServiceRegions       map[string]string
	Strict               bool
	plannedRules         []plannedRule
	plannedProviders     []plannedProvider
}

// Generate renders a full configuration for the target client.
func Generate(opts Options) (string, error) {
	if !opts.Target.Supported() {
		return "", fmt.Errorf("unknown client target %q", opts.Target)
	}
	opts.Nodes = FilterNodes(opts.Nodes, opts.Protocols)
	family := opts.Target.Family()
	if family != model.FamilyDAE && opts.Scheme != nil {
		for _, group := range opts.Scheme.Groups {
			if group.Kind == model.KindDAENativeAuto {
				return "", fmt.Errorf("dae 原生自动测速策略组不能用于 %s", opts.Target.Name())
			}
		}
	}
	if family == model.FamilySingBox {
		plan, result := compileSingBox(opts)
		if opts.Strict {
			if err := requireStrictExactPlan(opts, result); err != nil {
				return "", err
			}
			return generateSingBox(plan.opts), nil
		}
		if result.Status == PreflightUnsupported {
			return "", &PreflightError{Result: result}
		}
		if result.Status == PreflightDegraded && !acceptDegradedPlan(opts, &result) {
			return "", &PreflightError{Result: result}
		}
		return generateSingBox(plan.opts), nil
	}
	if family == model.FamilyDAE {
		return GenerateDAE(opts)
	}
	if opts.Strict {
		return "", fmt.Errorf("strict export preflight is not supported for client %s", opts.Target.Name())
	}
	if opts.Scheme != nil {
		var err error
		opts.Scheme, err = prepareScheme(opts.Scheme, uniquedNames(opts.Nodes))
		if err != nil {
			return "", err
		}
		opts.plannedRules, opts.plannedProviders, err = planSchemeRules(opts)
		if err != nil {
			return "", err
		}
	}
	switch family {
	case model.FamilyClash:
		return generateClash(opts), nil
	case model.FamilySingBox:
		return generateSingBox(opts), nil
	case model.FamilySurge:
		return generateSurge(opts, false), nil
	case model.FamilyShadowrocket:
		return generateSurge(opts, true), nil
	default:
		return "", fmt.Errorf("client %s is not implemented yet", opts.Target.Name())
	}
}

// prepareScheme removes optional groups whose node filters match nothing in
// this export, then drops references to those groups. Rules may never silently
// fall back to another policy: a rule targeting an empty group is an error.
func prepareScheme(scheme *model.RuleScheme, nodeNames []string) (*model.RuleScheme, error) {
	available := make(map[string]bool, len(scheme.Groups))
	for _, group := range scheme.Groups {
		for _, member := range group.Members {
			if member.Type == model.MemberNodePattern && len(resolveGroupMembers(model.RuleSchemeGroup{Members: []model.RuleGroupMember{member}}, nodeNames)) > 0 ||
				member.Type == model.MemberReference && builtinPolicy(member.Value) {
				available[group.Name] = true
				break
			}
		}
	}
	for changed := true; changed; {
		changed = false
		for _, group := range scheme.Groups {
			if available[group.Name] {
				continue
			}
			for _, member := range group.Members {
				if member.Type == model.MemberReference && available[member.Value] {
					available[group.Name] = true
					changed = true
					break
				}
			}
		}
	}
	for _, rule := range scheme.Rules {
		if !available[rule.Group] && !builtinPolicy(rule.Group) {
			return nil, fmt.Errorf("策略组 %q 没有匹配到节点或有效引用", rule.Group)
		}
	}
	copyScheme := *scheme
	copyScheme.Groups = make([]model.RuleSchemeGroup, 0, len(scheme.Groups))
	for _, group := range scheme.Groups {
		if !available[group.Name] {
			continue
		}
		copyGroup := group
		copyGroup.Members = make([]model.RuleGroupMember, 0, len(group.Members))
		for _, member := range group.Members {
			if member.Type == model.MemberReference && (available[member.Value] || builtinPolicy(member.Value)) ||
				member.Type == model.MemberNodePattern && len(resolveGroupMembers(model.RuleSchemeGroup{Members: []model.RuleGroupMember{member}}, nodeNames)) > 0 {
				copyGroup.Members = append(copyGroup.Members, member)
			}
		}
		copyScheme.Groups = append(copyScheme.Groups, copyGroup)
	}
	return &copyScheme, nil
}

func builtinPolicy(name string) bool {
	switch strings.ToUpper(name) {
	case "DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE":
		return true
	default:
		return false
	}
}

// FilterNodes drops nodes whose protocol is not in the enabled set. A nil or
// empty set keeps everything.
func FilterNodes(nodes []model.ProxyNode, protocols []model.ProxyKind) []model.ProxyNode {
	if len(protocols) == 0 {
		return nodes
	}
	enabled := make(map[model.ProxyKind]bool, len(protocols))
	for _, p := range protocols {
		enabled[p] = true
	}
	out := make([]model.ProxyNode, 0, len(nodes))
	for _, n := range nodes {
		if enabled[n.Kind] {
			out = append(out, n)
		}
	}
	return out
}

// resolveGroupMembers expands a scheme group's members against the available
// node names: references and builtin policies are kept verbatim, node-name
// patterns are matched against the names.
func resolveGroupMembers(group model.RuleSchemeGroup, nodeNames []string) []string {
	var out []string
	for _, m := range group.Members {
		switch m.Type {
		case model.MemberReference:
			out = append(out, m.Value)
		case model.MemberNodePattern:
			if m.Value == ".*" && m.Exclude == "" {
				out = append(out, nodeNames...)
				continue
			}
			for _, n := range nodeNames {
				if matchNodePattern(m.Value, n) && (m.Exclude == "" || !matchNodePattern(m.Exclude, n)) {
					out = append(out, n)
				}
			}
		}
	}
	return dedupStrings(out)
}

func matchNodePattern(pattern, name string) bool {
	const negativeLookaheadPrefix = "^(?!.*((?i)"
	const negativeLookaheadSuffix = ")).*$"
	if strings.HasPrefix(pattern, negativeLookaheadPrefix) && strings.HasSuffix(pattern, negativeLookaheadSuffix) {
		excluded := strings.TrimSuffix(strings.TrimPrefix(pattern, negativeLookaheadPrefix), negativeLookaheadSuffix)
		re, err := regexp.Compile("(?i)(?:" + excluded + ")")
		return err == nil && !re.MatchString(name)
	}
	re, err := regexp.Compile(pattern)
	return err == nil && re.MatchString(name)
}

// header writes the leading comment block.
func header(target model.ClientTarget) string {
	return fmt.Sprintf("# Generated locally by Tower for %s\n# Subscription credentials never leave this device.\n\n", target.Name())
}

// yaml quotes and escapes a value for a double-quoted YAML scalar.
func yaml(value string) string {
	escaped := collapseLineBreaks(value)
	escaped = strings.ReplaceAll(escaped, "\\", "\\\\")
	escaped = strings.ReplaceAll(escaped, "\"", "\\\"")
	return "\"" + escaped + "\""
}

func collapseLineBreaks(value string) string {
	value = strings.ReplaceAll(value, "\r\n", " ")
	value = strings.ReplaceAll(value, "\r", " ")
	value = strings.ReplaceAll(value, "\n", " ")
	return value
}

// exportableUUID returns the VMess/VLESS id in the form every client accepts.
// Xray allows any id shorter than 32 bytes and derives a v5 UUID from it, but
// Clash refuses anything that is not a UUID, so the same derivation is done
// here.
func exportableUUID(uuid string) string {
	t := strings.TrimSpace(uuid)
	if t == "" {
		return ""
	}
	if isUUID(t) {
		return strings.ToLower(t)
	}
	if utf8.RuneCountInString(t) >= 32 {
		return ""
	}
	return derivedUUID(t)
}

func isUUID(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, r := range s {
		switch i {
		case 8, 13, 18, 23:
			if r != '-' {
				return false
			}
		default:
			if !isHex(r) {
				return false
			}
		}
	}
	return true
}

func isHex(r rune) bool {
	return (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')
}

func derivedUUID(text string) string {
	h := sha1.New()
	h.Write(make([]byte, 16)) // nil UUID namespace
	h.Write([]byte(text))
	b := h.Sum(nil)[:16]
	b[6] = (b[6] & 0x0F) | 0x50 // version 5
	b[8] = (b[8] & 0x3F) | 0x80 // RFC 4122 variant
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// csv splits a comma-separated field into trimmed, non-empty values.
func csv(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		p := strings.TrimSpace(part)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// yamlList renders a string slice as a YAML inline list.
func yamlList(values []string) string {
	parts := make([]string, 0, len(values))
	for _, v := range values {
		parts = append(parts, yaml(v))
	}
	return "[" + strings.Join(parts, ", ") + "]"
}

// displayName returns the node name to use in output, falling back to endpoint.
func displayName(n model.ProxyNode) string {
	name := strings.TrimSpace(n.Name)
	if name == "" {
		return n.Server
	}
	return name
}

// uniquedNames de-duplicates node names, appending a suffix on collisions so
// group membership stays unambiguous.
func uniquedNames(nodes []model.ProxyNode) []string {
	counts := map[string]int{}
	out := make([]string, 0, len(nodes))
	for _, n := range nodes {
		base := displayName(n)
		counts[base]++
		c := counts[base]
		if c == 1 {
			out = append(out, base)
		} else {
			out = append(out, fmt.Sprintf("%s · %d", base, c))
		}
	}
	return out
}
