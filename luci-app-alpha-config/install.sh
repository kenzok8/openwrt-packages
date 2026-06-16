#!/bin/sh

apk_name="luci-app-alpha-config"
version="2.1"

echo "Updating packages"
if ! opkg update; then
    echo "Failed to update OPKG"
    exit 1
fi

echo "Downloading $apk_name"
if ! curl -LO "https://github.com/animegasan/$apk_name/releases/download/$version/${apk_name}_${version}_all.ipk"; then
    echo "Failed to download $apk_name"
    exit 1
fi

echo "Installing $apk_name"
if ! opkg install "${apk_name}_${version}_all.ipk"; then
    echo "Failed to install $apk_name"
    exit 1
fi

echo "Process completed. $apk_name has been installed."
