#!/bin/sh

case "$1" in
  save)
    if [ ! -z "$2" ]; then
      uci set linkease.@linkease[0].preconfig=$2
      uci commit
    fi
    ;;

  load)
    if [ -f "/usr/sbin/preconfig.data" ]; then
      data=`cat /usr/sbin/preconfig.data`
      uci set linkease.@linkease[0].preconfig=${data}
      uci commit
      rm /usr/sbin/preconfig.data
    else
      data=`uci get linkease.@linkease[0].preconfig`
    fi

    if [ -z "${data}" ]; then
      echo "nil"
    else
      echo "${data}"
    fi

    ;;

  status)
    echo "TODO"
    ;;

  *)
    echo "Usage: $0 {save|load|status}"
    exit 1
esac

