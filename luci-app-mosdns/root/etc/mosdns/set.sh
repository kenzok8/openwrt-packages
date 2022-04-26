#!/bin/bash -e
# shellcheck source=/etc/mosdns/library.sh

source /etc/mosdns/library.sh

if L_exist ssrp; then
	if [ "$1" = "unset" ]; then
		uci set shadowsocksr.@global[0].pdnsd_enable='1'
		uci set shadowsocksr.@global[0].tunnel_forward='8.8.4.4:53'
	elif [ "$1" = "" ]; then
		uci set shadowsocksr.@global[0].pdnsd_enable='0'
		uci del shadowsocksr.@global[0].tunnel_forward
		uci del shadowsocksr.@global[0].adblock_url
	fi
	uci commit shadowsocksr
	if [ "$(pid ssrplus)" ]; then
		/etc/init.d/shadowsocksr restart
	fi
fi
if L_exist pw; then
	if [ "$1" = "unset" ]; then
		uci set passwall.@global[0].dns_mode='pdnsd'
		uci set passwall.@global[0].dns_forward='8.8.8.8'
		uci set passwall.@global[0].dns_cache='1'
		uci set passwall.@global[0].chinadns_ng='1'
	elif [ "$1" = "" ]; then
		uci set passwall.@global[0].dns_mode='udp'
		uci set passwall.@global[0].dns_forward='127.0.0.1:5335'
		uci del passwall.@global[0].dns_cache
		uci set passwall.@global[0].chinadns_ng='0'
	fi
	uci commit passwall
	if [ "$(pid passwall)" ]; then
		/etc/init.d/passwall restart
	fi
fi
if L_exist vssr; then
	if [ "$1" = "unset" ]; then
		uci set vssr.@global[0].pdnsd_enable='1'
	elif [ "$1" = "" ]; then
		uci set vssr.@global[0].pdnsd_enable='0'
	fi
	uci commit vssr
	if [ "$(pid vssr)" ]; then
		/etc/init.d/vssr restart
	fi
fi
exit 0
