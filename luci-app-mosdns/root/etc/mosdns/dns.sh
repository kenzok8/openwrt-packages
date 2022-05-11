#!/bin/bash
# shellcheck source=/etc/mosdns/library.sh
source /etc/mosdns/library.sh

if [ "$(ifconfig | grep -c wan)" = 0 ]; then
	bakdns "$1"
	exit 0
fi

if [[ "$(getdns 0)" =~ ^127\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	getdns "$1" inactive
elif [[ "$(getdns "$1")" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
	getdns "$1"
else
	bakdns "$1"
fi
