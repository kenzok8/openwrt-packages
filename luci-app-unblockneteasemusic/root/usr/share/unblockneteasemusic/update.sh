#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2019-2023 Tianling Shen <cnsztl@immortalwrt.org>

NAME="unblockneteasemusic"
UNM_DIR="/usr/share/$NAME"
RUN_DIR="/var/run/$NAME"
mkdir -p "$RUN_DIR"

LOCK="$RUN_DIR/update_core.lock"
LOG="$RUN_DIR/run.log"

check_core_if_already_running() {
	if [ -e "$LOCK" ]; then
		echo -e "\nA task is already running." >> "$LOG"
		exit 2
	else
		touch "$LOCK"
	fi
}

clean_log(){
	echo "" > "$LOG"
}

check_core_latest_version() {
	core_latest_ver="$(wget -qO- 'https://api.github.com/repos/UnblockNeteaseMusic/server/commits?sha=enhanced&path=precompiled' | jsonfilter -e '@[0].sha')"
	[ -n "$core_latest_ver" ] || { echo -e "\nFailed to check latest core version, please try again later." >> "$LOG"; rm -f "$LOCK"; exit 1; }
	if [ ! -e "$UNM_DIR/core_local_ver" ]; then
		clean_log
		echo -e "Local version: NOT FOUND, latest version: $core_latest_ver." >> "$LOG"
		update_core
	else
		if [ "$(cat $UNM_DIR/core_local_ver)" != "$core_latest_ver" ]; then
			clean_log
			echo -e "Local version: $(cat $UNM_DIR/core_local_ver 2>"/dev/null"), latest version: $core_latest_ver." >> "$LOG"
			update_core
		else
			echo -e "\nLocal version: $(cat $UNM_DIR/core_local_ver 2>"/dev/null"), latest version: $core_latest_ver." >> "$LOG"
			echo -e "You're already using the latest version." >> "$LOG"
			rm -f "$LOCK"
			exit 3
		fi
	fi
}

update_core() {
	echo -e "Updating core..." >> "$LOG"

	mkdir -p "$UNM_DIR/core"
	rm -rf "$UNM_DIR/core"/*

	for file in $(wget -qO- "https://api.github.com/repos/UnblockNeteaseMusic/server/contents/precompiled" | jsonfilter -e '@[*].path')
	do
		wget "https://fastly.jsdelivr.net/gh/UnblockNeteaseMusic/server@$core_latest_ver/$file" -qO "$UNM_DIR/core/${file##*/}"
		[ -s "$UNM_DIR/core/${file##*/}" ] || {
			echo -e "Failed to download ${file##*/}." >> "$LOG"
			rm -f "$LOCK"
			exit 1
		}
	done

	for cert in "ca.crt" "server.crt" "server.key"
	do
		wget "https://fastly.jsdelivr.net/gh/UnblockNeteaseMusic/server@$core_latest_ver/$cert" -qO "$UNM_DIR/core/$cert"
		[ -s "$UNM_DIR/core/${cert}" ] || {
			echo -e "Failed to download ${cert}." >> "$LOG"
			rm -f "$LOCK"
			exit 1
		}
	done

	[ -z "$update_core_from_luci" ] || touch "$UNM_DIR/update_core_successfully"
	echo -e "$core_latest_ver" > "$UNM_DIR/core_local_ver"
	[ -n "$non_restart" ] || /etc/init.d/"$NAME" restart

	echo -e "Succeeded in updating core." > "$LOG"
	echo -e "Current core version: $core_latest_ver.\n" >> "$LOG"
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
	"remove_core")
		"/etc/init.d/$NAME" stop
		rm -rf "$UNM_DIR/core" "$UNM_DIR/core_local_ver" "$LOCK"
		;;
	*)
		echo -e "Usage: $0 update_core | remove_core"
		;;
esac
