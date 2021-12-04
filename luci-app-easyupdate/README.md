
# luci-app-easyupdate（简易更新）

主要用于使用P3TERX/Actions-OpenWrt自动编译固件后的一键更新

### 使用方法

#### 需在下方步骤后
```yaml
    - name: Install feeds
      run: cd openwrt && ./scripts/feeds install -a -f
```
#### 添加如下步骤
```yaml
    - name: Openwrt AutoUpdate
      run: |
        TEMP=$(date +"OpenWrt_%Y%m%d_%H%M%S_")$(git rev-parse --short HEAD)
        echo "RELEASE_TAG=$TEMP" >> $GITHUB_ENV
        #required>>add "DISTRIB_GITHUB" to "zzz-default-settings"
        sed -i "/DISTRIB_DESCRIPTION=/a\sed -i '/DISTRIB_GITHUB/d' /etc/openwrt_release" openwrt/package/lean/default-settings/files/zzz-default-settings
        sed -i "/DISTRIB_GITHUB/a\echo \"DISTRIB_GITHUB=\'https://github.com/${{github.repository}}\'\" >> /etc/openwrt_release" openwrt/package/lean/default-settings/files/zzz-default-settings
        #required>>add "DISTRIB_VERSIONS" to "zzz-default-settings"
        sed -i "/DISTRIB_DESCRIPTION=/a\sed -i '/DISTRIB_VERSIONS/d' /etc/openwrt_release" openwrt/package/lean/default-settings/files/zzz-default-settings
        sed -i "/DISTRIB_VERSIONS/a\echo \"DISTRIB_VERSIONS=\'${TEMP:8}\'\" >> /etc/openwrt_release" openwrt/package/lean/default-settings/files/zzz-default-settings
        #nonessential>>add "github.actor" to "DISTRIB_DESCRIPTION" in "zzz-default-settings"
        sed -i "s/OpenWrt /${{github.actor}} compiled (${TEMP:8}) \/ OpenWrt /g" openwrt/package/lean/default-settings/files/zzz-default-settings
```

#### 将如下步骤的`tag_name`的值`${{ steps.tag.outputs.release_tag }}`
```yaml
    - name: Upload firmware to release
      uses: softprops/action-gh-release@v1
      if: steps.tag.outputs.status == 'success' && !cancelled()
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        tag_name: ${{ steps.tag.outputs.release_tag }}
        body_path: release.txt
        files: ${{ env.FIRMWARE }}/*
```

#### 更换为`${{ env.RELEASE_TAG }}`
```yaml
    - name: Upload firmware to release
      uses: softprops/action-gh-release@v1
      if: steps.tag.outputs.status == 'success' && !cancelled()
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      with:
        tag_name: ${{ env.RELEASE_TAG }}
        body_path: release.txt
        files: ${{ env.FIRMWARE }}/*
```

#### 也可以直接使用我修改好的actions
[Actions-OpenWrt](https://github.com/sundaqiang/Actions-OpenWrt)

### 效果展示
![easyupdate][1]

  [1]: https://raw.githubusercontent.com/sundaqiang/openwrt-packages/master/img/easyupdate.png