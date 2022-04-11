module("luci.controller.koolddns",package.seeall)
function index()
if not nixio.fs.access("/etc/config/koolddns")then
return
end
entry({"admin","services","koolddns"},cbi("koolddns/global"),_("Koolddns"),58).dependent=true
entry({"admin","services","koolddns","config"},cbi("koolddns/config")).leaf=true
entry({"admin","services","koolddns","nslookup"},call("act_nslookup")).leaf=true
entry({"admin","services","koolddns","curl"},call("act_curl")).leaf=true
end
function act_nslookup()
local e={}
e.index=luci.http.formvalue("index")
--e.value=luci.sys.exec("nslookup %q localhost 2>&1|grep 'Address 1:'|tail -n1|cut -d' ' -f3"%luci.http.formvalue("domain"))
e.value=luci.sys.exec("dig @8.8.4.4 %q 2>&1 |grep 'IN'|awk '{print $5}'|grep -E '([0-9]{1,3}[\.]){3}[0-9]{1,3}'|head -n1"%luci.http.formvalue("domain"))
if e.value=="" then
e.value=luci.sys.exec("dig @8.8.8.8 %q 2>&1 |grep 'IN'|awk '{print $5}'|grep -E '([0-9]{1,3}[\.]){3}[0-9]{1,3}'|head -n1"%luci.http.formvalue("domain"))
if e.value=="" then
e.value="127.0.0.1"
end
end
luci.http.prepare_content("application/json")
luci.http.write_json(e)
end
function act_curl()
local e={}
e.index=luci.http.formvalue("index")
--e.value=luci.sys.exec("curl -s %q 2>&1"%luci.http.formvalue("url"))
e.value=luci.http.formvalue("url")
luci.http.prepare_content("application/json")
luci.http.write_json(e)
end
