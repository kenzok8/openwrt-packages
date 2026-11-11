#!/bin/sh
# Run in Alpine with apk-tools 3 and OpenSSL; all keys are disposable test keys.
set -eu
cd /fixtures
mkdir -p keys wrong data/usr/share
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out private.pem
openssl pkey -in private.pem -pubout -out keys/carbon-apk.pem
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out wrong/private.pem
printf '#!/bin/sh\necho installed >> /tmp/carbon-install-count\n' > post-install
for version in 1.0.0-r1 1.1.0-r1 1.2.0-r1; do
  printf '%s\n' "$version" > data/usr/share/carbon-test-marker
  apk mkpkg --info "name:luci-theme-carbon" --info "version:$version" --info 'arch:noarch' \
    --files data --script post-install:post-install --script post-upgrade:post-install \
    --output "luci-theme-carbon-$version.apk"
done
cp luci-theme-carbon-1.1.0-r1.apk unsigned.apk
cp unsigned.apk wrong.apk
apk adbsign --allow-untrusted --sign-key wrong/private.pem wrong.apk
sh /source/scripts/sign-apk.sh private.pem keys/carbon-apk.pem luci-theme-carbon-*.apk
rm private.pem wrong/private.pem
