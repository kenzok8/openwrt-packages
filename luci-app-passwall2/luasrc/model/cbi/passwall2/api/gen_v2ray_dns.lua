module("luci.model.cbi.passwall2.api.gen_v2ray_dns", package.seeall)
local api = require "luci.model.cbi.passwall2.api.api"

local var = api.get_args(arg)
local dns_listen_port = var["-dns_listen_port"]
local dns_query_strategy = var["-dns_query_strategy"]
local dns_out_tag = var["-dns_out_tag"]
local dns_client_ip = var["-dns_client_ip"]
local direct_dns_server = var["-direct_dns_server"]
local direct_dns_port = var["-direct_dns_port"]
local direct_dns_udp_server = var["-direct_dns_udp_server"]
local direct_dns_tcp_server = var["-direct_dns_tcp_server"]
local direct_dns_doh_url = var["-direct_dns_doh_url"]
local direct_dns_doh_host = var["-direct_dns_doh_host"]
local remote_dns_server = var["-remote_dns_server"]
local remote_dns_port = var["-remote_dns_port"]
local remote_dns_udp_server = var["-remote_dns_udp_server"]
local remote_dns_tcp_server = var["-remote_dns_tcp_server"]
local remote_dns_doh_url = var["-remote_dns_doh_url"]
local remote_dns_doh_host = var["-remote_dns_doh_host"]
local remote_dns_outbound_socks_address = var["-remote_dns_outbound_socks_address"]
local remote_dns_outbound_socks_port = var["-remote_dns_outbound_socks_port"]
local remote_dns_fake = var["-remote_dns_fake"]
local dns_cache = var["-dns_cache"]
local loglevel = var["-loglevel"] or "warning"

local jsonc = api.jsonc
local dns = nil
local fakedns = nil
local inbounds = {}
local outbounds = {}
local routing = nil

function gen_outbound(tag, proto, address, port, username, password)
    local result = {
        tag = tag,
        protocol = proto,
        streamSettings = {
            network = "tcp",
            security = "none"
        },
        settings = {
            servers = {
                {
                    address = address,
                    port = tonumber(port),
                    users = (username and password) and {
                        {
                            user = username,
                            pass = password
                        }
                    } or nil
                }
            }
        }
    }
    return result
end

if dns_listen_port then
    routing = {
        domainStrategy = "IPOnDemand",
        rules = {}
    }

    dns = {
        tag = "dns-in1",
        hosts = {},
        disableCache = (dns_cache and dns_cache == "0") and true or false,
        disableFallback = true,
        disableFallbackIfMatch = true,
        servers = {},
        clientIp = (dns_client_ip and dns_client_ip ~= "") and dns_client_ip or nil,
        queryStrategy = (dns_query_strategy and dns_query_strategy ~= "") and dns_query_strategy or "UseIPv4"
    }

    local tmp_dns_server, tmp_dns_port, tmp_dns_proto

    if dns_out_tag == "remote" then
        local _remote_dns = {
            _flag = "remote"
        }

        if remote_dns_udp_server then
            _remote_dns.address = remote_dns_udp_server
            _remote_dns.port = tonumber(remote_dns_port) or 53
            tmp_dns_proto = "udp"
        end

        if remote_dns_tcp_server then
            _remote_dns.address = remote_dns_tcp_server
            _remote_dns.port = tonumber(remote_dns_port) or 53
            tmp_dns_proto = "tcp"
        end

        if remote_dns_doh_url and remote_dns_doh_host then
            if remote_dns_server and remote_dns_doh_host ~= remote_dns_server and not api.is_ip(remote_dns_doh_host) then
                dns.hosts[remote_dns_doh_host] = remote_dns_server
            end
            _remote_dns.address = remote_dns_doh_url
            _remote_dns.port = tonumber(remote_dns_port) or 443
            tmp_dns_proto = "tcp"
        end

        if remote_dns_fake then
            remote_dns_server = "1.1.1.1"
            fakedns = {}
            fakedns[#fakedns + 1] = {
                ipPool = "198.18.0.0/16",
                poolSize = 65535
            }
            if dns_query_strategy == "UseIP" then
                fakedns[#fakedns + 1] = {
                    ipPool = "fc00::/18",
                    poolSize = 65535
                }
            end
            _remote_dns.address = "fakedns"
        end

        tmp_dns_server = remote_dns_server

        tmp_dns_port = remote_dns_port

        table.insert(dns.servers, _remote_dns)

        table.insert(outbounds, 1, gen_outbound("remote", "socks", remote_dns_outbound_socks_address, remote_dns_outbound_socks_port))
    elseif dns_out_tag == "direct" then
        local _direct_dns = {
            _flag = "direct"
        }

        if direct_dns_udp_server then
            _direct_dns.address = direct_dns_udp_server
            _direct_dns.port = tonumber(direct_dns_port) or 53
            table.insert(routing.rules, 1, {
                type = "field",
                ip = {
                    direct_dns_udp_server
                },
                port = tonumber(direct_dns_port) or 53,
                network = "udp",
                outboundTag = "direct"
            })
        end

        if direct_dns_tcp_server then
            _direct_dns.address = direct_dns_tcp_server:gsub("tcp://", "tcp+local://")
            _direct_dns.port = tonumber(direct_dns_port) or 53
        end

        if direct_dns_doh_url and direct_dns_doh_host then
            if direct_dns_server and direct_dns_doh_host ~= direct_dns_server and not api.is_ip(direct_dns_doh_host) then
                dns.hosts[direct_dns_doh_host] = direct_dns_server
            end
            _direct_dns.address = direct_dns_doh_url:gsub("https://", "https+local://")
            _direct_dns.port = tonumber(direct_dns_port) or 443
        end

        tmp_dns_server = direct_dns_server

        tmp_dns_port = direct_dns_port

        table.insert(dns.servers, _direct_dns)

        table.insert(outbounds, 1, {
            protocol = "freedom",
            tag = "direct",
            settings = {
                domainStrategy = (dns_query_strategy and dns_query_strategy ~= "") and dns_query_strategy or "UseIPv4"
            },
            streamSettings = {
                sockopt = {
                    mark = 255
                }
            }
        })
    end

    local dns_hosts_len = 0
    for key, value in pairs(dns.hosts) do
        dns_hosts_len = dns_hosts_len + 1
    end

    if dns_hosts_len == 0 then
        dns.hosts = nil
    end

    table.insert(inbounds, {
        listen = "127.0.0.1",
        port = tonumber(dns_listen_port),
        protocol = "dokodemo-door",
        tag = "dns-in",
        settings = {
            address = tmp_dns_server or "1.1.1.1",
            port = 53,
            network = "tcp,udp"
        }
    })

    table.insert(outbounds, {
        tag = "dns-out",
        protocol = "dns",
        settings = {
            address = tmp_dns_server or "1.1.1.1",
            port = tonumber(tmp_dns_port) or 53,
            network = tmp_dns_proto or "tcp",
        }
    })

    table.insert(routing.rules, 1, {
        type = "field",
        inboundTag = {
            "dns-in"
        },
        outboundTag = "dns-out"
    })

    table.insert(routing.rules, {
        type = "field",
        inboundTag = {
            "dns-in1"
        },
        outboundTag = dns_out_tag
    })
end

if inbounds or outbounds then
    local config = {
        log = {
            --dnsLog = true,
            loglevel = loglevel
        },
        -- DNS
        dns = dns,
        fakedns = fakedns,
        -- 传入连接
        inbounds = inbounds,
        -- 传出连接
        outbounds = outbounds,
        -- 路由
        routing = routing
    }
    print(jsonc.stringify(config, 1))
end
