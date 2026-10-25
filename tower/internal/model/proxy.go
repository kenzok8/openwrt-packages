package model

// ProxyKind identifies the wire protocol of a proxy node. The raw values match
// the subscription URI scheme names used across the ecosystem.
type ProxyKind string

const (
	KindShadowsocks  ProxyKind = "ss"
	KindShadowsocksR ProxyKind = "ssr"
	KindVMess        ProxyKind = "vmess"
	KindVLESS        ProxyKind = "vless"
	KindTrojan       ProxyKind = "trojan"
	KindHysteria     ProxyKind = "hysteria"
	KindHysteria2    ProxyKind = "hysteria2"
	KindTUIC         ProxyKind = "tuic"
	KindWireGuard    ProxyKind = "wireguard"
	KindAnyTLS       ProxyKind = "anytls"
	KindSnell        ProxyKind = "snell"
	KindSOCKS5       ProxyKind = "socks5"
	KindHTTP         ProxyKind = "http"
	KindUnknown      ProxyKind = "unknown"
)

// ProxyNode is a fully parsed proxy endpoint. It mirrors the Swift ProxyNode so
// every protocol's connection parameters survive the parser→generator round
// trip without lossy compression.
type ProxyNode struct {
	ID       string    `json:"id"`
	SourceID string    `json:"source_id,omitempty"`
	Kind     ProxyKind `json:"kind"`
	Name     string    `json:"name"`
	Server   string    `json:"server"`
	Port     int       `json:"port"`

	Cipher   string `json:"cipher,omitempty"`
	Password string `json:"password,omitempty"`
	UUID     string `json:"uuid,omitempty"`
	Username string `json:"username,omitempty"`

	Transport     string `json:"transport,omitempty"`
	TransportMode string `json:"transport_mode,omitempty"`
	Plugin        string `json:"plugin,omitempty"`
	PluginMux     *bool  `json:"plugin_mux,omitempty"`

	TLS        bool   `json:"tls,omitempty"`
	SNI        string `json:"sni,omitempty"`
	HostHeader string `json:"host_header,omitempty"`
	Path       string `json:"path,omitempty"`
	ALPN       string `json:"alpn,omitempty"`

	RealityPublicKey       string `json:"reality_public_key,omitempty"`
	RealityShortID         string `json:"reality_short_id,omitempty"`
	CertificateFingerprint string `json:"certificate_fingerprint,omitempty"`
	Fingerprint            string `json:"fingerprint,omitempty"`
	Flow                   string `json:"flow,omitempty"`

	SkipCertificateVerification bool `json:"skip_cert_verify,omitempty"`

	AlterID       *int   `json:"alter_id,omitempty"`
	ProtocolName  string `json:"protocol_name,omitempty"`
	ProtocolParam string `json:"protocol_param,omitempty"`
	Obfs          string `json:"obfs,omitempty"`
	ObfsParam     string `json:"obfs_param,omitempty"`

	IdleSessionCheckInterval *int `json:"idle_session_check_interval,omitempty"`
	IdleSessionTimeout       *int `json:"idle_session_timeout,omitempty"`
	MinIdleSession           *int `json:"min_idle_session,omitempty"`

	Version *int `json:"version,omitempty"`

	CongestionControl string `json:"congestion_control,omitempty"`
	UDPRelayMode      string `json:"udp_relay_mode,omitempty"`
	UDPRelayEnabled   *bool  `json:"udp_relay_enabled,omitempty"`
	PortHopping       string `json:"port_hopping,omitempty"`
	UpMbps            *int   `json:"up_mbps,omitempty"`
	DownMbps          *int   `json:"down_mbps,omitempty"`

	WireGuardPrivateKey          string `json:"wireguard_private_key,omitempty"`
	WireGuardPublicKey           string `json:"wireguard_public_key,omitempty"`
	WireGuardPreSharedKey        string `json:"wireguard_preshared_key,omitempty"`
	WireGuardIPv4                string `json:"wireguard_ipv4,omitempty"`
	WireGuardIPv6                string `json:"wireguard_ipv6,omitempty"`
	WireGuardAllowedIPs          string `json:"wireguard_allowed_ips,omitempty"`
	WireGuardReserved            string `json:"wireguard_reserved,omitempty"`
	WireGuardMTU                 *int   `json:"wireguard_mtu,omitempty"`
	WireGuardPersistentKeepalive *int   `json:"wireguard_persistent_keepalive,omitempty"`
	WireGuardDNS                 string `json:"wireguard_dns,omitempty"`

	RawURI string `json:"raw_uri,omitempty"`

	IsSubscriptionMetadata *bool  `json:"is_subscription_metadata,omitempty"`
	CountryOverride        string `json:"country_override,omitempty"`
	EffectiveRegion        string `json:"effective_region,omitempty"`
}

// UsesReality reports whether the node negotiates REALITY rather than plain TLS.
func (n *ProxyNode) UsesReality() bool {
	return n.RealityPublicKey != ""
}

// ExportablePath returns the transport path with a leading slash, matching what
// every client accepts. Empty input stays empty.
func (n *ProxyNode) ExportablePath() string {
	if n.Path == "" {
		return ""
	}
	if n.Path[0] == '/' {
		return n.Path
	}
	return "/" + n.Path
}

// IsLocal reports whether the node was added manually rather than parsed from a
// subscription source.
func (n *ProxyNode) IsLocal() bool {
	return n.SourceID == ""
}

// SupportsUDP reports whether the node's protocol can carry UDP traffic.
func (n *ProxyNode) SupportsUDP() bool {
	switch n.Kind {
	case KindHTTP, KindUnknown:
		return false
	case KindSnell:
		v := 4
		if n.Version != nil {
			v = *n.Version
		}
		return v >= 3
	default:
		return true
	}
}
