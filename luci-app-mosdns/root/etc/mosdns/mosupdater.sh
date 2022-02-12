#!/bin/bash -e
set -o pipefail
rm -rf  /tmp/mosdns
mkdir /tmp/mosdns
#wget https://cdn.jsdelivr.net/gh/QiuSimons/openwrt-mos@master/luci-app-mosdns/root/etc/mosdns/geoip.dat -nv -O /tmp/mosdns/geoip.dat
#wget https://cdn.jsdelivr.net/gh/QiuSimons/openwrt-mos@master/luci-app-mosdns/root/etc/mosdns/geosite.dat -nv -O /tmp/mosdns/geosite.dat
#wget https://cdn.jsdelivr.net/gh/QiuSimons/openwrt-mos@master/luci-app-mosdns/root/etc/mosdns/serverlist.txt -nv -O /tmp/mosdns/serverlist.txt
wget https://gh.404delivr.workers.dev/https://github.com/QiuSimons/openwrt-mos/raw/master/luci-app-mosdns/root/etc/mosdns/geoip.dat -nv -O /tmp/mosdns/geoip.dat
wget https://gh.404delivr.workers.dev/https://github.com/QiuSimons/openwrt-mos/raw/master/luci-app-mosdns/root/etc/mosdns/geosite.dat -nv -O /tmp/mosdns/geosite.dat
wget https://gh.404delivr.workers.dev/https://github.com/QiuSimons/openwrt-mos/raw/master/luci-app-mosdns/root/etc/mosdns/serverlist.txt -nv -O /tmp/mosdns/serverlist.txt
find /tmp/mosdns/* -size -20k -exec rm {} \;
syncconfig=$(uci -q get mosdns.mosdns.syncconfig)
if [ $syncconfig -eq 1 ]; then
#wget https://cdn.jsdelivr.net/gh/QiuSimons/openwrt-mos@master/luci-app-mosdns/root/etc/mosdns/def_config.yaml -nv -O /tmp/mosdns/def_config.yaml
wget https://gh.404delivr.workers.dev/https://github.com/QiuSimons/openwrt-mos/raw/master/luci-app-mosdns/root/etc/mosdns/def_config.yaml -nv -O /tmp/mosdns/def_config.yaml
find /tmp/mosdns/* -size -2k -exec rm {} \;
fi
chmod -R  755  /tmp/mosdns
cp -rf /tmp/mosdns/* /etc/mosdns
rm -rf  /tmp/mosdns
exit 0
