#!/bin/sh

PATH="/usr/sbin:/usr/bin:/sbin:/bin"

count=0
while :; do
	for host in www.baidu.com 223.5.5.5 www.google.com 8.8.8.8; do
		ping -c 1 -W 2 -q "$host" >/dev/null 2>&1
		if [ $? -eq 0 ]; then
			/etc/init.d/AdGuardHome force_reload
			exit 0
		fi
	done

	count=$((count + 1))
	if [ $count -gt 18 ]; then
		/etc/init.d/AdGuardHome force_reload
		exit 0
	fi
	sleep 5
done
