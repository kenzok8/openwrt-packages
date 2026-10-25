package generator

import "github.com/kenzok8/tower/internal/model"

type TargetCapability struct {
	Target      model.ClientTarget `json:"target"`
	Protocols   []model.ProxyKind  `json:"protocols"`
	Rules       bool               `json:"rules"`
	Strict      bool               `json:"strict"`
	DefaultRule string             `json:"default_rule,omitempty"`
}

var knownProxyKinds = []model.ProxyKind{
	model.KindShadowsocks, model.KindShadowsocksR, model.KindVMess, model.KindVLESS,
	model.KindTrojan, model.KindHysteria, model.KindHysteria2, model.KindTUIC,
	model.KindWireGuard, model.KindAnyTLS, model.KindSnell, model.KindSOCKS5, model.KindHTTP,
}

func TargetCapabilities() []TargetCapability {
	out := make([]TargetCapability, 0, len(model.AllClients))
	for _, target := range model.AllClients {
		family := target.Family()
		implemented := family == model.FamilyClash || family == model.FamilySurge || family == model.FamilyShadowrocket || family == model.FamilySingBox || family == model.FamilyDAE
		capability := TargetCapability{Target: target, Rules: implemented && family != model.FamilyV2Box, Strict: implemented}
		for _, kind := range knownProxyKinds {
			if supportsProtocol(target, kind) {
				capability.Protocols = append(capability.Protocols, kind)
			}
		}
		if family == model.FamilyDAE {
			capability.DefaultRule = "kenzok8-dae-native"
		}
		out = append(out, capability)
	}
	return out
}

func SupportsProtocol(target model.ClientTarget, kind model.ProxyKind) bool {
	return supportsProtocol(target, kind)
}

func supportsProtocol(target model.ClientTarget, kind model.ProxyKind) bool {
	if !target.Supported() {
		return false
	}
	known := false
	for _, candidate := range knownProxyKinds {
		if candidate == kind {
			known = true
			break
		}
	}
	if !known {
		return false
	}
	switch target.Family() {
	case model.FamilySingBox:
		switch kind {
		case model.KindShadowsocksR, model.KindWireGuard, model.KindUnknown:
			return false
		case model.KindSnell:
			// Only Clashoo's bundled sing-box 1.14+ core supports Snell.
			return target == model.ClientClashooSB
		default:
			return true
		}
	case model.FamilyDAE:
		switch kind {
		case model.KindShadowsocks, model.KindVMess, model.KindVLESS,
			model.KindTrojan, model.KindHysteria, model.KindHysteria2, model.KindTUIC,
			model.KindSOCKS5, model.KindAnyTLS:
			return true
		default:
			return false
		}
	case model.FamilyV2Box:
		return false
	case model.FamilyEgern:
		return false
	default:
		return kind != model.KindUnknown
	}
}
