local b

--SimpleForm for Check
b             = SimpleForm("amlogic", nil)
b.title       = translate("Check Update")
b.description = translate("Provide OpenWrt Firmware, Kernel and Plugin online check, download and update service.")
b.reset       = false
b.submit      = false

b:section(SimpleSection).template = "amlogic/other_check"

return b
