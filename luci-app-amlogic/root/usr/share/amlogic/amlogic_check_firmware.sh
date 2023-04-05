#!/bin/bash
#==================================================================
# This file is licensed under the terms of the GNU General Public
# License version 2. This program is licensed "as is" without any
# warranty of any kind, whether express or implied.
#
# This file is a part of the luci-app-amlogic plugin
# https://github.com/ophub/luci-app-amlogic
#
# Description: Check and update OpenWrt firmware
# Copyright (C) 2021- https://github.com/unifreq/openwrt_packit
# Copyright (C) 2021- https://github.com/ophub/luci-app-amlogic
#==================================================================

# Set a fixed value
check_option="${1}"
download_version="${2}"
TMP_CHECK_DIR="/tmp/amlogic"
AMLOGIC_SOC_FILE="/etc/flippy-openwrt-release"
START_LOG="${TMP_CHECK_DIR}/amlogic_check_firmware.log"
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
this_running_log="3@OpenWrt update in progress, try again later!"
running_script="$(cat ${RUNNING_LOG} 2>/dev/null | xargs)"
if [[ -n "${running_script}" ]]; then
    run_num=$(echo "${running_script}" | awk -F "@" '{print $1}')
    run_log=$(echo "${running_script}" | awk -F "@" '{print $2}')
fi
if [[ -n "${run_log}" && "${run_num}" -ne "3" ]]; then
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

# Set the default download path
FIRMWARE_DOWNLOAD_PATH="/mnt/${EMMC_NAME}${PARTITION_NAME}4"
[ -d "${FIRMWARE_DOWNLOAD_PATH}/.luci-app-amlogic" ] || mkdir -p "${FIRMWARE_DOWNLOAD_PATH}/.luci-app-amlogic"

# Check release file
if [[ -s "${AMLOGIC_SOC_FILE}" ]]; then
    source "${AMLOGIC_SOC_FILE}" 2>/dev/null
    PLATFORM="${PLATFORM}"
    SOC="${SOC}"
    BOARD="${BOARD}"
else
    tolog "${AMLOGIC_SOC_FILE} file is missing!" "1"
fi
if [[ -z "${PLATFORM}" || -z "$(echo "${support_platform[@]}" | grep -w "${PLATFORM}")" || -z "${SOC}" || -z "${BOARD}" ]]; then
    tolog "Missing [ PLATFORM / SOC / BOARD ] value in ${AMLOGIC_SOC_FILE} file." "1"
fi

tolog "PLATFORM: [ ${PLATFORM} ], BOARD: [ ${BOARD} ], Use in [ ${EMMC_NAME} ]"
sleep 2

# 01. Query local version information
tolog "01. Query version information."
# 01.01 Query the current version
current_kernel_v="$(uname -r 2>/dev/null | grep -oE '^[1-9].[0-9]{1,3}.[0-9]+')"
tolog "01.01 current version: ${current_kernel_v}"
sleep 2

# 01.01 Version comparison
main_line_version="$(echo ${current_kernel_v} | awk -F '.' '{print $1"."$2}')"

# 01.02. Query the selected branch in the settings
server_kernel_branch="$(uci get amlogic.config.amlogic_kernel_branch 2>/dev/null | grep -oE '^[1-9].[0-9]{1,3}')"
if [[ -z "${server_kernel_branch}" ]]; then
    server_kernel_branch="${main_line_version}"
    uci set amlogic.config.amlogic_kernel_branch="${main_line_version}" 2>/dev/null
    uci commit amlogic 2>/dev/null
fi
if [[ "${server_kernel_branch}" != "${main_line_version}" ]]; then
    main_line_version="${server_kernel_branch}"
    tolog "01.02 Select branch: ${main_line_version}"
    sleep 2
fi

# 01.03. Download server version documentation
server_firmware_url="$(uci get amlogic.config.amlogic_firmware_repo 2>/dev/null)"
[[ ! -z "${server_firmware_url}" ]] || tolog "01.03 The custom firmware download repo is invalid." "1"
releases_tag_keywords="$(uci get amlogic.config.amlogic_firmware_tag 2>/dev/null)"
[[ ! -z "${releases_tag_keywords}" ]] || tolog "01.04 The custom firmware tag keywords is invalid." "1"
firmware_suffix="$(uci get amlogic.config.amlogic_firmware_suffix 2>/dev/null)"
[[ ! -z "${firmware_suffix}" ]] || tolog "01.05 The custom firmware suffix is invalid." "1"

if [[ "${server_firmware_url}" == http* ]]; then
    server_firmware_url="${server_firmware_url#*com\/}"
fi

# 02. Check Updated
check_updated() {
    tolog "02. Start checking for the latest version..."

    # Query the latest version
    latest_version="$(
        curl -s \
            -H "Accept: application/vnd.github+json" \
            https://api.github.com/repos/${server_firmware_url}/releases |
            jq '.[]' |
            jq -s --arg RTK "${releases_tag_keywords}" '.[] | select(.tag_name | contains($RTK))' |
            jq -s '.[] | {data:.published_at, url:.assets[].browser_download_url }' |
            jq -s --arg BOARD "_${BOARD}_" --arg MLV "${main_line_version}." '.[] | select((.url | contains($BOARD)) and (.url | contains($MLV)))' |
            jq -s 'sort_by(.data)|reverse[]' |
            jq -s '.[0]' -c
    )"
    [[ "${latest_version}" == "null" ]] && tolog "02.01 Invalid OpenWrt download address." "1"
    latest_updated_at="$(echo ${latest_version} | jq -r '.data')"
    latest_url="$(echo ${latest_version} | jq -r '.url')"

    # Convert to readable date format
    date_display_format="$(echo ${latest_updated_at} | tr 'T' '(' | tr 'Z' ')')"

    # Check the firmware update code
    down_check_code="${latest_updated_at}.${main_line_version}"
    op_release_code="${FIRMWARE_DOWNLOAD_PATH}/.luci-app-amlogic/op_release_code"
    if [[ -f "${op_release_code}" ]]; then
        update_check_code="$(cat ${op_release_code} | xargs)"
        if [[ -n "${update_check_code}" && "${update_check_code}" == "${down_check_code}" ]]; then
            tolog "02.02 Already the latest version, no need to update." "1"
        fi
    fi

    # Prompt to update
    if [[ "${latest_url}" == "http"* ]]; then
        tolog '<input type="button" class="cbi-button cbi-button-reload" value="Download" onclick="return b_check_firmware(this, '"'download_${latest_updated_at}@${latest_url##*download/}'"')"/> Latest updated: '${date_display_format}'' "1"
    else
        tolog "02.03 [${latest_url}] No OpenWrt available, please use another kernel branch." "1"
    fi

    exit 0
}

# 03. Download Openwrt firmware
download_firmware() {
    tolog "03. Download Openwrt firmware ..."

    # Get the openwrt firmware download path
    if [[ "${download_version}" == "download_"* ]]; then
        tolog "03.01 Start downloading..."
    else
        tolog "03.02 Invalid parameter." "1"
    fi

    # Delete other residual firmware files
    rm -f ${FIRMWARE_DOWNLOAD_PATH}/*${firmware_suffix} 2>/dev/null && sync
    rm -f ${FIRMWARE_DOWNLOAD_PATH}/*.img 2>/dev/null && sync
    rm -f ${FIRMWARE_DOWNLOAD_PATH}/sha256sums 2>/dev/null && sync

    # OpenWrt make data
    latest_updated_at="$(echo ${download_version} | awk -F'@' '{print $1}' | sed -e s'|download_||'g)"
    down_check_code="${latest_updated_at}.${main_line_version}"

    # Download firmware
    opfile_path="$(echo ${download_version} | awk -F'@' '{print $2}')"
    # Restore converted characters in file names(%2B to +)
    firmware_download_oldname="${opfile_path//%2B/+}"
    latest_url="https://github.com/${server_firmware_url}/releases/download/${firmware_download_oldname}"
    #tolog "${latest_url}"

    # Download to OpenWrt file
    firmware_download_name="openwrt_${BOARD}_k${main_line_version}_github${firmware_suffix}"
    wget "${latest_url}" -q -O "${FIRMWARE_DOWNLOAD_PATH}/${firmware_download_name}"
    if [[ "$?" -eq "0" && -s "${FIRMWARE_DOWNLOAD_PATH}/${firmware_download_name}" ]]; then
        tolog "03.01 OpenWrt downloaded successfully."
    else
        tolog "03.02 OpenWrt download failed." "1"
    fi

    # Download address of sha256sums file
    shafile_path="$(echo ${opfile_path} | awk -F'/' '{print $1}')"
    shafile_file="https://github.com/${server_firmware_url}/releases/download/${shafile_path}/sha256sums"
    # Download sha256sums file
    if wget "${shafile_file}" -q -O "${FIRMWARE_DOWNLOAD_PATH}/sha256sums" 2>/dev/null; then
        tolog "03.03 Sha256sums downloaded successfully."
        releases_firmware_sha256sums="$(cat sha256sums | grep ${firmware_download_oldname##*/} | awk '{print $1}')"
        download_firmware_sha256sums="$(sha256sum ${firmware_download_name} | awk '{print $1}')"
        [[ -n "${releases_firmware_sha256sums}" && "${releases_firmware_sha256sums}" != "${download_firmware_sha256sums}" ]] && tolog "03.04 The sha256sum check is different." "1"
    fi
    sync && sleep 3

    tolog "You can update."

    #echo '<a href="javascript:;" onclick="return amlogic_update(this, '"'${firmware_download_name}'"')">Update</a>' >$START_LOG
    tolog '<input type="button" class="cbi-button cbi-button-reload" value="Update" onclick="return amlogic_update(this, '"'${firmware_download_name}@${down_check_code}@${FIRMWARE_DOWNLOAD_PATH}'"')"/>' "1"

    exit 0
}

getopts 'cd' opts
case "${opts}" in
c | check)
    check_updated
    ;;
* | download)
    download_firmware
    ;;
esac
