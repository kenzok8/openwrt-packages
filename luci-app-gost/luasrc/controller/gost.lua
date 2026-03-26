-- Copyright (C) 2025 ImmortalWrt.org
-- SPDX-License-Identifier: Apache-2.0

module("luci.controller.gost", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/gost") then
		return
	end

	-- luci 23.05+ 已通过 menu.d JSON 注册菜单，无需 Lua 控制器重复注册
	if nixio.fs.access("/usr/share/luci/menu.d/luci-app-gost.json") then
		return
	end

	local page
	page = entry({"admin", "services", "gost"}, cbi("gost"), _("GOST"), 100)
	page.dependent = true
end
