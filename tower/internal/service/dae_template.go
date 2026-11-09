package service

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kenzok8/tower/internal/generator"
	"github.com/kenzok8/tower/internal/model"
)

const (
	daeTemplateTTL       = time.Hour
	daeTemplateMaxBytes  = 2 << 20
	daeTemplateTimeout   = 8 * time.Second
	daeTemplateCacheDir  = "dae-template-cache"
	daeTemplateCacheMode = 0o600
)

type daeTemplateSnapshot struct {
	TemplateID string    `json:"template_id"`
	SourceURL  string    `json:"source_url,omitempty"`
	SHA256     string    `json:"sha256"`
	FetchedAt  time.Time `json:"fetched_at"`
	Content    string    `json:"content"`
}

func daeTemplateID(target model.ClientTarget) (string, error) {
	primary, _, err := daeTemplateSources(target)
	return primary, err
}

func daeTemplateSources(target model.ClientTarget) (string, string, error) {
	switch target {
	case model.ClientDAE:
		return "https://raw.githubusercontent.com/kenzok8/ruleset/main/dae/config.dae", "https://cdn.jsdelivr.net/gh/kenzok8/ruleset@main/dae/config.dae", nil
	case model.ClientHonk:
		return "https://raw.githubusercontent.com/kenzok8/ruleset/main/honk/config.dae", "https://cdn.jsdelivr.net/gh/kenzok8/ruleset@main/honk/config.dae", nil
	default:
		return "", "", fmt.Errorf("配置模板仅支持 dae 和 Honk")
	}
}

func knownDAETemplateURL(rawURL string) bool {
	for _, target := range []model.ClientTarget{model.ClientDAE, model.ClientHonk} {
		primary, fallback, err := daeTemplateSources(target)
		if err == nil && (rawURL == primary || rawURL == fallback) {
			return true
		}
	}
	return false
}

func allowedDAETemplateHost(host string) bool {
	return host == "raw.githubusercontent.com" || host == "cdn.jsdelivr.net"
}

var errDAETemplateRedirectRejected = errors.New("配置模板重定向目标无效")

func (s *Service) daeTemplateOptions(target model.ClientTarget, selected []model.ProxyNode, protocols []model.ProxyKind, strict bool) (generator.Options, error) {
	if s.Store == nil {
		return generator.Options{}, fmt.Errorf("机场订阅数据不可用")
	}
	state, err := s.Store.Load()
	if err != nil {
		return generator.Options{}, err
	}
	selectedSources := make([]string, 0)
	seenSources := make(map[string]bool)
	manualNodes := make([]model.ProxyNode, 0, len(selected))
	for _, node := range selected {
		if node.IsSubscriptionMetadata != nil && *node.IsSubscriptionMetadata {
			continue
		}
		if node.SourceID == "" {
			manualNodes = append(manualNodes, node)
			continue
		}
		if !seenSources[node.SourceID] {
			seenSources[node.SourceID] = true
			selectedSources = append(selectedSources, node.SourceID)
		}
	}

	sources := make(map[string]model.SubscriptionSource, len(state.Subscriptions))
	for _, source := range state.Subscriptions {
		sources[source.ID] = source
	}
	usedTags := make(map[string]bool, len(selectedSources))
	subscriptions := make([]generator.DAESubscription, 0, len(selectedSources))
	for i, sourceID := range selectedSources {
		source, ok := sources[sourceID]
		if !ok || strings.TrimSpace(source.URL) == "" || source.URL != strings.TrimSpace(source.URL) {
			return generator.Options{}, &inlineSourceError{code: "subscription_source", location: fmt.Sprintf("subscriptions[%d]", i), message: "所选节点关联的机场订阅记录或原始链接不可用"}
		}
		knownNodes := make([]model.ProxyNode, 0)
		for _, node := range state.Nodes {
			if node.SourceID != sourceID || node.IsSubscriptionMetadata != nil && *node.IsSubscriptionMetadata {
				continue
			}
			if !generator.SupportsProtocol(target, node.Kind) {
				return generator.Options{}, &inlineSourceError{
					code: "subscription_protocol", location: fmt.Sprintf("subscriptions[%d]", i),
					message: fmt.Sprintf("机场订阅 %q 含有 %s 不支持的协议 %s", source.Name, target.Name(), node.Kind),
				}
			}
			knownNodes = append(knownNodes, node)
		}
		if len(knownNodes) == 0 {
			return generator.Options{}, &inlineSourceError{code: "subscription_source", location: fmt.Sprintf("subscriptions[%d]", i), message: fmt.Sprintf("机场订阅 %q 没有已存节点可供校验", source.Name)}
		}
		subscription := generator.DAESubscription{
			Tag: daeSubscriptionTag(source.Name, i+1, usedTags), URL: daeTemplateSubscriptionURL(target, source.URL), NodeNames: daeNodeNames(knownNodes),
		}
		if target == model.ClientHonk {
			subscription.UserAgent = daeSubscriptionUserAgent
		}
		subscriptions = append(subscriptions, subscription)
	}
	return generator.Options{
		Target: target, Nodes: manualNodes, Protocols: protocols, Strict: strict, DAESubscriptions: subscriptions,
	}, nil
}

func daeTemplateSubscriptionURL(target model.ClientTarget, raw string) string {
	if target != model.ClientDAE {
		return raw
	}
	u, err := url.Parse(raw)
	if err != nil || !strings.Contains(u.Path, "/link/") || u.RawQuery == "" {
		return raw
	}
	parts := strings.Split(u.RawQuery, "&")
	kept := make([]string, 0, len(parts)+1)
	hasClash, hasMu := false, false
	for _, part := range parts {
		if part == "" {
			continue
		}
		rawKey := strings.SplitN(part, "=", 2)[0]
		key, err := url.QueryUnescape(rawKey)
		if err != nil {
			return raw
		}
		if key == "clash" {
			hasClash = true
			continue
		}
		if key == "mu" {
			hasMu = true
		}
		kept = append(kept, part)
	}
	if !hasClash {
		return raw
	}
	if !hasMu {
		kept = append(kept, "mu=1")
	}
	queryStart := strings.IndexByte(raw, '?')
	queryEnd := len(raw)
	if fragment := strings.IndexByte(raw[queryStart+1:], '#'); fragment >= 0 {
		queryEnd = queryStart + 1 + fragment
	}
	return raw[:queryStart+1] + strings.Join(kept, "&") + raw[queryEnd:]
}

func (s *Service) loadDAETemplate(ctx context.Context, target model.ClientTarget, refreshExpired bool) (daeTemplateSnapshot, error) {
	templateID, _, err := daeTemplateSources(target)
	if err != nil {
		return daeTemplateSnapshot{}, err
	}
	path, err := s.daeTemplateCachePath(target)
	if err != nil {
		return daeTemplateSnapshot{}, err
	}
	cached, cacheErr := readDAETemplateCache(path, templateID, target)
	if !refreshExpired {
		if cacheErr != nil {
			return daeTemplateSnapshot{}, fmt.Errorf("没有可用的已预检配置模板，请重新预检")
		}
		return cached, nil
	}
	if cacheErr == nil && time.Since(cached.FetchedAt) < daeTemplateTTL && !cached.FetchedAt.After(time.Now().Add(time.Minute)) {
		return cached, nil
	}
	body, sourceURL, fetchErr := downloadDAETemplateWithFallback(ctx, target)
	if fetchErr == nil {
		fetchErr = generator.ValidateDAETemplate(target, body)
	}
	if fetchErr != nil {
		if cacheErr == nil || !os.IsNotExist(cacheErr) {
			return daeTemplateSnapshot{}, fmt.Errorf("配置模板缓存已过期，更新失败；保留旧缓存并停止预检：%w", fetchErr)
		}
		return daeTemplateSnapshot{}, fmt.Errorf("获取配置模板失败：%w", fetchErr)
	}
	snapshot := daeTemplateSnapshot{
		TemplateID: templateID,
		SourceURL:  sourceURL,
		SHA256:     digestTemplate(body),
		FetchedAt:  time.Now().UTC(),
		Content:    string(body),
	}
	if err := writeDAETemplateCache(path, snapshot); err != nil {
		return daeTemplateSnapshot{}, fmt.Errorf("保存已验证的配置模板失败：%w", err)
	}
	return snapshot, nil
}

func (s *Service) daeTemplateCachePath(target model.ClientTarget) (string, error) {
	if s.Store == nil {
		return "", fmt.Errorf("配置模板缓存目录不可用")
	}
	dir := filepath.Join(s.Store.Dir(), daeTemplateCacheDir)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	info, err := os.Lstat(dir)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("配置模板缓存路径无效")
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return "", err
	}
	name := "dae.json"
	if target == model.ClientHonk {
		name = "honk.json"
	}
	return filepath.Join(dir, name), nil
}

func readDAETemplateCache(path, templateID string, target model.ClientTarget) (daeTemplateSnapshot, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return daeTemplateSnapshot{}, err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return daeTemplateSnapshot{}, fmt.Errorf("配置模板缓存文件类型无效")
	}
	if err := os.Chmod(path, daeTemplateCacheMode); err != nil {
		return daeTemplateSnapshot{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		return daeTemplateSnapshot{}, err
	}
	data, readErr := io.ReadAll(io.LimitReader(file, int64(3*daeTemplateMaxBytes+(64<<10))))
	closeErr := file.Close()
	if readErr != nil {
		return daeTemplateSnapshot{}, readErr
	}
	if closeErr != nil {
		return daeTemplateSnapshot{}, closeErr
	}
	var snapshot daeTemplateSnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return daeTemplateSnapshot{}, err
	}
	body := []byte(snapshot.Content)
	if snapshot.TemplateID != templateID || snapshot.SHA256 != digestTemplate(body) || snapshot.FetchedAt.IsZero() || snapshot.FetchedAt.After(time.Now().Add(time.Minute)) || len(body) > daeTemplateMaxBytes {
		return daeTemplateSnapshot{}, fmt.Errorf("配置模板缓存摘要无效")
	}
	if snapshot.SourceURL != "" && snapshot.SourceURL != templateID && snapshot.SourceURL != fallbackTemplateURL(target) {
		return daeTemplateSnapshot{}, fmt.Errorf("配置模板缓存来源无效")
	}
	if err := generator.ValidateDAETemplate(target, body); err != nil {
		return daeTemplateSnapshot{}, err
	}
	return snapshot, nil
}

func writeDAETemplateCache(path string, snapshot daeTemplateSnapshot) error {
	data, err := json.Marshal(snapshot)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".dae-template-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(daeTemplateCacheMode); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, path)
}

func daeTemplateHTTPClient() *http.Client {
	return &http.Client{
		Timeout: daeTemplateTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 || req.URL.Scheme != "https" || !allowedDAETemplateHost(req.URL.Host) {
				return errDAETemplateRedirectRejected
			}
			return nil
		},
	}
}

func fallbackTemplateURL(target model.ClientTarget) string {
	_, fallback, _ := daeTemplateSources(target)
	return fallback
}

func downloadDAETemplateWithFallback(parent context.Context, target model.ClientTarget) ([]byte, string, error) {
	if err := parent.Err(); err != nil {
		return nil, "", err
	}
	primary, fallback, err := daeTemplateSources(target)
	if err != nil {
		return nil, "", err
	}
	client := daeTemplateHTTPClient()
	body, status, retryable, primaryErr := downloadDAETemplate(parent, client, primary)
	if primaryErr == nil {
		return body, primary, nil
	}
	if !shouldFallbackDAETemplate(parent, status, retryable, primaryErr) {
		return nil, "", primaryErr
	}
	body, _, _, fallbackErr := downloadDAETemplate(parent, client, fallback)
	if fallbackErr != nil {
		return nil, "", fmt.Errorf("配置模板主源失败，固定备用源也不可用：%w", fallbackErr)
	}
	return body, fallback, nil
}

func shouldFallbackDAETemplate(parent context.Context, status int, retryable bool, err error) bool {
	if !retryable || err == nil || parent.Err() != nil || errors.Is(err, errDAETemplateRedirectRejected) || isDAETemplateCertificateError(err) {
		return false
	}
	return status == 0 || status == http.StatusOK || status >= http.StatusInternalServerError && status <= 599
}

func isDAETemplateCertificateError(err error) bool {
	var verificationErr *tls.CertificateVerificationError
	if errors.As(err, &verificationErr) {
		return true
	}
	var unknownAuthorityErr x509.UnknownAuthorityError
	if errors.As(err, &unknownAuthorityErr) {
		return true
	}
	var hostnameErr x509.HostnameError
	if errors.As(err, &hostnameErr) {
		return true
	}
	var invalidCertificateErr x509.CertificateInvalidError
	return errors.As(err, &invalidCertificateErr)
}

func downloadDAETemplate(parent context.Context, client *http.Client, rawURL string) ([]byte, int, bool, error) {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || u.Scheme != "https" || !allowedDAETemplateHost(u.Host) || u.User != nil || u.RawQuery != "" || u.Fragment != "" || !knownDAETemplateURL(u.String()) {
		return nil, 0, false, fmt.Errorf("配置模板地址无效")
	}
	ctx, cancel := context.WithTimeout(parent, daeTemplateTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, false, err
	}
	req.Header.Set("User-Agent", "Tower/0.1")
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, true, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, resp.StatusCode >= http.StatusInternalServerError && resp.StatusCode <= 599, fmt.Errorf("配置模板下载返回 HTTP %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, daeTemplateMaxBytes+1))
	if err != nil {
		return nil, resp.StatusCode, true, err
	}
	if len(body) > daeTemplateMaxBytes {
		return nil, resp.StatusCode, false, fmt.Errorf("配置模板超过大小限制")
	}
	return body, resp.StatusCode, false, nil
}

func digestTemplate(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}

func daeTemplateErrorResult(err error) generator.PreflightResult {
	return generator.PreflightResult{
		Status:  generator.PreflightUnsupported,
		Issues:  []generator.PreflightIssue{{Code: "template_unavailable", Severity: "blocking", Location: "template", Message: err.Error()}},
		Planned: []generator.PreflightItem{},
	}
}
