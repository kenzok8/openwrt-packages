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

# Get the partition name of the root file system
get_root_partition_name() {
    local paths=("/" "/overlay" "/rom")
    local partition_name

    for path in "${paths[@]}"; do
        partition_name=$(df "${path}" | awk 'NR==2 {print $1}' | awk -F '/' '{print $3}')
        [[ -n "${partition_name}" ]] && break
    done

    [[ -z "${partition_name}" ]] && tolog "Cannot find the root partition!" "1"
    echo "${partition_name}"
}

# Check running scripts, prohibit running concurrently
this_running_log="3@OpenWrt update in progress, try again later!"
running_script="$(cat ${RUNNING_LOG} 2>/dev/null | xargs)"
if [[ -n "${running_script}" ]]; then
    run_num="$(echo "${running_script}" | awk -F "@" '{print $1}')"
    run_log="$(echo "${running_script}" | awk -F "@" '{print $2}')"
fi
if [[ -n "${run_log}" && "${run_num}" -ne "3" ]]; then
    echo -e "${run_log}" >${START_LOG} 2>/dev/null && sync && exit 1
else
    echo -e "${this_running_log}" >${RUNNING_LOG} 2>/dev/null && sync
fi

# Find the partition where root is located
ROOT_PTNAME="$(get_root_partition_name)"

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
    BOARD="${BOARD}"
else
    tolog "${AMLOGIC_SOC_FILE} file is missing!" "1"
fi
if [[ -z "${PLATFORM}" || -z "$(echo "${support_platform[@]}" | grep -w "${PLATFORM}")" || -z "${BOARD}" ]]; then
    tolog "Missing [ PLATFORM / BOARD ] value in ${AMLOGIC_SOC_FILE} file." "1"
fi

tolog "PLATFORM: [ ${PLATFORM} ], BOARD: [ ${BOARD} ], Use in [ ${EMMC_NAME} ]"
sleep 2

# 01. Query local version information
tolog "01. Query version information..."
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
    tolog "02.01 Search for tags in the first 5 pages of releases..."

    # Get the tags list
    firmware_tags_array=()
    for i in {1..5}; do
        while IFS= read -r firmware_tags_name; do
            firmware_tags_name="$(echo "${firmware_tags_name}" | sed 's/releases\/tag\///g')"
            if [[ -n "${firmware_tags_name}" ]]; then
                firmware_tags_array+=("${firmware_tags_name}")
            fi
        done < <(
            curl -fsSL -m 10 \
                https://github.com/${server_firmware_url}/releases?page=${i} |
                grep -oE 'releases/tag/([^" ]+)'
        )
    done

    if [[ "${#firmware_tags_array[*]}" -eq "0" ]]; then
        tolog "02.01.01 Unable to retrieve a list of firmware tags." "1"
    fi

    tolog "02.02 Search for tags containing the keyword..."

    # Search for tags containing the keyword
    for i in "${firmware_tags_array[@]}"; do
        if [[ "${i}" == *"${releases_tag_keywords}"* ]]; then
            firmware_releases_tag="${i}"
            break
        fi
    done

    if [[ -n "${firmware_releases_tag}" ]]; then
        tolog "02.02.01 Tags: ${firmware_releases_tag}"
        sleep 2
    else
        tolog "02.02.01 No matching tags found." "1"
    fi

    tolog "02.03 Start searching for firmware download links..."

    # Retrieve the HTML code of the tags list page
    html_code="$(
        curl -fsSL -m 10 \
            https://github.com/${server_firmware_url}/releases/expanded_assets/${firmware_releases_tag}
    )"

    # Set the regular expression for the OpenWrt filename
    op_file_pattern=".*_${BOARD}_.*k${main_line_version}\.[0-9]+.*${firmware_suffix}"
    # Find the <li> list item where the OpenWrt file is located
    li_block=$(awk -v pattern="${op_file_pattern}" -v RS='</li>' '$0 ~ pattern { print $0 "</li>"; exit }' <<<"${html_code}")
    [[ -z "${li_block}" ]] && tolog "02.03.01 No matching download links found." "1"

    # Find the OpenWrt filename
    latest_url=$(echo "${li_block}" | grep -oE "/[^\"]*_${BOARD}_.*k${main_line_version}\.[0-9]+[^\"]*${firmware_suffix}" | sort -urV | head -n 1 | xargs basename 2>/dev/null)
    tolog "02.03.02 OpenWrt file: ${latest_url}"

    # Find the date of the latest update
    latest_updated_at=$(echo "${li_block}" | grep -o 'datetime="[^"]*"' | sed 's/datetime="//; s/"//')
    tolog "02.03.03 Latest updated at: ${latest_updated_at}"
    # Format the date for display
    date_display_format="$(echo ${latest_updated_at} | tr 'T' '(' | tr 'Z' ')')"
    [[ -z "${latest_url}" || -z "${latest_updated_at}" ]] && tolog "02.03.04 The download URL or date is invalid." "1"

    # Find the firmware sha256 value
    latest_firmware_sha256="$(echo "${li_block}" | grep -o 'value="sha256:[^"]*' | sed 's/value="sha256://')"
    tolog "02.03.05 OpenWrt sha256: ${latest_firmware_sha256}"

    # Check the firmware update code
    down_check_code="${latest_updated_at}.${main_line_version}"
    op_release_code="${FIRMWARE_DOWNLOAD_PATH}/.luci-app-amlogic/op_release_code"
    if [[ -s "${op_release_code}" ]]; then
        update_check_code="$(cat ${op_release_code} | xargs)"
        if [[ -n "${update_check_code}" && "${update_check_code}" == "${down_check_code}" ]]; then
            tolog "02.04 Already the latest version, no need to update." "1"
        fi
    fi

    # Prompt to update
    if [[ -n "${latest_url}" ]]; then
        tolog '<input type="button" class="cbi-button cbi-button-reload" value="Download" onclick="return b_check_firmware(this, '"'download_${latest_updated_at}@${firmware_releases_tag}/${latest_url}@${latest_firmware_sha256}'"')"/> Latest updated: '${date_display_format}'' "1"
    else
        tolog "02.05 No OpenWrt available, please use another kernel branch." "1"
    fi

    exit 0
}

# 03. Download Openwrt
download_firmware() {
    tolog "03. Start download the Openwrt..."

    # Get the openwrt firmware download path
    if [[ "${download_version}" == "download_"* ]]; then
        tolog "03.01 Start downloading..."
    else
        tolog "03.01 Invalid parameter." "1"
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

    # Find the firmware sha256 value
    releases_firmware_sha256sums="$(echo ${download_version} | awk -F'@' '{print $3}')"

    # Download to OpenWrt file
    firmware_download_name="openwrt_${BOARD}_k${main_line_version}_github${firmware_suffix}"
    curl -fsSL "${latest_url}" -o "${FIRMWARE_DOWNLOAD_PATH}/${firmware_download_name}"
    if [[ "$?" -eq "0" && -s "${FIRMWARE_DOWNLOAD_PATH}/${firmware_download_name}" ]]; then
        tolog "03.02 OpenWrt downloaded successfully."
    else
        tolog "03.02 OpenWrt download failed." "1"
    fi

    # Verify sha256sums if available
    if [[ -n "${releases_firmware_sha256sums}" ]]; then
        tolog "03.03 Perform sha256 checksum verification."

        # If there is a sha256sum file, compare it
        download_firmware_sha256sums="$(sha256sum ${FIRMWARE_DOWNLOAD_PATH}/${firmware_download_name} | awk '{print $1}')"
        if [[ "${releases_firmware_sha256sums}" != "${download_firmware_sha256sums}" ]]; then
            tolog "03.03.01 sha256sum verification mismatched." "1"
        else
            tolog "03.03.02 sha256sum verification succeeded."
        fi
    fi

    sync && sleep 3

    tolog "You can update."

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
