package types

import (
	"fmt"
	"os"
	"strings"
)

// AccessTokenRef describes how to load a secret access token from an external source.
type AccessTokenRef struct {
	// Env indicates that the access token should be loaded from an environment variable.
	// The value is the name of the environment variable.
	Env string `json:"env"`

	// File indicates that the access token should be loaded from a file.
	// The value is the path to the file.
	File string `json:"file"`
}

// ResolveAccessToken returns the effective access token.
// Precedence:
// 1. Primary token if it is not empty
// 2. Environment variable specified in .Env
// 3. File specified in .File
// If none are present, this method returns an empty string.
func (r *AccessTokenRef) ResolveAccessToken(primaryToken string) (string, error) {
	if primaryToken != "" {
		return primaryToken, nil
	}

	if r.Env != "" {
		value, ok := os.LookupEnv(r.Env)
		if ok {
			trimmed := strings.TrimSpace(value)
			if trimmed != "" {
				return trimmed, nil
			}
		}
		if r.File == "" {
			return "", fmt.Errorf("environment variable %s is not set or empty", r.Env)
		}
	}

	if r.File != "" {
		data, err := os.ReadFile(r.File)
		if err != nil {
			return "", fmt.Errorf("failed to read access token file %s: %w", r.File, err)
		}
		trimmed := strings.TrimSpace(string(data))
		if trimmed == "" {
			return "", fmt.Errorf("access token file %s is empty", r.File)
		}
		return trimmed, nil
	}

	return "", nil
}
