o = Map("koolproxy")

t = o:section(TypedSection, "global",translate("证书恢复"))
t.description = translate("上传恢复已备份的证书，文件名必须为koolproxyCA.tar.gz")
t.anonymous = true

e = t:option(DummyValue, "c1status")
e = t:option(FileUpload, "")
e.template = "koolproxy/caupload"
e = t:option(DummyValue,"",nil)
e.template = "koolproxy/cadvalue"

if nixio.fs.access("/usr/share/koolproxy/data/certs/ca.crt") then

t = o:section(TypedSection, "global",translate("证书备份"))
t.description = translate("下载备份的证书")
t.anonymous = true

e = t:option(DummyValue,"c2status")
e = t:option(Button,"certificate")
e.inputtitle = translate("下载证书备份")
e.inputstyle = "reload"
e.write = function()
		luci.sys.call("/usr/share/koolproxy/camanagement backup 2>&1 >/dev/null")
		Download()
		luci.http.redirect(luci.dispatcher.build_url("admin","services","koolproxy"))
	end
end

function Download()
	local t,e
	t = nixio.open("/tmp/upload/koolproxyca.tar.gz","r")
	luci.http.header('Content-Disposition', 'attachment; filename="koolproxyCA.tar.gz"')
	luci.http.prepare_content("application/octet-stream")
	while true do
		e = t:read(nixio.const.buffersize)
		if (not e) or (#e==0) then
			break
		else
			luci.http.write(e)
		end
	end
	t:close()
	luci.http.close()
end

local t,e
t = "/tmp/upload/"
nixio.fs.mkdir(t)
luci.http.setfilehandler(
function(o,a,i)
	if not e then
		if not o then return end
		e = nixio.open(t..o.file,"w")
		if not e then
			return
		end
	end
	if a and e then
		e:write(a)
	end
	if i and e then
		e:close()
		e = nil
		luci.sys.call("/usr/share/koolproxy/camanagement restore 2>&1 >/dev/null")
	end
end
)

return o
