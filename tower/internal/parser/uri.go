package parser

import (
	"encoding/base64"
	"encoding/json"
	"net"
	"net/url"
	"strconv"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

// ParseURI parses a single proxy share link into a node, or returns nil.
func ParseURI(raw string, sourceID string) *model.ProxyNode {
	value := strings.TrimSpace(raw)
	lower := strings.ToLower(value)

	if snell := parseSnellLine(value, sourceID); snell != nil {
		return snell
	}
	switch {
	case strings.HasPrefix(lower, "ss://"):
		return parseShadowsocks(value, sourceID)
	case strings.HasPrefix(lower, "ssr://"):
		return parseShadowsocksR(value, sourceID)
	case strings.HasPrefix(lower, "vmess://"):
		return parseVMess(value, sourceID)
	case strings.HasPrefix(lower, "vless://"):
		if n := parseStandardURL(value, model.KindVLESS, sourceID); n != nil {
			return n
		}
		return parseLegacyVLESS(value, sourceID)
	case strings.HasPrefix(lower, "trojan://"):
		return parseStandardURL(value, model.KindTrojan, sourceID)
	case strings.HasPrefix(lower, "anytls://"):
		return parseStandardURL(value, model.KindAnyTLS, sourceID)
	case strings.HasPrefix(lower, "hysteria2://") || strings.HasPrefix(lower, "hy2://"):
		return parseStandardURL(value, model.KindHysteria2, sourceID)
	case strings.HasPrefix(lower, "hysteria://") || strings.HasPrefix(lower, "hy://"):
		return parseStandardURL(value, model.KindHysteria, sourceID)
	case strings.HasPrefix(lower, "tuic://"):
		return parseStandardURL(value, model.KindTUIC, sourceID)
	case strings.HasPrefix(lower, "wireguard://") || strings.HasPrefix(lower, "wg://"):
		return parseWireGuardURL(value, sourceID)
	case strings.HasPrefix(lower, "socks5://") || strings.HasPrefix(lower, "socks://"):
		return parseStandardURL(value, model.KindSOCKS5, sourceID)
	case strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://"):
		if n := parseShadowrocketHTTPURL(value, sourceID); n != nil {
			return n
		}
		return parseStandardURL(value, model.KindHTTP, sourceID)
	}
	return nil
}

// parseShadowsocks handles `ss://` links (SIP002 and legacy Base64 forms).
func parseShadowsocks(raw, sourceID string) *model.ProxyNode {
	fragmentSplit := strings.SplitN(raw, "#", 2)
	name := "Shadowsocks"
	if len(fragmentSplit) > 1 {
		name = percentDecode(fragmentSplit[1])
	}

	payload := fragmentSplit[0]
	if len(payload) >= 5 && strings.EqualFold(payload[:5], "ss://") {
		payload = payload[5:]
	}

	var obfsMode, obfsHost, sip003Plugin, pluginTransport, pluginPath string
	var pluginTLS bool
	var pluginMux *bool
	var udpRelayEnabled *bool

	if qi := strings.IndexByte(payload, '?'); qi >= 0 {
		query := payload[qi+1:]
		params := queryDictionary(query)
		if value, present := params["udp-relay"]; present {
			var ok bool
			udpRelayEnabled, ok = udpRelayPreference(value)
			if !ok {
				return nil
			}
		} else if value, present := params["udp"]; present {
			var ok bool
			udpRelayEnabled, ok = udpRelayPreference(value)
			if !ok {
				return nil
			}
		}
		if plugin := percentDecode(params["plugin"]); plugin != "" {
			if mode, host := simpleObfsOptions(plugin); mode != "" {
				obfsMode = mode
				obfsHost = host
			} else if opts := v2rayPluginOptions(plugin); opts != nil {
				sip003Plugin = "v2ray-plugin"
				pluginTransport = opts.transport
				obfsHost = opts.host
				pluginPath = opts.path
				pluginTLS = opts.tls
				pluginMux = opts.mux
			} else {
				return nil
			}
		}
		payload = payload[:qi]
	}

	var auth, endpoint string
	if ai := strings.LastIndexByte(payload, '@'); ai >= 0 {
		encodedAuth := payload[:ai]
		auth = decodeBase64String(encodedAuth)
		if auth == "" {
			auth = percentDecode(encodedAuth)
		}
		endpoint = payload[ai+1:]
	} else if decoded := decodeBase64String(payload); decoded != "" {
		if ai := strings.LastIndexByte(decoded, '@'); ai >= 0 {
			auth = decoded[:ai]
			endpoint = decoded[ai+1:]
		}
	}
	if auth == "" || endpoint == "" {
		return nil
	}

	sep := strings.IndexByte(auth, ':')
	if sep < 0 {
		return nil
	}
	method := auth[:sep]
	password := auth[sep+1:]

	host, port := parseEndpoint(endpoint)
	if host == "" {
		return nil
	}

	obfsParam := obfsHost
	if sip003Plugin != "" {
		obfsParam = ""
	}
	return &model.ProxyNode{
		SourceID:        sourceID,
		Kind:            model.KindShadowsocks,
		Name:            normalizedName(name, host),
		Server:          host,
		Port:            port,
		Cipher:          method,
		Password:        password,
		Transport:       pluginTransport,
		Plugin:          sip003Plugin,
		PluginMux:       pluginMux,
		TLS:             pluginTLS,
		HostHeader:      obfsHost,
		Path:            pluginPath,
		Obfs:            obfsMode,
		ObfsParam:       obfsParam,
		UDPRelayEnabled: udpRelayEnabled,
		RawURI:          raw,
	}
}

func simpleObfsOptions(plugin string) (mode, host string) {
	parts := strings.Split(plugin, ";")
	if len(parts) == 0 {
		return "", ""
	}
	name := strings.ToLower(strings.TrimSpace(parts[0]))
	if name != "obfs" && name != "obfs-local" && name != "simple-obfs" {
		return "", ""
	}
	mode = "http"
	for _, part := range parts[1:] {
		pair := strings.SplitN(part, "=", 2)
		if len(pair) != 2 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(pair[0]))
		val := strings.TrimSpace(pair[1])
		switch key {
		case "obfs", "mode":
			mode = val
		case "obfs-host", "host":
			host = val
		}
	}
	return mode, host
}

type v2rayPluginOpts struct {
	transport, host, path string
	tls                   bool
	mux                   *bool
}

func v2rayPluginOptions(plugin string) *v2rayPluginOpts {
	parts := strings.Split(plugin, ";")
	if len(parts) == 0 || strings.ToLower(strings.TrimSpace(parts[0])) != "v2ray-plugin" {
		return nil
	}
	opts := &v2rayPluginOpts{transport: "websocket"}
	for _, part := range parts[1:] {
		pair := strings.SplitN(part, "=", 2)
		key := strings.ToLower(strings.TrimSpace(pair[0]))
		if len(pair) == 1 {
			if key == "tls" {
				opts.tls = true
			}
			continue
		}
		val := strings.TrimSpace(pair[1])
		switch key {
		case "mode", "obfs":
			opts.transport = val
		case "host", "obfs-host":
			opts.host = val
		case "path":
			opts.path = val
		case "tls":
			b := boolString(val)
			opts.tls = b
		case "mux":
			b := boolString(val)
			opts.mux = &b
		}
	}
	if t := strings.ToLower(opts.transport); t != "websocket" && t != "ws" {
		return nil
	}
	opts.transport = "ws"
	return opts
}

// parseShadowsocksR handles `ssr://` links.
func parseShadowsocksR(raw, sourceID string) *model.ProxyNode {
	encoded := strings.TrimPrefix(raw, "ssr://")
	decoded := decodeBase64String(encoded)
	if decoded == "" {
		return nil
	}
	sections := strings.SplitN(decoded, "/?", 2)
	main := make([]string, 6)
	remaining := sections[0]
	for i := 5; i > 0; i-- {
		sep := strings.LastIndexByte(remaining, ':')
		if sep < 0 {
			return nil
		}
		main[i], remaining = remaining[sep+1:], remaining[:sep]
	}
	host := remaining
	if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		host = host[1 : len(host)-1]
	}
	if host == "" || strings.ContainsAny(host, "[]") || strings.Contains(host, ":") && net.ParseIP(host) == nil {
		return nil
	}
	main[0] = host
	port, err := strconv.Atoi(main[1])
	if err != nil || port < 1 || port > 65535 {
		return nil
	}
	password := decodeBase64String(main[5])
	if password == "" {
		return nil
	}
	query := map[string]string{}
	if len(sections) > 1 {
		query = queryDictionary(sections[1])
	}
	remarks := decodeBase64String(query["remarks"])
	if remarks == "" {
		remarks = main[0]
	}
	return &model.ProxyNode{
		SourceID:      sourceID,
		Kind:          model.KindShadowsocksR,
		Name:          normalizedName(remarks, main[0]),
		Server:        main[0],
		Port:          port,
		Cipher:        main[3],
		Password:      password,
		ProtocolName:  main[2],
		ProtocolParam: decodeBase64String(query["protoparam"]),
		Obfs:          main[4],
		ObfsParam:     decodeBase64String(query["obfsparam"]),
		RawURI:        raw,
	}
}

// parseVMess handles the base64-JSON `vmess://` form, falling back to the
// legacy `method:uuid@host:port` form.
func parseVMess(raw, sourceID string) *model.ProxyNode {
	encoded := strings.TrimPrefix(raw, "vmess://")
	body := encoded
	if qi := strings.IndexByte(encoded, '?'); qi >= 0 {
		body = encoded[:qi]
	}
	decoded := decodeBase64String(body)
	if decoded == "" {
		return parseLegacyVMess(raw, sourceID)
	}
	var j map[string]any
	if err := json.Unmarshal([]byte(decoded), &j); err != nil {
		return parseLegacyVMess(raw, sourceID)
	}
	server := stringValue(j["add"])
	port := intValue(j["port"])
	uuid := stringValue(j["id"])
	if server == "" || port == 0 || uuid == "" {
		return parseLegacyVMess(raw, sourceID)
	}

	tlsValue := strings.ToLower(stringValue(j["tls"]))
	rawTransport := stringValue(j["net"])
	if rawTransport == "" {
		rawTransport = stringValue(j["network"])
	}
	if rawTransport == "" {
		rawTransport = stringValue(j["type"])
	}
	return &model.ProxyNode{
		SourceID:                    sourceID,
		Kind:                        model.KindVMess,
		Name:                        normalizedName(stringValue(j["ps"]), server),
		Server:                      server,
		Port:                        port,
		Cipher:                      firstNonEmpty(stringValue(j["scy"]), "auto"),
		UUID:                        uuid,
		Transport:                   firstNonEmpty(normalizedVMessTransport(rawTransport), "tcp"),
		TLS:                         tlsValue == "tls" || tlsValue == "true",
		SNI:                         stringValue(j["sni"]),
		HostHeader:                  stringValue(j["host"]),
		Path:                        stringValue(j["path"]),
		ALPN:                        stringValue(j["alpn"]),
		SkipCertificateVerification: boolValue(j["allowInsecure"]),
		AlterID:                     intPtr(j["aid"]),
		RawURI:                      raw,
	}
}

// parseLegacyVMess handles `vmess://base64(method:uuid@host:port)?remarks=…`.
func parseLegacyVMess(raw, sourceID string) *model.ProxyNode {
	body := strings.TrimPrefix(raw, "vmess://")
	if fi := strings.IndexByte(body, '#'); fi >= 0 {
		body = body[:fi]
	}
	parts := strings.SplitN(body, "?", 2)
	decoded := decodeBase64String(parts[0])
	if decoded == "" {
		return nil
	}
	query := map[string]string{}
	if len(parts) > 1 {
		query = queryDictionaryLower(parts[1])
	}
	ai := strings.LastIndexByte(decoded, '@')
	if ai < 0 {
		return nil
	}
	auth := decoded[:ai]
	host, port := parseEndpoint(decoded[ai+1:])
	if host == "" {
		return nil
	}
	cipher, uuid := "auto", auth
	if sep := strings.IndexByte(auth, ':'); sep >= 0 {
		cipher = auth[:sep]
		uuid = auth[sep+1:]
	}
	if uuid == "" {
		return nil
	}
	obfs := percentDecode(query["obfs"])
	transport := normalizedVMessTransport(obfs)
	name := percentDecode(query["remarks"])
	if name == "" {
		if fi := strings.IndexByte(raw, '#'); fi >= 0 {
			name = percentDecode(raw[fi+1:])
		}
	}
	sni := percentDecode(query["peer"])
	if sni == "" {
		sni = percentDecode(query["sni"])
	}
	hostHeader := percentDecode(query["obfsparam"])
	if hostHeader == "" {
		hostHeader = percentDecode(query["host"])
	}
	insecure := query["allowinsecure"]
	if insecure == "" {
		insecure = query["tls-verification"]
	}
	return &model.ProxyNode{
		SourceID:                    sourceID,
		Kind:                        model.KindVMess,
		Name:                        normalizedName(name, host),
		Server:                      host,
		Port:                        port,
		Cipher:                      cipher,
		UUID:                        uuid,
		Transport:                   transport,
		TLS:                         isTrueish(query["tls"]),
		SNI:                         sni,
		HostHeader:                  hostHeader,
		Path:                        percentDecode(query["path"]),
		SkipCertificateVerification: isTrueish(insecure),
		AlterID:                     intPtr(query["alterid"]),
		RawURI:                      raw,
	}
}

// parseLegacyVLESS handles Shadowrocket's endpoint-only Base64 VLESS dialect.
func parseLegacyVLESS(raw, sourceID string) *model.ProxyNode {
	body := strings.TrimPrefix(raw, "vless://")
	fragmentName := ""
	if fi := strings.IndexByte(body, '#'); fi >= 0 {
		fragmentName = percentDecode(body[fi+1:])
		body = body[:fi]
	}
	parts := strings.SplitN(body, "?", 2)
	decoded := decodeBase64String(parts[0])
	if decoded == "" {
		return nil
	}
	ai := strings.LastIndexByte(decoded, '@')
	if ai < 0 {
		return nil
	}
	rawUUID := decoded[:ai]
	lower := strings.ToLower(rawUUID)
	switch {
	case strings.HasPrefix(lower, "auto:"):
		rawUUID = rawUUID[len("auto:"):]
	case strings.HasPrefix(lower, "none:"):
		rawUUID = rawUUID[len("none:"):]
	case strings.HasPrefix(rawUUID, ":"):
		rawUUID = rawUUID[1:]
	}
	if rawUUID == "" {
		return nil
	}
	host, port := parseEndpoint(decoded[ai+1:])
	if host == "" {
		return nil
	}
	query := map[string]string{}
	if len(parts) > 1 {
		query = queryDictionaryLower(parts[1])
	}
	realityPublicKey := percentDecode(query["pbk"])
	tlsValue := strings.ToLower(firstNonEmpty(query["security"], query["tls"]))
	rawTransport := percentDecode(firstNonEmpty(query["type"], query["network"], query["obfs"]))
	transport := normalizedTransport(strings.ToLower(rawTransport))
	flow := percentDecode(query["flow"])
	if flow == "" && query["xtls"] == "2" {
		flow = "xtls-rprx-vision"
	}
	name := proxyNameQueryValue(query)
	if name == "" {
		name = fragmentName
	}
	return &model.ProxyNode{
		SourceID:                    sourceID,
		Kind:                        model.KindVLESS,
		Name:                        normalizedName(name, host),
		Server:                      host,
		Port:                        port,
		UUID:                        rawUUID,
		Transport:                   transport,
		TransportMode:               transportMode(query, transport),
		TLS:                         realityPublicKey != "" || isTrueish(tlsValue) || tlsValue == "reality",
		SNI:                         percentDecode(firstNonEmpty(query["peer"], query["sni"], query["servername"])),
		HostHeader:                  percentDecode(firstNonEmpty(query["authority"], query["host"])),
		Path:                        transportPath(query, transport),
		ALPN:                        percentDecode(query["alpn"]),
		RealityPublicKey:            realityPublicKey,
		RealityShortID:              percentDecode(query["sid"]),
		CertificateFingerprint:      percentDecode(firstNonEmpty(query["pcs"], query["pinsha256"], query["pin-sha256"])),
		Fingerprint:                 realityFingerprint(query, realityPublicKey != ""),
		Flow:                        flow,
		SkipCertificateVerification: isTrueish(firstNonEmpty(query["allowinsecure"], query["insecure"])),
		RawURI:                      raw,
	}
}

// parseStandardURL handles the generic `scheme://user:pass@host:port?query`
// form shared by vless/trojan/anytls/hysteria/hysteria2/tuic/socks5/http.
func parseStandardURL(raw string, kind model.ProxyKind, sourceID string) *model.ProxyNode {
	normalized := raw
	switch {
	case strings.HasPrefix(strings.ToLower(normalized), "hy2://"):
		normalized = "hysteria2://" + normalized[len("hy2://"):]
	case strings.HasPrefix(strings.ToLower(normalized), "hy://"):
		normalized = "hysteria://" + normalized[len("hy://"):]
	case strings.HasPrefix(strings.ToLower(normalized), "socks://"):
		normalized = "socks5://" + normalized[len("socks://"):]
	}
	authorityPorts := ""
	if kind == model.KindHysteria2 {
		var ok bool
		normalized, authorityPorts, ok = hysteria2AuthorityPorts(normalized)
		if !ok {
			return nil
		}
	}
	u, err := url.Parse(normalized)
	if err != nil {
		return nil
	}
	rawHost := u.Hostname()
	if rawHost == "" {
		return nil
	}
	server := normalizedHost(rawHost)
	port := 0
	if p := u.Port(); p != "" {
		port, _ = strconv.Atoi(p)
	} else if kind == model.KindHysteria2 {
		port = 443
	} else if kind == model.KindHTTP {
		if strings.HasPrefix(strings.ToLower(u.Scheme), "https") {
			port = 443
		} else {
			port = 80
		}
	}
	if port == 0 {
		return nil
	}

	query := map[string]string{}
	for k, v := range u.Query() {
		if len(v) > 0 {
			query[strings.ToLower(k)] = v[len(v)-1]
		}
	}

	fallback := kindTitle(kind) + " · " + server
	name := normalizedName(firstNonEmpty(decodedProxyName(u.Fragment, false), proxyNameQueryValue(query)), fallback)

	var trojanPlugin *trojanWS
	if kind == model.KindTrojan {
		trojanPlugin = shadowrocketTrojanWebSocketOptions(query["plugin"])
	}
	transport := normalizedTransport(firstNonEmpty(
		trojanTransport(trojanPlugin),
		query["type"], query["network"],
		wsIfObfs(query["obfs"]),
	))

	security := strings.ToLower(firstNonEmpty(query["security"], query["tls"]))
	realityPublicKey := query["pbk"]
	carriesReality := security == "reality" ||
		(kind == model.KindVLESS && realityPublicKey != "")

	flow := query["flow"]
	if flow == "" && kind == model.KindVLESS && query["xtls"] == "2" {
		flow = "xtls-rprx-vision"
	}

	credential := percentDecode(u.User.Username())
	password := percentDecode(passwordOf(u))

	var tuicUUID, tuicPassword string
	if kind == model.KindTUIC {
		tuicUUID = firstNonEmpty(credential, percentDecode(query["uuid"]))
		tuicPassword = firstNonEmpty(password, percentDecode(query["password"]))
		if tuicUUID == "" || tuicPassword == "" {
			return nil
		}
	}

	nodePassword := ""
	switch {
	case kind == model.KindTUIC:
		nodePassword = tuicPassword
	case kind == model.KindHysteria:
		nodePassword = firstNonEmpty(credential, query["auth"], query["auth_str"], query["authstr"])
	case kind == model.KindTrojan, kind == model.KindHysteria2, kind == model.KindAnyTLS:
		nodePassword = credential
	default:
		nodePassword = password
	}

	nodeUUID := ""
	if kind == model.KindTUIC {
		nodeUUID = tuicUUID
	} else if kind == model.KindVMess || kind == model.KindVLESS {
		nodeUUID = credential
	}

	username := ""
	if kind == model.KindSOCKS5 || kind == model.KindHTTP {
		username = credential
	}

	sni := firstNonEmpty(query["sni"], query["servername"], query["peer"])
	hostHeader := firstNonEmpty(trojanHost(trojanPlugin), query["authority"], query["host"])
	if kind == model.KindVLESS && transport == "ws" && hostHeader == "" {
		hostHeader = webSocketHost(percentDecode(query["obfsparam"]))
	}

	obfs := ""
	obfsParam := ""
	if kind == model.KindHysteria {
		obfs = firstNonEmpty(query["obfsparam"], query["obfs"])
	} else if kind == model.KindHysteria2 {
		obfs = query["obfs"]
		obfsParam = firstNonEmpty(query["obfs-password"], query["obfspassword"], query["obfs_password"])
	}

	node := &model.ProxyNode{
		SourceID:                    sourceID,
		Kind:                        kind,
		Name:                        name,
		Server:                      server,
		Port:                        port,
		Password:                    nodePassword,
		UUID:                        nodeUUID,
		Username:                    username,
		Transport:                   transport,
		TransportMode:               transportMode(query, transport),
		TLS:                         isTLSKind(kind) || isTrueish(security) || carriesReality || strings.HasPrefix(strings.ToLower(u.Scheme), "https"),
		SNI:                         sni,
		HostHeader:                  hostHeader,
		Path:                        transportPath(query, transport),
		ALPN:                        normalizedALPN(queryValues(u, "alpn")),
		RealityPublicKey:            map[bool]string{true: realityPublicKey, false: ""}[carriesReality],
		RealityShortID:              map[bool]string{true: query["sid"], false: ""}[carriesReality],
		CertificateFingerprint:      firstNonEmpty(query["pinsha256"], query["pin-sha256"], query["tls-fingerprint"], query["pcs"]),
		Fingerprint:                 firstNonEmpty(query["fp"], query["client_fingerprint"], query["client-fingerprint"], map[bool]string{true: query["fingerprint"], false: ""}[carriesReality]),
		Flow:                        flow,
		SkipCertificateVerification: isTrueish(firstNonEmpty(query["allowinsecure"], query["insecure"], query["allow_insecure"])),
		ProtocolName:                map[bool]string{true: query["protocol"], false: ""}[kind == model.KindHysteria],
		Obfs:                        obfs,
		ObfsParam:                   obfsParam,
		RawURI:                      raw,
	}

	if kind == model.KindAnyTLS {
		node.IdleSessionCheckInterval = intPtr(firstNonEmpty(query["idle-session-check-interval"], query["idlesessioncheckinterval"]))
		node.IdleSessionTimeout = intPtr(firstNonEmpty(query["idle-session-timeout"], query["idlesessiontimeout"]))
		node.MinIdleSession = intPtr(firstNonEmpty(query["min-idle-session"], query["minidlesession"]))
	}
	if kind == model.KindTUIC {
		node.CongestionControl = firstNonEmpty(query["congestion_control"], query["congestion-controller"])
		node.UDPRelayMode = firstNonEmpty(query["udp_relay_mode"], query["udp-relay-mode"])
	}
	if kind == model.KindHysteria {
		node.UpMbps = mbps(firstNonEmpty(query["upmbps"], query["up"]))
		node.DownMbps = mbps(firstNonEmpty(query["downmbps"], query["down"]))
	}
	queryPorts := firstNonEmpty(query["mport"], query["ports"], query["server-ports"], query["port-hopping"])
	if authorityPorts != "" && queryPorts != "" && authorityPorts != queryPorts {
		return nil
	}
	node.PortHopping = firstNonEmpty(authorityPorts, queryPorts)
	return node
}

// hysteria2AuthorityPorts replaces only a multi-port authority with its first
// port so net/url can parse the rest of the URI without changing credentials.
func hysteria2AuthorityPorts(link string) (string, string, bool) {
	schemeEnd := strings.Index(link, "://")
	if schemeEnd < 0 {
		return link, "", false
	}
	authorityStart := schemeEnd + 3
	authorityEnd := len(link)
	if end := strings.IndexAny(link[authorityStart:], "/?#"); end >= 0 {
		authorityEnd = authorityStart + end
	}
	authority := link[authorityStart:authorityEnd]
	hostStart := authorityStart
	if at := strings.LastIndexByte(authority, '@'); at >= 0 {
		hostStart += at + 1
	}
	hostPort := link[hostStart:authorityEnd]
	colon := strings.LastIndexByte(hostPort, ':')
	if colon < 0 || strings.HasPrefix(hostPort, "[") && strings.LastIndexByte(hostPort, ']') > colon {
		return link, "", true
	}
	ports := hostPort[colon+1:]
	if !strings.ContainsAny(ports, ",- ") {
		return link, "", true
	}
	first, ok := firstHysteria2Port(ports)
	if !ok {
		return link, "", false
	}
	return link[:hostStart+colon+1] + strconv.Itoa(first) + link[authorityEnd:], ports, true
}

func firstHysteria2Port(ports string) (int, bool) {
	first := 0
	for _, item := range strings.Split(ports, ",") {
		bounds := strings.Split(item, "-")
		if len(bounds) < 1 || len(bounds) > 2 {
			return 0, false
		}
		start, err := strconv.Atoi(bounds[0])
		if err != nil || start < 1 || start > 65535 {
			return 0, false
		}
		if len(bounds) == 2 {
			end, err := strconv.Atoi(bounds[1])
			if err != nil || end < start || end > 65535 {
				return 0, false
			}
		}
		if first == 0 {
			first = start
		}
	}
	return first, true
}

// parseShadowrocketHTTPURL handles `https://base64(user:pass@host:port)`.
func parseShadowrocketHTTPURL(raw, sourceID string) *model.ProxyNode {
	lower := strings.ToLower(raw)
	scheme := ""
	switch {
	case strings.HasPrefix(lower, "https://"):
		scheme = "https"
	case strings.HasPrefix(lower, "http://"):
		scheme = "http"
	default:
		return nil
	}
	body := raw[len(scheme)+3:]
	authorityEnd := len(body)
	for i, r := range body {
		if r == '?' || r == '#' {
			authorityEnd = i
			break
		}
	}
	encodedAuthority := body[:authorityEnd]
	if encodedAuthority == "" || strings.Contains(encodedAuthority, "@") {
		return nil
	}
	decodedAuthority := decodeBase64String(encodedAuthority)
	if !strings.Contains(decodedAuthority, "@") {
		return nil
	}
	u, err := url.Parse(scheme + "://" + decodedAuthority)
	if err != nil || u.Hostname() == "" {
		return nil
	}
	server := normalizedHost(u.Hostname())
	port := 0
	if p := u.Port(); p != "" {
		port, _ = strconv.Atoi(p)
	} else if scheme == "https" {
		port = 443
	} else {
		port = 80
	}

	remainder := body[authorityEnd:]
	fragment := ""
	queryText := ""
	if fi := strings.IndexByte(remainder, '#'); fi >= 0 {
		fragment = percentDecode(remainder[fi+1:])
		before := remainder[:fi]
		if strings.HasPrefix(before, "?") {
			queryText = before[1:]
		}
	} else if strings.HasPrefix(remainder, "?") {
		queryText = remainder[1:]
	}
	query := queryDictionaryLower(queryText)
	name := firstNonEmpty(proxyNameQueryValue(query), decodedProxyName(fragment, false), proxyNameQueryValue(lowerQuery(u)))
	if name == "" {
		name = "HTTP · " + server
	}
	return &model.ProxyNode{
		SourceID: sourceID,
		Kind:     model.KindHTTP,
		Name:     normalizedName(name, server),
		Server:   server,
		Port:     port,
		Username: percentDecode(u.User.Username()),
		Password: percentDecode(passwordOf(u)),
		TLS:      scheme == "https",
		RawURI:   raw,
	}
}

func lowerQuery(u *url.URL) map[string]string {
	out := map[string]string{}
	for k, v := range u.Query() {
		if len(v) > 0 {
			out[strings.ToLower(k)] = v[len(v)-1]
		}
	}
	return out
}

func passwordOf(u *url.URL) string {
	if u.User == nil {
		return ""
	}
	p, _ := u.User.Password()
	return p
}

// parseWireGuardURL handles Sub-Store's single-peer WireGuard URI.
func parseWireGuardURL(raw, sourceID string) *model.ProxyNode {
	normalized := raw
	if strings.HasPrefix(strings.ToLower(raw), "wg://") {
		normalized = "wireguard://" + raw[len("wg://"):]
	}
	u, err := url.Parse(normalized)
	if err != nil || u.Hostname() == "" {
		return nil
	}
	server := normalizedHost(u.Hostname())
	port := 51820
	if p := u.Port(); p != "" {
		port, _ = strconv.Atoi(p)
	}
	query := lowerQuery(u)
	addresses := csvValues(firstNonEmpty(query["address"], query["addresses"]))
	ipv4, ipv6 := "", ""
	for _, a := range addresses {
		if strings.Contains(a, ":") {
			if ipv6 == "" {
				ipv6 = a
			}
		} else if ipv4 == "" {
			ipv4 = a
		}
	}
	name := normalizedName(percentDecode(u.Fragment), "WireGuard · "+server)
	mtu := intPtr(query["mtu"])
	keepalive := intPtr(firstNonEmpty(query["keepalive"], query["persistent-keepalive"]))
	return &model.ProxyNode{
		SourceID:                     sourceID,
		Kind:                         model.KindWireGuard,
		Name:                         name,
		Server:                       server,
		Port:                         port,
		WireGuardPrivateKey:          percentDecode(u.User.Username()),
		WireGuardPublicKey:           firstNonEmpty(query["publickey"], query["public-key"]),
		WireGuardPreSharedKey:        firstNonEmpty(query["presharedkey"], query["pre-shared-key"], query["preshared-key"]),
		WireGuardIPv4:                ipv4,
		WireGuardIPv6:                ipv6,
		WireGuardAllowedIPs:          strings.Join(csvValues(firstNonEmpty(query["allowedips"], query["allowed-ips"], "0.0.0.0/0,::/0")), ","),
		WireGuardReserved:            strings.Join(csvValues(query["reserved"]), ","),
		WireGuardMTU:                 mtu,
		WireGuardPersistentKeepalive: keepalive,
		WireGuardDNS:                 strings.Join(csvValues(firstNonEmpty(query["dns"], query["dns-server"])), ","),
		RawURI:                       raw,
	}
}

// parseSnellLine handles the Surge proxy line form of Snell nodes.
func parseSnellLine(raw, sourceID string) *model.ProxyNode {
	sep := strings.IndexByte(raw, '=')
	if sep < 0 {
		return nil
	}
	name := strings.TrimSpace(raw[:sep])
	body := raw[sep+1:]
	fields := splitCSV(body)
	if name == "" || len(fields) < 3 || strings.ToLower(strings.TrimSpace(fields[0])) != "snell" {
		return nil
	}
	port, err := strconv.Atoi(strings.TrimSpace(fields[2]))
	if err != nil {
		return nil
	}
	server := normalizedHost(strings.TrimSpace(fields[1]))
	if server == "" {
		return nil
	}
	options := map[string]string{}
	for _, field := range fields[3:] {
		eq := strings.IndexByte(field, '=')
		if eq < 0 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(field[:eq]))
		val := strings.Trim(strings.TrimSpace(field[eq+1:]), "\"'")
		options[key] = val
	}
	psk := options["psk"]
	if psk == "" {
		return nil
	}
	return &model.ProxyNode{
		SourceID:   sourceID,
		Kind:       model.KindSnell,
		Name:       name,
		Server:     server,
		Port:       port,
		Password:   psk,
		HostHeader: options["obfs-host"],
		Obfs:       options["obfs"],
		ObfsParam:  options["obfs-host"],
		Version:    intPtr(options["version"]),
		RawURI:     raw,
	}
}

// --- small shared helpers ---

type trojanWS struct{ transport, host, path string }

func shadowrocketTrojanWebSocketOptions(plugin string) *trojanWS {
	parts := strings.Split(plugin, ";")
	if len(parts) == 0 {
		return nil
	}
	name := strings.ToLower(strings.TrimSpace(parts[0]))
	if name != "obfs" && name != "obfs-local" && name != "simple-obfs" {
		return nil
	}
	out := &trojanWS{}
	for _, part := range parts[1:] {
		pair := strings.SplitN(part, "=", 2)
		if len(pair) != 2 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(pair[0]))
		val := strings.TrimSpace(pair[1])
		switch key {
		case "obfs", "mode":
			out.transport = val
		case "obfs-host", "host":
			out.host = val
		case "obfs-uri", "path":
			out.path = val
		}
	}
	if m := strings.ToLower(out.transport); m != "websocket" && m != "ws" && m != "wss" {
		return nil
	}
	out.transport = "ws"
	return out
}

func trojanTransport(p *trojanWS) string {
	if p == nil {
		return ""
	}
	return p.transport
}

func trojanHost(p *trojanWS) string {
	if p == nil {
		return ""
	}
	return p.host
}

func wsIfObfs(obfs string) string {
	if strings.Contains(strings.ToLower(obfs), "ws") {
		return "ws"
	}
	return ""
}

func transportMode(query map[string]string, transport string) string {
	if transport == "xhttp" {
		return query["mode"]
	}
	return ""
}

func transportPath(query map[string]string, transport string) string {
	if transport == "grpc" {
		return firstNonEmpty(query["servicename"], query["service_name"], query["path"])
	}
	return query["path"]
}

func realityFingerprint(query map[string]string, reality bool) string {
	if fp := query["fp"]; fp != "" {
		return fp
	}
	if reality {
		return query["fingerprint"]
	}
	return ""
}

func isTLSKind(kind model.ProxyKind) bool {
	switch kind {
	case model.KindTrojan, model.KindHysteria, model.KindHysteria2, model.KindTUIC, model.KindAnyTLS:
		return true
	}
	return false
}

func isTrueish(v string) bool {
	switch strings.ToLower(v) {
	case "1", "true", "tls", "reality":
		return true
	}
	return false
}

func kindTitle(kind model.ProxyKind) string {
	switch kind {
	case model.KindShadowsocks:
		return "Shadowsocks"
	case model.KindShadowsocksR:
		return "ShadowsocksR"
	case model.KindVMess:
		return "VMess"
	case model.KindVLESS:
		return "VLESS"
	case model.KindTrojan:
		return "Trojan"
	case model.KindHysteria:
		return "Hysteria"
	case model.KindHysteria2:
		return "Hysteria 2"
	case model.KindTUIC:
		return "TUIC"
	case model.KindWireGuard:
		return "WireGuard"
	case model.KindAnyTLS:
		return "AnyTLS"
	case model.KindSnell:
		return "Snell"
	case model.KindSOCKS5:
		return "SOCKS5"
	case model.KindHTTP:
		return "HTTP"
	default:
		return string(kind)
	}
}

// parseEndpoint splits `host:port`, accepting bracketed IPv6.
func parseEndpoint(value string) (host string, port int) {
	v := strings.TrimSpace(value)
	if v == "" {
		return "", 0
	}
	if strings.HasPrefix(v, "[") {
		// [::1]:443
		end := strings.IndexByte(v, ']')
		if end < 0 {
			return "", 0
		}
		host = v[1:end]
		rest := v[end+1:]
		if strings.HasPrefix(rest, ":") {
			port, _ = strconv.Atoi(rest[1:])
		}
		return host, port
	}
	// host:port or host (IPv4/hostname)
	if i := strings.LastIndexByte(v, ':'); i >= 0 && !strings.Contains(v[i+1:], ":") {
		host = v[:i]
		port, _ = strconv.Atoi(v[i+1:])
		return normalizedHost(host), port
	}
	return normalizedHost(v), 0
}

func stringValue(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case json.Number:
		return t.String()
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	}
	return ""
}

func intValue(v any) int {
	switch t := v.(type) {
	case float64:
		return int(t)
	case json.Number:
		n, _ := t.Int64()
		return int(n)
	case string:
		n, _ := strconv.Atoi(t)
		return n
	}
	return 0
}

func intPtr(v any) *int {
	switch t := v.(type) {
	case float64:
		n := int(t)
		return &n
	case json.Number:
		n, _ := t.Int64()
		i := int(n)
		return &i
	case string:
		if n, err := strconv.Atoi(t); err == nil {
			return &n
		}
	case int:
		return &t
	}
	return nil
}

func boolValue(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case string:
		return boolString(t)
	}
	return false
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// queryValues returns all values for a key and its indexed `alpn[0]` variants,
// in order.
func queryValues(u *url.URL, key string) []string {
	var out []string
	for k, vs := range u.Query() {
		lk := strings.ToLower(k)
		if lk == key || lk == key+"[]" || (strings.HasPrefix(lk, key+"[") && strings.HasSuffix(lk, "]")) {
			out = append(out, vs...)
		}
	}
	return out
}

// normalizedALPN collapses an ALPN list to a comma-joined string.
func normalizedALPN(values []string) string {
	var parts []string
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v != "" {
			parts = append(parts, v)
		}
	}
	return strings.Join(parts, ",")
}

// splitCSV splits on commas, honoring quoted values.
func splitCSV(value string) []string {
	var fields []string
	current := ""
	var quote rune
	for _, r := range value {
		if r == '"' || r == '\'' {
			if quote == r {
				quote = 0
			} else if quote == 0 {
				quote = r
			}
			current += string(r)
		} else if r == ',' && quote == 0 {
			fields = append(fields, current)
			current = ""
		} else {
			current += string(r)
		}
	}
	fields = append(fields, current)
	return fields
}

// webSocketHost decodes a bare hostname or a JSON header map from Shadowrocket
// VLESS `obfsParam`.
func webSocketHost(raw string) string {
	candidate := strings.TrimSpace(raw)
	if candidate == "" {
		return ""
	}
	if !strings.HasPrefix(candidate, "{") {
		return candidate
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(candidate), &obj); err != nil {
		return ""
	}
	if h := hostIn(obj); h != "" {
		return h
	}
	if headers, ok := obj["headers"].(map[string]any); ok {
		return hostIn(headers)
	}
	return ""
}

func hostIn(m map[string]any) string {
	for k, v := range m {
		if strings.EqualFold(k, "host") {
			switch t := v.(type) {
			case string:
				return strings.TrimSpace(t)
			case []any:
				for _, e := range t {
					if s, ok := e.(string); ok && strings.TrimSpace(s) != "" {
						return strings.TrimSpace(s)
					}
				}
			}
		}
	}
	return ""
}

var _ = base64.StdEncoding
