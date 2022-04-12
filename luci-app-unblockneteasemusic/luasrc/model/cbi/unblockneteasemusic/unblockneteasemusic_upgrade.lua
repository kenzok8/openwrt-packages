local m, o

m = SimpleForm("Version")
m.reset = false
m.submit = false

o = m:field(DummyValue, "remove_core", translate("删除核心"))
o.rawhtml = true
o.template = "unblockneteasemusic/remove_core"
o.value = translate("")
o.description = "删除核心后，需手动点击下面的按钮重新下载，有助于解决版本冲突问题"

o = m:field(DummyValue, "update_core", translate("更新核心"))
o.rawhtml = true
o.template = "unblockneteasemusic/update_core"
o.value = translate("")
o.description = "更新完毕后会自动在后台重启插件，无需手动重启"

return m
