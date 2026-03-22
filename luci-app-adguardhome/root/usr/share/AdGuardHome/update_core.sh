#!/bin/sh

PATH="/usr/sbin:/usr/bin:/sbin:/bin"

binpath="$(uci get AdGuardHome.AdGuardHome.binpath 2>/dev/null)"
if [ -z "$binpath" ]; then
	uci set AdGuardHome.AdGuardHome.binpath="/tmp/AdGuardHome/AdGuardHome"
	binpath="/tmp/AdGuardHome/AdGuardHome"
fi

mkdir -p "${binpath%/*}"

upxflag="$(uci get AdGuardHome.AdGuardHome.upxflag 2>/dev/null)"

cleanup() {
	rm -f /var/run/update_core 2>/dev/null
	[ "$1" != "0" ] && touch /var/run/update_core_error
	exit "$1"
}

check_already_running(){
	local running_tasks
	running_tasks="$(ps | grep -E "AdGuardHome|update_core" | grep -v grep | wc -l)"
	[ "${running_tasks}" -gt "2" ] && echo "A task is already running." && cleanup 2
}

check_wgetcurl(){
	if which curl >/dev/null 2>&1; then
		downloader="curl -L -k --retry 2 --connect-timeout 20 -o"
		return 0
	fi
	if which wget-ssl >/dev/null 2>&1; then
		downloader="wget-ssl --no-check-certificate -t 2 -T 20 -O"
		return 0
	fi

	if [ -z "$1" ]; then
		opkg update >/dev/null 2>&1 || { echo "Error: opkg failed"; cleanup 1; }
	fi

	if [ -z "$1" ]; then
		opkg remove wget wget-nossl --force-depends >/dev/null 2>&1
		opkg install wget >/dev/null 2>&1 && check_wgetcurl 1 && return 0
	fi

	if [ "$1" = "1" ]; then
		opkg install curl >/dev/null 2>&1 && check_wgetcurl 2 && return 0
	fi

	if [ "$1" = "2" ]; then
		check_wgetcurl && return 0
	fi

	echo "Error: neither curl nor wget available"
	cleanup 1
}

detect_arch(){
	local Archt
	Archt="$(opkg info kernel 2>/dev/null | grep Architecture | awk '{print $2}')"

	case "$Archt" in
	i386|i686)
		Arch="386"
		;;
	x86)
		Arch="amd64"
		;;
	mipsel)
		Arch="mipsle"
		;;
	mips64el)
		Arch="mips64le"
		;;
	mips)
		Arch="mips"
		;;
	mips64)
		Arch="mips64"
		;;
	arm)
		Arch="arm"
		;;
	armeb)
		Arch="armeb"
		;;
	aarch64)
		Arch="arm64"
		;;
	*)
		echo "Error: unsupported architecture: $Archt"
		cleanup 1
		;;
	esac
}

check_latest_version(){
	check_wgetcurl
	echo "Checking latest version..."

	local api_result
	api_result="$($downloader - "https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest" 2>/dev/null)"
	latest_ver="$(echo "$api_result" | grep -oE '"tag_name": *"v[^"]+"' | head -1 | sed 's/.*"v\(.*\)".*/v\1/')"

	if [ -z "${latest_ver}" ]; then
		echo "Failed to check latest version, please try again later."
		cleanup 1
	fi

	if [ -x "$binpath" ]; then
		now_ver="$($binpath -c /dev/null --check-config 2>&1 | grep -oE 'v[0-9.]+' | head -1)"
	else
		now_ver=""
	fi

	echo "Local version: ${now_ver:-none}, cloud version: ${latest_ver}"

	if [ "${latest_ver}" != "${now_ver}" ] || [ "$1" = "force" ]; then
		update_core
	else
		echo "You're already using the latest version."
		apply_upx
		cleanup 0
	fi
}

apply_upx(){
	[ -z "$upxflag" ] && return

	local filesize
	filesize="$(ls -l "$binpath" 2>/dev/null | awk '{print $5}')"
	[ "$filesize" -le 8000000 ] && return

	echo "Binary size > 8MB, applying upx compression..."
	fetch_upx

	local UPX_BIN="/tmp/upx-${upx_latest_ver}-${Arch}_linux/upx"
	[ ! -x "$UPX_BIN" ] && { echo "upx binary not found"; return; }

	mkdir -p "/tmp/AdGuardHomeupdate"
	rm -rf "/tmp/AdGuardHomeupdate/${binpath##*/}" 2>/dev/null

	$UPX_BIN $upxflag "$binpath" -o "/tmp/AdGuardHomeupdate/${binpath##*/}"
	local upxret=$?
	rm -rf "/tmp/upx-${upx_latest_ver}-${Arch}_linux"

	if [ $upxret -eq 0 ]; then
		/etc/init.d/AdGuardHome stop nobackup 2>/dev/null
		rm -f "$binpath"
		mv -f "/tmp/AdGuardHomeupdate/${binpath##*/}" "$binpath"
		chmod 755 "$binpath"
		/etc/init.d/AdGuardHome start 2>/dev/null
		echo "upx compression finished"
	fi
}

fetch_upx(){
	local Archt_upx
	Archt_upx="$(opkg info kernel 2>/dev/null | grep Architecture | awk '{print $2}')"

	case "$Archt_upx" in
	i386|i686)  Arch="i386";;
	x86)        Arch="amd64";;
	mipsel)     Arch="mipsel";;
	mips64el)   Arch="mipsel";;
	mips)       Arch="mips";;
	mips64)     Arch="mips";;
	arm)        Arch="arm";;
	aarch64)    Arch="arm64";;
	*)
		echo "upx: unsupported arch $Archt_upx"
		return 1
		;;
	esac

	upx_latest_ver="$($downloader - "https://api.github.com/repos/upx/upx/releases/latest" 2>/dev/null | grep -oE '"tag_name": *"[^"]+"' | head -1 | sed 's/.*"\(.*\)"/\1/')"

	if [ -z "$upx_latest_ver" ]; then
		echo "Failed to get upx version"
		return 1
	fi

	local UPX_URL="https://github.com/upx/upx/releases/download/${upx_latest_ver}/upx-${upx_latest_ver}-${Arch}_linux.tar.xz"
	$downloader "/tmp/upx-${upx_latest_ver}-${Arch}_linux.tar.xz" "$UPX_URL" 2>&1
	[ $? -ne 0 ] && { echo "Failed to download upx"; return 1; }

	which xz >/dev/null 2>&1 || opkg install xz >/dev/null 2>&1 || { echo "xz not available"; return 1; }

	mkdir -p "/tmp/upx-${upx_latest_ver}-${Arch}_linux"
	xz -d -c "/tmp/upx-${upx_latest_ver}-${Arch}_linux.tar.xz" | tar -x -C "/tmp" >/dev/null 2>&1

	[ ! -x "/tmp/upx-${upx_latest_ver}-${Arch}_linux/upx" ] && { echo "upx extraction failed"; return 1; }
	rm -f "/tmp/upx-${upx_latest_ver}-${Arch}_linux.tar.xz"
}

update_core(){
	echo "Updating AdGuardHome core..."
	mkdir -p "/tmp/AdGuardHomeupdate"
	rm -rf "/tmp/AdGuardHomeupdate/*" 2>/dev/null

	detect_arch
	echo "Architecture: $Arch"

	echo "Fetching download links..."
	mkdir -p /tmp/run
	grep -v "^#" /usr/share/AdGuardHome/links.txt > /tmp/run/AdHlinks.txt

	local downloadbin=""
	local success=""

	while read link; do
		[ -z "$link" ] && continue
		eval link="$link"
		echo "Trying: $link"
		$downloader "/tmp/AdGuardHomeupdate/${link##*/}" "$link" 2>&1
		if [ $? -eq 0 ] && [ -s "/tmp/AdGuardHomeupdate/${link##*/}" ]; then
			downloadbin="/tmp/AdGuardHomeupdate/${link##*/}"
			success="1"
			echo "Download successful"
			break
		else
			echo "Download failed, trying next..."
			rm -f "/tmp/AdGuardHomeupdate/${link##*/}"
		fi
	done < /tmp/run/AdHlinks.txt

	rm -f /tmp/run/AdHlinks.txt

	if [ -z "$success" ]; then
		echo "Error: all download sources failed"
		cleanup 1
	fi

	if [ "${downloadbin##*.}" = "gz" ]; then
		tar -zxf "$downloadbin" -C "/tmp/AdGuardHomeupdate/" 2>/dev/null
		if [ -d "/tmp/AdGuardHomeupdate/AdGuardHome" ]; then
			downloadbin="/tmp/AdGuardHomeupdate/AdGuardHome/AdGuardHome"
		else
			echo "Error: failed to extract archive"
			cleanup 1
		fi
	fi

	chmod 755 "$downloadbin"
	echo "Download complete, applying upx if configured..."
	apply_upx

	echo "Stopping service..."
	/etc/init.d/AdGuardHome stop nobackup 2>/dev/null

	echo "Installing new binary..."
	rm -f "$binpath" 2>/dev/null
	mv -f "$downloadbin" "$binpath" 2>/dev/null
	[ $? -ne 0 ] && { echo "mv failed - disk space issue?"; cleanup 1; }
	chmod 755 "$binpath"

	rm -rf "/tmp/AdGuardHomeupdate" 2>/dev/null

	echo "Starting service..."
	/etc/init.d/AdGuardHome start 2>/dev/null

	echo "Succeeded in updating AdGuardHome to ${latest_ver}."
	cleanup 0
}

trap "cleanup 1" SIGTERM SIGINT
touch /var/run/update_core
rm -f /var/run/update_core_error 2>/dev/null

check_already_running
check_latest_version "$1"
