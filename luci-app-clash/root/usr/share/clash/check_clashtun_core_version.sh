#!/bin/sh

new_clashtun_core_version=`wget -qO- "https://hub.fastgit.org/comzyh/clash/tags"| grep "/comzyh/clash/releases/"| head -n 1| awk -F "/tag/" '{print $2}'| sed 's/\">//g'`
if [ "$?" -eq "0" ]; then
rm -rf /usr/share/clash/new_clashtun_core_version
if [ $new_clashtun_core_version ]; then
echo $new_clashtun_core_version > /usr/share/clash/new_clashtun_core_version 2>&1 & >/dev/null
elif [ $new_clashtun_core_version =="" ]; then
echo 0 > /usr/share/clash/new_clashtun_core_version 2>&1 & >/dev/null
fi
fi

 
