package parser

import (
	"encoding/json"
	"strings"
)

func xhttpExtraIsEmpty(extra string) bool {
	if strings.TrimSpace(extra) == "" {
		return true
	}
	var object map[string]any
	return json.Unmarshal([]byte(extra), &object) == nil && object != nil && len(object) == 0
}

func xhttpExtraValueIsEmpty(value any) bool {
	if text, ok := value.(string); ok {
		return xhttpExtraIsEmpty(text)
	}
	object := asMap(value)
	return object != nil && len(object) == 0
}

func clashXHTTPOptionsAreExpressible(raw map[string]any) bool {
	if extra, exists := raw["extra"]; exists {
		if !xhttpExtraValueIsEmpty(extra) {
			return false
		}
	}
	value, exists := raw["xhttp-opts"]
	if !exists {
		return true
	}
	opts := asMap(value)
	if opts == nil {
		return false
	}
	for key, value := range opts {
		switch key {
		case "path", "host", "mode":
			if _, ok := value.(string); !ok {
				return false
			}
		case "headers":
			headers := asMap(value)
			if headers == nil {
				return false
			}
			for name, value := range headers {
				if name != "Host" && name != "host" {
					return false
				}
				if _, ok := value.(string); !ok {
					return false
				}
			}
		default:
			return false
		}
	}
	return true
}

func snellModeIsDefault(mode string) bool {
	mode = strings.TrimSpace(mode)
	return mode == "" || strings.EqualFold(mode, "default")
}
