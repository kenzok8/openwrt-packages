#!/bin/sh

> /var/log/auto_setup.success
> /var/log/auto_setup.failed
> /var/log/auto_setup.input

save_input() {
    local pkg
    for pkg in $@; do
        echo "$pkg" >> /var/log/auto_setup.input
    done
}
save_input "$@"

. /lib/functions.sh

load_quickstart_cfg() {
    config_load quickstart || return $?

    local main_dir conf_dir pub_dir dl_dir tmp_dir
    config_get main_dir "main" main_dir
    [ -z "$main_dir" ] && { echo "Home dir not configured!" >&2 ; return 1 ; }
    config_get conf_dir "main" conf_dir "$main_dir/Configs"
    config_get pub_dir "main" pub_dir "$main_dir/Public"
    config_get tmp_dir "main" tmp_dir "$main_dir/Caches"
    config_get dl_dir "main" dl_dir "$pub_dir/Downloads"

    export ISTORE_CONF_DIR="$conf_dir"
    export ISTORE_DL_DIR="$dl_dir"
    export ISTORE_CACHE_DIR="$tmp_dir"
    export ISTORE_PUBLIC_DIR="$pub_dir"

    mkdir -p "$ISTORE_CONF_DIR" "$ISTORE_DL_DIR" "$ISTORE_CACHE_DIR" "$ISTORE_PUBLIC_DIR"
    chmod 777 "$ISTORE_DL_DIR"
}

auto_setup_app() {
    local pkg=$1
    is-opkg install "app-meta-$pkg" || return 1
    sh -c ". '/usr/libexec/istorea/$pkg.sh'"
}

auto_setup_apps() {
    local pkg
    for pkg in $@; do
        echo "Setting up $pkg..."
        if auto_setup_app $pkg; then
            echo "Set up $pkg success"
            echo "$pkg" >> /var/log/auto_setup.success
        else
            echo "Set up $pkg failed"
            echo "$pkg" >> /var/log/auto_setup.failed
        fi
    done
}

load_quickstart_cfg || exit $?

auto_setup_apps "$@"

[ ! -s /var/log/auto_setup.failed ]
