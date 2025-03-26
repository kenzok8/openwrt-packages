--[[
LuCI - Lua Configuration Partition Expansion
 Copyright (C) 2022-2025  sirpdboy <herboy2008@gmail.com> https://github.com/sirpdboy/partexp
]]--

local fs = require "nixio.fs"
local http = require "luci.http"
local uci = require"luci.model.uci".cursor()
local name = 'partexp'

module("luci.controller.partexp", package.seeall)

function index()
	local e = entry({"admin","system","partexp"},alias("admin", "system", "partexp", "global"),_("Partition Expansion"), 54)
	e.dependent = false
	e.acl_depends = { "luci-app-partexp" }
	entry({"admin", "system", "partexp", "global"}, cbi('partexp/global', {hideapplybtn = true, hidesavebtn = true, hideresetbtn = true}), _('Partition Expansion'), 10).leaf = true 
	entry({"admin", "system", "partexp","partexprun"}, call("partexprun"))
	entry({"admin", "system", "partexp", "check"}, call("act_check"))
end
function act_check()

	http.prepare_content("text/plain; charset=utf-8")
	local f=io.open("/tmp/partexp.log", "r+")
	local fdp=fs.readfile("/tmp/lucilogpos") or 0
	f:seek("set",fdp)
	local a=f:read(2048000) or ""
	fdp=f:seek()
	fs.writefile("/tmp/lucilogpos",tostring(fdp))
	f:close()
	http.write(a)
end


function partexprun()
	local kconfig = http.formvalue('kconfig')
	local eformat = http.formvalue('eformat')
	local targetf = http.formvalue('targetf')
	local targetd = http.formvalue('targetd')
	uci:set(name, 'global', 'target_disk', targetd)
	uci:set(name, 'global', 'target_function', targetf)
	uci:set(name, 'global', 'format_type', eformat)
	uci:set(name, 'global', 'keep_config', kconfig)
	uci:commit(name)
	fs.writefile("/tmp/lucilogpos","0")
	http.prepare_content("application/json")
	http.write('')
	luci.sys.exec("/etc/init.d/partexp autopart > /tmp/partexp.log 2>&1 &")
end
