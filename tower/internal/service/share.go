package service

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/kenzok8/tower/internal/model"
)

const shareFile = "local-share.json"

type localShare struct {
	TokenHash string `json:"token_hash"`
	Content   string `json:"content"`
	Type      string `json:"type"`
}

// ShareResult describes a newly created, single active local subscription.
// The token is returned once and only its hash is persisted.
type ShareResult struct {
	Token    string `json:"token"`
	Included int    `json:"included"`
	Skipped  int    `json:"skipped"`
}

// CreateLocalShare replaces the previous local subscription snapshot.
func (s *Service) CreateLocalShare(destination string, nodeIDs []string, schemeID string, preferRuleSets bool) (ShareResult, error) {
	return s.CreateLocalShareWithConsent(destination, nodeIDs, schemeID, preferRuleSets, "", nil)
}

// CreateLocalShareWithConsent applies the same preflight approval as file export.
func (s *Service) CreateLocalShareWithConsent(destination string, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string, acceptedDegradations []string) (ShareResult, error) {
	return s.createLocalShare(destination, nodeIDs, schemeID, preferRuleSets, planDigest, acceptedDegradations, false)
}

// CreateLocalShareStrict creates a share only after an exact strict preflight.
func (s *Service) CreateLocalShareStrict(destination string, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string) (ShareResult, error) {
	return s.CreateLocalShareStrictWithServiceRegions(destination, nodeIDs, schemeID, preferRuleSets, planDigest, nil)
}

func (s *Service) CreateLocalShareStrictWithServiceRegions(destination string, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string, regions map[string]string) (ShareResult, error) {
	if len(nodeIDs) == 0 {
		return ShareResult{}, fmt.Errorf("严格导出至少需要一个已选择的节点")
	}
	return s.createLocalShareWithRegions(destination, nodeIDs, schemeID, preferRuleSets, planDigest, nil, true, regions)
}

func (s *Service) createLocalShare(destination string, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string, acceptedDegradations []string, strict bool) (ShareResult, error) {
	return s.createLocalShareWithRegions(destination, nodeIDs, schemeID, preferRuleSets, planDigest, acceptedDegradations, strict, nil)
}

func (s *Service) createLocalShareWithRegions(destination string, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string, acceptedDegradations []string, strict bool, regions map[string]string) (ShareResult, error) {
	var content, contentType string
	var included, skipped int

	switch destination {
	case "daede":
		if schemeID != "" {
			return ShareResult{}, fmt.Errorf("%s 仅支持节点订阅，不支持规则方案", destination)
		}
		links, err := s.Links(nil, nodeIDs)
		if err != nil {
			return ShareResult{}, err
		}
		allowed := map[string]bool{
			"ss": true, "vmess": true, "vless": true, "trojan": true,
			"hysteria2": true, "tuic": true, "socks5": true,
		}
		var lines []string
		for _, link := range links {
			if allowed[link.Kind] && reusableShareLink(link.Kind, link.Link) {
				lines = append(lines, link.Link)
			} else {
				skipped++
			}
		}
		if len(lines) == 0 {
			return ShareResult{}, fmt.Errorf("所选节点没有 %s 支持的协议", destination)
		}
		content = strings.Join(lines, "\n") + "\n"
		contentType = "text/plain; charset=utf-8"
		included = len(lines)
	default:
		target := model.ClientTarget(destination)
		if !target.Supported() {
			return ShareResult{}, fmt.Errorf("unknown share destination: %s", destination)
		}
		var err error
		if strict {
			content, err = s.ExportStrictWithServiceRegions(target, nil, nodeIDs, schemeID, preferRuleSets, planDigest, regions)
		} else {
			content, err = s.ExportWithConsent(target, nil, nodeIDs, schemeID, preferRuleSets, planDigest, acceptedDegradations)
		}
		if err != nil {
			return ShareResult{}, err
		}
		contentType = "text/plain; charset=utf-8"
		if target.Family() == model.FamilySingBox {
			contentType = "application/json; charset=utf-8"
		}
		selected, err := s.selectedNodes(nodeIDs)
		if err != nil {
			return ShareResult{}, err
		}
		included = len(selected)
	}
	if len(content) > 16<<20 {
		return ShareResult{}, fmt.Errorf("共享内容超过 16 MiB 限制")
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return ShareResult{}, err
	}
	token := hex.EncodeToString(tokenBytes)
	hash := sha256.Sum256([]byte(token))
	if err := s.saveLocalShare(localShare{
		TokenHash: hex.EncodeToString(hash[:]), Content: content, Type: contentType,
	}); err != nil {
		return ShareResult{}, err
	}
	return ShareResult{Token: token, Included: included, Skipped: skipped}, nil
}

func reusableShareLink(kind, link string) bool {
	schemes := map[string][]string{
		"ss": {"ss"}, "vmess": {"vmess"}, "vless": {"vless"},
		"trojan": {"trojan"}, "hysteria": {"hysteria"},
		"hysteria2": {"hysteria2", "hy2"}, "tuic": {"tuic"},
		"anytls": {"anytls"}, "socks5": {"socks5", "socks"},
		"http": {"http", "https"},
	}
	for _, scheme := range schemes[kind] {
		if strings.HasPrefix(strings.ToLower(link), scheme+"://") {
			return true
		}
	}
	return false
}

// LocalShare returns the snapshot only for the exact active capability token.
func (s *Service) LocalShare(token string) (string, string, bool) {
	if len(token) != 64 {
		return "", "", false
	}
	if _, err := hex.DecodeString(token); err != nil {
		return "", "", false
	}
	share, err := s.loadLocalShare()
	if err != nil {
		return "", "", false
	}
	hash := sha256.Sum256([]byte(token))
	want, err := hex.DecodeString(share.TokenHash)
	if err != nil || subtle.ConstantTimeCompare(hash[:], want) != 1 {
		return "", "", false
	}
	return share.Content, share.Type, true
}

// RevokeLocalShare invalidates the active URL immediately.
func (s *Service) RevokeLocalShare() error {
	if err := s.Store.Prepare(); err != nil {
		return err
	}
	err := os.Remove(filepath.Join(s.Store.Dir(), shareFile))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func (s *Service) loadLocalShare() (localShare, error) {
	var share localShare
	if err := s.Store.Prepare(); err != nil {
		return share, err
	}
	data, err := os.ReadFile(filepath.Join(s.Store.Dir(), shareFile))
	if err != nil {
		return share, err
	}
	err = json.Unmarshal(data, &share)
	return share, err
}

func (s *Service) saveLocalShare(share localShare) error {
	dir := s.Store.Dir()
	if err := s.Store.Prepare(); err != nil {
		return err
	}
	file, err := os.CreateTemp(dir, ".local-share-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	defer file.Close()
	if err := file.Chmod(0o600); err != nil {
		return err
	}
	if err := json.NewEncoder(file).Encode(share); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	return os.Rename(file.Name(), filepath.Join(dir, shareFile))
}
