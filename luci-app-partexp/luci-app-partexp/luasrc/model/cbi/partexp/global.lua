--[[
LuCI - Lua Configuration Interface
 Copyright (C) 2022-2025  sirpdboy <herboy2008@gmail.com> https://github.com/sirpdboy/luci-app-partexp
]]--
local fs   = require "nixio.fs"
local util = require "nixio.util"
local tp   = require "luci.template.parser"
local uci=luci.model.uci.cursor()
luci.sys.exec("echo '-' >/tmp/partexp.log&&echo 1 > /tmp/lucilogpos" )
local target_devnames = {}
for dev in fs.dir("/dev") do
    if dev:match("^sd[a-z]$")
      or dev:match("^mmcblk%d+$")
      or dev:match("^sata[a-z]$")
      or dev:match("^nvme%d+n%d+$")
      or dev:match("^vd[a-z]")
      then
        table.insert(target_devnames, dev)
    end
end
  local devices = {}
  for i, bname in pairs(target_devnames) do
    local device_info = {}
    local device = "/dev/" .. bname
    device_info["name"] = bname
    device_info["dev"] = device

    s = tonumber((fs.readfile("/sys/class/block/%s/size" % bname)))
    device_info["size"] = s and math.floor(s / 2048)

    devices[#devices+1] = device_info
end

local m,t,e
m = Map("partexp", "<font color='green'>" .. translate("One click partition expansion mounting tool") .."</font>",
translate( "Automatically format and mount the target device partition. If there are multiple partitions, it is recommended to manually delete all partitions before using this tool.<br/>For specific usage, see:") ..translate("<a href=\'https://github.com/sirpdboy/luci-app-partexp.git' target=\'_blank\'>GitHub @sirpdboy:luci-app-partexp</a>") )

t=m:section(TypedSection,"global")
t.anonymous=true

e=t:option(ListValue,"target_function", translate("Select function"),translate("Select the function to be performed"))
e:value("/", translate("Used to extend to the root directory of EXT4 firmware(Ext4 /)"))
e:value("/overlay", translate("Expand application space overlay (/overlay)"))
e:value("/opt", translate("Used as Docker data disk (/opt)"))
e:value("/dev", translate("Normal mount and use by device name(/mnt/x1)"))
e.default="/opt"

e=t:option(ListValue,"target_disk", translate("Destination hard disk"),translate("Select the hard disk device to operate"))
for i, d in ipairs(devices) do
	if d.name and d.size then
		e:value(d.name, "%s (%s, %d MB)" %{ d.name, d.dev, d.size })
	elseif d.name then
		e:value(d.name, "%s (%s)" %{ d.name, d.dev })
	end
end

e=t:option(Flag,"keep_config",translate("Keep configuration"),translate("Tick means to retain the settings"))
e:depends("target_function", "/overlay")
e:depends("target_function", "/")
e.default=0

e=t:option(ListValue,'format_type', translate('Format system type'))
e:depends("target_function", "/opt")
e:depends("target_function", "/dev")
e:value("0", translate("No formatting required"))
e:value("ext4", translate("Linux system partition(EXT4)"))
e:value("btrfs", translate("Large capacity storage devices(Btrfs)"))
e:value("ntfs", translate("Windows system partition(NTFS)"))
e.default="0"

e=t:option(Button, "restart", translate("Perform operation"))
e.inputtitle=translate("Click to execute")
e.template ='partexp'

return m
