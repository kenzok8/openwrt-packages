#!/bin/sh

script_action=${1}

logfile_path() (
    configfile=$(uci -q get mosdns.config.configfile)
    if [ "$configfile" = "/etc/mosdns/config.yaml" ]; then
        uci -q get mosdns.config.logfile
    else
        [ ! -f /etc/mosdns/config_custom.yaml ] && exit 1
        awk '/^log:/{f=1;next}f==1{if($0~/file:/){print;exit}if($0~/^[^ ]/)exit}' /etc/mosdns/config_custom.yaml | grep -Eo "/[^'\"]+"
    fi
)

interface_dns() (
    if [ "$(uci -q get mosdns.config.custom_local_dns)" = 1 ]; then
        uci -q get mosdns.config.local_dns
    else
        peerdns=$(uci -q get network.wan.peerdns)
        proto=$(uci -q get network.wan.proto)
        if [ "$peerdns" = 0 ] || [ "$proto" = "static" ]; then
            uci -q get network.wan.dns
        else
            interface_status=$(ubus call network.interface.wan status)
            echo $interface_status | jsonfilter -e "@['dns-server'][0]"
            echo $interface_status | jsonfilter -e "@['dns-server'][1]"
        fi
        [ $? -ne 0 ] && echo "119.29.29.29 223.5.5.5"
    fi
)

ad_block() (
    adblock=$(uci -q get mosdns.config.adblock)
    if [ "$adblock" = 1 ]; then
        ad_source=$(uci -q get mosdns.config.ad_source)
        if [ "$ad_source" = "geosite.dat" ]; then
            echo "/var/mosdns/geosite_category-ads-all.txt"
        else
            echo "/etc/mosdns/rule/adlist.txt"
        fi
    else
        touch /var/disable-ads.txt ; echo "/var/disable-ads.txt"
    fi
)

adlist_update() (
    ad_source=$(uci -q get mosdns.config.ad_source)
    [ "$ad_source" = "geosite.dat" ] || [ -z "$ad_source" ] && exit 0
    AD_TMPDIR=$(mktemp -d) || exit 1
    if echo "$ad_source" | grep -Eq "^https://raw.githubusercontent.com" ; then
        google_status=$(curl -I -4 -m 3 -o /dev/null -s -w %{http_code} http://www.google.com/generate_204)
        [ "$google_status" -ne "204" ] && mirror="https://ghproxy.com/"
    fi
    echo -e "\e[1;32mDownloading $mirror$ad_source\e[0m"
    curl --connect-timeout 60 -m 90 --ipv4 -kfSLo "$AD_TMPDIR/adlist.txt" "$mirror$ad_source"
    if [ $? -ne 0 ]; then
        rm -rf "$AD_TMPDIR"
        exit 1
    else
        \cp "$AD_TMPDIR/adlist.txt" /etc/mosdns/rule/adlist.txt
        echo "$ad_source" > /etc/mosdns/rule/.ad_source
        rm -rf "$AD_TMPDIR"
    fi
)

geodat_update() (
    TMPDIR=$(mktemp -d) || exit 1
    google_status=$(curl -I -4 -m 3 -o /dev/null -s -w %{http_code} http://www.google.com/generate_204)
    [ "$google_status" -ne "204" ] && mirror="https://ghproxy.com/"
    # geoip.dat - cn-private
    echo -e "\e[1;32mDownloading "$mirror"https://github.com/Loyalsoldier/geoip/releases/latest/download/geoip-only-cn-private.dat\e[0m"
    curl --connect-timeout 60 -m 900 --ipv4 -kfSLo "$TMPDIR/geoip.dat" ""$mirror"https://github.com/Loyalsoldier/geoip/releases/latest/download/geoip-only-cn-private.dat"
    [ $? -ne 0 ] && rm -rf "$TMPDIR" && exit 1
    # checksum - geoip.dat
    echo -e "\e[1;32mDownloading "$mirror"https://github.com/Loyalsoldier/geoip/releases/latest/download/geoip-only-cn-private.dat.sha256sum\e[0m"
    curl --connect-timeout 60 -m 900 --ipv4 -kfSLo "$TMPDIR/geoip.dat.sha256sum" ""$mirror"https://github.com/Loyalsoldier/geoip/releases/latest/download/geoip-only-cn-private.dat.sha256sum"
    [ $? -ne 0 ] && rm -rf "$TMPDIR" && exit 1
    if [ "$(sha256sum "$TMPDIR/geoip.dat" | awk '{print $1}')" != "$(cat "$TMPDIR/geoip.dat.sha256sum" | awk '{print $1}')" ]; then
        echo -e "\e[1;31mgeoip.dat checksum error\e[0m"
        rm -rf "$TMPDIR"
        exit 1
    fi

    # geosite.dat
    echo -e "\e[1;32mDownloading "$mirror"https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat\e[0m"
    curl --connect-timeout 60 -m 900 --ipv4 -kfSLo "$TMPDIR/geosite.dat" ""$mirror"https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat"
    [ $? -ne 0 ] && rm -rf "$TMPDIR" && exit 1
    # checksum - geosite.dat
    echo -e "\e[1;32mDownloading "$mirror"https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat.sha256sum\e[0m"
    curl --connect-timeout 60 -m 900 --ipv4 -kfSLo "$TMPDIR/geosite.dat.sha256sum" ""$mirror"https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat.sha256sum"
    [ $? -ne 0 ] && rm -rf "$TMPDIR" && exit 1
    if [ "$(sha256sum "$TMPDIR/geosite.dat" | awk '{print $1}')" != "$(cat "$TMPDIR/geosite.dat.sha256sum" | awk '{print $1}')" ]; then
        echo -e "\e[1;31mgeosite.dat checksum error\e[0m"
        rm -rf "$TMPDIR"
        exit 1
    fi
    rm -rf "$TMPDIR"/*.sha256sum
    cp -f "$TMPDIR"/* /usr/share/v2ray
    rm -rf "$TMPDIR"
)

restart_service() {
    /etc/init.d/mosdns restart
}

ecs_remote() {
    ipaddr=$(curl -s --user-agent "curl/8.2.1" --connect-timeout 3 -H "Host:v4.ident.me" 49.12.234.183) || ipaddr=110.34.181.1
    echo "ecs ${ipaddr%.*}.0/24"
}

flush_cache() {
    curl -s 127.0.0.1:$(uci -q get mosdns.config.listen_port_api)/plugins/lazy_cache/flush || exit 1
}

v2dat_dump() {
    # env
    v2dat_dir=/usr/share/v2ray
    adblock=$(uci -q get mosdns.config.adblock)
    ad_source=$(uci -q get mosdns.config.ad_source)
    configfile=$(uci -q get mosdns.config.configfile)
    mkdir -p /var/mosdns
    rm -f /var/mosdns/geo*.txt
    if [ "$configfile" = "/etc/mosdns/config.yaml" ]; then
        # default config
        v2dat unpack geoip -o /var/mosdns -f cn $v2dat_dir/geoip.dat
        v2dat unpack geosite -o /var/mosdns -f cn -f 'geolocation-!cn' $v2dat_dir/geosite.dat
        [ "$adblock" -eq 1 ] && [ "$ad_source" = "geosite.dat" ] && v2dat unpack geosite -o /var/mosdns -f category-ads-all $v2dat_dir/geosite.dat
    else
        # custom config
        v2dat unpack geoip -o /var/mosdns -f cn $v2dat_dir/geoip.dat
        v2dat unpack geosite -o /var/mosdns -f cn -f 'geolocation-!cn' $v2dat_dir/geosite.dat
        geoip_tags=$(uci -q get mosdns.config.geoip_tags)
        geosite_tags=$(uci -q get mosdns.config.geosite_tags)
        [ -n "$geoip_tags" ] && v2dat unpack geoip -o /var/mosdns $(echo $geoip_tags | sed -r 's/\S+/-f &/g') $v2dat_dir/geoip.dat
        [ -n "$geosite_tags" ] && v2dat unpack geosite -o /var/mosdns $(echo $geosite_tags | sed -r 's/\S+/-f &/g') $v2dat_dir/geosite.dat
    fi
}

case $script_action in
    "dns")
        interface_dns
    ;;
    "ad")
        ad_block
    ;;
    "geodata")
        geodat_update && adlist_update && restart_service
    ;;
    "logfile")
        logfile_path
    ;;
    "adlist_update")
        adlist_update && restart_service
    ;;
    "ecs_remote")
        ecs_remote
    ;;
    "flush")
        flush_cache
    ;;
    "v2dat_dump")
        v2dat_dump
    ;;
    "version")
        mosdns version
    ;;
    *)
        exit 0
    ;;
esac
