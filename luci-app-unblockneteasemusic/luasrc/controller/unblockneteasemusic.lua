-- SPDX-License-Identifer: GPL-3.0-only
-- Copyright (C) 2019-2021 Tianling Shen <cnsztl@immortalwrt.org>

module("luci.controller.unblockneteasemusic", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/unblockneteasemusic") then
		return
	end

	local page
	page = entry({"admin", "services", "unblockneteasemusic"}, firstchild(), _("解除网易云音乐播放限制"), 50)
	page.dependent = false
	page.acl_depends = { "luci-app-unblockneteasemusic" }

	entry({"admin", "services", "unblockneteasemusic", "general"}, cbi("unblockneteasemusic/unblockneteasemusic"), _("基本设定"), 1)
	entry({"admin", "services", "unblockneteasemusic", "upgrade"}, form("unblockneteasemusic/unblockneteasemusic_upgrade"), _("更新组件"), 2).leaf = true
	entry({"admin", "services", "unblockneteasemusic", "log"}, form("unblockneteasemusic/unblockneteasemusic_log"), _("日志"), 3)

	entry({"admin", "services", "unblockneteasemusic", "status"}, call("act_status")).leaf = true
	entry({"admin", "services", "unblockneteasemusic", "update_core"}, call("act_update_core"))
	entry({"admin", "services", "unblockneteasemusic", "remove_core"}, call("act_remove_core"))
end

function act_status()
	local e = {}
	e.running = luci.sys.call("busybox ps -w |grep unblockneteasemusic |grep app.js |grep -v grep >/dev/null") == 0
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function update_core()
	local core_cloud_ver = luci.sys.exec("uclient-fetch -qO- 'https://api.github.com/repos/UnblockNeteaseMusic/server/commits?sha=enhanced&path=precompiled' | jsonfilter -e '@[0].sha'")
	local core_cloud_ver_mini = string.sub(core_cloud_ver, 1, 7)
	local core_local_ver
	if not core_cloud_ver or not core_cloud_ver_mini then
		return "1"
	else
		core_local_ver = luci.sys.exec("cat '/usr/share/unblockneteasemusic/core_local_ver' 2>'/dev/null'")
		if not core_local_ver or (core_local_ver ~= core_cloud_ver) then
			luci.sys.call("rm -f /usr/share/unblockneteasemusic/update_core_successfully")
			luci.sys.call("/usr/share/unblockneteasemusic/update.sh update_core_from_luci")
			if not nixio.fs.access("/usr/share/unblockneteasemusic/update_core_successfully") then
				return "2"
			else
				luci.sys.call("rm -f /usr/share/unblockneteasemusic/update_core_successfully")
				return core_cloud_ver_mini
			end
		else
			return "0"
		end
	end
end

function act_update_core()
	luci.http.prepare_content("application/json")
	luci.http.write_json({
		ret = update_core();
	})
end

function act_remove_core()
	local ret = {}
	ret.ret = luci.sys.call("cd /usr/share/unblockneteasemusic && rm -rf core/* && rm -f core_local_ver") == 0
	luci.http.prepare_content("application/json")
	luci.http.write_json(ret)
end
