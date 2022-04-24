#!/bin/bash

sh_ver="1.0.0"
export PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/sbin:/bin
aria2_conf_dir=/var/etc/aria2/
#替换成你设备aria2.conf路径
aria2_conf=${aria2_conf_dir}/aria2.conf.main
#替换成你设备的aria2c路径
aria2c=/usr/bin/aria2c
Green_font_prefix="\033[32m"
Red_font_prefix="\033[31m"
Green_background_prefix="\033[42;37m"
Red_background_prefix="\033[41;37m"
Font_color_suffix="\033[0m"
Info="[${Green_font_prefix}信息${Font_color_suffix}]"
Error="[${Red_font_prefix}错误${Font_color_suffix}]"
Tip="[${Green_font_prefix}注意${Font_color_suffix}]"
error_code=11
success_code=0

return_error(){
	echo 'Content-Type:application/json;charset=utf-8'
	echo
	echo "{
    		"\"success\"":$error_code, 
		"\"error\"":"\"$1\"",    		
		"\"result"\":null
		}"
	exit 1
}
return_ok(){
	echo 'Content-Type:application/json;charset=utf-8'
	echo
	echo "{
    		"\"success\"":$success_code, 
		"\"error\"":"\"$1\"",    		
		"\"result"\":null
		}"
	exit 0
}
return_result(){
	echo 'Content-Type:application/json;charset=utf-8'
	echo
	echo "{
    		"\"success\"":$success_code, 
		"\"error\"":"\"\"",    		
		"\"result"\":$1
		}"
	exit 0
}

#进程中是否运行aria2
check_pid() {
    PID=$(ps -ef | grep "aria2c" | grep -v grep | grep -v "aria2.sh" | grep -v "init.d" | grep -v "service" | awk '{print $2}')
}

#aria2是否正在运行
aria2_work_status(){
	check_pid
#	[[ ! -z ${PID} ]] && echo -e "${Error} Aria2 正在运行，请检查 !" && exit 1
	[[ ! -z ${PID} ]] && return_ok "Aria2正在运行"
	return_error "Aria2未运行"
}

#检测设备是否安装aria2
check_installed_status() {
    [[ ! -e ${aria2c} ]] && return_error "Aria2 没有安装，请检查 !"
    [[ ! -e ${aria2_conf} ]] && return_error "Aria2 配置文件不存在，请检查 !"
#    return_ok "Aria2已安装"
}
#读取aria2配置信息
read_config() {
    check_installed_status
    if [[ ! -e ${aria2_conf} ]]; then
            return_error "Aria2 配置文件不存在，请检查 !"      
    else
        conf_text=$(cat ${aria2_conf} | grep -v '#')
        aria2_dir=$(echo -e "${conf_text}" | grep "^dir=" | awk -F "=" '{print $NF}')
        aria2_port=$(echo -e "${conf_text}" | grep "^rpc-listen-port=" | awk -F "=" '{print $NF}')
        aria2_passwd=$(echo -e "${conf_text}" | grep "^rpc-secret=" | awk -F "=" '{print $NF}')
        aria2_bt_port=$(echo -e "${conf_text}" | grep "^listen-port=" | awk -F "=" '{print $NF}')
        aria2_dht_port=$(echo -e "${conf_text}" | grep "^dht-listen-port=" | awk -F "=" '{print $NF}')   

	return_result "{
			"\"dir"\":"\"$aria2_dir"\",
			"\"rpc-listen-port"\":"\"$aria2_port"\",
			"\"rpc-secret"\":"\"$aria2_passwd"\",
			"\"listen-port"\":"\"$aria2_bt_port"\",
			"\"dht-listen-port"\":"\"$aria2_dht_port"\"}"
    fi
}


#"Content-Type:text/html;charset=utf-8"
#echo
 
#SERVER_SOFTWARE = $SERVER_SOFTWARE #服务器软件
#SERVER_NAME = $SERVER_NAME         #服务器主机名
#GATEWAY_INTERFACE = $GATEWAY_INTERFACE    #CGI版本
#SERVER_PROTOCOL = $SERVER_PROTOCOL  #通信使用的协议
#SERVER_PORT = $SERVER_PORT         #服务器的端口号
#REQUEST_METHOD = $REQUEST_METHOD   #请求方法(GET/POST/PUT/DELETE..)
#HTTP_ACCEPT = $HTTP_ACCEPT         #HTTP定义的浏览器能够接受的数据类型
#SCRIPT_NAME = $SCRIPT_NAME         #当前运行的脚本名称(包含路径)
#QUERY_STRING = $QUERY_STRING       #地址栏中传的数据（get方式）
#REMOTE_ADDR = $REMOTE_ADDR         #客户端的ip

#根据url QUERY调不同方法
query(){
	aria2Query=${QUERY_STRING}
	parse(){
	 	echo $1 | sed 's/.*'$2'=\([[:alnum:]]*\).*/\1/'
	}
	value=$(parse $aria2Query "action")
			
	if [ ! -z = "$value" ]
		then
			if [ "$value" = "status" ]
			then
			    check_installed_status
			elif [ "$value" = "readConfig" ]
			then
			    read_config
			elif [ "$value" = "workStatus" ]
			then
			    aria2_work_status
			else
			    echo 
			fi
		else
	    return_error "action不能为空"
	fi
}
query
