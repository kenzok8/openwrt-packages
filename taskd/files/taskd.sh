#!/bin/sh

TASK_ID="$1"
TASK_CMD="$2"

exec </dev/null >>"/var/log/tasks/$TASK_ID.log" 2>&1

export HOME=/root
export TERM=xterm-256color

exec script -efqc 'onexit() {
    /etc/init.d/tasks _task_onstop "'"$TASK_ID"'" "$?"
}
trap onexit EXIT;
stty cols 80 rows 24;
'"$TASK_CMD" /dev/null
