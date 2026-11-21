package service

import (
	"strings"
	"testing"
)

func TestParseSubscriptionUserinfo(t *testing.T) {
	if got := parseSubscriptionUserinfo("upload=0; download=1; total=1"); got != nil {
		t.Errorf("one-byte plan without expiry must read as no header, got %+v", got)
	}
	// A one-byte total WITH an expiry is a real (if tiny) plan.
	if got := parseSubscriptionUserinfo("upload=0; download=1; total=1; expire=1893456000"); got == nil || got.TotalBytes != 1 {
		t.Errorf("one-byte plan with expiry must be kept, got %+v", got)
	}
	got := parseSubscriptionUserinfo("upload=100; download=200; total=1000")
	if got == nil || got.UploadBytes != 100 || got.DownloadBytes != 200 || got.TotalBytes != 1000 {
		t.Errorf("normal header parsed as %+v", got)
	}
	if got := parseSubscriptionUserinfo(""); got != nil {
		t.Errorf("empty header must read as nil, got %+v", got)
	}
}

func TestQuotaProbeURL(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			"subconverter unwrapped",
			"https://sub.example.com/sub?target=clash&url=https%3A%2F%2Fairport.example.com%2Fapi%2Fv1%2Fsub",
			"https://airport.example.com/api/v1/sub?flag=clash",
		},
		{
			"wrapped link already flagged",
			"https://sub.example.com/sub?target=clash&url=https%3A%2F%2Fairport.example.com%2Fsub%3Fflag%3Dclash",
			"https://airport.example.com/sub?flag=clash",
		},
		{
			"plain link",
			"https://airport.example.com/sub",
			"https://airport.example.com/sub?flag=clash",
		},
		{
			"plain link already flagged",
			"https://airport.example.com/sub?flag=clash",
			"",
		},
		{
			"plain link with other query",
			"https://airport.example.com/sub?token=abc",
			"https://airport.example.com/sub?flag=clash&token=abc",
		},
		{
			"no target param is not a converter link",
			"https://sub.example.com/sub?url=https%3A%2F%2Fa.com%2Fx",
			"https://sub.example.com/sub?flag=clash&url=https%3A%2F%2Fa.com%2Fx",
		},
		{
			"wrapped link not http",
			"https://sub.example.com/sub?target=clash&url=ftp%3A%2F%2Fa.com%2Fx",
			"https://sub.example.com/sub?flag=clash&target=clash&url=ftp%3A%2F%2Fa.com%2Fx",
		},
	}
	for _, tc := range cases {
		if got := quotaProbeURL(tc.in); got != tc.want {
			t.Errorf("%s: quotaProbeURL = %q, want %q", tc.name, got, tc.want)
		}
	}
	// Multiple wrapped URLs: the unwrap fails, so the probe goes to the
	// converter itself (which ignores flag) rather than guessing one.
	multi := quotaProbeURL("https://sub.example.com/sub?target=clash&url=https%3A%2F%2Fa.com%2Fx%7Chttps%3A%2F%2Fb.com%2Fy")
	if !strings.HasPrefix(multi, "https://sub.example.com/sub?") || !strings.Contains(multi, "flag=clash") {
		t.Errorf("multi-url probe = %q, want the converter link with flag=clash", multi)
	}
}
