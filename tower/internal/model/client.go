package model

// ClientTarget identifies a downstream client that can consume a generated
// configuration. Raw values match the Swift enum's serialized forms.
type ClientTarget string

const (
	ClientSurge        ClientTarget = "surge"
	ClientSurgeMac     ClientTarget = "surge-mac"
	ClientStash        ClientTarget = "clash" // tower labels "clash" as Stash
	ClientShadowrocket ClientTarget = "shadowrocket"
	ClientLoon         ClientTarget = "loon"
	ClientQuanX        ClientTarget = "quanx"
	ClientHiddify      ClientTarget = "hiddify"
	ClientEgern        ClientTarget = "egern"
	ClientV2Box        ClientTarget = "v2box"
	ClientClashApple   ClientTarget = "clash-apple"
	ClientSingBox      ClientTarget = "sing-box"
	ClientClashMi      ClientTarget = "clash-mi"
	ClientClashVerge   ClientTarget = "clash-verge"
	ClientClashMac     ClientTarget = "clashmac"
	ClientFlClash      ClientTarget = "flclash"
	ClientMihomoParty  ClientTarget = "mihomo-party"
	ClientKaring       ClientTarget = "karing"
	ClientOpenClash    ClientTarget = "openclash"
	ClientNikki        ClientTarget = "nikki"
	ClientClashoo      ClientTarget = "clashoo-mihomo"
	ClientClashooSB    ClientTarget = "clashoo-singbox"
	ClientMomo         ClientTarget = "momo"
	ClientDAE          ClientTarget = "dae-config"
	ClientHonk         ClientTarget = "honk-config"
)

// AllClients lists every supported client target in a stable order.
var AllClients = []ClientTarget{
	ClientShadowrocket,
	ClientSurge,
	ClientSurgeMac,
	ClientStash,
	ClientClashApple,
	ClientClashVerge,
	ClientClashMac,
	ClientFlClash,
	ClientMihomoParty,
	ClientClashMi,
	ClientKaring,
	ClientLoon,
	ClientQuanX,
	ClientEgern,
	ClientV2Box,
	ClientHiddify,
	ClientSingBox,
	ClientOpenClash,
	ClientNikki,
	ClientClashoo,
	ClientClashooSB,
	ClientMomo,
	ClientDAE,
	ClientHonk,
}

// Supported reports whether a target is an advertised export destination.
func (c ClientTarget) Supported() bool {
	for _, target := range AllClients {
		if c == target {
			return true
		}
	}
	return false
}

// Name returns the human-facing display name.
func (c ClientTarget) Name() string {
	switch c {
	case ClientSurge:
		return "Surge"
	case ClientSurgeMac:
		return "Surge Mac"
	case ClientStash:
		return "Stash"
	case ClientShadowrocket:
		return "Shadowrocket"
	case ClientLoon:
		return "Loon"
	case ClientQuanX:
		return "Quantumult X"
	case ClientHiddify:
		return "Hiddify"
	case ClientEgern:
		return "Egern"
	case ClientV2Box:
		return "V2Box"
	case ClientClashApple:
		return "Clash"
	case ClientSingBox:
		return "sing-box MT"
	case ClientClashMi:
		return "Clash Mi"
	case ClientClashVerge:
		return "Clash Verge"
	case ClientClashMac:
		return "ClashMac"
	case ClientFlClash:
		return "FlClash"
	case ClientMihomoParty:
		return "Mihomo Party"
	case ClientKaring:
		return "Karing"
	case ClientOpenClash:
		return "OpenClash"
	case ClientNikki:
		return "Nikki"
	case ClientClashoo:
		return "Clashoo (Mihomo)"
	case ClientClashooSB:
		return "Clashoo (sing-box)"
	case ClientMomo:
		return "Momo"
	case ClientDAE:
		return "dae config"
	case ClientHonk:
		return "Honk config"
	default:
		return string(c)
	}
}

// FormatFamily groups clients that share a generator. It drives which config
// family the generator emits for a given target.
type FormatFamily int

const (
	FamilyClash        FormatFamily = iota // Clash / mihomo YAML
	FamilySurge                            // Surge / Surge Mac INI
	FamilyShadowrocket                     // Shadowrocket INI
	FamilyLoon                             // Loon INI
	FamilyQuanX                            // Quantumult X INI
	FamilySingBox                          // sing-box JSON (sing-box MT, Hiddify)
	FamilyEgern                            // Egern YAML
	FamilyV2Box                            // V2Box node-only subscription
	FamilyDAE                              // Native dae DSL
)

// Family returns the generator family for a client target.
func (c ClientTarget) Family() FormatFamily {
	switch c {
	case ClientSurge, ClientSurgeMac:
		return FamilySurge
	case ClientStash, ClientClashApple, ClientClashVerge, ClientClashMac,
		ClientFlClash, ClientMihomoParty, ClientClashMi, ClientKaring,
		ClientOpenClash, ClientNikki, ClientClashoo:
		return FamilyClash
	case ClientShadowrocket:
		return FamilyShadowrocket
	case ClientLoon:
		return FamilyLoon
	case ClientQuanX:
		return FamilyQuanX
	case ClientHiddify, ClientSingBox, ClientClashooSB, ClientMomo:
		return FamilySingBox
	case ClientDAE, ClientHonk:
		return FamilyDAE
	case ClientEgern:
		return FamilyEgern
	case ClientV2Box:
		return FamilyV2Box
	default:
		return FamilyClash
	}
}
