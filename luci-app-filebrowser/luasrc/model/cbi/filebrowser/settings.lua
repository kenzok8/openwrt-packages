m = Map("filebrowser", translate("FileBrowser"), translate(
            "File explorer is software that creates your own cloud that you can install on a server, point it to a path, and then access your files through a beautiful web interface. You have many features available!"))
m:append(Template("filebrowser/status"))

s = m:section(TypedSection, "global", translate("Global Settings"))
s.anonymous = true
s.addremove = false

o = s:option(Flag, "enable", translate("Enable"))
o.rmempty = false

o = s:option(Value, "address", translate("Listen address"))
o.default = "0.0.0.0"
o.rmempty = false

o = s:option(Value, "port", translate("Listen port"))
o.datatype = "port"
o.default = 8088
o.rmempty = false

o = s:option(Value, "database", translate("Database path"))
o.default = "/etc/filebrowser.db"
o.rmempty = false

o = s:option(Value, "username", translate("Initial username"))
o.default = "admin"
o.rmempty = false

o = s:option(Value, "password", translate("Initial password"))
o.default = "admin"
o.rmempty = false

o = s:option(Value, "ssl_cert", translate("SSL cert"))
o.default = ""

o = s:option(Value, "ssl_key", translate("SSL key"))
o.default = ""

o = s:option(Value, "root_path", translate("Root path"), translate(
                 "Point to a path to access your files in the web interface, default is /root"))
o.default = "/root"
o.rmempty = false

o = s:option(Value, "executable_directory", translate("Executable directory"),
             translate(
                 "The file size is large, requiring at least 32M space. It is recommended to insert a usb flash drive or hard disk, or use it in the tmp directory<br />For example, /mnt/sda1<br />For example, /tmp"))
o.default = "/tmp"
o.rmempty = false

o = s:option(Button, "_download", translate("Manually download"), translate(
                 "Make sure you have enough space. <br /><font style='color:red'>Be sure to fill out the executable storage directory the first time you run it, and then save the application. Then manually download, otherwise can not use!</font>"))
o.template = "filebrowser/download"
o.inputstyle = "apply"
o.btnclick = "downloadClick(this);"
o.id = "download_btn"

m:append(Template("filebrowser/log"))

return m
