local m, s, o

m = Map("unblockneteasemusic", translate("解除网易云音乐播放限制"))
m.description = translate("原理：采用 [Bilibili/JOOX/酷狗/酷我/咪咕/pyncmd/QQ/Youtube] 等音源，替换网易云音乐 无版权/收费 歌曲链接<br/>具体使用方法参见：<a href=\"https://github.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic\" target=\"_blank\">GitHub @UnblockNeteaseMusic/luci-app-unblockneteasemusic</a>")

m:section(SimpleSection).template = "unblockneteasemusic/status"

s = m:section(TypedSection, "unblockneteasemusic")
s.anonymous = true
s.addremove = false

o = s:option(Flag, "enable", translate("启用本插件"))
o.description = translate("启用本插件以解除网易云音乐播放限制")
o.default = 0
o.rmempty = false

o = s:option(Value, "music_source", translate("音源接口"))
o:value("default", translate("默认"))
o:value("bilibili", translate("Bilibili音乐"))
o:value("joox", translate("JOOX音乐"))
o:value("kugou", translate("酷狗音乐"))
o:value("kuwo", translate("酷我音乐"))
o:value("migu", translate("咪咕音乐"))
o:value("pyncmd", translate("网易云音乐（pyncmd）"))
o:value("qq", translate("QQ音乐"))
o:value("youtube", translate("Youtube音乐"))
o:value("youtubedl", translate("Youtube音乐（youtube-dl）"))
o:value("ytdlp", translate("Youtube音乐（yt-dlp）"))
o:value("ytdownload", translate("Youtube音乐（ytdownload）"))
o.description = translate("自定义模式下，多个音源请用空格隔开")
o.default = "default"
o.rmempty = false

o = s:option(Flag, "local_vip", translate("启用本地 VIP"))
o.description = translate("启用后，可以使用去广告、个性换肤、鲸云音效等本地功能")
o.default = 0
o.rmempty = false

o = s:option(Flag, "enable_flac", translate("启用无损音质"))
o.description = translate("目前仅支持酷狗、酷我、咪咕、pyncmd、QQ 音源")
o.default = 0
o.rmempty = false

o = s:option(ListValue, "replace_music_source", translate("强制音乐音源替换"))
o:value("dont_replace", translate("不强制替换音乐音源"))
o:value("lower_than_192kbps", translate("当音质低于 192 Kbps（中）时"))
o:value("lower_than_320kbps", translate("当音质低于 320 Kbps（高）时"))
o:value("lower_than_999kbps", translate("当音质低于 999 Kbps（无损）时"))
o:value("replace_all", translate("替换所有音乐音源"))
o.description = translate("当音乐音质低于指定数值时，尝试强制使用其他平台的高音质版本进行替换")
o.default = "dont_replace"
o.rmempty = false

o = s:option(Flag, "use_custom_cookie", translate("使用自定义 Cookie"))
o.description = translate("使用自定义 Cookie 请求音源接口")
o.default = 0
o.rmempty = false

o = s:option(Value, "joox_cookie", translate("JOOX Cookie"))
o.description = translate("在 joox.com 获取，需要 wmid 和 session_key 值")
o.placeholder = "wmid=; session_key="
o.datatype = "string"
o:depends("use_custom_cookie", 1)

o = s:option(Value, "qq_cookie", translate("QQ Cookie"))
o.description = translate("在 y.qq.com 获取，需要 uin 和 qm_keyst值 ")
o.placeholder = "uin=; qm_keyst="
o.datatype = "string"
o:depends("use_custom_cookie", 1)

o = s:option(Value, "youtube_key", translate("Youtube API Key"))
o.description = translate("API Key 申请地址：https://developers.google.com/youtube/v3/getting-started#before-you-start")
o.datatype = "string"
o:depends("use_custom_cookie", 1)

o = s:option(Flag, "auto_update", translate("启用自动更新"))
o.description = translate("启用后，每天将定时自动检查最新版本并更新")
o.default = 0
o.rmempty = false

o = s:option(ListValue, "update_time", translate("检查更新时间"))
for update_time_hour = 0,23 do
	o:value(update_time_hour, update_time_hour..":00")
end
o.default = "3"
o.description = translate("设定每天自动检查更新时间")
o:depends("auto_update", 1)

o = s:option(Button,"certificate", translate("HTTPS 证书"))
o.inputtitle = translate("下载 CA 根证书")
o.description = translate("Linux/iOS/MacOSX 在信任根证书后方可正常使用")
o.inputstyle = "reload"
o.write = function()
	act_download_cert()
end

function act_download_cert()
	local t, e
	t = nixio.open("/usr/share/unblockneteasemusic/core/ca.crt","r")
	luci.http.header('Content-Disposition', 'attachment; filename="ca.crt"')
	luci.http.prepare_content("application/octet-stream")
	while true do
		e = t:read(nixio.const.buffersize)
		if (not e) or (#e == 0) then
			break
		else
			luci.http.write(e)
		end
	end
	t:close()
	luci.http.close()
end

o = s:option(Flag, "advanced_mode", translate("启用进阶设置"))
o.description = translate("非必要不推荐使用")
o.default = 0
o.rmempty = false

o = s:option(Value, "http_port", translate("HTTP 监听端口"))
o.description = translate("程序监听的 HTTP 端口，不可与 其他程序/HTTPS 共用一个端口")
o.placeholder = "5200"
o.default = "5200"
o.datatype = "port"
o:depends({advanced_mode = true, hijack_ways = "dont_hijack"})
o:depends({advanced_mode = true, hijack_ways = "use_ipset"})

o = s:option(Value, "https_port", translate("HTTPS 监听端口"))
o.description = translate("程序监听的 HTTPS 端口，不可与 其他程序/HTTP 共用一个端口")
o.placeholder = "5201"
o.default = "5201"
o.datatype = "port"
o:depends({advanced_mode = true, hijack_ways = "dont_hijack"})
o:depends({advanced_mode = true, hijack_ways = "use_ipset"})

o = s:option(Value, "endpoint_url", translate("EndPoint"))
o.description = translate("具体说明参见：https://github.com/UnblockNeteaseMusic/server")
o.default = "https://music.163.com"
o.placeholder = "https://music.163.com"
o.datatype = "string"
o:depends("advanced_mode", 1)

o = s:option(Value, "cnrelay", translate("UNM bridge 服务器"))
o.description = translate("使用 UnblockNeteaseMusic 中继桥（bridge）以获取音源信息")
o.placeholder = "http(s)://host:port"
o.datatype = "string"
o:depends("advanced_mode", 1)

o = s:option(ListValue, "hijack_ways", translate("劫持方法"))
o:value("dont_hijack", translate("不开启劫持"))
o:value("use_ipset", translate("使用 IPSet 劫持"))
o:value("use_hosts", translate("使用 Hosts 劫持"))
o.description = translate("如果使用Hosts劫持，程序监听的 HTTP/HTTPS 端口将被锁定为 80/443")
o.default = "dont_hijack"
o:depends("advanced_mode", 1)

o = s:option(Flag, "keep_core_when_upgrade", translate("升级时保留核心程序"))
o.description = translate("默认情况下，在系统升级后会导致核心程序丢失，开启此选项后会保留当前下载的核心程序")
o.default = 0
o.rmempty = false
o:depends("advanced_mode", 1)

o = s:option(Flag, "pub_access", translate("部署到公网"))
o.description = translate("默认仅监听局域网，如需提供公开访问请勾选此选项")
o.default = 0
o.rmempty = false
o:depends("advanced_mode", 1)

o = s:option(Flag, "strict_mode", translate("启用严格模式"))
o.description = translate("若将服务部署到公网，则强烈建议使用严格模式，此模式下仅放行网易云音乐所属域名的请求；注意：该模式下不能使用全局代理")
o.default = 0
o.rmempty = false
o:depends("advanced_mode", 1)

o = s:option(Value, "netease_server_ip", translate("网易云服务器 IP"))
o.description = translate("通过 ping music.163.com 即可获得 IP 地址，仅限填写一个")
o.placeholder = "59.111.181.38"
o.datatype = "ipaddr"
o:depends("advanced_mode", 1)

o = s:option(Value, "proxy_server_ip", translate("代理服务器地址"))
o.description = translate("使用代理服务器获取音乐信息")
o.placeholder = "http(s)://host:port"
o.datatype = "string"
o:depends("advanced_mode", 1)

o = s:option(Value, "self_issue_cert_crt", translate("自签发证书公钥位置"))
o.description = translate("[公钥] 默认使用 UnblockNeteaseMusic 项目提供的 CA 证书，您可以指定为您自己的证书")
o.placeholder = "/usr/share/unblockneteasemusic/core/server.crt"
o.datatype = "file"
o:depends("advanced_mode", 1)

o = s:option(Value, "self_issue_cert_key", translate("自签发证书私钥位置"))
o.description = translate("[私钥] 默认使用 UnblockNeteaseMusic 项目提供的 CA 证书，您可以指定为您自己的证书")
o.placeholder = "/usr/share/unblockneteasemusic/core/server.key"
o.datatype = "file"
o:depends("advanced_mode", 1)

s = m:section(TypedSection, "acl_rule", translate("例外客户端规则"), translate("可以为局域网客户端分别设置不同的例外模式，默认无需设置"))
s.template = "cbi/tblsection"
s.sortable = true
s.anonymous = true
s.addremove = true

o = s:option(Value, "ip_addr", translate("IP 地址"))
o.width = "40%"
o.datatype = "ip4addr"
o.placeholder = "0.0.0.0/0"
luci.ip.neighbors({ family = 4 }, function(entry)
	if entry.reachable then
		o:value(entry.dest:string())
	end
end)

o = s:option(ListValue, "filter_mode", translate("规则"))
o.width = "40%"
o.default = "disable_all"
o.rmempty = false
o:value("disable_all", translate("不代理 HTTP 和 HTTPS"))
o:value("disable_http", translate("不代理 HTTP"))
o:value("disable_https", translate("不代理 HTTPS"))

return m
