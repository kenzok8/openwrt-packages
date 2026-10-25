package generator

import (
	"strconv"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

// generateSurge renders a Surge/Shadowrocket INI configuration.
func generateSurge(opts Options, shadowrocket bool) string {
	var b strings.Builder
	ipv6 := "true"
	dnsServers := []string{"223.5.5.5", "119.29.29.29"}
	var encryptedDNSServers []string
	if opts.Scheme != nil && opts.Scheme.NetworkSettings != nil {
		if opts.Scheme.NetworkSettings.IPv6Enabled != nil {
			ipv6 = strconv.FormatBool(*opts.Scheme.NetworkSettings.IPv6Enabled)
		}
		if len(opts.Scheme.NetworkSettings.DNSServers) > 0 {
			dnsServers = opts.Scheme.NetworkSettings.DNSServers
		}
		encryptedDNSServers = opts.Scheme.NetworkSettings.EncryptedDNSServers
	}
	b.WriteString(header(opts.Target))
	b.WriteString("[General]\n")
	b.WriteString("loglevel = notify\n")
	b.WriteString("ipv6 = " + ipv6 + "\n")
	b.WriteString("dns-server = " + strings.Join(dnsServers, ", ") + "\n")
	if len(encryptedDNSServers) > 0 {
		b.WriteString("encrypted-dns-server = " + strings.Join(encryptedDNSServers, ", ") + "\n")
	}
	b.WriteString("skip-proxy = 127.0.0.1, localhost, *.local\n")
	b.WriteString("test-timeout = 5\n\n")

	names := uniquedNames(opts.Nodes)
	b.WriteString("[Proxy]\n")
	for _, n := range opts.Nodes {
		b.WriteString(surgeNode(n, shadowrocket))
		b.WriteString("\n")
	}

	b.WriteString("\n[Proxy Group]\n")
	if opts.Scheme != nil {
		b.WriteString(surgeSchemeGroups(opts.Scheme, names))
	} else {
		b.WriteString(surgeSelect(selectGroupName, append(append([]string{}, names...), directGroupName), false))
		b.WriteString(surgeURLTest(autoGroupName, names, false))
	}

	b.WriteString("\n[Rule]\n")
	if opts.Scheme != nil {
		for _, r := range opts.plannedRules {
			if line := renderRule(r, opts.Target); line != "" {
				b.WriteString(line + "\n")
			}
		}
	} else {
		b.WriteString("FINAL," + confName(selectGroupName) + "\n")
	}
	return b.String()
}

// surgeSchemeGroups renders a rule scheme's strategy groups as Surge INI.
func surgeSchemeGroups(scheme *model.RuleScheme, nodeNames []string) string {
	var b strings.Builder
	for _, g := range scheme.Groups {
		members := resolveGroupMembers(g, nodeNames)
		params := make([]string, 0, len(members)+3)
		for _, m := range members {
			params = append(params, confName(m))
		}
		if g.Kind != model.KindSelect {
			if g.URL != "" {
				params = append(params, "url="+confValue(g.URL))
			}
			if g.Interval > 0 {
				params = append(params, "interval="+strconv.Itoa(g.Interval))
			}
			if g.Tolerance > 0 {
				params = append(params, "tolerance="+strconv.Itoa(g.Tolerance))
			}
		}
		if g.IconURL != "" {
			params = append(params, "icon-url="+confValue(g.IconURL))
		}
		b.WriteString(confName(g.Name) + " = " + string(g.Kind) + ", " + strings.Join(params, ", ") + "\n")
	}
	return b.String()
}

// surgeSchemeRules renders a rule scheme's routing rules as Surge INI.
// surgeNode serializes one node to a Surge/Shadowrocket proxy line.
func surgeNode(node model.ProxyNode, shadowrocket bool) string {
	name := confName(displayName(node))
	var components []string

	switch node.Kind {
	case model.KindShadowsocks:
		components = []string{"ss", node.Server, strconv.Itoa(node.Port),
			"encrypt-method=" + firstNonEmpty(node.Cipher, "aes-256-gcm"),
			"password=" + confValue(node.Password),
			"udp-relay=" + strconv.FormatBool(node.UDPRelayEnabled == nil || *node.UDPRelayEnabled)}
		if shadowrocket && node.Plugin == "v2ray-plugin" {
			if node.TLS {
				components = append(components, "obfs=wss")
			} else {
				components = append(components, "obfs=ws")
			}
			appendValue(node.HostHeader, "obfs-host", &components)
			appendValue(node.ExportablePath(), "obfs-uri", &components)
		} else if mode := simpleObfsMode(node); mode != "" {
			components = append(components, "obfs="+mode)
			appendValue(node.ObfsParam, "obfs-host", &components)
		}
	case model.KindShadowsocksR:
		components = []string{"ssr", node.Server, strconv.Itoa(node.Port),
			"encrypt-method=" + firstNonEmpty(node.Cipher, "aes-256-cfb"),
			"password=" + confValue(node.Password),
			"protocol=" + firstNonEmpty(node.ProtocolName, "origin"),
			"obfs=" + firstNonEmpty(node.Obfs, "plain")}
		appendValue(node.ProtocolParam, "protocol-param", &components)
		appendValue(node.ObfsParam, "obfs-param", &components)
	case model.KindVMess:
		components = []string{"vmess", node.Server, strconv.Itoa(node.Port),
			"username=" + exportableUUID(node.UUID),
			"vmess-aead=" + strconv.FormatBool(ptrInt(node.AlterID, 0) == 0)}
		if c := strings.ToLower(node.Cipher); c == "aes-128-gcm" || c == "chacha20-ietf-poly1305" {
			components = append(components, "encrypt-method="+c)
		}
		appendSurgeTransport(node, true, shadowrocket, &components)
	case model.KindVLESS:
		components = []string{"vless", node.Server, strconv.Itoa(node.Port),
			"username=" + exportableUUID(node.UUID)}
		appendSurgeTransport(node, true, shadowrocket, &components)
		if shadowrocket && node.UsesReality() {
			appendValue(node.RealityPublicKey, "pbk", &components)
			appendValue(node.RealityShortID, "sid", &components)
			appendValue(node.Fingerprint, "fingerprint", &components)
			if xtls := shadowrocketXTLSMode(node); xtls != 0 {
				components = append(components, "xtls="+strconv.Itoa(xtls))
			}
		}
	case model.KindTrojan:
		components = []string{"trojan", node.Server, strconv.Itoa(node.Port),
			"password=" + confValue(node.Password)}
		appendSurgeTransport(node, false, shadowrocket, &components)
	case model.KindHysteria2:
		components = []string{"hysteria2", node.Server, strconv.Itoa(node.Port),
			"password=" + confValue(node.Password)}
		if _, p := hysteria2Obfs(node); p != "" {
			key := "salamander-password"
			if shadowrocket {
				key = "obfsParam"
			}
			components = append(components, key+"="+confValue(p))
		}
		appendSurgeTLS(node, false, &components)
	case model.KindHysteria:
		components = []string{"hysteria", node.Server, strconv.Itoa(node.Port),
			"auth=" + confValue(node.Password)}
		if node.Obfs != "" && !strings.EqualFold(node.Obfs, "none") {
			components = append(components, "obfsParam="+confValue(node.Obfs))
		}
		appendValue(node.ProtocolName, "protocol", &components)
		components = append(components,
			"upmbps="+strconv.Itoa(ptrInt(node.UpMbps, 50)),
			"downmbps="+strconv.Itoa(ptrInt(node.DownMbps, 100)))
		appendSurgeTLS(node, false, &components)
		components = append(components, "udp=1")
	case model.KindTUIC:
		if shadowrocket {
			components = []string{"tuic", node.Server, strconv.Itoa(node.Port),
				"password=" + confValue(node.Password)}
			appendValue(exportableUUID(node.UUID), "user", &components)
			appendSurgeTLS(node, false, &components)
			components = append(components, "udp=1")
		} else {
			components = []string{"tuic-v5", node.Server, strconv.Itoa(node.Port)}
			appendValue(exportableUUID(node.UUID), "uuid", &components)
			components = append(components, "password="+confValue(node.Password))
			appendSurgeTLS(node, false, &components)
			components = append(components, "udp-relay=true")
		}
	case model.KindWireGuard:
		components = []string{"wireguard", "section-name=" + confName(displayName(node))}
	case model.KindAnyTLS:
		components = []string{"anytls", node.Server, strconv.Itoa(node.Port),
			"password=" + confValue(node.Password)}
		appendSurgeTLS(node, false, &components)
		components = append(components, "udp-relay=true")
	case model.KindSnell:
		components = []string{"snell", node.Server, strconv.Itoa(node.Port),
			"psk=" + confValue(node.Password)}
		if node.Version != nil {
			components = append(components, "version="+strconv.Itoa(*node.Version))
		}
		if node.Obfs != "" && !strings.EqualFold(node.Obfs, "none") {
			components = append(components, "obfs="+node.Obfs)
			appendValue(node.ObfsParam, "obfs-host", &components)
		}
		if ptrInt(node.Version, 4) >= 3 {
			components = append(components, "udp-relay=true")
		}
	case model.KindSOCKS5:
		if node.TLS {
			components = []string{"socks5-tls", node.Server, strconv.Itoa(node.Port)}
		} else {
			components = []string{"socks5", node.Server, strconv.Itoa(node.Port)}
		}
		components = append(components, surgeCredentialPair(node)...)
		components = append(components, "udp-relay=true")
		if node.TLS {
			appendSurgeTLS(node, false, &components)
		}
	case model.KindHTTP:
		if node.TLS {
			components = []string{"https", node.Server, strconv.Itoa(node.Port)}
		} else {
			components = []string{"http", node.Server, strconv.Itoa(node.Port)}
		}
		components = append(components, surgeCredentialPair(node)...)
		if node.TLS {
			appendSurgeTLS(node, false, &components)
		}
	default:
		components = []string{"direct"}
	}
	if shadowrocket && node.Kind == model.KindVLESS {
		components = append(components, "udp-relay=true")
	}
	return name + " = " + strings.Join(components, ", ")
}

func surgeCredentialPair(node model.ProxyNode) []string {
	if node.Username == "" && node.Password == "" {
		return nil
	}
	return []string{confValue(node.Username), confValue(node.Password)}
}

func shadowrocketXTLSMode(node model.ProxyNode) int {
	flow := strings.ToLower(node.Flow)
	if flow == "" {
		return 0
	}
	if strings.Contains(flow, "vision") {
		return 2
	}
	if strings.Contains(flow, "direct") {
		return 1
	}
	return 0
}

func appendSurgeTransport(node model.ProxyNode, includeTLSFlag, shadowrocket bool, values *[]string) {
	appendSurgeTLS(node, includeTLSFlag, values)
	if node.Transport == "ws" {
		*values = append(*values, "ws=true")
		appendValue(firstNonEmpty(node.ExportablePath(), "/"), "ws-path", values)
		if h := exportableTransportHost(node); h != "" {
			*values = append(*values, "ws-headers=Host:"+confValue(h))
		}
	} else if shadowrocket && node.Transport != "" && node.Transport != "tcp" {
		*values = append(*values, "obfs="+node.Transport)
		if node.Transport == "grpc" {
			appendValue(strings.TrimPrefix(node.Path, "/"), "serviceName", values)
		} else {
			appendValue(node.ExportablePath(), "path", values)
		}
		appendValue(node.HostHeader, "host", values)
		if node.Transport == "xhttp" {
			appendValue(node.TransportMode, "mode", values)
		}
	}
}

func appendSurgeTLS(node model.ProxyNode, includeTLSFlag bool, values *[]string) {
	if includeTLSFlag && node.TLS {
		*values = append(*values, "tls=true")
	}
	appendValue(node.SNI, "sni", values)
	if node.SkipCertificateVerification {
		*values = append(*values, "skip-cert-verify=true")
	}
	appendValue(node.ALPN, "alpn", values)
}

func surgeSelect(name string, values []string, hidden bool) string {
	params := make([]string, 0, len(values))
	for _, v := range dedupStrings(values) {
		params = append(params, confName(v))
	}
	if hidden {
		params = append(params, "hidden=true")
	}
	if len(params) == 0 {
		params = append(params, "DIRECT")
	}
	return confName(name) + " = select, " + strings.Join(params, ", ") + "\n"
}

func surgeURLTest(name string, names []string, hidden bool) string {
	if len(names) == 0 {
		return surgeSelect(name, []string{directGroupName}, hidden)
	}
	params := make([]string, 0, len(names)+3)
	for _, n := range names {
		params = append(params, confName(n))
	}
	params = append(params, "url=http://www.gstatic.com/generate_204", "interval=300", "tolerance=50")
	if hidden {
		params = append(params, "hidden=true")
	}
	return confName(name) + " = url-test, " + strings.Join(params, ", ") + "\n"
}

func appendValue(value, key string, values *[]string) {
	if value == "" {
		return
	}
	*values = append(*values, key+"="+confValue(value))
}

// confName sanitizes an untrusted node/group name for INI-style configs.
func confName(value string) string {
	v := collapseLineBreaks(value)
	v = strings.NewReplacer(
		"=", "-",
		",", "，",
		"#", "＃",
		";", "；",
		"[", "［",
		"]", "］",
	).Replace(v)
	return strings.TrimSpace(v)
}

// confValue sanitizes an INI value, escaping commas.
func confValue(value string) string {
	return strings.ReplaceAll(collapseLineBreaks(value), ",", "%2C")
}
