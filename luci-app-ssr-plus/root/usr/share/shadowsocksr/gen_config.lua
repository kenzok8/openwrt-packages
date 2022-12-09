#!/usr/bin/lua

local ucursor = require "luci.model.uci".cursor()
local json = require "luci.jsonc"

local server_section = arg[1]
local proto = arg[2]
local local_port = arg[3] or "0"
local socks_port = arg[4] or "0"

local server = ucursor:get_all("shadowsocksr", server_section)
local outbound_settings = nil

function vmess_vless()
	outbound_settings = {
		vnext = {
			{
				address = server.server,
				port = tonumber(server.server_port),
				users = {
					{
						id = server.vmess_id,
						security = (server.v2ray_protocol == "vmess" or not server.v2ray_protocol) and server.security or nil,
						encryption = (server.v2ray_protocol == "vless") and server.vless_encryption or nil,
						flow = (server.xtls == '1') and (server.vless_flow or "xtls-rprx-splice") or (server.tls == '1') and server.tls_flow or nil
					}
				}
			}
		},
		packetEncoding = server.packet_encoding or nil
	}
end
function trojan_shadowsocks()
	outbound_settings = {
		plugin = ((server.v2ray_protocol == "shadowsocks") and server.plugin ~= "none" and server.plugin) or (server.v2ray_protocol == "shadowsocksr" and "shadowsocksr") or nil,
		pluginOpts = (server.v2ray_protocol == "shadowsocks") and server.plugin_opts or nil,
		pluginArgs = (server.v2ray_protocol == "shadowsocksr") and {
			"--protocol=" .. server.protocol,
			"--protocol-param=" .. (server.protocol_param or ""),
			"--obfs=" .. server.obfs,
			"--obfs-param=" .. (server.obfs_param or "")
		} or nil,
		servers = {
			{
				address = server.server,
				port = tonumber(server.server_port),
				password = server.password,
				method = ((server.v2ray_protocol == "shadowsocks") and server.encrypt_method_ss) or ((server.v2ray_protocol == "shadowsocksr") and server.encrypt_method) or nil,
				uot = (server.v2ray_protocol == "shadowsocks") and (server.uot == '1') or nil,
				ivCheck = (server.v2ray_protocol == "shadowsocks") and (server.ivCheck == '1') or nil,
				flow = (server.v2ray_protocol == "trojan") and (server.xtls == '1') and (server.vless_flow or "xtls-rprx-splice") or nil
			}
		}
	}

	if server.v2ray_protocol == "shadowsocksr" then
		server.v2ray_protocol = "shadowsocks"
	end
end
function socks_http()
	outbound_settings = {
		version = server.socks_ver or nil,
		servers = {
			{
				address = server.server,
				port = tonumber(server.server_port),
				users = (server.auth_enable == "1") and {
					{
						user = server.username,
						pass = server.password
					}
				} or nil
			}
		}
	}
end
function wireguard()
	outbound_settings = {
		secretKey = server.private_key,
		address = server.local_addresses,
		peers = {
			{
				publicKey = server.peer_pubkey,
				preSharedKey = server.preshared_key,
				endpoint = server.server .. ":" .. server.server_port
			}
		},
		mtu = tonumber(server.mtu)
	}
end
local outbound = {}
function outbound:new(o)
	o = o or {}
	setmetatable(o, self)
	self.__index = self
	return o
end
function outbound:handleIndex(index)
	local switch = {
		vmess = function()
			vmess_vless()
		end,
		vless = function()
			vmess_vless()
		end,
		trojan = function()
			trojan_shadowsocks()
		end,
		shadowsocks = function()
			trojan_shadowsocks()
		end,
		shadowsocksr = function()
			trojan_shadowsocks()
		end,
		socks = function()
			socks_http()
		end,
		http = function()
			socks_http()
		end,
		wireguard = function()
			wireguard()
		end
	}
	if switch[index] then
		switch[index]()
	end
end
local settings = outbound:new()
settings:handleIndex(server.v2ray_protocol)
local Xray = {
	log = {
		-- error = "/var/ssrplus.log",
		loglevel = "warning"
	},
	-- 传入连接
	inbound = (local_port ~= "0") and {
		-- listening
		port = tonumber(local_port),
		protocol = "dokodemo-door",
		settings = {network = proto, followRedirect = true},
		sniffing = {enabled = true, destOverride = {"http", "tls"}}
	} or nil,
	-- 开启 socks 代理
	inboundDetour = (proto:find("tcp") and socks_port ~= "0") and {
		{
			-- socks
			protocol = "socks",
			port = tonumber(socks_port),
			settings = {auth = "noauth", udp = true}
		}
	} or nil,
	-- 传出连接
	outbound = {
		protocol = server.v2ray_protocol,
		settings = outbound_settings,
		-- 底层传输配置
		streamSettings = {
			network = server.transport or "tcp",
			security = (server.xtls == '1') and "xtls" or (server.tls == '1') and "tls" or nil,
			tlsSettings = (server.tls == '1' and (server.insecure == "1" or server.tls_host or server.fingerprint)) and {
				-- tls
				alpn = server.tls_alpn,
				fingerprint = server.fingerprint,
				allowInsecure = (server.insecure == "1") and true or nil,
				serverName = server.tls_host,
				certificates = server.certificate and {
					usage = "verify",
					certificateFile = server.certpath
				} or nil
			} or nil,
			xtlsSettings = (server.xtls == '1' and (server.insecure == "1" or server.tls_host or server.fingerprint)) and {
				-- xtls
				alpn = server.tls_alpn,
				fingerprint = server.fingerprint,
				allowInsecure = (server.insecure == "1") and true or nil,
				serverName = server.tls_host,
				minVersion = "1.3",
				certificates = server.certificate and {
					usage = "verify",
					certificateFile = server.certpath
				} or nil
			} or nil,
			tcpSettings = (server.transport == "tcp" and server.tcp_guise == "http") and {
				-- tcp
				header = {
					type = server.tcp_guise,
					request = {
						-- request
						path = {server.http_path} or {"/"},
						headers = {Host = {server.http_host} or {}}
					}
				}
			} or nil,
			kcpSettings = (server.transport == "kcp") and {
				mtu = tonumber(server.mtu),
				tti = tonumber(server.tti),
				uplinkCapacity = tonumber(server.uplink_capacity),
				downlinkCapacity = tonumber(server.downlink_capacity),
				congestion = (server.congestion == "1") and true or false,
				readBufferSize = tonumber(server.read_buffer_size),
				writeBufferSize = tonumber(server.write_buffer_size),
				header = {type = server.kcp_guise},
				seed = server.seed or nil
			} or nil,
			wsSettings = (server.transport == "ws") and (server.ws_path or server.ws_host or server.tls_host) and {
				-- ws
				headers = (server.ws_host or server.tls_host) and {
					-- headers
					Host = server.ws_host or server.tls_host
				} or nil,
				path = server.ws_path,
				maxEarlyData = tonumber(server.ws_ed) or nil,
				earlyDataHeaderName = server.ws_ed_header or nil
			} or nil,
			httpSettings = (server.transport == "h2") and {
				-- h2
				path = server.h2_path or "",
				host = {server.h2_host} or nil,
				read_idle_timeout = tonumber(server.read_idle_timeout) or nil,
				health_check_timeout = tonumber(server.health_check_timeout) or nil
			} or nil,
			quicSettings = (server.transport == "quic") and {
				-- quic
				security = server.quic_security,
				key = server.quic_key,
				header = {type = server.quic_guise}
			} or nil,
			grpcSettings = (server.transport == "grpc") and {
				-- grpc
				serviceName = server.serviceName or "",
				mode = (server.grpc_mode ~= "gun") and server.grpc_mode or nil,
				multiMode = (server.grpc_mode == "multi") and true or false,
				idle_timeout = tonumber(server.idle_timeout) or nil,
				health_check_timeout = tonumber(server.health_check_timeout) or nil,
				permit_without_stream = (server.permit_without_stream == "1") and true or nil,
				initial_windows_size = tonumber(server.initial_windows_size) or nil
			} or nil
		},
		mux = (server.mux == "1" and server.xtls ~= "1" and server.transport ~= "grpc") and {
			-- mux
			enabled = true,
			concurrency = tonumber(server.concurrency),
			packetEncoding = (server.v2ray_protocol == "vmess" or server.v2ray_protocol == "vless") and server.packet_encoding or nil
		} or nil
	} or nil
}
local cipher = "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-SHA:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES128-SHA:ECDHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA:DHE-RSA-AES256-SHA:AES128-SHA:AES256-SHA:DES-CBC3-SHA"
local cipher13 = "TLS_AES_128_GCM_SHA256:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_256_GCM_SHA384"
local trojan = {
	log_level = 3,
	run_type = (proto == "nat" or proto == "tcp") and "nat" or "client",
	local_addr = "0.0.0.0",
	local_port = tonumber(local_port),
	remote_addr = server.server,
	remote_port = tonumber(server.server_port),
	udp_timeout = 60,
	-- 传入连接
	password = {server.password},
	-- 传出连接
	ssl = {
		verify = (server.insecure == "0") and true or false,
		verify_hostname = (server.tls == "1") and true or false,
		cert = (server.certificate) and server.certpath or nil,
		cipher = cipher,
		cipher_tls13 = cipher13,
		sni = server.tls_host,
		alpn = server.tls_alpn or {"h2", "http/1.1"},
		curve = "",
		reuse_session = true,
		session_ticket = (server.tls_sessionTicket == "1") and true or false
	},
	udp_timeout = 60,
	tcp = {
		-- tcp
		no_delay = true,
		keep_alive = true,
		reuse_port = true,
		fast_open = (server.fast_open == "1") and true or false,
		fast_open_qlen = 20
	}
}
local naiveproxy = {
	proxy = (server.username and server.password and server.server and server.server_port) and "https://" .. server.username .. ":" .. server.password .. "@" .. server.server .. ":" .. server.server_port,
	listen = (proto == "redir") and "redir" .. "://0.0.0.0:" .. tonumber(local_port) or "socks" .. "://0.0.0.0:" .. tonumber(local_port),
	["insecure-concurrency"] = tonumber(server.concurrency) or 1
}
local ss = {
	server = (server.kcp_enable == "1") and "127.0.0.1" or server.server,
	server_port = tonumber(server.server_port),
	local_address = "0.0.0.0",
	local_port = tonumber(local_port),
	mode = (proto == "tcp,udp") and "tcp_and_udp" or proto .. "_only",
	password = server.password,
	method = server.encrypt_method_ss,
	timeout = tonumber(server.timeout),
	fast_open = (server.fast_open == "1") and true or false,
	reuse_port = true
}
local hysteria = {
	server = server.server .. ":" .. server.server_port,
	protocol = server.hysteria_protocol,
	up_mbps = tonumber(server.uplink_capacity),
	down_mbps = tonumber(server.downlink_capacity),
	socks5 = (proto:find("tcp") and tonumber(socks_port) and tonumber(socks_port) ~= 0) and {
		listen = "0.0.0.0:" .. tonumber(socks_port),
		timeout = 300,
		disable_udp = false
	} or nil,
	redirect_tcp = (proto:find("tcp") and local_port ~= "0") and {
		listen = "0.0.0.0:" .. tonumber(local_port),
		timeout = 300
	} or nil,
	tproxy_udp = (proto:find("udp") and local_port ~= "0") and {
		listen = "0.0.0.0:" .. tonumber(local_port),
		timeout = 60
	} or nil,
	obfs = server.seed,
	auth = (server.auth_type == "1") and server.auth_payload or nil,
	auth_str = (server.auth_type == "2") and server.auth_payload or nil,
	alpn = server.quic_tls_alpn,
	server_name = server.tls_host,
	insecure = (server.insecure == "1") and true or false,
	ca = (server.certificate) and server.certpath or nil,
	recv_window_conn = tonumber(server.recv_window_conn),
	recv_window = tonumber(server.recv_window),
	disable_mtu_discovery = (server.disable_mtu_discovery == "1") and true or false,
	fast_open = (server.fast_open == "1") and true or false
}
local config = {}
function config:new(o)
	o = o or {}
	setmetatable(o, self)
	self.__index = self
	return o
end
function config:handleIndex(index)
	local switch = {
		ss = function()
			ss.protocol = socks_port
			if server.plugin and server.plugin ~= "none" then
				ss.plugin = server.plugin
				ss.plugin_opts = server.plugin_opts or nil
			end
			print(json.stringify(ss, 1))
		end,
		ssr = function()
			ss.protocol = server.protocol
			ss.protocol_param = server.protocol_param
			ss.method = server.encrypt_method
			ss.obfs = server.obfs
			ss.obfs_param = server.obfs_param
			print(json.stringify(ss, 1))
		end,
		v2ray = function()
			print(json.stringify(Xray, 1))
		end,
		trojan = function()
			print(json.stringify(trojan, 1))
		end,
		naiveproxy = function()
			print(json.stringify(naiveproxy, 1))
		end,
		hysteria = function()
			print(json.stringify(hysteria, 1))
		end
	}
	if switch[index] then
		switch[index]()
	end
end
local f = config:new()
f:handleIndex(server.type)
