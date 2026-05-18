require("luci.sys")

local m, s
local fs  = require "nixio.fs"
local uci = require "luci.model.uci".cursor()

m = Map("AdGuardHome")
m:section(SimpleSection).template = "AdGuardHome/head"
m:section(SimpleSection).template = "AdGuardHome/overview"

-- Read-only dashboard — hide form submit / reset buttons
m.submit = false
m.reset  = false
m.apply_on_parse = false

return m
