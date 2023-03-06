local nxfs = require 'nixio.fs'
local nutil = require 'nixio.util'
local name = 'design'
local uci = require 'luci.model.uci'.cursor()

local mode, navbar, navbar_proxy
if nxfs.access('/etc/config/design') then
    mode = uci:get_first('design', 'global', 'mode')
    navbar = uci:get_first('design', 'global', 'navbar')
	navbar_proxy = uci:get_first('design', 'global', 'navbar_proxy')
end

-- [[ 设置 ]]--
br = SimpleForm('config', translate('Design Config'), translate('Here you can set the mode of the theme and change the proxy tool icon in the navigation bar. [Recommend Chrome]'))
br.reset = false
br.submit = false
s = br:section(SimpleSection) 

o = s:option(ListValue, 'mode', translate('Theme mode'))
o:value('normal', translate('Follow System'))
o:value('light', translate('Force Light'))
o:value('dark', translate('Force Dark'))
o.default = mode
o.rmempty = false
o.description = translate('You can choose Theme color mode here')

o = s:option(ListValue, 'navbar', translate('Navigation bar setting'))
o:value('display', translate('Display navigation bar'))
o:value('close', translate('Close navigation bar'))
o.default = navbar
o.rmempty = false
o.description = translate('The navigation bar is display by default')

o = s:option(ListValue, 'navbar_proxy', translate('Navigation bar proxy'))
o:value('openclash', 'openclash')
o:value('shadowsocksr', 'shadowsocksr')
o:value('vssr', 'vssr')
o:value('passwall', 'passwall')
o:value('passwall2', 'passwall2')
o.default = navbar_proxy
o.rmempty = false
o.description = translate('OpenClash by default')

o = s:option(Button, 'save', translate('Save Changes'))
o.inputstyle = 'reload'

function br.handle(self, state, data)
    if (state == FORM_VALID and data.mode ~= nil and data.navbar ~= nil and data.navbar_proxy ~= nil) then
        nxfs.writefile('/tmp/aaa', data)
        for key, value in pairs(data) do
            uci:set('design','@global[0]',key,value)
        end 
        uci:commit('design')
    end
    return true
end

return br
