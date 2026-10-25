package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/kenzok8/tower/internal/model"
)

const (
	exportDir       = "/tmp/tower-exports"
	exportMaxBytes  = 16 << 20
	exportChunkSize = 128 << 10
	exportTTL       = 5 * time.Minute
)

type ExportBeginResult struct {
	ID     string `json:"id"`
	Size   int    `json:"size"`
	SHA256 string `json:"sha256"`
}

type ExportReadResult struct {
	Offset int    `json:"offset"`
	Next   int    `json:"next"`
	EOF    bool   `json:"eof"`
	Data   string `json:"data"`
}

func (s *Service) BeginExport(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string, acceptedDegradations []string) (ExportBeginResult, error) {
	content, err := s.ExportWithConsent(target, protocols, nodeIDs, schemeID, preferRuleSets, planDigest, acceptedDegradations)
	if err != nil {
		return ExportBeginResult{}, err
	}
	return s.beginExportContent(content)
}

func (s *Service) BeginExportStrict(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string) (ExportBeginResult, error) {
	return s.BeginExportStrictWithServiceRegions(target, protocols, nodeIDs, schemeID, preferRuleSets, planDigest, nil)
}

func (s *Service) BeginExportStrictWithServiceRegions(target model.ClientTarget, protocols []model.ProxyKind, nodeIDs []string, schemeID string, preferRuleSets bool, planDigest string, regions map[string]string) (ExportBeginResult, error) {
	content, err := s.ExportStrictWithServiceRegions(target, protocols, nodeIDs, schemeID, preferRuleSets, planDigest, regions)
	if err != nil {
		return ExportBeginResult{}, err
	}
	return s.beginExportContent(content)
}

func (s *Service) beginExportContent(content string) (ExportBeginResult, error) {
	data := []byte(content)
	if len(data) > exportMaxBytes {
		return ExportBeginResult{}, fmt.Errorf("导出内容超过 16 MiB 限制")
	}
	if err := ensureExportDir(); err != nil {
		return ExportBeginResult{}, err
	}
	lock, err := lockExportDir()
	if err != nil {
		return ExportBeginResult{}, err
	}
	defer unlockExportDir(lock)
	if err := cleanupExports(); err != nil {
		return ExportBeginResult{}, err
	}
	entries, err := os.ReadDir(exportDir)
	if err != nil {
		return ExportBeginResult{}, err
	}
	active := 0
	for _, entry := range entries {
		if validExportToken(entry.Name()) && entry.Type().IsRegular() {
			active++
		}
	}
	if active >= 2 {
		return ExportBeginResult{}, fmt.Errorf("活动导出数量已达上限")
	}
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return ExportBeginResult{}, err
	}
	token := hex.EncodeToString(tokenBytes)
	partial := filepath.Join(exportDir, token+".partial")
	file, err := os.OpenFile(partial, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return ExportBeginResult{}, err
	}
	writeErr := func() error {
		if _, err := file.Write(data); err != nil {
			return err
		}
		return file.Sync()
	}()
	closeErr := file.Close()
	if writeErr != nil || closeErr != nil {
		_ = os.Remove(partial)
		if writeErr != nil {
			return ExportBeginResult{}, writeErr
		}
		return ExportBeginResult{}, closeErr
	}
	if err := os.Rename(partial, filepath.Join(exportDir, token)); err != nil {
		_ = os.Remove(partial)
		return ExportBeginResult{}, err
	}
	sum := sha256.Sum256(data)
	return ExportBeginResult{ID: token, Size: len(data), SHA256: hex.EncodeToString(sum[:])}, nil
}

func (s *Service) ReadExport(token string, offset int) (ExportReadResult, error) {
	if !validExportToken(token) || offset < 0 {
		return ExportReadResult{}, fmt.Errorf("invalid export request")
	}
	path := filepath.Join(exportDir, token)
	info, err := os.Lstat(path)
	if err != nil || !ownedRegular(info) {
		return ExportReadResult{}, fmt.Errorf("export not found")
	}
	if time.Since(info.ModTime()) > exportTTL {
		lock, lockErr := lockExportDir()
		if lockErr == nil {
			_ = removeExportFile(path)
			unlockExportDir(lock)
		}
		return ExportReadResult{}, fmt.Errorf("export expired")
	}
	if offset > int(info.Size()) || offset != int(info.Size()) && offset%exportChunkSize != 0 {
		return ExportReadResult{}, fmt.Errorf("invalid export offset")
	}
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return ExportReadResult{}, fmt.Errorf("export not found")
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) || !ownedRegular(opened) {
		return ExportReadResult{}, fmt.Errorf("export not found")
	}
	remaining := int(opened.Size()) - offset
	if remaining > exportChunkSize {
		remaining = exportChunkSize
	}
	buf := make([]byte, remaining)
	if _, err := f.ReadAt(buf, int64(offset)); err != nil && len(buf) != 0 {
		return ExportReadResult{}, fmt.Errorf("could not read export")
	}
	next := offset + len(buf)
	return ExportReadResult{Offset: offset, Next: next, EOF: next == int(opened.Size()), Data: base64.StdEncoding.EncodeToString(buf)}, nil
}

func (s *Service) DiscardExport(token string) error {
	if !validExportToken(token) {
		return fmt.Errorf("invalid export token")
	}
	path := filepath.Join(exportDir, token)
	lock, err := lockExportDir()
	if err != nil {
		return err
	}
	defer unlockExportDir(lock)
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if !ownedRegular(info) {
		return fmt.Errorf("export not found")
	}
	return removeExportFile(path)
}

func ensureExportDir() error {
	if err := os.Mkdir(exportDir, 0700); err != nil && !os.IsExist(err) {
		return err
	}
	info, err := os.Lstat(exportDir)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("export directory is not a real directory")
	}
	if !ownedByCurrentUser(info) {
		return fmt.Errorf("export directory has unexpected owner")
	}
	return os.Chmod(exportDir, 0700)
}

func ownedByCurrentUser(info os.FileInfo) bool {
	stat, ok := info.Sys().(*syscall.Stat_t)
	return ok && stat.Uid == uint32(os.Geteuid())
}

func ownedRegular(info os.FileInfo) bool {
	return info.Mode().IsRegular() && ownedByCurrentUser(info)
}

func removeExportFile(path string) error {
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if !ownedRegular(info) {
		return fmt.Errorf("export file is not a regular owned file")
	}
	if err := os.Remove(path); os.IsNotExist(err) {
		return nil
	} else {
		return err
	}
}

func validExportToken(token string) bool {
	if len(token) != 64 || strings.ToLower(token) != token {
		return false
	}
	_, err := hex.DecodeString(token)
	return err == nil
}

func cleanupExports() error {
	entries, err := os.ReadDir(exportDir)
	if err != nil {
		return err
	}
	now := time.Now()
	for _, entry := range entries {
		name := entry.Name()
		if name == ".lock" {
			continue
		}
		path := filepath.Join(exportDir, name)
		info, err := os.Lstat(path)
		if err != nil {
			continue
		}
		if validExportToken(name) || strings.HasSuffix(name, ".partial") && validExportToken(strings.TrimSuffix(name, ".partial")) {
			if !ownedRegular(info) || now.Sub(info.ModTime()) > exportTTL || strings.HasSuffix(name, ".partial") {
				if err := removeExportFile(path); err != nil && !os.IsNotExist(err) {
					return err
				}
			}
		} else if info.Mode().IsRegular() && ownedByCurrentUser(info) && strings.HasPrefix(name, ".partial-") {
			if err := removeExportFile(path); err != nil && !os.IsNotExist(err) {
				return err
			}
		}
	}
	return nil
}

func lockExportDir() (*os.File, error) {
	if err := ensureExportDir(); err != nil {
		return nil, err
	}
	path := filepath.Join(exportDir, ".lock")
	info, err := os.Lstat(path)
	if os.IsNotExist(err) {
		f, createErr := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_RDWR|syscall.O_NOFOLLOW, 0600)
		if createErr == nil {
			info, err = f.Stat()
			if err != nil || !ownedRegular(info) {
				_ = f.Close()
				return nil, fmt.Errorf("invalid export lock file")
			}
			return flockExportFile(f)
		}
		if !os.IsExist(createErr) {
			return nil, createErr
		}
		info, err = os.Lstat(path)
	}
	if err != nil || !ownedRegular(info) {
		return nil, fmt.Errorf("invalid export lock file")
	}
	f, err := os.OpenFile(path, os.O_RDWR|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	opened, err := f.Stat()
	if err != nil || !os.SameFile(info, opened) || !ownedRegular(opened) {
		_ = f.Close()
		return nil, fmt.Errorf("invalid export lock file")
	}
	return flockExportFile(f)
}

func flockExportFile(f *os.File) (*os.File, error) {
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		_ = f.Close()
		return nil, err
	}
	return f, nil
}

func unlockExportDir(f *os.File) {
	_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
	_ = f.Close()
}
