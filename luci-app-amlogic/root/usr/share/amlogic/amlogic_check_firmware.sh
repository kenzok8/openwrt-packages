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
github_api_openwrt="${TMP_CHECK_DIR}/github_api_openwrt"
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

tolog "PLATFORM: [ ${PLATFORM} ], Box: [ ${SOC}_${BOARD} ], Use in [ ${EMMC_NAME} ]"
sleep 2

# 01. Query local version information
tolog "01. Query version information."
# 01.01 Query the current version
current_kernel_v="$(ls /lib/modules/ 2>/dev/null | grep -oE '^[1-9].[0-9]{1,3}.[0-9]+')"
tolog "01.01 current version: ${current_kernel_v}"
sleep 2

# 01.01 Version comparison
main_line_ver="$(echo "${current_kernel_v}" | cut -d '.' -f1)"
main_line_maj="$(echo "${current_kernel_v}" | cut -d '.' -f2)"
main_line_version="${main_line_ver}.${main_line_maj}"

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

# Supported format:
# server_firmware_url="https://github.com/ophub/amlogic-s9xxx-openwrt"
# server_firmware_url="ophub/amlogic-s9xxx-openwrt"
if [[ "${server_firmware_url}" == http* ]]; then
    server_firmware_url="${server_firmware_url#*com\/}"
fi

firmware_download_url="https:.*${releases_tag_keywords}.*_${BOARD}_.*${main_line_version}.*${firmware_suffix}"
firmware_sha256sums_download_url="https:.*${releases_tag_keywords}.*sha256sums"

# 02. Check Updated
check_updated() {
    tolog "02. Start checking the updated ..."
    curl -s "https://api.github.com/repos/${server_firmware_url}/releases" >${github_api_openwrt} && sync
    sleep 1

    # Get the openwrt firmware updated_at
    api_down_line_array="$(cat ${github_api_openwrt} | grep -n "${firmware_download_url}" | awk -F ":" '{print $1}' | tr "\n" " " | echo $(xargs))"
    # return: 123 233 312

    i=1
    api_updated_at=()
    api_updated_merge=()
    for x in ${api_down_line_array}; do
        api_updated_at[${i}]="$(cat ${github_api_openwrt} | sed -n "$((x - 1))p" | cut -d '"' -f4)"
        api_updated_merge[${i}]="${x}@$(cat ${github_api_openwrt} | sed -n "$((x - 1))p" | cut -d '"' -f4)"
        let i++
    done
    # return: api_updated_at: 2021-10-21T17:52:56Z 2021-10-21T11:22:39Z 2021-10-22T17:52:56Z
    latest_updated_at="$(echo ${api_updated_at[*]} | tr ' ' '\n' | sort -r | head -n 1)"
    latest_updated_at_format="$(echo ${latest_updated_at} | tr 'T' '(' | tr 'Z' ')')"
    # return: latest_updated_at: 2021-10-22T17:52:56Z
    api_op_down_line="$(echo ${api_updated_merge[*]} | tr ' ' '\n' | grep ${latest_updated_at} | cut -d '@' -f1)"
    # return: api_openwrt_download_line: 123

    # Check the firmware update code
    op_release_code="${FIRMWARE_DOWNLOAD_PATH}/.luci-app-amlogic/op_release_code"
    if [[ -f "${op_release_code}" ]]; then
        update_check_code="$(cat ${op_release_code} | xargs)"
        if [[ -n "${update_check_code}" && "${update_check_code}" == "${latest_updated_at}" ]]; then
            tolog "02.01 Already the latest version, no need to update." "1"
        fi
    fi

    # Prompt to update
    if [[ -n "${api_op_down_line}" && -n "$(echo ${api_op_down_line} | sed -n "/^[0-9]\+$/p")" ]]; then
        tolog '<input type="button" class="cbi-button cbi-button-reload" value="Download" onclick="return b_check_firmware(this, '"'download_${api_op_down_line}_${latest_updated_at}'"')"/> Latest updated: '${latest_updated_at_format}'' "1"
    else
        tolog "02.02 No firmware available, please use another kernel branch." "1"
    fi

    exit 0
}

# 03. Download Openwrt firmware
download_firmware() {
    tolog "03. Download Openwrt firmware ..."

    # Get the openwrt firmware download path
    if [[ "${download_version}" == download* ]]; then
        download_firmware_line="$(echo "${download_version}" | cut -d '_' -f2)"
        download_latest_updated="$(echo "${download_version}" | cut -d '_' -f3)"
        tolog "03.01 Start downloading..."
    else
        tolog "03.02 Invalid parameter" "1"
    fi

    # Delete other residual firmware files
    rm -f ${FIRMWARE_DOWNLOAD_PATH}/*${firmware_suffix} 2>/dev/null && sync
    rm -f ${FIRMWARE_DOWNLOAD_PATH}/*.img 2>/dev/null && sync
    rm -f ${FIRMWARE_DOWNLOAD_PATH}/sha256sums 2>/dev/null && sync

    firmware_releases_path="$(cat ${github_api_openwrt} | sed -n "${download_firmware_line}p" | grep "browser_download_url" | grep -o "${firmware_download_url}" | head -n 1)"
    # Download to local rename
    firmware_download_name="openwrt_${SOC}_${BOARD}_k${main_line_version}_github${firmware_suffix}"
    # The name in the github.com releases
    firmware_download_oldname="${firmware_releases_path##*/}"
    firmware_download_oldname="${firmware_download_oldname//%2B/+}"
    # Download firmware
    wget "${firmware_releases_path}" -O "${FIRMWARE_DOWNLOAD_PATH}/${firmware_download_name}" >/dev/null 2>&1 && sync
    if [[ "$?" -eq "0" && -s "${FIRMWARE_DOWNLOAD_PATH}/${firmware_download_name}" ]]; then
        tolog "03.01 Firmware download complete."
    else
        tolog "03.02 Firmware download failed." "1"
    fi
    sleep 2

    sha256sums_check="1"
    [[ -n "$(which sha256sum)" ]] || sha256sums_check="0"
    firmware_sha256sums_path="$(cat ${github_api_openwrt} | grep "browser_download_url" | grep -o "${firmware_sha256sums_download_url}" | head -n 1)"
    if [[ -n "${firmware_sha256sums_path}" && "${sha256sums_check}" -eq "1" ]]; then
        wget "${firmware_sha256sums_path}" -O "${FIRMWARE_DOWNLOAD_PATH}/sha256sums" >/dev/null 2>&1 && sync
        if [[ "$?" -eq "0" && -s "${FIRMWARE_DOWNLOAD_PATH}/sha256sums" ]]; then
            tolog "03.03 Sha256sums download complete."
            releases_firmware_sha256sums="$(cat sha256sums | grep ${firmware_download_oldname} | awk '{print $1}')"
            download_firmware_sha256sums="$(sha256sum ${firmware_download_name} | awk '{print $1}')"
            [[ -n "${releases_firmware_sha256sums}" && "${releases_firmware_sha256sums}" != "${download_firmware_sha256sums}" ]] && tolog "03.04 sha256sum verification failed." "1"
        else
            tolog "03.05 Sha256sums download failed." "1"
        fi
        sleep 2
    fi

    # Delete temporary files
    rm -f ${github_api_openwrt} 2>/dev/null && sync

    tolog "You can update."

    #echo '<a href="javascript:;" onclick="return amlogic_update(this, '"'${firmware_download_name}'"')">Update</a>' >$START_LOG
    tolog '<input type="button" class="cbi-button cbi-button-reload" value="Update" onclick="return amlogic_update(this, '"'${firmware_download_name}@${download_latest_updated}@${FIRMWARE_DOWNLOAD_PATH}'"')"/>' "1"

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
