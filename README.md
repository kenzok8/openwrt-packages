#### 说明

* 软件不定期同步大神库更新，适合一键下载到package目录下，用于openwrt编译


* 两位L大库里都删除了某软件，作为搬运工，passwall的依赖一并找齐了



- [passwall依赖库下载链接，注意！在openwrt或者lean源码下编译passwall，要下载此依赖库](https://github.com/kenzok8/small.git)
 


1、 lede/package$下运行 或者openwrt/package$下运行


```bash
 git clone https://github.com/kenzok8/openwrt-packages.git
```

 2、 或者添加下面代码到 openwrt 或lede源码根目录feeds.conf.default文件
 
```bash
 src-git kenzo https://github.com/kenzok8/openwrt-packages
```

 3、 passwall依赖
 
 ```bash
 src-git small https://github.com/kenzok8/small
 ```
 
- openwrt 固件编译自定义主题与软件
- luci-app-openclash       ------------------openclash图形         
- luci-app-advancedsetting ------------------系统高级设置
- luci-theme-ifit          ------------------透明主题（适配18.06修复主机名错误）
- luci-theme-atmaterial    ------------------atmaterial 三合一主题（适配18.06）     
- luci-app-aliddns         ------------------阿里云ddns
- luci-app-eqos            ------------------依IP地址限速
- luci-app-gost            ------------------隐蔽的https代理
- luci-app-adguardhome     ------------------去广告 
- luci-app-smartdns        ------------------smartdns防污染
- luci-app-passwall        ------------------Lienol大神 
- luci-theme-argon_new     ------------------二合一适配19.07与18.06的主题
- luci-app-ssr-plus        ------------------Lean大神 
- luci-theme-opentomcat    ------------------修复主机名错误（适配18.06）  
- luci-theme-opentomato    ------------------修复主机名错误（适配18.06）
#### 注意

* Lean大近期修改源码后，主题适配！



![暗黄主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-9.jpg)
![暗黄主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-10.jpg)
![暗黄主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-11.jpg)
![暗黑红主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-5.jpg)
![暗黑红主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-6.jpg)
![暗黑红主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-7.jpg)
![暗黑红主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-8.jpg)
![抹茶绿主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-12.jpg)
![抹茶绿主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-13.jpg)
![抹茶绿主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-14.jpg)
![argon主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-1.png)
![argon主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-2.png)
![argon主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-3.png)
![argon主题](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/sshot-4.png)
* 修复opentomato 与opentomcat修改主机名无效的bug
![修复tomto不能修改主机名的bug](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/%E5%B0%8F%E7%8C%AA%E5%AE%B6-719.png)
![修复tomto不能修改主机名的bug](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/%E5%B0%8F%E7%8C%AA%E5%AE%B6-722.png)
![修复cat不能修改主机名的bug](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/%E5%B0%8F%E7%8C%AA%E5%AE%B6-720.png)
![修复cat不能修改主机名的bug](https://raw.githubusercontent.com/kenzok8/openwrt-packages/master/screenshot/%E5%B0%8F%E7%8C%AA%E5%AE%B6-721.png)

