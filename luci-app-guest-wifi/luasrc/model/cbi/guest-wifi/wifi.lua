local form = require("form")
local m, s, o

m = Map("wireless", translate("Guest WiFi"),
	translate("Guest WiFi provides a separate wireless network for guest access with isolated permissions."))

s = m:section(form.TypedSection, "wifi-iface", translate("Guest WiFi Settings"))
s.anonymous = true
s.addremove = true
s.filter = function(section_id)
	local val = uci:get("wireless", section_id, "guest_wifi")
	return val == "1"
end

o = s:option(form.Flag, "guest_wifi", translate("Enable"),
	translate("Enable guest WiFi network"))
o.rmempty = false
o.default = "0"

o = s:option(form.Value, "ssid", translate("Network Name (SSID)"))
o.rmempty = false

o = s:option(form.ListValue, "encryption", translate("Encryption"))
o:value("none", translate("No Encryption"))
o:value("psk2", translate("WPA2-PSK"))
o:value("sae", translate("WPA3-SAE"))
o:value("sae-mixed", translate("WPA2/WPA3-Mixed"))
o.rmempty = false
o.default = "psk2"

o = s:option(form.Value, "key", translate("Password"))
o:depends("encryption", "psk2")
o:depends("encryption", "sae")
o:depends("encryption", "sae-mixed")
o.datatype = "wpakey"
o.rmempty = false
o.password = true

o = s:option(form.Flag, "isolate", translate("AP Isolation"),
	translate("Prevents wireless clients from communicating with each other"))
o.rmempty = false
o.default = "1"

return m
