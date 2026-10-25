// Package parser turns raw subscription payloads into a normalized node list.
//
// It ports the Swift SubscriptionParser: Base64 node lists, per-line URI lists,
// Clash YAML proxies blocks, and Surge/Shadowrocket INI [Proxy] sections are all
// detected and reduced to []model.ProxyNode.
package parser

import (
	"encoding/base64"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/kenzok8/tower/internal/model"
)

// ParsedContent is the result of parsing one subscription payload.
type ParsedContent struct {
	Nodes             []model.ProxyNode
	RejectedLineCount int
	Notices           []string
	Status            *model.SubscriptionUsage
}

// noticeKeywords marks announcement entries smuggled into node lists (quota,
// expiry, support contacts) so they never become unusable "nodes".
var noticeKeywords = []string{
	"剩余流量", "已用流量", "总流量", "流量重置", "距离下次重置", "重置剩余",
	"套餐到期", "到期时间", "过期时间", "有效期至", "账户余额",
	"官网", "续费", "客服", "邮箱", "订阅地址", "机场地址",
	"expire", "expires", "traffic", "remaining", "reset",
}

// placeholderHosts are hosts an airport parks announcement entries on.
var placeholderHosts = map[string]struct{}{
	"8.8.8.8": {}, "8.8.4.4": {}, "1.1.1.1": {}, "1.0.0.1": {},
	"223.5.5.5": {}, "127.0.0.1": {}, "0.0.0.0": {}, "localhost": {}, "example.com": {},
}

// Parse decodes the raw payload and returns the parsed node list.
func Parse(data []byte, sourceID string) ParsedContent {
	text := strings.TrimSpace(string(data))
	if text == "" {
		return ParsedContent{RejectedLineCount: 1}
	}

	if !containsNodeScheme(text) {
		if decoded := decodeBase64String(text); decoded != "" && containsNodeScheme(decoded) {
			text = decoded
		}
	}

	var nodes []model.ProxyNode
	rejected := 0
	var status *model.SubscriptionUsage

	if containsSurgeProxySection(text) {
		p := parseSurgeConfiguration(text, sourceID)
		nodes, rejected = p.Nodes, p.RejectedLineCount
	} else if strings.Contains(text, "proxies:") {
		p := parseClashYAML(text, sourceID)
		nodes, rejected = p.Nodes, p.RejectedLineCount
	} else {
		// Per-line URI list. Some producers put several space-separated URIs on
		// one line; split those while keeping single URIs intact.
		var candidates []string
		for _, line := range strings.Split(text, "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "#") {
				continue
			}
			if strings.Contains(trimmed, " ") && strings.Count(trimmed, ":") > 1 {
				for _, part := range strings.Fields(trimmed) {
					if containsNodeScheme(part) {
						candidates = append(candidates, part)
					}
				}
				continue
			}
			candidates = append(candidates, trimmed)
		}
		for _, c := range candidates {
			if strings.HasPrefix(c, "STATUS=") {
				if status == nil {
					status = parseStatusLine(c)
				}
				continue
			}
			if n := ParseURI(c, sourceID); n != nil {
				nodes = append(nodes, *n)
			} else {
				rejected++
			}
		}
	}

	nodes = finalize(nodes)
	notices := collectNotices(nodes)
	if status == nil {
		for _, n := range notices {
			if s := parseStatusLine(n); s != nil {
				status = s
				break
			}
		}
	}
	return ParsedContent{
		Nodes:             UsableNodes(nodes),
		RejectedLineCount: rejected,
		Notices:           notices,
		Status:            status,
	}
}

// UsableNodes excludes announcement entries from new parses and stored state.
func UsableNodes(nodes []model.ProxyNode) []model.ProxyNode {
	out := make([]model.ProxyNode, 0, len(nodes))
	for _, n := range nodes {
		if n.IsSubscriptionMetadata != nil && *n.IsSubscriptionMetadata || IsNoticeName(n.Name) {
			continue
		}
		out = append(out, n)
	}
	return out
}

// finalize assigns stable IDs, flags announcement metadata, and de-duplicates.
func finalize(nodes []model.ProxyNode) []model.ProxyNode {
	for i := range nodes {
		if nodes[i].ID == "" {
			nodes[i].ID = model.NewID()
		}
	}
	return deduplicate(markMetadata(nodes))
}

// markMetadata flags announcement entries so the UI can hide them.
func markMetadata(nodes []model.ProxyNode) []model.ProxyNode {
	for i := range nodes {
		marked := IsNotice(nodes[i])
		if marked {
			nodes[i].IsSubscriptionMetadata = &marked
		}
	}
	return nodes
}

func collectNotices(nodes []model.ProxyNode) []string {
	var out []string
	for _, n := range nodes {
		if n.IsSubscriptionMetadata != nil && *n.IsSubscriptionMetadata {
			out = append(out, n.Name)
		}
	}
	return out
}

// IsNotice reports whether a node is actually an announcement entry.
func IsNotice(n model.ProxyNode) bool {
	return IsNoticeName(n.Name) || isPlaceholderHost(n.Server)
}

// IsNoticeName reports whether a name is an announcement keyword.
func IsNoticeName(name string) bool {
	lower := strings.ToLower(name)
	for _, k := range noticeKeywords {
		if strings.Contains(lower, strings.ToLower(k)) {
			return true
		}
	}
	return false
}

func isPlaceholderHost(host string) bool {
	_, ok := placeholderHosts[strings.ToLower(host)]
	return ok
}

// deduplicate collapses exact repeated nodes, keeping the first occurrence.
// Metadata entries are keyed separately so two distinct announcements survive.
func deduplicate(nodes []model.ProxyNode) []model.ProxyNode {
	seen := make(map[string]struct{})
	out := make([]model.ProxyNode, 0, len(nodes))
	for _, n := range nodes {
		key := canonicalKey(n)
		if n.IsSubscriptionMetadata != nil && *n.IsSubscriptionMetadata {
			key += "|metadata|" + strings.ToLower(n.Name)
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, n)
	}
	return out
}

// canonicalKey is the complete parsed identity of a node, matching the Swift
// ProxyNode.canonicalKey so only exact duplicates collapse.
func canonicalKey(n model.ProxyNode) string {
	fields := []string{
		string(n.Kind), n.Name, strings.ToLower(n.Server), itoa(n.Port),
		n.Cipher, n.Password, n.UUID, n.Username,
		n.Transport, n.TransportMode, n.Plugin, boolStr(n.TLS),
		n.SNI, n.HostHeader, n.Path, n.ALPN,
		n.RealityPublicKey, n.RealityShortID, n.Fingerprint, n.Flow,
		boolStr(n.SkipCertificateVerification),
		intOrEmpty(n.AlterID), n.ProtocolName, n.ProtocolParam, n.Obfs, n.ObfsParam,
		intOrEmpty(n.IdleSessionCheckInterval), intOrEmpty(n.IdleSessionTimeout),
		intOrEmpty(n.MinIdleSession), intOrEmpty(n.Version),
		n.CongestionControl, n.UDPRelayMode,
		boolPtrString(n.UDPRelayEnabled), n.PortHopping,
		intOrEmpty(n.UpMbps), intOrEmpty(n.DownMbps),
		n.WireGuardPrivateKey, n.WireGuardPublicKey, n.WireGuardPreSharedKey,
		n.WireGuardIPv4, n.WireGuardIPv6, n.WireGuardAllowedIPs, n.WireGuardReserved,
		intOrEmpty(n.WireGuardMTU), intOrEmpty(n.WireGuardPersistentKeepalive), n.WireGuardDNS,
	}
	return strings.Join(fields, "\x1f")
}

// --- shared helpers ---

// containsNodeScheme reports whether the text mentions any proxy URI scheme.
func containsNodeScheme(value string) bool {
	lower := strings.ToLower(value)
	schemes := []string{
		"ss://", "ssr://", "vmess://", "vless://", "trojan://",
		"hysteria2://", "hy2://", "hysteria://", "tuic://", "wireguard://", "wg://",
		"anytls://", "socks5://", "socks://", "http://", "https://",
	}
	for _, s := range schemes {
		if strings.Contains(lower, s) {
			return true
		}
	}
	return false
}

func containsSurgeProxySection(text string) bool {
	for _, line := range strings.Split(text, "\n") {
		if strings.EqualFold(strings.TrimSpace(line), "[Proxy]") {
			return true
		}
	}
	return false
}

// decodeBase64String decodes standard, URL-safe, padded and unpadded Base64,
// ignoring embedded whitespace. Returns "" when decoding fails.
func decodeBase64String(value string) string {
	normalized := strings.NewReplacer("-", "+", "_", "/").Replace(value)
	normalized = strings.Map(func(r rune) rune {
		if r == ' ' || r == '\t' || r == '\n' || r == '\r' {
			return -1
		}
		return r
	}, normalized)
	if normalized == "" {
		return ""
	}
	if rem := len(normalized) % 4; rem != 0 {
		normalized += strings.Repeat("=", 4-rem)
	}
	for _, enc := range []*base64.Encoding{base64.StdEncoding, base64.RawStdEncoding} {
		if b, err := enc.DecodeString(normalized); err == nil && utf8.Valid(b) {
			return string(b)
		}
	}
	return ""
}

// queryDictionary parses a query string, keeping the last occurrence of a key.
func queryDictionary(query string) map[string]string {
	out := map[string]string{}
	for _, item := range strings.Split(query, "&") {
		pair := strings.SplitN(item, "=", 2)
		if len(pair) != 2 {
			continue
		}
		out[pair[0]] = pair[1]
	}
	return out
}

// queryDictionaryLower lowercases every key.
func queryDictionaryLower(query string) map[string]string {
	out := map[string]string{}
	for k, v := range queryDictionary(query) {
		out[strings.ToLower(k)] = v
	}
	return out
}

// normalizedHost strips brackets around an IPv6 literal.
func normalizedHost(value string) string {
	t := strings.TrimSpace(value)
	if strings.HasPrefix(t, "[") && strings.HasSuffix(t, "]") && len(t) > 2 {
		return t[1 : len(t)-1]
	}
	return t
}

// normalizedName converts form-style `+` to space and trims, falling back when
// the result is empty.
func normalizedName(value, fallback string) string {
	t := strings.TrimSpace(strings.ReplaceAll(value, "+", " "))
	if t == "" {
		return fallback
	}
	return t
}

// normalizedTransport maps transport spellings to the canonical form.
func normalizedTransport(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	switch v {
	case "", "tcp", "none":
		return ""
	case "websocket", "ws":
		return "ws"
	case "http2":
		return "h2"
	case "http-upgrade", "httpupgrade":
		return "httpupgrade"
	case "splithttp":
		return "xhttp"
	default:
		return v
	}
}

// normalizedVMessTransport is the VMess variant of transport normalization.
func normalizedVMessTransport(value string) string {
	v := strings.ToLower(strings.TrimSpace(value))
	switch v {
	case "", "none":
		return ""
	case "websocket", "ws":
		return "ws"
	case "http2":
		return "h2"
	case "http-upgrade", "httpupgrade":
		return "httpupgrade"
	case "splithttp":
		return "xhttp"
	default:
		return v
	}
}

func boolString(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes", "tls":
		return true
	}
	return false
}

func boolPtrString(value *bool) string {
	if value == nil {
		return ""
	}
	return strconv.FormatBool(*value)
}

func udpRelayPreference(value string) (*bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes":
		v := true
		return &v, true
	case "false", "0", "no":
		v := false
		return &v, true
	default:
		return nil, false
	}
}

func mbps(value string) *int {
	digits := ""
	for _, r := range value {
		if r >= '0' && r <= '9' {
			digits += string(r)
		} else {
			break
		}
	}
	if digits == "" {
		return nil
	}
	n := 0
	for _, r := range digits {
		n = n*10 + int(r-'0')
	}
	if n <= 0 {
		return nil
	}
	return &n
}

func csvValues(value string) []string {
	t := strings.Trim(value, "[] \t\r\n\"'")
	var out []string
	for _, part := range strings.Split(t, ",") {
		p := strings.TrimSpace(strings.Trim(part, " \t\r\n\"'"))
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// proxyNameQueryValue reads a node name from the common query keys, trying
// canonical Base64 only when the value looks like Base64.
func proxyNameQueryValue(query map[string]string) string {
	for _, key := range []string{"remarks", "remark", "name", "ps", "tag"} {
		if v, ok := query[key]; ok {
			if d := decodedProxyName(v, true); d != "" {
				return d
			}
		}
	}
	return ""
}

func decodedProxyName(value string, mayBeBase64 bool) string {
	decoded := percentDecode(value)
	trimmed := strings.TrimSpace(decoded)
	if trimmed == "" {
		return ""
	}
	if !mayBeBase64 || strings.ContainsAny(trimmed, " \t\r\n") ||
		!isBase64Alphabet(trimmed) {
		return trimmed
	}
	source := strings.NewReplacer("-", "+", "_", "/").Replace(trimmed)
	padded := source
	if rem := len(padded) % 4; rem != 0 {
		padded += strings.Repeat("=", 4-rem)
	}
	b, err := base64.StdEncoding.DecodeString(padded)
	if err != nil {
		return trimmed
	}
	canonicalSource := strings.TrimRight(source, "=")
	canonicalRoundTrip := strings.TrimRight(base64.StdEncoding.EncodeToString(b), "=")
	if canonicalRoundTrip != canonicalSource {
		return trimmed
	}
	name := strings.TrimSpace(string(b))
	if name == "" {
		return trimmed
	}
	return name
}

func isBase64Alphabet(s string) bool {
	for _, r := range s {
		if !strings.ContainsRune("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_=", r) {
			return false
		}
	}
	return true
}

func percentDecode(s string) string {
	if d, err := url.QueryUnescape(s); err == nil {
		return d
	}
	return s
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

func intOrEmpty(n *int) string {
	if n == nil {
		return ""
	}
	return itoa(*n)
}

func boolStr(b bool) string {
	if b {
		return "1"
	}
	return "0"
}

// parseStatusLine reads a `STATUS=` style quota line.
func parseStatusLine(line string) *model.SubscriptionUsage {
	// Minimal implementation: the header form is handled by the HTTP layer.
	// STATUS lines are rare; parse what the ecosystem emits (raw text) as nil
	// for now — full parsing lands with the fetch layer.
	return nil
}
