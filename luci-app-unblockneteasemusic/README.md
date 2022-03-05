### 项目简介
这是一个用于解除网易云音乐播放限制的 OpenWrt 插件，完整支持 播放 / 下载 无版权 / 收费 歌曲<br/>
原理为通过获取其他平台的音乐播放链接，替换网易云音乐内 无版权 / 收费 歌曲链接<br/>

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FUnblockNeteaseMusic%2Fluci-app-unblockneteasemusic.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FUnblockNeteaseMusic%2Fluci-app-unblockneteasemusic?ref=badge_shield)

### 功能说明
1. 支持自定义音源选择，一般设置默认即可；如需高音质音乐，推荐选择“酷我”或“咪咕”
2. 支持使用 IPset / Hosts 自动劫持相关请求，客户端无需设置代理即可使用
3. 支持 HTTPS 劫持，客户端信任证书后即可正常使用
4. 支持将服务公开至公网（默认监听局域网），支持开启严格模式
5. 支持设定代理，支持指定网易云音乐服务器 IP，支持设定 EndPoint
6. 支持手动/自动更新 Core，确保插件正常运作
7. 支持设定 JOOX/Migu/QQ Cookie / Youtube API，以正常使用相关音源
8. 支持无损音质（目前支持 酷狗、酷我、咪咕、pyncmd、QQ 音源）

### 编译
```bash
    #进入 OpenWrt 源码 package 目录
    cd package
    #克隆插件源码
    git clone https://github.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic.git
    #返回上一层目录
    cd ..
    #配置
    make menuconfig
    #在 luci -> application 选中插件，开始编译
    make package/luci-app-unblockneteasemusic/compile V=s
```

### 使用方法
- #### 路由器插件配置
1. 在路由器 LuCI 界面“服务”选项中找到“解除网易云音乐播放限制”
2. 勾选“启用本插件”
3. “音源接口”选择“默认”（高音质音源推荐选择“酷我”或“咪咕”）
4. 点击“保存&应用”
- 现在您局域网下的所有设备，（一般情况下）无需任何设置即可自动解除网易云音乐播放限制
- ##### 特别说明
1. 首次使用本插件时，将会在后台下载核心程序，故启动时间可能会稍微长一点
2. 如需使用网页端，请额外安装 Tampermonkey 插件：[NeteaseMusic UI Unlocker](https://greasyfork.org/zh-CN/scripts/382285-neteasemusic-ui-unlocker)
3. 推荐在客户端信任 [UnblockNeteaseMusic 证书](https://raw.githubusercontent.com/UnblockNeteaseMusic/server/enhanced/ca.crt)，以便 HTTPS 通讯（若您不放心，也可以[自行签发证书](https://github.com/nondanee/UnblockNeteaseMusic/issues/48#issuecomment-477870013)）
4. Android 网易云音乐客户端版本不得大于 [8.0.20](https://www.wandoujia.com/apps/293217/history_v8000020)

### 效果图
#### LuCI 界面
  ![Image text](https://raw.githubusercontent.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic/master/views/view1.jpg)
  ![Image text](https://raw.githubusercontent.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic/master/views/view2.jpg)
  ![Image text](https://raw.githubusercontent.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic/master/views/view3.jpg)
#### UWP 网易云音乐客户端
  ![Image text](https://raw.githubusercontent.com/UnblockNeteaseMusic/luci-app-unblockneteasemusic/master/views/view4.jpg)

### 鸣谢
[UnblockNeteaseMusic](https://github.com/UnblockNeteaseMusic/server)的开发者：[nondanee](https://github.com/nondanee)、[pan93412](https://github.com/pan93412)、[1715173329](https://github.com/1715173329)<br/>
[luci-app-unblockmusic](https://github.com/maxlicheng/luci-app-unblockmusic)的开发者：[maxlicheng](https://github.com/maxlicheng)<br/>
[luci-app-unblockmusic（二次修改）](https://github.com/coolsnowwolf/lede/tree/master/package/lean/luci-app-unblockmusic)的开发者：[Lean](https://github.com/coolsnowwolf)<br/>
IPSet 劫持方式指导：[恩山 692049#125 楼](https://www.right.com.cn/forum/forum.php?mod=viewthread&tid=692049&page=9#pid4104303) [rufengsuixing](https://github.com/rufengsuixing/luci-app-unblockmusic) [binsee](https://github.com/binsee/luci-app-unblockmusic)<br/>
Hosts劫持方式指导：[UnblockNeteaseMusic](https://github.com/nondanee/UnblockNeteaseMusic) [云音乐安卓又搞事啦](https://jixun.moe/post/netease-android-hosts-bypass/)<br/>
核心程序版本检测方法指导：[vernesong](https://github.com/vernesong)

### 协议
本项目使用 [GPL-3.0-only](https://spdx.org/licenses/GPL-3.0-only.html) 协议授权<br/>
在遵循此协议的前提下，你可以自由修改和分发

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FUnblockNeteaseMusic%2Fluci-app-unblockneteasemusic.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FUnblockNeteaseMusic%2Fluci-app-unblockneteasemusic?ref=badge_large)
