package service

import (
	"encoding/json"
	"os"
	"os/exec"
	"strings"
	"time"
)

const defaultLANInterface = "br-lan"

// lanInterfaceForDAE reports the interface dae must take over as LAN. dae only
// accepts explicit interface names here ("auto" is WAN-only), so the value is
// read from the running network configuration and cached for the process.
func (s *Service) lanInterfaceForDAE() string {
	s.lanOnce.Do(func() {
		s.lanName = detectLANInterface()
	})
	return s.lanName
}

func detectLANInterface() string {
	if name := ubusLANDevice(); name != "" {
		return name
	}
	if b, err := os.ReadFile("/etc/config/network"); err == nil {
		if name := parseUCILANDevice(string(b)); name != "" {
			return name
		}
	}
	if _, err := os.Stat("/sys/class/net/" + defaultLANInterface); err == nil {
		return defaultLANInterface
	}
	return defaultLANInterface
}

// ubusLANDevice asks OpenWrt for the layer-3 device of the lan interface, which
// is br-lan on a default bridge setup but can be anything on a custom layout.
func ubusLANDevice() string {
	cmd := exec.Command("ubus", "call", "network.interface.lan", "status")
	cmd.WaitDelay = 2 * time.Second
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	var status struct {
		L3Device string `json:"l3_device"`
		Device   string `json:"device"`
	}
	if json.Unmarshal(out, &status) != nil {
		return ""
	}
	for _, candidate := range []string{status.L3Device, status.Device} {
		if name := strings.TrimSpace(candidate); name != "" && !strings.ContainsAny(name, " \t\n") {
			return name
		}
	}
	return ""
}

// parseUCILANDevice finds the device of the `config interface 'lan'` section in
// /etc/config/network. It is the fallback for devices where ubus is unavailable
// at export time.
func parseUCILANDevice(conf string) string {
	inLAN := false
	for _, line := range strings.Split(conf, "\n") {
		fields := strings.Fields(strings.TrimSpace(line))
		if len(fields) == 0 || strings.HasPrefix(fields[0], "#") {
			continue
		}
		if fields[0] == "config" {
			inLAN = len(fields) >= 3 && fields[1] == "interface" && strings.Trim(fields[2], "'\"") == "lan"
			continue
		}
		if !inLAN || fields[0] != "option" || len(fields) < 3 {
			continue
		}
		switch fields[1] {
		case "device":
			if name := strings.Trim(fields[2], "'\""); name != "" {
				return name
			}
		case "ifname":
			// Legacy syntax, may list several interfaces separated by spaces.
			if name := strings.Trim(fields[2], "'\""); name != "" && !strings.Contains(name, " ") {
				return name
			}
		}
	}
	return ""
}
