#!/bin/bash -e
# shellcheck source=/dev/null
set -o pipefail
source /etc/mosdns/lib.sh

TMPDIR=$(mktemp -d) || exit 1
getdat geoip.dat
getdat geosite.dat
if [ "$(grep -o CN "$TMPDIR"/geoip.dat | wc -l)" -eq 0 ]; then
  rm -rf "$TMPDIR"/geoip.dat
fi
if [ "$(grep -o .com "$TMPDIR"/geosite.dat | wc -l)" -lt 1000 ]; then
  rm -rf "$TMPDIR"/geosite.dat
fi
cp -rf "$TMPDIR"/* /usr/share/v2ray
rm -rf "$TMPDIR"

syncconfig=$(uci -q get mosdns.mosdns.syncconfig)
if [ "$syncconfig" -eq 1 ]; then
  TMPDIR=$(mktemp -d) || exit 2
  getdat def_config_v4.yaml

  if [ "$(grep -o plugin "$TMPDIR"/def_config_v4.yaml | wc -l)" -eq 0 ]; then
    rm -rf "$TMPDIR"/def_config_v4.yaml
  else
    mv "$TMPDIR"/def_config_v4.yaml "$TMPDIR"/def_config_orig.yaml
  fi
  cp -rf "$TMPDIR"/* /etc/mosdns
  rm -rf "$TMPDIR"
fi

adblock=$(uci -q get mosdns.mosdns.adblock)
if [ "$adblock" -eq 1 ]; then
  TMPDIR=$(mktemp -d) || exit 3
  getdat serverlist.txt

  if [ "$(grep -o .com "$TMPDIR"/serverlist.txt | wc -l)" -lt 1000 ]; then
    rm -rf "$TMPDIR"/serverlist.txt
  fi
  cp -rf "$TMPDIR"/* /etc/mosdns/rule
  rm -rf /etc/mosdns/rule/serverlist.bak "$TMPDIR"
fi

exit 0
