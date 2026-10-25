package parser

import (
	"strconv"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

// parseSurgeConfiguration reads SS proxy lines from a Surge/Shadowrocket INI
// profile's [Proxy] section. Other sections can contain ordinary HTTPS URLs
// which must never be mistaken for proxy links. Non-SS lines are rejected, as
// the Swift parser does.
func parseSurgeConfiguration(text, sourceID string) ParsedContent {
	var nodes []model.ProxyNode
	rejected := 0
	inside := false

	for _, rawLine := range strings.Split(text, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") ||
			strings.HasPrefix(line, ";") || strings.HasPrefix(line, "//") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") && !strings.Contains(line, "=") {
			inside = strings.EqualFold(line, "[Proxy]")
			continue
		}
		if !inside {
			continue
		}
		if n := parseSurgeShadowsocksLine(line, sourceID); n != nil {
			nodes = append(nodes, *n)
		} else {
			rejected++
		}
	}

	if len(nodes) == 0 && rejected == 0 {
		rejected = 1
	}
	return ParsedContent{
		Nodes:             nodes,
		RejectedLineCount: rejected,
	}
}

func parseSurgeShadowsocksLine(raw, sourceID string) *model.ProxyNode {
	sep := strings.IndexByte(raw, '=')
	if sep < 0 {
		return nil
	}
	name := strings.TrimSpace(raw[:sep])
	fields := surgeProxyFields(raw[sep+1:])
	if name == "" || len(fields) < 3 ||
		!strings.EqualFold(fields[0], "ss") || fields[1] == "" {
		return nil
	}
	port, err := strconv.Atoi(fields[2])
	if err != nil {
		return nil
	}

	options := map[string]string{}
	for _, field := range fields[3:] {
		eq := strings.IndexByte(field, '=')
		if eq < 0 {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(field[:eq]))
		val := surgeProxyScalar(field[eq+1:])
		options[key] = val
	}

	cipher := firstNonEmpty(options["encrypt-method"], options["method"], options["cipher"])
	password := options["password"]
	if cipher == "" || password == "" {
		return nil
	}
	var udpRelayEnabled *bool
	if value, present := options["udp-relay"]; present {
		var ok bool
		udpRelayEnabled, ok = udpRelayPreference(value)
		if !ok {
			return nil
		}
	}
	server := normalizedHost(fields[1])
	return &model.ProxyNode{
		SourceID:        sourceID,
		Kind:            model.KindShadowsocks,
		Name:            normalizedName(name, server),
		Server:          server,
		Port:            port,
		Cipher:          cipher,
		Password:        password,
		Obfs:            options["obfs"],
		ObfsParam:       options["obfs-host"],
		UDPRelayEnabled: udpRelayEnabled,
		RawURI:          raw,
	}
}

// surgeProxyFields splits a Surge proxy value on commas, honoring quotes.
func surgeProxyFields(value string) []string {
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
			fields = append(fields, surgeProxyScalar(current))
			current = ""
		} else {
			current += string(r)
		}
	}
	fields = append(fields, surgeProxyScalar(current))
	return fields
}

func surgeProxyScalar(value string) string {
	t := strings.TrimSpace(value)
	if len(t) >= 2 {
		first, last := t[0], t[len(t)-1]
		if (first == '"' || first == '\'') && first == last {
			t = t[1 : len(t)-1]
		}
	}
	return percentDecode(t)
}
