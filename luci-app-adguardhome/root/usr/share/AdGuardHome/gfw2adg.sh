#!/bin/sh

PATH="/usr/sbin:/usr/bin:/sbin:/bin"

checkmd5(){
	local nowmd5
	nowmd5="$(md5sum /tmp/adguard.list 2>/dev/null)"
	nowmd5="${nowmd5%% *}"
	local lastmd5
	lastmd5="$(uci get AdGuardHome.AdGuardHome.gfwlistmd5 2>/dev/null)"
	if [ "$nowmd5" != "$lastmd5" ]; then
		uci set AdGuardHome.AdGuardHome.gfwlistmd5="$nowmd5"
		uci commit AdGuardHome
		[ "$1" != "noreload" ] && /etc/init.d/AdGuardHome reload >/dev/null 2>&1
	fi
}

configpath
configpath="$(uci get AdGuardHome.AdGuardHome.configpath 2>/dev/null)"
if [ -z "$configpath" ]; then
	configpath="/etc/AdGuardHome.yaml"
fi

if [ "$1" = "del" ]; then
	sed -i '/programaddstart/,/programaddend/d' "$configpath"
	checkmd5 "$2"
	exit 0
fi

local gfwupstream
gfwupstream="$(uci get AdGuardHome.AdGuardHome.gfwupstream 2>/dev/null)"
if [ -z "$gfwupstream" ]; then
	gfwupstream="tcp://208.67.220.220:5353"
fi

if [ ! -f "$configpath" ]; then
	echo "Error: config file not found, please create config first"
	exit 1
fi

echo "Downloading gfwlist..."
GFWLIST_URL="https://gitlab.com/gfwlist/gfwlist/raw/master/gfwlist.txt"
if curl -sL -k --retry 2 --connect-timeout 20 -o /tmp/gfwlist.txt "$GFWLIST_URL" 2>/dev/null; then
	:
elif wget-ssl --no-check-certificate -t 2 -T 20 -O /tmp/gfwlist.txt "$GFWLIST_URL" 2>/dev/null; then
	:
else
	echo "Error: failed to download gfwlist"
	exit 1
fi

if [ ! -s /tmp/gfwlist.txt ]; then
	echo "Error: gfwlist download is empty"
	rm -f /tmp/gfwlist.txt
	exit 1
fi

base64 -d < /tmp/gfwlist.txt > /tmp/gfwlist_decoded.txt 2>/dev/null
if [ $? -ne 0 ] || [ ! -s /tmp/gfwlist_decoded.txt ]; then
	echo "Error: failed to decode gfwlist"
	rm -f /tmp/gfwlist.txt
	exit 1
fi

awk -v upst="$gfwupstream" '
BEGIN {
	getline
}
{
	s1 = substr($0, 1, 1)
	if (s1 == "!") next
	white = 0
	if (s1 == "@") {
		$0 = substr($0, 3)
		s1 = substr($0, 1, 1)
		white = 1
	}

	if (s1 == "|") {
		s2 = substr($0, 2, 1)
		if (s2 == "|") {
			$0 = substr($0, 3)
			n = split($0, d, "/")
			$0 = d[1]
		} else {
			n = split($0, d, "/")
			$0 = d[3]
		}
	} else {
		n = split($0, d, "/")
		$0 = d[1]
	}

	star = index($0, "*")
	if (star != 0) {
		$0 = substr($0, star + 1)
		dot = index($0, ".")
		if (dot != 0)
			$0 = substr($0, dot + 1)
		else
			next
		s1 = substr($0, 1, 1)
	}

	if (s1 == ".")
		fin = substr($0, 2)
	else
		fin = $0

	if (index(fin, ".") == 0) next
	if (index(fin, "%") != 0) next
	if (index(fin, ":") != 0) next

	if (match(fin, "^[0-9.]+$")) next
	if (fin == "" || fin == finl) next
	finl = fin

	if (white == 0)
		print "  - [/." fin "/]" upst
	else
		print "  - [/." fin "/]#"
}
END {
	print "  - [/programaddend/]#"
}' /tmp/gfwlist_decoded.txt > /tmp/adguard.list

rm -f /tmp/gfwlist.txt /tmp/gfwlist_decoded.txt

grep -q "programaddstart" "$configpath"
if [ $? -eq 0 ]; then
	sed -i '/programaddstart/,/programaddend/d' "$configpath"
	cat /tmp/adguard.list >> "$configpath"
else
	sed -i '1i\  - [/programaddstart/]#' /tmp/adguard.list
	sed -i '/^upstream_dns:/r /tmp/adguard.list' "$configpath"
fi

checkmd5 "$2"
rm -f /tmp/adguard.list
