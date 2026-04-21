module("luci.controller.subconverter", package.seeall)

function index()
  app = entry({"admin", "services", "subconverter"}, alias("admin", "services", "subconverter", "subconverter"), _("Subconverter"), 10)
  app.dependent = true
  
  subconverter = entry({"admin", "services", "subconverter", "subconverter"}, template("subconverter/subconverter"), _("Subconverter"), 1)
  subconverter.leaf = true
  subconverter.dependent = true
  
  prefini = entry({"admin", "services", "subconverter", "prefini"}, template("subconverter/prefini"), _("pref.ini"), 2)
  prefini.dependent = true
end
