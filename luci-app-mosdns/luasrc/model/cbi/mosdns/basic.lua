m = Map("mosdns")
m.title = translate("MosDNS")
m.description = translate("MosDNS is a 'programmable' DNS forwarder.")

m:section(SimpleSection).template = "mosdns/mosdns_status"

s = m:section(TypedSection, "mosdns")
s.addremove = false
s.anonymous = true

enable = s:option(Flag, "enabled", translate("Enable"))
enable.rmempty = false

configfile = s:option(ListValue, "configfile", translate("MosDNS Config File"))
configfile:value("./def_config.yaml", translate("Def Config"))
configfile:value("./cus_config.yaml", translate("Cus Config"))
configfile.default = "./def_config.yaml"

listenport = s:option(Value, "listen_port", translate("Listen port"))
listenport.datatype = "and(port,min(1))"
listenport.default = 5335
listenport:depends( "configfile", "./def_config.yaml")

loglv = s:option(ListValue, "loglv", translate("Log Level"))
loglv:value("debug", translate("Debug"))
loglv:value("info", translate("Info"))
loglv:value("warn", translate("Warning"))
loglv:value("error", translate("Error"))
loglv.default = "error"
loglv:depends( "configfile", "./def_config.yaml")

logfile = s:option(Value, "logfile", translate("MosDNS Log File"))
logfile.placeholder = "/tmp/mosdns.txt"
logfile.default = "/tmp/mosdns.txt"
logfile:depends( "configfile", "./def_config.yaml")

remote_dns = s:option(Value, "remote_dns1", translate("Remote DNS"))
remote_dns.default = "tls://8.8.4.4"
remote_dns:value("tls://8.8.8.8", "8.8.8.8 (Google DNS)")
remote_dns:value("tls://8.8.4.4", "8.8.4.4 (Google DNS)")
remote_dns:value("tls://1.1.1.1", "1.1.1.1 (CloudFlare DNS)")
remote_dns:value("tls://1.0.0.1", "1.0.0.1 (CloudFlare DNS)")
remote_dns:value("tls://208.67.222.222", "208.67.222.222 (Open DNS)")
remote_dns:value("tls://208.67.220.220", "208.67.220.220 (Open DNS)")
remote_dns:value("tls://94.140.14.140", "94.140.14.140 (AdGuard)")
remote_dns:value("tls://94.140.14.141", "94.140.14.141 (AdGuard)")
remote_dns:depends( "configfile", "./def_config.yaml")
remote_dns = s:option(Value, "remote_dns2", " ")
remote_dns.default = "tls://1.0.0.1"
remote_dns:value("tls://8.8.8.8", "8.8.8.8 (Google DNS)")
remote_dns:value("tls://8.8.4.4", "8.8.4.4 (Google DNS)")
remote_dns:value("tls://1.1.1.1", "1.1.1.1 (CloudFlare DNS)")
remote_dns:value("tls://1.0.0.1", "1.0.0.1 (CloudFlare DNS)")
remote_dns:value("tls://208.67.222.222", "208.67.222.222 (Open DNS)")
remote_dns:value("tls://208.67.220.220", "208.67.220.220 (Open DNS)")
remote_dns:value("tls://94.140.14.140", "94.140.14.140 (AdGuard)")
remote_dns:value("tls://94.140.14.141", "94.140.14.141 (AdGuard)")
remote_dns:depends( "configfile", "./def_config.yaml")

redirect = s:option(Flag, "redirect", translate("Enable DNS Redirect"))
redirect:depends( "configfile", "./def_config.yaml")
redirect.default = true

adblock = s:option(Flag, "adblock", translate("Enable DNS ADblock"))
adblock:depends( "configfile", "./def_config.yaml")
adblock.default = false

set_config = s:option(Button, "set_config", translate("DNS Helper"))
set_config.inputtitle = translate("Apply")
set_config.inputstyle = "reload"
set_config.description = translate("This will make the necessary adjustments to other plug-in settings.")
set_config.write = function()
  luci.sys.exec("/etc/mosdns/set.sh &> /dev/null &")
end
set_config:depends( "configfile", "./def_config.yaml")

unset_config = s:option(Button, "unset_config", translate("Revert Settings"))
unset_config.inputtitle = translate("Apply")
unset_config.inputstyle = "reload"
unset_config.description = translate("This will revert the adjustments.")
unset_config.write = function()
  luci.sys.exec("/etc/mosdns/set.sh unset &> /dev/null &")
end

return m
