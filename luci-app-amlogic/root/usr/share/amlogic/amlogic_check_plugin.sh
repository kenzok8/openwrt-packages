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

tolog "PLATFORM: [ ${PLATFORM} ], SOC: [ ${SOC} ]"
sleep 2

# 01. Query local version information
tolog "01. Query current version information."

# If neither opkg nor apk found, set package_manager to empty
package_manager=""
current_plugin_v=""

if command -v opkg >/dev/null 2>&1; then
    # System has opkg
    package_manager="opkg"
    # Important: Add cut to handle versions like X.Y.Z-r1, ensuring consistent output
    current_plugin_v="$(opkg list-installed | grep '^luci-app-amlogic' | awk '{print $3}' | cut -d'-' -f1)"
elif command -v apk >/dev/null 2>&1; then
    # System has apk
    package_manager="apk"
    current_plugin_v="$(apk list --installed | grep '^luci-app-amlogic' | awk '{print $1}' | cut -d'-' -f4)"
fi

# Check if we successfully found the plugin
if [[ -z "${package_manager}" || -z "${current_plugin_v}" ]]; then
    tolog "01.01 Plugin 'luci-app-amlogic' not found or package manager unknown." "1"
else
    tolog "01.01 Using [${package_manager}]. Current version: ${current_plugin_v}"
fi
sleep 2

# 02. Check the version on the server
tolog "02. Start querying plugin version..."

# Get the latest version
latest_version="$(
    curl -fsSL -m 10 \
        https://github.com/ophub/luci-app-amlogic/releases |
        grep -oE 'expanded_assets/[0-9]+.[0-9]+.[0-9]+(-[0-9]+)?' | sed 's|expanded_assets/||g' |
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
    tolog "02.03 New version found. Preparing to download for [${package_manager}]..."
    download_repo="https://github.com/ophub/luci-app-amlogic/releases/download"

    # Intelligent File Discovery
    plugin_file_name=""
    lang_file_name=""

    # Method 1: Use GitHub API if 'jq' is installed (Preferred Method)
    if command -v jq >/dev/null 2>&1; then
        tolog "Using GitHub API with jq to find package files."
        api_url="https://api.github.com/repos/ophub/luci-app-amlogic/releases/tags/${latest_version}"

        # Fetch all asset names from the API
        asset_list="$(curl -fsSL -m 15 "${api_url}" | jq -r '.assets[].name' | xargs)"

        if [[ -n "${asset_list}" ]]; then
            # Discover exact filenames using regular expressions from the asset list
            plugin_file_name="$(echo "${asset_list}" | tr ' ' '\n' | grep -oE "^luci-app-amlogic.*${package_manager}$" | head -n 1)"
            lang_file_name="$(echo "${asset_list}" | tr ' ' '\n' | grep -oE "^luci-i18n-amlogic-zh-cn.*${package_manager}$" | head -n 1)"
        else
            tolog "Warning: Failed to fetch data from GitHub API." "1"
        fi
    else
        tolog "jq not found, Aborting." "1"
    fi

    # Validation and Download
    if [[ -z "${plugin_file_name}" || -z "${lang_file_name}" ]]; then
        tolog "02.03.2 Could not discover plugin(.${package_manager}) in the release. Aborting." "1"
    fi

    tolog "Found plugin file: ${plugin_file_name}"
    tolog "Found language file: ${lang_file_name}"

    plugin_full_url="${download_repo}/${latest_version}/${plugin_file_name}"
    lang_full_url="${download_repo}/${latest_version}/${lang_file_name}"

    # Download the language pack
    tolog "02.04 Downloading language pack..."
    curl -fsSL "${lang_full_url}" -o "${TMP_CHECK_DIR}/${lang_file_name}"
    if [[ "${?}" -ne "0" ]]; then
        tolog "02.04 Language pack download failed." "1"
    fi

    # Download the main plugin file
    tolog "02.05 Downloading main plugin..."
    curl -fsSL "${plugin_full_url}" -o "${TMP_CHECK_DIR}/${plugin_file_name}"
    if [[ "${?}" -ne "0" ]]; then
        tolog "02.05 Plugin download failed." "1"
    fi

    sync && sleep 2
fi

tolog "03. The plug is ready, you can update."
sleep 2

#echo '<a href=upload>Update</a>' >$START_LOG
tolog '<input type="button" class="cbi-button cbi-button-reload" value="Update" onclick="return amlogic_plugin(this)"/> Latest version: '${latest_version}'' "1"

exit 0
