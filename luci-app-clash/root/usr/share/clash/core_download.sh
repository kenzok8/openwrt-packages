#!/bin/sh
LOGTIME=$(date "+%Y-%m-%d %H:%M:%S")
LOG_FILE="/tmp/clash_update.txt"
MODELTYPE=$(uci get clash.config.download_core 2>/dev/null)
CORETYPE=$(uci get clash.config.dcore 2>/dev/null)
CORE=$(uci get clash.config.core 2>/dev/null)
lang=$(uci get luci.main.lang 2>/dev/null)
if [ -f /tmp/clash.gz ];then
rm -rf /tmp/clash.gz >/dev/null 2>&1
fi
 echo '' >/tmp/clash_update.txt 2>/dev/null
 
if [ -f /usr/share/clash/core_down_complete ];then 
  rm -rf /usr/share/clash/core_down_complete 2>/dev/null
fi



if [ $CORETYPE -eq 4 ];then
if [ -f /usr/share/clash/download_dtun_version ];then 
rm -rf /usr/share/clash/download_dtun_version
fi
	if [ $lang == "zh_cn" ];then
         echo "  ${LOGTIME} - 正在检查最新版本。。" >$LOG_FILE
	elif [ $lang == "en" ] || [ $lang == "auto" ];then
         echo "  ${LOGTIME} - Checking latest version.." >$LOG_FILE
        fi
new_clashdtun_core_version=`wget -qO- "https://hub.fastgit.org/Dreamacro/clash/releases/tag/premium"| grep "/download/premium/"| head -n 1| awk -F " " '{print $2}'| awk -F "-" '{print $4}'| sed "s/.gz\"//g"`

if [ $new_clashdtun_core_version ]; then
echo $new_clashdtun_core_version > /usr/share/clash/download_dtun_version 2>&1 & >/dev/null
elif [ $new_clashdtun_core_version =="" ]; then
echo 0 > /usr/share/clash/download_dtun_version 2>&1 & >/dev/null
fi
sleep 5
if [ -f /usr/share/clash/download_dtun_version ];then
CLASHDTUNC=$(sed -n 1p /usr/share/clash/download_dtun_version 2>/dev/null) 
fi
fi

if [ $CORETYPE -eq 3 ];then
if [ -f /usr/share/clash/download_tun_version ];then 
rm -rf /usr/share/clash/download_tun_version
fi
	if [ $lang == "zh_cn" ];then
         echo "  ${LOGTIME} - 正在检查最新版本。。" >$LOG_FILE
	elif [ $lang == "en" ] || [ $lang == "auto" ];then
         echo "  ${LOGTIME} - Checking latest version.." >$LOG_FILE
        fi
new_clashtun_core_version=`wget -qO- "https://hub.fastgit.org/comzyh/clash/tags"| grep "/comzyh/clash/releases/"| head -n 1| awk -F "/tag/" '{print $2}'| sed 's/\">//g'`

if [ $new_clashtun_core_version ]; then
echo $new_clashtun_core_version > /usr/share/clash/download_tun_version 2>&1 & >/dev/null
elif [ $new_clashtun_core_version =="" ]; then
echo 0 > /usr/share/clash/download_tun_version 2>&1 & >/dev/null
fi
sleep 5
if [ -f /usr/share/clash/download_tun_version ];then
CLASHTUN=$(sed -n 1p /usr/share/clash/download_tun_version 2>/dev/null) 
fi
fi

if [ $CORETYPE -eq 1 ];then
if [ -f /usr/share/clash/download_core_version ];then
rm -rf /usr/share/clash/download_core_version
fi
	if [ $lang == "zh_cn" ];then
         echo "  ${LOGTIME} - 正在检查最新版本。。" >$LOG_FILE
	elif [ $lang == "en" ] || [ $lang == "auto" ];then
         echo "  ${LOGTIME} - Checking latest version.." >$LOG_FILE
        fi
new_clashr_core_version=`wget -qO- "https://hub.fastgit.org/Dreamacro/clash/tags"| grep "/Dreamacro/clash/releases/"| head -n 1| awk -F "/tag/" '{print $2}'| sed 's/\">//g'`

if [ $new_clashr_core_version ]; then
echo $new_clashr_core_version > /usr/share/clash/download_core_version 2>&1 & >/dev/null
elif [ $new_clashr_core_version =="" ]; then
echo 0 > /usr/share/clash/download_core_version 2>&1 & >/dev/null
fi
sleep 5
if [ -f /usr/share/clash/download_core_version ];then
CLASHVER=$(sed -n 1p /usr/share/clash/download_core_version 2>/dev/null) 
fi
fi

sleep 2

update(){
		if [ -f /tmp/clash.gz ];then
		rm -rf /tmp/clash.gz >/dev/null 2>&1
		fi
		if [ $lang == "zh_cn" ];then
			 echo "  ${LOGTIME} - 开始下载 Clash 内核..." >$LOG_FILE
		elif [ $lang == "en" ] || [ $lang == "auto" ];then
			 echo "  ${LOGTIME} - Starting Clash Core download" >$LOG_FILE
		fi
	   if [ $CORETYPE -eq 1 ];then
		wget --no-check-certificate  https://hub.fastgit.org/Dreamacro/clash/releases/download/"$CLASHVER"/clash-"$MODELTYPE"-"$CLASHVER".gz -O 2>&1 >1 /tmp/clash.gz
	   elif [ $CORETYPE -eq 3 ];then 
		wget --no-check-certificate  https://hub.fastgit.org/comzyh/clash/releases/download/"$CLASHTUN"/clash-"$MODELTYPE"-"$CLASHTUN".gz -O 2>&1 >1 /tmp/clash.gz
	   elif [ $CORETYPE -eq 4 ];then 
		wget --no-check-certificate  https://hub.fastgit.org/Dreamacro/clash/releases/download/premium/clash-"$MODELTYPE"-"$CLASHDTUNC".gz -O 2>&1 >1 /tmp/clash.gz
	   fi
	   
	   if [ "$?" -eq "0" ] && [ "$(ls -l /tmp/clash.gz |awk '{print int($5)}')" -ne 0 ]; then
			if [ $lang == "zh_cn" ];then
			 echo "  ${LOGTIME} - 开始解压缩文件" >$LOG_FILE
			elif [ $lang == "en" ] || [ $lang == "auto" ];then 
			 echo "  ${LOGTIME} - Beginning to unzip file" >$LOG_FILE
			fi
		        gunzip /tmp/clash.gz >/dev/null 2>&1\
		        && rm -rf /tmp/clash.gz >/dev/null 2>&1\
		        && chmod 755 /tmp/clash\
		        && chown root:root /tmp/clash 
 
			if [ $lang == "zh_cn" ];then
			   echo "  ${LOGTIME} - 完成下载内核，正在更新..." >$LOG_FILE
			   elif [ $lang == "en" ] || [ $lang == "auto" ];then
			   echo "  ${LOGTIME} - Successfully downloaded core, updating now..." >$LOG_FILE
			fi
			  
		    if [ $CORETYPE -eq 1 ];then
			  rm -rf /etc/clash/clash >/dev/null 2>&1
			  mv /tmp/clash /etc/clash/clash >/dev/null 2>&1
			  rm -rf /usr/share/clash/core_version >/dev/null 2>&1
			  mv /usr/share/clash/download_core_version /usr/share/clash/core_version >/dev/null 2>&1

			 if [ $lang == "zh_cn" ];then
			  echo "  ${LOGTIME} - Clash内核更新成功！" >$LOG_FILE
			 elif [ $lang == "en" ] || [ $lang == "auto" ];then
			  echo "  ${LOGTIME} - Clash Core Update Successful" >$LOG_FILE
			 fi

			elif [ $CORETYPE -eq 3 ];then
			  rm -rf /etc/clash/clashtun/clash >/dev/null 2>&1
			  mv /tmp/clash /etc/clash/clashtun/clash >/dev/null 2>&1
			  rm -rf /usr/share/clash/tun_version >/dev/null 2>&1
			  mv /usr/share/clash/download_tun_version /usr/share/clash/tun_version >/dev/null 2>&1
			  tun=$(sed -n 1p /usr/share/clash/tun_version 2>/dev/null)
			  sed -i "s/${tun}/v${tun}/g" /usr/share/clash/tun_version 2>&1

			  
			 if [ $lang == "zh_cn" ];then
			  echo "  ${LOGTIME} - ClashTun内核更新成功！" >$LOG_FILE
			 elif [ $lang == "en" ] || [ $lang == "auto" ];then
			  echo "  ${LOGTIME} - ClashTun Core Update Successful" >>$LOG_FILE
			 fi		
			
			elif [ $CORETYPE -eq 4 ];then
			  rm -rf /etc/clash/dtun/clash >/dev/null 2>&1
			  mv /tmp/clash /etc/clash/dtun/clash >/dev/null 2>&1
			  rm -rf /usr/share/clash/dtun_version >/dev/null 2>&1
			  mv /usr/share/clash/download_dtun_version /usr/share/clash/dtun_version >/dev/null 2>&1
			  dtun=$(sed -n 1p /usr/share/clash/dtun_version 2>/dev/null)
			  sed -i "s/${dtun}/v${dtun}/g" /usr/share/clash/dtun_version 2>&1

			  
			 if [ $lang == "zh_cn" ];then
			  echo "  ${LOGTIME} - ClashDTun内核更新成功！" >$LOG_FILE
			 elif [ $lang == "en" ] || [ $lang == "auto" ];then
			  echo "  ${LOGTIME} - ClashDTun Core Update Successful" >>$LOG_FILE
			 fi		
			 
		    fi

		    sleep 2
		    touch /usr/share/clash/core_down_complete >/dev/null 2>&1
		    sleep 2
		    rm -rf /var/run/core_update >/dev/null 2>&1
		    echo "" > /tmp/clash_update.txt >/dev/null 2>&1
			
	    else
		  if [ $lang == "zh_cn" ];then
		  echo "  ${LOGTIME} - 核心程序下载失败，请检查网络或稍后再试！" >$LOG_FILE
		  elif [ $lang == "en" ] || [ $lang == "auto" ];then     
		  echo "  ${LOGTIME} - Core Update Error" >$LOG_FILE
		  fi
		  rm -rf /tmp/clash.tar.gz >/dev/null 2>&1
		  echo "" > /tmp/clash_update.txt >/dev/null 2>&1
	    fi  
		if pidof clash >/dev/null; then
			if [ $CORETYPE == $CORE ];then
		   	 /etc/init.d/clash restart >/dev/null	
			fi	
		fi
}

if [ $CORETYPE -eq 1 ] || [ $CORETYPE -eq 3 ] || [ $CORETYPE -eq 4 ]; then
	    update
fi

