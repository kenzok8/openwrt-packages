package generator

// fakeIPFilter lists the domains mihomo must resolve with real DNS instead of
// fake-ip: time sync, STUN, console networking, LAN discovery and captive-portal
// checks all break when they receive a 198.18.x.x address.
//
// Copied verbatim from kenzok78/ruleset e00a0fd rule/FakeIPFilter-CN.list and
// rule/FakeIPFilter-NotCN.list. Keep this file in sync when those lists change;
// Tower ships them inline so a generated config never depends on a rule provider
// download that would have to go through the very proxy it is bootstrapping.
var fakeIPFilterDomains = []string{
	// ===== FakeIPFilter-CN.list =====
	// LAN / 私有域
	"localhost",
	"*.lan",
	"*.localdomain",
	"*.example",
	"*.invalid",
	"*.localhost",
	"*.test",
	"*.local",
	"*.home.arpa",
	"*.direct",
	"PDC._msDCS.*.*",
	"DC._msDCS.*.*",
	"GC._msDCS.*.*",
	"*.router.asus.com",
	"*.plex.direct",
	// NTP 国内
	"time1.cloud.tencent.com",
	"time.*.edu.cn",
	"*.time.edu.cn",
	"*.ntp.org.cn",
	"ntp.aliyun.com",
	"ntp1.aliyun.com",
	"ntp2.aliyun.com",
	"ntp3.aliyun.com",
	"ntp4.aliyun.com",
	"ntp5.aliyun.com",
	"ntp6.aliyun.com",
	"ntp7.aliyun.com",
	"ntp.tencent.com",
	"ntp1.tencent.com",
	"ntp2.tencent.com",
	"ntp3.tencent.com",
	"ntp4.tencent.com",
	"ntp5.tencent.com",
	"cn.pool.ntp.org",
	// 运营商一键登录
	"id6.me",
	"open.e.189.cn",
	"hmrz.wo.cn",
	"nishub1.10010.com",
	"enrichgw.10010.com",
	"*.cmpassport.com",
	"*.wosms.cn",
	// 金融 / 生活
	"app.yinxiang.com",
	"+.cmbchina.com",
	"+.cmbimg.com",
	"*.pingan.com.cn",
	"*.10099.com.cn",
	"*.microdone.cn",
	"*.jegotrip.com.cn",
	// QQ / 微信登录
	"localhost.ptlogin2.qq.com",
	"localhost.sec.qq.com",
	"localhost.*.weixin.qq.com",
	// 音乐
	"music.163.com",
	"*.music.163.com",
	"*.126.net",
	"music.taihe.com",
	"songsearch.kugou.com",
	"trackercdn.kugou.com",
	"*.kuwo.cn",
	"y.qq.com",
	"streamoc.music.tc.qq.com",
	"mobileoc.music.tc.qq.com",
	"isure.stream.qqmusic.qq.com",
	"dl.stream.qqmusic.qq.com",
	"aqqmusic.tc.qq.com",
	"*.y.qq.com",
	"*.xiami.com",
	"music.migu.cn",
	"*.music.migu.cn",
	// 游戏国服
	"ff.dorado.sdo.com",
	"+.battlenet.com.cn",
	"+.wotgame.cn",
	"+.wggames.cn",
	"+.wowsgame.cn",
	"+.gcloudcs.com",
	"+.gcloudsdk.com",
	"*.blzstatic.cn",
	"*.ff14.sdo.com",
	// Apple 软件更新（国内 CDN）
	"mesu.apple.com",
	"swscan.apple.com",
	"swdownload.apple.com",
	"swcdn.apple.com",
	"swdist.apple.com",
	// 视频 / 下载
	"*.mcdn.bilivideo.cn",
	"+.sandai.net",
	"+.n0808.com",
	// 加速器
	"ps.res.netease.com",
	"+.uu.163.com",
	// 米家 / 智能家居
	"+.market.xiaomi.com",
	"*.mi.com",
	"*.mijia.com",
	"dlg.io.mi.com",
	// 向日葵 / 花生壳
	"+.oray.com",
	"+.orayimg.com",
	// STUN 国内
	"+.stun.*.cn",
	"+.stun.*.*.cn",
	"+.stun.*.*.*.cn",
	"+.stun.*.*.*.*.cn",
	"stun.*.cn",
	"stun.*.*.cn",
	// Steam 国内 CDN
	"alibaba.cdn.steampipe.steamcontent.com",

	// ===== FakeIPFilter-NotCN.list =====
	// 连通性探测 / 工具
	"cable.auth.com",
	"network-test.debian.org",
	"detectportal.firefox.com",
	"resolver1.opendns.com",
	"global.turn.twilio.com",
	"global.stun.twilio.com",
	"injections.adguard.org",
	"local.adguard.org",
	"proxy.golang.org",
	"shark007.net",
	// NTP 国外
	"time-ios.apple.com",
	"+.pool.ntp.org",
	"time.*.com",
	"time.*.gov",
	"time.*.apple.com",
	"time1.*.com",
	"time2.*.com",
	"time3.*.com",
	"time4.*.com",
	"time5.*.com",
	"time6.*.com",
	"time7.*.com",
	"ntp.*.com",
	"ntp1.*.com",
	"ntp2.*.com",
	"ntp3.*.com",
	"ntp4.*.com",
	"ntp5.*.com",
	"ntp6.*.com",
	"ntp7.*.com",
	// STUN
	"+.stun.*.*",
	"+.stun.*.*.*",
	"+.stun.*.*.*.*",
	"+.stun.*.*.*.*.*",
	"stun.*.*",
	"stun.*.*.*",
	// 音乐
	"api-jooxtt.sanook.com",
	"api.joox.com",
	"joox.com",
	// Windows 本地连接检测
	"+.msftconnecttest.com",
	"+.msftncsi.com",
	// 游戏机
	"+.srv.nintendo.net",
	"+.cdn.nintendo.net",
	"*.n.n.srv.nintendo.net",
	"+.stun.playstation.net",
	"xnotify.xboxlive.com",
	"xbox.*.*.microsoft.com",
	"*.*.xboxlive.com",
	"xbox.*.microsoft.com",
	// 暴雪 / 战舰世界
	"+.battle.net",
	"+.wargaming.net",
	// Steam
	"+.steamcontent.com",
	// Final Fantasy XIV 国际服
	"*.square-enix.com",
	"*.finalfantasyxiv.com",
	"*.ffxiv.com",
	// 路由器
	"heartbeat.belkin.com",
	"*.linksys.com",
	"*.linksyssmartwifi.com",
	// Google
	"lens.l.google.com",
	"stun.l.google.com",
	"na.b.g-tun.com",
	// Netflix
	"+.nflxvideo.net",
	// Disney Plus
	"+.media.dssott.com",
	// Wi-Fi Calling
	"+.pub.3gppnetwork.org",
	// Plex（局域网直连必须真实 IP）
	"*.plex.tv",
	"*.plexapp.com",
	"*.plexmediaserver.com",
}

// fakeIPFilter returns the ordered, de-duplicated fake-ip bypass list: the
// long-standing LAN entries plus the curated kenzok78/ruleset lists.
func fakeIPFilter() []string {
	base := append([]string{"*.lan", "+.local"}, fakeIPFilterDomains...)
	out := make([]string, 0, len(base))
	seen := make(map[string]struct{}, len(base))
	for _, domain := range base {
		if domain == "" {
			continue
		}
		if _, ok := seen[domain]; ok {
			continue
		}
		seen[domain] = struct{}{}
		out = append(out, domain)
	}
	return out
}
