#!/bin/sh

checkmd5(){
	local nowmd5
	nowmd5="$(md5sum /etc/hosts 2>/dev/null)"
	nowmd5="${nowmd5%% *}"
	local lastmd5
	lastmd5="$(uci get AdGuardHome.AdGuardHome.hostsmd5 2>/dev/null)"
	if [ "$nowmd5" != "$lastmd5" ]; then
		uci set AdGuardHome.AdGuardHome.hostsmd5="$nowmd5"
		uci commit AdGuardHome
		[ "$1" != "noreload" ] && /etc/init.d/AdGuardHome reload >/dev/null 2>&1
	fi
}

if [ "$1" = "del" ]; then
	sed -i '/programaddstart/,/programaddend/d' /etc/hosts
	checkmd5 "$2"
	exit 0
fi

awk 'BEGIN {
	dhcp[""] = ""
}
{
	if (FILENAME == "/tmp/dhcp.leases" && (NF >= 4)) {
		dhcp[$2] = $4
	}
}
END {
	cmd = "ip -6 neighbor show 2>/dev/null | grep -v fe80"
	while ((cmd | getline line) > 0) {
		split(line, f)
		if (f[5] in dhcp && f[5] != "") {
			print f[1] " " dhcp[f[5]]
		}
	}
	close(cmd)
	print "#programaddend"
}' /tmp/dhcp.leases > /tmp/tmphost 2>/dev/null

grep -q "programaddstart" /etc/hosts 2>/dev/null
if [ $? -eq 0 ]; then
	sed -i '/programaddstart/,/programaddend/c\#programaddstart' /etc/hosts
	sed -i '/programaddstart/r /tmp/tmphost' /etc/hosts
else
	{
		echo "#programaddstart"
		cat /tmp/tmphost
	} >> /etc/hosts
fi

rm -f /tmp/tmphost
checkmd5 "$2"
