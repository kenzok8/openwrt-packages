#!/bin/bash
# [CTCGFW]Project-OpenWrt
# Use it under GPLv3, please.
# --------------------------------------------------------
# Script for creating ACL file for each LuCI APP

error_font="\033[31m[Error]$\033[0m "
success_font="\033[32m[Success]\033[0m "
info_font="\033[36m[Info]\033[0m "

function echo_green_bg(){
	echo -e "\033[42;37m$1\033[0m"
}

function echo_yellow_bg(){
	echo -e "\033[43;37m$1\033[0m"
}

function echo_red_bg(){
	echo -e "\033[41;37m$1\033[0m"
}

function clean_outdated_files(){
	rm -f "create_acl_for_luci.err" "create_acl_for_luci.warn" "create_acl_for_luci.ok"
}

function check_if_acl_exist(){
	ls "$1"/root/usr/share/rpcd/acl.d/*.json >/dev/null 2>&1 && return 0 || return 1
}

function check_config_files(){
	[ "$(ls "$1"/root/etc/config/* 2>/dev/null | wc -l)" -ne "1" ] && return 0 || return 1
}

function get_config_name(){
	ls "$1"/root/etc/config/* 2>/dev/null | awk -F '/' '{print $NF}'
}

function create_acl_file(){
	mkdir -p "$1"
	echo -e "{
	\"$2\": {
		\"description\": \"Grant UCI access for $2\",
		\"read\": {
			\"uci\": [ \"$3\" ]
		},
		\"write\": {
			\"uci\": [ \"$3\" ]
		}
	}
}" > "$1/$2.json"
}

function auto_create_acl(){
	luci_app_list="$(find ./ -maxdepth 2 | grep -Eo ".*luci-app-[a-zA-Z0-9_-]+" | sort -s)"

	[ "$(echo -e "${luci_app_list}" | wc -l)" -gt "0" ] && for i in ${luci_app_list}
	do
		if check_if_acl_exist "$i"; then
			echo_yellow_bg "$i: has ACL file already, skipping..." | tee -a create_acl_for_luci.warn
		elif check_config_files "$i"; then
			echo_red_bg "$i: has no/multi config file(s), skipping..." | tee -a create_acl_for_luci.err
		else
			create_acl_file "$i/root/usr/share/rpcd/acl.d" "${i##*/}" "$(get_config_name "$i")"
			echo_green_bg "$i: ACL file has been generated." | tee -a create_acl_for_luci.ok
		fi
	done
}

while getopts "achml:n:p:" input_arg  
do
	case $input_arg in
	a)
		auto_create_acl
		exit
		;;
	m)
		manual_mode=1
		;;
	p)
		acl_path="$OPTARG"
		;;
	l)
		luci_name="$OPTARG"
		;;
	n)
		conf_name="$OPTARG"
		;;
	c)
		clean_outdated_files
		exit
		;;
	h|?|*)
		echo -e "${info_font}Usage: $0 [-a|-m (-p <path-to-acl>) -l <luci-name> -n <conf-name>|-c]"
		exit 2
		;;
	esac
done

if [ "*${manual_mode}*" == "*1*" ] && [ -n "${luci_name}" ] && [ -n "${conf_name}" ]; then
	acl_path="${acl_path:-root/usr/share/rpcd/acl.d}"
	if create_acl_file "${acl_path}" "${luci_name}" "${conf_name}"; then
		echo -e "${success_font}Output file: $(ls "${acl_path}/${luci_name}.json")"
		echo_green_bg "$(cat "${acl_path}/${luci_name}.json")"
		echo_green_bg "${luci_name}: ACL file has been generated." >> "create_acl_for_luci.ok"
		[ -e "create_acl_for_luci.err" ] && sed -i "/${luci_name}/d" "create_acl_for_luci.err"
	else
		echo -e "${error_font}Failed to create file ${acl_path}/${luci_name}.json"
		echo_red_bg "${luci_name}: Failed to create ACL file." >> "create_acl_for_luci.err"
	fi
else
	echo -e "${info_font}Usage: $0 [-a|-m -p <path-to-acl> -l <luci-name> -n <conf-name>|-c]"
	exit 2
fi
