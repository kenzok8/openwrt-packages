# Minimal stand-in for /usr/share/libubox/jshn.sh: flat objects with string,
# integer and boolean values (enough for the logo methods).
json_init() { _J=''; }
json_add_string() { _J="$_J\"$1\":\"$2\","; }
json_add_int() { _J="$_J\"$1\":$2,"; }
json_add_boolean() { _J="$_J\"$1\":$2,"; }
json_dump() { printf '{%s}\n' "${_J%,}"; }
json_load() { _IN=$1; }
json_get_var() { eval "$1=\$(printf '%s' \"\$_IN\" | sed -n 's/.*\"$2\" *: *\"\\([^\"]*\\)\".*/\\1/p')"; }
