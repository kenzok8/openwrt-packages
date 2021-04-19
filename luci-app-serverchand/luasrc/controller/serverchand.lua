module("luci.controller.serverchand",package.seeall)

function index()

	if not nixio.fs.access("/etc/config/serverchand")then
		return
	end

	entry({"admin", "services", "serverchand"}, alias("admin", "services", "serverchand", "setting"),_("钉钉推送"), 30).dependent = true
	entry({"admin", "services", "serverchand", "setting"}, cbi("serverchand/setting"),_("配置"), 40).leaf = true
	entry({"admin", "services", "serverchand", "advanced"}, cbi("serverchand/advanced"),_("高级设置"), 50).leaf = true
	entry({"admin", "services", "serverchand", "client"}, form("serverchand/client"), "在线设备", 80)
	entry({"admin", "services", "serverchand", "log"}, form("serverchand/log"),_("日志"), 99).leaf = true
	entry({"admin", "services", "serverchand", "get_log"}, call("get_log")).leaf = true
	entry({"admin", "services", "serverchand", "clear_log"}, call("clear_log")).leaf = true
	entry({"admin", "services", "serverchand", "status"}, call("act_status")).leaf = true
end

function act_status()
	local e={}
	e.running=luci.sys.call("ps|grep -v grep|grep -c serverchand >/dev/null")==0
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function get_log()
	luci.http.write(luci.sys.exec(
		"[ -f '/tmp/serverchand/serverchand.log' ] && cat /tmp/serverchand/serverchand.log"))
end

function clear_log()
	luci.sys.call("echo '' > /tmp/serverchand/serverchand.log")
end
