#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2019-2022 Tianling Shen <cnsztl@immortalwrt.org>

NAME="unblockneteasemusic"
LOCK="/tmp/$NAME.update_core.lock"

check_core_if_already_running() {
	if [ -e "$LOCK" ]; then
		echo -e "\nA task is already running." >> "/tmp/$NAME.log"
		exit 2
	else
		touch "$LOCK"
	fi
}

clean_log(){
	echo "" > "/tmp/$NAME.log"
}

check_core_latest_version() {
	core_latest_ver="$(uclient-fetch -qO- 'https://api.github.com/repos/UnblockNeteaseMusic/server/commits?sha=enhanced&path=precompiled' | jsonfilter -e '@[0].sha')"
	[ -n "${core_latest_ver}" ] || { echo -e "\nFailed to check latest core version, please try again later." >> "/tmp/$NAME.log"; rm -f "$LOCK"; exit 1; }
	if [ ! -e "/usr/share/$NAME/core_local_ver" ]; then
		clean_log
		echo -e "Local version: NOT FOUND, latest version: ${core_latest_ver}." >> "/tmp/$NAME.log"
		update_core
	else
		if [ "$(cat /usr/share/$NAME/core_local_ver)" != "${core_latest_ver}" ]; then
			clean_log
			echo -e "Local version: $(cat /usr/share/$NAME/core_local_ver 2>"/dev/null"), latest version: ${core_latest_ver}." >> "/tmp/$NAME.log"
			update_core
		else
			echo -e "\nLocal version: $(cat /usr/share/$NAME/core_local_ver 2>"/dev/null"), latest version: ${core_latest_ver}." >> "/tmp/$NAME.log"
			echo -e "You're already using the latest version." >> "/tmp/$NAME.log"
			rm -f "$LOCK"
			exit 3
		fi
	fi
}

update_core() {
	echo -e "Updating core..." >> "/tmp/$NAME.log"

	mkdir -p "/usr/share/$NAME/core"
	rm -rf "/usr/share/$NAME/core"/*

	for file in $(uclient-fetch -qO- "https://api.github.com/repos/UnblockNeteaseMusic/server/contents/precompiled" | jsonfilter -e '@[*].path')
	do
		uclient-fetch "https://fastly.jsdelivr.net/gh/UnblockNeteaseMusic/server@$core_latest_ver/$file" -qO "/usr/share/$NAME/core/${file##*/}"
		[ -s "/usr/share/$NAME/core/${url##*/}" ] || {
			echo -e "Failed to download ${url##*/}." >> "/tmp/$NAME.log"
			rm -f "$LOCK"
			exit 1
		}
	done

	for cert in "ca.crt" "server.crt" "server.key"
	do
		uclient-fetch "https://fastly.jsdelivr.net/gh/UnblockNeteaseMusic/server@enhanced/${cert}" -qO "/usr/share/$NAME/core/${cert}"
		[ -s "/usr/share/$NAME/core/${cert}" ] || {
			echo -e "Failed to download ${cert}." >> "/tmp/$NAME.log"
			rm -f "$LOCK"
			exit 1
		}
	done

	[ -z "${update_core_from_luci}" ] || touch "/usr/share/$NAME/update_core_successfully"
	echo -e "${core_latest_ver}" > "/usr/share/$NAME/core_local_ver"
	[ -n "${non_restart}" ] || /etc/init.d/"$NAME" restart

	echo -e "Succeeded in updating core." > "/tmp/$NAME.log"
	echo -e "Current core version: ${core_latest_ver}.\n" >> "/tmp/$NAME.log"
	rm -f "$LOCK"
}

case "$1" in
	"update_core")
		check_core_if_already_running
		check_core_latest_version
		;;
	"update_core_non_restart")
		non_restart=1
		check_core_if_already_running
		check_core_latest_version
		;;
	"update_core_from_luci")
		update_core_from_luci=1
		check_core_if_already_running
		check_core_latest_version
		;;
	*)
		echo -e "Usage: $0/update.sh update_core"
		;;
esac
