module("luci.controller.koolproxy",package.seeall)

function index()
	if not nixio.fs.access("/etc/config/koolproxy") then
		return
	end

	entry({"admin", "services", "koolproxy"}, alias("admin", "services", "koolproxy", "basic"), _("iKoolProxy 滤广告"), 1).dependent = true
	entry({"admin", "services", "koolproxy", "basic"}, cbi("koolproxy/basic"), _("基本设置"), 1).leaf = true
	entry({"admin", "services", "koolproxy", "control"}, cbi("koolproxy/control"), _("访问控制"), 2).leaf = true
	entry({"admin", "services", "koolproxy", "add_rule"}, cbi("koolproxy/add_rule"), _("规则订阅"), 3).leaf = true
	entry({"admin", "services", "koolproxy", "cert"}, cbi("koolproxy/cert"), _("证书管理"), 4).leaf = true
	entry({"admin", "services", "koolproxy", "white_list"}, cbi("koolproxy/white_list"), _("网站白名单设置"), 5).leaf = true
	entry({"admin", "services", "koolproxy", "black_list"}, cbi("koolproxy/black_list"), _("网站黑名单设置"), 6).leaf = true
	entry({"admin", "services", "koolproxy", "ip_white_list"}, cbi("koolproxy/ip_white_list"), _("IP白名单设置"), 7).leaf = true
	entry({"admin", "services", "koolproxy", "ip_black_list"}, cbi("koolproxy/ip_black_list"), _("IP黑名单设置"), 8).leaf = true
	entry({"admin", "services", "koolproxy", "custom_rule"}, cbi("koolproxy/custom_rule"), _("自定义规则"), 9).leaf = true
	entry({"admin", "services", "koolproxy", "update_log"}, cbi("koolproxy/update_log"), _("更新日志"), 10).leaf = true
	entry({"admin", "services", "koolproxy", "tips"}, cbi("koolproxy/tips"), _("帮助支持"), 11).leaf = true
	entry({"admin", "services", "koolproxy", "rss_rule"}, cbi("koolproxy/rss_rule"), nil).leaf = true
	entry({"admin", "services", "koolproxy", "status"}, call("act_status")).leaf = true
end

function act_status()
	local e = {}
	e.running = luci.sys.call("pidof koolproxy >/dev/null") == 0
	e.bin_version = luci.sys.exec("/usr/share/koolproxy/koolproxy -v")
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end
