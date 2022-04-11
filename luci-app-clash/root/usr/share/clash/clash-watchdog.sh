#!/bin/sh 

CORETYPE=$(uci get clash.config.core 2>/dev/null)
CONFIG_YAML_PATH=$(uci get clash.config.use_config 2>/dev/null)
CONFIG_YAML="/etc/clash/config.yaml"
url=$(uci get clash.config.clash_url)
MODELTYPE=$(uci get clash.config.download_core)

if [ "$CORETYPE" -eq "1" ];then
	CORE_PATH="/etc/clash/clash"
elif [ "$CORETYPE" -eq "3" ];then
	CORE_PATH="/etc/clash/clashtun/clash"
elif [ "$CORETYPE" -eq "4" ];then
	CORE_PATH="/etc/clash/dtun/clash"
fi

dcore(){
	echo '' >/tmp/clash_update.txt 2>/dev/null

	if [ -f /usr/share/clash/core_down_complete ];then 
		rm -rf /usr/share/clash/core_down_complete 2>/dev/null
	fi

	if [ "$CORETYPE" -eq "4" ];then
		if [ -f /usr/share/clash/download_dtun_version ];then 
			rm -rf /usr/share/clash/download_dtun_version
		fi

		new_clashdtun_core_version=`wget -qO- "https://hub.fastgit.org/Dreamacro/clash/releases/tag/premium"| grep "/download/premium/"| head -n 1| awk -F " " '{print $2}'| awk -F "-" '{print $4}'| sed "s/.gz\"//g"`

		if [ ${new_clashdtun_core_version} ]; then
			echo ${new_clashdtun_core_version} > /usr/share/clash/download_dtun_version 2>&1 & >/dev/null
		elif [ ${new_clashdtun_core_version} =="" ]; then
			echo 0 > /usr/share/clash/download_dtun_version 2>&1 & >/dev/null
		fi

		sleep 5

		if [ -f /usr/share/clash/download_dtun_version ];then
			CLASHDTUNC=$(sed -n 1p /usr/share/clash/download_dtun_version 2>/dev/null) 
		fi
	fi

	if [ "$CORETYPE" -eq "3" ];then
		if [ -f /usr/share/clash/download_tun_version ];then 
			rm -rf /usr/share/clash/download_tun_version
		fi
	
		new_clashtun_core_version=`wget -qO- "https://hub.fastgit.org/comzyh/clash/tags"| grep "/comzyh/clash/releases/"| head -n 1| awk -F "/tag/" '{print $2}'| sed 's/\">//g'`

		if [ ${new_clashtun_core_version} ]; then
			echo ${new_clashtun_core_version} > /usr/share/clash/download_tun_version 2>&1 & >/dev/null
		elif [ ${new_clashtun_core_version} =="" ]; then
			echo 0 > /usr/share/clash/download_tun_version 2>&1 & >/dev/null
		fi

		sleep 5

		if [ -f /usr/share/clash/download_tun_version ];then
			CLASHTUN=$(sed -n 1p /usr/share/clash/download_tun_version 2>/dev/null) 
		fi
	fi

	if [ "$CORETYPE" -eq "1" ];then
		if [ -f /usr/share/clash/download_core_version ];then
			rm -rf /usr/share/clash/download_core_version
		fi

		new_clashr_core_version=`wget -qO- "https://hub.fastgit.org/Dreamacro/clash/tags"| grep "/Dreamacro/clash/releases/"| head -n 1| awk -F "/tag/" '{print $2}'| sed 's/\">//g'`

		if [ ${new_clashr_core_version} ]; then
			echo ${new_clashr_core_version} > /usr/share/clash/download_core_version 2>&1 & >/dev/null
		elif [ ${new_clashr_core_version} =="" ]; then
			echo 0 > /usr/share/clash/download_core_version 2>&1 & >/dev/null
		fi

		sleep 5

		if [ -f /usr/share/clash/download_core_version ];then
			CLASHVER=$(sed -n 1p /usr/share/clash/download_core_version 2>/dev/null) 
		fi
	fi

	if [ -f /tmp/clash.gz ];then
		rm -rf /tmp/clash.gz >/dev/null 2>&1
	fi

	if [ "$CORETYPE" -eq "1" ];then
		wget --no-check-certificate  https://hub.fastgit.org/Dreamacro/clash/releases/download/"$CLASHVER"/clash-"$MODELTYPE"-"$CLASHVER".gz -O 2>&1 >1 /tmp/clash.gz
	elif [ "$CORETYPE" -eq "3" ];then 
		wget --no-check-certificate  https://hub.fastgit.org/comzyh/clash/releases/download/"$CLASHTUN"/clash-"$MODELTYPE"-"$CLASHTUN".gz -O 2>&1 >1 /tmp/clash.gz
	elif [ "$CORETYPE" -eq "4" ];then 
		wget --no-check-certificate  https://hub.fastgit.org/Dreamacro/clash/releases/download/premium/clash-"$MODELTYPE"-"$CLASHDTUNC".gz -O 2>&1 >1 /tmp/clash.gz
	fi

	if [ "$?" -eq "0" ] && [ "$(ls -l /tmp/clash.gz |awk '{print int($5)}')" -ne "0" ]; then
	    gunzip /tmp/clash.gz >/dev/null 2>&1\
		&& rm -rf /tmp/clash.gz >/dev/null 2>&1\
		&& chmod 755 /tmp/clash\
		&& chown root:root /tmp/clash 
		  
		if [ "$CORETYPE" -eq "1" ];then
			rm -rf /etc/clash/clash >/dev/null 2>&1
			mv /tmp/clash /etc/clash/clash >/dev/null 2>&1
			rm -rf /usr/share/clash/core_version >/dev/null 2>&1
			mv /usr/share/clash/download_core_version /usr/share/clash/core_version >/dev/null 2>&1
		elif [ "$CORETYPE" -eq "3" ];then
			rm -rf /etc/clash/clashtun/clash >/dev/null 2>&1
			mv /tmp/clash /etc/clash/clashtun/clash >/dev/null 2>&1
			rm -rf /usr/share/clash/tun_version >/dev/null 2>&1
			mv /usr/share/clash/download_tun_version /usr/share/clash/tun_version >/dev/null 2>&1
			tun=$(sed -n 1p /usr/share/clash/tun_version 2>/dev/null)
			sed -i "s/${tun}/v${tun}/g" /usr/share/clash/tun_version 2>&1
		elif [ "$CORETYPE" -eq "4" ];then
			rm -rf /etc/clash/dtun/clash >/dev/null 2>&1
			mv /tmp/clash /etc/clash/dtun/clash >/dev/null 2>&1
			rm -rf /usr/share/clash/dtun_version >/dev/null 2>&1
			mv /usr/share/clash/download_dtun_version /usr/share/clash/dtun_version >/dev/null 2>&1
			dtun=$(sed -n 1p /usr/share/clash/dtun_version 2>/dev/null)
			sed -i "s/${dtun}/v${dtun}/g" /usr/share/clash/dtun_version 2>&1leep 2
		fi
		touch /usr/share/clash/core_down_complete >/dev/null 2>&1
		sleep 2
		rm -rf /var/run/core_update >/dev/null 2>&1
		echo "" > /tmp/clash_update.txt >/dev/null 2>&1
	fi	
}

revert_dns() {
	dns_port=$(grep "^ \{0,\}listen:" $CONFIG_YAML |awk -F ':' '{print $3}' 2>/dev/null) 
	uci del_list dhcp.@dnsmasq[0].server=127.0.0.1#$dns_port >/dev/null 2>&1
	uci set dhcp.@dnsmasq[0].noresolv=0
	uci delete dhcp.@dnsmasq[0].cachesize
	rm -rf $CUSLIST $CUSLITT  $CUSLISTV $CUSLITTV 2>/dev/null
	uci commit dhcp
	/etc/init.d/dnsmasq restart >/dev/null 2>&1	 
}

remove_mark(){
	rm -rf /var/etc/clash.include 2>/dev/null

	core=$(uci get clash.config.core 2>/dev/null)
	ipv6=$(uci get clash.config.enable_ipv6 2>/dev/null)
	dns_port=$(grep "^ \{0,\}listen:" $CONFIG_YAML |awk -F ':' '{print $3}' 2>/dev/null)
	PROXY_FWMARK="0x162" 2>/dev/null
	PROXY_ROUTE_TABLE="0x162" 2>/dev/null

   	ip rule del fwmark "$PROXY_FWMARK" table "$PROXY_ROUTE_TABLE" >/dev/null 2>&1
   	ip route del local 0.0.0.0/0  dev lo table "$PROXY_ROUTE_TABLE" >/dev/null 2>&1

	TUN_DEVICE=$(egrep '^ {0,}device-url:' /etc/clash/config.yaml |grep device-url: |awk -F '//' '{print $2}')
	if [ -z $TUN_DEVICE ];then
		TUN_DEVICE_NAME="clash0"
	else
	TUN_DEVICE_NAME=$TUN_DEVICE
	fi
	if [ "${core}" -eq 3 ];then
		ip link set dev $TUN_DEVICE_NAME down 2>/dev/null
		ip tuntap del $TUN_DEVICE_NAME mode tun 2>/dev/null
		ip route del default dev $TUN_DEVICE_NAME table "$PROXY_ROUTE_TABLE" 2>/dev/null
	fi
	ip route del default dev utun table "$PROXY_ROUTE_TABLE" >/dev/null 2>&1
	ip rule del fwmark "$PROXY_FWMARK" table "$PROXY_ROUTE_TABLE" >/dev/null 2>&1

	mangle=$(iptables -nvL OUTPUT -t mangle | sed 1,2d | sed -n '/clash/=' | sort -r)
	for mangles in $mangle; do
		iptables -t mangle -D OUTPUT $mangles 2>/dev/null
	done
	
	pre=$(iptables -nvL PREROUTING -t mangle | sed 1,2d | sed -n '/! match-set localnetwork dst MARK set 0x162/=' | sort -r)
	for prer in $pre; do
		iptables -t mangle -D PREROUTING $prer 2>/dev/null
	done

	pre1=$(iptables -nvL PREROUTING -t mangle | sed 1,2d | sed -n '/! match-set china dst MARK set 0x162/=' | sort -r)
	for prer in $pre1; do
		iptables -t mangle -D PREROUTING $prer 2>/dev/null
	done
		
	pre_lines=$(iptables -nvL PREROUTING -t nat |sed 1,2d |sed -n '/8\.8\./=' 2>/dev/null |sort -rn)
	for pre_line in $pre_lines; do
	  iptables -t nat -D PREROUTING "$pre_line" >/dev/null 2>&1
	done

	iptables -t nat -D PREROUTING -p tcp --dport 53 -j ACCEPT >/dev/null 2>&1
	iptables -t nat -D PREROUTING -p udp --dport 53 -j DNAT --to "127.0.0.1:$dns_port"

	if [ "${ipv6}" == "true" ]; then
		ip6tables -t mangle -D PREROUTING -j MARK --set-mark "$PROXY_FWMARK" 2>/dev/null
	fi

	iptables -t mangle -F clash 2>/dev/null
	iptables -t mangle -X clash 2>/dev/null
    iptables -t nat -F clash_output >/dev/null 2>&1
    iptables -t nat -X clash_output >/dev/null 2>&1

	ipset -! flush proxy_lan >/dev/null 2>&1
	ipset -! flush reject_lan >/dev/null 2>&1
	ipset destroy reject_lan >/dev/null 2>&1
	ipset destroy proxy_lan >/dev/null 2>&1
	ipset -! flush china >/dev/null 2>&1
	ipset destroy china >/dev/null 2>&1
		
	proxy_lan=$(iptables -nvL PREROUTING -t mangle | sed 1,2d | sed -n '/! match-set proxy_lan src/=' | sort -r)
	for natx in $proxy_lan; do
		iptables -t mangle -D PREROUTING $natx >/dev/null 2>&1
	done

	reject_lan=$(iptables -nvL PREROUTING -t mangle | sed 1,2d | sed -n '/match-set reject_lan src/=' | sort -r)
	for natx in $reject_lan; do
		iptables -t mangle -D PREROUTING $natx >/dev/null 2>&1
	done		

	proxy_lann=$(iptables -nvL clash -t nat | sed 1,2d | sed -n '/! match-set proxy_lan src/=' | sort -r)
	for natx in $proxy_lann; do
		iptables -t nat -D PREROUTING $natx >/dev/null 2>&1
	done

	reject_lann=$(iptables -nvL clash -t nat | sed 1,2d | sed -n '/match-set reject_lan src/=' | sort -r)
	for natx in $reject_lann; do
		iptables -t nat -D PREROUTING $natx >/dev/null 2>&1
	done

	proxy_lannn=$(iptables -nvL clash -t nat | sed 1,2d | sed -n '/! match-set proxy_lan src/=' | sort -r)
	for natx in $proxy_lannn; do
		iptables -t mangle -D PREROUTING $natx >/dev/null 2>&1
	done

	reject_lannn=$(iptables -nvL clash -t nat | sed 1,2d | sed -n '/match-set reject_lan src/=' | sort -r)
	for natx in $reject_lannn; do
		iptables -t mangle -D PREROUTING $natx >/dev/null 2>&1
	done

    iptables -t nat -D OUTPUT -p tcp -j clash_output >/dev/null 2>&1
	china_lan2=$(iptables -nvL PREROUTING -t nat | sed 1,2d | sed -n '/match-set china/=' | sort -r)
	for natx in $china_lan2; do
		iptables -t mangle -D PREROUTING $natx >/dev/null 2>&1
	done

	china_lan3$(iptables -nvL PREROUTING -t mangle | sed 1,2d | sed -n '/match-set china/=' | sort -r)
	for natx in $china_lan3; do
		iptables -t mangle -D PREROUTING $natx >/dev/null 2>&1
	done

	ipset destroy localnetwork 2>/dev/null

	nat_indexs=$(iptables -nvL PREROUTING -t nat | sed 1,2d | sed -n '/clash/=' | sort -r)
	for nat_index in $nat_indexs; do
		iptables -t nat -D PREROUTING $nat_index >/dev/null 2>&1
		iptables -t nat -F clash >/dev/null 2>&1
		iptables -t nat -X clash >/dev/null 2>&1
		iptables -t mangle -F clash >/dev/null 2>&1
		iptables -t mangle -D PREROUTING -p udp -j clash >/dev/null 2>&1 
		iptables -t mangle -X clash >/dev/null 2>&1
	done

	nat=$(iptables -nvL PREROUTING -t nat | sed 1,2d | sed -n '/tcp dpt:53/=' | sort -r)
	for natx in $nat; do
		iptables -t nat -D PREROUTING $natx >/dev/null 2>&1
	done

	ip6tables -t mangle -F clash >/dev/null 2>&1
	ip6tables -t mangle -D PREROUTING -p udp -j clash >/dev/null 2>&1
	ip6tables -t mangle -X clash >/dev/null 2>&1

	out_linese=$(iptables -nvL OUTPUT -t mangle |sed 1,2d |sed -n '/198.18.0.1\/16/=' 2>/dev/null |sort -rn)
	for out_linee in $out_linese; do
		iptables -t mangle -D OUTPUT "$out_linee" >/dev/null 2>&1
	done

	out_linesee=$(iptables -nvL OUTPUT -t mangle |sed 1,2d |sed -n '/198.18.0.0\/16/=' 2>/dev/null |sort -rn)
	for out_linees in $out_linesee; do
		iptables -t mangle -D OUTPUT "$out_linees" >/dev/null 2>&1
	done		

	nat_indexs=$(iptables -nvL PREROUTING -t nat | sed 1,2d | sed -n '/clash/=' | sort -r)
	for nat_index in $nat_indexs; do
		iptables -t nat -D PREROUTING $nat_index >/dev/null 2>&1
	done

	fake=$(iptables -nvL OUTPUT -t nat |sed 1,2d |sed -n '/198.18.0.0\/16/=' |sort -r)
	for fake in $fake; do
		iptables -t nat -D OUTPUT $fake >/dev/null 2>&1
	done

	fake2=$(iptables -nvL OUTPUT -t nat |sed 1,2d |sed -n '/198.18.0.1\/16/=' |sort -r)
	for fake2 in $fake2; do
		iptables -t nat -D OUTPUT $fake2 >/dev/null 2>&1
	done	

	iptables -t nat -I PREROUTING -p tcp --dport 53 -j ACCEPT

	revert_dns >/dev/null 2>&1
}

if [ ! $(pidof clash) ]; then
	remove_mark
	sleep 5
	wget --no-check-certificate --user-agent="Clash/OpenWRT" ${url} -O 2>&1 >1 ${CONFIG_YAML_PATH}
	if [ ! -f ${CORE_PATH} ];then
		dcore
	fi
	/etc/init.d/clash restart 2>/dev/null
fi
