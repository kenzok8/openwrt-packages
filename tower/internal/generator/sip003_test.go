package generator

import (
	"strings"
	"testing"

	"github.com/kenzok8/tower/internal/model"
)

func TestSIP003Value(t *testing.T) {
	cases := []struct{ in, want string }{
		{"plain", "plain"},
		{"", ""},
		{"/foo;bar", `/foo\;bar`},
		{`a\b`, `a\\b`},
		{`a;b\c;d`, `a\;b\\c\;d`},
		{"a=b", "a=b"},
	}
	for _, tc := range cases {
		if got := sip003Value(tc.in); got != tc.want {
			t.Errorf("sip003Value(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestSingBoxPluginOptsEscapes(t *testing.T) {
	v2ray := model.ProxyNode{
		Kind:       model.KindShadowsocks,
		Name:       "ss",
		Server:     "1.2.3.4",
		Port:       8388,
		Cipher:     "aes-256-gcm",
		Password:   "pw",
		Plugin:     "v2ray-plugin",
		HostHeader: "h;x",
		Path:       "/foo;bar",
	}
	out := singBoxOutbound(v2ray, "ss")
	if got, _ := out["plugin_opts"].(string); got != `mode=websocket;host=h\;x;path=/foo\;bar` {
		t.Errorf("plugin_opts = %q, want %q", got, `mode=websocket;host=h\;x;path=/foo\;bar`)
	}

	obfs := model.ProxyNode{
		Kind:      model.KindShadowsocks,
		Name:      "ss",
		Server:    "1.2.3.4",
		Port:      8388,
		Cipher:    "aes-256-gcm",
		Password:  "pw",
		Obfs:      "http",
		ObfsParam: "o;x",
	}
	out = singBoxOutbound(obfs, "ss")
	if got, _ := out["plugin_opts"].(string); got != `obfs=http;obfs-host=o\;x` {
		t.Errorf("plugin_opts = %q, want %q", got, `obfs=http;obfs-host=o\;x`)
	}
}

func TestShareLinkPluginEscapes(t *testing.T) {
	n := model.ProxyNode{
		Kind:       model.KindShadowsocks,
		Name:       "ss",
		Server:     "1.2.3.4",
		Port:       8388,
		Cipher:     "aes-256-gcm",
		Password:   "pw",
		Plugin:     "v2ray-plugin",
		HostHeader: "h;x",
		Path:       "/foo;bar",
	}
	links := Links([]model.ProxyNode{n})
	if len(links) != 1 {
		t.Fatalf("Links returned %d results, want 1", len(links))
	}
	link := links[0].Link
	// The plugin string is percent-encoded in the link; an escaped `\;`
	// inside a value shows up as %5C%3B, never as a bare %3B separator.
	if !strings.Contains(link, "foo%5C%3Bbar") {
		t.Errorf("link missing escaped semicolon in path:\n%s", link)
	}
	if strings.Contains(link, "foo%3Bbar") {
		t.Errorf("link has an unescaped semicolon in path:\n%s", link)
	}
	if !strings.Contains(link, "h%5C%3Bx") {
		t.Errorf("link missing escaped semicolon in host:\n%s", link)
	}
}
