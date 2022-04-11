
module("luci.controller.themedog", package.seeall)
function index()
    entry({"admin", "themedog"}, call("themedog_template"))
    if nixio.fs.access("/usr/lib/lua/luci/view/themedog/main_dev.htm") then
        entry({"admin", "themedog_dev"}, call("themedog_template_dev"))
    end
    entry({"admin", "themedog", "api"}, call("redirect_index"))
    entry({"admin", "themedog", "api","status"}, call("themedog_api_status"))
    entry({"admin", "themedog", "api","memory"}, call("themedog_api_memory"))
    entry({"admin", "themedog", "api","cpu"}, call("themedog_api_cpu"))
end

function redirect_index()
    luci.http.redirect(luci.dispatcher.build_url("admin/themedog"))
end

function themedog_template()
    luci.template.render("themedog/main")
end

function themedog_template_dev()
    luci.template.render("themedog/main_dev")
end

function themedog_api_status()
    local locallTime = luci.sys.exec("printf \"%d\" $(date +%s)")
    local uptime = luci.sys.uptime()
    local result = {
        locallTime =  tonumber(locallTime),
        uotime = uptime
    }
	local data = {
		success = true,
        result = result
	}
	luci.http.prepare_content("application/json")
	luci.http.write_json(data)
end

function themedog_api_memory()
    local total = luci.sys.exec("cat /proc/meminfo |grep MemTotal |awk -F ' ' '{printf(\"%d\",$2)}'")
    local available = luci.sys.exec("free -h |grep Mem |awk -F ' ' '{printf(\"%d\", $7)}'")
    local result = {
        total = tonumber(total),
        available = tonumber(available)
    }
	local data = {
		success = true,
        result = result
	}
	luci.http.prepare_content("application/json")
	luci.http.write_json(data)
end

function themedog_api_cpu()
    local available = luci.sys.exec("top -n1 | awk '/^CPU:/ {printf(\"%d\",$8)}'")
    local result = {
        total = 100,
        available = tonumber(available)
    }
	local data = {
		success = true,
        result = result
	}
	luci.http.prepare_content("application/json")
	luci.http.write_json(data)
end