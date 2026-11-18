package parser

import (
	"net"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

func clashHosts(raw map[string]any) map[string]string {
	table := make(map[string]string, len(raw))
	for key, value := range raw {
		key = strings.ToLower(strings.TrimSpace(key))
		host := key
		for _, prefix := range []string{"+.", "*.", "."} {
			if strings.HasPrefix(host, prefix) {
				host = strings.TrimPrefix(host, prefix)
				break
			}
		}
		if _, ok := clashHostsTarget(host); !ok {
			continue
		}
		if values := list(value); values != nil {
			if len(values) == 0 {
				continue
			}
			value = values[0]
		}
		if target, ok := clashHostsTarget(str(value)); ok {
			table[key] = target
		}
	}
	return table
}

func clashHostsTarget(raw string) (string, bool) {
	host := strings.ToLower(strings.TrimSpace(raw))
	if ip := net.ParseIP(normalizedHost(host)); ip != nil {
		return normalizedHost(host), true
	}
	if len(host) > 253 || !strings.Contains(host, ".") {
		return "", false
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return "", false
		}
		for _, ch := range label {
			if !(ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9' || ch == '-') {
				return "", false
			}
		}
	}
	return host, true
}

func clashHostsLookup(name string, table map[string]string) string {
	if exact := table[name]; exact != "" {
		return exact
	}
	if plus := table["+."+name]; plus != "" {
		return plus
	}
	labels := strings.Split(name, ".")
	for i := 1; i < len(labels); i++ {
		parent := strings.Join(labels[i:], ".")
		if i == 1 {
			if star := table["*."+parent]; star != "" {
				return star
			}
		}
		if plus := table["+."+parent]; plus != "" {
			return plus
		}
		if dot := table["."+parent]; dot != "" {
			return dot
		}
	}
	return ""
}

func applyClashHosts(node *model.ProxyNode, table map[string]string) {
	original := strings.ToLower(node.Server)
	if len(table) == 0 || net.ParseIP(original) != nil {
		return
	}
	target := original
	seen := map[string]bool{target: true}
	for net.ParseIP(target) == nil {
		next := clashHostsLookup(target, table)
		if next == "" {
			break
		}
		if seen[next] {
			return
		}
		seen[next] = true
		target = next
	}
	if target == original {
		return
	}
	// Pin protocol defaults before replacing the address used for dialling.
	usesTLS := node.TLS || node.UsesReality() || node.Kind == model.KindHysteria || node.Kind == model.KindHysteria2 || node.Kind == model.KindTUIC || node.Kind == model.KindAnyTLS
	if usesTLS && node.SNI == "" {
		node.SNI = original
	}
	switch node.Transport {
	case "ws", "httpupgrade", "h2", "http", "xhttp":
		if node.HostHeader == "" {
			node.HostHeader = original
		}
	}
	node.Server = target
}
