--Copyright: https://github.com/coolsnowwolf/luci/tree/master/applications/luci-app-cpufreq
--Planner: https://github.com/unifreq/openwrt_packit
--Extended support: https://github.com/ophub/luci-app-amlogic
--Function: Support multi-core

local mp

--Remove the spaces in the string
function trim(str)
	--return (string.gsub(str, "^%s*(.-)%s*$", "%1"))
	return (string.gsub(str, "%s+", ""))
end

--split
function string.split(e, t)
	e = tostring(e)
	t = tostring(t)
	if (t == '') then return false end
	local a, o = 0, {}
	for i, t in function() return string.find(e, t, a, true) end do
		table.insert(o, string.sub(e, a, i - 1))
		a = t + 1
	end
	table.insert(o, string.sub(e, a))
	return o
end

--Auto-complete node
local check_config_settings = luci.sys.exec("uci get amlogic.@settings[0].governor0 2>/dev/null") or ""
if (trim(check_config_settings) == "") then
	luci.sys.exec("uci delete amlogic.@settings[0] 2>/dev/null")
	luci.sys.exec("uci set amlogic.armcpu='settings' 2>/dev/null")
	luci.sys.exec("uci commit amlogic 2>/dev/null")
end

mp = Map("amlogic")
mp.title = translate("CPU Freq Settings")
mp.description = translate("Set CPU Scaling Governor to Max Performance or Balance Mode")

s = mp:section(NamedSection, "armcpu", "settings")
s.anonymouse = true

local cpu_policys = luci.sys.exec("ls /sys/devices/system/cpu/cpufreq | grep -E 'policy[0-9]{1,3}' | xargs") or "policy0"
policy_array = string.split(cpu_policys, " ")

for tt, policy_name in ipairs(policy_array) do

	--Dynamic tab, automatically changes according to the number of cores, begin ------
	policy_name = tostring(trim(policy_name))
	policy_id = tostring(trim(string.gsub(policy_name, "policy", "")))

	tab_name = policy_name
	tab_id = tostring(trim("tab" .. policy_id))

	cpu_freqs = nixio.fs.readfile(trim("/sys/devices/system/cpu/cpufreq/" .. policy_name .. "/scaling_available_frequencies")) or "100000"
	cpu_freqs = string.sub(cpu_freqs, 1, -3)
	cpu_governors = nixio.fs.readfile(trim("/sys/devices/system/cpu/cpufreq/" .. policy_name .. "/scaling_available_governors")) or "performance"
	cpu_governors = string.sub(cpu_governors, 1, -3)
	freq_array = string.split(cpu_freqs, " ")
	governor_array = string.split(cpu_governors, " ")

	s:tab(tab_id, tab_name)

	tab_core_type = s:taboption(tab_id, DummyValue, trim("core_type" .. policy_id), translate("Microarchitectures:"))
	tab_core_type.default = luci.sys.exec("cat /sys/devices/system/cpu/cpu" .. policy_id .. "/uevent | grep -E '^OF_COMPATIBLE_0.*' | tr -d 'OF_COMPATIBLE_0=' | xargs") or "Unknown"
	tab_core_type.rmempty = false

	governor = s:taboption(tab_id, ListValue, trim("governor" .. policy_id), translate("CPU Scaling Governor:"))
	for t, e in ipairs(governor_array) do
		if e ~= "" then governor:value(e, translate(e, string.upper(e))) end
	end
	governor.default = "schedutil"
	governor.rmempty = false

	minfreq = s:taboption(tab_id, ListValue, trim("minfreq" .. policy_id), translate("Min Freq:"))
	for t, e in ipairs(freq_array) do
		if e ~= "" then minfreq:value(e) end
	end
	minfreq.default = "500000"
	minfreq.rmempty = false

	maxfreq = s:taboption(tab_id, ListValue, trim("maxfreq" .. policy_id), translate("Max Freq:"))
	for t, e in ipairs(freq_array) do
		if e ~= "" then maxfreq:value(e) end
	end
	maxfreq.default = "1512000"
	maxfreq.rmempty = false

	--Dynamic tab, automatically changes according to the number of cores, end ------

end

return mp
