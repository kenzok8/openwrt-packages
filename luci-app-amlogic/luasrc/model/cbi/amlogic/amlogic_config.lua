--Remove the spaces in the string
function trim(str)
	--return (string.gsub(str, "^%s*(.-)%s*$", "%1"))
	return (string.gsub(str, "%s+", ""))
end

--Auto-complete node
local check_config_amlogic = luci.sys.exec("uci get amlogic.@amlogic[0].amlogic_firmware_repo 2>/dev/null") or ""
if (trim(check_config_amlogic) == "") then
	luci.sys.exec("uci delete amlogic.@amlogic[0] 2>/dev/null")
	luci.sys.exec("uci set amlogic.config='amlogic' 2>/dev/null")
	luci.sys.exec("uci commit amlogic 2>/dev/null")
end

b = Map("amlogic")
b.title = translate("Plugin Settings")
local des_content = translate("You can customize the github.com download repository of OpenWrt files and kernels in [Online Download Update].")
local des_content = des_content .. "<br />" .. translate("Tip: The same files as the current OpenWrt system's BOARD (such as rock5b) and kernel (such as 5.10) will be downloaded.")
b.description = des_content

o = b:section(NamedSection, "config", "amlogic")
o.anonymouse = true

--1.Set OpenWrt Firmware Repository
mydevice = o:option(DummyValue, "mydevice", translate("Current Device:"))
mydevice.description = translate("If the current device shows (Unknown device), please report to github.")
mydevice_platfrom = trim(luci.sys.exec("cat /etc/flippy-openwrt-release 2>/dev/null | grep PLATFORM | awk -F'=' '{print $2}' | grep -oE '(amlogic|rockchip|allwinner|qemu)'")) or "Unknown"
mydevice.default = "PLATFORM: " .. mydevice_platfrom
mydevice.rmempty = false

--2.Set OpenWrt Firmware Repository
firmware_repo = o:option(Value, "amlogic_firmware_repo", translate("Download repository of OpenWrt:"))
firmware_repo.description = translate("Set the download repository of the OpenWrt files on github.com in [Online Download Update].")
firmware_repo.default = "https://github.com/breakings/OpenWrt"
firmware_repo.rmempty = false

--3.Set OpenWrt Releases's Tag Keywords
firmware_tag = o:option(Value, "amlogic_firmware_tag", translate("Keywords of Tags in Releases:"))
firmware_tag.description = translate("Set the keywords of Tags in Releases of github.com in [Online Download Update].")
firmware_tag.default = "ARMv8"
firmware_tag.rmempty = false

--4.Set OpenWrt Firmware Suffix
firmware_suffix = o:option(Value, "amlogic_firmware_suffix", translate("Suffix of OpenWrt files:"))
firmware_suffix.description = translate("Set the suffix of the OpenWrt in Releases of github.com in [Online Download Update].")
firmware_suffix:value(".7z", translate(".7z"))
firmware_suffix:value(".zip", translate(".zip"))
firmware_suffix:value(".img.gz", translate(".img.gz"))
firmware_suffix:value(".img.xz", translate(".img.xz"))
firmware_suffix.default = ".img.gz"
firmware_suffix.rmempty = false

--5.Set OpenWrt Kernel DownLoad Path
kernel_path = o:option(Value, "amlogic_kernel_path", translate("Download path of OpenWrt kernel:"))
kernel_path.description = translate("Set the download path of the kernel in the github.com repository in [Online Download Update].")
kernel_path.default = "opt/kernel"
kernel_path.rmempty = false

--6.Set kernel version branch
kernel_branch = o:option(Value, "amlogic_kernel_branch", translate("Set version branch:"))
kernel_branch.description = translate("Set the version branch of the openwrt firmware and kernel selected in [Online Download Update].")
kernel_branch:value("5.4", translate("5.4"))
kernel_branch:value("5.10", translate("5.10"))
kernel_branch:value("5.15", translate("5.15"))
kernel_branch:value("6.0", translate("6.0"))
kernel_branch:value("6.1", translate("6.1"))
kernel_branch:value("6.2", translate("6.2"))
local default_kernel_branch = luci.sys.exec("ls /lib/modules/ 2>/dev/null | grep -oE '^[1-9].[0-9]{1,3}'")
kernel_branch.default = trim(default_kernel_branch)
kernel_branch.rmempty = false

--7.Restore configuration
firmware_config = o:option(Flag, "amlogic_firmware_config", translate("Keep config update:"))
firmware_config.description = translate("Set whether to keep the current config during [Online Download Update] and [Manually Upload Update].")
firmware_config.default = "1"
firmware_config.rmempty = false

--8.Write bootloader
write_bootloader = o:option(Flag, "amlogic_write_bootloader", translate("Auto write bootloader:"))
write_bootloader.description = translate("[Recommended choice] Set whether to auto write bootloader during install and update OpenWrt.")
write_bootloader.default = "0"
write_bootloader.rmempty = false

--9.Set the file system type of the shared partition
shared_fstype = o:option(ListValue, "amlogic_shared_fstype", translate("Set the file system type:"))
shared_fstype.description = translate("[Default ext4] Set the file system type of the shared partition (/mnt/mmcblk*p4) when install OpenWrt.")
shared_fstype:value("ext4", translate("ext4"))
shared_fstype:value("f2fs", translate("f2fs"))
shared_fstype:value("btrfs", translate("btrfs"))
shared_fstype:value("xfs", translate("xfs"))
shared_fstype.default = "ext4"
shared_fstype.rmempty = false

return b
