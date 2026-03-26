module("luci.controller.advanced",package.seeall)
function index()
if not nixio.fs.access("/etc/config/advanced")then
return
end
-- luci 23.05+ 已通过 menu.d JSON 注册菜单，无需重复
if nixio.fs.access("/usr/share/luci/menu.d/luci-app-advanced.json")then
return
end
local e
e=entry({"admin","system","advanced"},cbi("advanced"),_("高级设置"),60)
e.dependent=true
end
