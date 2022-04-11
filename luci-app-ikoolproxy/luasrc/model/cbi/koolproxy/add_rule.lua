o = Map("koolproxy")

t = o:section(TypedSection,"rss_rule", translate("iKoolProxy 规则订阅"))
t.description = translate("请确保订阅规则的兼容性")
t.anonymous = true
t.addremove = true
t.sortable = true
t.template = "cbi/tblsection"
t.extedit = luci.dispatcher.build_url("admin/services/koolproxy/rss_rule/%s")

t.create = function(...)
	local sid = TypedSection.create(...)
	if sid then
		luci.http.redirect(t.extedit % sid)
		return
	end
end

e = t:option(Flag, "load", translate("启用"))
e.default = 0

e = t:option(DummyValue, "name", translate("规则名称"))
function e.cfgvalue(...)
	return Value.cfgvalue(...) or translate("None")
end

e = t:option(DummyValue,"url", translate("规则地址"))
function e.cfgvalue(...)
	return Value.cfgvalue(...) or translate("None")
end

e = t:option(DummyValue, "time", translate("更新时间"))

return o
