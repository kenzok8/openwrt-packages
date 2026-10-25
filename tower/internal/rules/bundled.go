package rules

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

// BundledScheme describes a rule scheme shipped inside the plugin package.
type BundledScheme struct {
	File        string // scheme filename relative to the rules directory
	ID          string
	Name        string
	Summary     string
	SourceURL   string
	RemoteRules bool
}

// Bundled lists the packaged ACL4SSR, Self-Configuration, and kenzok8 presets.
var Bundled = []BundledScheme{
	{
		File:    "ACL4SSR_Online.ini",
		ID:      "acl4ssr-online",
		Name:    "ACL4SSR 默认",
		Summary: "去广告、自动测速，含国外媒体、电报、微软和苹果分流。",
	},
	{
		File:    "ACL4SSR_Online_Full.ini",
		ID:      "acl4ssr-full",
		Name:    "ACL4SSR 全分组",
		Summary: "最完整的分组：流媒体、AI、游戏、音乐，并按节点名分出地区组。",
	},
	{
		File:        "Self_Configuration.ini",
		ID:          "self-configuration",
		Name:        "Self-Configuration",
		Summary:     "ClashConnectRules 的 Self-Configuration 方案，包含地区、媒体、AI 与常用服务分组。",
		SourceURL:   "https://github.com/ClashConnectRules/Self-Configuration/blob/main/Clash.yaml",
		RemoteRules: true,
	},
	{
		File:        "Kenzok8.yaml",
		ID:          "kenzok8-rules",
		Name:        "kenzok8方案",
		Summary:     "kenzok8个人方案，包含地区、媒体、AI 与常用服务分组",
		RemoteRules: true,
	},
}

// LoadBundled parses every bundled preset from dir (the directory holding the
// shipped scheme, .ini, and .list files). Remote ruleset URLs inside the presets are
// resolved against the local .list files instead of the network.
func LoadBundled(dir string) ([]*model.RuleScheme, error) {
	resolver := func(source string) ([]string, error) {
		name := LocalRuleFilename(source)
		if name == "" {
			return nil, fmt.Errorf("unresolvable ruleset %s", source)
		}
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, fmt.Errorf("missing bundled ruleset %s: %w", name, err)
		}
		return strings.Split(string(b), "\n"), nil
	}

	out := make([]*model.RuleScheme, 0, len(Bundled))
	for _, b := range Bundled {
		data, err := os.ReadFile(filepath.Join(dir, b.File))
		if err != nil {
			return nil, fmt.Errorf("missing bundled scheme %s: %w", b.File, err)
		}
		parseResolver := Resolver(resolver)
		if b.RemoteRules {
			parseResolver = nil
		}
		scheme, err := Parse(string(data), parseResolver)
		if err != nil {
			return nil, fmt.Errorf("parse bundled scheme %s: %w", b.File, err)
		}
		scheme.ID = b.ID
		scheme.Name = b.Name
		scheme.Summary = b.Summary
		scheme.SourceURL = b.SourceURL
		if scheme.SourceURL == "" && strings.HasPrefix(b.File, "ACL4SSR_") {
			scheme.SourceURL = "https://github.com/ACL4SSR/ACL4SSR"
		}
		scheme.IsBundled = true
		scheme.RawConfig = string(data)
		out = append(out, scheme)
	}
	return out, nil
}
