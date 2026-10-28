#!/bin/sh

# Validate all arguments before touching logs, installing packages or sourcing
# metadata scripts. This script is also callable without the LuCI controller.
[ "$#" -gt 0 ] || { echo "No packages specified" >&2; exit 1; }
for pkg in "$@"; do
    case "$pkg" in
        ''|[!a-zA-Z0-9]*|*[!a-zA-Z0-9_.+-]*) echo "Invalid package name" >&2; exit 1 ;;
    esac
    [ "${#pkg}" -le 128 ] || { echo "Invalid package name" >&2; exit 1; }
done

> /var/log/auto_setup.success
> /var/log/auto_setup.failed
> /var/log/auto_setup.input

save_input() {
    local pkg
    for pkg in "$@"; do
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
    sh -c '. "$1"' sh "/usr/libexec/istorea/$pkg.sh"
}

auto_setup_apps() {
    local pkg
    for pkg in "$@"; do
        echo "Setting up $pkg..."
        if auto_setup_app "$pkg"; then
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
