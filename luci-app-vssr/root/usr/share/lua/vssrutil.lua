#!/usr/bin/lua
------------------------------------------------
-- This file is converter ip to country iso code
-- @author Jerryk <jerrykuku@qq.com>
------------------------------------------------

local _M = {}

-- Get country iso code with remark or host
-- Return String:iso_code
function _M.get_flag(remark, host)
    local nixio = require 'nixio'
    local json = require('cjson')
    local json_string =
        '[{"code":"AC","regx":["🇦🇨","AC","Ascension Island"]},{"code":"AD","regx":["安道尔","🇦🇩","AD","Andorra"]},{"code":"AE","regx":["阿联酋","🇦🇪","AE","United Arab Emirates"]},{"code":"AF","regx":["阿富汗","🇦🇫","AF","Afghanistan"]},{"code":"AG","regx":["安提瓜和巴布达","🇦🇬","AG","Antigua & Barbuda"]},{"code":"AI","regx":["安圭拉","🇦🇮","AI","Anguilla"]},{"code":"AL","regx":["阿尔巴尼亚","🇦🇱","AL","Albania"]},{"code":"AM","regx":["亚美尼亚","🇦🇲","AM","Armenia"]},{"code":"AO","regx":["安哥拉","🇦🇴","AO","Angola"]},{"code":"AQ","regx":["南极洲","🇦🇶","AQ","Antarctica"]},{"code":"AR","regx":["阿根廷","🇦🇷","AR","Argentina"]},{"code":"AS","regx":["美属萨摩亚","🇦🇸","AS","American Samoa"]},{"code":"AT","regx":["奥地利","🇦🇹","AT","Austria"]},{"code":"AU","regx":["澳大利亚","🇦🇺","AU","Australia"]},{"code":"AW","regx":["阿鲁巴","🇦🇼","AW","Aruba"]},{"code":"AX","regx":["奥兰群岛","🇦🇽","AX","Åland Islands"]},{"code":"AZ","regx":["阿塞拜疆","🇦🇿","AZ","Azerbaijan"]},{"code":"BA","regx":["波黑","🇧🇦","BA","Bosnia & Herzegovina"]},{"code":"BB","regx":["巴巴多斯","🇧🇧","BB","Barbados"]},{"code":"BD","regx":["孟加拉国","🇧🇩","BD","Bangladesh"]},{"code":"BE","regx":["比利时","🇧🇪","BE","Belgium"]},{"code":"BF","regx":["布基纳法索","🇧🇫","BF","Burkina Faso"]},{"code":"BG","regx":["保加利亚","🇧🇬","BG","Bulgaria"]},{"code":"BH","regx":["巴林","🇧🇭","BH","Bahrain"]},{"code":"BI","regx":["布隆迪","🇧🇮","BI","Burundi"]},{"code":"BJ","regx":["贝宁","🇧🇯","BJ","Benin"]},{"code":"BL","regx":["圣巴泰勒米岛","🇧🇱","BL","St. Barthélemy"]},{"code":"BM","regx":["百慕大","🇧🇲","BM","Bermuda"]},{"code":"BN","regx":["文莱","🇧🇳","BN","Brunei"]},{"code":"BO","regx":["玻利维亚","🇧🇴","BO","Bolivia"]},{"code":"BQ","regx":["荷兰加勒比区","🇧🇶","BQ","Caribbean Netherlands"]},{"code":"BR","regx":["巴西","🇧🇷","BR","Brazil"]},{"code":"BS","regx":["巴哈马","🇧🇸","BS","Bahamas"]},{"code":"BT","regx":["不丹","🇧🇹","BT","Bhutan"]},{"code":"BV","regx":["布韦岛","🇧🇻","BV","Bouvet Island"]},{"code":"BW","regx":["博茨瓦纳","🇧🇼","BW","Botswana"]},{"code":"BY","regx":["白俄罗斯","🇧🇾","BY","Belarus"]},{"code":"BZ","regx":["伯利兹","🇧🇿","BZ","Belize"]},{"code":"CA","regx":["加拿大","🇨🇦","CA","Canada"]},{"code":"CC","regx":["科科斯群岛","🇨🇨","CC","Cocos (Keeling) Islands"]},{"code":"CD","regx":["刚果（金）","🇨🇩","CD","Congo - Kinshasa"]},{"code":"CF","regx":["中非","🇨🇫","CF","Central African Republic"]},{"code":"CG","regx":["刚果（布）","🇨🇬","CG","Congo - Brazzaville"]},{"code":"CH","regx":["瑞士","🇨🇭","CH","Switzerland"]},{"code":"CI","regx":["科特迪瓦","🇨🇮","CI","Côte d’Ivoire"]},{"code":"CK","regx":["库克群岛","🇨🇰","CK","Cook Islands"]},{"code":"CL","regx":["智利","🇨🇱","CL","Chile"]},{"code":"CM","regx":["喀麦隆","🇨🇲","CM","Cameroon"]},{"code":"CN","regx":["中国；\r\n內地","🇨🇳","CN","China"]},{"code":"CO","regx":["哥伦比亚","🇨🇴","CO","Colombia"]},{"code":"CP","regx":["🇨🇵","CP","Clipperton Island"]},{"code":"CR","regx":["哥斯达黎加","🇨🇷","CR","Costa Rica"]},{"code":"CU","regx":["古巴","🇨🇺","CU","Cuba"]},{"code":"CV","regx":["佛得角","🇨🇻","CV","Cape Verde"]},{"code":"CW","regx":["库拉索","🇨🇼","CW","Curaçao"]},{"code":"CX","regx":["圣诞岛","🇨🇽","CX","Christmas Island"]},{"code":"CY","regx":["塞浦路斯","🇨🇾","CY","Cyprus"]},{"code":"CZ","regx":["捷克","🇨🇿","CZ","Czechia"]},{"code":"DE","regx":["德国","🇩🇪","DE","Germany"]},{"code":"DG","regx":["🇩🇬","DG","Diego Garcia"]},{"code":"DJ","regx":["吉布提","🇩🇯","DJ","Djibouti"]},{"code":"DK","regx":["丹麦","🇩🇰","DK","Denmark"]},{"code":"DM","regx":["多米尼克","🇩🇲","DM","Dominica"]},{"code":"DO","regx":["多米尼加","🇩🇴","DO","Dominican Republic"]},{"code":"DZ","regx":["阿尔及利亚","🇩🇿","DZ","Algeria"]},{"code":"EA","regx":["🇪🇦","EA","Ceuta & Melilla"]},{"code":"EC","regx":["厄瓜多尔","🇪🇨","EC","Ecuador"]},{"code":"EE","regx":["爱沙尼亚","🇪🇪","EE","Estonia"]},{"code":"EG","regx":["埃及","🇪🇬","EG","Egypt"]},{"code":"EH","regx":["西撒哈拉","🇪🇭","EH","Western Sahara"]},{"code":"ER","regx":["厄立特里亚","🇪🇷","ER","Eritrea"]},{"code":"ES","regx":["西班牙","🇪🇸","ES","Spain"]},{"code":"ET","regx":["埃塞俄比亚","🇪🇹","ET","Ethiopia"]},{"code":"EU","regx":["🇪🇺","EU","European Union"]},{"code":"FI","regx":["芬兰","🇫🇮","FI","Finland"]},{"code":"FJ","regx":["斐济群岛","🇫🇯","FJ","Fiji"]},{"code":"FK","regx":["马尔维纳斯群岛（福克兰）","🇫🇰","FK","Falkland Islands"]},{"code":"FM","regx":["密克罗尼西亚联邦","🇫🇲","FM","Micronesia"]},{"code":"FO","regx":["法罗群岛","🇫🇴","FO","Faroe Islands"]},{"code":"FR","regx":["法国","🇫🇷","FR","France"]},{"code":"GA","regx":["加蓬","🇬🇦","GA","Gabon"]},{"code":"GB","regx":["英国","🇬🇧","GB","United Kingdom"]},{"code":"GD","regx":["格林纳达","🇬🇩","GD","Grenada"]},{"code":"GE","regx":["格鲁吉亚","🇬🇪","GE","Georgia"]},{"code":"GF","regx":["法属圭亚那","🇬🇫","GF","French Guiana"]},{"code":"GG","regx":["根西岛","🇬🇬","GG","Guernsey"]},{"code":"GH","regx":["加纳","🇬🇭","GH","Ghana"]},{"code":"GI","regx":["直布罗陀","🇬🇮","GI","Gibraltar"]},{"code":"GL","regx":["格陵兰","🇬🇱","GL","Greenland"]},{"code":"GM","regx":["冈比亚","🇬🇲","GM","Gambia"]},{"code":"GN","regx":["几内亚","🇬🇳","GN","Guinea"]},{"code":"GP","regx":["瓜德罗普","🇬🇵","GP","Guadeloupe"]},{"code":"GQ","regx":["赤道几内亚","🇬🇶","GQ","Equatorial Guinea"]},{"code":"GR","regx":["希腊","🇬🇷","GR","Greece"]},{"code":"GS","regx":["南乔治亚岛和南桑威奇群岛","🇬🇸","GS","South Georgia & South Sandwich Islands"]},{"code":"GT","regx":["危地马拉","🇬🇹","GT","Guatemala"]},{"code":"GU","regx":["关岛","🇬🇺","GU","Guam"]},{"code":"GW","regx":["几内亚比绍","🇬🇼","GW","Guinea-Bissau"]},{"code":"GY","regx":["圭亚那","🇬🇾","GY","Guyana"]},{"code":"HK","regx":["香港","🇭🇰","HK","Hong Kong SAR China"]},{"code":"HM","regx":["赫德岛和麦克唐纳群岛","🇭🇲","HM","Heard & McDonald Islands"]},{"code":"HN","regx":["洪都拉斯","🇭🇳","HN","Honduras"]},{"code":"HR","regx":["克罗地亚","🇭🇷","HR","Croatia"]},{"code":"HT","regx":["海地","🇭🇹","HT","Haiti"]},{"code":"HU","regx":["匈牙利","🇭🇺","HU","Hungary"]},{"code":"IC","regx":["🇮🇨","IC","Canary Islands"]},{"code":"ID","regx":["印尼","🇮🇩","ID","Indonesia"]},{"code":"IE","regx":["爱尔兰","🇮🇪","IE","Ireland"]},{"code":"IL","regx":["以色列","🇮🇱","IL","Israel"]},{"code":"IM","regx":["马恩岛","🇮🇲","IM","Isle of Man"]},{"code":"IN","regx":["印度","🇮🇳","IN","India"]},{"code":"IO","regx":["英属印度洋领地","🇮🇴","IO","British Indian Ocean Territory"]},{"code":"IQ","regx":["伊拉克","🇮🇶","IQ","Iraq"]},{"code":"IR","regx":["伊朗","🇮🇷","IR","Iran"]},{"code":"IS","regx":["冰岛","🇮🇸","IS","Iceland"]},{"code":"IT","regx":["意大利","🇮🇹","IT","Italy"]},{"code":"JE","regx":["泽西岛","🇯🇪","JE","Jersey"]},{"code":"JM","regx":["牙买加","🇯🇲","JM","Jamaica"]},{"code":"JO","regx":["约旦","🇯🇴","JO","Jordan"]},{"code":"JP","regx":["日本","🇯🇵","JP","Japan"]},{"code":"KE","regx":["肯尼亚","🇰🇪","KE","Kenya"]},{"code":"KG","regx":["吉尔吉斯斯坦","🇰🇬","KG","Kyrgyzstan"]},{"code":"KH","regx":["柬埔寨","🇰🇭","KH","Cambodia"]},{"code":"KI","regx":["基里巴斯","🇰🇮","KI","Kiribati"]},{"code":"KM","regx":["科摩罗","🇰🇲","KM","Comoros"]},{"code":"KN","regx":["圣基茨和尼维斯","🇰🇳","KN","St. Kitts & Nevis"]},{"code":"KP","regx":["朝鲜；\r\n北朝鲜","🇰🇵","KP","North Korea"]},{"code":"KR","regx":["韩国","🇰🇷","KR","South Korea"]},{"code":"KW","regx":["科威特","🇰🇼","KW","Kuwait"]},{"code":"KY","regx":["开曼群岛","🇰🇾","KY","Cayman Islands"]},{"code":"KZ","regx":["哈萨克斯坦","🇰🇿","KZ","Kazakhstan"]},{"code":"LA","regx":["老挝","🇱🇦","LA","Laos"]},{"code":"LB","regx":["黎巴嫩","🇱🇧","LB","Lebanon"]},{"code":"LC","regx":["圣卢西亚","🇱🇨","LC","St. Lucia"]},{"code":"LI","regx":["列支敦士登","🇱🇮","LI","Liechtenstein"]},{"code":"LK","regx":["斯里兰卡","🇱🇰","LK","Sri Lanka"]},{"code":"LR","regx":["利比里亚","🇱🇷","LR","Liberia"]},{"code":"LS","regx":["莱索托","🇱🇸","LS","Lesotho"]},{"code":"LT","regx":["立陶宛","🇱🇹","LT","Lithuania"]},{"code":"LU","regx":["卢森堡","🇱🇺","LU","Luxembourg"]},{"code":"LV","regx":["拉脱维亚","🇱🇻","LV","Latvia"]},{"code":"LY","regx":["利比亚","🇱🇾","LY","Libya"]},{"code":"MA","regx":["摩洛哥","🇲🇦","MA","Morocco"]},{"code":"MC","regx":["摩纳哥","🇲🇨","MC","Monaco"]},{"code":"MD","regx":["摩尔多瓦","🇲🇩","MD","Moldova"]},{"code":"ME","regx":["黑山","🇲🇪","ME","Montenegro"]},{"code":"MF","regx":["法属圣马丁","🇲🇫","MF","St. Martin"]},{"code":"MG","regx":["马达加斯加","🇲🇬","MG","Madagascar"]},{"code":"MH","regx":["马绍尔群岛","🇲🇭","MH","Marshall Islands"]},{"code":"MK","regx":["马其顿","🇲🇰","MK","Macedonia"]},{"code":"ML","regx":["马里","🇲🇱","ML","Mali"]},{"code":"MM","regx":["缅甸","🇲🇲","MM","Myanmar (Burma)"]},{"code":"MN","regx":["蒙古国；蒙古","🇲🇳","MN","Mongolia"]},{"code":"MO","regx":["澳门","🇲🇴","MO","Macau SAR China"]},{"code":"MP","regx":["北马里亚纳群岛","🇲🇵","MP","Northern Mariana Islands"]},{"code":"MQ","regx":["马提尼克","🇲🇶","MQ","Martinique"]},{"code":"MR","regx":["毛里塔尼亚","🇲🇷","MR","Mauritania"]},{"code":"MS","regx":["蒙塞拉特岛","🇲🇸","MS","Montserrat"]},{"code":"MT","regx":["马耳他","🇲🇹","MT","Malta"]},{"code":"MU","regx":["毛里求斯","🇲🇺","MU","Mauritius"]},{"code":"MV","regx":["马尔代夫","🇲🇻","MV","Maldives"]},{"code":"MW","regx":["马拉维","🇲🇼","MW","Malawi"]},{"code":"MX","regx":["墨西哥","🇲🇽","MX","Mexico"]},{"code":"MY","regx":["马来西亚","🇲🇾","MY","Malaysia"]},{"code":"MZ","regx":["莫桑比克","🇲🇿","MZ","Mozambique"]},{"code":"NA","regx":["纳米比亚","🇳🇦","NA","Namibia"]},{"code":"NC","regx":["新喀里多尼亚","🇳🇨","NC","New Caledonia"]},{"code":"NE","regx":["尼日尔","🇳🇪","NE","Niger"]},{"code":"NF","regx":["诺福克岛","🇳🇫","NF","Norfolk Island"]},{"code":"NG","regx":["尼日利亚","🇳🇬","NG","Nigeria"]},{"code":"NI","regx":["尼加拉瓜","🇳🇮","NI","Nicaragua"]},{"code":"NL","regx":["荷兰","🇳🇱","NL","Netherlands"]},{"code":"NO","regx":["挪威","🇳🇴","NO","Norway"]},{"code":"NP","regx":["尼泊尔","🇳🇵","NP","Nepal"]},{"code":"NR","regx":["瑙鲁","🇳🇷","NR","Nauru"]},{"code":"NU","regx":["纽埃","🇳🇺","NU","Niue"]},{"code":"NZ","regx":["新西兰","🇳🇿","NZ","New Zealand"]},{"code":"OM","regx":["阿曼","🇴🇲","OM","Oman"]},{"code":"PA","regx":["巴拿马","🇵🇦","PA","Panama"]},{"code":"PE","regx":["秘鲁","🇵🇪","PE","Peru"]},{"code":"PF","regx":["法属波利尼西亚","🇵🇫","PF","French Polynesia"]},{"code":"PG","regx":["巴布亚新几内亚","🇵🇬","PG","Papua New Guinea"]},{"code":"PH","regx":["菲律宾","🇵🇭","PH","Philippines"]},{"code":"PK","regx":["巴基斯坦","🇵🇰","PK","Pakistan"]},{"code":"PL","regx":["波兰","🇵🇱","PL","Poland"]},{"code":"PM","regx":["圣皮埃尔和密克隆","🇵🇲","PM","St. Pierre & Miquelon"]},{"code":"PN","regx":["皮特凯恩群岛","🇵🇳","PN","Pitcairn Islands"]},{"code":"PR","regx":["波多黎各","🇵🇷","PR","Puerto Rico"]},{"code":"PS","regx":["巴勒斯坦","🇵🇸","PS","Palestinian Territories"]},{"code":"PT","regx":["葡萄牙","🇵🇹","PT","Portugal"]},{"code":"PW","regx":["帕劳","🇵🇼","PW","Palau"]},{"code":"PY","regx":["巴拉圭","🇵🇾","PY","Paraguay"]},{"code":"QA","regx":["卡塔尔","🇶🇦","QA","Qatar"]},{"code":"RE","regx":["留尼汪","🇷🇪","RE","Réunion"]},{"code":"RO","regx":["罗马尼亚","🇷🇴","RO","Romania"]},{"code":"RS","regx":["塞尔维亚","🇷🇸","RS","Serbia"]},{"code":"RU","regx":["俄罗斯","🇷🇺","RU","Russia"]},{"code":"RW","regx":["卢旺达","🇷🇼","RW","Rwanda"]},{"code":"SA","regx":["沙特阿拉伯","🇸🇦","SA","Saudi Arabia"]},{"code":"SB","regx":["所罗门群岛","🇸🇧","SB","Solomon Islands"]},{"code":"SC","regx":["塞舌尔","🇸🇨","SC","Seychelles"]},{"code":"SD","regx":["苏丹","🇸🇩","SD","Sudan"]},{"code":"SE","regx":["瑞典","🇸🇪","SE","Sweden"]},{"code":"SG","regx":["新加坡","🇸🇬","SG","Singapore"]},{"code":"SH","regx":["圣赫勒拿","🇸🇭","SH","St. Helena"]},{"code":"SI","regx":["斯洛文尼亚","🇸🇮","SI","Slovenia"]},{"code":"SJ","regx":["斯瓦尔巴群岛和扬马延岛","🇸🇯","SJ","Svalbard & Jan Mayen"]},{"code":"SK","regx":["斯洛伐克","🇸🇰","SK","Slovakia"]},{"code":"SL","regx":["塞拉利昂","🇸🇱","SL","Sierra Leone"]},{"code":"SM","regx":["圣马力诺","🇸🇲","SM","San Marino"]},{"code":"SN","regx":["塞内加尔","🇸🇳","SN","Senegal"]},{"code":"SO","regx":["索马里","🇸🇴","SO","Somalia"]},{"code":"SR","regx":["苏里南","🇸🇷","SR","Suriname"]},{"code":"SS","regx":["南苏丹","🇸🇸","SS","South Sudan"]},{"code":"ST","regx":["圣多美和普林西比","🇸🇹","ST","São Tomé & Príncipe"]},{"code":"SV","regx":["萨尔瓦多","🇸🇻","SV","El Salvador"]},{"code":"SX","regx":["荷属圣马丁","🇸🇽","SX","Sint Maarten"]},{"code":"SY","regx":["叙利亚","🇸🇾","SY","Syria"]},{"code":"SZ","regx":["斯威士兰","🇸🇿","SZ","Swaziland"]},{"code":"TA","regx":["🇹🇦","TA","Tristan da Cunha"]},{"code":"TC","regx":["特克斯和凯科斯群岛","🇹🇨","TC","Turks & Caicos Islands"]},{"code":"TD","regx":["乍得","🇹🇩","TD","Chad"]},{"code":"TF","regx":["法属南部领地","🇹🇫","TF","French Southern Territories"]},{"code":"TG","regx":["多哥","🇹🇬","TG","Togo"]},{"code":"TH","regx":["泰国","🇹🇭","TH","Thailand"]},{"code":"TJ","regx":["塔吉克斯坦","🇹🇯","TJ","Tajikistan"]},{"code":"TK","regx":["托克劳","🇹🇰","TK","Tokelau"]},{"code":"TL","regx":["东帝汶","🇹🇱","TL","Timor-Leste"]},{"code":"TM","regx":["土库曼斯坦","🇹🇲","TM","Turkmenistan"]},{"code":"TN","regx":["突尼斯","🇹🇳","TN","Tunisia"]},{"code":"TO","regx":["汤加","🇹🇴","TO","Tonga"]},{"code":"TR","regx":["土耳其","🇹🇷","TR","Turkey"]},{"code":"TT","regx":["特立尼达和多巴哥","🇹🇹","TT","Trinidad & Tobago"]},{"code":"TV","regx":["图瓦卢","🇹🇻","TV","Tuvalu"]},{"code":"TW","regx":["台湾","🇹🇼","TW","Taiwan"]},{"code":"TZ","regx":["坦桑尼亚","🇹🇿","TZ","Tanzania"]},{"code":"UA","regx":["乌克兰","🇺🇦","UA","Ukraine"]},{"code":"UG","regx":["乌干达","🇺🇬","UG","Uganda"]},{"code":"UM","regx":["美国本土外小岛屿","🇺🇲","UM","U.S. Outlying Islands"]},{"code":"UN","regx":["🇺🇳","UN","United Nations"]},{"code":"US","regx":["美国", "洛杉矶","芝加哥","达拉斯","🇺🇸","US","United States"]},{"code":"UY","regx":["乌拉圭","🇺🇾","UY","Uruguay"]},{"code":"UZ","regx":["乌兹别克斯坦","🇺🇿","UZ","Uzbekistan"]},{"code":"VA","regx":["梵蒂冈","🇻🇦","VA","Vatican City"]},{"code":"VC","regx":["圣文森特和格林纳丁斯","🇻🇨","VC","St. Vincent & Grenadines"]},{"code":"VE","regx":["委内瑞拉","🇻🇪","VE","Venezuela"]},{"code":"VG","regx":["英属维尔京群岛","🇻🇬","VG","British Virgin Islands"]},{"code":"VI","regx":["美属维尔京群岛","🇻🇮","VI","U.S. Virgin Islands"]},{"code":"VN","regx":["越南","🇻🇳","VN","Vietnam"]},{"code":"VU","regx":["瓦努阿图","🇻🇺","VU","Vanuatu"]},{"code":"WF","regx":["瓦利斯和富图纳","🇼🇫","WF","Wallis & Futuna"]},{"code":"WS","regx":["萨摩亚","🇼🇸","WS","Samoa"]},{"code":"XK","regx":["🇽🇰","XK","Kosovo"]},{"code":"YE","regx":["也门","🇾🇪","YE","Yemen"]},{"code":"YT","regx":["马约特","🇾🇹","YT","Mayotte"]},{"code":"ZA","regx":["南非","🇿🇦","ZA","South Africa"]},{"code":"ZM","regx":["赞比亚","🇿🇲","ZM","Zambia"]},{"code":"ZW","regx":["津巴布韦","🇿🇼","ZW","Zimbabwe"]}]'

    local search_table = json.decode(json_string)

    local iso_code = nil
    local delete_table = {'%b[]', 'networks', 'test', 'game', 'gaming', 'tls', 'iepl', 'aead', 'hgc', 'hkbn', 'netflix', 'disney', 'hulu', 'hinet','sb','az','aws','cn','ss','ssr','trojan','all'}
    if (remark ~= nil) then
        -- 过滤
        remark = string.lower(remark)
        for i, v in pairs(delete_table) do
            remark = string.gsub(remark, v, '')
        end

        for i, v in pairs(search_table) do
            for s, t in pairs(v.regx) do
                if (string.find(remark, string.lower(t)) ~= nil) then
                    iso_code = string.lower(v.code)
                    break
                end
            end
        end
    end

    if (iso_code == nil) then
        if (host ~= '') then
            local ret = nixio.getaddrinfo(_M.trim(host), 'any')
            if (ret == nil) then
                iso_code = 'un'
            else
                local hostip = ret[1].address
                local status, code = pcall(_M.get_iso, hostip)
                if (status) then
                    iso_code = code
                else
                    iso_code = 'un'
                end
            end
        else
            iso_code = 'un'
        end
    end
    return string.gsub(iso_code, '\n', '')
end

function _M.get_iso(ip)
    local mm = require 'maxminddb'
    local db = mm.open('/usr/share/vssr/GeoLite2-Country.mmdb')
    local res = db:lookup(ip)
    return string.lower(res:get('country', 'iso_code'))
end

function _M.get_cname(ip)
    local mm = require 'maxminddb'
    local db = mm.open('/usr/share/vssr/GeoLite2-Country.mmdb')
    local res = db:lookup(ip)
    return string.lower(res:get('country', 'names', 'zh-CN'))
end

-- Get status of conncet to any site with host and port
-- Return String:true or nil
function _M.check_site(host, port)
    local nixio = require 'nixio'
    local socket = nixio.socket('inet', 'stream')
    socket:setopt('socket', 'rcvtimeo', 2)
    socket:setopt('socket', 'sndtimeo', 2)
    local ret = socket:connect(host, port)
    socket:close()
    return ret
end

function _M.trim(text)
    if not text or text == '' then
        return ''
    end
    return (string.gsub(text, '^%s*(.-)%s*$', '%1'))
end

function _M.wget(url)
    local sys = require 'luci.sys'
    local stdout =
        sys.exec(
        'wget-ssl -q --user-agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36" --no-check-certificate -t 3 -T 10 -O- "' .. url .. '"'
    )
    return _M.trim(stdout)
end

return _M
