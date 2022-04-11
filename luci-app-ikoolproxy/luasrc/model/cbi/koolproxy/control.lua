o = Map("koolproxy")

t = o:section(TypedSection, "acl_rule", translate("iKoolProxy 访问控制"))
t.anonymous = true

t.description = translate("访问控制列表是用于指定特殊IP过滤模式的工具，如为已安装证书的客户端开启https广告过滤等，MAC或者IP必须填写其中一项。")
t.template = "cbi/tblsection"
t.sortable = true
t.addremove = true

e = t:option(Value, "remarks", translate("客户端备注"))
e.width = "30%"

e = t:option(Value, "ipaddr", translate("内部 IP 地址"))
e.width = "20%"
e.datatype = "ip4addr"
luci.ip.neighbors({family = 4}, function(neighbor)
	if neighbor.reachable then
		e:value(neighbor.dest:string(), "%s (%s)" %{neighbor.dest:string(), neighbor.mac})
	end
end)

e = t:option(Value,"mac",translate("MAC 地址"))
e.width = "20%"
e.datatype = "macaddr"
luci.ip.neighbors({family = 4}, function(neighbor)
	if neighbor.reachable then
		e:value(neighbor.mac, "%s (%s)" %{neighbor.mac, neighbor.dest:string()})
	end
end)

e = t:option(ListValue, "proxy_mode", translate("访问控制"))
e.width = "20%"
e:value(0,translate("不过滤"))
e:value(1,translate("过滤HTTP协议"))
e:value(2,translate("过滤HTTP(S)协议"))
e:value(3,translate("过滤全端口"))
e.default = 1

return o
