local m, up_luci, up_core

m = SimpleForm("Version")
m.reset = false
m.submit = false

rm_core = m:field(DummyValue,"remove_core", translate("删除核心"))
rm_core.rawhtml = true
rm_core.template = "unblockneteasemusic/remove_core"
rm_core.value = translate("")
rm_core.description = "删除核心后，需手动点击下面的按钮重新下载，有助于解决版本冲突问题"

up_core = m:field(DummyValue,"update_core", translate("更新核心"))
up_core.rawhtml = true
up_core.template = "unblockneteasemusic/update_core"
up_core.value = translate("")
up_core.description = "更新完毕后会自动在后台重启插件，无需手动重启"

return m
