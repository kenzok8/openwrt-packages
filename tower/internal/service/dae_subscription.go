package service

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kenzok8/tower/internal/generator"
	"github.com/kenzok8/tower/internal/model"
	"github.com/kenzok8/tower/internal/parser"
	"github.com/kenzok8/tower/internal/store"
)

// daeSubscriptionUserAgent asks airports for the URI/base64 list that dae and
// honk can read inside their `subscription` block. Any user agent containing
// "clash" makes most airports answer with mihomo YAML instead, which dae cannot
// parse, so the passthrough check always fetches with this one.
const daeSubscriptionUserAgent = "v2rayN/6.31"

// daeSubscriptionCacheTTL keeps the preflight → export sequence of one click
// from fetching every airport endpoint twice.
const daeSubscriptionCacheTTL = 10 * time.Minute

type daeSubscriptionCheck struct {
	eligible bool
	// local marks a subscription published as a Tower-generated URI list instead of
	// the airport URL, because the airport only serves mihomo YAML.
	local   bool
	reason  string
	nodes   []model.ProxyNode
	fetched time.Time
}

// daeSubscriptionPlan decides which airport endpoints the exported dae/honk
// config fetches on its own. A subscription is passed through only when the
// export already contains all of its nodes and the endpoint answers with a URI
// list the core can parse; every other case keeps the inline node expansion so
// an export never silently loses nodes.
// daeSubscriptionPlan decides which airport endpoints the exported config fetches
// itself. The second return value lists the node sources that are covered by a
// passthrough subscription: those nodes must not be inlined any more, or the core
// would end up with two copies of every endpoint.
func (s *Service) daeSubscriptionPlan(target model.ClientTarget, selected []model.ProxyNode) ([]generator.DAESubscription, []string, []string) {
	st, err := s.Store.Load()
	if err != nil {
		return nil, nil, nil
	}
	selectedIDs := make(map[string]bool, len(selected))
	for _, node := range selected {
		selectedIDs[node.ID] = true
	}
	type candidate struct {
		sub   model.SubscriptionSource
		check daeSubscriptionCheck
	}
	var candidates []candidate
	var fallbacks []string
	for _, sub := range st.Subscriptions {
		if !sub.Enabled || strings.TrimSpace(sub.URL) == "" {
			continue
		}
		total, chosen := 0, 0
		for _, node := range st.Nodes {
			if node.SourceID != sub.ID {
				continue
			}
			total++
			if selectedIDs[node.ID] {
				chosen++
			}
		}
		if total == 0 {
			continue
		}
		if chosen != total {
			fallbacks = append(fallbacks, fmt.Sprintf("订阅 %q 只选中了部分节点，已展开为节点", sub.Name))
			continue
		}
		check := s.checkDAESubscription(target, sub)
		if !check.eligible {
			// 机场只给 mihomo YAML 时 dae/honk 无法直接吃这个地址，退回"Tower 转成
			// URI 列表落到内核配置目录 + file:// 相对路径"的订阅写法。
			if nodes := daeLinkableNodes(target, st, sub.ID); len(nodes) > 0 {
				check.local = true
				check.nodes = nodes
				candidates = append(candidates, candidate{sub: sub, check: check})
				continue
			}
			fallbacks = append(fallbacks, fmt.Sprintf("订阅 %q 已展开为节点：%s", sub.Name, check.reason))
			continue
		}
		candidates = append(candidates, candidate{sub: sub, check: check})
	}
	if len(candidates) == 0 {
		return nil, fallbacks, nil
	}

	// honk hashes each endpoint into its own node id and rejects a *whole* subscription
	// when one id is already taken by an inline node. Passing subscriptions through is
	// still the format users want, so it is allowed next to inline nodes and the risk
	// is reported instead of silently blocking the feature.
	if target == model.ClientHonk {
		inline := 0
		eligible := make(map[string]bool, len(candidates))
		for _, c := range candidates {
			eligible[c.sub.ID] = true
		}
		for _, node := range selected {
			if !eligible[node.SourceID] {
				inline++
			}
		}
		if inline > 0 {
			fallbacks = append(fallbacks, fmt.Sprintf("同时内联了 %d 个节点：若订阅里的某个节点与它们端点相同，honk 会拒绝整条订阅并在日志里提示", inline))
		}
	}
	var subs []generator.DAESubscription
	usedTags := make(map[string]bool, len(candidates))
	covered := make([]string, 0, len(candidates))
	for _, c := range candidates {
		tag := daeSubscriptionTag(c.sub.Name, len(subs)+1, usedTags)
		entry := generator.DAESubscription{
			Tag:       tag,
			URL:       c.sub.URL,
			NodeNames: daeNodeNames(c.check.nodes),
		}
		if c.check.local {
			localURL, writeErr := s.writeDAESubscriptionFile(target, tag, c.check.nodes)
			if writeErr != nil {
				fallbacks = append(fallbacks, fmt.Sprintf("订阅 %q 已展开为节点：写入本机订阅文件失败（%v）", c.sub.Name, writeErr))
				delete(usedTags, tag)
				continue
			}
			entry.URL = localURL
			entry.UserAgent = ""
			entry.Local = true
		}
		if target == model.ClientHonk {
			// honk can pin the download user agent; without it most airports answer
			// with mihomo YAML, which the core cannot parse.
			entry.UserAgent = daeSubscriptionUserAgent
		}
		subs = append(subs, entry)
		covered = append(covered, c.sub.ID)
	}
	return subs, fallbacks, covered
}

func daeNodeNames(nodes []model.ProxyNode) []string {
	out := make([]string, 0, len(nodes))
	for _, node := range nodes {
		if name := strings.TrimSpace(node.Name); name != "" {
			out = append(out, name)
		}
	}
	return out
}

func (s *Service) checkDAESubscription(target model.ClientTarget, sub model.SubscriptionSource) daeSubscriptionCheck {
	key := string(target) + "|" + sub.URL
	s.daeSubMu.Lock()
	cached, ok := s.daeSubCache[key]
	s.daeSubMu.Unlock()
	if ok && time.Since(cached.fetched) < daeSubscriptionCacheTTL {
		return cached
	}

	check := daeSubscriptionCheck{fetched: time.Now()}
	body, _, err := fetchOnce(sub.URL, daeSubscriptionUserAgent)
	switch {
	case err != nil:
		check.reason = fmt.Sprintf("拉取失败（%v）", err)
	case !parser.IsURIListPayload(body):
		check.reason = "机场返回 mihomo/Clash 格式，dae 订阅只接受 URI/Base64 列表"
	default:
		parsed := parser.Parse(body, sub.ID)
		if len(parsed.Nodes) == 0 {
			check.reason = "机场返回的列表里没有可解析的节点"
			break
		}
		if kind, ok := unsupportedDAESubscriptionKind(target, parsed.Nodes); !ok {
			check.reason = fmt.Sprintf("订阅含 %s 节点，%s 内核不支持", kind, target.Name())
			break
		}
		check.eligible, check.nodes = true, parsed.Nodes
	}

	s.daeSubMu.Lock()
	if s.daeSubCache == nil {
		s.daeSubCache = make(map[string]daeSubscriptionCheck)
	}
	s.daeSubCache[key] = check
	s.daeSubMu.Unlock()
	return check
}

// unsupportedDAESubscriptionKind reports the first protocol the target core
// cannot dial. dae parses a subscription as one document, so a single unknown
// link can invalidate the whole fetch.
func unsupportedDAESubscriptionKind(target model.ClientTarget, nodes []model.ProxyNode) (model.ProxyKind, bool) {
	for _, node := range nodes {
		if !generator.SupportsProtocol(target, node.Kind) {
			return node.Kind, false
		}
	}
	return "", true
}

// daeSubscriptionTag derives the dae subscription tag from the airport name so the
// exported config reads `subscription { mying: ... }` instead of `sub_001`. Only
// identifier-safe ASCII survives; anything else falls back to a positional tag.
func daeSubscriptionTag(name string, index int, used map[string]bool) string {
	cleaned := make([]rune, 0, len(name))
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '_', r == '-':
			cleaned = append(cleaned, r)
		case r == ' ':
			cleaned = append(cleaned, '_')
		}
	}
	tag := strings.Trim(string(cleaned), "_-")
	if tag == "" || (tag[0] >= '0' && tag[0] <= '9') {
		tag = fmt.Sprintf("sub_%03d", index)
	}
	for used[tag] {
		tag += "_"
	}
	used[tag] = true
	return tag
}

// daeLinkableNodes returns the stored nodes of a subscription that can be written as
// a dae/honk readable URI list.
func daeLinkableNodes(target model.ClientTarget, st *store.State, sourceID string) []model.ProxyNode {
	client := target
	if client != model.ClientHonk {
		client = model.ClientDAE
	}
	var out []model.ProxyNode
	for _, node := range st.Nodes {
		if node.SourceID != sourceID || !generator.SupportsProtocol(client, node.Kind) {
			continue
		}
		if node.IsSubscriptionMetadata != nil && *node.IsSubscriptionMetadata {
			continue
		}
		if generator.Link(node) == "" {
			continue
		}
		out = append(out, node)
	}
	return out
}

// daeSubscriptionDir is the directory, relative to the core's config directory, that
// holds Tower-generated URI lists. dae rejects absolute file:// paths, so the
// exported config references `file://tower/<tag>.sub` and this directory must live
// next to config.dae (/etc/dae or /etc/honk).
const daeSubscriptionRelDir = "tower"

// daeSubscriptionStoreDir holds URI lists published for cores that cannot read a
// local file (honk only accepts http(s)).
func (s *Service) daeSubscriptionStoreDir() string {
	return filepath.Join(s.Store.Dir(), "dae-subs")
}

// DAESubscriptionFile returns a published URI list by tag, for the loopback server.
func (s *Service) DAESubscriptionFile(tag string) (string, bool) {
	tag = strings.TrimSpace(tag)
	if tag == "" || strings.ContainsAny(tag, "/\\..") {
		return "", false
	}
	body, err := os.ReadFile(filepath.Join(s.daeSubscriptionStoreDir(), tag+".sub"))
	if err != nil {
		return "", false
	}
	return string(body), true
}

// daeConfigDir is where the target core reads its config from.
func daeConfigDir(target model.ClientTarget) string {
	if target == model.ClientHonk {
		return "/etc/honk"
	}
	return "/etc/dae"
}

// writeDAESubscriptionFile publishes one subscription's nodes as a URI list inside the
// core's config directory and returns the file:// URL to reference.
func (s *Service) writeDAESubscriptionFile(target model.ClientTarget, tag string, nodes []model.ProxyNode) (string, error) {
	dir := filepath.Join(daeConfigDir(target), daeSubscriptionRelDir)
	if target == model.ClientHonk {
		// honk only accepts http(s): publish under the data directory and reference the
		// loopback endpoint that Tower serves it from.
		dir = s.daeSubscriptionStoreDir()
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	lines := make([]string, 0, len(nodes))
	for _, node := range nodes {
		if link := generator.Link(node); link != "" {
			lines = append(lines, link)
		}
	}
	if len(lines) == 0 {
		return "", fmt.Errorf("没有可写成 URI 列表的节点")
	}
	path := filepath.Join(dir, tag+".sub")
	tmp, err := os.CreateTemp(dir, ".tower-*.tmp")
	if err != nil {
		return "", err
	}
	name := tmp.Name()
	defer os.Remove(name)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return "", err
	}
	if _, err := tmp.WriteString(strings.Join(lines, "\n") + "\n"); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(name, path); err != nil {
		return "", err
	}
	if target == model.ClientHonk {
		return fmt.Sprintf("http://%s/daesub/v1/%s", s.loopbackListen(), tag), nil
	}
	return "file://" + daeSubscriptionRelDir + "/" + tag + ".sub", nil
}

// loopbackListen returns the address the local API server binds to.
func (s *Service) loopbackListen() string {
	if listen := strings.TrimSpace(os.Getenv("TOWER_LISTEN")); listen != "" {
		return listen
	}
	return "127.0.0.1:7443"
}
