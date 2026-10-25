package parser

import (
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"

	"github.com/kenzok8/tower/internal/model"
)

// parseClashYAML reads the `proxies:` block of a Clash/mihomo YAML document.
func parseClashYAML(text, sourceID string) ParsedContent {
	var doc struct {
		Proxies []map[string]any `yaml:"proxies"`
	}
	if err := yaml.Unmarshal([]byte(text), &doc); err != nil {
		return ParsedContent{RejectedLineCount: 1}
	}

	var nodes []model.ProxyNode
	rejected := 0
	for _, raw := range doc.Proxies {
		d := flattenClashProxy(raw)
		kind := clashKind(str(d["type"]))
		server := str(d["server"])
		port := num(d["port"])
		if kind == model.KindUnknown || server == "" || port == 0 {
			rejected++
			continue
		}
		if kind == model.KindWireGuard && len(list(d["peers"])) > 1 {
			rejected++
			continue
		}

		obfsMode := str(d["obfs"])
		obfsHost := firstNonEmpty(str(d["obfs-param"]), str(d["obfs-password"]), str(d["obfs_password"]))
		sip003Plugin, pluginTransport, pluginPath := "", "", ""
		var pluginTLS bool
		var pluginMux *bool

		if kind == model.KindShadowsocks {
			if hasKey(d, "udp") {
				if _, ok := udpRelayPreference(str(d["udp"])); !ok {
					rejected++
					continue
				}
			}
			if plugin := strings.ToLower(str(d["plugin"])); plugin != "" {
				opts := map[string]string{}
				for k, v := range asMap(d["plugin-opts"]) {
					opts[strings.ToLower(k)] = str(v)
				}
				for _, key := range []string{"mode", "host", "path", "tls", "mux"} {
					if opts[key] == "" {
						opts[key] = str(d[key])
					}
				}
				switch {
				case plugin == "obfs" || plugin == "obfs-local" || plugin == "simple-obfs":
					obfsMode = firstNonEmpty(opts["mode"], "http")
					obfsHost = opts["host"]
				case plugin == "v2ray-plugin" && (strings.EqualFold(opts["mode"], "websocket") || strings.EqualFold(opts["mode"], "ws")):
					sip003Plugin = "v2ray-plugin"
					pluginTransport = "ws"
					pluginPath = opts["path"]
					pluginTLS = boolString(opts["tls"])
					if opts["mux"] != "" {
						b := boolString(opts["mux"])
						pluginMux = &b
					}
					obfsHost = opts["host"]
				default:
					rejected++
					continue
				}
			}
		}

		network := normalizedTransport(str(d["network"]))
		hasReality := hasKey(d, "reality-opts") || strings.EqualFold(str(d["security"]), "reality")

		node := &model.ProxyNode{
			SourceID:                    sourceID,
			Kind:                        kind,
			Name:                        normalizedName(str(d["name"]), server),
			Server:                      normalizedHost(server),
			Port:                        port,
			Cipher:                      str(d["cipher"]),
			Password:                    firstNonEmpty(str(d["password"]), str(d["auth-str"]), str(d["auth_str"]), str(d["auth"]), str(d["psk"])),
			UUID:                        str(d["uuid"]),
			Username:                    str(d["username"]),
			Transport:                   firstNonEmpty(pluginTransport, network),
			TransportMode:               transportMode(map[string]string{"mode": str(d["mode"])}, network),
			Plugin:                      sip003Plugin,
			PluginMux:                   pluginMux,
			TLS:                         kind == model.KindTrojan || pluginTLS || boolString(str(d["tls"])),
			SNI:                         firstNonEmpty(str(d["servername"]), str(d["sni"])),
			HostHeader:                  firstNonEmpty(str(d["authority"]), str(d["host"])),
			Path:                        clashPath(d, network, pluginPath),
			ALPN:                        normalizedALPN(csvValues(str(d["alpn"]))),
			RealityPublicKey:            map[bool]string{true: firstNonEmpty(str(d["public-key"]), str(d["pbk"])), false: ""}[hasReality],
			RealityShortID:              map[bool]string{true: clashYAMLScalar(firstNonEmpty(str(d["short-id"]), str(d["sid"]))), false: ""}[hasReality],
			CertificateFingerprint:      firstNonEmpty(str(d["tls-fingerprint"]), str(d["fingerprint"])),
			Fingerprint:                 firstNonEmpty(str(d["client-fingerprint"]), str(d["fp"])),
			Flow:                        str(d["flow"]),
			SkipCertificateVerification: boolString(str(d["skip-cert-verify"])),
			AlterID:                     numPtr(firstNonEmpty(str(d["alterid"]), str(d["alter-id"]))),
			ProtocolName:                str(d["protocol"]),
			ProtocolParam:               str(d["protocol-param"]),
			Obfs:                        obfsMode,
			ObfsParam:                   map[bool]string{true: "", false: obfsHost}[sip003Plugin != ""],
			Version:                     numPtr(str(d["version"])),
			CongestionControl:           firstNonEmpty(str(d["congestion-controller"]), str(d["congestion_control"])),
			UDPRelayMode:                str(d["udp-relay-mode"]),
			PortHopping:                 firstNonEmpty(str(d["ports"]), str(d["mport"]), str(d["server-ports"]), str(d["port-hopping"])),
			RawURI:                      "clash://local/" + server,
		}
		if kind == model.KindHysteria {
			node.UpMbps = mbps(firstNonEmpty(str(d["up"]), str(d["up-speed"])))
			node.DownMbps = mbps(firstNonEmpty(str(d["down"]), str(d["down-speed"])))
		}
		if kind == model.KindShadowsocks && hasKey(d, "udp") {
			node.UDPRelayEnabled, _ = udpRelayPreference(str(d["udp"]))
		}
		if kind == model.KindWireGuard {
			node.WireGuardPrivateKey = str(d["private-key"])
			node.WireGuardPublicKey = str(d["public-key"])
			node.WireGuardPreSharedKey = firstNonEmpty(str(d["pre-shared-key"]), str(d["preshared-key"]))
			node.WireGuardIPv4 = str(d["ip"])
			node.WireGuardIPv6 = str(d["ipv6"])
			node.WireGuardAllowedIPs = strings.Join(csvValues(firstNonEmpty(str(d["allowed-ips"]), "0.0.0.0/0,::/0")), ",")
			node.WireGuardReserved = strings.Join(csvValues(str(d["reserved"])), ",")
			node.WireGuardMTU = numPtr(str(d["mtu"]))
			node.WireGuardPersistentKeepalive = numPtr(firstNonEmpty(str(d["persistent-keepalive"]), str(d["keepalive"])))
			node.WireGuardDNS = strings.Join(csvValues(str(d["dns"])), ",")
		}
		nodes = append(nodes, *node)
	}

	rej := rejected
	if len(doc.Proxies) == 0 {
		rej = 1
	}
	return ParsedContent{
		Nodes:             nodes,
		RejectedLineCount: rej,
	}
}

// flattenClashProxy lifts nested option maps (reality-opts, ws-opts, …) into
// top-level keys so the caller reads one flat map, mirroring the Swift reader.
func flattenClashProxy(src map[string]any) map[string]any {
	result := map[string]any{}
	for k, v := range src {
		result[strings.ToLower(k)] = v
	}
	if reality := asMap(result["reality-opts"]); reality != nil {
		if result["public-key"] == nil {
			result["public-key"] = reality["public-key"]
		}
		if result["short-id"] == nil {
			result["short-id"] = reality["short-id"]
		}
	}
	for _, key := range []string{"ws-opts", "http-opts", "h2-opts", "http-upgrade-opts", "xhttp-opts"} {
		opts := asMap(result[key])
		if opts == nil {
			continue
		}
		if result["path"] == nil {
			result["path"] = opts["path"]
		}
		if result["host"] == nil {
			result["host"] = opts["host"]
		}
		if result["mode"] == nil {
			result["mode"] = opts["mode"]
		}
		if result["host"] == nil {
			if headers := asMap(opts["headers"]); headers != nil {
				result["host"] = headers["Host"]
				if result["host"] == nil {
					result["host"] = headers["host"]
				}
			}
		}
	}
	if grpc := asMap(result["grpc-opts"]); grpc != nil {
		if result["grpc-service-name"] == nil {
			if v := grpc["grpc-service-name"]; v != nil {
				result["grpc-service-name"] = v
			} else if v := grpc["service-name"]; v != nil {
				result["grpc-service-name"] = v
			}
		}
	}
	if normalizedTransport(str(result["network"])) == "http" {
		if p := str(result["path"]); p != "" {
			result["path"] = clashYAMLScalar(p)
		}
		if h := str(result["host"]); h != "" {
			result["host"] = clashYAMLScalar(h)
		}
	}
	return result
}

func clashPath(d map[string]any, network, pluginPath string) string {
	if pluginPath != "" {
		return pluginPath
	}
	if network == "grpc" {
		return firstNonEmpty(str(d["grpc-service-name"]), str(d["service-name"]), str(d["path"]))
	}
	return str(d["path"])
}

// clashKind maps a Clash proxy type to ProxyKind.
func clashKind(value string) model.ProxyKind {
	switch strings.ToLower(value) {
	case "ss":
		return model.KindShadowsocks
	case "ssr":
		return model.KindShadowsocksR
	case "vmess":
		return model.KindVMess
	case "vless":
		return model.KindVLESS
	case "trojan":
		return model.KindTrojan
	case "hysteria2", "hy2":
		return model.KindHysteria2
	case "hysteria":
		return model.KindHysteria
	case "tuic":
		return model.KindTUIC
	case "wireguard", "wg":
		return model.KindWireGuard
	case "anytls":
		return model.KindAnyTLS
	case "snell":
		return model.KindSnell
	case "socks5", "socks":
		return model.KindSOCKS5
	case "http", "https":
		return model.KindHTTP
	default:
		return model.KindUnknown
	}
}

// clashYAMLScalar unwraps a one-element YAML array spelling of a scalar.
func clashYAMLScalar(value string) string {
	t := strings.TrimSpace(value)
	if strings.HasPrefix(t, "[") && strings.HasSuffix(t, "]") {
		inner := strings.TrimSpace(t[1 : len(t)-1])
		if i := strings.IndexByte(inner, ','); i >= 0 {
			inner = inner[:i]
		}
		t = inner
	}
	t = strings.Trim(t, " \t\r\n\"'")
	if t == "" {
		return ""
	}
	return t
}

// --- generic YAML value helpers ---

func asMap(v any) map[string]any {
	switch t := v.(type) {
	case map[string]any:
		return t
	case map[any]any:
		out := map[string]any{}
		for k, val := range t {
			if ks, ok := k.(string); ok {
				out[ks] = val
			}
		}
		return out
	}
	return nil
}

func str(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case int:
		return strconv.Itoa(t)
	case int64:
		return strconv.FormatInt(t, 10)
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	case nil:
		return ""
	default:
		return ""
	}
}

func num(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case string:
		n, _ := strconv.Atoi(t)
		return n
	}
	return 0
}

func numPtr(v string) *int {
	if v == "" {
		return nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return nil
	}
	return &n
}

func list(v any) []any {
	switch t := v.(type) {
	case []any:
		return t
	case []string:
		out := make([]any, len(t))
		for i, s := range t {
			out[i] = s
		}
		return out
	}
	return nil
}

func hasKey(m map[string]any, key string) bool {
	_, ok := m[key]
	return ok
}
