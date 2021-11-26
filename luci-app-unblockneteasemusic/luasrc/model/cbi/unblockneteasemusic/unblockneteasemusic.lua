mp = Map("unblockneteasemusic", translate("解除网易云音乐播放限制"))
mp.description = translate("原理：采用 [Bilibili/JOOX/酷狗/酷我/咪咕/pyncmd/QQ/Youtube] 等音源，替换网易云音乐 无版权/收费 歌曲链接<br/>具体使用方法参见：<a href=\"https://github.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic\" target=\"_blank\">GitHub @UnblockNeteaseMusic/luci-app-unblockneteasemusic</a>")

mp:section(SimpleSection).template = "unblockneteasemusic/unblockneteasemusic_status"

s = mp:section(TypedSection, "unblockneteasemusic")
s.anonymous = true
s.addremove = false

enable = s:option(Flag, "enable", translate("启用本插件"))
enable.description = translate("启用本插件以解除网易云音乐播放限制")
enable.default = 0
enable.rmempty = false

music_source = s:option(Value, "music_source", translate("音源接口"))
music_source:value("default", translate("默认"))
music_source:value("bilibili", translate("Bilibili音乐"))
music_source:value("joox", translate("JOOX音乐"))
music_source:value("kugou", translate("酷狗音乐"))
music_source:value("kuwo", translate("酷我音乐"))
music_source:value("migu", translate("咪咕音乐"))
music_source:value("pyncmd", translate("网易云音乐（pyncmd）"))
music_source:value("qq", translate("QQ音乐"))
music_source:value("youtube", translate("Youtube音乐"))
music_source:value("youtubedl", translate("Youtube音乐（youtube-dl）"))
music_source:value("ytdownload", translate("Youtube音乐（ytdownload）"))
music_source.description = translate("自定义模式下，多个音源请用空格隔开")
music_source.default = "default"
music_source.rmempty = false

local_vip = s:option(Flag, "local_vip", translate("启用本地 VIP"))
local_vip.description = translate("启用后，可以使用去广告、个性换肤、鲸云音效等本地功能")
local_vip.default = 0
local_vip.rmempty = false

enable_flac = s:option(Flag, "enable_flac", translate("启用无损音质"))
enable_flac.description = translate("目前仅支持酷狗、酷我、咪咕、pyncmd、QQ 音源")
enable_flac.default = 0
enable_flac.rmempty = false

replace_music_source = s:option(ListValue, "replace_music_source", translate("强制音乐音源替换"))
replace_music_source:value("dont_replace", translate("不强制替换音乐音源"))
replace_music_source:value("lower_than_192kbps", translate("当音质低于 192 Kbps（中）时"))
replace_music_source:value("lower_than_320kbps", translate("当音质低于 320 Kbps（高）时"))
replace_music_source:value("lower_than_999kbps", translate("当音质低于 999 Kbps（无损）时"))
replace_music_source:value("replace_all", translate("替换所有音乐音源"))
replace_music_source.description = translate("当音乐音质低于指定数值时，尝试强制使用其他平台的高音质版本进行替换")
replace_music_source.default = "dont_replace"
replace_music_source.rmempty = false

use_custom_cookie = s:option(Flag, "use_custom_cookie", translate("使用自定义 Cookie"))
use_custom_cookie.description = translate("使用自定义 Cookie 请求音源接口")
use_custom_cookie.default = 0
use_custom_cookie.rmempty = false

joox_cookie = s:option(Value, "joox_cookie", translate("JOOX Cookie"))
joox_cookie.description = translate("在 joox.com 获取，需要 wmid 和 session_key 值")
joox_cookie.placeholder = "wmid=; session_key="
joox_cookie.datatype = "string"
joox_cookie:depends("use_custom_cookie", 1)

migu_cookie = s:option(Value, "migu_cookie", translate("Migu Cookie"))
migu_cookie.description = translate("通过抓包手机客户端请求获取，需要 aversionid 值")
migu_cookie.datatype = "string"
migu_cookie:depends("use_custom_cookie", 1)

qq_cookie = s:option(Value, "qq_cookie", translate("QQ Cookie"))
qq_cookie.description = translate("在 y.qq.com 获取，需要 uin 和 qm_keyst值 ")
qq_cookie.placeholder = "uin=; qm_keyst="
qq_cookie.datatype = "string"
qq_cookie:depends("use_custom_cookie", 1)

youtube_key = s:option(Value, "youtube_key", translate("Youtube API Key"))
youtube_key.description = translate("API Key 申请地址：https://developers.google.com/youtube/v3/getting-started#before-you-start")
youtube_key.datatype = "string"
youtube_key:depends("use_custom_cookie", 1)

auto_update = s:option(Flag, "auto_update", translate("启用自动更新"))
auto_update.description = translate("启用后，每天将定时自动检查最新版本并更新")
auto_update.default = 0
auto_update.rmempty = false

update_time = s:option(ListValue, "update_time", translate("检查更新时间"))
for update_time_hour = 0,23 do
	update_time:value(update_time_hour, update_time_hour..":00")
end
update_time.default = "3"
update_time.description = translate("设定每天自动检查更新时间")
update_time:depends("auto_update", 1)

download_cert = s:option(Button,"certificate", translate("HTTPS 证书"))
download_cert.inputtitle = translate("下载 CA 根证书")
download_cert.description = translate("Linux/iOS/MacOSX 在信任根证书后方可正常使用")
download_cert.inputstyle = "reload"
download_cert.write = function()
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

advanced_mode = s:option(Flag, "advanced_mode", translate("启用进阶设置"))
advanced_mode.description = translate("非必要不推荐使用")
advanced_mode.default = 0
advanced_mode.rmempty = false

http_port = s:option(Value, "http_port", translate("HTTP 监听端口"))
http_port.description = translate("程序监听的 HTTP 端口，不可与 其他程序/HTTPS 共用一个端口")
http_port.placeholder = "5200"
http_port.default = "5200"
http_port.datatype = "port"
http_port:depends("advanced_mode", 1)

https_port = s:option(Value, "https_port", translate("HTTPS 监听端口"))
https_port.description = translate("程序监听的 HTTPS 端口，不可与 其他程序/HTTP 共用一个端口")
https_port.placeholder = "5201"
https_port.default = "5201"
https_port.datatype = "port"
https_port:depends("advanced_mode", 1)

endpoint_url = s:option(Value, "endpoint_url", translate("EndPoint"))
endpoint_url.description = translate("具体说明参见：https://github.com/UnblockNeteaseMusic/server")
endpoint_url.default = "https://music.163.com"
endpoint_url.placeholder = "https://music.163.com"
endpoint_url.datatype = "string"
endpoint_url:depends("advanced_mode", 1)

hijack = s:option(ListValue, "hijack_ways", translate("劫持方法"))
hijack:value("dont_hijack", translate("不开启劫持"))
hijack:value("use_ipset", translate("使用 IPSet 劫持"))
hijack:value("use_hosts", translate("使用 Hosts 劫持"))
hijack.description = translate("如果使用Hosts劫持，程序监听的 HTTP/HTTPS 端口将被锁定为 80/443")
hijack.default = "dont_hijack"
hijack:depends("advanced_mode", 1)

keep_core_when_upgrade = s:option(Flag, "keep_core_when_upgrade", translate("升级时保留核心程序"))
keep_core_when_upgrade.description = translate("默认情况下，在系统升级后会导致核心程序丢失，开启此选项后会保留当前下载的核心程序")
keep_core_when_upgrade.default = 0
keep_core_when_upgrade.rmempty = false
keep_core_when_upgrade:depends("advanced_mode", 1)

pub_access = s:option(Flag, "pub_access", translate("部署到公网"))
pub_access.description = translate("默认仅监听局域网，如需提供公开访问请勾选此选项")
pub_access.default = 0
pub_access.rmempty = false
pub_access:depends("advanced_mode", 1)

strict_mode = s:option(Flag, "strict_mode", translate("启用严格模式"))
strict_mode.description = translate("若将服务部署到公网，则强烈建议使用严格模式，此模式下仅放行网易云音乐所属域名的请求；注意：该模式下不能使用全局代理")
strict_mode.default = 0
strict_mode.rmempty = false
strict_mode:depends("advanced_mode", 1)

netease_server_ip = s:option(Value, "netease_server_ip", translate("网易云服务器 IP"))
netease_server_ip.description = translate("通过 ping music.163.com 即可获得 IP 地址，仅限填写一个")
netease_server_ip.placeholder = "59.111.181.38"
netease_server_ip.datatype = "ipaddr"
netease_server_ip:depends("advanced_mode", 1)

proxy_server_ip = s:option(Value, "proxy_server_ip", translate("代理服务器地址"))
proxy_server_ip.description = translate("使用代理服务器获取音乐信息")
proxy_server_ip.placeholder = "http(s)://host:port"
proxy_server_ip.datatype = "string"
proxy_server_ip:depends("advanced_mode", 1)

self_issue_cert_crt = s:option(Value, "self_issue_cert_crt", translate("自签发证书公钥位置"))
self_issue_cert_crt.description = translate("[公钥] 默认使用 UnblockNeteaseMusic 项目提供的 CA 证书，您可以指定为您自己的证书")
self_issue_cert_crt.placeholder = "/usr/share/unblockneteasemusic/core/server.crt"
self_issue_cert_crt.datatype = "file"
self_issue_cert_crt:depends("advanced_mode", 1)

self_issue_cert_key = s:option(Value, "self_issue_cert_key", translate("自签发证书私钥位置"))
self_issue_cert_key.description = translate("[私钥] 默认使用 UnblockNeteaseMusic 项目提供的 CA 证书，您可以指定为您自己的证书")
self_issue_cert_key.placeholder = "/usr/share/unblockneteasemusic/core/server.key"
self_issue_cert_key.datatype = "file"
self_issue_cert_key:depends("advanced_mode", 1)

acl_rule = mp:section(TypedSection, "acl_rule", translate("例外客户端规则"), translate("可以为局域网客户端分别设置不同的例外模式，默认无需设置"))
acl_rule.template = "cbi/tblsection"
acl_rule.sortable = true
acl_rule.anonymous = true
acl_rule.addremove = true

acl_ip_addr=acl_rule:option(Value, "ip_addr", translate("IP 地址"))
acl_ip_addr.width = "40%"
acl_ip_addr.datatype = "ip4addr"
acl_ip_addr.placeholder = "0.0.0.0/0"
luci.ip.neighbors({ family = 4 }, function(entry)
	if entry.reachable then
		acl_ip_addr:value(entry.dest:string())
	end
end)

acl_filter_mode = acl_rule:option(ListValue, "filter_mode", translate("规则"))
acl_filter_mode.width = "40%"
acl_filter_mode.default = "disable_all"
acl_filter_mode.rmempty = false
acl_filter_mode:value("disable_all", translate("不代理 HTTP 和 HTTPS"))
acl_filter_mode:value("disable_http", translate("不代理 HTTP"))
acl_filter_mode:value("disable_https", translate("不代理 HTTPS"))

return mp
