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
mydevice.description = translate("Display the PLATFORM classification of the device.")
mydevice_platfrom = trim(luci.sys.exec("cat /etc/flippy-openwrt-release 2>/dev/null | grep PLATFORM | awk -F'=' '{print $2}' | grep -oE '(amlogic|rockchip|allwinner|qemu)'")) or "Unknown"
mydevice.default = "PLATFORM: " .. mydevice_platfrom
mydevice.rmempty = false

--2.Set OpenWrt Firmware Repository
firmware_repo = o:option(Value, "amlogic_firmware_repo", translate("OpenWrt download repository:"))
firmware_repo.description = translate("Set the OpenWrt files download repository on github.com in [Online Download Update].")
firmware_repo.default = "https://github.com/breakingbadboy/OpenWrt"
firmware_repo.rmempty = false

--3.Set OpenWrt Releases's Tag Keywords
firmware_tag = o:option(Value, "amlogic_firmware_tag", translate("OpenWrt download tags keyword:"))
firmware_tag.description = translate("Set the OpenWrt files download tags keyword for github.com in [Online Download Update].")
firmware_tag.default = "ARMv8"
firmware_tag.rmempty = false

--4.Set OpenWrt Firmware Suffix
firmware_suffix = o:option(Value, "amlogic_firmware_suffix", translate("OpenWrt files suffix:"))
firmware_suffix.description = translate("Set the OpenWrt files download suffix for github.com in [Online Download Update].")
firmware_suffix:value(".7z", translate(".7z"))
firmware_suffix:value(".zip", translate(".zip"))
firmware_suffix:value(".img.gz", translate(".img.gz"))
firmware_suffix:value(".img.xz", translate(".img.xz"))
firmware_suffix.default = ".img.gz"
firmware_suffix.rmempty = false

--5.Set OpenWrt Kernel DownLoad Path
kernel_path = o:option(Value, "amlogic_kernel_path", translate("Kernel download repository:"))
kernel_path.description = translate("Set the kernel files download repository on github.com in [Online Download Update].")
kernel_path:value("https://github.com/breakingbadboy/OpenWrt")
kernel_path:value("https://github.com/ophub/kernel")
kernel_path.default = "https://github.com/breakingbadboy/OpenWrt"
kernel_path.rmempty = false

--6. Set OpenWrt Kernel Tags
-- Read the currently SAVED value of the kernel path.
local current_kernel_path = trim(luci.sys.exec("uci get amlogic.@amlogic[0].amlogic_kernel_path 2>/dev/null") or "")
-- If it's not set yet, use its default value for the logic below.
if current_kernel_path == "" then
    current_kernel_path = kernel_path.default
end
-- Define the tag lists.
-- The base list, available for all repositories.
local known_tags = {
    kernel_rk3588 = "kernel_rk3588 [Rockchip RK3588 Kernel]",
    kernel_rk35xx = "kernel_rk35xx [Rockchip RK35xx Kernel]",
    kernel_stable = "kernel_stable [Mainline Stable Kernel]",
}
-- Additional tags only available for the 'ophub/kernel' repository.
local ophub_extra_tags = {
    kernel_flippy = "kernel_flippy [Mainline Stable Kernel by Flippy]",
    kernel_h6 = "kernel_h6 [Allwinner H6 Kernel]",
    kernel_beta = "kernel_beta [Beta Kernel]",
}
-- Conditionally add the extra tags to the list.
if (string.find(current_kernel_path, "ophub/kernel")) then
    for value, display_name in pairs(ophub_extra_tags) do
        known_tags[value] = display_name
    end
end
-- Determine the default kernel tag based on existing config or system info.
local kernel_tagsname
local existing_tag = trim(luci.sys.exec("uci get amlogic.@amlogic[0].amlogic_kernel_tags 2>/dev/null") or "")
if existing_tag ~= "" then
    kernel_tagsname = existing_tag
else
    local kernel_release_info = trim(luci.sys.exec("uname -r 2>/dev/null")) or ""

    if (string.find(kernel_release_info, "-rk3588")) then
        kernel_tagsname = "kernel_rk3588"
    elseif (string.find(kernel_release_info, "-rk35xx")) then
        kernel_tagsname = "kernel_rk35xx"
    elseif (string.find(kernel_release_info, "-h6") or string.find(kernel_release_info, "-zicai")) then
        kernel_tagsname = "kernel_h6"
    else
        kernel_tagsname = "kernel_stable"
    end
end
-- Create the kernel tags option.
kernel_tags = o:option(Value, "amlogic_kernel_tags", translate("Kernel download tags:"))
kernel_tags.description = translate("Set the kernel files download tags on github.com in [Online Download Update].")
-- Populate the dropdown with the known tags.
for value, display_name in pairs(known_tags) do
    kernel_tags:value(value, translate(display_name))
end
-- Ensure the default tag is included in the options.
if not known_tags[kernel_tagsname] then
    kernel_tags:value(kernel_tagsname, kernel_tagsname)
end
-- Set the default and other properties.
kernel_tags.default = kernel_tagsname
kernel_tags.rmempty = false

--7.Set kernel version branch
kernel_branch = o:option(Value, "amlogic_kernel_branch", translate("Set version branch:"))
kernel_branch.description = translate("Set the version branch of the OpenWrt files and kernel selected in [Online Download Update].")
kernel_branch:value("5.4", translate("5.4"))
kernel_branch:value("5.10", translate("5.10"))
kernel_branch:value("5.15", translate("5.15"))
kernel_branch:value("6.1", translate("6.1"))
kernel_branch:value("6.6", translate("6.6"))
kernel_branch:value("6.12", translate("6.12"))
kernel_branch:value("6.18", translate("6.18"))
local default_kernel_branch = luci.sys.exec("uname -r | grep -oE '^[1-9].[0-9]{1,3}'")
kernel_branch.default = trim(default_kernel_branch)
kernel_branch.rmempty = false

--8.Restore configuration
firmware_config = o:option(Flag, "amlogic_firmware_config", translate("Keep config update:"))
firmware_config.description = translate("Set whether to keep the current config during [Online Download Update] and [Manually Upload Update].")
firmware_config.default = "1"
firmware_config.rmempty = false

--9.Write bootloader
write_bootloader = o:option(Flag, "amlogic_write_bootloader", translate("Auto write bootloader:"))
write_bootloader.description = translate("[Recommended choice] Set whether to auto write bootloader during install and update OpenWrt.")
write_bootloader.default = "0"
write_bootloader.rmempty = false

--10.Set the file system type of the shared partition
shared_fstype = o:option(ListValue, "amlogic_shared_fstype", translate("Set the file system type:"))
shared_fstype.description = translate("[Default ext4] Set the file system type of the shared partition (/mnt/mmcblk*p4) when install OpenWrt.")
shared_fstype:value("ext4", translate("ext4"))
shared_fstype:value("f2fs", translate("f2fs"))
shared_fstype:value("btrfs", translate("btrfs"))
shared_fstype:value("xfs", translate("xfs"))
shared_fstype.default = "ext4"
shared_fstype.rmempty = false

return b
