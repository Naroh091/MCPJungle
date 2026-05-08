package ui

import (
	"embed"
	"io/fs"
	"log"
)

//go:embed dist/*
var dist embed.FS

// Dist contains the built frontend assets served by the MCPJungle HTTP server.
var Dist fs.FS

func init() {
	var err error
	Dist, err = fs.Sub(dist, "dist")
	if err != nil {
		log.Fatalf("failed to open embedded UI assets: %v", err)
	}
}
