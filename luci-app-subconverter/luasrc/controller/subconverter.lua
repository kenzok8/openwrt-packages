module("luci.controller.subconverter", package.seeall)

function index()
  app = entry({"admin", "services", "subconverter"}, alias("admin", "services", "subconverter", "subconverter"), _("Subconverter"), 10)
  app.dependent = true
  
  subconverter = entry({"admin", "services", "subconverter", "subconverter"}, template("subconverter/subconverter"), _("Subconverter"), 1)
  subconverter.leaf = true
  subconverter.dependent = true
  
  subweb = entry({"admin", "services", "subconverter", "subweb"}, template("subconverter/subweb"), _("Subweb"), 2)
  subweb.dependent = true
  
  prefini = entry({"admin", "services", "subconverter", "prefini"}, template("subconverter/prefini"), _("pref.ini"), 3)
  prefini.dependent = true
end
