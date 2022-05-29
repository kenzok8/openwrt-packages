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
github_api_kernel_library="${TMP_CHECK_DIR}/github_api_kernel_library"
github_api_kernel_file="${TMP_CHECK_DIR}/github_api_kernel_file"
support_platform=("allwinner" "rockchip" "amlogic")
MYDEVICE_NAME="$(cat /proc/device-tree/model | tr -d '\000')"
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
    run_num=$(echo "${running_script}" | awk -F "@" '{print $1}')
    run_log=$(echo "${running_script}" | awk -F "@" '{print $2}')
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
# Set the default download path
KERNEL_DOWNLOAD_PATH="/mnt/${EMMC_NAME}${PARTITION_NAME}4"

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

tolog "Device: ${MYDEVICE_NAME} [ ${PLATFORM} ], Use in [ ${EMMC_NAME} ]"
sleep 2

# Step 1: URL formatting start -----------------------------------------------------------
#
# 01. Download server version documentation
tolog "01. Start checking the kernel version."
server_firmware_url="$(uci get amlogic.config.amlogic_firmware_repo 2>/dev/null)"
[[ -n "${server_firmware_url}" ]] || tolog "01.01 The custom kernel download repo is invalid." "1"
server_kernel_path="$(uci get amlogic.config.amlogic_kernel_path 2>/dev/null)"
[[ -n "${server_kernel_path}" ]] || tolog "01.02 The custom kernel download path is invalid." "1"
#
# Supported format:
#
# server_firmware_url="https://github.com/ophub/amlogic-s9xxx-openwrt"
# server_firmware_url="ophub/amlogic-s9xxx-openwrt"
#
# server_kernel_path="https://github.com/ophub/amlogic-s9xxx-openwrt/tree/main/amlogic-s9xxx/amlogic-kernel"
# server_kernel_path="https://github.com/ophub/amlogic-s9xxx-openwrt/trunk/amlogic-s9xxx/amlogic-kernel"
# server_kernel_path="amlogic-s9xxx/amlogic-kernel"
#
if [[ "${server_firmware_url}" == http* ]]; then
    server_firmware_url="${server_firmware_url#*com\/}"
fi

if [[ "${server_kernel_path}" == http* && -n "$(echo ${server_kernel_path} | grep "tree")" ]]; then
    # Left part
    server_kernel_path_left="${server_kernel_path%\/tree*}"
    server_kernel_path_left="${server_kernel_path_left#*com\/}"
    server_firmware_url="${server_kernel_path_left}"
    # Right part
    server_kernel_path_right="${server_kernel_path#*tree\/}"
    server_kernel_path_right="${server_kernel_path_right#*\/}"
    server_kernel_path="${server_kernel_path_right}"
elif [[ "${server_kernel_path}" == http* && -n "$(echo ${server_kernel_path} | grep "trunk")" ]]; then
    # Left part
    server_kernel_path_left="${server_kernel_path%\/trunk*}"
    server_kernel_path_left="${server_kernel_path_left#*com\/}"
    server_firmware_url="${server_kernel_path_left}"
    # Right part
    server_kernel_path_right="${server_kernel_path#*trunk\/}"
    server_kernel_path="${server_kernel_path_right}"
fi

server_kernel_url="https://api.github.com/repos/${server_firmware_url}/contents/${server_kernel_path}"
#
# Step 1: URL formatting end -----------------------------------------------------------

# Step 2: Check if there is the latest kernel version
check_kernel() {
    # 02. Query local version information
    tolog "02. Start checking the kernel version."
    # 02.01 Query the current version
    current_kernel_v=$(ls /lib/modules/ 2>/dev/null | grep -oE '^[1-9].[0-9]{1,2}.[0-9]+')
    tolog "02.01 current version: ${current_kernel_v}"
    sleep 2

    # 02.02 Version comparison
    main_line_ver="$(echo "${current_kernel_v}" | cut -d '.' -f1)"
    main_line_maj="$(echo "${current_kernel_v}" | cut -d '.' -f2)"
    main_line_now="$(echo "${current_kernel_v}" | cut -d '.' -f3)"
    main_line_version="${main_line_ver}.${main_line_maj}"

    # 02.03 Query the selected branch in the settings
    server_kernel_branch="$(uci get amlogic.config.amlogic_kernel_branch 2>/dev/null | grep -oE '^[1-9].[0-9]{1,3}')"
    if [[ -z "${server_kernel_branch}" ]]; then
        server_kernel_branch="${main_line_version}"
        uci set amlogic.config.amlogic_kernel_branch="${main_line_version}" 2>/dev/null
        uci commit amlogic 2>/dev/null
    fi
    branch_ver="$(echo "${server_kernel_branch}" | cut -d '.' -f1)"
    branch_maj="$(echo "${server_kernel_branch}" | cut -d '.' -f2)"
    if [[ "${server_kernel_branch}" != "${main_line_version}" ]]; then
        main_line_version="${server_kernel_branch}"
        main_line_now="0"
        tolog "02.02 Select branch: ${main_line_version}"
        sleep 2
    fi

    # Check the version on the server
    curl -s "${server_kernel_url}" >${github_api_kernel_library} && sync
    sleep 1

    latest_version="$(cat ${github_api_kernel_library} | grep "name" | grep -oE "${main_line_version}.[0-9]+" | sed -e "s/${main_line_version}.//g" | sort -n | sed -n '$p')"
    #latest_version="124"
    [[ -n "${latest_version}" ]] || tolog "02.03 Failed to get the version on the server." "1"
    tolog "02.03 current version: ${current_kernel_v}, Latest version: ${main_line_version}.${latest_version}"
    sleep 2

    if [[ "${latest_version}" -eq "${main_line_now}" && "${main_line_maj}" -eq "${branch_maj}" ]]; then
        tolog "02.04 Already the latest version, no need to update." "1"
        sleep 2
    else
        tolog '<input type="button" class="cbi-button cbi-button-reload" value="Download" onclick="return b_check_kernel(this, '"'download_${main_line_version}.${latest_version}'"')"/> Latest version: '${main_line_version}.${latest_version}'' "1"
    fi

    exit 0
}

# Step 3: Download the latest kernel version
download_kernel() {
    tolog "03. Start download the kernels."
    if [[ "${download_version}" == download* ]]; then
        download_version="$(echo "${download_version}" | cut -d '_' -f2)"
        tolog "03.01 The kernel version: ${download_version}, downloading..."
    else
        tolog "03.02 Invalid parameter" "1"
    fi

    # Delete other residual kernel files
    rm -f ${KERNEL_DOWNLOAD_PATH}/*.tar.gz ${KERNEL_DOWNLOAD_PATH}/sha256sums 2>/dev/null && sync

    curl -s "${server_kernel_url}/${download_version}" >${github_api_kernel_file} && sync
    sleep 1

    # 01. Download boot file from the kernel directory under the path: ${server_kernel_url}/${download_version}/
    server_kernel_boot="$(cat ${github_api_kernel_file} | grep "download_url" | grep -o "https.*/boot-${download_version}.*.tar.gz" | head -n 1)"
    # Download boot file from current path: ${server_kernel_url}/
    if [[ -z "${server_kernel_boot}" ]]; then
        server_kernel_boot="$(cat ${github_api_kernel_library} | grep "download_url" | grep -o "https.*/boot-${download_version}.*.tar.gz" | head -n 1)"
    fi
    boot_file_name="${server_kernel_boot##*/}"
    server_kernel_boot_name="${boot_file_name//%2B/+}"
    wget "${server_kernel_boot}" -O "${KERNEL_DOWNLOAD_PATH}/${server_kernel_boot_name}" >/dev/null 2>&1 && sync
    if [[ "$?" -eq "0" && -s "${KERNEL_DOWNLOAD_PATH}/${server_kernel_boot_name}" ]]; then
        tolog "03.03 The boot file download complete."
    else
        tolog "03.04 The boot file download failed." "1"
    fi
    sleep 2

    # 02. Download dtb file from the kernel directory under the path: ${server_kernel_url}/${download_version}/
    server_kernel_dtb="$(cat ${github_api_kernel_file} | grep "download_url" | grep -o "https.*/dtb-${PLATFORM}-${download_version}.*.tar.gz" | head -n 1)"
    # Download dtb file from current path: ${server_kernel_url}/
    if [[ -z "${server_kernel_dtb}" ]]; then
        server_kernel_dtb="$(cat ${github_api_kernel_library} | grep "download_url" | grep -o "https.*/dtb-${PLATFORM}-${download_version}.*.tar.gz" | head -n 1)"
    fi
    dtb_file_name="${server_kernel_dtb##*/}"
    server_kernel_dtb_name="${dtb_file_name//%2B/+}"
    wget "${server_kernel_dtb}" -O "${KERNEL_DOWNLOAD_PATH}/${server_kernel_dtb_name}" >/dev/null 2>&1 && sync
    if [[ "$?" -eq "0" && -s "${KERNEL_DOWNLOAD_PATH}/${server_kernel_dtb_name}" ]]; then
        tolog "03.05 The dtb file download complete."
    else
        tolog "03.06 The dtb file download failed." "1"
    fi
    sleep 2

    # 03. Download modules file from the kernel directory under the path: ${server_kernel_url}/${download_version}/
    server_kernel_modules="$(cat ${github_api_kernel_file} | grep "download_url" | grep -o "https.*/modules-${download_version}.*.tar.gz" | head -n 1)"
    # Download modules file from current path: ${server_kernel_url}/
    if [[ -z "${server_kernel_modules}" ]]; then
        server_kernel_modules="$(cat ${github_api_kernel_library} | grep "download_url" | grep -o "https.*/modules-${download_version}.*.tar.gz" | head -n 1)"
    fi
    modules_file_name="${server_kernel_modules##*/}"
    server_kernel_modules_name="${modules_file_name//%2B/+}"
    wget "${server_kernel_modules}" -O "${KERNEL_DOWNLOAD_PATH}/${server_kernel_modules_name}" >/dev/null 2>&1 && sync
    if [[ "$?" -eq "0" && -s "${KERNEL_DOWNLOAD_PATH}/${server_kernel_modules_name}" ]]; then
        tolog "03.07 The modules file download complete."
    else
        tolog "03.08 The modules file download failed." "1"
    fi
    sleep 2

    # 04. Download sha256sums file from the kernel directory under the path: ${server_kernel_url}/${download_version}/
    server_kernel_sha256sums="$(cat ${github_api_kernel_file} | grep "download_url" | grep -o "https.*/sha256sums" | head -n 1)"
    # Download modules file from current path: ${server_kernel_url}/
    if [[ -z "${server_kernel_sha256sums}" ]]; then
        server_kernel_sha256sums="$(cat ${github_api_kernel_library} | grep "download_url" | grep -o "https.*/sha256sums" | head -n 1)"
    fi
    if [[ -n "${server_kernel_sha256sums}" ]]; then
        server_kernel_sha256sums_name="sha256sums"
        wget "${server_kernel_sha256sums}" -O "${KERNEL_DOWNLOAD_PATH}/${server_kernel_sha256sums_name}" >/dev/null 2>&1 && sync
        if [[ "$?" -eq "0" && -s "${KERNEL_DOWNLOAD_PATH}/${server_kernel_sha256sums_name}" ]]; then
            tolog "03.09 The sha256sums file download complete."
        else
            tolog "03.10 The sha256sums file download failed." "1"
        fi
        sleep 2
    fi

    tolog "04 The kernel is ready, you can update."
    sleep 2

    # Delete temporary files
    rm -f ${github_api_kernel_library} ${github_api_kernel_file} 2>/dev/null && sync

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
