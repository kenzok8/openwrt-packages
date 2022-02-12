#!/bin/bash -e
wanstatus=$(ifconfig | grep wan | wc -l)
if [ "$wanstatus" = 0 ]; then
  echo "101.226.4.6"
  exit 0
fi
dnsstatus=$(ubus call network.interface.wan status | jsonfilter -e '@["dns-server"][1]' | wc -l)
if [ "$dnsstatus" = 0 ]; then
  echo "101.226.4.6"
  exit 0
fi
DNS1=`ubus call network.interface.wan status | jsonfilter -e '@["dns-server"][1]'`
if [[ $DNS1 =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "$DNS1"
else
  echo "101.226.4.6"
fi
exit 0
