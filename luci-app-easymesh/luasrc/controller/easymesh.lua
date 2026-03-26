-- Copyright (C) 2021 dz <dingzhong110@gmail.com>

module("luci.controller.easymesh", package.seeall)

local fs = require "nixio.fs"

function index()
	if not fs.access("/etc/config/easymesh") then
		return
	end

	-- luci 23.05+ 已通过 menu.d JSON 注册菜单，无需重复
	if fs.access("/usr/share/luci/menu.d/luci-app-easymesh.json") then
		return
	end

	local page

	page = entry({"admin", "network", "easymesh"}, cbi("easymesh"), _("EASY MESH"), 60)
	page.dependent = true
	page.acl_depends = { "luci-app-easymesh" }
end
