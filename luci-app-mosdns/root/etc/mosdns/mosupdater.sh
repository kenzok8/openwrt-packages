#!/bin/bash -e
# shellcheck source=/dev/null
set -o pipefail
source /etc/mosdns/lib.sh

TMPDIR=$(mktemp -d) || exit 1
getdat geosite_cn.txt
getdat geosite_no_cn.txt
getdat geoip_cn.txt
if [ "$(grep -o cn "$TMPDIR"/geosite_cn.txt | wc -l)" -lt 100 ]; then
  rm -rf "$TMPDIR"/geosite_cn.txt
fi
if [ "$(grep -o google "$TMPDIR"/geosite_no_cn.txt | wc -l)" -eq 0 ]; then
  rm -rf "$TMPDIR"/geosite_no_cn.txt
fi
cp -rf "$TMPDIR"/* /etc/mosdns/rule
rm -rf "$TMPDIR"

syncconfig=$(uci -q get mosdns.mosdns.syncconfig)
if [ "$syncconfig" -eq 1 ]; then
  TMPDIR=$(mktemp -d) || exit 2
  getdat def_config_v5.yaml

  if [ "$(grep -o plugin "$TMPDIR"/def_config_v5.yaml | wc -l)" -eq 0 ]; then
    rm -rf "$TMPDIR"/def_config_v5.yaml
  else
    mv "$TMPDIR"/def_config_v5.yaml "$TMPDIR"/def_config_orig.yaml
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
