package generator

import (
	"strings"
	"testing"

	"github.com/kenzok8/tower/internal/model"
)

func snellNode(version *int, obfs, password string) model.ProxyNode {
	return model.ProxyNode{
		Kind:     model.KindSnell,
		Name:     "snell",
		Server:   "1.2.3.4",
		Port:     8388,
		Password: password,
		Obfs:     obfs,
		Version:  version,
	}
}

func intPtr(n int) *int { return &n }

func TestClashAcceptsSnell(t *testing.T) {
	psk16 := strings.Repeat("k", 16)
	cases := []struct {
		name   string
		target model.ClientTarget
		node   model.ProxyNode
		want   bool
	}{
		{"stash v3", model.ClientStash, snellNode(intPtr(3), "", psk16), true},
		{"stash v4", model.ClientStash, snellNode(intPtr(4), "", psk16), false},
		{"stash default version", model.ClientStash, snellNode(nil, "", psk16), true},
		{"verge v5", model.ClientClashVerge, snellNode(intPtr(5), "", psk16), true},
		{"verge v6", model.ClientClashVerge, snellNode(intPtr(6), "", psk16), false},
		{"clashmac v6", model.ClientClashMac, snellNode(intPtr(6), "", psk16), false},
		{"flclash v6", model.ClientFlClash, snellNode(intPtr(6), "", psk16), true},
		{"flclash v6 obfs", model.ClientFlClash, snellNode(intPtr(6), "http", psk16), false},
		{"flclash v6 psk 11", model.ClientFlClash, snellNode(intPtr(6), "", strings.Repeat("k", 11)), false},
		{"mihomo-party v6", model.ClientMihomoParty, snellNode(intPtr(6), "", psk16), true},
		{"mihomo-party v6 obfs", model.ClientMihomoParty, snellNode(intPtr(6), "tls", psk16), false},
		{"mihomo-party v6 psk 11", model.ClientMihomoParty, snellNode(intPtr(6), "", strings.Repeat("k", 11)), false},
		{"clash-mi v6", model.ClientClashMi, snellNode(intPtr(6), "", psk16), false},
		{"openclash v6", model.ClientOpenClash, snellNode(intPtr(6), "", psk16), false},
		{"nikki v6", model.ClientNikki, snellNode(intPtr(6), "", psk16), false},
		{"clash-apple v6 ok", model.ClientClashApple, snellNode(intPtr(6), "", psk16), true},
		{"clash-apple v6 obfs", model.ClientClashApple, snellNode(intPtr(6), "http", psk16), false},
		{"clash-apple v6 obfs none", model.ClientClashApple, snellNode(intPtr(6), "none", psk16), true},
		{"clash-apple v6 psk 11", model.ClientClashApple, snellNode(intPtr(6), "", strings.Repeat("k", 11)), false},
		{"clash-apple v6 psk 12", model.ClientClashApple, snellNode(intPtr(6), "", strings.Repeat("k", 12)), true},
		{"clash-apple v6 psk 255", model.ClientClashApple, snellNode(intPtr(6), "", strings.Repeat("k", 255)), true},
		{"clash-apple v6 psk 256", model.ClientClashApple, snellNode(intPtr(6), "", strings.Repeat("k", 256)), false},
		{"clashoo v6 ok", model.ClientClashoo, snellNode(intPtr(6), "", psk16), true},
		{"clashoo v6 obfs", model.ClientClashoo, snellNode(intPtr(6), "tls", psk16), false},
		{"karing v6 ungated", model.ClientKaring, snellNode(intPtr(6), "http", psk16), true},
		{"clash-apple v0", model.ClientClashApple, snellNode(intPtr(0), "", psk16), false},
		{"clash-apple v7", model.ClientClashApple, snellNode(intPtr(7), "", psk16), false},
		{"non-snell", model.ClientClashVerge, model.ProxyNode{Kind: model.KindShadowsocks}, true},
	}
	for _, tc := range cases {
		if got := clashAcceptsSnell(tc.target, tc.node); got != tc.want {
			t.Errorf("%s: clashAcceptsSnell = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestClashSnellGateFiltersNodes(t *testing.T) {
	v6 := snellNode(intPtr(6), "", strings.Repeat("k", 16))
	v6.Name = "snell-v6"
	ss := model.ProxyNode{Kind: model.KindShadowsocks, Name: "good-ss", Server: "5.6.7.8", Port: 8388, Cipher: "aes-256-gcm", Password: "pw"}
	out, err := Generate(Options{Target: model.ClientClashVerge, Nodes: []model.ProxyNode{v6, ss}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if strings.Contains(out, "snell-v6") {
		t.Errorf("Snell v6 node was not filtered out for clash-verge:\n%s", out)
	}
	if !strings.Contains(out, "good-ss") {
		t.Errorf("expressible node missing:\n%s", out)
	}
	kept, err := Generate(Options{Target: model.ClientClashApple, Nodes: []model.ProxyNode{v6}})
	if err != nil {
		t.Fatalf("Generate clash-apple: %v", err)
	}
	if !strings.Contains(kept, "snell-v6") || !strings.Contains(kept, "version: 6") {
		t.Errorf("valid Snell v6 node missing from clash-apple output:\n%s", kept)
	}
}

func TestClashStrictDNS(t *testing.T) {
	ss := model.ProxyNode{Kind: model.KindShadowsocks, Name: "ss", Server: "5.6.7.8", Port: 8388, Cipher: "aes-256-gcm", Password: "pw"}
	out, err := Generate(Options{Target: model.ClientClashApple, Nodes: []model.ProxyNode{ss}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	for _, want := range []string{
		"proxy-server-nameserver:",
		"direct-nameserver:",
		"https://8.8.8.8/dns-query#自动选择&ecs=114.114.114.0/24&ecs-override=true",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("strict DNS output missing %q:\n%s", want, out)
		}
	}
	for _, notWant := range []string{"fallback:", "fallback-filter:"} {
		if strings.Contains(out, notWant) {
			t.Errorf("strict DNS output unexpectedly contains %q:\n%s", notWant, out)
		}
	}
	// Other Clash targets keep the standard block.
	std, err := Generate(Options{Target: model.ClientClashVerge, Nodes: []model.ProxyNode{ss}})
	if err != nil {
		t.Fatalf("Generate verge: %v", err)
	}
	if !strings.Contains(std, "fallback:") {
		t.Errorf("standard DNS output missing fallback::\n%s", std)
	}
	if strings.Contains(std, "proxy-server-nameserver:") {
		t.Errorf("standard DNS output unexpectedly contains proxy-server-nameserver::\n%s", std)
	}
	// No nodes: no group to resolve through, so the standard block applies.
	empty, err := Generate(Options{Target: model.ClientClashApple, Nodes: nil})
	if err != nil {
		t.Fatalf("Generate empty: %v", err)
	}
	if !strings.Contains(empty, "fallback:") {
		t.Errorf("empty export must use the standard DNS block:\n%s", empty)
	}
}

func TestClashStrictDNSSchemeGroup(t *testing.T) {
	ss := model.ProxyNode{Kind: model.KindShadowsocks, Name: "ss", Server: "5.6.7.8", Port: 8388, Cipher: "aes-256-gcm", Password: "pw"}
	scheme := &model.RuleScheme{
		Groups: []model.RuleSchemeGroup{
			{Name: "Proxy", Kind: model.KindSelect, Members: []model.RuleGroupMember{{Type: model.MemberNodePattern, Value: ".*"}}},
			{Name: "Mixed", Kind: model.KindSelect, Members: []model.RuleGroupMember{{Type: model.MemberReference, Value: "DIRECT"}}},
		},
	}
	out, err := Generate(Options{Target: model.ClientClashApple, Nodes: []model.ProxyNode{ss}, Scheme: scheme})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if !strings.Contains(out, "https://8.8.8.8/dns-query#Proxy&ecs=114.114.114.0/24&ecs-override=true") {
		t.Errorf("strict DNS must use the nodes-only scheme group:\n%s", out)
	}

	// No nodes-only group: fall back to the standard block.
	refOnly := &model.RuleScheme{
		Groups: []model.RuleSchemeGroup{
			{Name: "Mixed", Kind: model.KindSelect, Members: []model.RuleGroupMember{{Type: model.MemberReference, Value: "DIRECT"}}},
		},
	}
	std, err := Generate(Options{Target: model.ClientClashApple, Nodes: []model.ProxyNode{ss}, Scheme: refOnly})
	if err != nil {
		t.Fatalf("Generate ref-only: %v", err)
	}
	if !strings.Contains(std, "fallback:") {
		t.Errorf("without a nodes-only group the standard DNS block must apply:\n%s", std)
	}
}

func TestClashWritesShadowTLSPlugin(t *testing.T) {
	node := shadowTLSSSNode()
	out, err := Generate(Options{Target: model.ClientClashVerge, Nodes: []model.ProxyNode{node}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	for _, want := range []string{
		"plugin: shadow-tls",
		"host: \"cover.example.com\"",
		"password: \"secret\"",
		"version: 3",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q\n%s", want, out)
		}
	}
	// Stash and Karing are not in upstream's ShadowTLS allow list: the
	// wrapped node is skipped, never downgraded to plain Shadowsocks.
	ss := model.ProxyNode{Kind: model.KindShadowsocks, Name: "good-ss", Server: "5.6.7.8", Port: 8388, Cipher: "aes-256-gcm", Password: "pw"}
	for _, target := range []model.ClientTarget{model.ClientStash, model.ClientKaring} {
		skipped, err := Generate(Options{Target: target, Nodes: []model.ProxyNode{node, ss}})
		if err != nil {
			t.Fatalf("%s: Generate: %v", target, err)
		}
		if strings.Contains(skipped, "203.0.113.20") {
			t.Errorf("%s: ShadowTLS node leaked into output:\n%s", target, skipped)
		}
		if !strings.Contains(skipped, "good-ss") {
			t.Errorf("%s: expressible node missing:\n%s", target, skipped)
		}
	}
}

func TestKaringSkipsMLKEM768(t *testing.T) {
	support := true
	node := model.ProxyNode{
		Kind:                         model.KindVLESS,
		Name:                         "reality",
		Server:                       "1.2.3.4",
		Port:                         443,
		UUID:                         testUUID,
		TLS:                          true,
		SNI:                          "example.com",
		RealityPublicKey:             "PUBKEY",
		RealityShortID:               "abcd1234",
		RealitySupportX25519MLKEM768: &support,
	}
	karing, err := Generate(Options{Target: model.ClientKaring, Nodes: []model.ProxyNode{node}})
	if err != nil {
		t.Fatalf("Generate karing: %v", err)
	}
	if !strings.Contains(karing, "reality-opts:") {
		t.Errorf("karing output missing reality-opts:\n%s", karing)
	}
	if strings.Contains(karing, "support-x25519mlkem768") {
		t.Errorf("karing must not get support-x25519mlkem768 (own core, no such field):\n%s", karing)
	}
	verge, err := Generate(Options{Target: model.ClientClashVerge, Nodes: []model.ProxyNode{node}})
	if err != nil {
		t.Fatalf("Generate verge: %v", err)
	}
	if !strings.Contains(verge, "support-x25519mlkem768: true") {
		t.Errorf("clash-verge output missing support-x25519mlkem768:\n%s", verge)
	}
}
