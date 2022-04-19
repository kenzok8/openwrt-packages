local fs = require "luci.fs"
local http = require "luci.http"
local DISP = require "luci.dispatcher"
local b

--SimpleForm for PowerOff
b = SimpleForm("poweroff", nil)
b.title = translate("PowerOff")
b.description = translate("Shut down your router device.")
b.reset = false
b.submit = false
b:section(SimpleSection).template  = "amlogic/other_poweroff"

return b
