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
support_platform=("allwinner" "rockchip" "amlogic" "qemu-aarch64")
LOGTIME="$(date "+%Y-%m-%d %H:%M:%S")"

[[ -d ${TMP_CHECK_DIR} ]] || mkdir -p ${TMP_CHECK_DIR}
rm -f ${TMP_CHECK_DIR}/*.ipk 2>/dev/null && sync
rm -f ${TMP_CHECK_DIR}/sha256sums 2>/dev/null && sync

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
    run_num="$(echo "${running_script}" | awk -F "@" '{print $1}')"
    run_log="$(echo "${running_script}" | awk -F "@" '{print $2}')"
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
    ;;
[hsv]d[a-z][1-4])
    EMMC_NAME="$(echo ${ROOT_PTNAME} | awk '{print substr($1, 1, length($1)-1)}')"
    PARTITION_NAME=""
    ;;
nvme?n?p[1-4])
    EMMC_NAME="$(echo ${ROOT_PTNAME} | awk '{print substr($1, 1, length($1)-2)}')"
    PARTITION_NAME="p"
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
if [[ -z "${PLATFORM}" || -z "$(echo "${support_platform[@]}" | grep -w "${PLATFORM}")" || -z "${SOC}" ]]; then
    tolog "Missing [ PLATFORM ] value in ${AMLOGIC_SOC_FILE} file." "1"
fi

tolog "PLATFORM: [ ${PLATFORM} ], SOC: [ ${SOC} ], Use in [ ${EMMC_NAME} ]"
sleep 2

# 01. Query local version information
tolog "01. Query current version information."

current_plugin_v="$(opkg list-installed | grep 'luci-app-amlogic' | awk '{print $3}')"
tolog "01.01 current version: ${current_plugin_v}"
sleep 2

# 02. Check the version on the server
tolog "02. Start querying plugin version..."

# Get the latest version
latest_version="$(
    curl -fsSL -m 10 \
        https://github.com/ophub/luci-app-amlogic/releases |
        grep -oE 'expanded_assets/[0-9]+.[0-9]+.[0-9]+(-[0-9]+)?' | sed 's|expanded_assets/||' |
        sort -urV | head -n 1
)"
if [[ -z "${latest_version}" ]]; then
    tolog "02.01 Query failed, please try again." "1"
else
    tolog "02.01 current version: ${current_plugin_v}, Latest version: ${latest_version}"
    sleep 2
fi

# Compare the version and download the latest version
if [[ "${current_plugin_v}" == "${latest_version}" ]]; then
    tolog "02.02 Already the latest version, no need to update." "1"
else
    tolog "02.03 Start downloading the latest plugin..."

    # Set the plugin download path
    download_repo="https://github.com/ophub/luci-app-amlogic/releases/download"
    plugin_file="${download_repo}/${latest_version}/luci-app-amlogic_${latest_version}_all.ipk"
    language_file="${download_repo}/${latest_version}/luci-i18n-amlogic-zh-cn_${latest_version}_all.ipk"

    # Download the plug-in's i18n file
    curl -fsSL "${language_file}" -o "${TMP_CHECK_DIR}/luci-i18n-amlogic-zh-cn_${latest_version}_all.ipk"
    if [[ "${?}" -eq "0" ]]; then
        tolog "02.04 Language pack downloaded successfully."
    else
        tolog "02.04 Language pack download failed." "1"
    fi

    # Download the plug-in's ipk file
    curl -fsSL "${plugin_file}" -o "${TMP_CHECK_DIR}/luci-app-amlogic_${latest_version}_all.ipk"
    if [[ "${?}" -eq "0" ]]; then
        tolog "02.05 Plugin downloaded successfully."
    else
        tolog "02.05 Plugin download failed." "1"
    fi

    sync && sleep 2
fi

tolog "03. The plug is ready, you can update."
sleep 2

#echo '<a href=upload>Update</a>' >$START_LOG
tolog '<input type="button" class="cbi-button cbi-button-reload" value="Update" onclick="return amlogic_plugin(this)"/> Latest version: '${latest_version}'' "1"

exit 0
