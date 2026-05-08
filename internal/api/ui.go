package api

import (
	"io/fs"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/mcpjungle/mcpjungle/internal/model"
	"github.com/mcpjungle/mcpjungle/pkg/types"
	"github.com/mcpjungle/mcpjungle/pkg/version"
	uiassets "github.com/mcpjungle/mcpjungle/ui"
)

type systemInfoResponse struct {
	Initialized bool   `json:"initialized"`
	Mode        string `json:"mode,omitempty"`
	UIEnabled   bool   `json:"ui_enabled"`
	Version     string `json:"version"`
}

func (s *Server) getSystemInfoHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg, err := s.configService.GetConfig()
		if err != nil {
			handleServiceError(c, err)
			return
		}

		resp := &systemInfoResponse{
			Initialized: cfg.Initialized,
			UIEnabled:   cfg.Initialized && cfg.Mode == model.ModeDev,
			Version:     version.GetVersion(),
		}
		if cfg.Initialized {
			resp.Mode = string(cfg.Mode)
		}

		c.JSON(http.StatusOK, resp)
	}
}

func (s *Server) devUIHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.JSON(http.StatusNotFound, types.APIErrorResponse{Error: "not found"})
			return
		}

		cfg, err := s.configService.GetConfig()
		if err != nil || !cfg.Initialized || cfg.Mode != model.ModeDev {
			c.JSON(http.StatusNotFound, types.APIErrorResponse{Error: "not found"})
			return
		}

		requestedPath := strings.TrimPrefix(c.Request.URL.Path, "/")
		if requestedPath == "" {
			serveUIFile(c, "index.html")
			return
		}

		cleanPath := path.Clean(requestedPath)
		if cleanPath == "." || strings.HasPrefix(cleanPath, "..") {
			c.JSON(http.StatusNotFound, types.APIErrorResponse{Error: "not found"})
			return
		}

		if strings.HasPrefix(cleanPath, "api/") ||
			strings.HasPrefix(cleanPath, "mcp") ||
			strings.HasPrefix(cleanPath, "sse") ||
			strings.HasPrefix(cleanPath, "message") ||
			strings.HasPrefix(cleanPath, "metrics") ||
			strings.HasPrefix(cleanPath, "health") ||
			strings.HasPrefix(cleanPath, "metadata") ||
			strings.HasPrefix(cleanPath, "v0/") {
			c.JSON(http.StatusNotFound, types.APIErrorResponse{Error: "not found"})
			return
		}

		if hasUIAsset(cleanPath) {
			serveUIFile(c, cleanPath)
			return
		}

		serveUIFile(c, "index.html")
	}
}

func hasUIAsset(assetPath string) bool {
	_, err := fs.Stat(uiassets.Dist, assetPath)
	return err == nil
}

func serveUIFile(c *gin.Context, assetPath string) {
	data, err := fs.ReadFile(uiassets.Dist, assetPath)
	if err != nil {
		c.JSON(http.StatusNotFound, types.APIErrorResponse{Error: "not found"})
		return
	}

	c.Data(http.StatusOK, contentTypeForAsset(assetPath), data)
}

func contentTypeForAsset(assetPath string) string {
	switch path.Ext(assetPath) {
	case ".css":
		return "text/css; charset=utf-8"
	case ".js":
		return "application/javascript; charset=utf-8"
	case ".svg":
		return "image/svg+xml"
	case ".png":
		return "image/png"
	case ".json":
		return "application/json; charset=utf-8"
	default:
		return "text/html; charset=utf-8"
	}
}
