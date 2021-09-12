module("luci.model.cbi.gpsysupgrade.sysupgrade", package.seeall)
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

function check_update()
		needs_update, notice = false, false
		remote_version = luci.sys.exec("echo -n $(curl -s https://op.supes.top/firmware/" ..model.. "/version.txt)")
		updatelogs = luci.sys.exec("curl -s https://op.supes.top/firmware/" ..model.. "/updatelogs.txt")
		remoteformat = luci.sys.exec("date -d $(echo " ..remote_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
		fnotice = luci.sys.exec("echo -n " ..remote_version.. " | sed -n '/\\.$/p'")
		dateyr = luci.sys.exec("echo -n " ..remote_version.. " | awk -F. '{printf $1\".\"$2}'")
		if remoteformat > sysverformat then
			needs_update = true
			if currentTimeStamp > remoteformat or fnotice ~= "" then
				notice = fnotice
			end
		end
end

function to_check()
    if not model or model == "" then model = api.auto_get_model() end
	system_version = get_system_version()
	sysverformat = luci.sys.exec("date -d $(echo " ..system_version.. " | awk -F. '{printf $3\"-\"$1\"-\"$2}') +%s")
	currentTimeStamp = luci.sys.exec("expr $(date -d \"$(date '+%Y-%m-%d %H:%M:%S')\" +%s) - 172800")
	if model == "x86_64" then
		check_update()
		if fs.access("/sys/firmware/efi") then
			download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-x86-64-generic-squashfs-combined-efi.img.gz"
		else
			download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-x86-64-generic-squashfs-combined.img.gz"
		end
    elseif model:match(".*K2P.*") then
		model = "phicomm-k2p"
		check_update()
        download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-ramips-mt7621-phicomm_k2p-squashfs-sysupgrade.bin"
    elseif model:match(".*AC2100.*") then
		model = "redmi-ac2100"
		check_update()
        download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-ramips-mt7621-redmi-ac2100-squashfs-sysupgrade.bin"
    elseif model:match(".*R2S.*") then
		model = "nanopi-r2s"
		check_update()
        download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-rockchip-armv8-nanopi-r2s-squashfs-sysupgrade.img.gz"
    elseif model:match(".*R4S.*") then
		model = "nanopi-r4s"
		check_update()
        download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-rockchip-armv8-nanopi-r4s-squashfs-sysupgrade.img.gz"
    elseif model:match(".*D2.*") then
		model = "newifi-d2"
		check_update()
        download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-ramips-mt7621-newifi-d2-squashfs-sysupgrade.bin"
    elseif model:match(".*XY-C5.*") then
		model = "XY-C5"
		check_update()
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
        download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-ramips-mt7621-xy-c5-squashfs-sysupgrade.bin"
    elseif model:match(".*Mi Router 3 Pro.*") then
		model = "xiaomi-r3p"
		check_update()
		if remoteformat > sysverformat and currentTimeStamp > remoteformat then needs_update = true else needs_update = false end
        download_url = "https://op.supes.top/firmware/" ..model.. "/" ..dateyr.. "-openwrt-ramips-mt7621-xiaomi_mir3p-squashfs-sysupgrade.bin"
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

    return {
        code = 0,
        update = needs_update,
		notice = notice,
        now_version = system_version,
        version = remote_version,
	logs = updatelogs,
        url = download_url
    }
end

function to_download(url)
    if not url or url == "" then
        return {code = 1, error = i18n.translate("Download url is required.")}
    end

    sys.call("/bin/rm -f /tmp/firmware_download.*")

    local tmp_file = util.trim(util.exec("mktemp -u -t firmware_download.XXXXXX"))

    local result = api.exec(api.curl, {api._unpack(api.curl_args), "-o", tmp_file, url}, nil, api.command_timeout) == 0

    if not result then
        api.exec("/bin/rm", {"-f", tmp_file})
        return {
            code = 1,
            error = i18n.translatef("File download failed or timed out: %s", url)
        }
    end

    return {code = 0, file = tmp_file}
end

function to_flash(file,retain)
    if not file or file == "" or not fs.access(file) then
        return {code = 1, error = i18n.translate("Firmware file is required.")}
    end
if not retain or retain == "" then
	local result = api.exec("/sbin/sysupgrade", {file}, nil, api.command_timeout) == 0
else
	local result = api.exec("/sbin/sysupgrade", {retain, file}, nil, api.command_timeout) == 0
end

    if not result or not fs.access(file) then
        return {
            code = 1,
            error = i18n.translatef("System upgrade failed")
        }
    end

    return {code = 0}
end
