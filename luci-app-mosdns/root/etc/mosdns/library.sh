#!/bin/bash -e
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

WORKDIR="/usr/share/v2ray"
TEMPDIR="/tmp/mosdnsupdatelist"

DOWNLOAD_LINK_GEOIP="https://github.com/Loyalsoldier/geoip/releases/latest/download/geoip-only-cn-private.dat"
DOWNLOAD_LINK_GEOSITE="https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat"

getdat() {
	download_geoip() {
		if ! curl -s -L -H 'Cache-Control: no-cache' -o "${TEMPDIR}/geoip.dat.new" "$DOWNLOAD_LINK_GEOIP"; then
			echo 'error: Download failed! Please check your network or try again.'
			EXIT 1
		fi
		if ! curl -s -L -H 'Cache-Control: no-cache' -o "${TEMPDIR}/geoip.dat.sha256sum.new" "$DOWNLOAD_LINK_GEOIP.sha256sum"; then
			echo 'error: Download failed! Please check your network or try again.'
			EXIT 2
		fi
		SUM="$(sha256sum ${TEMPDIR}/geoip.dat.new | sed 's/ .*//')"
		CHECKSUM="$(sed 's/ .*//' ${TEMPDIR}/geoip.dat.sha256sum.new)"
		if [[ "$SUM" != "$CHECKSUM" ]]; then
			echo 'error: Check failed! Please check your network or try again.'
			EXIT 3
		fi
	}
	download_geosite() {
		if ! curl -s -L -H 'Cache-Control: no-cache' -o "${TEMPDIR}/geosite.dat.new" "$DOWNLOAD_LINK_GEOSITE"; then
			echo 'error: Download failed! Please check your network or try again.'
			EXIT 4
		fi
		if ! curl -s -L -H 'Cache-Control: no-cache' -o "${TEMPDIR}/geosite.dat.sha256sum.new" "$DOWNLOAD_LINK_GEOSITE.sha256sum"; then
			echo 'error: Download failed! Please check your network or try again.'
			EXIT 5
		fi
		SUM="$(sha256sum ${TEMPDIR}/geosite.dat.new | sed 's/ .*//')"
		CHECKSUM="$(sed 's/ .*//' ${TEMPDIR}/geosite.dat.sha256sum.new)"
		if [[ "$SUM" != "$CHECKSUM" ]]; then
			echo 'error: Check failed! Please check your network or try again.'
			EXIT 6
		fi
	}
}

rename_new() {
	for DAT in 'geoip' 'geosite'; do
		mv "${TEMPDIR}/$DAT.dat.new" "${WORKDIR}/$DAT.dat"
		# rm "${TEMPDIR}/$DAT.dat.new"
		rm "${TEMPDIR}/$DAT.dat.sha256sum.new"
	done
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
	elif [ "$1" == "vssr" ]; then
		uci get vssr.@global[0].global_server &>/dev/null
	fi
}
