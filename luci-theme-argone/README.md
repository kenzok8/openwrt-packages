#### argon 原作者是jerrykuku
#### 改argone是为了编译方便

+ main 分支支持 luci-18.06
  ```bash
  git clone https://github.com/kenzok78/luci-theme-argone
  ```
+ 23 分支支持最新 luci
  ```bash
  git clone -b 23 https://github.com/kenzok78/luci-theme-argone
  ```

### 一键安装 (18.06 / main)

```sh
wget --no-check-certificate -O luci-theme-argone_1.8.4_all.ipk \
  https://github.com/kenzok78/luci-theme-argone/releases/download/v1.8.4/luci-theme-argone_1.8.4_all.ipk
opkg install luci-theme-argone_1.8.4_all.ipk
```

### 一键安装 (23 branch / 最新 luci)

```sh
wget --no-check-certificate -O luci-theme-argone_2.4.3_all.ipk \
  https://github.com/kenzok78/luci-theme-argone/releases/download/v2.4.3/luci-theme-argone_2.4.3_all.ipk
opkg install luci-theme-argone_2.4.3_all.ipk
```
