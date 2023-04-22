#!/bin/bash
#==================================================================
# This file is licensed under the terms of the GNU General Public
# License version 2. This program is licensed "as is" without any
# warranty of any kind, whether express or implied.
#
# This file is a part of the luci-app-amlogic plugin
# https://github.com/ophub/luci-app-amlogic
#
# Description: Check and update OpenWrt Kernel
# Copyright (C) 2021- https://github.com/unifreq/openwrt_packit
# Copyright (C) 2021- https://github.com/ophub/luci-app-amlogic
#==================================================================

# Set a fixed value
check_option="${1}"
download_version="${2}"
TMP_CHECK_DIR="/tmp/amlogic"
AMLOGIC_SOC_FILE="/etc/flippy-openwrt-release"
START_LOG="${TMP_CHECK_DIR}/amlogic_check_kernel.log"
RUNNING_LOG="${TMP_CHECK_DIR}/amlogic_running_script.log"
LOG_FILE="${TMP_CHECK_DIR}/amlogic.log"
support_platform=("allwinner" "rockchip" "amlogic" "qemu-aarch64")
LOGTIME="$(date "+%Y-%m-%d %H:%M:%S")"
[[ -d ${TMP_CHECK_DIR} ]] || mkdir -p ${TMP_CHECK_DIR}

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
this_running_log="2@Kernel update in progress, try again later!"
running_script="$(cat ${RUNNING_LOG} 2>/dev/null | xargs)"
if [[ -n "${running_script}" ]]; then
    run_num="$(echo "${running_script}" | awk -F "@" '{print $1}')"
    run_log="$(echo "${running_script}" | awk -F "@" '{print $2}')"
fi
if [[ -n "${run_log}" && "${run_num}" -ne "2" ]]; then
    echo -e "${run_log}" >${START_LOG} 2>/dev/null && sync && exit 1
else
    echo -e "${this_running_log}" >${RUNNING_LOG} 2>/dev/null && sync
fi

# Find the partition where root is located
ROOT_PTNAME="$(df / | tail -n1 | awk '{print $1}' | awk -F '/' '{print $3}')"
[[ -n "${ROOT_PTNAME}" ]] || tolog "Cannot find the partition corresponding to the root file system!" "1"

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
# Set the default download path
KERNEL_DOWNLOAD_PATH="/mnt/${EMMC_NAME}${PARTITION_NAME}4"

# Check release file
if [[ -s "${AMLOGIC_SOC_FILE}" ]]; then
    source "${AMLOGIC_SOC_FILE}" 2>/dev/null
    PLATFORM="${PLATFORM}"
    SOC="${SOC}"
    KERNEL_TAGS="${KERNEL_TAGS}"
else
    tolog "${AMLOGIC_SOC_FILE} file is missing!" "1"
fi
if [[ -z "${PLATFORM}" || -z "$(echo "${support_platform[@]}" | grep -w "${PLATFORM}")" || -z "${SOC}" ]]; then
    tolog "Missing [ PLATFORM ] value in ${AMLOGIC_SOC_FILE} file." "1"
fi

tolog "PLATFORM: [ ${PLATFORM} ], SOC: [ ${SOC} ], Use in [ ${EMMC_NAME} ]"
sleep 2

# Step 1. Set the kernel query api
tolog "01. Start checking the kernel version."
firmware_repo="$(uci get amlogic.config.amlogic_firmware_repo 2>/dev/null)"
[[ -n "${firmware_repo}" ]] || tolog "01.01 The custom kernel download repo is invalid." "1"
kernel_repo="$(uci get amlogic.config.amlogic_kernel_path 2>/dev/null)"
[[ -n "${kernel_repo}" ]] || tolog "01.02 The custom kernel download repo is invalid." "1"

if [[ "${kernel_repo}" == "opt/kernel" ]]; then
    uci set amlogic.config.amlogic_kernel_path="${firmware_repo}" 2>/dev/null
    uci commit amlogic 2>/dev/null
    kernel_repo="${firmware_repo}"
fi

# Convert kernel repo to api format
[[ "${kernel_repo}" =~ ^https: ]] && kernel_repo="$(echo ${kernel_repo} | awk -F'/' '{print $4"/"$5}')"
kernel_api="https://api.github.com/repos/${kernel_repo}"
if [[ -n "${KERNEL_TAGS}" ]]; then
    kernel_tag="${KERNEL_TAGS}"
else
    [[ "${SOC}" == "rk3588" ]] && kernel_tag="rk3588" || kernel_tag="stable"
fi

# Step 2: Check if there is the latest kernel version
check_kernel() {
    # 02. Query local version information
    tolog "02. Start checking the kernel version."
    # 02.01 Query the current version
    current_kernel_v=$(uname -r 2>/dev/null | grep -oE '^[1-9]\.[0-9]{1,2}\.[0-9]+')
    tolog "02.01 current version: ${current_kernel_v}"
    sleep 2

    # 02.02 Version comparison
    main_line_version="$(echo ${current_kernel_v} | awk -F '.' '{print $1"."$2}')"

    # 02.03 Query the selected branch in the settings
    server_kernel_branch="$(uci get amlogic.config.amlogic_kernel_branch 2>/dev/null | grep -oE '^[1-9].[0-9]{1,3}')"
    if [[ -z "${server_kernel_branch}" ]]; then
        server_kernel_branch="${main_line_version}"
        uci set amlogic.config.amlogic_kernel_branch="${main_line_version}" 2>/dev/null
        uci commit amlogic 2>/dev/null
    fi

    if [[ "${server_kernel_branch}" != "${main_line_version}" ]]; then
        main_line_version="${server_kernel_branch}"
        main_line_now="0"
        tolog "02.02 Select branch: ${main_line_version}"
        sleep 2
    fi

    # Check the version on the server
    latest_version="$(
        curl -s \
            -H "Accept: application/vnd.github+json" \
            ${kernel_api}/releases/tags/kernel_${kernel_tag} |
            jq -r '.assets[].name' |
            grep -oE "${main_line_version}\.[0-9]+" |
            sort -rV | head -n 1
    )"
    [[ -n "${latest_version}" ]] || tolog "02.03 No kernel available, please use another kernel branch." "1"

    tolog "02.03 current version: ${current_kernel_v}, Latest version: ${latest_version}"
    sleep 2

    if [[ "${latest_version}" == "${current_kernel_v}" ]]; then
        tolog "02.04 Already the latest version, no need to update." "1"
        sleep 2
    else
        tolog '<input type="button" class="cbi-button cbi-button-reload" value="Download" onclick="return b_check_kernel(this, '"'download_${latest_version}'"')"/> Latest version: '${latest_version}'' "1"
    fi

    exit 0
}

# Step 3: Download the latest kernel version
download_kernel() {
    tolog "03. Start download the kernels."
    if [[ "${download_version}" == "download_"* ]]; then
        download_version="$(echo "${download_version}" | cut -d '_' -f2)"
        tolog "03.01 The kernel version: ${download_version}, downloading..."
    else
        tolog "03.02 Invalid parameter" "1"
    fi

    # Delete other residual kernel files
    rm -f ${KERNEL_DOWNLOAD_PATH}/*.tar.gz 2>/dev/null && sync
    rm -f ${KERNEL_DOWNLOAD_PATH}/sha256sums 2>/dev/null && sync

    kernel_down_from="https://github.com/${kernel_repo}/releases/download/kernel_${kernel_tag}/${download_version}.tar.gz"
    wget "${kernel_down_from}" -q -P "${KERNEL_DOWNLOAD_PATH}"
    [[ "${?}" -ne "0" ]] && tolog "03.03 The kernel download failed." "1"

    tar -xf "${KERNEL_DOWNLOAD_PATH}/${download_version}.tar.gz" -C "${KERNEL_DOWNLOAD_PATH}"
    [[ "${?}" -ne "0" ]] && tolog "03.04 Kernel decompression failed." "1"
    mv -f ${KERNEL_DOWNLOAD_PATH}/${download_version}/* -t ${KERNEL_DOWNLOAD_PATH}

    sync && sleep 3
    rm -rf "${KERNEL_DOWNLOAD_PATH}/${download_version}.tar.gz" "${KERNEL_DOWNLOAD_PATH}/${download_version}"

    tolog "03.05 The kernel is ready, you can update."
    sleep 2

    #echo '<a href="javascript:;" onclick="return amlogic_kernel(this)">Update</a>' >$START_LOG
    tolog '<input type="button" class="cbi-button cbi-button-reload" value="Update" onclick="return amlogic_kernel(this)"/>' "1"

    exit 0
}

getopts 'cd' opts
case "${opts}" in
c | check)
    check_kernel
    ;;
* | download)
    download_kernel
    ;;
esac
