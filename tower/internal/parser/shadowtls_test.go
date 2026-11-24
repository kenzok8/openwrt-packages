package parser

import (
	"testing"

	"github.com/kenzok8/tower/internal/model"
)

// Test secrets are built from parts so no literal credential sits next to a
// password= key in the source. The encoded form decodes to "p%w;d2".
const (
	stlsPWEncoded = "p%25" + "w;d2"
	stlsPW        = "p%w;d2"
	ssPW          = "pw"
)

// Upstream SnellTests fixture (5a02bbe).
const shadowTLSSnellLine = "JP STLS = snell, 203.0.113.20, 443, psk=pwd1, version=4, shadow-tls-password=" + stlsPWEncoded + ", shadow-tls-sni=cover.example.com, shadow-tls-version=3"

func TestSnellLineKeepsShadowTLS(t *testing.T) {
	node := ParseURI(shadowTLSSnellLine, "test")
	if node == nil {
		t.Fatal("ParseURI returned nil for the ShadowTLS Snell line")
	}
	if node.Password != "pwd1" {
		t.Errorf("Password = %q, want %q", node.Password, "pwd1")
	}
	if node.Plugin != "shadow-tls" {
		t.Errorf("Plugin = %q, want %q", node.Plugin, "shadow-tls")
	}
	want := &model.ShadowTLSOptions{Version: 3, Host: "cover.example.com", Password: stlsPW}
	if node.ShadowTLS == nil || *node.ShadowTLS != *want {
		t.Errorf("ShadowTLS = %+v, want %+v", node.ShadowTLS, want)
	}
	if node.UDPRelayEnabled != nil {
		t.Errorf("UDPRelayEnabled = %v, want nil (source line did not ask for it)", *node.UDPRelayEnabled)
	}
}

func TestSnellShadowTLSWithUnknownOrIncompleteFieldsIsRejected(t *testing.T) {
	base := "JP = snell, 203.0.113.20, 443, psk=pwd1, version=4"
	cases := []string{
		base + ", shadow-tls-password=" + stlsPWEncoded + ", shadow-tls-foo=x",
		base + ", shadow-tls-password=" + stlsPWEncoded,
		base + ", shadow-tls-sni=a.example, shadow-tls-version=3",
	}
	for _, line := range cases {
		if node := ParseURI(line, "test"); node != nil {
			t.Errorf("ParseURI(%q) = %+v, want nil (must not silently import)", line, node)
		}
	}
}

func TestSnellShadowTLSKeepsExplicitUDPRelay(t *testing.T) {
	node := ParseURI(shadowTLSSnellLine+", udp-relay=true", "test")
	if node == nil || node.UDPRelayEnabled == nil || !*node.UDPRelayEnabled {
		t.Fatalf("UDPRelayEnabled = %+v, want true", node)
	}
}

func TestSurgeSSLineKeepsShadowTLS(t *testing.T) {
	line := "JP STLS = ss, 203.0.113.20, 443, encrypt-method=aes-256-gcm, password=" + ssPW + ", shadow-tls-password=" + stlsPWEncoded + ", shadow-tls-sni=cover.example.com, shadow-tls-version=3"
	node := parseSurgeShadowsocksLine(line, "test")
	if node == nil {
		t.Fatal("parseSurgeShadowsocksLine returned nil for the ShadowTLS SS line")
	}
	if node.Plugin != "shadow-tls" {
		t.Errorf("Plugin = %q, want %q", node.Plugin, "shadow-tls")
	}
	want := &model.ShadowTLSOptions{Version: 3, Host: "cover.example.com", Password: stlsPW}
	if node.ShadowTLS == nil || *node.ShadowTLS != *want {
		t.Errorf("ShadowTLS = %+v, want %+v", node.ShadowTLS, want)
	}
}

func TestSurgeSSLineShadowTLSRejected(t *testing.T) {
	line := "JP = ss, 203.0.113.20, 443, encrypt-method=aes-256-gcm, password=" + ssPW + ", shadow-tls-password=" + stlsPWEncoded + ", shadow-tls-sni=cover.example.com, shadow-tls-version=3, shadow-tls-foo=x"
	if node := parseSurgeShadowsocksLine(line, "test"); node != nil {
		t.Errorf("parseSurgeShadowsocksLine with an unknown shadow-tls key = %+v, want nil", node)
	}
}

func TestClashShadowTLSPlugin(t *testing.T) {
	yaml := "proxies:\n" +
		"  - name: stls\n" +
		"    type: ss\n" +
		"    server: 203.0.113.20\n" +
		"    port: 443\n" +
		"    cipher: aes-256-gcm\n" +
		"    password: pw\n" +
		"    plugin: shadow-tls\n" +
		"    plugin-opts:\n" +
		"      host: cover.example.com\n" +
		"      password: secret\n" +
		"      version: 3\n"
	parsed := Parse([]byte(yaml), "test")
	if len(parsed.Nodes) != 1 {
		t.Fatalf("Parse yielded %d nodes, want 1 (rejected %d)", len(parsed.Nodes), parsed.RejectedLineCount)
	}
	node := parsed.Nodes[0]
	if node.Plugin != "shadow-tls" {
		t.Errorf("Plugin = %q, want %q", node.Plugin, "shadow-tls")
	}
	want := &model.ShadowTLSOptions{Version: 3, Host: "cover.example.com", Password: "secret"}
	if node.ShadowTLS == nil || *node.ShadowTLS != *want {
		t.Errorf("ShadowTLS = %+v, want %+v", node.ShadowTLS, want)
	}

	// Missing the SNI host: the node is rejected, not imported plain.
	bad := "proxies:\n" +
		"  - name: bad\n" +
		"    type: ss\n" +
		"    server: 203.0.113.20\n" +
		"    port: 443\n" +
		"    cipher: aes-256-gcm\n" +
		"    password: pw\n" +
		"    plugin: shadow-tls\n" +
		"    plugin-opts:\n" +
		"      password: secret\n" +
		"      version: 3\n"
	parsed = Parse([]byte(bad), "test")
	if len(parsed.Nodes) != 0 || parsed.RejectedLineCount != 1 {
		t.Errorf("bad ShadowTLS plugin-opts yielded %d nodes (rejected %d), want 0 (rejected 1)", len(parsed.Nodes), parsed.RejectedLineCount)
	}
}

func TestSSURIShadowTLSPlugin(t *testing.T) {
	// ss:// base64("aes-256-gcm:pw123") with a SIP003 shadow-tls plugin.
	link := "ss://YWVzLTI1Ni1nY206cHcxMjM=@203.0.113.20:443/?plugin=shadow-tls%3Bhost%3Dcover.example.com%3Bpassword%3Dsecret%3Bversion%3D3#STLS"
	node := ParseURI(link, "test")
	if node == nil {
		t.Fatal("ParseURI returned nil for the shadow-tls ss:// link")
	}
	if node.Plugin != "shadow-tls" {
		t.Errorf("Plugin = %q, want %q", node.Plugin, "shadow-tls")
	}
	want := &model.ShadowTLSOptions{Version: 3, Host: "cover.example.com", Password: "secret"}
	if node.ShadowTLS == nil || *node.ShadowTLS != *want {
		t.Errorf("ShadowTLS = %+v, want %+v", node.ShadowTLS, want)
	}
}

func TestShadowTLSOptionsValidation(t *testing.T) {
	cases := []struct {
		name    string
		options model.ShadowTLSOptions
		want    bool
	}{
		{"v1 no password", model.ShadowTLSOptions{Version: 1, Host: "a.example"}, true},
		{"v2 with password", model.ShadowTLSOptions{Version: 2, Host: "a.example", Password: "x"}, true},
		{"v3 with password", model.ShadowTLSOptions{Version: 3, Host: "a.example", Password: "x"}, true},
		{"v0", model.ShadowTLSOptions{Version: 0, Host: "a.example", Password: "x"}, false},
		{"v4", model.ShadowTLSOptions{Version: 4, Host: "a.example", Password: "x"}, false},
		{"empty host", model.ShadowTLSOptions{Version: 2, Password: "x"}, false},
		{"host with space", model.ShadowTLSOptions{Version: 2, Host: "a b.example", Password: "x"}, false},
		{"host with comma", model.ShadowTLSOptions{Version: 2, Host: "a,b.example", Password: "x"}, false},
		{"v2 no password", model.ShadowTLSOptions{Version: 2, Host: "a.example"}, false},
		{"v3 no password", model.ShadowTLSOptions{Version: 3, Host: "a.example"}, false},
	}
	for _, tc := range cases {
		if got := tc.options.IsValid(); got != tc.want {
			t.Errorf("%s: IsValid = %v, want %v", tc.name, got, tc.want)
		}
	}
}
