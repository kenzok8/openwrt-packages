local b

--SimpleForm for Install OpenWrt to Amlogic EMMC
b             = SimpleForm("amlogic_install", nil)
b.title       = translate("Install OpenWrt")
b.description = translate("Install OpenWrt to EMMC, Please select the device model, Or enter the dtb file name.")
b.reset       = false
b.submit      = false

b:section(SimpleSection).template = "amlogic/other_install"

return b
