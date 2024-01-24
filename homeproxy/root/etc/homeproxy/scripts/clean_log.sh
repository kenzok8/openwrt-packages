#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-only
#
# Copyright (C) 2022-2023 ImmortalWrt.org

NAME="homeproxy"

log_max_size="10" #KB
main_log_file="/var/run/$NAME/$NAME.log"
singc_log_file="/var/run/$NAME/sing-box-c.log"
sings_log_file="/var/run/$NAME/sing-box-s.log"

while true; do
	sleep 180
	for i in "$main_log_file" "$singc_log_file" "$sings_log_file"; do
		[ -s "$i" ] || continue
		[ "$(( $(ls -l "$i" | awk -F ' ' '{print $5}') / 1024 >= log_max_size))" -eq "0" ] || echo "" > "$i"
	done
done
