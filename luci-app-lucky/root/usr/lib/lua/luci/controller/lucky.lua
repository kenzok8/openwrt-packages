-- SPDX-License-Identifier: Apache-2.0

module("luci.controller.lucky", package.seeall)

function index()
	if not require("nixio.fs").access("/etc/config/lucky") then
		return
	end

	-- Lean's Lua-only LuCI builds every controller before opening any page.
	-- Calling a missing view() here breaks the entire web interface, not just Lucky.
	local target
	if type(view) == "function" then
		target = view("lucky/config")
	else
		target = template("lucky/legacy")
		local api = entry({ "admin", "services", "lucky", "legacy" }, call("legacy_api"))
		api.leaf = true
		api.sysauth = "root"
		-- API requests use the existing cookie only. Never parse a large upload
		-- as a login form before the upload handler has checked its headers.
		api.sysauth_authenticator = false
	end
	entry({ "admin", "services", "lucky" }, target, _("Lucky"), 60).dependent = true
end

function legacy_api(operation)
	require("luci.lucky_legacy").dispatch(operation)
end
