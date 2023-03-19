#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2019-2023 Tianling Shen <cnsztl@immortalwrt.org>

NAME="unblockneteasemusic"

log_max_size="10" #使用KB计算
log_file="/var/run/$NAME/run.log"

while true; do
	[ -s "$log_file" ] || continue
	[ "$(( $(ls -l "$log_file" | awk -F ' ' '{print $5}') / 1024 >= log_max_size))" -eq "0" ] || echo "" > "$log_file"
	sleep 300
done
