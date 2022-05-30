#!/bin/bash
#==================================================================
# This file is licensed under the terms of the GNU General Public
# License version 2. This program is licensed "as is" without any
# warranty of any kind, whether express or implied.
#
# This file is a part of the luci-app-amlogic plugin
# https://github.com/ophub/luci-app-amlogic
#
# Description: Check and update luci-app-amlogic plugin
# Copyright (C) 2021- https://github.com/unifreq/openwrt_packit
# Copyright (C) 2021- https://github.com/ophub/luci-app-amlogic
#==================================================================

# Set a fixed value
TMP_CHECK_DIR="/tmp/amlogic"
AMLOGIC_SOC_FILE="/etc/flippy-openwrt-release"
START_LOG="${TMP_CHECK_DIR}/amlogic_check_plugin.log"
RUNNING_LOG="${TMP_CHECK_DIR}/amlogic_running_script.log"
LOG_FILE="${TMP_CHECK_DIR}/amlogic.log"
github_api_plugin="${TMP_CHECK_DIR}/github_api_plugin"
MYDEVICE_NAME="$(cat /proc/device-tree/model | tr -d '\000')"
LOGTIME="$(date "+%Y-%m-%d %H:%M:%S")"
[[ -d ${TMP_CHECK_DIR} ]] || mkdir -p ${TMP_CHECK_DIR}
rm -f ${TMP_CHECK_DIR}/*.ipk 2>/dev/null && sync

# Clean the running log
clean_running() {
    echo -e '' >${RUNNING_LOG} 2>/dev/null && sync
}

# Add log
tolog() {
    echo -e "${1}" >${START_LOG}
    echo -e "${LOGTIME} ${1}" >>${LOG_FILE}
    [[ -n "${2}" && "${2}" -eq "1" ]] && clean_running && exit 1
}

# Check running scripts, prohibit running concurrently
this_running_log="1@Plugin update in progress, try again later!"
running_script="$(cat ${RUNNING_LOG} 2>/dev/null | xargs)"
if [[ -n "${running_script}" ]]; then
    run_num=$(echo "${running_script}" | awk -F "@" '{print $1}')
    run_log=$(echo "${running_script}" | awk -F "@" '{print $2}')
fi
if [[ -n "${run_log}" && "${run_num}" -ne "1" ]]; then
    echo -e "${run_log}" >${START_LOG} 2>/dev/null && sync && exit 1
else
    echo -e "${this_running_log}" >${RUNNING_LOG} 2>/dev/null && sync
fi

# Find the partition where root is located
ROOT_PTNAME="$(df / | tail -n1 | awk '{print $1}' | awk -F '/' '{print $3}')"
if [[ -z "${ROOT_PTNAME}" ]]; then
    tolog "Cannot find the partition corresponding to the root file system!" "1"
fi

# Find the disk where the partition is located, only supports mmcblk?p? sd?? hd?? vd?? and other formats
case "${ROOT_PTNAME}" in
mmcblk?p[1-4])
    EMMC_NAME="$(echo ${ROOT_PTNAME} | awk '{print substr($1, 1, length($1)-2)}')"
    PARTITION_NAME="p"
    LB_PRE="EMMC_"
    ;;
[hsv]d[a-z][1-4])
    EMMC_NAME="$(echo ${ROOT_PTNAME} | awk '{print substr($1, 1, length($1)-1)}')"
    PARTITION_NAME=""
    LB_PRE=""
    ;;
*)
    tolog "Unable to recognize the disk type of ${ROOT_PTNAME}!" "1"
    ;;
esac

# Check release file
if [[ -s "${AMLOGIC_SOC_FILE}" ]]; then
    source "${AMLOGIC_SOC_FILE}" 2>/dev/null
    PLATFORM="${PLATFORM}"
    SOC="${SOC}"
else
    tolog "${AMLOGIC_SOC_FILE} file is missing!" "1"
fi
[[ -n "${PLATFORM}" && -n "${SOC}" ]] || tolog "The custom firmware soc is invalid." "1"
tolog "Device: ${MYDEVICE_NAME} [ ${PLATFORM} ], Use in [ ${EMMC_NAME} ]"
sleep 2

# 01. Query local version information
tolog "01. Query current version information."
current_plugin_v="$(opkg list-installed | grep 'luci-app-amlogic' | awk '{print $3}')"
tolog "01.01 current version: ${current_plugin_v}"
sleep 2

# 02. Check the version on the server
tolog "02. Query server version information."

curl -s "https://api.github.com/repos/ophub/luci-app-amlogic/releases" >${github_api_plugin} && sync
sleep 1

server_plugin_version="$(cat ${github_api_plugin} | grep "tag_name" | awk -F '"' '{print $4}' | tr " " "\n" | sort -rV | head -n 1)"
[[ -n "${server_plugin_version}" ]] || tolog "02.01 Failed to get the version on the server." "1"
tolog "02.01 current version: ${current_plugin_v}, Latest version: ${server_plugin_version}"
sleep 2

if [[ "${current_plugin_v}" == "${server_plugin_version}" ]]; then
    tolog "02.02 Already the latest version, no need to update." "1"
else
    tolog "02.03 Check the latest plug-in download address."

    server_plugin_url="https://github.com/ophub/luci-app-amlogic/releases/download"
    server_plugin_file_ipk="$(cat ${github_api_plugin} | grep -E "browser_.*${server_plugin_version}.*" | grep -oE "luci-app-amlogic_.*.ipk" | head -n 1)"
    server_plugin_file_i18n="$(cat ${github_api_plugin} | grep -E "browser_.*${server_plugin_version}.*" | grep -oE "luci-i18n-amlogic-zh-cn_.*.ipk" | head -n 1)"

    if [[ -n "${server_plugin_file_ipk}" && -n "${server_plugin_file_i18n}" ]]; then
        tolog "02.04 Start downloading the latest plugin..."
    else
        tolog "02.04 No available plugins found!" "1"
    fi

    # Download plugin ipk file
    wget "${server_plugin_url}/${server_plugin_version}/${server_plugin_file_ipk}" -O "${TMP_CHECK_DIR}/${server_plugin_file_ipk}" >/dev/null 2>&1 && sync
    if [[ "$?" -eq "0" && -s "${TMP_CHECK_DIR}/${server_plugin_file_ipk}" ]]; then
        tolog "02.05 ${server_plugin_file_ipk} complete."
    else
        tolog "02.05 The plugin file failed to download." "1"
    fi
    sleep 2

    # Download plugin i18n file
    wget "${server_plugin_url}/${server_plugin_version}/${server_plugin_file_i18n}" -O "${TMP_CHECK_DIR}/${server_plugin_file_i18n}" >/dev/null 2>&1 && sync
    if [[ "$?" -eq "0" && -s "${TMP_CHECK_DIR}/${server_plugin_file_i18n}" ]]; then
        tolog "02.06 ${server_plugin_file_i18n} complete."
    else
        tolog "02.06 The plugin i18n failed to download." "1"
    fi
    sleep 2
fi

tolog "03. The plug is ready, you can update."
sleep 2

# Delete temporary files
rm -f ${github_api_plugin} 2>/dev/null && sync

#echo '<a href=upload>Update</a>' >$START_LOG
tolog '<input type="button" class="cbi-button cbi-button-reload" value="Update" onclick="return amlogic_plugin(this)"/> Latest version: '${server_plugin_version}'' "1"

exit 0
