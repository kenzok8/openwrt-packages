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
	local c=luci.model.uci.cursor()
    local l=Split(c:get("easyupdate", "main", "github"), "/")
    e.newver=luci.sys.exec("uclient-fetch -qO- 'https://api.github.com/repos/" .. l[4] .. "/" .. l[5] .. "/releases/latest' | jsonfilter -e '@.tag_name'")
    e.newver=e.newver:sub(e.newver:find('_')+1,-2)
    e.newverint=os.time({day=e.newver:sub(7,8), month=e.newver:sub(5,6), year=e.newver:sub(1,4), hour=e.newver:sub(10,11), min=e.newver:sub(12,13), sec=e.newver:sub(14,15)})
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function download()
	local e={}
	local c=luci.model.uci.cursor()
    local l=Split(c:get("easyupdate", "main", "github"), "/")
    local sedd
    if nixio.fs.access("/sys/firmware/efi") then
    	sedd="combined-efi.img.gz"
    else
        sedd="combined.img.gz"
    end
    local url=luci.sys.exec("uclient-fetch -qO- 'https://api.github.com/repos/" .. l[4] .. "/" .. l[5] .. "/releases/latest' | jsonfilter -e '@.assets[*].browser_download_url' | sed -n '/" .. sedd .. "/p'")
    url=url:gsub("\n","")
    local u=c:get("easyupdate", "main", "proxy")
    if u then
		u="https://ghproxy.com/"
	else
		u=""
    end
    local l=Split(url, "/")
    luci.sys.exec("uclient-fetch -O '/tmp/" .. l[9] .. "' '" .. u .. url .. "' > /tmp/easyupdate.log  2>&1 &")
    e.code=1
    e.data=l[9]
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function getlog()
	local e = {}
	e.data=nixio.fs.readfile ("/tmp/easyupdate.log")
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function flash()
	local e={}
	local f = luci.http.formvalue('file')
	local c=luci.model.uci.cursor()
	local k=c:get("easyupdate", "main", "keepconfig")
	if k then
	    k=""
	else
	    k="-n"
	end
    luci.sys.exec("sysupgrade " .. k .. " '/tmp/" .. f .. "' > /tmp/easyupdate.log  2>&1 &")
    e.code=1
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end