#!/bin/bash

PATH="/usr/sbin:/usr/bin:/sbin:/bin"
update_mode=$1
binpath=$(uci get AdGuardHome.AdGuardHome.binpath)
if [[ -z ${binpath} ]]; then
	uci set AdGuardHome.AdGuardHome.binpath="/tmp/AdGuardHome/AdGuardHome"
	binpath="/tmp/AdGuardHome/AdGuardHome"
fi
[[ ! -d ${binpath%/*} ]] && mkdir -p ${binpath%/*}
upxflag=$(uci get AdGuardHome.AdGuardHome.upxflag 2>/dev/null)
[[ -z ${upxflag} ]] && upxflag=off
enabled=$(uci get AdGuardHome.AdGuardHome.enabled 2>/dev/null)
core_version=$(uci get AdGuardHome.AdGuardHome.core_version 2>/dev/null)
update_url=$(uci get AdGuardHome.AdGuardHome.update_url 2>/dev/null)

case "${core_version}" in
beta)
	core_api_url=https://api.github.com/repos/AdguardTeam/AdGuardHome/releases
;;
*)
	core_api_url=https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest
;;
esac

Check_Task(){
	running_tasks="$(ps -efww  | grep -v grep | grep "AdGuardHome" | grep "update_core" | awk '{print $1}' | wc -l)"
	case $1 in
	force)
		echo -e "执行: 强制更新核心"
		echo -e "清除 ${running_tasks} 个进程 ..."
		ps -efww  | grep -v grep | grep -v $$ | grep "AdGuardHome" | grep "update_core" | awk '{print $1}' | xargs kill -9 2> /dev/null
	;;
	*)
		[[ ${running_tasks} -gt 2 ]] && echo -e "已经有 ${running_tasks} 个任务正在运行, 请等待其执行结束或将其强行停止!" && EXIT 2
	;;
	esac
}

Check_Downloader(){
	which curl > /dev/null 2>&1 && PKG="curl" && return
	echo -e "\n未安装 curl"
	which wget-ssl > /dev/null 2>&1 && PKG="wget-ssl" && return
	echo "未安装 curl 和 wget, 无法检测更新!" && EXIT 1
}

Check_Updates(){
	Check_Downloader
	case "${PKG}" in
	curl)
		Downloader="curl -L -k -o"
		_Downloader="curl -s"
	;;
	wget-ssl)
		Downloader="wget-ssl --no-check-certificate -T 5 -O"
		_Downloader="wget-ssl -q -O -"
	;;
	esac
	echo "[${PKG}] 开始检查更新, 请耐心等待 ..."
	Cloud_Version="$(${_Downloader} ${core_api_url} 2>/dev/null | grep 'tag_name' | egrep -o "v[0-9].+[0-9.]" | awk 'NR==1')"
	[[ -z ${Cloud_Version} ]] && echo -e "\n检查更新失败, 请检查网络或稍后重试!" && EXIT 1
	if [[ -f ${binpath} ]]; then
		Current_Version="$(${binpath} --version 2>/dev/null | egrep -o "v[0-9].+[0-9]" | sed -r 's/(.*), c(.*)/\1/')"
	else
		Current_Version="未知"
	fi
	[[ -z ${Current_Version} ]] && Current_Version="未知"
	echo -e "\n执行文件路径: ${binpath%/*}\n\n正在检查更新, 请耐心等待 ..."
	echo -e "\n当前 AdGuardHome 版本: ${Current_Version}\n云端 AdGuardHome 版本: ${Cloud_Version}"
	if [[ ! "${Cloud_Version}" == "${Current_Version}" || "$1" == force ]]; then
		Update_Core
	else
		echo -e "\n已是最新版本, 无需更新!" 
		EXIT 0
	fi
	EXIT 0
}

UPX_Compress(){
	GET_Arch
	upx_name="upx-${upx_latest_ver}-${Arch_upx}_linux.tar.xz"
	echo -e "开始下载 ${upx_name} ...\n"
	$Downloader /tmp/upx-${upx_latest_ver}-${Arch_upx}_linux.tar.xz "https://github.com/upx/upx/releases/download/v${upx_latest_ver}/${upx_name}"
	if [[ ! -e /tmp/upx-${upx_latest_ver}-${Arch_upx}_linux.tar.xz ]]; then
		echo -e "\n${upx_name} 下载失败!\n" 
		EXIT 1
	else
		echo -e "\n${upx_name} 下载成功!\n" 
	fi
	which xz > /dev/null 2>&1 || (opkg list | grep ^xz || opkg update > /dev/null 2>&1 && opkg install xz --force-depends) || (echo "软件包 xz 安装失败!" && EXIT 1)
	mkdir -p /tmp/upx-${upx_latest_ver}-${Arch_upx}_linux
	echo -e "正在解压 ${upx_name} ...\n" 
	xz -d -c /tmp/upx-${upx_latest_ver}-${Arch_upx}_linux.tar.xz | tar -x -C "/tmp"
	[[ ! -f /tmp/upx-${upx_latest_ver}-${Arch_upx}_linux/upx ]] && echo -e "\n${upx_name} 解压失败!" && EXIT 1
}

Update_Core(){
	rm -r /tmp/AdGuardHome_Update > /dev/null 2>&1
	mkdir -p "/tmp/AdGuardHome_Update"
	GET_Arch
	eval link="${update_url}"
	echo -e "下载链接:${link}"
	echo -e "文件名称:${link##*/}"
	echo -e "\n开始下载 AdGuardHome 核心文件 ...\n" 
	$Downloader /tmp/AdGuardHome_Update/${link##*/} ${link}
	if [[ $? != 0 ]];then
		echo -e "\nAdGuardHome 核心下载失败 ..."
		rm -r /tmp/AdGuardHome_Update
		EXIT 1
	fi 
	if [[ ${link##*.} == gz ]]; then
		echo -e "\n正在解压 AdGuardHome ..."
		tar -zxf "/tmp/AdGuardHome_Update/${link##*/}" -C "/tmp/AdGuardHome_Update/"
		if [[ ! -e /tmp/AdGuardHome_Update/AdGuardHome ]]
		then
			echo "AdGuardHome 核心解压失败!" 
			rm -rf "/tmp/AdGuardHome_Update" > /dev/null 2>&1
			EXIT 1
		fi
		downloadbin="/tmp/AdGuardHome_Update/AdGuardHome/AdGuardHome"
	else
		downloadbin="/tmp/AdGuardHome_Update/${link##*/}"
	fi
	chmod +x ${downloadbin}
	echo -e "\nAdGuardHome 核心体积: $(awk 'BEGIN{printf "%.2fMB\n",'$((`ls -l $downloadbin | awk '{print $5}'`))'/1000000}')"
	if [[ ${upxflag} != off ]]; then
		UPX_Compress
		echo -e "使用 UPX 压缩可能会花很长时间, 期间请耐心等待!\n正在压缩 $downloadbin ..."
		/tmp/upx-${upx_latest_ver}-${Arch_upx}_linux/upx $upxflag $downloadbin > /dev/null 2>&1
		echo -e "\n压缩后的核心体积: $(awk 'BEGIN{printf "%.2fMB\n",'$((`ls -l $downloadbin | awk '{print $5}'`))'/1000000}')"
	else
		echo "未启用 UPX 压缩, 跳过操作..."
	fi
	/etc/init.d/AdGuardHome stop > /dev/null 2>&1
	echo -e "\n移动 AdGuardHome 核心文件到 ${binpath%/*} ..."
	mv -f ${downloadbin} ${binpath} > /dev/null 2>&1
	if [[ ! -s ${binpath} && $? != 0 ]]; then
		echo -e "AdGuardHome 核心移动失败!\n可能是设备空间不足导致, 请尝试开启 UPX 压缩, 或更改 [执行文件路径] 为 /tmp/AdGuardHome" 
		EXIT 1
	fi
	rm -f /tmp/upx*.tar.xz
	rm -rf /tmp/upx*	
	rm -rf /tmp/AdGuardHome_Update
	chmod +x ${binpath}
	if [[ ${enabled} == 1 ]]; then
		echo -e "\n正在重启 AdGuardHome 服务..."
		/etc/init.d/AdGuardHome restart
	fi
	echo -e "\nAdGuardHome 核心更新成功!" 
}

GET_Arch() {
	Archt="$(opkg info kernel | grep Architecture | awk -F "[ _]" '{print($2)}')"
	case "${Archt}" in
	i386)
		Arch=i386
	;;
	i686)
		Arch=i386
	;;
	x86)
		Arch=amd64
	;;
	mipsel)
		Arch=mipsle_softfloat
	;;
	mips)
		Arch=mips_softfloat
	;;
	mips64el)
		Arch=mips64le_softfloat
	;;
	mips64)
		Arch=mips64_softfloat
	;;
	arm)
		Arch=arm
	;;
	armeb)
		Arch=armeb
	;;
	aarch64)
		Arch=arm64
	;;
	*)
		echo -e "\nAdGuardHome 暂不支持当前的设备架构: [${Archt}]!" 
		EXIT 1
	esac
	case "${Archt}" in
	mipsel)
		Arch_upx="mipsel"
		upx_latest_ver="3.95"
	;;
	*)
		Arch_upx="${Arch}"
		upx_latest_ver="$(${_Downloader} https://api.github.com/repos/upx/upx/releases/latest 2>/dev/null | egrep 'tag_name' | egrep '[0-9.]+' -o 2>/dev/null)"
	
	esac
	echo -e "\n当前设备架构: ${Arch}\n"
}

EXIT(){
	rm -rf /var/run/update_core 2>/dev/null
	[[ $1 != 0 ]] && touch /var/run/update_core_error
	exit $1
}

main(){
	Check_Task ${update_mode}
	Check_Updates ${update_mode}
}

trap "EXIT 1" SIGTERM SIGINT
touch /var/run/update_core
rm - rf /var/run/update_core_error 2>/dev/null

main
