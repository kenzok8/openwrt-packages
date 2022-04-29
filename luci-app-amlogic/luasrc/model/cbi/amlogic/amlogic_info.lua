local b

--SimpleForm for Info
b             = SimpleForm("amlogic", nil)
b.title       = translate("Amlogic Service")
b.description = translate("Supports management of Amlogic s9xxx, Allwinner (V-Plus Cloud), and Rockchip (BeikeYun, Chainedbox L1 Pro) boxes.")
b.reset       = false
b.submit      = false

b:section(SimpleSection).template = "amlogic/other_info"

return b
