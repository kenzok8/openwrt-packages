--Copyright: https://github.com/coolsnowwolf/luci/tree/master/applications/luci-app-filetransfer
--Extended support: https://github.com/ophub/luci-app-amlogic
--Function: Download files

local io = require "io"
local os = require "os"
local fs = require "nixio.fs"
local b, c, x

-- Checks wheather the given path exists and points to a directory.
function isdirectory(dirname)
	return fs.stat(dirname, "type") == "dir"
end

-- Check if a file or directory exists
function file_exists(path)
	local file = io.open(path, "rb")
	if file then file:close() end
	return file ~= nil
end

--SimpleForm for Backup Config
b = SimpleForm("backup", nil)
b.title = translate("Backup Firmware Config")
b.description = translate("Backup OpenWrt config (openwrt_config.tar.gz). Use this file to restore the config in [Manually Upload Update].")
b.reset = false
b.submit = false

s = b:section(SimpleSection, "", "")

-- Button for customize backup list
my = s:option(Button, "customize", translate("Edit List:"))
my.template = "amlogic/other_button"

my.render = function(self, section, scope)
	self.section = true
	scope.display = ""
	self.inputtitle = translate("Open List")
	self.inputstyle = "save"
	Button.render(self, section, scope)
end

my.write = function(self, section, scope)
	local handle = io.popen("[[ -s /etc/amlogic_backup_list.conf ]] || sed -n \"/BACKUP_LIST='/,/.*'$/p\" /usr/sbin/openwrt-backup | sed -e \"s/BACKUP_LIST=\\(.*\\)/\\1/; s/'//g; s/\\\\\\\\//g; s/ //g\" > /etc/amlogic_backup_list.conf 2>/dev/null")
	handle:close()
	luci.http.redirect(luci.dispatcher.build_url("admin", "system", "amlogic", "backuplist"))
end

-- Button for download backup config
o = s:option(Button, "download", translate("Backup Config:"))
o.template = "amlogic/other_button"

um = s:option(DummyValue, "", nil)
um.template = "amlogic/other_dvalue"

o.render = function(self, section, scope)
	self.section = true
	scope.display = ""
	self.inputtitle = translate("Download Backup")
	self.inputstyle = "save"
	Button.render(self, section, scope)
end

o.write = function(self, section, scope)
	local x = luci.sys.exec("chmod +x /usr/sbin/openwrt-backup 2>/dev/null")
	local r = luci.sys.exec("/usr/sbin/openwrt-backup -b > /tmp/amlogic/amlogic.log && sync 2>/dev/null")

	local sPath, sFile, fd, block
	sPath = "/.reserved/openwrt_config.tar.gz"
	sFile = fs.basename(sPath)
	if isdirectory(sPath) then
		fd = io.popen('tar -C "%s" -cz .' % { sPath }, "r")
		sFile = sFile .. ".tar.gz"
	else
		fd = nixio.open(sPath, "r")
	end
	if not fd then
		um.value = translate("Couldn't open file:") .. sPath
		return
	else
		um.value = translate("The file Will download automatically.") .. sPath
	end

	luci.http.header('Content-Disposition', 'attachment; filename="%s"' % { sFile })
	luci.http.prepare_content("application/octet-stream")
	while true do
		block = fd:read(nixio.const.buffersize)
		if (not block) or (#block == 0) then
			break
		else
			luci.http.write(block)
		end
	end
	fd:close()
	luci.http.close()
end

-- Button for restore backup list
r = s:option(Button, "restore", translate("Restore Backup:"))
r.template = "amlogic/other_button"

r.render = function(self, section, scope)
	self.section = true
	scope.display = ""
	self.inputtitle = translate("Upload Backup")
	self.inputstyle = "save"
	Button.render(self, section, scope)
end

r.write = function(self, section, scope)
	luci.http.redirect(luci.dispatcher.build_url("admin", "system", "amlogic", "upload"))
end

-- SimpleForm for Create Snapshot
c = SimpleForm("snapshot", nil)
c.title = translate("Snapshot Management")
c.description = translate("Create a snapshot of the current system configuration, or restore to a snapshot.")
c.reset = false
c.submit = false

d = c:section(SimpleSection, "", nil)

w = d:option(Button, "create_snapshot", "")
w.template = "amlogic/other_button"
w.render = function(self, section, scope)
	self.section = true
	scope.display = ""
	self.inputtitle = translate("Create Snapshot")
	self.inputstyle = "save"
	Button.render(self, section, scope)
end

w.write = function(self, section, scope)
	local x = luci.sys.exec("btrfs subvolume snapshot -r /etc /.snapshots/etc-" .. os.date("%m.%d.%H%M%S") .. " 2>/dev/null && sync")
	luci.http.redirect(luci.dispatcher.build_url("admin", "system", "amlogic", "backup"))
end
w = d:option(TextValue, "snapshot_list", nil)
w.template = "amlogic/other_snapshot"

--KVM virtual machine switching dual partition
if file_exists("/boot/efi/EFI/BOOT/grub.cfg.prev") then
	x = SimpleForm("kvm", nil)
	x.title = translate("KVM dual system switching")
	x.description = translate("You can freely switch between KVM dual partitions, using OpenWrt systems in different partitions.")
	x.reset = false
	x.submit = false

	x:section(SimpleSection).template = "amlogic/other_kvm"
end

return b, c, x
