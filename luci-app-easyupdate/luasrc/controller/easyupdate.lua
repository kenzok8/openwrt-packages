module("luci.controller.easyupdate",package.seeall)

function index()
	if not nixio.fs.access("/etc/config/easyupdate") then
		return
	end
	local c=luci.model.uci.cursor()
	local r=0
	if not c:get("easyupdate", "main", "proxy") then
	    r=1
	    c:set("easyupdate", "main", "proxy", "1")
	end
	if not c:get("easyupdate", "main", "keepconfig") then
	    r=1
	    c:set("easyupdate", "main", "keepconfig", "1")
	end
	if not c:get("easyupdate", "main", "github") then
	    r=1
	    local pcall, dofile, _G = pcall, dofile, _G
        pcall(dofile, "/etc/openwrt_release")
	    c:set("easyupdate", "main", "github", _G.DISTRIB_GITHUB)
	end
	if r then
	    c:commit("easyupdate")
	end
	entry({"admin", "services", "easyupdate"}, cbi("easyupdate"),_("EasyUpdate"), 99).dependent = true
	entry({"admin", "services", "easyupdate", "getver"}, call("getver")).leaf = true
	entry({"admin", "services", "easyupdate", "download"}, call("download")).leaf = true
	entry({"admin", "services", "easyupdate", "getlog"}, call("getlog")).leaf = true
	entry({"admin", "services", "easyupdate", "check"}, call("check")).leaf = true
	entry({"admin", "services", "easyupdate", "flash"}, call("flash")).leaf = true
end

function Split(str, delim, maxNb)  
    -- Eliminate bad cases...  
    if string.find(str, delim) == nil then 
        return { str } 
    end 
    if maxNb == nil or maxNb < 1 then 
        maxNb = 0    -- No limit  
    end 
    local result = {} 
    local pat = "(.-)" .. delim .. "()"  
    local nb = 0 
    local lastPos  
    for part, pos in string.gfind(str, pat) do 
        nb = nb + 1 
        result[nb] = part  
        lastPos = pos  
        if nb == maxNb then break end 
    end 
    -- Handle the last field  
    if nb ~= maxNb then 
        result[nb + 1] = string.sub(str, lastPos)  
    end 
    return result  
end 

function getver()
	local e={}
    e.newver=luci.sys.exec("/usr/bin/easyupdate.sh -c")
    e.newver=e.newver:sub(0,-2)
    e.newverint=os.time({day=e.newver:sub(7,8), month=e.newver:sub(5,6), year=e.newver:sub(1,4), hour=e.newver:sub(10,11), min=e.newver:sub(12,13), sec=e.newver:sub(14,15)})
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function download()
	local e={}
	ret=luci.sys.exec("/usr/bin/easyupdate.sh -d")
	e.data=ret:match("openwrt.+%.img%.gz")
	e.code=1
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function getlog()
	local e = {}
	e.code=1
	e.data=nixio.fs.readfile ("/tmp/easyupdate.log")
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function check()
	local e = {}
	local f = luci.http.formvalue('file')
	e.code=1
	e.data=luci.sys.exec("/usr/bin/easyupdate.sh -k " .. f)
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function flash()
	local e={}
	local f = luci.http.formvalue('file')
    luci.sys.exec("/usr/bin/easyupdate.sh -f /tmp/" .. f)
    e.code=1
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end