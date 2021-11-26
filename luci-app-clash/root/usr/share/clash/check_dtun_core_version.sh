#!/bin/sh

new_clashdtun_core_version=`wget -qO- "https://hub.fastgit.org/Dreamacro/clash/releases/tag/premium"| grep "/download/premium/"| head -n1| awk -F " " '{print $2}'| awk -F "-" '{print $4}'| sed "s/.gz\"//g"`
sleep 2
if [ "$?" -eq "0" ]; then
rm -rf /usr/share/clash/new_clashdtun_core_version
if [ $new_clashdtun_core_version ]; then
echo $new_clashdtun_core_version > /usr/share/clash/new_clashdtun_core_version 2>&1 & >/dev/null
elif [ $new_clashdtun_core_version =="" ]; then
echo 0 > /usr/share/clash/new_clashdtun_core_version 2>&1 & >/dev/null
fi
fi