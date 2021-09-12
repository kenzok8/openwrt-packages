#!/usr/bin/lua

local fs = require "nixio.fs"
local sys = require "luci.sys"
local util = require "luci.util"
local i18n = require "luci.i18n"
local ipkg = require("luci.model.ipkg")
local api = require "luci.model.cbi.gpsysupgrade.api"

function get_system_version()
	local system_version = luci.sys.exec("[ -f '/etc/openwrt_version' ] && echo -n `cat /etc/openwrt_version`")
    return system_version
end

function to_flash(url)
    if not url or url == "" then
        return {code = 1, error = i18n.translate("Download url is required.")}
    end

    sys.call("/bin/rm -f /tmp/firmware_download.*")

    local tmp_file = util.trim(util.exec("mktemp -u -t firmware_download.XXXXXX"))

    local result = api.exec(api.wget, {api._unpack(api.wget_args), "-O", tmp_file, url}, nil, api.command_timeout) == 0

    if not result then
        api.exec("/bin/rm", {"-f", tmp_file})
        return {
            code = 1,
            error = i18n.translatef("File download failed or timed out: %s", url)
        }
    end

	file = tmp_file

    if not file or file == "" or not fs.access(file) then
        return {code = 1, error = i18n.translate("Firmware file is required.")}
    end

	local result = api.exec("/sbin/sysupgrade", {"-k", file}, nil, api.command_timeout) == 0


    if not result or not fs.access(file) then
        return {
            code = 1,
            error = i18n.translatef("System upgrade failed")
        }
    end

    return {code = 0}
end


    if not model or model == "" then model = api.auto_get_model() end
    
    local download_url,remote_version,needs_update,remoteformat,sysverformat,currentTimeStamp,dateyr
	local version_file = "/tmp/version.txt"
	system_version = get_system_version()
	sysverformat = luci.sys.exec("date -d $(echo " ..system_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
	currentTimeStamp = luci.sys.exec("expr $(date -d \"$(date '+%Y-%m-%d %H:%M:%S')\" +%s) - 259200")
	if model == "x86_64" then
		api.exec(api.wget, {api._unpack(api.wget_args), "-O", version_file, "https://op.supes.top/firmware/x86_64/version.txt"}, nil, api.command_timeout)
		remote_version = luci.sys.exec("[ -f '" ..version_file.. "' ] && echo -n `cat " ..version_file.. "`")
		dateyr = luci.sys.exec("echo " ..remote_version.. " | awk -F. '{printf $1\".\"$2}'")
		remoteformat = luci.sys.exec("date -d $(echo " ..remote_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
		if fs.access("/sys/firmware/efi") then
			download_url = "https://op.supes.top/firmware/x86_64/" ..dateyr.. "-openwrt-x86-64-generic-squashfs-combined-efi.img.gz"
		else
			download_url = "https://op.supes.top/firmware/x86_64/" ..dateyr.. "-openwrt-x86-64-generic-squashfs-combined.img.gz"
		end
    elseif model:match(".*K2P.*") then
		api.exec(api.wget, {api._unpack(api.wget_args), "-O", version_file, "https://op.supes.top/firmware/phicomm-k2p/version.txt"}, nil, api.command_timeout)
		remote_version = luci.sys.exec("[ -f '" ..version_file.. "' ] && echo -n `cat " ..version_file.. "`")
		dateyr = luci.sys.exec("echo " ..remote_version.. " | awk -F. '{printf $1\".\"$2}'")
		remoteformat = luci.sys.exec("date -d $(echo " ..remote_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
        download_url = "https://op.supes.top/firmware/phicomm-k2p/" ..dateyr.. "-openwrt-ramips-mt7621-phicomm_k2p-squashfs-sysupgrade.bin"
    elseif model:match(".*AC2100.*") then
		api.exec(api.wget, {api._unpack(api.wget_args), "-O", version_file, "https://op.supes.top/firmware/redmi-ac2100/version.txt"}, nil, api.command_timeout)
		remote_version = luci.sys.exec("[ -f '" ..version_file.. "' ] && echo -n `cat " ..version_file.. "`")
		dateyr = luci.sys.exec("echo " ..remote_version.. " | awk -F. '{printf $1\".\"$2}'")
		remoteformat = luci.sys.exec("date -d $(echo " ..remote_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
        download_url = "https://op.supes.top/firmware/redmi-ac2100/" ..dateyr.. "-openwrt-ramips-mt7621-redmi-ac2100-squashfs-sysupgrade.bin"
    elseif model:match(".*R2S.*") then
		api.exec(api.wget, {api._unpack(api.wget_args), "-O", version_file, "https://op.supes.top/firmware/nanopi-r2s/version.txt"}, nil, api.command_timeout)
		remote_version = luci.sys.exec("[ -f '" ..version_file.. "' ] && echo -n `cat " ..version_file.. "`")
		dateyr = luci.sys.exec("echo " ..remote_version.. " | awk -F. '{printf $1\".\"$2}'")
		remoteformat = luci.sys.exec("date -d $(echo " ..remote_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
        download_url = "https://op.supes.top/firmware/nanopi-r2s/" ..dateyr.. "-openwrt-rockchip-armv8-nanopi-r2s-squashfs-sysupgrade.img.gz"
    elseif model:match(".*HC5962.*") then
		api.exec(api.wget, {api._unpack(api.wget_args), "-O", version_file, "https://op.supes.top/firmware/hiwifi-hc5962/version.txt"}, nil, api.command_timeout)
		remote_version = luci.sys.exec("[ -f '" ..version_file.. "' ] && echo -n `cat " ..version_file.. "`")
		dateyr = luci.sys.exec("echo " ..remote_version.. " | awk -F. '{printf $1\".\"$2}'")
		remoteformat = luci.sys.exec("date -d $(echo " ..remote_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
        download_url = "https://op.supes.top/firmware/hiwifi-hc5962/" ..dateyr.. "-openwrt-ramips-mt7621-hiwifi_hc5962-squashfs-sysupgrade.bin"
    elseif model:match(".*D2") then
		api.exec(api.wget, {api._unpack(api.wget_args), "-O", version_file, "https://op.supes.top/firmware/newifi-d2/version.txt"}, nil, api.command_timeout)
		remote_version = luci.sys.exec("[ -f '" ..version_file.. "' ] && echo -n `cat " ..version_file.. "`")
		dateyr = luci.sys.exec("echo " ..remote_version.. " | awk -F. '{printf $1\".\"$2}'")
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
        download_url = "https://op.supes.top/firmware/newifi-d2/" ..dateyr.. "-openwrt-ramips-mt7621-newifi-d2-squashfs-sysupgrade.bin"
    elseif model:match(".*XIAOYU") then
		api.exec(api.wget, {api._unpack(api.wget_args), "-O", version_file, "https://op.supes.top/firmware/XY-C5/version.txt"}, nil, api.command_timeout)
		remote_version = luci.sys.exec("[ -f '" ..version_file.. "' ] && echo -n `cat " ..version_file.. "`")
		dateyr = luci.sys.exec("echo " ..remote_version.. " | awk -F. '{printf $1\".\"$2}'")
		remoteformat = luci.sys.exec("date -d $(echo " ..remote_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
        download_url = "https://op.supes.top/firmware/XY-C5/" ..dateyr.. "-openwrt-ramips-mt7621-xiaoyu_xy-c5-squashfs-sysupgrade.bin"
	else
		local needs_update = false
		return {
            code = 1,
            error = i18n.translate("Can't determine MODEL, or MODEL not supported.")
			}
	end
	

    if needs_update and not download_url then
        return {
            code = 1,
            now_version = system_version,
            version = remote_version,
            error = i18n.translate(
                "New version found, but failed to get new version download url.")
        }
    end

		to_flash(download_url)
