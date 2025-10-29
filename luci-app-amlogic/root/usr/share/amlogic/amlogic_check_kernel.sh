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
KERNEL_DOWNLOAD_PATH="/mnt/${EMMC_NAME}${PARTITION_NAME}4"

# Check release file
if [[ -s "${AMLOGIC_SOC_FILE}" ]]; then
    source "${AMLOGIC_SOC_FILE}" 2>/dev/null
    PLATFORM="${PLATFORM}"
else
    tolog "${AMLOGIC_SOC_FILE} file is missing!" "1"
fi
if [[ -z "${PLATFORM}" || -z "$(echo "${support_platform[@]}" | grep -w "${PLATFORM}")" ]]; then
    tolog "Missing [ PLATFORM ] value in ${AMLOGIC_SOC_FILE} file." "1"
fi

tolog "PLATFORM: [ ${PLATFORM} ], Use in [ ${EMMC_NAME} ]"
sleep 2

# Step 1. Set the kernel query api
tolog "01. Start checking the kernel repository."
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
kernel_api="https://github.com/${kernel_repo}"
tolog "01.03 Kernel repo: ${kernel_repo}"
# Get the current kernel uname
kernel_uname="$(uname -r 2>/dev/null)"
tolog "01.04 Current kernel uname: ${kernel_uname}"

# Get the kernel tag from uci config
op_kernel_tags="$(uci get amlogic.config.amlogic_kernel_tags 2>/dev/null)"
# Determine the kernel tag
if [[ -n "${op_kernel_tags}" ]]; then
    kernel_tag="${op_kernel_tags/kernel_/}"
else
    # Determine the kernel tag based on the current kernel uname
    if [[ "${kernel_uname}" =~ -rk3588 ]]; then
        kernel_tag="rk3588"
    elif [[ "${kernel_uname}" =~ -rk35xx ]]; then
        kernel_tag="rk35xx"
    elif [[ "${kernel_uname}" =~ -h6|-zicai ]]; then
        kernel_tag="h6"
    else
        kernel_tag="stable"
    fi

    # Save the kernel tag to uci config
    uci set amlogic.config.amlogic_kernel_tags="kernel_${kernel_tag}" 2>/dev/null
    uci commit amlogic 2>/dev/null
fi
tolog "01.05 Kernel tag: kernel_${kernel_tag}"
sleep 2

# Step 2: Check if there is the latest kernel version
check_kernel() {
    # 02. Query local version information
    tolog "02. Start checking the kernel version."

    # 02.01 Get current kernel version
    [[ ! "${kernel_tag}" =~ ^(rk3588|rk35xx)$ ]] && kernel_uname="$(echo "${kernel_uname}" | cut -d'-' -f1)"
    [[ -n "${kernel_uname}" ]] || tolog "02.01 The current kernel version is not detected." "1"
    tolog "02.01 current version: ${kernel_uname}"
    sleep 2

    # 02.02 Version comparison
    main_line_version="$(echo ${kernel_uname} | awk -F '.' '{print $1"."$2}')"

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
        curl -fsSL -m 10 \
            ${kernel_api}/releases/expanded_assets/kernel_${kernel_tag} |
            grep -oE "${main_line_version}\.[0-9]+[^\"]*\.tar\.gz" | sed 's/.tar.gz//' |
            sort -urV | head -n 1
    )"
    [[ -n "${latest_version}" ]] || tolog "02.03 No kernel available, please use another kernel branch." "1"

    tolog "02.04 current version: ${kernel_uname}, Latest version: ${latest_version}"
    sleep 2

    # Get the sha256 value of the latest version
    latest_kernel_sha256="$(
        curl -fsSL -m 10 \
            ${kernel_api}/releases/expanded_assets/kernel_${kernel_tag} |
            awk -v pattern="${latest_version}\.tar\.gz" -v RS='</li>' '$0 ~ pattern { print $0 "</li>"; exit }' |
            grep -o 'value="sha256:[^"]*' | sed 's/value="sha256://'
    )"
    [[ -n "${latest_kernel_sha256}" ]] && tolog "02.05 Kernel sha256: ${latest_kernel_sha256}"

    if [[ "${latest_version}" == "${kernel_uname}" ]]; then
        tolog "02.06 Already the latest version, no need to update." "1"
        sleep 2
    else
        tolog '<input type="button" class="cbi-button cbi-button-reload" value="Download" onclick="return b_check_kernel(this, '"'download_${latest_version}_${latest_kernel_sha256}'"')"/> Latest version: '${latest_version}'' "1"
    fi

    exit 0
}

# Step 3: Download the latest kernel version
download_kernel() {
    tolog "03. Start download the kernel file."
    if [[ "${download_version}" == "download_"* ]]; then
        tolog "03.01 Start downloading..."
    else
        tolog "03.01 Invalid parameter" "1"
    fi

    # Get the kernel file name
    kernel_file_name="$(echo "${download_version}" | cut -d '_' -f2)"
    # Restore converted characters in file names(%2B to +)
    kernel_file_name="${kernel_file_name//%2B/+}"
    # Get the sha256 value
    kernel_file_sha256="$(echo "${download_version}" | cut -d '_' -f3)"

    # Delete other residual kernel files
    rm -f ${KERNEL_DOWNLOAD_PATH}/*.tar.gz
    rm -f ${KERNEL_DOWNLOAD_PATH}/sha256sums
    rm -rf ${KERNEL_DOWNLOAD_PATH}/${kernel_file_name}*

    kernel_down_from="https://github.com/${kernel_repo}/releases/download/kernel_${kernel_tag}/${kernel_file_name}.tar.gz"

    curl -fsSL "${kernel_down_from}" -o ${KERNEL_DOWNLOAD_PATH}/${kernel_file_name}.tar.gz
    [[ "${?}" -ne "0" ]] && tolog "03.02 The kernel download failed." "1"

    # Verify sha256
    if [[ -n "${kernel_file_sha256}" ]]; then
        tolog "03.03 Perform sha256 checksum verification."

        download_kernel_sha256sums="$(sha256sum ${KERNEL_DOWNLOAD_PATH}/${kernel_file_name}.tar.gz | awk '{print $1}')"
        if [[ "${kernel_file_sha256}" != "${download_kernel_sha256sums}" ]]; then
            tolog "03.03.01 sha256sum verification mismatched." "1"
        else
            tolog "03.03.02 sha256sum verification succeeded."
        fi
    fi

    # Decompress the kernel package
    tolog "03.04 Start decompressing the kernel package..."
    tar -xf ${KERNEL_DOWNLOAD_PATH}/${kernel_file_name}.tar.gz -C ${KERNEL_DOWNLOAD_PATH}
    [[ "${?}" -ne "0" ]] && tolog "03.05 Kernel decompression failed." "1"
    mv -f ${KERNEL_DOWNLOAD_PATH}/${kernel_file_name}/* ${KERNEL_DOWNLOAD_PATH}/

    sync && sleep 3
    # Delete the downloaded kernel file
    rm -f ${KERNEL_DOWNLOAD_PATH}/${kernel_file_name}.tar.gz
    rm -rf ${KERNEL_DOWNLOAD_PATH}/${kernel_file_name}

    tolog "03.06 The kernel is ready, you can update."
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
