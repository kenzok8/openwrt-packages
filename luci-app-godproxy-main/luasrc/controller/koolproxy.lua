module("luci.controller.koolproxy",package.seeall)
function index()
	if not nixio.fs.access("/etc/config/koolproxy")then
		return
	end
	entry({"admin","services","koolproxy"},cbi("koolproxy/global"),_("KoolproxyR Plus+"),1).dependent=true
	entry({"admin","services","koolproxy","rss_rule"},cbi("koolproxy/rss_rule"), nil).leaf=true
	entry({"admin","services","koolproxy","status"},call("act_status")).leaf=true
end

function act_status()
	local e={}
	e.running=luci.sys.call("pidof %s >/dev/null"%"koolproxy")==0
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end