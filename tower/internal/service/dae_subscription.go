package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/kenzok8/tower/internal/generator"
	"github.com/kenzok8/tower/internal/model"
	"github.com/kenzok8/tower/internal/parser"
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
	reason   string
	nodes    []model.ProxyNode
	fetched  time.Time
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
			fallbacks = append(fallbacks, fmt.Sprintf("订阅 %q 已展开为节点：%s", sub.Name, check.reason))
			continue
		}
		candidates = append(candidates, candidate{sub: sub, check: check})
	}
	if len(candidates) == 0 {
		return nil, fallbacks, nil
	}

	// honk hashes each endpoint into its own node id and rejects a whole
	// subscription when one id is already taken by an inline node, so a passthrough
	// is only provable when the export inlines nothing: collisions inside the
	// subscription itself are de-duplicated by honk without a rejection.
	if target == model.ClientHonk {
		eligible := make(map[string]bool, len(candidates))
		for _, c := range candidates {
			eligible[c.sub.ID] = true
		}
		for _, node := range selected {
			if !eligible[node.SourceID] {
				fallbacks = append(fallbacks, fmt.Sprintf("honk 需要内联其它节点（%q），订阅透传会因节点 ID 冲突被整条拒绝，已展开为节点", node.Name))
				return nil, fallbacks, nil
			}
		}
	}
	var subs []generator.DAESubscription
	covered := make([]string, 0, len(candidates))
	for _, c := range candidates {
		entry := generator.DAESubscription{
			Tag:       fmt.Sprintf("sub_%03d", len(subs)+1),
			URL:       c.sub.URL,
			NodeNames: daeNodeNames(c.check.nodes),
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
