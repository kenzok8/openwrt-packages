#!/bin/sh

	cputype=$(uname -ms | tr ' ' '_' | tr '[A-Z]' '[a-z]')
	[ -n "$(echo $cputype | grep -E "linux.*armv.*")" ] && cpucore="armv5"
	[ -n "$(echo $cputype | grep -E "linux.*armv7.*")" ] && [ -n "$(cat /proc/cpuinfo | grep vfp)" ] && [ ! -d /jffs/clash ] && cpucore="armv7"
	[ -n "$(echo $cputype | grep -E "linux.*aarch64.*|linux.*armv8.*")" ] && cpucore="arm64"
	[ -n "$(echo $cputype | grep -E "linux.*86.*")" ] && cpucore="i386"
	[ -n "$(echo $cputype | grep -E "linux.*86_64.*")" ] && cpucore="x86_64"
	if [ -n "$(echo $cputype | grep -E "linux.*mips.*")" ];then
		mipstype=$(echo -n I | hexdump -o 2>/dev/null | awk '{ print substr($2,6,1); exit}') #通过判断大小端判断mips或mipsle
		[ "$mipstype" = "0" ] && cpucore="mips_softfloat" || cpucore="mipsle_softfloat"
	fi

echo $cpucore
