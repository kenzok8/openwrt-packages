#!/bin/bash /etc/rc.common
. /lib/functions.sh

name=$(uci get clash.config.config_name_remove 2>/dev/null)
check_match_name=$(grep -F "$name" "/etc/clash/clashbackup/confit_list.conf") 
line_no=$(grep -n "$check_match_name" /etc/clash/clashbackup/confit_list.conf |awk -F ':' '{print $1}')
if [ ! -z $check_match_name ];then
sed -i "${line_no}d" /etc/clash/clashbackup/confit_list.conf
rm -rf /etc/clash/config/sub/${name}
sed -i '/^$/d' /etc/clash/clashbackup/confit_list.conf
rm -rf /etc/clash/config/sub/${name}	
fi	 

