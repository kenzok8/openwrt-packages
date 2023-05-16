local fs   = require "nixio.fs"
local sys  = require "luci.sys"

if fs.access("/usr/bin/mosdns") then
    mosdns_version = sys.exec("/usr/share/mosdns/mosdns.sh version")
else
    mosdns_version = "Unknown Version"
end
m = Map("mosdns")
m.title = translate("MosDNS") .. " " .. mosdns_version
m.description = translate("MosDNS is a 'programmable' DNS forwarder.")

m:section(SimpleSection).template = "mosdns/mosdns_status"

s = m:section(TypedSection, "mosdns")
s.addremove = false
s.anonymous = true

s:tab("basic", translate("Basic Options"))

o = s:taboption("basic", Flag, "enabled", translate("Enabled"))
o.rmempty = false

o = s:taboption("basic", ListValue, "configfile", translate("Config File"))
o:value("/etc/mosdns/config.yaml", translate("Default Config"))
o:value("/etc/mosdns/config_custom.yaml", translate("Custom Config"))
o.default = "/etc/mosdns/config.yaml"

o = s:taboption("basic", Value, "listen_port", translate("Listen port"))
o.datatype = "and(port,min(1))"
o.default = 5335
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("basic", ListValue, "log_level", translate("Log Level"))
o:value("debug", translate("Debug"))
o:value("info", translate("Info"))
o:value("warn", translate("Warning"))
o:value("error", translate("Error"))
o.default = "info"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("basic", Value, "logfile", translate("Log File"))
o.placeholder = "/tmp/mosdns.log"
o.default = "/tmp/mosdns.log"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("basic", Flag, "redirect", translate("DNS Forward"), translate("Forward Dnsmasq Domain Name resolution requests to MosDNS"))
o.default = true

o = s:taboption("basic", Flag, "custom_local_dns", translate("Local DNS"), translate("Follow WAN interface DNS if not enabled"))
o:depends( "configfile", "/etc/mosdns/config.yaml")
o.default = false
o = s:taboption("basic", DynamicList, "local_dns", translate("Upstream DNS servers"))
o:value("119.29.29.29", "119.29.29.29 (DNSPod Primary)")
o:value("119.28.28.28", "119.28.28.28 (DNSPod Secondary)")
o:value("223.5.5.5", "223.5.5.5 (AliDNS Primary)")
o:value("223.6.6.6", "223.6.6.6 (AliDNS Secondary)")
o:value("114.114.114.114", "114.114.114.114 (114DNS Primary)")
o:value("114.114.115.115", "114.114.115.115 (114DNS Secondary)")
o:value("180.76.76.76", "180.76.76.76 (Baidu DNS)")
o:value("https://doh.pub/dns-query", "DNSPod DoH")
o:value("https://dns.alidns.com/dns-query", "AliDNS DoH")
o:value("https://doh.360.cn/dns-query", "360DNS DoH")
o:depends("custom_local_dns", "1")

o = s:taboption("basic", DynamicList, "remote_dns", translate("Remote DNS"))
o:value("tls://1.1.1.1", "1.1.1.1 (CloudFlare DNS)")
o:value("tls://1.0.0.1", "1.0.0.1 (CloudFlare DNS)")
o:value("tls://8.8.8.8", "8.8.8.8 (Google DNS)")
o:value("tls://8.8.4.4", "8.8.4.4 (Google DNS)")
o:value("tls://9.9.9.9", "9.9.9.9 (Quad9 DNS)")
o:value("tls://149.112.112.112", "149.112.112.112 (Quad9 DNS)")
o:value("tls://45.11.45.11", "45.11.45.11 (DNS.SB)")
o:value("tls://208.67.222.222", "208.67.222.222 (Open DNS)")
o:value("tls://208.67.220.220", "208.67.220.220 (Open DNS)")
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("basic", ListValue, "bootstrap_dns", translate("Bootstrap DNS servers"), translate("Bootstrap DNS servers are used to resolve IP addresses of the DoH/DoT resolvers you specify as upstreams"))
o:value("119.29.29.29", "119.29.29.29 (DNSPod Primary)")
o:value("119.28.28.28", "119.28.28.28 (DNSPod Secondary)")
o:value("223.5.5.5", "223.5.5.5 (AliDNS Primary)")
o:value("223.6.6.6", "223.6.6.6 (AliDNS Secondary)")
o:value("114.114.114.114", "114.114.114.114 (114DNS Primary)")
o:value("114.114.115.115", "114.114.115.115 (114DNS Secondary)")
o:value("180.76.76.76", "180.76.76.76 (Baidu DNS)")
o.default = "119.29.29.29"
o:depends("configfile", "/etc/mosdns/config.yaml")

s:tab("advanced", translate("Advanced Options"))

o = s:taboption("advanced", Value, "concurrent", translate("Concurrent"), translate("DNS query request concurrency, The number of upstream DNS servers that are allowed to initiate requests at the same time"))
o.datatype = "and(uinteger,min(1),max(3))"
o.default = "1"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Value, "max_conns", translate("Maximum Connections"), translate("Set the Maximum connections for DoH and pipeline's TCP/DoT, Except for the HTTP/3 protocol"))
o.datatype = "and(uinteger,min(1))"
o.default = "2"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Value, "idle_timeout", translate("Idle Timeout"), translate("DoH/TCP/DoT Connection Multiplexing idle timeout (default 30 seconds)"))
o.datatype = "and(uinteger,min(1))"
o.default = "30"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Flag, "enable_pipeline", translate("TCP/DoT Connection Multiplexing"), translate("Enable TCP/DoT RFC 7766 new Query Pipelining connection multiplexing mode"))
o.rmempty = false
o.default = false
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Flag, "insecure_skip_verify", translate("Disable TLS Certificate"), translate("Disable TLS Servers certificate validation, Can be useful if system CA certificate expires or the system time is out of order"))
o.rmempty = false
o.default = false
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Flag, "enable_http3", translate("Enable HTTP/3"), translate("Enable DoH HTTP/3 protocol support for remote DNS, Upstream DNS server support is required (Experimental)"))
o.rmempty = false
o.default = false
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Flag, "enable_ecs_remote", translate("Enable EDNS client subnet"), translate("Add the EDNS Client Subnet option (ECS) to Remote DNS") .. '<br />' .. translate("MosDNS will auto identify the IP address subnet segment of your remote connection (0/24)") .. '<br />' .. translate("If your remote access network changes, May need restart MosDNS to update the ECS request address"))
o.rmempty = false
o.default = false
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Flag, "dns_leak", translate("Prevent DNS Leaks"), translate("Enable this option fallback policy forces forwarding to remote DNS"))
o.rmempty = false
o.default = false
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Value, "cache_size", translate("DNS Cache Size"))
o.datatype = "and(uinteger,min(0))"
o.default = "20000"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Value, "cache_survival_time", translate("Cache Survival Time"))
o.datatype = "and(uinteger,min(0))"
o.default = "86400"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Flag, "dump_file", translate("Cache Dump"), translate("Save the cache locally and reload the cache dump on the next startup"))
o.rmempty = false
o.default = false
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Value, "dump_interval", translate("Auto Save Cache Interval"))
o.datatype = "and(uinteger,min(0))"
o.default = "600"
o:depends("dump_file", "1")

o = s:taboption("advanced", Value, "minimal_ttl", translate("Minimum TTL"), translate("Modify the Minimum TTL value (seconds) for DNS answer results, 0 indicating no modification"))
o.datatype = "and(uinteger,min(0),max(604800))"
o.default = "0"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Value, "maximum_ttl", translate("Maximum TTL"), translate("Modify the Maximum TTL value (seconds) for DNS answer results, 0 indicating no modification"))
o.datatype = "and(uinteger,min(0),max(604800))"
o.default = "0"
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("advanced", Flag, "adblock", translate("Enable DNS ADblock"))
o:depends("configfile", "/etc/mosdns/config.yaml")
o.default = false

o = s:taboption("advanced", Value, "ad_source", translate("ADblock Source"), translate("When using custom rule sources, use the rule types supported by MosDNS"))
o:depends("adblock", "1")
o.default = "https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/anti-ad-domains.txt"
o:value("geosite.dat", "v2ray-geosite")
o:value("https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/anti-ad-domains.txt", "anti-AD")
o:value("https://raw.githubusercontent.com/ookangzheng/dbl-oisd-nl/master/dbl_light.txt", "oisd (small)")
o:value("https://raw.githubusercontent.com/ookangzheng/dbl-oisd-nl/master/dbl.txt", "oisd (big)")
o:value("https://raw.githubusercontent.com/QiuSimons/openwrt-mos/master/dat/serverlist.txt", "QiuSimons/openwrt-mos")

o = s:taboption("basic",  Button, "_reload", translate("Reload Service"), translate("Reload service to take effect of new configuration"))
o.write = function()
    sys.exec("/etc/init.d/mosdns reload")
end
o:depends("configfile", "/etc/mosdns/config_custom.yaml")

o = s:taboption("basic", TextValue, "manual-config")
o.description = translate("<font color=\"ff0000\"><strong>View the Custom YAML Configuration file used by this MosDNS. You can edit it as you own need.</strong></font>")
o.template = "cbi/tvalue"
o.rows = 25
o:depends("configfile", "/etc/mosdns/config_custom.yaml")

function o.cfgvalue(self, section)
    return fs.readfile("/etc/mosdns/config_custom.yaml")
end

function o.write(self, section, value)
    value = value:gsub("\r\n?", "\n")
    fs.writefile("/etc/mosdns/config_custom.yaml", value)
end

s:tab("api", translate("API Options"))

o = s:taboption("api", Value, "listen_port_api", translate("API Listen port"))
o.datatype = "and(port,min(1))"
o.default = 9091
o:depends("configfile", "/etc/mosdns/config.yaml")

o = s:taboption("api", Button, "flush_cache", translate("Flush Cache"), translate("Flushing Cache will clear any IP addresses or DNS records from MosDNS cache"))
o.rawhtml = true
o.template = "mosdns/mosdns_flush_cache"
o:depends("configfile", "/etc/mosdns/config.yaml")

s:tab("geodata", translate("GeoData Export"))

o = s:taboption("geodata", DynamicList, "geosite_tags", translate("GeoSite Tags"), translate("Enter the GeoSite.dat category to be exported, Allow add multiple tags") .. '<br />' .. translate("Export directory: /var/mosdns"))
o:depends("configfile", "/etc/mosdns/config_custom.yaml")

o = s:taboption("geodata", DynamicList, "geoip_tags", translate("GeoIP Tags"), translate("Enter the GeoIP.dat category to be exported, Allow add multiple tags") .. '<br />' .. translate("Export directory: /var/mosdns"))
o:depends("configfile", "/etc/mosdns/config_custom.yaml")

return m
