module("luci.controller.dnsfilter",package.seeall)
function index()
	if not nixio.fs.access("/etc/config/dnsfilter") then
		return
	end
	local e=entry({"admin","services","dnsfilter"},firstchild(),_("DNSFilter"),1)
	e.dependent=false
	e.acl_depends={ "luci-app-dnsfilter" }
	entry({"admin","services","dnsfilter","base"},cbi("dnsfilter/base"),_("Base Setting"),1).leaf=true
	entry({"admin","services","dnsfilter","white"},form("dnsfilter/white"),_("White Domain List"),2).leaf=true
	entry({"admin","services","dnsfilter","black"},form("dnsfilter/black"),_("Block Domain List"),3).leaf=true
	entry({"admin","services","dnsfilter","ip"},form("dnsfilter/ip"),_("Block IP List"),4).leaf=true
	entry({"admin","services","dnsfilter","log"},form("dnsfilter/log"),_("Update Log"),5).leaf=true
	entry({"admin","services","dnsfilter","run"},call("act_status"))
	entry({"admin","services","dnsfilter","refresh"},call("refresh_data"))
end

function act_status()
	local e={}
	e.running=luci.sys.call("[ -s /tmp/dnsmasq.dnsfilter/rules.conf ]")==0
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function refresh_data()
local set=luci.http.formvalue("set")
local icount=0

	luci.sys.exec("/usr/share/dnsfilter/dnsfilter down")
	icount=luci.sys.exec("find /tmp/ad_tmp -type f -name rules.conf -exec cat {} \\; 2>/dev/null | wc -l")
	if tonumber(icount)>0 then
		oldcount=luci.sys.exec("find /tmp/dnsfilter -type f -name rules.conf -exec cat {} \\; 2>/dev/null | wc -l")
		if tonumber(icount) ~= tonumber(oldcount) then
			luci.sys.exec("[ -h /tmp/dnsfilter/url ] && (rm -f /etc/dnsfilter/rules/*;cp -a /tmp/ad_tmp/* /etc/dnsfilter/rules) || (rm -f /tmp/dnsfilter/*;cp -a /tmp/ad_tmp/* /tmp/dnsfilter)")
			luci.sys.exec("/etc/init.d/dnsfilter restart &")
			retstring=tostring(math.ceil(tonumber(icount)))
		else
			retstring=0
		end
		luci.sys.call("echo `date +'%Y-%m-%d %H:%M:%S'` > /tmp/dnsfilter/dnsfilter.updated")
	else
		retstring="-1"
	end
	luci.sys.exec("rm -rf /tmp/ad_tmp")

	luci.http.prepare_content("application/json")
	luci.http.write_json({ret=retstring,retcount=icount})
end
