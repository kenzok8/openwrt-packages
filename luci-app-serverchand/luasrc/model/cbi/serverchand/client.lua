f = SimpleForm("serverchand")
luci.sys.call("/usr/bin/serverchand/serverchand client")
f.reset = false
f.submit = false
f:append(Template("serverchand/client"))
return f
