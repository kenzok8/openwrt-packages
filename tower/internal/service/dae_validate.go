package service

import (
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

const daeValidatorPath = "/usr/bin/dae"
const daeValidationTimeout = 30 * time.Second

func validateDAEConfig(parent context.Context, content string) error {
	return validateDAEConfigWith(parent, content, daeValidatorPath, daeValidationTimeout, runDAEValidator)
}

func validateDAEConfigWith(parent context.Context, content, validatorPath string, timeout time.Duration, run func(context.Context, string, []string, []string) error) error {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	dir, err := os.MkdirTemp("", "tower-dae-validate-")
	if err != nil {
		return fmt.Errorf("create temporary validation directory: %w", err)
	}
	defer os.RemoveAll(dir)
	if err := os.Chmod(dir, 0o700); err != nil {
		return fmt.Errorf("protect temporary validation directory: %w", err)
	}

	configPath := filepath.Join(dir, "config.dae")
	file, err := os.OpenFile(configPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create temporary DAE config: %w", err)
	}
	if _, err := file.WriteString(content); err != nil {
		file.Close()
		return fmt.Errorf("write temporary DAE config: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close temporary DAE config: %w", err)
	}

	env := make([]string, 0, len(os.Environ())+1)
	for _, entry := range os.Environ() {
		if len(entry) >= len("DAE_LOCATION_ASSET=") && entry[:len("DAE_LOCATION_ASSET=")] == "DAE_LOCATION_ASSET=" {
			continue
		}
		env = append(env, entry)
	}
	env = append(env, "DAE_LOCATION_ASSET=/usr/share/v2ray")
	if err := run(ctx, validatorPath, []string{"validate", "-c", configPath}, env); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("dae validate timed out after %s", timeout)
		}
		return fmt.Errorf("dae validate command failed")
	}
	return nil
}

func runDAEValidator(ctx context.Context, validatorPath string, args, env []string) error {
	cmd := exec.CommandContext(ctx, validatorPath, args...)
	cmd.Env = env
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	return cmd.Run()
}
