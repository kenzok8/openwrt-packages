module("luci.controller.guest-wifi", package.seeall)

function index()
    if not nixio.fs.access("/etc/config/wireless") then
        return
    end
    
    entry({"admin", "network", "guest-wifi"}, view("guest-wifi/wifi"), _("Guest WiFi"), 60)
end