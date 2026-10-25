// Package generator turns a node list into shareable subscription links.
//
// This file ports Tower's ProxyNodeShareLinkGenerator: every parsed node maps
// back to a URI link (vmess://, ss://, ssr://, vless://, trojan://, …). A
// node's original rawURI is reused verbatim when it is already a valid link;
// otherwise the canonical link is rebuilt from the parsed fields, exactly like
// the Swift implementation, so a node never loses its connection parameters
// on the parser→link round trip.
package generator

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net"
	"net/url"
	"strconv"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

// LinkResult pairs a node with its shareable URI link.
type LinkResult struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Kind string `json:"kind"`
	Link string `json:"link"`
}

// Links converts nodes to shareable subscription links, one per node. Metadata
// proxies and nodes whose protocol has no URI form are skipped.
func Links(nodes []model.ProxyNode) []LinkResult {
	out := make([]LinkResult, 0, len(nodes))
	for _, n := range nodes {
		if n.IsSubscriptionMetadata != nil && *n.IsSubscriptionMetadata {
			continue
		}
		if n.Kind == model.KindUnknown {
			continue
		}
		link := Link(n)
		if link == "" {
			continue
		}
		out = append(out, LinkResult{ID: n.ID, Name: displayName(n), Kind: string(n.Kind), Link: link})
	}
	return out
}

// Link returns the shareable link for one node.
func Link(node model.ProxyNode) string {
	original := strings.TrimSpace(node.RawURI)
	if node.Kind == model.KindShadowsocks && node.UDPRelayEnabled != nil {
		return canonicalLink(node)
	}
	if isReusable(original) && !needsInferredWebSocketHost(node) {
		return original
	}
	return canonicalLink(node)
}

// canonicalLink rebuilds a link from parsed fields, falling back to the
// original raw URI when the protocol has no richer form.
func canonicalLink(node model.ProxyNode) string {
	original := strings.TrimSpace(node.RawURI)

	var link string
	var ok bool
	switch node.Kind {
	case model.KindShadowsocks:
		link, ok = shadowsocksLink(node)
	case model.KindShadowsocksR:
		link, ok = shadowsocksRLink(node)
	case model.KindVMess:
		link, ok = vmessLink(node)
	case model.KindVLESS, model.KindTrojan, model.KindHysteria, model.KindHysteria2,
		model.KindTUIC, model.KindAnyTLS, model.KindSOCKS5, model.KindHTTP:
		link, ok = standardLink(node)
	case model.KindWireGuard:
		link, ok = wireGuardLink(node)
	case model.KindSnell:
		// Snell has no URI form, so share its portable Surge proxy line.
		if original == "" {
			return snellLine(node)
		}
		return original
	default:
		return original
	}
	if !ok || link == "" {
		return original
	}
	return link
}

func isReusable(uri string) bool {
	lower := strings.ToLower(uri)
	if strings.HasPrefix(lower, "clash://local/") {
		return false
	}
	for _, p := range []string{
		"ss://", "ssr://", "vmess://", "vless://", "trojan://",
		"hysteria2://", "hy2://", "hysteria://", "tuic://", "wireguard://", "wg://",
		"anytls://", "socks5://", "socks://", "http://", "https://",
	} {
		if strings.HasPrefix(lower, p) {
			return true
		}
	}
	return false
}

// needsInferredWebSocketHost reports whether Tower had to infer the narrow
// VLESS WebSocket Host fallback. In that case the raw URI must be rebuilt so a
// shared node receives the same repair as an exported subscription.
func needsInferredWebSocketHost(node model.ProxyNode) bool {
	return strings.TrimSpace(node.HostHeader) == "" && shareTransportHost(node) != ""
}

func shadowsocksLink(node model.ProxyNode) (string, bool) {
	if node.Cipher == "" || node.Password == "" {
		return "", false
	}
	auth := base64URLEncode([]byte(node.Cipher + ":" + node.Password))
	var b strings.Builder
	b.WriteString("ss://")
	b.WriteString(auth)
	b.WriteString("@")
	b.WriteString(formattedHost(node.Server))
	b.WriteString(":")
	b.WriteString(strconv.Itoa(node.Port))

	// Dropping the plugin would hand out a link that looks fine and cannot
	// connect, which is exactly what the importer refuses to accept.
	if node.Plugin == "v2ray-plugin" {
		plugin := "v2ray-plugin;mode=websocket"
		if node.PluginMux != nil {
			mux := "0"
			if *node.PluginMux {
				mux = "1"
			}
			plugin += ";mux=" + mux
		}
		if node.TLS {
			plugin += ";tls"
		}
		if node.HostHeader != "" {
			plugin += ";host=" + node.HostHeader
		}
		if p := node.ExportablePath(); p != "" {
			plugin += ";path=" + p
		}
		b.WriteString("?plugin=" + percentEncode(plugin, "-._~"))
	} else if mode := strings.ToLower(node.Obfs); mode == "http" || mode == "tls" {
		plugin := "obfs-local;obfs=" + mode
		if node.ObfsParam != "" {
			plugin += ";obfs-host=" + node.ObfsParam
		}
		b.WriteString("?plugin=" + percentEncode(plugin, "-._~"))
	}
	if node.UDPRelayEnabled != nil {
		separator := "?"
		if strings.Contains(b.String(), "?") {
			separator = "&"
		}
		b.WriteString(separator + "udp-relay=" + strconv.FormatBool(*node.UDPRelayEnabled))
	}
	if node.Name != "" {
		b.WriteString("#" + escapeFragment(node.Name))
	}
	return b.String(), true
}

func shadowsocksRLink(node model.ProxyNode) (string, bool) {
	if node.Cipher == "" || node.Password == "" || node.ProtocolName == "" || node.Obfs == "" {
		return "", false
	}
	encodedPassword := base64URLEncode([]byte(node.Password))
	query := "remarks=" + base64URLEncode([]byte(node.Name))
	if node.ProtocolParam != "" {
		query += "&protoparam=" + base64URLEncode([]byte(node.ProtocolParam))
	}
	if node.ObfsParam != "" {
		query += "&obfsparam=" + base64URLEncode([]byte(node.ObfsParam))
	}
	payload := formattedHost(node.Server) + ":" + strconv.Itoa(node.Port) + ":" + node.ProtocolName + ":" +
		node.Cipher + ":" + node.Obfs + ":" + encodedPassword + "/?" + query
	return "ssr://" + base64URLEncode([]byte(payload)), true
}

func vmessLink(node model.ProxyNode) (string, bool) {
	if node.UUID == "" {
		return "", false
	}
	aid := 0
	if node.AlterID != nil {
		aid = *node.AlterID
	}
	cipher := node.Cipher
	if cipher == "" {
		cipher = "auto"
	}
	transport := node.Transport
	if transport == "" {
		transport = "tcp"
	}
	tlsValue := ""
	if node.TLS {
		tlsValue = "tls"
	}
	obj := map[string]any{
		"v":    "2",
		"ps":   node.Name,
		"add":  node.Server,
		"port": strconv.Itoa(node.Port),
		"id":   node.UUID,
		"aid":  strconv.Itoa(aid),
		"scy":  cipher,
		"net":  transport,
		"type": "none",
		"tls":  tlsValue,
	}
	if node.SNI != "" {
		obj["sni"] = node.SNI
	}
	if h := shareTransportHost(node); h != "" {
		obj["host"] = h
	}
	if node.Path != "" {
		obj["path"] = node.Path
	}
	if a := linkALPN(node.ALPN); a != "" {
		obj["alpn"] = a
	}
	if node.SkipCertificateVerification {
		obj["allowInsecure"] = true
	}
	data, err := marshalJSON(obj)
	if err != nil {
		return "", false
	}
	return "vmess://" + base64.StdEncoding.EncodeToString(data), true
}

func standardLink(node model.ProxyNode) (string, bool) {
	scheme := standardScheme(node.Kind, node.TLS)
	if scheme == "" {
		return "", false
	}

	var b strings.Builder
	b.WriteString(scheme)
	b.WriteString("://")
	if user := standardUserinfo(node); user != "" {
		b.WriteString(user)
		b.WriteString("@")
	}
	b.WriteString(formattedHost(node.Server))
	b.WriteString(":")
	if node.Kind == model.KindHysteria2 && node.PortHopping != "" {
		b.WriteString(node.PortHopping)
	} else {
		b.WriteString(strconv.Itoa(node.Port))
	}
	if q := buildStandardQuery(node); q != "" {
		b.WriteString("?")
		b.WriteString(q)
	}
	if node.Name != "" {
		b.WriteString("#" + escapeFragment(node.Name))
	}
	return b.String(), true
}

func standardScheme(kind model.ProxyKind, tls bool) string {
	switch kind {
	case model.KindVLESS:
		return "vless"
	case model.KindTrojan:
		return "trojan"
	case model.KindHysteria2:
		return "hysteria2"
	case model.KindHysteria:
		return "hysteria"
	case model.KindTUIC:
		return "tuic"
	case model.KindAnyTLS:
		return "anytls"
	case model.KindSOCKS5:
		return "socks5"
	case model.KindHTTP:
		if tls {
			return "https"
		}
		return "http"
	default:
		return ""
	}
}

func standardUserinfo(node model.ProxyNode) string {
	switch node.Kind {
	case model.KindVLESS:
		if node.UUID != "" {
			return url.User(node.UUID).String()
		}
	case model.KindTUIC:
		if node.UUID != "" {
			if node.Password != "" {
				return url.UserPassword(node.UUID, node.Password).String()
			}
			return url.User(node.UUID).String()
		}
	case model.KindTrojan, model.KindHysteria, model.KindHysteria2, model.KindAnyTLS:
		if node.Password != "" {
			return url.User(node.Password).String()
		}
	case model.KindSOCKS5, model.KindHTTP:
		if node.Username != "" {
			if node.Password != "" {
				return url.UserPassword(node.Username, node.Password).String()
			}
			return url.User(node.Username).String()
		}
	}
	return ""
}

func buildStandardQuery(node model.ProxyNode) string {
	var items []string
	add := func(key, value string) {
		items = append(items, key+"="+escapeQueryValue(value))
	}

	if node.Transport != "" {
		add("type", node.Transport)
	}
	if node.Transport == "xhttp" && node.TransportMode != "" {
		add("mode", node.TransportMode)
	}

	if node.UsesReality() {
		add("security", "reality")
		add("pbk", node.RealityPublicKey)
		if node.RealityShortID != "" {
			add("sid", node.RealityShortID)
		}
		if node.Fingerprint != "" {
			add("fp", node.Fingerprint)
		}
		if node.Flow != "" {
			add("flow", node.Flow)
		}
	} else if node.TLS && !isImplicitTLS(node.Kind) {
		add("security", "tls")
	}

	// URI producers (including Sub-Store) use `fp` for ordinary uTLS
	// fingerprints too, not only REALITY.
	if !node.UsesReality() && isFingerprintKind(node.Kind) && node.Fingerprint != "" {
		add("fp", node.Fingerprint)
	}
	// Shadowrocket/Sub-Store's VLESS URI dialect keeps the server certificate
	// pin in `pcs`, independently from the uTLS `fp` value.
	if node.Kind == model.KindVLESS && node.CertificateFingerprint != "" {
		add("pcs", node.CertificateFingerprint)
	}
	if node.SNI != "" {
		add("sni", node.SNI)
	}
	if h := shareTransportHost(node); h != "" {
		add("host", h)
	}
	if node.Path != "" {
		key := "path"
		if node.Transport == "grpc" {
			key = "serviceName"
		}
		add(key, node.Path)
	}
	if a := linkALPN(node.ALPN); a != "" {
		add("alpn", a)
	}

	if node.Kind == model.KindHysteria2 {
		if obfs := strings.ToLower(node.Obfs); obfs != "" && obfs != "none" {
			add("obfs", obfs)
			if node.ObfsParam != "" {
				add("obfs-password", node.ObfsParam)
			}
		}
	}
	if (node.Kind == model.KindHysteria2 || node.Kind == model.KindTrojan) && node.CertificateFingerprint != "" {
		add("pinSHA256", node.CertificateFingerprint)
	}

	if node.Kind == model.KindHysteria {
		if node.ProtocolName != "" {
			add("protocol", node.ProtocolName)
		}
		if obfs := strings.ToLower(node.Obfs); obfs != "" && obfs != "none" {
			add("obfs", obfs)
		}
		if node.UpMbps != nil {
			add("upmbps", strconv.Itoa(*node.UpMbps))
		}
		if node.DownMbps != nil {
			add("downmbps", strconv.Itoa(*node.DownMbps))
		}
	}

	if node.Kind == model.KindTUIC {
		if node.CongestionControl != "" {
			add("congestion_control", node.CongestionControl)
		}
		if node.UDPRelayMode != "" {
			add("udp_relay_mode", node.UDPRelayMode)
		}
		if node.Fingerprint != "" {
			add("client_fingerprint", node.Fingerprint)
		}
		if node.PortHopping != "" {
			add("ports", node.PortHopping)
		}
	}

	if node.Kind == model.KindAnyTLS {
		if node.IdleSessionCheckInterval != nil {
			add("idle-session-check-interval", strconv.Itoa(*node.IdleSessionCheckInterval))
		}
		if node.IdleSessionTimeout != nil {
			add("idle-session-timeout", strconv.Itoa(*node.IdleSessionTimeout))
		}
		if node.MinIdleSession != nil {
			add("min-idle-session", strconv.Itoa(*node.MinIdleSession))
		}
	}

	if node.SkipCertificateVerification {
		key := "allowInsecure"
		if node.Kind == model.KindHysteria || node.Kind == model.KindHysteria2 || node.Kind == model.KindAnyTLS {
			key = "insecure"
		} else if node.Kind == model.KindTUIC {
			key = "allow_insecure"
		}
		add(key, "1")
	}

	return strings.Join(items, "&")
}

func wireGuardLink(node model.ProxyNode) (string, bool) {
	if node.WireGuardPrivateKey == "" || node.WireGuardPublicKey == "" {
		return "", false
	}
	var addresses []string
	if node.WireGuardIPv4 != "" {
		addresses = append(addresses, node.WireGuardIPv4)
	}
	if node.WireGuardIPv6 != "" {
		addresses = append(addresses, node.WireGuardIPv6)
	}
	allowedIPs := node.WireGuardAllowedIPs
	if allowedIPs == "" {
		allowedIPs = "0.0.0.0/0,::/0"
	}

	items := []string{
		"publickey=" + escapeQueryValue(node.WireGuardPublicKey),
		"address=" + escapeQueryValue(strings.Join(addresses, ",")),
		"allowedips=" + escapeQueryValue(allowedIPs),
	}
	if node.WireGuardReserved != "" {
		items = append(items, "reserved="+escapeQueryValue(node.WireGuardReserved))
	}
	if node.WireGuardMTU != nil {
		items = append(items, "mtu="+strconv.Itoa(*node.WireGuardMTU))
	}
	if node.WireGuardPersistentKeepalive != nil {
		items = append(items, "keepalive="+strconv.Itoa(*node.WireGuardPersistentKeepalive))
	}
	if node.WireGuardPreSharedKey != "" {
		items = append(items, "presharedkey="+escapeQueryValue(node.WireGuardPreSharedKey))
	}
	if node.WireGuardDNS != "" {
		items = append(items, "dns="+escapeQueryValue(node.WireGuardDNS))
	}

	var b strings.Builder
	b.WriteString("wireguard://")
	b.WriteString(url.User(node.WireGuardPrivateKey).String())
	b.WriteString("@")
	b.WriteString(formattedHost(node.Server))
	b.WriteString(":")
	b.WriteString(strconv.Itoa(node.Port))
	b.WriteString("?")
	b.WriteString(strings.Join(items, "&"))
	if node.Name != "" {
		b.WriteString("#" + escapeFragment(node.Name))
	}
	return b.String(), true
}

func snellLine(node model.ProxyNode) string {
	version := 4
	if node.Version != nil {
		version = *node.Version
	}
	parts := []string{
		node.Name + " = snell",
		node.Server,
		strconv.Itoa(node.Port),
		"psk=" + node.Password,
		"version=" + strconv.Itoa(version),
	}
	if mode := strings.ToLower(node.Obfs); mode != "" && mode != "none" {
		parts = append(parts, "obfs="+mode)
		if node.ObfsParam != "" {
			parts = append(parts, "obfs-host="+node.ObfsParam)
		}
	}
	return strings.Join(parts, ", ")
}

// shareTransportHost mirrors Tower's exportableTransportHost: the explicit
// Host header, or the inferred VLESS WebSocket host when the server is an IP
// address and the SNI is a DNS name.
func shareTransportHost(node model.ProxyNode) string {
	if explicit := strings.TrimSpace(node.HostHeader); explicit != "" {
		return explicit
	}
	if node.Kind != model.KindVLESS || node.UsesReality() ||
		strings.ToLower(node.Transport) != "ws" || !node.TLS ||
		!isIPAddress(node.Server) {
		return ""
	}
	sni := strings.TrimSpace(node.SNI)
	if isDNSHost(sni) {
		return sni
	}
	return ""
}

func isImplicitTLS(kind model.ProxyKind) bool {
	switch kind {
	case model.KindTrojan, model.KindHysteria, model.KindHysteria2, model.KindTUIC, model.KindAnyTLS, model.KindHTTP:
		return true
	default:
		return false
	}
}

func isFingerprintKind(kind model.ProxyKind) bool {
	return kind == model.KindVLESS || kind == model.KindTrojan || kind == model.KindAnyTLS
}

func formattedHost(host string) string {
	if strings.Contains(host, ":") && !strings.HasPrefix(host, "[") {
		return "[" + host + "]"
	}
	return host
}

func isIPAddress(value string) bool {
	trimmed := strings.Trim(value, "[] \t\r\n")
	return net.ParseIP(trimmed) != nil
}

func isDNSHost(value string) bool {
	if value == "" || !strings.Contains(value, ".") || strings.HasPrefix(value, "*.") ||
		strings.ContainsAny(value, " \t\r\n/") || strings.Contains(value, ":") {
		return false
	}
	return !isIPAddress(value)
}

// linkALPN re-normalizes a stored ALPN list the same way Swift's ALPNList does:
// strip brackets/quotes and re-join with commas.
func linkALPN(raw string) string {
	var parts []string
	for _, v := range strings.Split(raw, ",") {
		v = strings.Trim(strings.TrimSpace(v), "[] \t\r\n\"'")
		if v != "" {
			parts = append(parts, v)
		}
	}
	return strings.Join(parts, ",")
}

func base64URLEncode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func marshalJSON(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// percentEncode encodes every byte outside [A-Za-z0-9] and the allowed set.
func percentEncode(value, allowed string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(value); i++ {
		c := value[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
			strings.IndexByte(allowed, c) >= 0 {
			b.WriteByte(c)
		} else {
			b.WriteByte('%')
			b.WriteByte(hex[c>>4])
			b.WriteByte(hex[c&0x0F])
		}
	}
	return b.String()
}

// escapeFragment percent-encodes a URI fragment (node name) like Swift's
// urlFragmentAllowed: unreserved + sub-delims + :@/? stay, the rest is encoded.
func escapeFragment(value string) string {
	return percentEncode(value, "-._~!$&'()*+,;=:@/?")
}

// escapeQueryValue percent-encodes a query value like Swift's URLComponents.
func escapeQueryValue(value string) string {
	return percentEncode(value, "-._~!$&'()*+,;=:@/?")
}
