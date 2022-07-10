#!/bin/sh

DEVICE_IDX=0
LOG_LEVEL=2
while getopts u:x:l: flag
do
    case "${flag}" in
        u) TOKEN=${OPTARG};;
        x) DEVICE_IDX=${OPTARG};;
        l) LOG_LEVEL=${OPTARG};;
    esac
done

if [ -z "${TOKEN}" ]; then
  logger "ddnsto: the token is empty, get token from https://www.ddnsto.com/ "
  exit 2
fi

echo "ddnsto version device_id is is:"
/usr/sbin/ddnsto -u ${TOKEN} -w

_term() {
  logger "ddnsto: SIGTERM"
  killall ddnsto 2>/dev/null
  killall ddwebdav 2>/dev/null

  rm -f /tmp/.ddnsto.pid
  rm -f /tmp/.ddnsto.status
  rm -f /tmp/.ddnsto.up
  exit
}

trap "_term;" SIGTERM

while true ; do
  if ! pidof "ddnsto" > /dev/null ; then
    logger "ddnsto try running"
    /usr/sbin/ddnsto -u ${TOKEN} -x ${DEVICE_IDX} &
    PID=$!
    wait $PID
    RET=$?
    logger "ddnsto EXIT CODE: ${RET}"
    if [ "${RET}" == "100" ]; then
      logger "ddnsto token error, please set a correct token from https://www.ddnsto.com/ "
      exit 100
    fi
  fi
  sleep 20
done
