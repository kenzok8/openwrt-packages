# luci-app-oled

This is the LuCI app written for openwrt (**tested only on NanoPi R2S**) which supports ssd 1306 0.91' oled display.

## Features|功能
---
### Dispaly Info|显示信息

**0. Enable|开启**

开启oled显示。

**1. Autoswitch|定时开关**

由于夜间oled的显示屏太亮，并且也几乎不会看它，所以应邀提供定时开关的功能，选中autoswitch之后，可以设置**显示**的起始和结束时间。

**2. Time|时间**

显示时间。

**3. IP|IP地址**

显示LAN口的IP地址，记得LAN口不可以去除**桥接**选项，否则失效。由于使用的是`br-lan`，因为不同固件可能会交换`eth0`和`eth1`。

**4. CPU Temp|CPU温度**

显示CPU温度。

**5. CPU Freq|CPU频率**

显示实时CPU频率

**6. Network Speed|网速**

提供不同接口的选择，`eth0`和`eth1`,个人可以按需修改。网速单位基准为字节(Byte)而不是一般的位（bit），[MB/s, KB/s, B/s]这样显示的数字能够比较小，不至于过长。

**7. Display Interval|显示间隔**

为了延缓oled的光衰，提供屏保服务，每隔设定的时间运行一次屏保程序。

---
### Screensavers|屏保

屏保提供不同的选择，默认推荐的是`Scroll Text|文字滚动`，其他的选择自行探索。

## Q&A

Q0. 如何使用该程序？|在那里找到luci界面？

A0. 该程序安装位置在luci界面的`services|服务`下的`OLED`，点击即可找到。

---

Q1. 是否会支持其他oled屏幕，例如同系列的0.96'的？

A1. 由于开发者身边并没有相应的屏幕去调试，所以是暂时不考虑吧。如果你想贡献代码，非常欢迎，请开PR。

---


Q2. 为什么我的IP地址显示错误？

A2. 很大原因是你修改了LAN接口的属性，例如去除了该接口的**桥接**属性。

---


Q3. 为什么我的oled不显示？

A3. 很有可能是您的固件内核驱动不完整，该程序的运行需要在内核驱动中加上**kmod-i2c-xxx**，见issue [#10](https://github.com/NateLol/luci-app-oled/issues/10)。

---

如果你在使用过程中还遇到问题，请开issue。
