package parser

import (
	"strconv"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

// shadowTLSOptions validates a ShadowTLS option set, mirroring the Swift
// shadowTLSOptions helper: only version/host/password/skip-cert-verify are
// known keys, the version must parse as an integer, host is required, and
// the result must pass ShadowTLSOptions.IsValid. Anything else is nil.
func shadowTLSOptions(options map[string]string) *model.ShadowTLSOptions {
	for key := range options {
		switch key {
		case "version", "host", "password", "skip-cert-verify":
		default:
			return nil
		}
	}
	version, err := strconv.Atoi(options["version"])
	if err != nil {
		return nil
	}
	host, ok := options["host"]
	if !ok {
		return nil
	}
	out := &model.ShadowTLSOptions{
		Version:                     version,
		Host:                        host,
		Password:                    options["password"],
		SkipCertificateVerification: boolString(options["skip-cert-verify"]),
	}
	if !out.IsValid() {
		return nil
	}
	return out
}

// surgeShadowTLSOptions parses the shadow-tls-* keys of a Surge proxy line,
// mirroring the Swift SS/Snell line readers: an unknown shadow-tls-* key or
// an invalid combination rejects the node (ok is false); no shadow-tls-*
// keys at all means no wrapper (nil, true). The version defaults to "2" when
// the key is absent, never when it is present-but-empty. decode
// percent-decodes values for readers that keep option values raw (Snell);
// pass nil when values are already decoded (SS via surgeProxyScalar).
func surgeShadowTLSOptions(options map[string]string, decode func(string) string) (*model.ShadowTLSOptions, bool) {
	hasKeys := false
	for key := range options {
		if !strings.HasPrefix(key, "shadow-tls-") {
			continue
		}
		hasKeys = true
		switch key {
		case "shadow-tls-version", "shadow-tls-sni", "shadow-tls-password":
		default:
			return nil, false
		}
	}
	if !hasKeys {
		return nil, true
	}
	version, ok := options["shadow-tls-version"]
	if !ok {
		version = "2"
	}
	host := options["shadow-tls-sni"]
	password := options["shadow-tls-password"]
	if decode != nil {
		version = decode(version)
		host = decode(host)
		password = decode(password)
	}
	parsed := shadowTLSOptions(map[string]string{
		"version":  version,
		"host":     host,
		"password": password,
	})
	if parsed == nil {
		return nil, false
	}
	return parsed, true
}

// shadowTLSPluginOptions parses a SIP003 plugin string such as
// `shadow-tls;host=cover.example.com;password=secret;version=3`, mirroring
// the Swift shadowTLSPluginOptions helper. The first field must be
// shadow-tls; duplicate keys or an invalid combination yield nil.
func shadowTLSPluginOptions(plugin string) *model.ShadowTLSOptions {
	parts := sip003Fields(plugin)
	if len(parts) == 0 || !strings.EqualFold(parts[0], "shadow-tls") {
		return nil
	}
	options := map[string]string{}
	for _, field := range parts[1:] {
		equals := strings.IndexByte(field, '=')
		if equals < 0 {
			return nil
		}
		key := strings.ToLower(field[:equals])
		if _, dup := options[key]; dup {
			return nil
		}
		options[key] = field[equals+1:]
	}
	return shadowTLSOptions(options)
}
