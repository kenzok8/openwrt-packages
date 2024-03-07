#!/bin/sh
# SPDX-License-Identifier: GPL-2.0-only
#
# Copyright (C) 2023 ImmortalWrt.org

SCRIPTS_DIR="/etc/homeproxy/scripts"

for i in "china_ip4" "china_ip6" "gfw_list" "china_list"; do
	"$SCRIPTS_DIR"/update_resources.sh "$i"
done

"$SCRIPTS_DIR"/update_subscriptions.uc
