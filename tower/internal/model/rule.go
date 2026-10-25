package model

// RuleGroupKind identifies the strategy a rule group applies to its members.
type RuleGroupKind string

const (
	KindSelect        RuleGroupKind = "select"
	KindURLTest       RuleGroupKind = "url-test"
	KindFallback      RuleGroupKind = "fallback"
	KindLoadBalance   RuleGroupKind = "load-balance"
	KindDAENativeAuto RuleGroupKind = "dae-native-auto"
)

// RuleMemberType distinguishes a group reference from a node-name pattern.
type RuleMemberType string

const (
	// MemberReference points at another group or a builtin policy (DIRECT /
	// REJECT), which is emitted verbatim.
	MemberReference RuleMemberType = "reference"
	// MemberNodePattern is a regular expression matched against node names.
	// ".*" means every node.
	MemberNodePattern RuleMemberType = "node-pattern"
)

// RuleGroupMember is one member of a rule scheme group.
type RuleGroupMember struct {
	Type    RuleMemberType `json:"type"`
	Value   string         `json:"value"`
	Exclude string         `json:"exclude,omitempty"`
}

// RuleSchemeGroup describes a strategy group: which nodes it contains (by name
// pattern or reference), its type, and its url-test tuning.
type RuleSchemeGroup struct {
	Name      string            `json:"name"`
	IconURL   string            `json:"icon_url,omitempty"`
	Kind      RuleGroupKind     `json:"kind"`
	Members   []RuleGroupMember `json:"members"`
	URL       string            `json:"url,omitempty"`
	Interval  int               `json:"interval,omitempty"`
	Tolerance int               `json:"tolerance,omitempty"`
}

// RuleSchemeRule is one routing rule. Body carries the inline condition (e.g.
// "DOMAIN-SUFFIX,google.com" or "GEOIP,CN"); Final marks the MATCH/FINAL
// fallback, which has no body.
type RuleSchemeRule struct {
	Group string `json:"group"`
	Body  string `json:"body,omitempty"`
	Final bool   `json:"final,omitempty"`
	// Options are rule-line modifiers such as no-resolve. Keep them separate
	// from the condition so generators can put the policy in the right slot.
	Options []string `json:"options,omitempty"`
	// Resource preserves a remote rule-set reference in its original position.
	Resource *RuleSchemeRuleSet `json:"resource,omitempty"`
}

// RuleSchemeRuleSet is a resource-backed set of conditions bound to a policy
// group. Rules are cached separately from the scheme so imported schemes stay
// small and refreshable.
type RuleSchemeRuleSet struct {
	Tag        string   `json:"tag,omitempty"`
	URL        string   `json:"url"`
	Behavior   string   `json:"behavior,omitempty"`
	Format     string   `json:"format,omitempty"`
	Interval   int      `json:"interval,omitempty"`
	Author     string   `json:"author,omitempty"`
	License    string   `json:"license,omitempty"`
	ProjectURL string   `json:"project_url,omitempty"`
	LicenseURL string   `json:"license_url,omitempty"`
	Options    []string `json:"options,omitempty"`
}

// RuleSchemeNetworkSettings keeps the target-neutral subset recognized from
// imported configurations. Empty fields leave exporter defaults unchanged.
type RuleSchemeNetworkSettings struct {
	IPv6Enabled         *bool    `json:"ipv6_enabled,omitempty"`
	DNSServers          []string `json:"dns_servers,omitempty"`
	FallbackDNSServers  []string `json:"fallback_dns_servers,omitempty"`
	EncryptedDNSServers []string `json:"encrypted_dns_servers,omitempty"`
}

// RuleScheme is a named set of strategy groups and routing rules, either
// bundled with the plugin (offline, immutable) or imported by the user.
type RuleScheme struct {
	ID              string                     `json:"id"`
	Name            string                     `json:"name"`
	TargetOnly      ClientTarget               `json:"target_only,omitempty"`
	Summary         string                     `json:"summary,omitempty"`
	SourceURL       string                     `json:"source_url,omitempty"`
	IsBundled       bool                       `json:"is_bundled,omitempty"`
	Groups          []RuleSchemeGroup          `json:"groups"`
	Rules           []RuleSchemeRule           `json:"rules"`
	NetworkSettings *RuleSchemeNetworkSettings `json:"network_settings,omitempty"`
	RawConfig       string                     `json:"raw_config,omitempty"`
}

// SelectGroups returns the subset of groups the user can switch between
// (select, fallback, load-balance). url-test groups are resolved automatically.
func (s *RuleScheme) SelectGroups() []RuleSchemeGroup {
	var out []RuleSchemeGroup
	for _, g := range s.Groups {
		if g.Kind != KindURLTest {
			out = append(out, g)
		}
	}
	return out
}
