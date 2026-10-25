package generator

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

const singBoxDirectTag = "DIRECT"

// generateSingBox renders a sing-box JSON configuration (sing-box MT / Hiddify).
func generateSingBox(opts Options) string {
	nodeTags := uniquedNames(opts.Nodes)

	outbounds := []any{}

	if opts.Scheme != nil {
		needsReject := false
		for _, g := range opts.Scheme.Groups {
			for _, member := range g.Members {
				if member.Type == model.MemberReference && isSingBoxReject(member.Value) {
					needsReject = true
				}
			}
			outbounds = append(outbounds, singBoxSchemeGroup(g, nodeTags))
		}
		if needsReject {
			outbounds = append(outbounds, map[string]any{"tag": "REJECT", "type": "block"})
		}
	} else {
		// Policy groups: a select group, a url-test group, and DIRECT.
		outbounds = append(outbounds, map[string]any{
			"tag":       selectGroupName,
			"type":      "selector",
			"outbounds": append(append([]string{}, nodeTags...), singBoxDirectTag),
		})
		outbounds = append(outbounds, map[string]any{
			"tag":       autoGroupName,
			"type":      "urltest",
			"url":       "https://www.gstatic.com/generate_204",
			"interval":  "300s",
			"tolerance": 50,
			"outbounds": nodeTags,
		})
	}
	outbounds = append(outbounds, map[string]any{
		"tag":  singBoxDirectTag,
		"type": "direct",
	})

	// Node outbounds.
	for i, n := range opts.Nodes {
		tag := nodeTags[i]
		if ob := singBoxOutbound(n, tag); ob != nil {
			outbounds = append(outbounds, ob)
		}
	}

	route := map[string]any{"auto_detect_interface": true}
	if opts.Scheme != nil {
		rules, finalGroup := singBoxSchemeRoute(opts)
		route["rules"] = rules
		route["final"] = finalGroup
		if len(opts.plannedProviders) > 0 {
			route["rule_set"] = singBoxSchemeRuleSets(opts)
		}
	} else {
		route["final"] = selectGroupName
	}

	config := map[string]any{
		"log":       map[string]any{"level": "warn", "timestamp": true},
		"inbounds":  singBoxInbounds(opts.Target),
		"outbounds": outbounds,
		"route":     route,
	}
	if opts.Target == model.ClientMomo {
		const dnsTag = "tower-dns-direct"
		config["dns"] = map[string]any{
			"servers": []any{map[string]any{
				"type":        "udp",
				"tag":         dnsTag,
				"server":      "223.5.5.5",
				"server_port": 53,
				"detour":      singBoxDirectTag,
			}},
			"final": dnsTag,
		}

		// Resolve node hostnames through the direct IP server and keep Momo's
		// intercepted DNS inbound out of the normal proxy routing rules.
		route["default_domain_resolver"] = dnsTag
		dnsRule := map[string]any{"inbound": []string{"dns-in"}, "action": "hijack-dns"}
		routeRules, _ := route["rules"].([]any)
		route["rules"] = append([]any{dnsRule}, routeRules...)
	}
	if hasRemoteRuleSet(opts.plannedProviders) {
		config["experimental"] = map[string]any{
			"cache_file": map[string]any{"enabled": true},
		}
	}

	var b []byte
	var err error
	if opts.Target == model.ClientClashooSB {
		b, err = json.Marshal(config)
	} else {
		b, err = json.MarshalIndent(config, "", "  ")
	}
	if err != nil {
		return "{}\n"
	}
	return string(b) + "\n"
}

func singBoxInbounds(target model.ClientTarget) []any {
	tun := map[string]any{
		"type":    "tun",
		"tag":     "tun-in",
		"address": []string{"172.19.0.1/30", "fdfe:dcba:9876::1/126"},
		"stack":   "mixed",
	}
	if target == model.ClientMomo {
		// Momo installs its own routes and looks up these tags in normal mode.
		tun["interface_name"] = "momo0"
		return []any{
			map[string]any{"type": "redirect", "tag": "redirect-in", "listen": "::", "listen_port": 12345},
			map[string]any{"type": "direct", "tag": "dns-in", "listen": "::", "listen_port": 1053},
			tun,
		}
	}
	tun["auto_route"] = true
	tun["strict_route"] = true
	return []any{tun}
}

func hasRemoteRuleSet(providers []plannedProvider) bool {
	for _, provider := range providers {
		if provider.format != "inline" {
			return true
		}
	}
	return false
}

// singBoxSchemeGroup renders one rule-scheme strategy group as a sing-box
// selector/urltest outbound. Empty groups fall back to DIRECT.
func singBoxSchemeGroup(g model.RuleSchemeGroup, nodeNames []string) map[string]any {
	members := resolveGroupMembers(g, nodeNames)
	if len(members) == 0 {
		members = []string{singBoxDirectTag}
	}
	outbound := map[string]any{
		"tag":       g.Name,
		"type":      "selector",
		"outbounds": members,
	}
	if g.Kind == model.KindURLTest {
		outbound["type"] = "urltest"
		outbound["url"] = firstNonEmpty(g.URL, "https://www.gstatic.com/generate_204")
		interval := g.Interval
		if interval <= 0 {
			interval = 300
		}
		tolerance := g.Tolerance
		if tolerance <= 0 {
			tolerance = 50
		}
		outbound["interval"] = strconv.Itoa(interval) + "s"
		outbound["tolerance"] = tolerance
	}
	return outbound
}

// singBoxRuleFields maps supported Clash-style conditions to sing-box fields.
var singBoxRuleFields = map[string]string{
	"DOMAIN":         "domain",
	"DOMAIN-SUFFIX":  "domain_suffix",
	"DOMAIN-KEYWORD": "domain_keyword",
	"IP-CIDR":        "ip_cidr",
	"IP-CIDR6":       "ip_cidr",
	"IP6-CIDR":       "ip_cidr",
	"PROCESS-NAME":   "process_name",
	"DOMAIN-REGEX":   "domain_regex",
}

func isSingBoxReject(policy string) bool {
	return strings.EqualFold(strings.TrimSpace(policy), "REJECT")
}

func isSingBoxRejectDrop(policy string) bool {
	return strings.EqualFold(strings.TrimSpace(policy), "REJECT-DROP")
}

// singBoxSchemeRoute renders route.rules for a rule scheme: inline rules are
// grouped by policy into compact field arrays, native rule sets are referenced
// by tag, and REJECT becomes a rule action (sing-box 1.11 removed the block
// outbound). It also returns the final fallback outbound.
func singBoxSchemeRoute(opts Options) ([]any, string) {
	finalGroup := singBoxDirectTag
	if len(opts.Scheme.Groups) > 0 {
		finalGroup = opts.Scheme.Groups[0].Name
	}

	var rules []any

	for _, planned := range opts.plannedRules {
		if planned.rule.Final {
			finalGroup = planned.rule.Group
			continue
		}
		if planned.native {
			rule := map[string]any{"rule_set": []string{planned.providerID}}
			if isSingBoxReject(planned.rule.Group) {
				rule["action"] = "reject"
			} else {
				rule["outbound"] = planned.rule.Group
			}
			rules = append(rules, rule)
			continue
		}
		fields := splitRuleFields(planned.rule.Body)
		field := singBoxRuleFields[strings.ToUpper(fields[0])]
		policy := planned.rule.Group
		rule := map[string]any{field: []string{fields[1]}}
		if isSingBoxReject(policy) {
			rule["action"] = "reject"
		} else {
			rule["outbound"] = policy
		}
		rules = append(rules, rule)
	}

	return rules, finalGroup
}

// singBoxSchemeRuleSets renders route.rule_set entries for native sing-box
// "source" rule sets.
func singBoxSchemeRuleSets(opts Options) []any {
	sets := make([]any, 0, len(opts.plannedProviders))
	for _, p := range opts.plannedProviders {
		if p.format == "inline" {
			lines := opts.RuleSetLines[p.resource.URL]
			rules, err := ParseClashooInlineRuleSet([]byte(strings.Join(lines, "\n")))
			if err != nil {
				continue
			}
			sets = append(sets, map[string]any{"type": "inline", "tag": p.id, "rules": rules})
			continue
		}
		sets = append(sets, map[string]any{
			"type":            "remote",
			"tag":             p.id,
			"format":          p.format,
			"url":             p.resource.URL,
			"download_detour": "DIRECT",
			"update_interval": "1d",
		})
	}
	return sets
}

// singBoxOutbound serializes one proxy node to a sing-box outbound object.
func singBoxOutbound(node model.ProxyNode, tag string) map[string]any {
	outbound := map[string]any{
		"tag":         tag,
		"server":      node.Server,
		"server_port": node.Port,
	}

	switch node.Kind {
	case model.KindShadowsocks:
		outbound["type"] = "shadowsocks"
		if node.UDPRelayEnabled != nil && !*node.UDPRelayEnabled {
			outbound["network"] = "tcp"
		}
		outbound["method"] = firstNonEmpty(node.Cipher, "aes-256-gcm")
		outbound["password"] = node.Password
		if node.Plugin == "v2ray-plugin" {
			outbound["plugin"] = "v2ray-plugin"
			opts := []string{"mode=websocket"}
			if node.PluginMux != nil {
				opts = append(opts, "mux="+map[bool]string{true: "1", false: "0"}[*node.PluginMux])
			}
			if node.TLS {
				opts = append(opts, "tls")
			}
			if node.HostHeader != "" {
				opts = append(opts, "host="+node.HostHeader)
			}
			if p := node.ExportablePath(); p != "" {
				opts = append(opts, "path="+p)
			}
			outbound["plugin_opts"] = strings.Join(opts, ";")
		} else if mode := simpleObfsMode(node); mode != "" {
			outbound["plugin"] = "obfs-local"
			opts := []string{"obfs=" + mode}
			if node.ObfsParam != "" {
				opts = append(opts, "obfs-host="+node.ObfsParam)
			}
			outbound["plugin_opts"] = strings.Join(opts, ";")
		}
	case model.KindShadowsocksR:
		return nil
	case model.KindVMess:
		outbound["type"] = "vmess"
		outbound["uuid"] = exportableUUID(node.UUID)
		outbound["security"] = singBoxVMessSecurity(node)
		outbound["alter_id"] = 0
	case model.KindVLESS:
		outbound["type"] = "vless"
		outbound["uuid"] = exportableUUID(node.UUID)
		if node.Flow != "" {
			outbound["flow"] = node.Flow
		}
	case model.KindTrojan:
		outbound["type"] = "trojan"
		outbound["password"] = node.Password
	case model.KindHysteria2:
		outbound["type"] = "hysteria2"
		outbound["password"] = node.Password
		if node.PortHopping != "" {
			ports := strings.Split(strings.ReplaceAll(node.PortHopping, "-", ":"), ",")
			for i, port := range ports {
				if !strings.Contains(port, ":") {
					ports[i] = port + ":" + port
				}
			}
			outbound["server_ports"] = ports
			delete(outbound, "server_port")
		}
		if t, p := hysteria2Obfs(node); t != "" {
			outbound["obfs"] = map[string]any{"type": t, "password": p}
		}
	case model.KindHysteria:
		outbound["type"] = "hysteria"
		outbound["auth_str"] = node.Password
		outbound["up_mbps"] = ptrInt(node.UpMbps, 50)
		outbound["down_mbps"] = ptrInt(node.DownMbps, 100)
		if node.Obfs != "" && !strings.EqualFold(node.Obfs, "none") {
			outbound["obfs"] = node.Obfs
		}
	case model.KindTUIC:
		outbound["type"] = "tuic"
		outbound["uuid"] = exportableUUID(node.UUID)
		outbound["password"] = node.Password
		if node.CongestionControl != "" {
			outbound["congestion_control"] = node.CongestionControl
		}
		if node.UDPRelayMode != "" {
			outbound["udp_relay_mode"] = node.UDPRelayMode
		}
	case model.KindWireGuard:
		outbound["type"] = "wireguard"
		var addresses []string
		if v := node.WireGuardIPv4; v != "" {
			if !strings.Contains(v, "/") {
				v += "/32"
			}
			addresses = append(addresses, v)
		}
		if v := node.WireGuardIPv6; v != "" {
			if !strings.Contains(v, "/") {
				v += "/128"
			}
			addresses = append(addresses, v)
		}
		outbound["local_address"] = addresses
		outbound["private_key"] = node.WireGuardPrivateKey
		outbound["peer_public_key"] = node.WireGuardPublicKey
		if node.WireGuardPreSharedKey != "" {
			outbound["pre_shared_key"] = node.WireGuardPreSharedKey
		}
		if b := wireGuardReservedBytes(node); len(b) > 0 {
			outbound["reserved"] = b
		}
		if node.WireGuardMTU != nil {
			outbound["mtu"] = *node.WireGuardMTU
		}
	case model.KindAnyTLS:
		outbound["type"] = "anytls"
		outbound["password"] = node.Password
		if node.IdleSessionCheckInterval != nil {
			outbound["idle_session_check_interval"] = strconv.Itoa(*node.IdleSessionCheckInterval) + "s"
		}
		if node.IdleSessionTimeout != nil {
			outbound["idle_session_timeout"] = strconv.Itoa(*node.IdleSessionTimeout) + "s"
		}
		if node.MinIdleSession != nil {
			outbound["min_idle_session"] = *node.MinIdleSession
		}
	case model.KindSnell:
		outbound["type"] = "snell"
		outbound["psk"] = node.Password
		outbound["version"] = 4
		if strings.EqualFold(node.Obfs, "http") {
			outbound["obfs_mode"] = "http"
			if node.ObfsParam != "" {
				outbound["obfs_host"] = node.ObfsParam
			}
		}
	case model.KindSOCKS5:
		outbound["type"] = "socks"
		outbound["version"] = "5"
		if node.Username != "" {
			outbound["username"] = node.Username
		}
		if node.Password != "" {
			outbound["password"] = node.Password
		}
	case model.KindHTTP:
		outbound["type"] = "http"
		if node.Username != "" {
			outbound["username"] = node.Username
		}
		if node.Password != "" {
			outbound["password"] = node.Password
		}
	default:
		return nil
	}

	if tls := singBoxTLS(node); tls != nil {
		outbound["tls"] = tls
	}
	if transport := singBoxTransport(node); transport != nil {
		outbound["transport"] = transport
	}
	return outbound
}

// singBoxTLS builds the TLS block for outbounds that carry one.
func singBoxTLS(node model.ProxyNode) map[string]any {
	switch node.Kind {
	case model.KindShadowsocks, model.KindSnell, model.KindWireGuard:
		return nil
	}
	alwaysSecure := node.Kind == model.KindTrojan || node.Kind == model.KindHysteria ||
		node.Kind == model.KindHysteria2 || node.Kind == model.KindTUIC || node.Kind == model.KindAnyTLS
	if !node.TLS && !alwaysSecure {
		return nil
	}

	tls := map[string]any{
		"enabled":     true,
		"server_name": firstNonEmpty(node.SNI, node.HostHeader, node.Server),
		"insecure":    node.SkipCertificateVerification,
	}
	if alpn := csv(node.ALPN); len(alpn) > 0 {
		tls["alpn"] = alpn
	}
	if node.UsesReality() {
		reality := map[string]any{"enabled": true, "public_key": node.RealityPublicKey}
		if node.RealityShortID != "" {
			reality["short_id"] = node.RealityShortID
		}
		tls["reality"] = reality
		tls["utls"] = map[string]any{"enabled": true, "fingerprint": firstNonEmpty(node.Fingerprint, "chrome")}
	}
	return tls
}

// singBoxTransport builds the V2Ray transport block for vmess/vless/trojan.
func singBoxTransport(node model.ProxyNode) map[string]any {
	switch node.Kind {
	case model.KindVMess, model.KindVLESS, model.KindTrojan:
	default:
		return nil
	}
	transport := node.Transport
	if transport == "" || transport == "tcp" {
		return nil
	}
	switch transport {
	case "ws":
		ws := map[string]any{"type": "ws"}
		if p := node.ExportablePath(); p != "" {
			ws["path"] = p
		}
		if h := exportableTransportHost(node); h != "" {
			ws["headers"] = map[string]any{"Host": h}
		}
		return ws
	case "grpc":
		grpc := map[string]any{"type": "grpc"}
		if node.Path != "" {
			grpc["service_name"] = strings.TrimPrefix(node.Path, "/")
		}
		return grpc
	case "h2", "http":
		http := map[string]any{"type": "http"}
		if p := node.ExportablePath(); p != "" {
			http["path"] = p
		}
		if node.HostHeader != "" {
			http["host"] = []string{node.HostHeader}
		}
		return http
	case "httpupgrade":
		up := map[string]any{"type": "httpupgrade"}
		if p := node.ExportablePath(); p != "" {
			up["path"] = p
		}
		if node.HostHeader != "" {
			up["host"] = node.HostHeader
		}
		return up
	}
	return nil
}

// singBoxVMessSecurity picks a concrete cipher; sing-box rejects "auto".
func singBoxVMessSecurity(node model.ProxyNode) string {
	accepted := map[string]bool{
		"auto": true, "none": true, "zero": true, "aes-128-gcm": true,
		"chacha20-poly1305": true, "aes-128-ctr": true,
	}
	cipher := strings.ToLower(node.Cipher)
	if accepted[cipher] && cipher != "auto" {
		return cipher
	}
	return "auto"
}
