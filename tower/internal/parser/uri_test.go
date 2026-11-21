package parser

import (
	"reflect"
	"testing"
)

func TestSIP003Fields(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"a;b", []string{"a", "b"}},
		{`a\;b`, []string{`a;b`}},
		{`a\\b`, []string{`a\b`}},
		{`a\;b\\c;d`, []string{`a;b\c`, "d"}},
		{"", []string{""}},
		{`a\`, nil},
	}
	for _, tc := range cases {
		got := sip003Fields(tc.in)
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("sip003Fields(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestV2RayPluginOptionsEscaped(t *testing.T) {
	opts := v2rayPluginOptions(`v2ray-plugin;mode=websocket;path=/foo\;bar;host=h\;x`)
	if opts == nil {
		t.Fatal("v2rayPluginOptions returned nil")
	}
	if opts.path != "/foo;bar" {
		t.Errorf("path = %q, want %q", opts.path, "/foo;bar")
	}
	if opts.host != "h;x" {
		t.Errorf("host = %q, want %q", opts.host, "h;x")
	}
	if opts.transport != "ws" {
		t.Errorf("transport = %q, want %q", opts.transport, "ws")
	}
	if got := v2rayPluginOptions(`v2ray-plugin;path=/foo\`); got != nil {
		t.Errorf("dangling backslash must fail parsing, got %+v", got)
	}
}

func TestSimpleObfsOptionsEscaped(t *testing.T) {
	mode, host := simpleObfsOptions(`obfs-local;obfs=http;obfs-host=a\;b`)
	if mode != "http" || host != "a;b" {
		t.Errorf("simpleObfsOptions = (%q, %q), want (%q, %q)", mode, host, "http", "a;b")
	}
	if mode, host := simpleObfsOptions(`obfs-local;obfs-host=a\`); mode != "" || host != "" {
		t.Errorf("dangling backslash must fail parsing, got (%q, %q)", mode, host)
	}
}

func TestShadowrocketTrojanWSOptionsEscaped(t *testing.T) {
	opts := shadowrocketTrojanWebSocketOptions(`obfs-local;obfs=ws;host=h\;x`)
	if opts == nil {
		t.Fatal("shadowrocketTrojanWebSocketOptions returned nil")
	}
	if opts.host != "h;x" {
		t.Errorf("host = %q, want %q", opts.host, "h;x")
	}
}
