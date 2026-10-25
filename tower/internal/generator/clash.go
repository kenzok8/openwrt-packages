package generator

import (
	"strconv"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

const (
	selectGroupName = "节点选择"
	autoGroupName   = "自动选择"
	directGroupName = "DIRECT"
	rejectGroupName = "REJECT"
)

// generateClash renders a Clash/mihomo YAML configuration. Phase 1 emits a
// minimal-but-valid structure: nodes + a select group + a url-test group.
func generateClash(opts Options) string {
	var b strings.Builder
	ipv6 := true
	dnsServers := []string{"https://223.5.5.5/dns-query", "https://doh.pub/dns-query"}
	fallbackServers := []string{"https://1.1.1.1/dns-query", "https://dns.google/dns-query"}
	if opts.Scheme != nil && opts.Scheme.NetworkSettings != nil {
		if opts.Scheme.NetworkSettings.IPv6Enabled != nil {
			ipv6 = *opts.Scheme.NetworkSettings.IPv6Enabled
		}
		if len(opts.Scheme.NetworkSettings.DNSServers) > 0 {
			dnsServers = opts.Scheme.NetworkSettings.DNSServers
		}
		if len(opts.Scheme.NetworkSettings.FallbackDNSServers) > 0 {
			fallbackServers = opts.Scheme.NetworkSettings.FallbackDNSServers
		}
	}
	b.WriteString(header(opts.Target))
	b.WriteString("mixed-port: 7890\n")
	b.WriteString("allow-lan: false\n")
	b.WriteString("mode: rule\n")
	b.WriteString("log-level: warning\n")
	b.WriteString("ipv6: " + strconv.FormatBool(ipv6) + "\n\n")
	b.WriteString("dns:\n")
	b.WriteString("  enable: true\n")
	b.WriteString("  enhanced-mode: fake-ip\n")
	b.WriteString("  fake-ip-range: 198.18.0.1/16\n")
	b.WriteString("  fake-ip-filter:\n")
	b.WriteString("    - \"*.lan\"\n")
	b.WriteString("    - \"+.local\"\n")
	b.WriteString("  default-nameserver:\n")
	b.WriteString("    - 223.5.5.5\n")
	b.WriteString("    - 119.29.29.29\n")
	b.WriteString("  nameserver:\n")
	for _, server := range dnsServers {
		b.WriteString("    - " + yaml(server) + "\n")
	}
	b.WriteString("  fallback:\n")
	for _, server := range fallbackServers {
		b.WriteString("    - " + yaml(server) + "\n")
	}
	b.WriteString("  fallback-filter:\n")
	b.WriteString("    geoip: true\n")
	b.WriteString("    geoip-code: CN\n\n")

	b.WriteString("proxies:\n")
	for _, n := range opts.Nodes {
		b.WriteString(clashNode(n, opts.Target))
		b.WriteString("\n")
	}

	names := uniquedNames(opts.Nodes)
	b.WriteString("\nproxy-groups:\n")
	if opts.Scheme != nil {
		b.WriteString(clashSchemeGroups(opts.Scheme, names))
	} else {
		b.WriteString(clashSelectGroup(selectGroupName, append(append([]string{}, names...), directGroupName)))
		b.WriteString(clashURLTestGroup(autoGroupName, names))
	}
	if len(opts.plannedProviders) > 0 {
		b.WriteString("\nrule-providers:\n")
		for _, p := range opts.plannedProviders {
			format := p.resource.Format
			if format == "" {
				format = "text"
			}
			behavior := p.resource.Behavior
			if behavior == "" {
				behavior = "classical"
			}
			interval := p.resource.Interval
			if interval <= 0 {
				interval = 86400
			}
			ext := "yaml"
			if format == "mrs" {
				ext = "mrs"
			}
			b.WriteString("  " + yaml(p.id) + ":\n")
			b.WriteString("    type: http\n")
			b.WriteString("    behavior: " + behavior + "\n")
			b.WriteString("    format: " + format + "\n")
			b.WriteString("    path: ./rules/" + p.id + "." + ext + "\n")
			b.WriteString("    url: " + yaml(p.resource.URL) + "\n")
			b.WriteString("    interval: " + strconv.Itoa(interval) + "\n")
		}
	}

	b.WriteString("\nrules:\n")
	if opts.Scheme != nil {
		for _, r := range opts.plannedRules {
			if line := renderRule(r, opts.Target); line != "" {
				b.WriteString("  - " + line + "\n")
			}
		}
	} else {
		b.WriteString("  - MATCH," + selectGroupName + "\n")
	}
	return b.String()
}

// clashSchemeGroups renders a rule scheme's strategy groups as Clash YAML.
func clashSchemeGroups(scheme *model.RuleScheme, nodeNames []string) string {
	var b strings.Builder
	for _, g := range scheme.Groups {
		b.WriteString("  - name: " + yaml(g.Name) + "\n")
		if g.IconURL != "" {
			b.WriteString("    icon: " + yaml(g.IconURL) + "\n")
		}
		b.WriteString("    type: " + string(g.Kind) + "\n")
		if g.URL != "" {
			b.WriteString("    url: " + yaml(g.URL) + "\n")
		}
		if g.Interval > 0 {
			b.WriteString("    interval: " + strconv.Itoa(g.Interval) + "\n")
		}
		if g.Tolerance > 0 {
			b.WriteString("    tolerance: " + strconv.Itoa(g.Tolerance) + "\n")
		}
		b.WriteString("    proxies:\n")
		members := resolveGroupMembers(g, nodeNames)
		for _, m := range members {
			b.WriteString("      - " + yaml(m) + "\n")
		}
	}
	return b.String()
}

// clashSchemeRules renders a rule scheme's routing rules as Clash YAML.
// clashNode serializes one proxy node to a Clash YAML list item.
func clashNode(node model.ProxyNode, target model.ClientTarget) string {
	var values []string
	values = append(values,
		"  - name: "+yaml(displayName(node)),
		"    type: "+string(node.Kind),
		"    server: "+yaml(node.Server),
		"    port: "+strconv.Itoa(node.Port),
	)

	switch node.Kind {
	case model.KindShadowsocks:
		values = append(values,
			"    cipher: "+yaml(firstNonEmpty(node.Cipher, "aes-256-gcm")),
			"    password: "+yaml(node.Password),
			"    udp: "+strconv.FormatBool(node.UDPRelayEnabled == nil || *node.UDPRelayEnabled),
		)
		if node.Plugin == "v2ray-plugin" {
			values = append(values, "    plugin: v2ray-plugin", "    plugin-opts:", "      mode: websocket")
			if node.PluginMux != nil {
				values = append(values, "      mux: "+strconv.FormatBool(*node.PluginMux))
			}
			if node.TLS {
				values = append(values, "      tls: true")
			}
			if node.HostHeader != "" {
				values = append(values, "      host: "+yaml(node.HostHeader))
			}
			if p := node.ExportablePath(); p != "" {
				values = append(values, "      path: "+yaml(p))
			}
		} else if mode := simpleObfsMode(node); mode != "" {
			values = append(values, "    plugin: obfs", "    plugin-opts:", "      mode: "+yaml(mode))
			if node.ObfsParam != "" {
				values = append(values, "      host: "+yaml(node.ObfsParam))
			}
		}
		if (target == model.ClientShadowrocket || target == model.ClientKaring) &&
			node.TLS && node.Plugin == "" && simpleObfsMode(node) == "" {
			appendClashTransport(node, target, &values)
			appendClashALPN(node, &values)
		}
	case model.KindShadowsocksR:
		values = append(values,
			"    cipher: "+yaml(firstNonEmpty(node.Cipher, "aes-256-cfb")),
			"    password: "+yaml(node.Password),
			"    protocol: "+yaml(firstNonEmpty(node.ProtocolName, "origin")),
			"    obfs: "+yaml(firstNonEmpty(node.Obfs, "plain")),
		)
		if node.ProtocolParam != "" {
			values = append(values, "    protocol-param: "+yaml(node.ProtocolParam))
		}
		if node.ObfsParam != "" {
			values = append(values, "    obfs-param: "+yaml(node.ObfsParam))
		}
	case model.KindVMess:
		values = append(values,
			"    uuid: "+yaml(exportableUUID(node.UUID)),
			"    alterId: "+strconv.Itoa(ptrInt(node.AlterID, 0)),
			"    cipher: "+yaml(firstNonEmpty(node.Cipher, "auto")),
			"    udp: true",
		)
		appendClashTransport(node, target, &values)
	case model.KindVLESS:
		values = append(values,
			"    uuid: "+yaml(exportableUUID(node.UUID)),
			"    udp: true",
		)
		appendClashTransport(node, target, &values)
	case model.KindTrojan:
		values = append(values,
			"    password: "+yaml(node.Password),
			"    udp: true",
		)
		appendClashTransport(node, target, &values)
	case model.KindHysteria2:
		values = append(values,
			"    password: "+yaml(node.Password),
			"    skip-cert-verify: "+strconv.FormatBool(node.SkipCertificateVerification),
			"    udp: true",
		)
		if node.SNI != "" {
			values = append(values, "    sni: "+yaml(node.SNI))
		}
		if node.PortHopping != "" {
			values = append(values, "    ports: "+yaml(node.PortHopping))
		}
		appendClashALPN(node, &values)
		if node.CertificateFingerprint != "" {
			values = append(values, "    fingerprint: "+yaml(node.CertificateFingerprint))
		}
		if t, p := hysteria2Obfs(node); t != "" {
			values = append(values, "    obfs: "+yaml(t), "    obfs-password: "+yaml(p))
		}
	case model.KindHysteria:
		values = append(values,
			"    auth-str: "+yaml(node.Password),
			"    up: "+strconv.Itoa(ptrInt(node.UpMbps, 50)),
			"    down: "+strconv.Itoa(ptrInt(node.DownMbps, 100)),
			"    skip-cert-verify: "+strconv.FormatBool(node.SkipCertificateVerification),
		)
		if node.SNI != "" {
			values = append(values, "    sni: "+yaml(node.SNI))
		}
		appendClashCertificateFingerprint(node, &values)
		if node.Obfs != "" && !strings.EqualFold(node.Obfs, "none") {
			values = append(values, "    obfs: "+yaml(node.Obfs))
		}
		if node.ProtocolName != "" {
			values = append(values, "    protocol: "+yaml(node.ProtocolName))
		}
		appendClashALPN(node, &values)
	case model.KindTUIC:
		values = append(values,
			"    uuid: "+yaml(exportableUUID(node.UUID)),
			"    password: "+yaml(node.Password),
			"    skip-cert-verify: "+strconv.FormatBool(node.SkipCertificateVerification),
			"    udp: true",
		)
		if node.SNI != "" {
			values = append(values, "    sni: "+yaml(node.SNI))
		}
		if node.CongestionControl != "" {
			values = append(values, "    congestion-controller: "+yaml(node.CongestionControl))
		}
		if node.UDPRelayMode != "" {
			values = append(values, "    udp-relay-mode: "+yaml(node.UDPRelayMode))
		}
		if node.PortHopping != "" {
			values = append(values, "    ports: "+yaml(node.PortHopping))
		}
		appendClashALPN(node, &values)
		appendClashCertificateFingerprint(node, &values)
		appendClashClientFingerprint(node, &values)
	case model.KindWireGuard:
		values = append(values,
			"    private-key: "+yaml(node.WireGuardPrivateKey),
			"    public-key: "+yaml(node.WireGuardPublicKey),
		)
		if node.WireGuardIPv4 != "" {
			values = append(values, "    ip: "+yaml(node.WireGuardIPv4))
		}
		if node.WireGuardIPv6 != "" {
			values = append(values, "    ipv6: "+yaml(node.WireGuardIPv6))
		}
		values = append(values, "    allowed-ips: "+yamlList(csv(node.WireGuardAllowedIPs)))
		if node.WireGuardPreSharedKey != "" {
			values = append(values, "    pre-shared-key: "+yaml(node.WireGuardPreSharedKey))
		}
		if bytes := wireGuardReservedBytes(node); len(bytes) > 0 {
			values = append(values, "    reserved: ["+intsToString(bytes)+"]")
		}
		if node.WireGuardPersistentKeepalive != nil {
			values = append(values, "    persistent-keepalive: "+strconv.Itoa(*node.WireGuardPersistentKeepalive))
		}
		if node.WireGuardMTU != nil {
			values = append(values, "    mtu: "+strconv.Itoa(*node.WireGuardMTU))
		}
		if dns := csv(node.WireGuardDNS); len(dns) > 0 {
			values = append(values, "    dns: "+yamlList(dns))
		}
		values = append(values, "    udp: true")
	case model.KindAnyTLS:
		values = append(values,
			"    password: "+yaml(node.Password),
			"    skip-cert-verify: "+strconv.FormatBool(node.SkipCertificateVerification),
			"    udp: true",
		)
		if node.SNI != "" {
			values = append(values, "    sni: "+yaml(node.SNI))
		}
		if node.IdleSessionCheckInterval != nil {
			values = append(values, "    idle-session-check-interval: "+strconv.Itoa(*node.IdleSessionCheckInterval))
		}
		if node.IdleSessionTimeout != nil {
			values = append(values, "    idle-session-timeout: "+strconv.Itoa(*node.IdleSessionTimeout))
		}
		if node.MinIdleSession != nil {
			values = append(values, "    min-idle-session: "+strconv.Itoa(*node.MinIdleSession))
		}
		appendClashALPN(node, &values)
		appendClashCertificateFingerprint(node, &values)
		if target == model.ClientShadowrocket || target == model.ClientKaring {
			values = append(values, "    tls: true")
			appendClashReality(node, &values)
		}
		appendClashClientFingerprint(node, &values)
	case model.KindSnell:
		values = append(values, "    psk: "+yaml(node.Password))
		if node.Version != nil {
			values = append(values, "    version: "+strconv.Itoa(*node.Version))
		}
		if ptrInt(node.Version, 4) >= 3 {
			values = append(values, "    udp: true")
		}
		if node.Obfs != "" && !strings.EqualFold(node.Obfs, "none") {
			values = append(values, "    obfs-opts:", "      mode: "+yaml(node.Obfs))
			if node.ObfsParam != "" {
				values = append(values, "      host: "+yaml(node.ObfsParam))
			}
		}
	case model.KindSOCKS5, model.KindHTTP:
		if node.Username != "" {
			values = append(values, "    username: "+yaml(node.Username))
		}
		if node.Password != "" {
			values = append(values, "    password: "+yaml(node.Password))
		}
		values = append(values, "    tls: "+strconv.FormatBool(node.TLS))
		if node.TLS {
			if node.SNI != "" {
				values = append(values, "    sni: "+yaml(node.SNI))
			}
			values = append(values, "    skip-cert-verify: "+strconv.FormatBool(node.SkipCertificateVerification))
			appendClashALPN(node, &values)
			appendClashCertificateFingerprint(node, &values)
			if target == model.ClientShadowrocket || target == model.ClientKaring {
				appendClashReality(node, &values)
			}
			appendClashClientFingerprint(node, &values)
		}
	}
	return strings.Join(values, "\n")
}

// appendClashReality writes the REALITY options block.
func appendClashReality(node model.ProxyNode, values *[]string) {
	if !node.UsesReality() {
		return
	}
	*values = append(*values, "    reality-opts:", "      public-key: "+yaml(node.RealityPublicKey))
	if node.RealityShortID != "" {
		*values = append(*values, "      short-id: "+yaml(node.RealityShortID))
	}
	*values = append(*values, "    client-fingerprint: "+yaml(firstNonEmpty(node.Fingerprint, "chrome")))
}

func appendClashALPN(node model.ProxyNode, values *[]string) {
	entries := csv(node.ALPN)
	if len(entries) == 0 {
		return
	}
	*values = append(*values, "    alpn: "+yamlList(entries))
}

func appendClashClientFingerprint(node model.ProxyNode, values *[]string) {
	if node.UsesReality() || node.Fingerprint == "" {
		return
	}
	*values = append(*values, "    client-fingerprint: "+yaml(node.Fingerprint))
}

func appendClashCertificateFingerprint(node model.ProxyNode, values *[]string) {
	if node.CertificateFingerprint == "" {
		return
	}
	*values = append(*values, "    fingerprint: "+yaml(node.CertificateFingerprint))
}

// appendClashTransport writes the transport + TLS block shared by
// vmess/vless/trojan.
func appendClashTransport(node model.ProxyNode, target model.ClientTarget, values *[]string) {
	*values = append(*values,
		"    tls: "+strconv.FormatBool(node.TLS),
		"    skip-cert-verify: "+strconv.FormatBool(node.SkipCertificateVerification),
	)
	if node.SNI != "" {
		key := "servername"
		if target == model.ClientStash && node.Kind == model.KindTrojan {
			key = "sni"
		}
		*values = append(*values, "    "+key+": "+yaml(node.SNI))
	}
	appendClashCertificateFingerprint(node, values)
	appendClashReality(node, values)
	if node.Kind == model.KindVLESS && node.Flow != "" {
		*values = append(*values, "    flow: "+yaml(node.Flow))
	}
	appendClashClientFingerprint(node, values)

	transport := node.Transport
	if transport != "" && transport != "tcp" {
		network := transport
		if network == "httpupgrade" {
			network = "ws"
		}
		*values = append(*values, "    network: "+yaml(network))
		switch transport {
		case "ws", "httpupgrade":
			*values = append(*values, "    ws-opts:", "      path: "+yaml(firstNonEmpty(node.ExportablePath(), "/")))
			if host := exportableTransportHost(node); host != "" {
				*values = append(*values, "      headers:", "        Host: "+yaml(host))
			}
			if transport == "httpupgrade" {
				*values = append(*values, "      v2ray-http-upgrade: true")
			}
		case "grpc":
			*values = append(*values, "    grpc-opts:")
			if node.Path != "" {
				service := strings.TrimPrefix(node.Path, "/")
				*values = append(*values, "      grpc-service-name: "+yaml(service))
			}
		case "http":
			*values = append(*values, "    http-opts:", "      path: ["+yaml(firstNonEmpty(node.ExportablePath(), "/"))+"]")
			if node.HostHeader != "" {
				*values = append(*values, "      headers:", "        Host: ["+yaml(node.HostHeader)+"]")
			}
		case "h2":
			*values = append(*values, "    h2-opts:", "      path: "+yaml(firstNonEmpty(node.ExportablePath(), "/")))
			if node.HostHeader != "" {
				*values = append(*values, "      host: ["+yaml(node.HostHeader)+"]")
			}
		case "xhttp":
			*values = append(*values, "    xhttp-opts:", "      path: "+yaml(firstNonEmpty(node.ExportablePath(), "/")))
			if node.HostHeader != "" {
				*values = append(*values, "      host: "+yaml(node.HostHeader))
			}
			if node.TransportMode != "" {
				*values = append(*values, "      mode: "+yaml(node.TransportMode))
			}
		}
	}
}

func clashSelectGroup(name string, nodeNames []string) string {
	var b strings.Builder
	b.WriteString("  - name: " + yaml(name) + "\n")
	b.WriteString("    type: select\n")
	b.WriteString("    proxies:\n")
	if len(nodeNames) == 0 {
		b.WriteString("      - DIRECT\n")
	} else {
		for _, n := range dedupStrings(nodeNames) {
			b.WriteString("      - " + yaml(n) + "\n")
		}
	}
	return b.String()
}

func clashURLTestGroup(name string, nodeNames []string) string {
	if len(nodeNames) == 0 {
		return clashSelectGroup(name, []string{directGroupName})
	}
	var b strings.Builder
	b.WriteString("  - name: " + yaml(name) + "\n")
	b.WriteString("    type: url-test\n")
	b.WriteString("    url: http://www.gstatic.com/generate_204\n")
	b.WriteString("    interval: 300\n")
	b.WriteString("    tolerance: 50\n")
	b.WriteString("    proxies:\n")
	for _, n := range dedupStrings(nodeNames) {
		b.WriteString("      - " + yaml(n) + "\n")
	}
	return b.String()
}

func hysteria2Obfs(node model.ProxyNode) (string, string) {
	if node.Kind != model.KindHysteria2 {
		return "", ""
	}
	t := strings.TrimSpace(node.Obfs)
	p := strings.TrimSpace(node.ObfsParam)
	if t == "" || strings.EqualFold(t, "none") || p == "" {
		return "", ""
	}
	return t, p
}

func simpleObfsMode(node model.ProxyNode) string {
	if node.Kind != model.KindShadowsocks {
		return ""
	}
	mode := strings.ToLower(strings.TrimSpace(node.Obfs))
	if mode == "http" || mode == "tls" {
		return mode
	}
	return ""
}

func wireGuardReservedBytes(node model.ProxyNode) []int {
	var out []int
	for _, s := range csv(node.WireGuardReserved) {
		n, err := strconv.Atoi(s)
		if err != nil || n < 0 || n > 255 {
			return nil
		}
		out = append(out, n)
	}
	return out
}

func exportableTransportHost(node model.ProxyNode) string {
	if h := strings.TrimSpace(node.HostHeader); h != "" {
		return h
	}
	return ""
}

func ptrInt(p *int, def int) int {
	if p == nil {
		return def
	}
	return *p
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func dedupStrings(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	return out
}

func intsToString(ints []int) string {
	parts := make([]string, len(ints))
	for i, n := range ints {
		parts[i] = strconv.Itoa(n)
	}
	return strings.Join(parts, ", ")
}
