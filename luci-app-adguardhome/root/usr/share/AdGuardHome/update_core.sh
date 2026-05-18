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
	# 先检查锁，再 touch（顺序关键：touch 在函数调用之后执行）
	if [ -f /var/run/update_core ]; then
		echo "已有任务在运行，退出"
		exit 2
	fi
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
		opkg update >/dev/null 2>&1 || { echo "错误：opkg 更新失败"; cleanup 1; }
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

	echo "错误：缺少 curl 和 wget"
	cleanup 1
}

get_arch(){
	# 尝试多种方式获取架构：opkg → apk → uname -m
	local a
	a="$(opkg info kernel 2>/dev/null | grep Architecture | awk '{print $2}')"
	[ -z "$a" ] && a="$(apk info --architecture 2>/dev/null)"
	[ -z "$a" ] && a="$(uname -m)"
	echo "$a"
}

detect_arch(){
	local Archt
	Archt="$(get_arch)"

	case "$Archt" in
	i386|i686|i386|x86)
		Arch="386"
		;;
	x86_64|x86-64|amd64)
		Arch="amd64"
		;;
	mipsel|mipsle)
		Arch="mipsle"
		;;
	mips64el|mips64le)
		Arch="mips64le"
		;;
	mips)
		Arch="mips"
		;;
	mips64)
		Arch="mips64"
		;;
	arm|armv7*|armv8*)
		Arch="arm"
		;;
	armeb)
		Arch="armeb"
		;;
	aarch64|arm64)
		Arch="arm64"
		;;
	*)
		echo "错误：不支持的架构：$Archt"
		cleanup 1
		;;
	esac
}

check_latest_version(){
	check_wgetcurl
	echo "正在检查最新版本..."

	local api_result
	api_result="$($downloader - "https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest" 2>/dev/null)"
	latest_ver="$(echo "$api_result" | grep -oE '"tag_name": *"v[^"]+"' | head -1 | sed 's/.*"v\(.*\)".*/v\1/')"

	if [ -z "${latest_ver}" ]; then
		echo "检查最新版本失败，请稍后重试"
		cleanup 1
	fi

	if [ -x "$binpath" ]; then
		now_ver="$($binpath -c /dev/null --check-config 2>&1 | grep -oE 'v[0-9.]+' | head -1)"
	else
		now_ver=""
	fi

	echo "本地版本：${now_ver:-无}，云端版本：${latest_ver}"

	if [ "$1" = "force" ]; then
		update_core
	elif [ -z "$now_ver" ]; then
		update_core
	elif [ "$(echo "$latest_ver" | sed 's/[^0-9.]//g')" != "$(echo "$now_ver" | sed 's/[^0-9.]//g')" ]; then
		# 只有云端版本号严格大于本地时才更新
		local newer
		newer="$(printf '%s\n%s' "$latest_ver" "$now_ver" | sed 's/^v//' | sort -Vr | head -1 | sed 's/^/v/')"
		if [ "$newer" = "$latest_ver" ] && [ "$latest_ver" != "$now_ver" ]; then
			update_core
		else
			echo "已是最新版本（本地版本更高或相同）"
			cleanup 0
		fi
	else
		echo "已是最新版本"
		cleanup 0
	fi
}

apply_upx(){
	[ -z "$upxflag" ] && return

	local target="${1:-$binpath}"
	[ ! -f "$target" ] && return

	local filesize
	filesize="$(ls -l "$target" 2>/dev/null | awk '{print $5}')"
	[ -z "$filesize" ] && return
	[ "$filesize" -le 8000000 ] && return

	echo "二进制文件大于 8MB，正在使用 upx 压缩..."
	fetch_upx

	local UPX_DIR="/tmp/upx-${upx_ver_nov}-${Arch}_linux"
	local UPX_BIN="${UPX_DIR}/upx"
	[ ! -x "$UPX_BIN" ] && { echo "upx 可执行文件未找到"; return; }

	local upx_out="/tmp/AdGuardHomeupdate/upx-packed-$$"
	$UPX_BIN $upxflag "$target" -o "$upx_out"
	local upxret=$?
	rm -rf "$UPX_DIR"

	if [ $upxret -eq 0 ]; then
		rm -f "$target"
		mv -f "$upx_out" "$target"
		chmod 755 "$target"
		echo "upx 压缩完成"
	else
		rm -f "$upx_out"
	fi
}

fetch_upx(){
	local Archt_upx
	Archt_upx="$(get_arch)"

	case "$Archt_upx" in
	i386|i686|x86|i386)  Arch="i386";;
	x86_64|x86-64|amd64) Arch="amd64";;
	mipsel|mipsle)       Arch="mipsel";;
	mips64el|mips64le)   Arch="mipsel";;
	mips)                 Arch="mips";;
	mips64)               Arch="mips";;
	arm|armv7*|armv8*)   Arch="arm";;
	aarch64|arm64)        Arch="arm64";;
	*)
		echo "upx：不支持的架构 $Archt_upx"
		return 1
		;;
	esac

	upx_latest_ver="$($downloader - "https://api.github.com/repos/upx/upx/releases/latest" 2>/dev/null | grep -oE '"tag_name": *"[^"]+"' | head -1 | sed 's/.*"\(.*\)"/\1/')"

	if [ -z "$upx_latest_ver" ]; then
		echo "获取 upx 版本失败"
		return 1
	fi

	upx_ver_nov="$(echo "$upx_latest_ver" | sed 's/^v//')"
	local UPX_TGZ="/tmp/upx-${upx_ver_nov}-${Arch}_linux.tar.xz"
	local UPX_URL="https://github.com/upx/upx/releases/download/${upx_latest_ver}/upx-${upx_ver_nov}-${Arch}_linux.tar.xz"
	$downloader "$UPX_TGZ" "$UPX_URL" 2>&1
	[ $? -ne 0 ] && { echo "upx 下载失败"; return 1; }

	which xz >/dev/null 2>&1 || { opkg install xz >/dev/null 2>&1 || apk add xz >/dev/null 2>&1; } || { echo "xz 不可用"; return 1; }

	xz -d -c "$UPX_TGZ" | tar -x -C "/tmp" >/dev/null 2>&1

	[ ! -x "/tmp/upx-${upx_ver_nov}-${Arch}_linux/upx" ] && { echo "upx 解压失败"; return 1; }
	rm -f "$UPX_TGZ"
}

update_core(){
	echo "正在更新 AdGuardHome 核心..."
	mkdir -p "/tmp/AdGuardHomeupdate"
	rm -rf "/tmp/AdGuardHomeupdate/*" 2>/dev/null

	detect_arch
	echo "架构：$Arch"

	echo "正在获取下载链接..."
	mkdir -p /tmp/run
	grep -v "^#" /usr/share/AdGuardHome/links.txt > /tmp/run/AdHlinks.txt

	local downloadbin=""
	local success=""

	while read link; do
		[ -z "$link" ] && continue
		eval link="$link"
		echo "尝试下载：$link"
		$downloader "/tmp/AdGuardHomeupdate/${link##*/}" "$link" 2>&1
		if [ $? -eq 0 ] && [ -s "/tmp/AdGuardHomeupdate/${link##*/}" ]; then
			downloadbin="/tmp/AdGuardHomeupdate/${link##*/}"
			success="1"
			echo "下载成功"
			break
		else
			echo "下载失败，尝试下一个..."
			rm -f "/tmp/AdGuardHomeupdate/${link##*/}"
		fi
	done < /tmp/run/AdHlinks.txt

	rm -f /tmp/run/AdHlinks.txt

	if [ -z "$success" ]; then
		echo "错误：所有下载源均失败"
		cleanup 1
	fi

	if [ "${downloadbin##*.}" = "gz" ]; then
		tar -zxf "$downloadbin" -C "/tmp/AdGuardHomeupdate/" 2>/dev/null
		if [ -d "/tmp/AdGuardHomeupdate/AdGuardHome" ]; then
			downloadbin="/tmp/AdGuardHomeupdate/AdGuardHome/AdGuardHome"
		else
			echo "错误：解压失败"
			cleanup 1
		fi
	fi

	chmod 755 "$downloadbin"
	echo "下载完成，如已配置 upx 则进行压缩..."
	apply_upx "$downloadbin"

	echo "正在停止服务..."
	/etc/init.d/AdGuardHome stop nobackup 2>/dev/null

	echo "正在安装新二进制文件..."
	rm -f "$binpath" 2>/dev/null
	mv -f "$downloadbin" "$binpath" 2>/dev/null
	[ $? -ne 0 ] && { echo "mv 失败 - 磁盘空间不足？"; cleanup 1; }
	chmod 755 "$binpath"

	rm -rf "/tmp/AdGuardHomeupdate" 2>/dev/null

	echo "正在启动服务..."
	/etc/init.d/AdGuardHome start 2>/dev/null

	echo "AdGuardHome 已成功更新至 ${latest_ver}"
	cleanup 0
}

trap "cleanup 1" SIGTERM SIGINT

check_already_running
touch /var/run/update_core
rm -f /var/run/update_core_error 2>/dev/null

check_latest_version "$1"
