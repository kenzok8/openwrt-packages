#!/bin/bash -e
wanstatus=$(ifconfig | grep wan | wc -l)
if [ "$wanstatus" = 0 ]; then
  echo "119.29.29.29"
  exit 0
fi
dnsstatus=$(ubus call network.interface.wan status | jsonfilter -e '@["dns-server"][0]' | wc -l)
if [ "$dnsstatus" = 0 ]; then
  echo "119.29.29.29"
  exit 0
fi
DNS0=`ubus call network.interface.wan status | jsonfilter -e '@["dns-server"][0]'`
if [[ $DNS0 =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "$DNS0"
else
  echo "119.29.29.29"
fi
exit 0
