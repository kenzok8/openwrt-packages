#!/bin/sh
NAME=shadowsocksr
switch_server=$1
uci_get_by_type() {
	local ret=$(uci get $NAME.@$1[0].$2 2>/dev/null)
	echo ${ret:=$3}
}
if [ -z "$switch_server" ]; then
	GLOBAL_SERVER=$(uci_get_by_type global global_server nil)
else
	GLOBAL_SERVER=$switch_server
fi

mkdir -p /tmp/dnsmasq.ssr
if [ "$(uci_get_by_type global run_mode router)" == "oversea" ]; then
	cp -rf /etc/ssr/oversea_list.conf /tmp/dnsmasq.ssr/
else
	cp -rf /etc/ssr/gfw_list.conf /tmp/dnsmasq.ssr/
	cp -rf /etc/ssr/gfw_base.conf /tmp/dnsmasq.ssr/
fi

NETFLIX_SERVER=$(uci_get_by_type global netflix_server nil)
[ "$NETFLIX_SERVER" == "same" ] && NETFLIX_SERVER=$GLOBAL_SERVER
if [ "$NETFLIX_SERVER" != "nil" ]; then
	netflix() {
		if [ -f "/tmp/dnsmasq.ssr/gfw_list.conf" ]; then
			for line in $(cat /etc/ssr/netflix.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/gfw_list.conf; done
			for line in $(cat /etc/ssr/netflix.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/gfw_base.conf; done
		fi
		sed "/.*/s/.*/server=\/&\/127.0.0.1#$1\nipset=\/&\/netflix/" /etc/ssr/netflix.list >/tmp/dnsmasq.ssr/netflix_forward.conf
	}
	if [ "$NETFLIX_SERVER" != "$GLOBAL_SERVER" ]; then
		netflix 5555
	else
		netflix 5335
	fi
else
	rm -f /tmp/dnsmasq.ssr/netflix_forward.conf
fi
for line in $(cat /etc/ssr/black.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/gfw_list.conf; done
for line in $(cat /etc/ssr/black.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/gfw_base.conf; done
for line in $(cat /etc/ssr/white.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/gfw_list.conf; done
for line in $(cat /etc/ssr/white.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/gfw_base.conf; done
for line in $(cat /etc/ssr/deny.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/gfw_list.conf; done
for line in $(cat /etc/ssr/deny.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/gfw_base.conf; done
sed "/.*/s/.*/server=\/&\/127.0.0.1#5335\nipset=\/&\/blacklist/" /etc/ssr/black.list >/tmp/dnsmasq.ssr/blacklist_forward.conf
sed "/.*/s/.*/server=\/&\/127.0.0.1\nipset=\/&\/whitelist/" /etc/ssr/white.list >/tmp/dnsmasq.ssr/whitelist_forward.conf
sed "/.*/s/.*/address=\/&\//" /etc/ssr/deny.list >/tmp/dnsmasq.ssr/denylist.conf
if [ "$(uci_get_by_type global adblock 0)" == "1" ]; then
	[ -z "$switch_server" ] && cp -f /etc/ssr/ad.conf /tmp/dnsmasq.ssr/
	if [ -f "/tmp/dnsmasq.ssr/ad.conf" ]; then
		for line in $(cat /etc/ssr/black.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/ad.conf; done
		for line in $(cat /etc/ssr/white.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/ad.conf; done
		for line in $(cat /etc/ssr/deny.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/ad.conf; done
		for line in $(cat /etc/ssr/netflix.list); do sed -i "/$line/d" /tmp/dnsmasq.ssr/ad.conf; done
	fi
else
	rm -f /tmp/dnsmasq.ssr/ad.conf
fi
