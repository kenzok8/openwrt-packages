#!/bin/bash
# https://github.com/sundaqiang/openwrt-packages
# EasyUpdate for Openwrt

function checkEnv() {
	if !type sysupgrade >/dev/null 2>&1; then
		writeLog 'Your firmware does not contain sysupgrade and does not support automatic updates(您的固件未包含sysupgrade,暂不支持自动更新)'
		exit
	fi
}

function writeLog() {
	now_time='['$(date +"%Y-%m-%d %H:%M:%S")']'
	echo ${now_time} $1 | tee -a '/tmp/easyupdatemain.log'
}

function shellHelp() {
	checkEnv
	cat <<EOF
Openwrt-EasyUpdate Script by sundaqiang
Your firmware already includes Sysupgrade and supports automatic updates(您的固件已包含sysupgrade,支持自动更新)
参数:
    -c                     Get the cloud firmware version(获取云端固件版本)
    -d                     Download cloud Firmware(下载云端固件)
    -f filename                Flash firmware(刷写固件)
    -u                     One-click firmware update(一键更新固件)
EOF
}

function getCloudVer() {
	checkEnv
	github=$(uci get easyupdate.main.github)
	github=(${github//// })
	curl "https://api.github.com/repos/${github[2]}/${github[3]}/releases/latest" | jsonfilter -e '@.tag_name' | sed -e 's/OpenWrt_//'
}

function downCloudVer() {
	checkEnv
	writeLog 'Get github project address(读取github项目地址)'
	github=$(uci get easyupdate.main.github)
	writeLog "Github project address(github项目地址):$github"
	github=(${github//// })
	writeLog 'Check whether EFI firmware is available(判断是否EFI固件)'
	if [ -d "/sys/firmware/efi/" ]; then
		suffix="combined-efi.img.gz"
	else
		suffix="combined.img.gz"
	fi
	writeLog "Whether EFI firmware is available(是否EFI固件):$suffix"
	writeLog 'Get the cloud firmware link(获取云端固件链接)'
	url=$(curl "https://api.github.com/repos/${github[2]}/${github[3]}/releases/latest" | jsonfilter -e '@.assets[*].browser_download_url' | sed -n "/$suffix/p")
	writeLog "Cloud firmware link(云端固件链接):$url"
	writeLog 'Get whether to use Chinese mirror(读取是否使用中国镜像)'
	proxy=$(uci get easyupdate.main.proxy)
	if [ $proxy -eq 1 ]; then
		proxy='https://ghproxy.com/'
		res='yes'
	else
		proxy=''
		res='no'
	fi
	writeLog "Whether to use Chinese mirror(是否使用中国镜像):$res"
	fileName=(${url//// })
	curl -o "/tmp/${fileName[7]}-sha256" "$proxy${url/${fileName[7]}/sha256sums}"
	curl -o "/tmp/${fileName[7]}" "$proxy$url" >/tmp/easyupdate.log 2>&1 &
	writeLog 'Start downloading firmware, log output in /tmp/easyupdate.log(开始下载固件，日志输出在/tmp/easyupdate.log)'
}

function flashFirmware() {
	checkEnv
	if [[ -z "$file" ]]; then
		writeLog 'Please specify the file name(请指定文件名)'
	else
		writeLog 'Get whether to save the configuration(读取是否保存配置)'
		keepconfig=$(uci get easyupdate.main.keepconfig)
		if [ $keepconfig -eq 1 ]; then
			keepconfig=' '
			res='yes'
		else
			keepconfig='-n '
			res='no'
		fi
		writeLog "Whether to save the configuration(读取是否保存配置):$res"
		writeLog 'Start flash firmware, log output in /tmp/easyupdate.log(开始刷写固件，日志输出在/tmp/easyupdate.log)'
		sysupgrade $keepconfig$file >/tmp/easyupdate.log 2>&1 &
	fi
}

function checkSha() {
	if [[ -z "$file" ]]; then
		for filename in $(ls /tmp)
		do
			if [[ "${filename#*.}" = "img.gz" && "${filename:0:7}" = "openwrt" ]]; then
				file=$filename
			fi
		done
	fi
	cd /tmp && sha256sum -c <(grep $file $file-sha256)
}

function updateCloud() {
	checkEnv
	writeLog 'Get the local firmware version(获取本地固件版本)'
	lFirVer=$(cat /etc/openwrt_release | sed -n "s/DISTRIB_VERSIONS='\(.*\)'/\1/p")
	writeLog "Local firmware version(本地固件版本):$lFirVer"
	writeLog 'Get the cloud firmware version(获取云端固件版本)'
	cFirVer=$(getCloudVer)
	writeLog "Cloud firmware version(云端固件版本):$cFirVer"
	lFirVer=$(date -d "${lFirVer:0:4}-${lFirVer:4:2}-${lFirVer:6:2} ${lFirVer:9:2}:${lFirVer:11:2}:${lFirVer:13:2}" +%s)
	cFirVer=$(date -d "${cFirVer:0:4}-${cFirVer:4:2}-${cFirVer:6:2} ${cFirVer:9:2}:${cFirVer:11:2}:${cFirVer:13:2}" +%s)
	if [ $cFirVer -gt $lFirVer ]; then
		writeLog 'Need to be updated(需要更新)'
		checkShaRet=$(checkSha)
		if [[ $checkShaRet =~ 'OK' ]]; then
			writeLog 'Check completes(检查完成)'
			file=${checkShaRet:0:-4}
			flashFirmware
		else
			downCloudVer
			i=0
			while [ $i -le 100 ]; do
				log=$(cat /tmp/easyupdate.log)
				str='transfer closed'
				if [[ $log =~ $str ]]; then
					writeLog 'Download error(下载出错)'
					i=101
					break
				else
					str='Could not resolve host'
					if [[ $log =~ $str ]]; then
						writeLog 'Download error(下载出错)'
						i=101
						break
					else
						str='100\s.+M\s+100.+--:--:--'
						if [[ $log =~ $str ]]; then
							writeLog 'Download completes(下载完成)'
							i=100
							break
						else
							echo $log | sed -n '$p'
							if [[ $i -eq 99 ]]; then
								writeLog 'Download the timeout(下载超时)'
								break
							fi
						fi
					fi
				fi
				let i++
				sleep 3
			done
			if [[ $i -eq 100 ]]; then
				writeLog 'Prepare flash firmware(准备刷写固件)'
				checkShaRet=$(checkSha)
				if [[ $checkShaRet =~ 'OK' ]]; then
					writeLog 'Check completes(检查完成)'
					file=${checkShaRet:0:-4}
					flashFirmware
				else
					writeLog 'Check error(检查出错)'
				fi
			fi
		fi
	else
		writeLog "Is the latest(已是最新)"
	fi
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
	-k)
		file=$2
		checkSha
		;;
	-u)
		updateCloud
		;;
	*)
		shellHelp
		;;
	esac
fi