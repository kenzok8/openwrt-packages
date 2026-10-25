// Package api serves local subscription snapshots to clients on the router.
package api

import (
	"net/http"
	"strings"

	"github.com/kenzok8/tower/internal/service"
)

// Server exposes only capability-token protected local shares.
type Server struct {
	svc *service.Service
}

// New creates a Server.
func New(svc *service.Service) *Server {
	return &Server{svc: svc}
}

// Handler returns the local share handler. Management stays behind LuCI rpcd.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/share/v1/", s.handleLocalShare)
	return mux
}

func (s *Server) handleLocalShare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	token := strings.TrimPrefix(r.URL.Path, "/share/v1/")
	content, contentType, ok := s.svc.LocalShare(token)
	if !ok {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method == http.MethodGet {
		_, _ = w.Write([]byte(content))
	}
}
