// Package service holds the core operations shared by the HTTP daemon and the
// CLI entry points: add/remove/refresh subscriptions and generate configs.
package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/kenzok8/tower/internal/generator"
	"github.com/kenzok8/tower/internal/model"
	"github.com/kenzok8/tower/internal/parser"
	"github.com/kenzok8/tower/internal/rules"
	"github.com/kenzok8/tower/internal/store"
)

// Service bundles the store with the subscription fetch path.
type Service struct {
	Store       *store.Store
	rulesDir    string
	ruleCache   *rules.Cache
	daeValidate func(context.Context, string) error
}

const nativeDAESchemeID = "kenzok8-dae-native"

// New creates a Service.
func New(st *store.Store) *Service {
	return &Service{
		Store:       st,
		rulesDir:    filepath.Join(st.Dir(), "rules"),
		ruleCache:   rules.NewCache(filepath.Join(st.Dir(), "rule-cache")),
		daeValidate: validateDAEConfig,
	}
}

// RefreshResult reports the outcome of refreshing one subscription.
type RefreshResult struct {
	ID       string `json:"id"`
	Nodes    int    `json:"nodes"`
	Rejected int    `json:"rejected"`
	Error    string `json:"error,omitempty"`
}

// AddSubscription inserts a new subscription source.
func (s *Service) AddSubscription(name, url, userAgent string) (model.SubscriptionSource, error) {
	if url == "" {
		return model.SubscriptionSource{}, fmt.Errorf("url is required")
	}
	if name == "" {
		name = url
	}
	sub := model.SubscriptionSource{
		ID:        model.NewID(),
		Name:      name,
		URL:       url,
		Enabled:   true,
		CreatedAt: time.Now(),
	}
	if userAgent != "" {
		sub.RequestOptions = &model.RequestOptions{UserAgent: userAgent}
	}
	if _, err := s.Store.Update(func(st *store.State) error {
		st.Subscriptions = append(st.Subscriptions, sub)
		return nil
	}); err != nil {
		return model.SubscriptionSource{}, err
	}
	return sub, nil
}

// ImportNodes parses a pasted config (URI list / Clash YAML / Surge INI / Base64)
// and appends the detected nodes as local nodes (no subscription source).
func (s *Service) ImportNodes(content string) (int, error) {
	parsed := parser.Parse([]byte(content), "")
	if len(parsed.Nodes) == 0 {
		return 0, fmt.Errorf("no nodes found in input")
	}
	_, err := s.Store.Update(func(st *store.State) error {
		st.Nodes = append(st.Nodes, parsed.Nodes...)
		return nil
	})
	if err != nil {
		return 0, err
	}
	return len(parsed.Nodes), nil
}

// UpdateOwnedNode updates one manually imported node without allowing callers
// to modify or replace subscription nodes.
func (s *Service) UpdateOwnedNode(node model.ProxyNode) error {
	if strings.TrimSpace(node.ID) == "" {
		return fmt.Errorf("node id is required")
	}
	if strings.TrimSpace(node.Name) == "" || strings.TrimSpace(node.Server) == "" {
		return fmt.Errorf("node name and server are required")
	}
	if node.Port < 1 || node.Port > 65535 {
		return fmt.Errorf("node port must be between 1 and 65535")
	}
	_, err := s.Store.Update(func(st *store.State) error {
		for i := range st.Nodes {
			if st.Nodes[i].ID != node.ID {
				continue
			}
			if st.Nodes[i].SourceID != "" {
				return fmt.Errorf("subscription nodes cannot be edited")
			}
			node.ID = st.Nodes[i].ID
			node.SourceID = st.Nodes[i].SourceID
			node.Kind = st.Nodes[i].Kind
			node.Name = strings.TrimSpace(node.Name)
			node.Server = strings.TrimSpace(node.Server)
			node.EffectiveRegion = ""
			st.Nodes[i] = node
			return nil
		}
		return fmt.Errorf("node not found: %s", node.ID)
	})
	return err
}

// RemoveOwnedNode deletes one manually imported node.
func (s *Service) RemoveOwnedNode(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return fmt.Errorf("node id is required")
	}
	removed := false
	_, err := s.Store.Update(func(st *store.State) error {
		var nodes []model.ProxyNode
		for _, node := range st.Nodes {
			if node.ID == id {
				if node.SourceID != "" {
					return fmt.Errorf("subscription nodes cannot be deleted here")
				}
				removed = true
				continue
			}
			nodes = append(nodes, node)
		}
		if !removed {
			return fmt.Errorf("node not found: %s", id)
		}
		st.Nodes = nodes
		return nil
	})
	return err
}

// RemoveSubscription deletes a subscription and its parsed nodes.
func (s *Service) RemoveSubscription(id string) error {
	_, err := s.Store.Update(func(st *store.State) error {
		var subs []model.SubscriptionSource
		for _, sub := range st.Subscriptions {
			if sub.ID != id {
				subs = append(subs, sub)
			}
		}
		st.Subscriptions = subs
		var nodes []model.ProxyNode
		for _, n := range st.Nodes {
			if n.SourceID != id {
				nodes = append(nodes, n)
			}
		}
		st.Nodes = nodes
		return nil
	})
	return err
}

// Refresh fetches and re-parses one subscription (id) or all (id == "").
func (s *Service) Refresh(id string) ([]RefreshResult, error) {
	state, err := s.Store.Load()
	if err != nil {
		return nil, err
	}
	var targets []model.SubscriptionSource
	if id != "" {
		for _, sub := range state.Subscriptions {
			if sub.ID == id {
				targets = append(targets, sub)
				break
			}
		}
	} else {
		targets = state.Subscriptions
	}
	if len(targets) == 0 {
		return nil, fmt.Errorf("subscription not found")
	}

	results := []RefreshResult{}
	_, err = s.Store.Update(func(st *store.State) error {
		for _, sub := range targets {
			var current *model.SubscriptionSource
			for i := range st.Subscriptions {
				if st.Subscriptions[i].ID == sub.ID {
					current = &st.Subscriptions[i]
					break
				}
			}
			if current == nil {
				continue
			}
			ua := ""
			if current.RequestOptions != nil {
				ua = current.RequestOptions.UserAgent
			}
			res := RefreshResult{ID: current.ID}
			body, usage, err := FetchSubscription(current.URL, ua)
			if err != nil {
				res.Error = err.Error()
				current.LastError = err.Error()
				results = append(results, res)
				continue
			}
			parsed := parser.Parse(body, current.ID)
			now := time.Now()
			current.LastUpdatedAt = &now
			current.LastError = ""
			current.Usage = usage
			if current.Usage == nil {
				current.Usage = parsed.Status
			}
			var nodes []model.ProxyNode
			for _, n := range st.Nodes {
				if n.SourceID != current.ID {
					nodes = append(nodes, n)
				}
			}
			nodes = append(nodes, parsed.Nodes...)
			st.Nodes = nodes
			res.Nodes = len(parsed.Nodes)
			res.Rejected = parsed.RejectedLineCount
			results = append(results, res)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return results, nil
}

// Export generates a configuration for the given client target. protocols is
// the set of enabled proxy kinds (nil = all); nodeIDs limits output to specific
// nodes (nil = all); schemeID selects a rule scheme (empty = built-in fallback).
func (s *Service) Export(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string) (string, error) {
	return s.ExportWithOptions(target, protocols, nodeIDs, schemeID, true)
}

// ExportWithOptions generates a configuration with an explicit preference for
// client-native remote rule sets.
func (s *Service) ExportWithOptions(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool) (string, error) {
	return s.ExportWithConsent(target, protocols, nodeIDs, schemeID, preferRuleSets, "", nil)
}

// ExportWithConsent binds a degraded sing-box export to the exact preflight
// plan and the differences accepted for this generation.
func (s *Service) ExportWithConsent(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string, acceptedDegradations []string) (string, error) {
	options, err := s.exportOptions(target, protocols, nodeIDs, schemeID, preferRuleSets, false)
	if err != nil {
		return "", err
	}
	options.PlanDigest = planDigest
	options.AcceptedDegradations = acceptedDegradations
	return generator.Generate(options)
}

// ExportStrict requires an explicit non-empty node selection and a matching
// exact preflight digest. Legacy ExportWithConsent retains its existing rules.
func (s *Service) ExportStrict(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string) (string, error) {
	return s.ExportStrictWithServiceRegions(target, protocols, nodeIDs, schemeID, preferRuleSets, planDigest, nil)
}

// ExportStrictWithServiceRegions exports a strict plan with temporary service
// country choices. The map is request-scoped and is not persisted.
func (s *Service) ExportStrictWithServiceRegions(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string, regions map[string]string) (string, error) {
	if len(nodeIDs) == 0 {
		return "", fmt.Errorf("严格导出至少需要一个已选择的节点")
	}
	options, err := s.exportOptionsWithServiceRegions(target, protocols, nodeIDs, schemeID, preferRuleSets, true, regions)
	if err != nil {
		return "", err
	}
	if len(generator.FilterNodes(options.Nodes, protocols)) == 0 {
		return "", fmt.Errorf("严格导出至少需要一个支持当前目标的已选择节点")
	}
	for _, node := range generator.FilterNodes(options.Nodes, protocols) {
		if !generator.SupportsProtocol(target, node.Kind) {
			return "", fmt.Errorf("严格导出包含当前客户端不支持的协议 %s", node.Kind)
		}
	}
	if target.Family() == model.FamilySingBox || target.Family() == model.FamilyDAE {
		options.Strict = true
		options.PlanDigest = planDigest
		content, err := generator.Generate(options)
		if err != nil {
			return "", err
		}
		// Honk 变体用 include system.dae 引用 honk 自带的全局配置，dae validate
		// 无法在临时目录里解析该引用（报 global required），交由 honk-core 导入时验证。
		if target == model.ClientDAE {
			if err := s.daeValidate(context.Background(), content); err != nil {
				return "", fmt.Errorf("设备 dae validate 未通过：%w", err)
			}
		}
		return content, nil
	}
	options.Strict = false
	content, err := generator.Generate(options)
	if err != nil {
		return "", err
	}
	if planDigest == "" || planDigest != strictRenderedDigest(options, content) {
		return "", fmt.Errorf("严格导出需要与当前预检完全匹配的计划摘要")
	}
	return content, nil
}

// PreflightExportWithOptions checks a sing-box-family export using the same
// selected nodes, scheme, and cached rule resources as the final export.
func (s *Service) PreflightExportWithOptions(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool) (generator.PreflightResult, error) {
	options, err := s.exportOptions(target, protocols, nodeIDs, schemeID, preferRuleSets, false)
	if err != nil {
		var inlineErr *inlineSourceError
		if errors.As(err, &inlineErr) {
			return generator.PreflightResult{
				Status:  generator.PreflightUnsupported,
				Issues:  []generator.PreflightIssue{{Code: inlineErr.code, Severity: "blocking", Location: inlineErr.location, Message: inlineErr.message}},
				Planned: []generator.PreflightItem{},
			}, nil
		}
		return generator.PreflightResult{}, err
	}
	if target.Family() == model.FamilyDAE {
		result := generator.DAEPreflight(options)
		if result.Status == generator.PreflightExact {
			options.Strict = true
			options.PlanDigest = result.PlanDigest
			content, generateErr := generator.Generate(options)
			if generateErr != nil {
				return generator.PreflightResult{Status: generator.PreflightUnsupported, PlanDigest: result.PlanDigest, Issues: []generator.PreflightIssue{{Code: "dae_render", Severity: "blocking", Location: "export", Message: "DAE 配置生成失败"}}, Planned: result.Planned}, nil
			}
			if target == model.ClientDAE {
				if validateErr := s.daeValidate(context.Background(), content); validateErr != nil {
					return generator.PreflightResult{Status: generator.PreflightUnsupported, PlanDigest: result.PlanDigest, Issues: []generator.PreflightIssue{{Code: "dae_validate", Severity: "blocking", Location: "export", Message: "设备 dae validate 未通过；当前 DAT 标签或配置需要修正"}}, Planned: result.Planned}, nil
				}
			}
		}
		return result, nil
	}
	return generator.Preflight(options), nil
}

// PreflightExportStrict never interprets an empty node list as "all nodes".
func (s *Service) PreflightExportStrict(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool) (generator.PreflightResult, error) {
	return s.PreflightExportStrictWithServiceRegions(target, protocols, nodeIDs, schemeID, preferRuleSets, nil)
}

// PreflightExportStrictWithServiceRegions validates a strict request with
// temporary service country choices. It never saves those choices.
func (s *Service) PreflightExportStrictWithServiceRegions(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool, regions map[string]string) (generator.PreflightResult, error) {
	options, err := s.exportOptionsWithServiceRegions(target, protocols, nodeIDs, schemeID, preferRuleSets, true, regions)
	if err != nil {
		var inlineErr *inlineSourceError
		if errors.As(err, &inlineErr) {
			return generator.PreflightResult{Status: generator.PreflightUnsupported, Issues: []generator.PreflightIssue{{Code: inlineErr.code, Severity: "blocking", Location: inlineErr.location, Message: inlineErr.message}}, Planned: []generator.PreflightItem{}}, nil
		}
		return generator.PreflightResult{}, err
	}
	options.Strict = true
	filtered := generator.FilterNodes(options.Nodes, protocols)
	if len(filtered) == 0 {
		return generator.PreflightResult{Status: generator.PreflightUnsupported, Issues: []generator.PreflightIssue{{Code: "nodes_empty", Severity: "blocking", Location: "nodes", Message: "严格导出至少需要一个支持当前目标的已选择节点"}}, Planned: []generator.PreflightItem{}}, nil
	}
	for _, node := range filtered {
		if !generator.SupportsProtocol(target, node.Kind) {
			return generator.PreflightResult{Status: generator.PreflightUnsupported, Issues: []generator.PreflightIssue{{Code: "node_protocol", Severity: "blocking", Location: "nodes", Message: fmt.Sprintf("当前客户端不支持协议 %s", node.Kind)}}, Planned: []generator.PreflightItem{}}, nil
		}
	}
	if target.Family() == model.FamilyDAE {
		result := generator.DAEPreflight(options)
		if result.Status != generator.PreflightExact {
			return result, nil
		}
		options.PlanDigest = result.PlanDigest
		content, generateErr := generator.Generate(options)
		if generateErr != nil {
			return generator.PreflightResult{Status: generator.PreflightUnsupported, PlanDigest: result.PlanDigest, Issues: []generator.PreflightIssue{{Code: "dae_render", Severity: "blocking", Location: "export", Message: "DAE 配置生成失败"}}, Planned: result.Planned}, nil
		}
		if target == model.ClientDAE {
			if validateErr := s.daeValidate(context.Background(), content); validateErr != nil {
				return generator.PreflightResult{Status: generator.PreflightUnsupported, PlanDigest: result.PlanDigest, Issues: []generator.PreflightIssue{{Code: "dae_validate", Severity: "blocking", Location: "export", Message: "设备 dae validate 未通过；当前 DAT 标签或配置需要修正"}}, Planned: result.Planned}, nil
			}
		}
		return result, nil
	}
	if target.Family() == model.FamilySingBox {
		return generator.Preflight(options), nil
	}
	options.Strict = false
	content, err := generator.Generate(options)
	if err != nil {
		return generator.PreflightResult{Status: generator.PreflightUnsupported, Issues: []generator.PreflightIssue{{Code: "render", Severity: "blocking", Location: "export", Message: err.Error()}}, Planned: []generator.PreflightItem{}}, nil
	}
	return generator.PreflightResult{Status: generator.PreflightExact, PlanDigest: strictRenderedDigest(options, content), Planned: []generator.PreflightItem{{Kind: "config", Name: target.Name(), Location: "export"}}}, nil
}

func strictRenderedDigest(options generator.Options, content string) string {
	options.Strict = false
	options.PlanDigest = ""
	options.AcceptedDegradations = nil
	payload, _ := json.Marshal(struct {
		Target         model.ClientTarget
		Nodes          []model.ProxyNode
		Protocols      []model.ProxyKind
		ServiceRegions map[string]string
		Scheme         *model.RuleScheme
		PreferRuleSets bool
		RuleSetLines   map[string][]string
		Content        string
	}{options.Target, options.Nodes, options.Protocols, options.ServiceRegions, options.Scheme, options.PreferRuleSets, options.RuleSetLines, content})
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

type inlineSourceError struct {
	code     string
	location string
	message  string
}

func (e *inlineSourceError) Error() string { return e.message }

func (s *Service) exportOptions(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets, strict bool) (generator.Options, error) {
	return s.exportOptionsWithServiceRegions(target, protocols, nodeIDs, schemeID, preferRuleSets, strict, nil)
}

func (s *Service) exportOptionsWithServiceRegions(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets, strict bool, serviceRegions map[string]string) (generator.Options, error) {
	var nodes []model.ProxyNode
	var err error
	if strict && len(nodeIDs) == 0 {
		nodes = []model.ProxyNode{}
	} else {
		nodes, err = s.selectedNodes(nodeIDs)
	}
	if err != nil {
		return generator.Options{}, err
	}
	var scheme *model.RuleScheme
	if schemeID != "" {
		if scheme, err = s.findScheme(schemeID); err != nil {
			return generator.Options{}, err
		}
	}
	if scheme != nil && len(serviceRegions) > 0 {
		prepared := generator.PrepareServiceRegionPolicy(generator.Options{
			Target: target, Nodes: nodes, Protocols: protocols, Scheme: scheme,
			PreferRuleSets: preferRuleSets, ServiceRegions: serviceRegions,
		})
		scheme = prepared.Scheme
	}
	lines := make(map[string][]string)
	if scheme != nil {
		inlineBytes := 0
		mrsYAMLBytes := 0
		seenInline := make(map[string][]string)
		for i, rule := range scheme.Rules {
			resource := rule.Resource
			if resource == nil && target == model.ClientClashooSB && preferRuleSets && !rule.Final {
				fields := strings.Split(rule.Body, ",")
				if len(fields) == 2 && strings.EqualFold(strings.TrimSpace(fields[0]), "GEOIP") && strings.EqualFold(strings.TrimSpace(fields[1]), "CN") {
					mapped := generator.SingBoxGeoIPCNRuleSet()
					resource = &mapped
				}
			}
			if resource == nil {
				continue
			}
			if target.Family() == model.FamilyDAE {
				if _, mapped := generator.DAENativeRuleSet(scheme.ID, *resource); mapped {
					continue
				}
			}
			if target.Family() == model.FamilySurge || target.Family() == model.FamilyShadowrocket || target.Family() == model.FamilyDAE {
				if sourceURL, mapped := generator.MRSYAMLSourceURL(*resource); mapped {
					if _, loaded := lines[sourceURL]; loaded {
						continue
					}
					cached, cacheErr := s.ruleCache.LinesLimited(sourceURL, 8<<20)
					if cacheErr == nil {
						cacheErr = generator.ValidateMRSYAMLSource(*resource, []byte(strings.Join(cached, "\n")))
					}
					if cacheErr != nil {
						cacheErr = s.ruleCache.DownloadWithPolicy(sourceURL, 8<<20, "raw.githubusercontent.com", func(body []byte) error {
							return generator.ValidateMRSYAMLSource(*resource, body)
						})
						if cacheErr == nil {
							cached, cacheErr = s.ruleCache.LinesLimited(sourceURL, 8<<20)
						}
					}
					if cacheErr != nil {
						return generator.Options{}, fmt.Errorf("获取 MRS 对应的 YAML 规则源 %s 失败：%w", sourceURL, cacheErr)
					}
					mrsYAMLBytes += len(strings.Join(cached, "\n"))
					if mrsYAMLBytes > 32<<20 {
						return generator.Options{}, fmt.Errorf("MRS 对应的 YAML 规则源总大小超过 32 MiB")
					}
					lines[sourceURL] = cached
					continue
				}
			}
			if target == model.ClientClashooSB && preferRuleSets {
				if sourceURL, mapped := generator.ClashooInlineSourceURL(*resource); mapped {
					location := fmt.Sprintf("rules[%d].resource", i)
					cached, alreadyLoaded := seenInline[sourceURL]
					if !alreadyLoaded {
						var cacheErr error
						cached, cacheErr = s.ruleCache.LinesLimited(sourceURL, 4<<20)
						if cacheErr != nil {
							cacheErr = s.ruleCache.DownloadWithPolicy(sourceURL, 4<<20, "raw.githubusercontent.com", func(body []byte) error {
								_, err := generator.ParseClashooInlineRuleSet(body)
								return err
							})
							if cacheErr == nil {
								cached, cacheErr = s.ruleCache.LinesLimited(sourceURL, 4<<20)
							}
						}
						if cacheErr != nil {
							return generator.Options{}, &inlineSourceError{code: "resource_cache", location: location, message: fmt.Sprintf("获取 Clashoo inline 规则源 %s 失败：%v", sourceURL, cacheErr)}
						}
						body := []byte(strings.Join(cached, "\n"))
						if len(body) > 4<<20 {
							return generator.Options{}, &inlineSourceError{code: "resource_size", location: location, message: fmt.Sprintf("Clashoo inline 规则源超过 4 MiB：%s", sourceURL)}
						}
						if _, err := generator.ParseClashooInlineRuleSet(body); err != nil {
							return generator.Options{}, &inlineSourceError{code: "resource_source", location: location, message: fmt.Sprintf("Clashoo inline 规则源无效 %s：%v", sourceURL, err)}
						}
						inlineBytes += len(body)
						if inlineBytes > 6<<20 {
							return generator.Options{}, &inlineSourceError{code: "resource_size", location: location, message: "Clashoo inline 规则源总大小超过 6 MiB"}
						}
						seenInline[sourceURL] = cached
					}
					lines[resource.URL] = cached
					continue
				}
			}
			if cached, err := s.ruleCache.Lines(resource.URL); err == nil {
				lines[resource.URL] = cached
				continue
			}
			// 首次导出时惰性下载未缓存的规则集，避免预检因冷缓存失败。
			if s.ruleCache.Download(resource.URL) == nil {
				if cached, err := s.ruleCache.Lines(resource.URL); err == nil {
					lines[resource.URL] = cached
					continue
				}
			}
			if name := rules.LocalRuleFilename(resource.URL); name != "" {
				if b, err := os.ReadFile(filepath.Join(s.rulesDir, name)); err == nil {
					lines[resource.URL] = strings.Split(string(b), "\n")
				}
			}
		}
	}
	return generator.Options{
		Target: target, Nodes: nodes, Protocols: protocols, Scheme: scheme,
		PreferRuleSets: preferRuleSets, RuleSetLines: lines, Strict: strict,
		ServiceRegions: serviceRegions,
	}, nil
}

// Schemes returns the bundled presets followed by user-imported schemes.
func (s *Service) Schemes() ([]model.RuleScheme, error) {
	bundled, err := rules.LoadBundled(s.rulesDir)
	if err != nil {
		return nil, err
	}
	state, err := s.Store.Load()
	if err != nil {
		return nil, err
	}
	out := make([]model.RuleScheme, 0, len(bundled)+len(state.Schemes))
	for _, b := range bundled {
		out = append(out, *b)
		if b.ID == "kenzok8-rules" {
			out = append(out, *nativeDAEScheme(b))
		}
	}
	out = append(out, state.Schemes...)
	return out, nil
}

// Scheme returns one full compact model for the LuCI details view.
func (s *Service) Scheme(id string) (*model.RuleScheme, error) {
	if strings.TrimSpace(id) == "" {
		return nil, fmt.Errorf("scheme id is required")
	}
	scheme, err := s.findScheme(id)
	if err != nil {
		return nil, err
	}
	copy := *scheme
	copy.RawConfig = ""
	return &copy, nil
}

// SchemeSummary is the compact list representation used by LuCI and rpcd.
type SchemeSummary struct {
	ID         string             `json:"id"`
	Name       string             `json:"name"`
	TargetOnly model.ClientTarget `json:"target_only,omitempty"`
	Summary    string             `json:"summary,omitempty"`
	SourceURL  string             `json:"source_url,omitempty"`
	IsBundled  bool               `json:"is_bundled,omitempty"`
	Groups     int                `json:"groups"`
	Rules      int                `json:"rules"`
	RuleSets   int                `json:"rule_sets"`
	Cached     bool               `json:"cached"`
}

// SchemeSummaries returns counts without sending rule bodies through rpcd.
func (s *Service) SchemeSummaries() ([]SchemeSummary, error) {
	schemes, err := s.Schemes()
	if err != nil {
		return nil, err
	}
	out := make([]SchemeSummary, 0, len(schemes))
	for _, scheme := range schemes {
		summary := SchemeSummary{
			ID: scheme.ID, Name: scheme.Name, TargetOnly: scheme.TargetOnly, Summary: scheme.Summary,
			SourceURL: publicSourceURL(scheme.SourceURL), IsBundled: scheme.IsBundled,
			Groups: len(scheme.Groups), Cached: true,
		}
		for _, rule := range scheme.Rules {
			if rule.Resource == nil {
				if rule.Final || rule.Body != "" {
					summary.Rules++
				}
				continue
			}
			summary.RuleSets++
			if sourceURL, mapped := generator.MRSYAMLSourceURL(*rule.Resource); mapped {
				lines, err := s.ruleCache.LinesLimited(sourceURL, 8<<20)
				if err != nil {
					summary.Cached = false
					continue
				}
				count, err := generator.CountMRSYAMLSourceRules(*rule.Resource, []byte(strings.Join(lines, "\n")))
				if err != nil {
					summary.Cached = false
					continue
				}
				summary.Rules += count
				continue
			}
			lines, err := s.cachedRuleLines(rule.Resource.URL)
			if err != nil {
				summary.Cached = false
				continue
			}
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line != "" && !strings.HasPrefix(line, "#") && !strings.HasPrefix(line, ";") && !strings.HasPrefix(line, "//") {
					summary.Rules++
				}
			}
		}
		out = append(out, summary)
	}
	return out, nil
}

func publicSourceURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	u.User = nil
	u.RawQuery = ""
	u.Fragment = ""
	return u.String()
}

func (s *Service) cachedRuleLines(rawURL string) ([]string, error) {
	if lines, err := s.ruleCache.Lines(rawURL); err == nil {
		return lines, nil
	}
	if name := rules.LocalRuleFilename(rawURL); name != "" {
		if b, err := os.ReadFile(filepath.Join(s.rulesDir, name)); err == nil {
			return strings.Split(string(b), "\n"), nil
		}
	}
	return nil, fmt.Errorf("local ruleset cache missing")
}

// AddScheme parses a rule configuration and persists it as a user scheme.
func (s *Service) AddScheme(name, configText, sourceURL string) (model.RuleScheme, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.RuleScheme{}, fmt.Errorf("scheme name is required")
	}
	if strings.TrimSpace(configText) == "" {
		return model.RuleScheme{}, fmt.Errorf("config text is required")
	}
	scheme, err := rules.Parse(configText, nil)
	if err != nil {
		return model.RuleScheme{}, err
	}
	scheme.ID = model.NewID()
	scheme.Name = strings.TrimSpace(name)
	scheme.SourceURL = sourceURL
	// The source document may contain node credentials; the scheme model already
	// holds only groups and rules, so never persist the unfiltered source text.
	scheme.RawConfig = ""
	scheme.IsBundled = false
	if _, err := s.Store.Update(func(st *store.State) error {
		for _, existing := range st.Schemes {
			if strings.EqualFold(existing.Name, name) {
				return fmt.Errorf("规则方案名称已存在")
			}
		}
		st.Schemes = append(st.Schemes, *scheme)
		return nil
	}); err != nil {
		return model.RuleScheme{}, err
	}
	return *scheme, nil
}

// RenameScheme gives an imported scheme a distinct, user-managed label.
func (s *Service) RenameScheme(id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return fmt.Errorf("规则方案名称不能为空")
	}
	_, err := s.Store.Update(func(st *store.State) error {
		index := -1
		for i, scheme := range st.Schemes {
			if scheme.ID == id {
				index = i
			} else if strings.EqualFold(scheme.Name, name) {
				return fmt.Errorf("规则方案名称已存在")
			}
		}
		if index < 0 {
			return fmt.Errorf("找不到已导入的规则方案")
		}
		st.Schemes[index].Name = name
		return nil
	})
	return err
}

// AddSchemeFromURL fetches a complete rule configuration and imports only its
// groups, rules and remote rule resources.
func (s *Service) AddSchemeFromURL(name, sourceURL string) (model.RuleScheme, error) {
	if strings.TrimSpace(name) == "" {
		return model.RuleScheme{}, fmt.Errorf("scheme name is required")
	}
	u, err := rules.RawFileURL(sourceURL)
	if err != nil {
		return model.RuleScheme{}, err
	}
	client := &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 || req.URL.Scheme != "https" {
			return fmt.Errorf("unsafe or excessive redirect")
		}
		return nil
	}}
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return model.RuleScheme{}, err
	}
	req.Header.Set("User-Agent", "Tower/0.1")
	resp, err := client.Do(req)
	if err != nil {
		return model.RuleScheme{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return model.RuleScheme{}, fmt.Errorf("配置下载失败：HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20+1))
	if err != nil {
		return model.RuleScheme{}, err
	}
	if len(body) > 8<<20 {
		return model.RuleScheme{}, fmt.Errorf("配置文件超过 8 MiB 限制")
	}
	return s.AddScheme(name, string(body), sourceURL)
}

// RefreshSchemeRulesets refreshes every unique usable remote resource referenced
// by a scheme. A failed download leaves the previous cached copy untouched.
func (s *Service) RefreshSchemeRulesets(id string) (int, int, error) {
	scheme, err := s.findScheme(id)
	if err != nil {
		return 0, 0, err
	}
	seen := make(map[string]bool)
	updated, failed := 0, 0
	for _, rule := range scheme.Rules {
		if rule.Resource == nil {
			continue
		}
		sourceURL := rule.Resource.URL
		if mappedURL, mapped := generator.MRSYAMLSourceURL(*rule.Resource); mapped {
			sourceURL = mappedURL
		}
		if seen[sourceURL] {
			continue
		}
		seen[sourceURL] = true
		if sourceURL == rule.Resource.URL {
			err = s.ruleCache.Download(sourceURL)
		} else {
			err = s.ruleCache.DownloadWithPolicy(sourceURL, 8<<20, "raw.githubusercontent.com", func(body []byte) error {
				return generator.ValidateMRSYAMLSource(*rule.Resource, body)
			})
		}
		if err != nil {
			failed++
		} else {
			updated++
		}
	}
	return updated, failed, nil
}

// RemoveScheme deletes a user-imported scheme. Bundled schemes are immutable.
func (s *Service) RemoveScheme(id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("scheme id is required")
	}
	bundled, err := rules.LoadBundled(s.rulesDir)
	if err != nil {
		return err
	}
	for _, scheme := range bundled {
		if scheme.ID == id {
			return fmt.Errorf("bundled schemes cannot be removed")
		}
	}
	var removed model.RuleScheme
	updated, err := s.Store.Update(func(st *store.State) error {
		var out []model.RuleScheme
		for _, sc := range st.Schemes {
			if sc.ID == id {
				removed = sc
				continue
			}
			out = append(out, sc)
		}
		if removed.ID == "" {
			return fmt.Errorf("scheme not found: %s", id)
		}
		st.Schemes = out
		return nil
	})
	if err != nil {
		return err
	}
	used := make(map[string]bool)
	for _, scheme := range updated.Schemes {
		for _, rule := range scheme.Rules {
			if rule.Resource != nil {
				used[rule.Resource.URL] = true
				if sourceURL, mapped := generator.MRSYAMLSourceURL(*rule.Resource); mapped {
					used[sourceURL] = true
				}
			}
		}
	}
	for _, scheme := range bundled {
		for _, rule := range scheme.Rules {
			if rule.Resource != nil {
				used[rule.Resource.URL] = true
				if sourceURL, mapped := generator.MRSYAMLSourceURL(*rule.Resource); mapped {
					used[sourceURL] = true
				}
			}
		}
	}
	for _, rule := range removed.Rules {
		if rule.Resource != nil {
			if !used[rule.Resource.URL] {
				s.ruleCache.Remove(rule.Resource.URL)
			}
			if sourceURL, mapped := generator.MRSYAMLSourceURL(*rule.Resource); mapped && !used[sourceURL] {
				s.ruleCache.Remove(sourceURL)
			}
		}
	}
	return nil
}

// findScheme locates a scheme by id across bundled presets and user schemes.
func (s *Service) findScheme(id string) (*model.RuleScheme, error) {
	bundled, err := rules.LoadBundled(s.rulesDir)
	if err != nil {
		return nil, err
	}
	for _, b := range bundled {
		if b.ID == id {
			return b, nil
		}
		if id == nativeDAESchemeID && b.ID == "kenzok8-rules" {
			return nativeDAEScheme(b), nil
		}
	}
	state, err := s.Store.Load()
	if err != nil {
		return nil, err
	}
	for i := range state.Schemes {
		if state.Schemes[i].ID == id {
			return &state.Schemes[i], nil
		}
	}
	return nil, fmt.Errorf("scheme not found: %s", id)
}

func nativeDAEScheme(source *model.RuleScheme) *model.RuleScheme {
	clone := *source
	clone.ID = nativeDAESchemeID
	clone.Name = "kenzok8 · DAE 原生（自动测速）"
	clone.TargetOnly = model.ClientDAE
	clone.Summary = "按 DAE 专用策略将 MetaCubeX 规则集映射到本机 geosite/geoip DAT 标签；规则与顺序保持，生成前需由设备 dae validate 核验标签。"
	clone.IsBundled = true
	clone.RawConfig = ""
	clone.NetworkSettings = nil
	clone.Groups = make([]model.RuleSchemeGroup, 0, len(source.Groups))
	directGroups := map[string]bool{"🌐 直连": true, "🎯 全球直连": true, "🍎 Apple": true}
	usedGroups := make(map[string]bool, len(source.Rules))
	for _, rule := range source.Rules {
		if !directGroups[rule.Group] {
			usedGroups[rule.Group] = true
		}
	}
	for _, group := range source.Groups {
		if directGroups[group.Name] || !usedGroups[group.Name] {
			continue
		}
		group.Kind = model.KindDAENativeAuto
		group.URL = ""
		group.Interval = 0
		group.Tolerance = 0
		group.Members = []model.RuleGroupMember{{Type: model.MemberNodePattern, Value: ".*"}}
		clone.Groups = append(clone.Groups, group)
	}
	clone.Rules = make([]model.RuleSchemeRule, len(source.Rules))
	for i, rule := range source.Rules {
		if directGroups[rule.Group] {
			rule.Group = "DIRECT"
		}
		if rule.Resource != nil {
			resource := *rule.Resource
			resource.Options = append([]string(nil), rule.Resource.Options...)
			rule.Resource = &resource
		}
		rule.Options = append([]string(nil), rule.Options...)
		clone.Rules[i] = rule
	}
	return &clone
}

// Links converts nodes to shareable subscription links (one per node).
// protocols and nodeIDs filter the node set exactly like Export.
func (s *Service) Links(protocols []model.ProxyKind, nodeIDs []string) ([]generator.LinkResult, error) {
	nodes, err := s.selectedNodes(nodeIDs)
	if err != nil {
		return nil, err
	}
	nodes = generator.FilterNodes(nodes, protocols)
	return generator.Links(nodes), nil
}

// Nodes returns stored proxy nodes without subscription announcements.
func (s *Service) Nodes() ([]model.ProxyNode, error) {
	state, err := s.Store.Load()
	if err != nil {
		return nil, err
	}
	nodes := parser.UsableNodes(state.Nodes)
	for i := range nodes {
		nodes[i].EffectiveRegion = generator.EffectiveRegion(nodes[i])
	}
	return nodes, nil
}

// selectedNodes loads the stored nodes, optionally narrowed to the given ids.
func (s *Service) selectedNodes(nodeIDs []string) ([]model.ProxyNode, error) {
	nodes, err := s.Nodes()
	if err != nil {
		return nil, err
	}
	if len(nodeIDs) == 0 {
		return nodes, nil
	}
	want := make(map[string]bool, len(nodeIDs))
	for _, id := range nodeIDs {
		want[id] = true
	}
	filtered := make([]model.ProxyNode, 0, len(nodes))
	for _, n := range nodes {
		if want[n.ID] {
			filtered = append(filtered, n)
			delete(want, n.ID)
		}
	}
	if len(want) != 0 {
		return nil, fmt.Errorf("所选节点已不存在，请刷新页面后重试")
	}
	return filtered, nil
}

// ParseNodeIDs splits a comma-separated node id list.
func ParseNodeIDs(raw string) []string {
	if raw == "" {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	for _, part := range strings.Split(raw, ",") {
		id := strings.TrimSpace(part)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// ParseProtocols splits a comma-separated protocol list into ProxyKind values.
func ParseProtocols(raw string) []model.ProxyKind {
	if raw == "" {
		return nil
	}
	seen := map[model.ProxyKind]bool{}
	var out []model.ProxyKind
	for _, part := range strings.Split(raw, ",") {
		k := model.ProxyKind(strings.TrimSpace(part))
		if k == "" || k == model.KindUnknown || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
	}
	return out
}

// FetchSubscription downloads a subscription payload.
//
// An empty userAgent means "auto": it tries a sequence of common client UAs and
// accepts the first response that parses to nodes. Airports that only support
// non-Clash formats return a Base64 share link regardless of UA, which the
// parser also understands, so the first attempt usually succeeds.
func FetchSubscription(url, userAgent string) ([]byte, *model.SubscriptionUsage, error) {
	if strings.TrimSpace(userAgent) != "" {
		return fetchOnce(url, userAgent)
	}

	for _, ua := range []string{"clash-verge/v2.4.2", "ClashMeta", "ClashForWindows/0.20.39", "Clash"} {
		body, usage, err := fetchOnce(url, ua)
		if err != nil {
			continue
		}
		if len(parser.Parse(body, "").Nodes) > 0 {
			return body, usage, nil
		}
	}
	return nil, nil, fmt.Errorf("no nodes found at %s", url)
}

func fetchOnce(url, userAgent string) ([]byte, *model.SubscriptionUsage, error) {
	client := &http.Client{Timeout: 20 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	resp, err := client.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 50<<20))
	if err != nil {
		return nil, nil, err
	}
	return body, parseSubscriptionUserinfo(resp.Header.Get("Subscription-Userinfo")), nil
}

func parseSubscriptionUserinfo(value string) *model.SubscriptionUsage {
	usage := &model.SubscriptionUsage{}
	found := false
	for _, item := range strings.Split(value, ";") {
		key, raw, ok := strings.Cut(strings.TrimSpace(item), "=")
		if !ok {
			continue
		}
		n, err := strconv.ParseInt(strings.TrimSpace(raw), 10, 64)
		if err != nil || n < 0 {
			continue
		}
		switch strings.ToLower(strings.TrimSpace(key)) {
		case "upload":
			usage.UploadBytes, found = n, true
		case "download":
			usage.DownloadBytes, found = n, true
		case "total":
			usage.TotalBytes, found = n, true
		case "expire":
			if n > 0 {
				expires := time.Unix(n, 0)
				usage.ExpiresAt, found = &expires, true
			}
		}
	}
	if !found {
		return nil
	}
	return usage
}
