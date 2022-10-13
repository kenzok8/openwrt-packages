-- Copyright (C) 2017 yushi studio <ywb94@qq.com> github.com/ywb94
-- Licensed to the public under the GNU General Public License v3.

require "nixio.fs"
require "luci.sys"
require "luci.http"
require "luci.model.ipkg"

local m, s, o
local sid = arg[1]
local uuid = luci.sys.exec("cat /proc/sys/kernel/random/uuid")

local function is_finded(e)
	return luci.sys.exec('type -t -p "%s"' % e) ~= "" and true or false
end

local function is_installed(e)
	return luci.model.ipkg.installed(e)
end

local server_table = {}
local encrypt_methods = {
	-- ssr
	"none",
	"table",
	"rc4",
	"rc4-md5-6",
	"rc4-md5",
	"aes-128-cfb",
	"aes-192-cfb",
	"aes-256-cfb",
	"aes-128-ctr",
	"aes-192-ctr",
	"aes-256-ctr",
	"bf-cfb",
	"camellia-128-cfb",
	"camellia-192-cfb",
	"camellia-256-cfb",
	"cast5-cfb",
	"des-cfb",
	"idea-cfb",
	"rc2-cfb",
	"seed-cfb",
	"salsa20",
	"chacha20",
	"chacha20-ietf"
}

local encrypt_methods_ss = {
	-- plain
	"none",
	"plain",
	-- aead
	"aes-128-gcm",
	"aes-192-gcm",
	"aes-256-gcm",
	"chacha20-ietf-poly1305",
	"xchacha20-ietf-poly1305",
	-- aead 2022
	"2022-blake3-aes-128-gcm",
	"2022-blake3-aes-256-gcm",
	"2022-blake3-chacha20-poly1305"
	--[[ stream
	"none",
	"plain",
	"table",
	"rc4",
	"rc4-md5",
	"aes-128-cfb",
	"aes-192-cfb",
	"aes-256-cfb",
	"aes-128-ctr",
	"aes-192-ctr",
	"aes-256-ctr",
	"bf-cfb",
	"camellia-128-cfb",
	"camellia-192-cfb",
	"camellia-256-cfb",
	"salsa20",
	"chacha20",
	"chacha20-ietf" ]]
}

local protocol = {
	-- ssr
	"origin",
	"verify_deflate",
	"auth_sha1_v4",
	"auth_aes128_sha1",
	"auth_aes128_md5",
	"auth_chain_a",
	"auth_chain_b",
	"auth_chain_c",
	"auth_chain_d",
	"auth_chain_e",
	"auth_chain_f"
}

local obfs = {
	-- ssr
	"plain",
	"http_simple",
	"http_post",
	"random_head",
	"tls1.2_ticket_auth"
}

local securitys = {
	-- vmess
	"auto",
	"none",
	"zero",
	"aes-128-gcm",
	"chacha20-poly1305"
}

local flows = {
	-- xtls
	"xtls-rprx-origin",
	"xtls-rprx-origin-udp443",
	"xtls-rprx-direct",
	"xtls-rprx-direct-udp443",
	"xtls-rprx-splice",
	"xtls-rprx-splice-udp443"
}

m = Map("shadowsocksr", translate("Edit ShadowSocksR Server"))
m.redirect = luci.dispatcher.build_url("admin/services/shadowsocksr/servers")
if m.uci:get("shadowsocksr", sid) ~= "servers" then
	luci.http.redirect(m.redirect)
	return
end

-- [[ Servers Setting ]]--
s = m:section(NamedSection, sid, "servers")
s.anonymous = true
s.addremove = false

o = s:option(DummyValue, "ssr_url", "SS/SSR/V2RAY/TROJAN URL")
o.rawhtml = true
o.template = "shadowsocksr/ssrurl"
o.value = sid

o = s:option(ListValue, "type", translate("Server Node Type"))
if is_finded("xray") or is_finded("v2ray") then
	o:value("v2ray", translate("V2Ray/XRay"))
end
if is_finded("ssr-redir") then
	o:value("ssr", translate("ShadowsocksR"))
end
if is_finded("sslocal") or is_finded("ss-redir") then
	o:value("ss", translate("Shadowsocks New Version"))
end
if is_finded("trojan") then
	o:value("trojan", translate("Trojan"))
end
if is_finded("naive") then
	o:value("naiveproxy", translate("NaiveProxy"))
end
if is_finded("hysteria") then
	o:value("hysteria", translate("Hysteria"))
end
if is_finded("ipt2socks") then
	o:value("socks5", translate("Socks5"))
end
if is_finded("redsocks2") then
	o:value("tun", translate("Network Tunnel"))
end

o.description = translate("Using incorrect encryption mothod may causes service fail to start")

o = s:option(Value, "alias", translate("Alias(optional)"))

o = s:option(ListValue, "iface", translate("Network interface to use"))
for _, e in ipairs(luci.sys.net.devices()) do
	if e ~= "lo" then
		o:value(e)
	end
end
o:depends("type", "tun")
o.description = translate("Redirect traffic to this network interface")

o = s:option(ListValue, "v2ray_protocol", translate("V2Ray/XRay protocol"))
o:value("vless", translate("VLESS"))
o:value("vmess", translate("VMess"))
o:value("trojan", translate("Trojan"))
o:value("shadowsocks", translate("Shadowsocks"))
if is_installed("sagernet-core") then
	o:value("shadowsocksr", translate("ShadowsocksR"))
	o:value("wireguard", translate("WireGuard"))
end
o:value("socks", translate("Socks"))
o:value("http", translate("HTTP"))
o:depends("type", "v2ray")

o = s:option(Value, "server", translate("Server Address"))
o.datatype = "host"
o.rmempty = false
o:depends("type", "ssr")
o:depends("type", "ss")
o:depends("type", "v2ray")
o:depends("type", "trojan")
o:depends("type", "naiveproxy")
o:depends("type", "hysteria")
o:depends("type", "socks5")

o = s:option(Value, "server_port", translate("Server Port"))
o.datatype = "port"
o.rmempty = false
o:depends("type", "ssr")
o:depends("type", "ss")
o:depends("type", "v2ray")
o:depends("type", "trojan")
o:depends("type", "naiveproxy")
o:depends("type", "hysteria")
o:depends("type", "socks5")

o = s:option(Flag, "auth_enable", translate("Enable Authentication"))
o.rmempty = false
o.default = "0"
o:depends("type", "socks5")
o:depends({type = "v2ray", v2ray_protocol = "http"})
o:depends({type = "v2ray", v2ray_protocol = "socks"})

o = s:option(Value, "username", translate("Username"))
o.rmempty = true
o:depends("type", "naiveproxy")
o:depends({type = "socks5", auth_enable = true})
o:depends({type = "v2ray", v2ray_protocol = "http", auth_enable = true})
o:depends({type = "v2ray", v2ray_protocol = "socks", auth_enable = true})

o = s:option(Value, "password", translate("Password"))
o.password = true
o.rmempty = true
o:depends("type", "ssr")
o:depends("type", "ss")
o:depends("type", "trojan")
o:depends("type", "naiveproxy")
o:depends({type = "socks5", auth_enable = true})
o:depends({type = "v2ray", v2ray_protocol = "http", auth_enable = true})
o:depends({type = "v2ray", v2ray_protocol = "socks", socks_ver = "5", auth_enable = true})
o:depends({type = "v2ray", v2ray_protocol = "shadowsocks"})
o:depends({type = "v2ray", v2ray_protocol = "shadowsocksr"})
o:depends({type = "v2ray", v2ray_protocol = "trojan"})

o = s:option(ListValue, "encrypt_method", translate("Encrypt Method"))
for _, v in ipairs(encrypt_methods) do
	o:value(v)
end
o.rmempty = true
o:depends("type", "ssr")
o:depends({type = "v2ray", v2ray_protocol = "shadowsocksr"})

o = s:option(ListValue, "encrypt_method_ss", translate("Encrypt Method"))
for _, v in ipairs(encrypt_methods_ss) do
	o:value(v)
end
o.rmempty = true
o:depends("type", "ss")
o:depends({type = "v2ray", v2ray_protocol = "shadowsocks"})

o = s:option(Flag, "uot", translate("UDP over TCP"))
o.description = translate("Enable the SUoT protocol, requires server support.")
o.rmempty = true
o:depends({type = "v2ray", v2ray_protocol = "shadowsocks"})
o.default = "0"

o = s:option(Flag, "ivCheck", translate("Bloom Filter"))
o.rmempty = true
o:depends({type = "v2ray", v2ray_protocol = "shadowsocks"})
o.default = "1"

-- Shadowsocks Plugin
o = s:option(Value, "plugin", translate("Obfs"))
o:value("none", translate("None"))
if is_finded("obfs-local") or is_installed("sagernet-core") then
	o:value("obfs-local", translate("obfs-local"))
end
if is_finded("v2ray-plugin") or is_installed("sagernet-core") then
	o:value("v2ray-plugin", translate("v2ray-plugin"))
end
if is_finded("xray-plugin") then
	o:value("xray-plugin", translate("xray-plugin"))
end
o.rmempty = true
o:depends("type", "ss")
if is_installed("sagernet-core") then
	o:depends({type = "v2ray", v2ray_protocol = "shadowsocks"})
end

o = s:option(Value, "plugin_opts", translate("Plugin Opts"))
o.rmempty = true
o:depends("type", "ss")
if is_installed("sagernet-core") then
	o:depends({type = "v2ray", v2ray_protocol = "shadowsocks"})
end

o = s:option(ListValue, "protocol", translate("Protocol"))
for _, v in ipairs(protocol) do
	o:value(v)
end
o.rmempty = true
o:depends("type", "ssr")
o:depends({type = "v2ray", v2ray_protocol = "shadowsocksr"})

o = s:option(Value, "protocol_param", translate("Protocol param (optional)"))
o:depends("type", "ssr")
o:depends({type = "v2ray", v2ray_protocol = "shadowsocksr"})

o = s:option(ListValue, "obfs", translate("Obfs"))
for _, v in ipairs(obfs) do
	o:value(v)
end
o.rmempty = true
o:depends("type", "ssr")
o:depends({type = "v2ray", v2ray_protocol = "shadowsocksr"})

o = s:option(Value, "obfs_param", translate("Obfs param (optional)"))
o:depends("type", "ssr")
o:depends({type = "v2ray", v2ray_protocol = "shadowsocksr"})

-- [[ Hysteria ]]--
o = s:option(ListValue, "hysteria_protocol", translate("Protocol"))
o:depends("type", "hysteria")
o:value("udp", translate("udp"))
o:value("wechat-video", translate("wechat-video"))
o:value("faketcp", translate("faketcp"))
o.default = "udp"
o.rmempty = true

o = s:option(ListValue, "auth_type", translate("Authentication type"))
o:depends("type", "hysteria")
o:value("0", translate("disabled"))
o:value("1", translate("base64"))
o:value("2", translate("string"))
o.rmempty = true

o = s:option(Value, "auth_payload", translate("Authentication payload"))
o:depends({type = "hysteria", auth_type = "1"})
o:depends({type = "hysteria", auth_type = "2"})
o.rmempty = true

o = s:option(Value, "recv_window", translate("QUIC connection receive window"))
o.datatype = "uinteger"
o:depends("type", "hysteria")
o.rmempty = true

o = s:option(Value, "recv_window_conn", translate("QUIC stream receive window"))
o.datatype = "uinteger"
o:depends("type", "hysteria")
o.rmempty = true

o = s:option(Flag, "disable_mtu_discovery", translate("Disable Path MTU discovery"))
o:depends("type", "hysteria")
o.rmempty = true

-- VmessId
o = s:option(Value, "vmess_id", translate("Vmess/VLESS ID (UUID)"))
o.rmempty = true
o.default = uuid
o:depends({type = "v2ray", v2ray_protocol = "vmess"})
o:depends({type = "v2ray", v2ray_protocol = "vless"})

-- VLESS Encryption
o = s:option(Value, "vless_encryption", translate("VLESS Encryption"))
o.rmempty = true
o.default = "none"
o:depends({type = "v2ray", v2ray_protocol = "vless"})

-- 加密方式
o = s:option(ListValue, "security", translate("Encrypt Method"))
for _, v in ipairs(securitys) do
	o:value(v, v:upper())
end
o.rmempty = true
o:depends({type = "v2ray", v2ray_protocol = "vmess"})

-- SOCKS Version
o = s:option(ListValue, "socks_ver", translate("Socks Version"))
o:value("4", "Socks4")
o:value("4a", "Socks4A")
o:value("5", "Socks5")
o.rmempty = true
o.default = "5"
o:depends({type = "v2ray", v2ray_protocol = "socks"})

-- 传输协议
o = s:option(ListValue, "transport", translate("Transport"))
o:value("tcp", "TCP")
o:value("kcp", "mKCP")
o:value("ws", "WebSocket")
o:value("h2", "HTTP/2")
o:value("quic", "QUIC")
o:value("grpc", "gRPC")
o.rmempty = true
o:depends({type = "v2ray", v2ray_protocol = "vless"})
o:depends({type = "v2ray", v2ray_protocol = "vmess"})
o:depends({type = "v2ray", v2ray_protocol = "trojan"})
o:depends({type = "v2ray", v2ray_protocol = "shadowsocks"})
o:depends({type = "v2ray", v2ray_protocol = "socks"})
o:depends({type = "v2ray", v2ray_protocol = "http"})

-- [[ TCP部分 ]]--
-- TCP伪装
o = s:option(ListValue, "tcp_guise", translate("Camouflage Type"))
o:depends("transport", "tcp")
o:value("none", translate("None"))
o:value("http", "HTTP")
o.rmempty = true

-- HTTP域名
o = s:option(Value, "http_host", translate("HTTP Host"))
o:depends("tcp_guise", "http")
o.rmempty = true

-- HTTP路径
o = s:option(Value, "http_path", translate("HTTP Path"))
o:depends("tcp_guise", "http")
o.rmempty = true

-- [[ WS部分 ]]--
-- WS域名
o = s:option(Value, "ws_host", translate("WebSocket Host"))
o:depends({transport = "ws", tls = false})
o.datatype = "hostname"
o.rmempty = true

-- WS路径
o = s:option(Value, "ws_path", translate("WebSocket Path"))
o:depends("transport", "ws")
o.rmempty = true

if is_finded("v2ray") then
	-- 启用WS前置数据
	o = s:option(Flag, "ws_ed_enable", translate("Enable early data"))
	o:depends("transport", "ws")

	-- WS前置数据
	o = s:option(Value, "ws_ed", translate("Max Early Data"))
	o:depends("ws_ed_enable", true)
	o.datatype = "uinteger"
	o.default = 2048
	o.rmempty = true

	-- WS前置数据标头
	o = s:option(Value, "ws_ed_header", translate("Early Data Header Name"))
	o:depends("ws_ed_enable", true)
	o.default = "Sec-WebSocket-Protocol"
	o.rmempty = true
end

-- [[ H2部分 ]]--

-- H2域名
o = s:option(Value, "h2_host", translate("HTTP/2 Host"))
o:depends("transport", "h2")
o.rmempty = true

-- H2路径
o = s:option(Value, "h2_path", translate("HTTP/2 Path"))
o:depends("transport", "h2")
o.rmempty = true

-- gRPC
o = s:option(Value, "serviceName", translate("gRPC Service Name"))
o:depends("transport", "grpc")
o.rmempty = true

if is_finded("xray") or is_installed("sagernet-core") then
	-- gPRC模式
	o = s:option(ListValue, "grpc_mode", translate("gRPC Mode"))
	o:depends("transport", "grpc")
	o:value("gun", translate("Gun"))
	o:value("multi", translate("Multi"))
	if is_installed("sagernet-core") then
		o:value("raw", translate("Raw"))
	end
	o.rmempty = true
end

if is_finded("xray") or is_installed("sagernet-core") then
	-- gRPC初始窗口
	o = s:option(Value, "initial_windows_size", translate("Initial Windows Size"))
	o.datatype = "uinteger"
	o:depends("transport", "grpc")
	o.default = 0
	o.rmempty = true

	-- H2/gRPC健康检查
	o = s:option(Flag, "health_check", translate("H2/gRPC Health Check"))
	o:depends("transport", "h2")
	o:depends("transport", "grpc")
	o.rmempty = true

	o = s:option(Value, "read_idle_timeout", translate("H2 Read Idle Timeout"))
	o.datatype = "uinteger"
	o:depends({health_check = true, transport = "h2"})
	o.default = 60
	o.rmempty = true

	o = s:option(Value, "idle_timeout", translate("gRPC Idle Timeout"))
	o.datatype = "uinteger"
	o:depends({health_check = true, transport = "grpc"})
	o.default = 60
	o.rmempty = true

	o = s:option(Value, "health_check_timeout", translate("Health Check Timeout"))
	o.datatype = "uinteger"
	o:depends("health_check", 1)
	o.default = 20
	o.rmempty = true

	o = s:option(Flag, "permit_without_stream", translate("Permit Without Stream"))
	o:depends({health_check = true, transport = "grpc"})
	o.rmempty = true
end

-- [[ QUIC部分 ]]--
o = s:option(ListValue, "quic_security", translate("QUIC Security"))
o:depends("transport", "quic")
o:value("none", translate("None"))
o:value("aes-128-gcm", translate("aes-128-gcm"))
o:value("chacha20-poly1305", translate("chacha20-poly1305"))
o.rmempty = true

o = s:option(Value, "quic_key", translate("QUIC Key"))
o:depends("transport", "quic")
o.rmempty = true

o = s:option(ListValue, "quic_guise", translate("Header"))
o:depends("transport", "quic")
o.rmempty = true
o:value("none", translate("None"))
o:value("srtp", translate("VideoCall (SRTP)"))
o:value("utp", translate("BitTorrent (uTP)"))
o:value("wechat-video", translate("WechatVideo"))
o:value("dtls", translate("DTLS 1.2"))
o:value("wireguard", translate("WireGuard"))

-- [[ mKCP部分 ]]--
o = s:option(ListValue, "kcp_guise", translate("Camouflage Type"))
o:depends("transport", "kcp")
o:value("none", translate("None"))
o:value("srtp", translate("VideoCall (SRTP)"))
o:value("utp", translate("BitTorrent (uTP)"))
o:value("wechat-video", translate("WechatVideo"))
o:value("dtls", translate("DTLS 1.2"))
o:value("wireguard", translate("WireGuard"))
o.rmempty = true

o = s:option(Value, "mtu", translate("MTU"))
o.datatype = "uinteger"
o:depends("transport", "kcp")
o:depends({type = "v2ray", v2ray_protocol = "wireguard"})
-- o.default = 1350
o.rmempty = true

o = s:option(Value, "tti", translate("TTI"))
o.datatype = "uinteger"
o:depends("transport", "kcp")
o.default = 50
o.rmempty = true

o = s:option(Value, "uplink_capacity", translate("Uplink Capacity"))
o.datatype = "uinteger"
o:depends("transport", "kcp")
o:depends("type", "hysteria")
o.default = 5
o.rmempty = true

o = s:option(Value, "downlink_capacity", translate("Downlink Capacity"))
o.datatype = "uinteger"
o:depends("transport", "kcp")
o:depends("type", "hysteria")
o.default = 20
o.rmempty = true

o = s:option(Value, "read_buffer_size", translate("Read Buffer Size"))
o.datatype = "uinteger"
o:depends("transport", "kcp")
o.default = 2
o.rmempty = true

o = s:option(Value, "write_buffer_size", translate("Write Buffer Size"))
o.datatype = "uinteger"
o:depends("transport", "kcp")
o.default = 2
o.rmempty = true

o = s:option(Value, "seed", translate("Obfuscate password (optional)"))
o:depends("transport", "kcp")
o:depends("type", "hysteria")
o.rmempty = true

o = s:option(Flag, "congestion", translate("Congestion"))
o:depends("transport", "kcp")
o.rmempty = true

-- [[ WireGuard 部分 ]]--
o = s:option(DynamicList, "local_addresses", translate("Local addresses"))
o:depends({type = "v2ray", v2ray_protocol = "wireguard"})
o.rmempty = true

o = s:option(Value, "private_key", translate("Private key"))
o:depends({type = "v2ray", v2ray_protocol = "wireguard"})
o.password = true
o.rmempty = true

o = s:option(Value, "peer_pubkey", translate("Peer public key"))
o:depends({type = "v2ray", v2ray_protocol = "wireguard"})
o.rmempty = true

o = s:option(Value, "preshared_key", translate("Pre-shared key"))
o:depends({type = "v2ray", v2ray_protocol = "wireguard"})
o.password = true
o.rmempty = true

-- [[ TLS ]]--
o = s:option(Flag, "tls", translate("TLS"))
o.rmempty = true
o.default = "0"
o:depends({type = "v2ray", v2ray_protocol = "vless", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "vmess", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "trojan", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "shadowsocks", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "socks", socks_ver = "5", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "http", xtls = false})
o:depends("type", "trojan")

-- XTLS
if is_finded("xray") then
	o = s:option(Flag, "xtls", translate("XTLS"))
	o.rmempty = true
	o.default = "0"
	o:depends({type = "v2ray", v2ray_protocol = "vless", transport = "tcp", tls = false})
	o:depends({type = "v2ray", v2ray_protocol = "vless", transport = "kcp", tls = false})
	o:depends({type = "v2ray", v2ray_protocol = "trojan", transport = "tcp", tls = false})
	o:depends({type = "v2ray", v2ray_protocol = "trojan", transport = "kcp", tls = false})
end

-- Flow
o = s:option(Value, "vless_flow", translate("Flow"))
for _, v in ipairs(flows) do
	o:value(v, translate(v))
end
o.rmempty = true
o.default = "xtls-rprx-splice"
o:depends("xtls", true)

-- [[ TLS部分 ]] --
o = s:option(Flag, "tls_sessionTicket", translate("Session Ticket"))
o:depends({type = "trojan", tls = true})
o.default = "0"

if is_finded("xray") then
	-- [[ uTLS ]]--
	o = s:option(ListValue, "fingerprint", translate("Finger Print"))
	o:value("disable", translate("disable"))
	o:value("firefox", translate("firefox"))
	o:value("chrome", translate("chrome"))
	o:value("safari", translate("safari"))
	o:value("randomized", translate("randomized"))
	o:depends({type = "v2ray", tls = true})
	o.default = "disable"
end

o = s:option(Value, "tls_host", translate("TLS Host"))
o.datatype = "hostname"
o:depends("tls", true)
o:depends("xtls", true)
o:depends("type", "hysteria")
o.rmempty = true

o = s:option(Value, "quic_tls_alpn", translate("QUIC TLS ALPN"))
o:depends("type", "hysteria")
o.rmempty = true

-- [[ allowInsecure ]]--
o = s:option(Flag, "insecure", translate("allowInsecure"))
o.rmempty = false
o:depends("tls", true)
o:depends("xtls", true)
o:depends("type", "hysteria")
o.description = translate("If true, allowss insecure connection at TLS client, e.g., TLS server uses unverifiable certificates.")

-- [[ Mux ]]--
o = s:option(Flag, "mux", translate("Mux"))
o.rmempty = false
o:depends({type = "v2ray", v2ray_protocol = "vless", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "vmess", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "trojan", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "shadowsocks", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "socks", xtls = false})
o:depends({type = "v2ray", v2ray_protocol = "http", xtls = false})

o = s:option(Value, "concurrency", translate("Concurrency"))
o.datatype = "uinteger"
o.rmempty = true
o.default = "4"
o:depends("mux", "1")
o:depends("type", "naiveproxy")

-- [[ Cert ]]--
o = s:option(Flag, "certificate", translate("Self-signed Certificate"))
o.rmempty = true
o.default = "0"
o:depends({type = "hysteria", insecure = false})
o:depends({type = "trojan", tls = true, insecure = false})
o:depends({type = "v2ray", v2ray_protocol = "vmess", tls = true, insecure = false})
o:depends({type = "v2ray", v2ray_protocol = "vless", tls = true, insecure = false})
o:depends({type = "v2ray", v2ray_protocol = "vmess", xtls = true, insecure = false})
o:depends({type = "v2ray", v2ray_protocol = "vless", xtls = true, insecure = false})
o.description = translate("If you have a self-signed certificate,please check the box")

o = s:option(DummyValue, "upload", translate("Upload"))
o.template = "shadowsocksr/certupload"
o:depends("certificate", 1)

cert_dir = "/etc/ssl/private/"
local path

luci.http.setfilehandler(function(meta, chunk, eof)
	if not fd then
		if (not meta) or (not meta.name) or (not meta.file) then
			return
		end
		fd = nixio.open(cert_dir .. meta.file, "w")
		if not fd then
			path = translate("Create upload file error.")
			return
		end
	end
	if chunk and fd then
		fd:write(chunk)
	end
	if eof and fd then
		fd:close()
		fd = nil
		path = '/etc/ssl/private/' .. meta.file .. ''
	end
end)
if luci.http.formvalue("upload") then
	local f = luci.http.formvalue("ulfile")
	if #f <= 0 then
		path = translate("No specify upload file.")
	end
end

o = s:option(Value, "certpath", translate("Current Certificate Path"))
o:depends("certificate", 1)
o:value("/etc/ssl/private/ca.pem")
o.description = translate("Please confirm the current certificate path")
o.default = "/etc/ssl/private/ca.pem"

o = s:option(Flag, "fast_open", translate("TCP Fast Open"))
o.rmempty = true
o.default = "0"
o:depends("type", "ssr")
o:depends("type", "ss")
o:depends("type", "trojan")

if is_installed("sagernet-core") then
	o = s:option(ListValue, "packet_encoding", translate("Packet Encoding"))
	o:value("none", translate("none"))
	o:value("packet", translate("packet (v2ray-core v5+)"))
	o:value("xudp", translate("xudp (Xray-core)"))
	o.default = "xudp"
	o.rmempty = true
	o:depends({type = "v2ray", v2ray_protocol = "vless"})
	o:depends({type = "v2ray", v2ray_protocol = "vmess"})
end

o = s:option(Flag, "switch_enable", translate("Enable Auto Switch"))
o.rmempty = false
o.default = "1"

o = s:option(Value, "local_port", translate("Local Port"))
o.datatype = "port"
o.default = 1234
o.rmempty = false

if is_finded("kcptun-client") then
	o = s:option(Flag, "kcp_enable", translate("KcpTun Enable"))
	o.rmempty = true
	o.default = "0"
	o:depends("type", "ssr")
	o:depends("type", "ss")

	o = s:option(Value, "kcp_port", translate("KcpTun Port"))
	o.datatype = "port"
	o.default = 4000
	o:depends("type", "ssr")
	o:depends("type", "ss")

	o = s:option(Value, "kcp_password", translate("KcpTun Password"))
	o.password = true
	o:depends("type", "ssr")
	o:depends("type", "ss")

	o = s:option(Value, "kcp_param", translate("KcpTun Param"))
	o.default = "--nocomp"
	o:depends("type", "ssr")
	o:depends("type", "ss")
end

return m
