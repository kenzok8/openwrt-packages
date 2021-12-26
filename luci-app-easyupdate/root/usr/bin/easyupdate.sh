#!/bin/bash
# https://github.com/sundaqiang/openwrt-packages
# EasyUpdate for Openwrt

function checkEnv() {
	if !type sysupgrade >/dev/null 2>&1; then
		echo 'Your firmware does not contain sysupgrade and does not support automatic updates(您的固件未包含sysupgrade,暂不支持自动更新)'
		exit
	fi
}

function shellHelp() {
	checkEnv
	cat <<EOF
Openwrt-EasyUpdate Script by sundaqiang
Your firmware already includes Sysupgrade and supports automatic updates(您的固件已包含sysupgrade,支持自动更新)
参数:
    -c			    Get the cloud firmware version(获取云端固件版本)
    -d			    Download cloud Firmware(下载云端固件)
    -f filename		Flash firmware(刷写固件)
    -u			    One-click firmware update(一键更新固件)
EOF
}

function getCloudVer() {
	checkEnv
	github=$(uci get easyupdate.main.github)
	github=(${github//// })
	uclient-fetch -qO- "https://api.github.com/repos/${github[2]}/${github[3]}/releases/latest" | jsonfilter -e '@.tag_name'
}

function downCloudVer() {
	checkEnv
	echo 'Get github project address(读取github项目地址)'
	github=$(uci get easyupdate.main.github)
	echo "Github project address(github项目地址):$github"
	github=(${github//// })
	echo 'Check whether EFI firmware is available(判断是否EFI固件)'
	if [ -d "/sys/firmware/efi/" ]; then
		suffix="combined-efi.img.gz"
	else
		suffix="combined.img.gz"
	fi
	echo "Whether EFI firmware is available(是否EFI固件):$suffix"
	echo 'Get the cloud firmware link(获取云端固件链接)'
	url=$(uclient-fetch -qO- "https://api.github.com/repos/${github[2]}/${github[3]}/releases/latest" | jsonfilter -e '@.assets[*].browser_download_url' | sed -n "/$suffix/p")
	echo "Cloud firmware link(云端固件链接):$url"
	echo 'Get whether to use Chinese mirror(读取是否使用中国镜像)'
	proxy=$(uci get easyupdate.main.proxy)
	if [ $proxy -eq 1 ]; then
		proxy='https://ghproxy.com/'
		res='yes'
	else
		proxy=''
		res='no'
	fi
	echo "Whether to use Chinese mirror(是否使用中国镜像):$res"
	echo 'Start downloading firmware, log output in /tmp/easyupdate.log(开始下载固件，日志输出在/tmp/easyupdate.log)'
	fileName=(${url//// })
	uclient-fetch -O "/tmp/${fileName[7]}" "$proxy$url" >/tmp/easyupdate.log 2>&1 &
}

function flashFirmware() {
	checkEnv
	if [[ -z "$file" ]]; then
		echo 'Please specify the file name(请指定文件名)'
	else
		echo 'Get whether to save the configuration(读取是否保存配置)'
		keepconfig=$(uci get easyupdate.main.keepconfig)
		if [ $keepconfig -eq 1 ]; then
			keepconfig=''
			res='yes'
		else
			keepconfig='-n '
			res='no'
		fi
		echo "Whether to save the configuration(读取是否保存配置):$res"
		echo 'Start flash firmware, log output in /tmp/easyupdate.log(开始刷写固件，日志输出在/tmp/easyupdate.log)'
		sysupgrade $keepconfig"/tmp/$file" >/tmp/easyupdate.log 2>&1 &
	fi
}

function updateCloud() {
	checkEnv
}

if [[ -z "$1" ]]; then
	shellHelp
else
	case $1 in
	-c)
		getCloudVer
		;;
	-d)
		downCloudVer
		;;
	-f)
		file=$2
		flashFirmware
		;;
	-u)
		updateCloud
		;;
	*)
		shellHelp
		;;
	esac
fi