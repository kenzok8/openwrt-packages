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
check_option="${1}"
download_version="${2}"
TMP_CHECK_DIR="/tmp/amlogic"
AMLOGIC_SOC_FILE="/etc/flippy-openwrt-release"
AMLOGIC_CONFIG_FILE="/etc/config/amlogic"
START_LOG="${TMP_CHECK_DIR}/amlogic_check_plugin.log"
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
else
    tolog "${AMLOGIC_SOC_FILE} file is missing!" "1"
fi
if [[ -z "${PLATFORM}" || -z "$(echo "${support_platform[@]}" | grep -w "${PLATFORM}")" ]]; then
    tolog "Missing [ PLATFORM ] value in ${AMLOGIC_SOC_FILE} file." "1"
fi

tolog "PLATFORM: [ ${PLATFORM} ]"
sleep 2

# Read and resolve plugin_branch from UCI config.
# Normalise to canonical values: "main" (JS) or "lua".
# Priority: UCI value → auto-detect from system.
plugin_branch="$(uci get amlogic.config.amlogic_plugin_branch 2>/dev/null | tr '[:upper:]' '[:lower:]' | xargs)"

# Normalize aliases (js / javascript / main → "main"; anything else → "lua")
case "${plugin_branch}" in
js | javascript | main)
    plugin_branch="main"
    ;;
lua)
    plugin_branch="lua"
    ;;
*)
    # Empty, unknown, or missing → auto-detect from system
    if [[ -f "/www/luci-static/resources/luci.js" ]]; then
        plugin_branch="main"
    else
        plugin_branch="lua"
    fi
    ;;
esac

# Safety check: "main" requires JS LuCI; fall back when absent
if [[ "${plugin_branch}" == "main" && ! -f "/www/luci-static/resources/luci.js" ]]; then
    plugin_branch="lua"
    tolog "Warning: JS LuCI not found, falling back to lua branch."
fi

# Persist the resolved value back to UCI (covers migration + branch-switch cases)
uci set amlogic.config.amlogic_plugin_branch="${plugin_branch}" 2>/dev/null
uci commit amlogic 2>/dev/null

tolog "Plugin branch: [ ${plugin_branch} ]"
sleep 1
get_plugin_info() {
    package_manager=""
    current_plugin_v=""
    current_plugin_release=""
    if command -v opkg >/dev/null 2>&1; then
        package_manager="ipk"
        # Full version string e.g. "3.1.295-1" or "3.1.295-2"
        local full_v
        full_v="$(opkg list-installed | grep '^luci-app-amlogic ' | awk '{print $3}')"
        current_plugin_v="$(echo "${full_v}" | cut -d'-' -f1)"
        # Strip optional "r" prefix from release (e.g. "r2" -> "2")
        current_plugin_release="$(echo "${full_v}" | cut -d'-' -f2 | sed 's/^r//')"
    elif command -v apk >/dev/null 2>&1; then
        package_manager="apk"
        # Package name e.g. "luci-app-amlogic-3.1.295-r2"
        # Fields: luci(1) app(2) amlogic(3) 3.1.295(4) r2(5)
        local pkg_name
        pkg_name="$(apk list --installed | grep '^luci-app-amlogic-' | awk '{print $1}')"
        current_plugin_v="$(echo "${pkg_name}" | cut -d'-' -f4)"
        # Extract release number: "r2" -> "2"
        current_plugin_release="$(echo "${pkg_name}" | cut -d'-' -f5 | sed 's/^r//')"
    fi
}

# Step 2: Check if there is the latest plugin version
check_plugin() {
    tolog "01. Query current version information."
    get_plugin_info
    if [[ -z "${package_manager}" || -z "${current_plugin_v}" ]]; then
        tolog "01.01 Plugin 'luci-app-amlogic' not found or package manager unknown." "1"
    else
        tolog "01.01 Using [${package_manager}]. Current version: ${current_plugin_v}, Release: ${current_plugin_release:-unknown}"
    fi
    sleep 2

    tolog "02. Start querying plugin version..."
    if [[ "${plugin_branch}" == "main" ]]; then
        # JS branch: match tags ending with -js (e.g. 3.1.305-js)
        latest_version="$(
            curl -fsSL -m 10 \
                https://github.com/ophub/luci-app-amlogic/releases |
                grep -oE 'expanded_assets/[0-9]+\.[0-9]+\.[0-9]+-js' | sed 's|expanded_assets/||g' |
                sort -urV | head -n 1
        )"
    else
        # Lua branch: match tags with digits only, no suffix (e.g. 3.1.305)
        latest_version="$(
            curl -fsSL -m 10 \
                https://github.com/ophub/luci-app-amlogic/releases |
                grep -oE 'expanded_assets/[0-9]+\.[0-9]+\.[0-9]+' | sed 's|expanded_assets/||g' |
                grep -v -- '-' |
                sort -urV | head -n 1
        )"
    fi
    if [[ -z "${latest_version}" ]]; then
        tolog "02.01 Query failed, please try again." "1"
    fi

    tolog "02.01 Current version: ${current_plugin_v}, Latest version: ${latest_version}"
    sleep 2

    # Strip variant suffix (e.g. "-lua") from latest_version to get the numeric part.
    latest_version_base="${latest_version%%-*}"

    # Determine target PKG_RELEASE for the selected branch:
    #   main branch -> release 2 (tag: 3.x.xxx-js)
    #   lua branch  -> release 1 (tag: 3.x.xxx, no suffix)
    if [[ "${plugin_branch}" == "main" ]]; then
        target_release="2"
    else
        target_release="1"
    fi

    # Only report "already latest" when BOTH the version number AND the installed
    # branch (PKG_RELEASE) match the selected branch. If the user switched branches
    # (same version number but different release), we still offer an update.
    if [[ "${current_plugin_v}" == "${latest_version_base}" && "${current_plugin_release}" == "${target_release}" ]]; then
        tolog "02.02 Already the latest version, no need to update." "1"
    else
        tolog '<input type="button" class="cbi-button cbi-button-reload" value="Download" onclick="return b_check_plugin(this, '"'download_${latest_version}'"')"/> Latest version: '${latest_version}'' "1"
    fi

    exit 0
}

# Step 3: Download the latest plugin version
download_plugin() {
    tolog "03. Start downloading the plugin file."
    if [[ "${download_version}" == "download_"* ]]; then
        tolog "03.01 Start downloading..."
    else
        tolog "03.01 Invalid parameter." "1"
    fi

    # Extract version from parameter (e.g. "download_3.1.290" -> "3.1.290")
    latest_version="$(echo "${download_version}" | cut -d '_' -f2-)"

    get_plugin_info
    if [[ -z "${package_manager}" ]]; then
        tolog "03.02 Package manager not found." "1"
    fi

    tolog "03.02 Package manager: ${package_manager}, Version to download: ${latest_version}"

    # Clean up previous downloads
    rm -f ${TMP_CHECK_DIR}/*.ipk 2>/dev/null
    rm -f ${TMP_CHECK_DIR}/*.apk 2>/dev/null
    rm -f ${TMP_CHECK_DIR}/sha256sums 2>/dev/null
    sync

    download_repo="https://github.com/ophub/luci-app-amlogic/releases/download"

    # Use GitHub API to find exact filenames
    if ! command -v jq >/dev/null 2>&1; then
        tolog "03.03 jq not found, cannot query GitHub API." "1"
    fi

    tolog "03.03 Querying GitHub API for release assets..."
    api_url="https://api.github.com/repos/ophub/luci-app-amlogic/releases/tags/${latest_version}"
    asset_list="$(curl -fsSL -m 15 "${api_url}" | jq -r '.assets[].name' | xargs)"
    if [[ -z "${asset_list}" ]]; then
        tolog "03.03 Failed to fetch release assets from GitHub API." "1"
    fi

    plugin_file_name="$(echo "${asset_list}" | tr ' ' '\n' | grep -oE "^luci-app-amlogic.*${package_manager}$" | head -n 1)"
    lang_file_list=($(echo "${asset_list}" | tr ' ' '\n' | grep -oE "^luci-i18n-amlogic.*${package_manager}$"))

    if [[ -z "${plugin_file_name}" ]]; then
        tolog "03.04 Could not find plugin file (.${package_manager}) in release assets." "1"
    fi

    tolog "03.04 Plugin file: ${plugin_file_name}"

    # Download the main plugin file
    plugin_full_url="${download_repo}/${latest_version}/${plugin_file_name}"
    tolog "03.05 Downloading main plugin..."
    curl -fsSL "${plugin_full_url}" -o "${TMP_CHECK_DIR}/${plugin_file_name}"
    [[ "${?}" -ne "0" ]] && tolog "03.05 Plugin [ ${plugin_file_name} ] download failed." "1"

    # Download language packs
    for langfile in "${lang_file_list[@]}"; do
        lang_full_url="${download_repo}/${latest_version}/${langfile}"
        tolog "03.06 Downloading language pack [ ${langfile} ]..."
        curl -fsSL "${lang_full_url}" -o "${TMP_CHECK_DIR}/${langfile}"
        [[ "${?}" -ne "0" ]] && tolog "03.06 Language pack [ ${langfile} ] download failed." "1"
    done

    # The .apk filename uses tilde (~) instead of dot before the hash suffix
    for file in ${TMP_CHECK_DIR}/*.apk; do
        [[ -f "${file}" ]] || continue
        base_name="$(basename "${file}")"
        new_name="$(echo "${base_name}" | sed -E 's/\.([a-f0-9]{7}\.apk)/~\1/')"
        if [[ "${base_name}" != "${new_name}" ]]; then
            mv -f "${file}" "${TMP_CHECK_DIR}/${new_name}" || true
        fi
    done

    sync && sleep 2

    tolog "03.07 The plugin is ready, you can update."
    sleep 2

    tolog '<input type="button" class="cbi-button cbi-button-reload" value="Update" onclick="return amlogic_plugin(this)"/> Latest version: '${latest_version}'' "1"

    exit 0
}

getopts 'cd' opts
case "${opts}" in
c | check)
    check_plugin
    ;;
* | download)
    download_plugin
    ;;
esac
