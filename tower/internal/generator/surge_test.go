package generator

import (
	"strings"
	"testing"

	"github.com/kenzok8/tower/internal/model"
)

const testUUID = "11111111-2222-3333-4444-555555555555"
const testEncryption = "mlkem768x25519plus.native.1rtt.QUJDREVGR0g"

func vlessNode(name string) model.ProxyNode {
	return model.ProxyNode{
		Kind:   model.KindVLESS,
		Name:   name,
		Server: "1.2.3.4",
		Port:   443,
		UUID:   testUUID,
	}
}

func TestSurgeVLESSLine(t *testing.T) {
	raw := vlessNode("raw-tls")
	raw.TLS = true
	raw.SNI = "example.com"

	ws := vlessNode("ws")
	ws.TLS = true
	ws.SNI = "example.com"
	ws.Transport = "ws"
	ws.Path = "/ws"
	ws.HostHeader = "example.com"

	upgrade := vlessNode("upgrade")
	upgrade.TLS = true
	upgrade.Transport = "httpupgrade"
	upgrade.Path = "/up"

	grpc := vlessNode("grpc")
	grpc.TLS = true
	grpc.Transport = "grpc"
	grpc.Path = "svc"
	grpc.HostHeader = "grpc.example.com"

	grpcSlash := vlessNode("grpc-slash")
	grpcSlash.TLS = true
	grpcSlash.Transport = "grpc"
	grpcSlash.Path = "/svc"

	xhttp := vlessNode("xhttp")
	xhttp.Transport = "xhttp"
	xhttp.Path = "/x"
	xhttp.HostHeader = "x.example.com"
	xhttp.TransportMode = "stream-up"

	xhttpAuto := vlessNode("xhttp-auto")
	xhttpAuto.Transport = "xhttp"
	xhttpAuto.Path = "/x"
	xhttpAuto.TransportMode = "auto"

	reality := vlessNode("reality")
	reality.Transport = "tcp"
	reality.SNI = "example.com"
	reality.RealityPublicKey = "PUBKEY"
	reality.RealityShortID = "abcd1234"
	reality.ALPN = "h2"

	encrypted := vlessNode("encrypted")
	encrypted.TLS = true
	encrypted.VLESSEncryption = testEncryption

	vision := vlessNode("vision")
	vision.TLS = true
	vision.Flow = "xtls-rprx-vision"

	cases := []struct {
		node    model.ProxyNode
		want    []string
		notWant []string
	}{
		{raw, []string{"raw-tls = vless, 1.2.3.4, 443, username=" + testUUID, "tls=true", "sni=example.com"}, nil},
		{ws, []string{"ws=true", "ws-path=/ws", "ws-headers=Host:example.com"}, []string{"ws-http-upgrade=true"}},
		{upgrade, []string{"ws=true", "ws-http-upgrade=true", "ws-path=/up"}, nil},
		{grpc, []string{"grpc=true", "grpc-service-name=svc", "grpc-authority=grpc.example.com"}, nil},
		{grpcSlash, []string{"grpc-service-name=/svc"}, nil},
		{xhttp, []string{"xhttp=true", "xhttp-path=/x", "xhttp-host=x.example.com", "xhttp-mode=stream-up"}, nil},
		{xhttpAuto, []string{"xhttp=true"}, []string{"xhttp-mode="}},
		{reality, []string{"reality-public-key=PUBKEY", "reality-short-id=abcd1234", "sni=example.com", "alpn=h2"}, []string{"tls=true", "skip-cert-verify", "pbk=", "fingerprint="}},
		{encrypted, []string{"encryption=" + testEncryption}, nil},
		{vision, []string{"flow=xtls-rprx-vision"}, nil},
	}
	for _, tc := range cases {
		out, err := Generate(Options{Target: model.ClientSurge, Nodes: []model.ProxyNode{tc.node}})
		if err != nil {
			t.Fatalf("%s: Generate: %v", tc.node.Name, err)
		}
		for _, want := range tc.want {
			if !strings.Contains(out, want) {
				t.Errorf("%s: output missing %q\n%s", tc.node.Name, want, out)
			}
		}
		for _, notWant := range tc.notWant {
			if strings.Contains(out, notWant) {
				t.Errorf("%s: output unexpectedly contains %q\n%s", tc.node.Name, notWant, out)
			}
		}
	}
}

func TestSurgeAcceptsVLESS(t *testing.T) {
	enc := func(n model.ProxyNode) model.ProxyNode { n.VLESSEncryption = testEncryption; return n }
	tls := func(n model.ProxyNode) model.ProxyNode { n.TLS = true; return n }
	reality := func(n model.ProxyNode) model.ProxyNode {
		n.RealityPublicKey = "PUBKEY"
		n.RealityShortID = "abcd1234"
		return n
	}
	vision := func(n model.ProxyNode) model.ProxyNode { n.Flow = "xtls-rprx-vision"; return n }
	transport := func(tr string) func(model.ProxyNode) model.ProxyNode {
		return func(n model.ProxyNode) model.ProxyNode { n.Transport = tr; return n }
	}
	build := func(mods ...func(model.ProxyNode) model.ProxyNode) model.ProxyNode {
		n := vlessNode("t")
		for _, m := range mods {
			n = m(n)
		}
		return n
	}
	cases := []struct {
		name string
		node model.ProxyNode
		want bool
	}{
		{"raw plain", build(), true},
		{"raw tls vision", build(tls, vision), true},
		{"raw tls vision-udp443", build(tls, func(n model.ProxyNode) model.ProxyNode { n.Flow = "xtls-rprx-vision-udp443"; return n }), true},
		{"ws tls vision without encryption", build(tls, transport("ws"), vision), false},
		{"ws tls vision with encryption", build(tls, transport("ws"), vision, enc), true},
		{"ws tls", build(tls, transport("ws")), true},
		{"ws reality", build(transport("ws"), reality), false},
		{"grpc tls", build(tls, transport("grpc")), true},
		{"grpc plain", build(transport("grpc")), false},
		{"grpc reality", build(transport("grpc"), reality), true},
		{"grpc vision", build(tls, transport("grpc"), vision), false},
		{"xhttp stream-up", build(transport("xhttp"), func(n model.ProxyNode) model.ProxyNode { n.TransportMode = "stream-up"; return n }), true},
		{"xhttp bad mode", build(transport("xhttp"), func(n model.ProxyNode) model.ProxyNode { n.TransportMode = "bogus"; return n }), false},
		{"xhttp reality", build(transport("xhttp"), reality), true},
		{"httpupgrade tls", build(tls, transport("httpupgrade")), true},
		{"kcp", build(transport("kcp")), false},
		{"mkcp", build(transport("mkcp")), false},
		{"bad encryption", build(func(n model.ProxyNode) model.ProxyNode { n.VLESSEncryption = "foo"; return n }), false},
		{"bad encryption method", build(func(n model.ProxyNode) model.ProxyNode {
			n.VLESSEncryption = "mlkem768x25519plus.quantum.1rtt.KEY"
			return n
		}), false},
		{"bad encryption rtt", build(func(n model.ProxyNode) model.ProxyNode {
			n.VLESSEncryption = "mlkem768x25519plus.native.2rtt.KEY"
			return n
		}), false},
		{"encryption with comma", build(func(n model.ProxyNode) model.ProxyNode {
			n.VLESSEncryption = "mlkem768x25519plus.native.1rtt.A,B"
			return n
		}), false},
		{"encryption with padding segment", build(func(n model.ProxyNode) model.ProxyNode {
			n.VLESSEncryption = "mlkem768x25519plus.native.1rtt.PAD.KEY"
			return n
		}), true},
		{"reality short id too long", build(reality, func(n model.ProxyNode) model.ProxyNode { n.RealityShortID = "0123456789abcdef0"; return n }), false},
		{"reality short id non-hex", build(reality, func(n model.ProxyNode) model.ProxyNode { n.RealityShortID = "zzzz"; return n }), false},
		{"reality empty short id", build(reality, func(n model.ProxyNode) model.ProxyNode { n.RealityShortID = ""; return n }), true},
		{"non-vision flow", build(tls, func(n model.ProxyNode) model.ProxyNode { n.Flow = "xtls-rprx-direct"; return n }), false},
		{"non-vless kind", model.ProxyNode{Kind: model.KindTrojan}, false},
	}
	for _, tc := range cases {
		if got := surgeAcceptsVLESS(tc.node); got != tc.want {
			t.Errorf("%s: surgeAcceptsVLESS = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestSurgeVLESSGateFiltersNodes(t *testing.T) {
	bad := vlessNode("bad-mkcp")
	bad.Transport = "kcp"
	good := model.ProxyNode{Kind: model.KindShadowsocks, Name: "good-ss", Server: "5.6.7.8", Port: 8388, Cipher: "aes-256-gcm", Password: "pw"}
	out, err := Generate(Options{Target: model.ClientSurge, Nodes: []model.ProxyNode{bad, good}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if strings.Contains(out, "bad-mkcp") {
		t.Errorf("unexpressible VLESS node was not filtered out:\n%s", out)
	}
	if !strings.Contains(out, "good-ss") {
		t.Errorf("expressible node missing:\n%s", out)
	}
}

func TestShadowrocketVLESSUnchanged(t *testing.T) {
	// Shadowrocket keeps its own vocabulary and is not gated: REALITY over
	// WebSocket, which Surge rejects, still exports.
	n := vlessNode("sr")
	n.Transport = "ws"
	n.Path = "/ws"
	n.RealityPublicKey = "PUBKEY"
	n.RealityShortID = "abcd1234"
	n.Fingerprint = "chrome"
	n.Flow = "xtls-rprx-vision"
	out, err := Generate(Options{Target: model.ClientShadowrocket, Nodes: []model.ProxyNode{n}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	for _, want := range []string{"pbk=PUBKEY", "sid=abcd1234", "fingerprint=chrome", "xtls=2", "udp-relay=true"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q:\n%s", want, out)
		}
	}
	if strings.Contains(out, "reality-public-key=") {
		t.Errorf("Shadowrocket output must not use Surge REALITY vocabulary:\n%s", out)
	}
}

func TestSurgeHTTPUpgradeVMessTrojan(t *testing.T) {
	vmess := model.ProxyNode{Kind: model.KindVMess, Name: "vm", Server: "1.2.3.4", Port: 443, UUID: testUUID, TLS: true, Transport: "httpupgrade", Path: "/up"}
	trojan := model.ProxyNode{Kind: model.KindTrojan, Name: "tj", Server: "1.2.3.4", Port: 443, Password: "pw", TLS: true, Transport: "httpupgrade", Path: "/up"}
	out, err := Generate(Options{Target: model.ClientSurge, Nodes: []model.ProxyNode{vmess, trojan}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if strings.Count(out, "ws-http-upgrade=true") != 2 {
		t.Errorf("expected 2 ws-http-upgrade lines:\n%s", out)
	}
	sr, err := Generate(Options{Target: model.ClientShadowrocket, Nodes: []model.ProxyNode{vmess}})
	if err != nil {
		t.Fatalf("Generate shadowrocket: %v", err)
	}
	if strings.Contains(sr, "ws-http-upgrade=true") {
		t.Errorf("Shadowrocket must keep obfs=httpupgrade, not ws-http-upgrade:\n%s", sr)
	}
	if !strings.Contains(sr, "obfs=httpupgrade") {
		t.Errorf("Shadowrocket output missing obfs=httpupgrade:\n%s", sr)
	}
}

func TestConfNameDoubleSlash(t *testing.T) {
	if got := confName("HK // Backup"); got != "HK ／／ Backup" {
		t.Errorf("confName = %q, want %q", got, "HK ／／ Backup")
	}
	if got := confName("plain"); got != "plain" {
		t.Errorf("confName = %q, want %q", got, "plain")
	}
}

func shadowTLSSnellNode() model.ProxyNode {
	v := 4
	return model.ProxyNode{
		Kind:      model.KindSnell,
		Name:      "JP STLS",
		Server:    "203.0.113.20",
		Port:      443,
		Password:  "pwd1",
		Version:   &v,
		Plugin:    "shadow-tls",
		ShadowTLS: &model.ShadowTLSOptions{Version: 3, Host: "cover.example.com", Password: "p%w;d2"},
	}
}

func shadowTLSSSNode() model.ProxyNode {
	return model.ProxyNode{
		Kind:      model.KindShadowsocks,
		Name:      "JP STLS",
		Server:    "203.0.113.20",
		Port:      443,
		Cipher:    "aes-256-gcm",
		Password:  "pw",
		Plugin:    "shadow-tls",
		ShadowTLS: &model.ShadowTLSOptions{Version: 3, Host: "cover.example.com", Password: "secret"},
	}
}

func TestSurgeWritesSnellShadowTLS(t *testing.T) {
	for _, target := range []model.ClientTarget{model.ClientSurge, model.ClientSurgeMac} {
		out, err := Generate(Options{Target: target, Nodes: []model.ProxyNode{shadowTLSSnellNode()}})
		if err != nil {
			t.Fatalf("%s: Generate: %v", target, err)
		}
		for _, want := range []string{
			"snell, 203.0.113.20, 443", "psk=pwd1", "version=4",
			"shadow-tls-password=" + "p%w;d2",
			"shadow-tls-sni=cover.example.com",
			"shadow-tls-version=3",
		} {
			if !strings.Contains(out, want) {
				t.Errorf("%s: output missing %q\n%s", target, want, out)
			}
		}
		// ShadowTLS only wraps TCP: the wrapped node must not gain
		// udp-relay unless the source line asked for it.
		if strings.Contains(out, "udp-relay=true") {
			t.Errorf("%s: wrapped Snell must not gain udp-relay:\n%s", target, out)
		}
	}
}

func TestSurgeSnellShadowTLSKeepsExplicitUDPRelay(t *testing.T) {
	node := shadowTLSSnellNode()
	yes := true
	node.UDPRelayEnabled = &yes
	out, err := Generate(Options{Target: model.ClientSurge, Nodes: []model.ProxyNode{node}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if !strings.Contains(out, "udp-relay=true") {
		t.Errorf("explicit udp-relay lost:\n%s", out)
	}
}

func TestSurgeWritesSSShadowTLS(t *testing.T) {
	out, err := Generate(Options{Target: model.ClientSurge, Nodes: []model.ProxyNode{shadowTLSSSNode()}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	for _, want := range []string{
		"ss, 203.0.113.20, 443",
		"shadow-tls-password=" + "secret",
		"shadow-tls-sni=cover.example.com",
		"shadow-tls-version=3",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q\n%s", want, out)
		}
	}
}

func TestOtherClientsSkipSnellShadowTLS(t *testing.T) {
	node := shadowTLSSnellNode()
	for _, target := range model.AllClients {
		if target == model.ClientSurge || target == model.ClientSurgeMac {
			continue
		}
		if got := filterExpressibleNodes(target, []model.ProxyNode{node}); len(got) != 0 {
			t.Errorf("%s: Snell + ShadowTLS must be skipped, kept %d nodes", target, len(got))
		}
	}
	ss := model.ProxyNode{Kind: model.KindShadowsocks, Name: "good-ss", Server: "5.6.7.8", Port: 8388, Cipher: "aes-256-gcm", Password: "pw"}
	out, err := Generate(Options{Target: model.ClientClashVerge, Nodes: []model.ProxyNode{node, ss}})
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	if strings.Contains(out, "203.0.113.20") {
		t.Errorf("Snell + ShadowTLS node leaked into clash-verge output:\n%s", out)
	}
	if !strings.Contains(out, "good-ss") {
		t.Errorf("expressible node missing:\n%s", out)
	}
}
