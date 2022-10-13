#!/bin/bash

logfile_path() (
	configfile=$(uci -q get mosdns.mosdns.configfile)
	if [ "$configfile" = "./def_config.yaml" ]; then
		uci -q get mosdns.mosdns.logfile
	else
		[ ! -f /etc/mosdns/cus_config.yaml ] && exit 1
		cat /etc/mosdns/cus_config.yaml | grep -A 4 log | grep file | awk -F ":" '{print $2}' | sed 's/\"//g;s/ //g'
	fi
)

bakdns() {
	if [ "$1" == "0" ]; then
		echo "119.29.29.29"
	elif [ "$1" == "1" ]; then
		echo "101.226.4.6"
	fi
}

exist() {
  command -v "$1" >/dev/null 2>&1
}

getdat() {
  if exist curl; then
    curl -fSLo "$TMPDIR/$1" "https://gh.404delivr.workers.dev/https://github.com/QiuSimons/openwrt-mos/raw/master/dat/$1"
  else
    wget "https://gh.404delivr.workers.dev/https://github.com/QiuSimons/openwrt-mos/raw/master/dat/$1" --no-check-certificate -O "$TMPDIR/$1"
  fi
}

getdns() {
  if [ "$2" == "inactive" ]; then
    ubus call network.interface.wan status | jsonfilter -e "@['inactive']['dns-server'][$1]"
  else
    ubus call network.interface.wan status | jsonfilter -e "@['dns-server'][$1]"
  fi
}

pid() {
	pgrep -f "$1"
}


L_exist() {
	if [ "$1" == "ssrp" ]; then
		uci get shadowsocksr.@global[0].global_server &>/dev/null
	elif [ "$1" == "pw" ]; then
		uci get passwall.@global[0].enabled &>/dev/null
	elif [ "$1" == "pw2" ]; then
		uci get passwall2.@global[0].enabled &>/dev/null
	elif [ "$1" == "vssr" ]; then
		uci get vssr.@global[0].global_server &>/dev/null
	fi
}

if [ "$1" == "logfile" ]; then
	logfile_path
fi
