"""Exercise the production RPC script with real OpenWrt apk-tools and signed APKs.

Usage: python tests/update-integration.py
Requires Docker. Only HTTPS downloads are replaced by deterministic fixture transport.
The native package manager, version comparison, signatures, RPC script and locks are real.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / '.cache' / 'update-tests'
ALPINE = 'alpine:3.23@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2'
OPENWRT = 'openwrt/rootfs:x86_64-25.12.6@sha256:14401c04218c2e0da0448f099710ada2460636a92395f353351cc616cf3f67af'
RPC = '/usr/libexec/rpcd/luci.carbon_update'


def docker(*args, input=None, check=True):
    result = subprocess.run(['docker', *args], input=input.encode('utf-8') if input is not None else None,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=check, timeout=150)
    return subprocess.CompletedProcess(result.args, result.returncode, result.stdout.decode('utf-8'), result.stderr.decode('utf-8'))


class UpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        FIXTURES.mkdir(parents=True, exist_ok=True)
        docker('run', '--rm', '--mount', f'type=bind,source={ROOT},target=/source,readonly',
               '--mount', f'type=bind,source={FIXTURES},target=/fixtures', ALPINE,
               'sh', '-c', 'apk add --no-cache openssl && sh /source/tests/make-update-fixtures.sh')
        cls.container = docker('run', '-d', '--mount', f'type=bind,source={ROOT},target=/source,readonly',
                               OPENWRT, 'sleep', '3600').stdout.strip()
        try:
            cls.shell('apk add curl ca-bundle flock')
            cls.shell('mkdir -p /usr/share/carbon/keys /usr/libexec/rpcd /tmp/transport; '
                      'cp /source/root/usr/libexec/rpcd/luci.carbon_update ' + RPC + '; chmod 755 ' + RPC)
            cls.put('/tmp/transport/curl', '''#!/bin/sh
out=''; url=''
while [ "$#" -gt 0 ]; do
  case "$1" in -o) out=$2; shift ;; https://*) url=$1 ;; esac
  shift
done
[ ! -f /tmp/network-fail ] || { echo 'fixture network failure' >&2; exit 7; }
[ ! -f /tmp/slow-download ] || sleep 2
case "$url" in
  https://mirror.test/https://github.com/mrjoechen/luci-theme-carbon/releases/download/v*/luci-theme-carbon-*.apk)
    echo "$url" >> /tmp/mirror-hits
    [ ! -f /tmp/mirror-fail ] || exit 7
    if [ -f /tmp/mirror-corrupt ]; then printf corrupt > "$out"; else cp /tmp/candidate.apk "$out"; fi ;;
  https://api.github.com/repos/mrjoechen/luci-theme-carbon/releases/latest) cp /tmp/metadata.json "$out" ;;
  https://github.com/mrjoechen/luci-theme-carbon/releases/download/v*/luci-theme-carbon-*.apk) cp /tmp/candidate.apk "$out" ;;
  *) echo 'Unexpected download URL' >&2; exit 22 ;;
esac
''')
            cls.shell('chmod 755 /tmp/transport/curl')
        except Exception:
            docker('rm', '-f', cls.container)
            raise

    @classmethod
    def tearDownClass(cls):
        docker('rm', '-f', cls.container)

    @classmethod
    def shell(cls, command):
        return docker('exec', cls.container, 'sh', '-c', command).stdout

    @classmethod
    def put(cls, path, content):
        docker('exec', '-i', cls.container, 'sh', '-c', 'cat > "$1"', 'sh', path, input=content)

    def rpc(self, method, payload=None):
        result = docker('exec', '-i', '-e', 'PATH=/tmp/transport:/usr/sbin:/usr/bin:/sbin:/bin',
                        self.container, RPC, 'call', method, input=json.dumps(payload or {}))
        return json.loads(result.stdout)

    def wait(self):
        end = time.monotonic() + 15
        while time.monotonic() < end:
            state = self.rpc('status')
            if not state.get('busy'):
                return state
            time.sleep(.1)
        self.fail('Worker did not finish')

    def setUp(self):
        self.shell('apk --repositories-file /dev/null del luci-theme-carbon >/dev/null 2>&1 || true; '
                   'rm -rf /tmp/carbon-update; rm -f /tmp/network-fail /tmp/slow-download /tmp/carbon-install-count; '
                   'rm -f /tmp/mirror-hits /tmp/mirror-fail /tmp/mirror-corrupt /etc/config/carbon; '
                   'cp /source/.cache/update-tests/keys/carbon-apk.pem /usr/share/carbon/keys/; '
                   'apk --keys-dir /usr/share/carbon/keys --repositories-file /dev/null --no-network add '
                   '/source/.cache/update-tests/luci-theme-carbon-1.0.0-r1.apk >/dev/null')
        self.candidate()
        self.put('/etc/config/carbon-test', 'config preferences\n option language zh_cn\n option style dark\n')

    def candidate(self, filename='luci-theme-carbon-1.1.0-r1.apk', **changes):
        content = (FIXTURES / filename).read_bytes()
        self.shell(f'cp /source/.cache/update-tests/{filename} /tmp/candidate.apk')
        self.metadata = dict(tag_name='v1.1.0', draft=False, prerelease=False, body='<script>not HTML</script>', assets=[
            dict(name='luci-theme-carbon-1.1.0-r1.apk', size=len(content), digest='sha256:' + hashlib.sha256(content).hexdigest())])
        self.metadata.update(changes)
        self.put('/tmp/metadata.json', json.dumps(self.metadata))

    def checked(self):
        self.assertTrue(self.rpc('check').get('started'))
        result = self.wait()
        self.assertEqual(result['state'], 'idle', result)
        return result

    def assert_rejected(self, error):
        self.checked()
        self.assertTrue(self.rpc('upgrade', dict(version='1.1.0-r1')).get('started'))
        result = self.wait()
        self.assertEqual(result['error'], error, result)
        self.assertEqual(result['current'], '1.0.0-r1')
        self.assertEqual(self.shell('wc -l < /tmp/carbon-install-count').strip(), '1')

    def test_signed_upgrade_and_settings_preserved(self):
        result = self.checked()
        self.assertTrue(result['can_upgrade'])
        self.shell('uci set luci.main.lang=zh_cn; uci set luci.main.mediaurlbase=/luci-static/carbon; uci commit luci')
        before = self.shell('cat /etc/config/carbon-test; uci show luci.main')
        self.assertTrue(self.rpc('upgrade', dict(version='1.1.0-r1'))['started'])
        result = self.wait()
        self.assertEqual((result['state'], result['current']), ('success', '1.1.0-r1'), result)
        self.assertEqual(self.shell('cat /etc/config/carbon-test; uci show luci.main'), before)
        self.assertFalse(result['can_upgrade'])
        self.assertEqual(self.rpc('upgrade', dict(version='1.1.0-r1'))['error'], 'stale')

    def test_unsigned_apk_rejected_even_with_matching_sha(self):
        self.candidate('unsigned.apk')
        self.assert_rejected('signature')

    def test_wrong_signer_rejected_even_with_matching_sha(self):
        self.candidate('wrong.apk')
        self.assert_rejected('signature')

    def test_signed_package_with_wrong_actual_version_rejected(self):
        self.candidate('luci-theme-carbon-1.2.0-r1.apk')
        self.assert_rejected('metadata')

    def test_checksum_failure_never_installs(self):
        self.checked()
        self.shell("printf 'corrupt' >> /tmp/candidate.apk")
        self.assertTrue(self.rpc('upgrade', dict(version='1.1.0-r1'))['started'])
        self.assertEqual(self.wait()['error'], 'checksum')

    def test_network_failure_is_reported_and_retry_recovers(self):
        self.shell('touch /tmp/network-fail')
        self.rpc('check')
        self.assertEqual(self.wait()['error'], 'network')
        self.shell('rm /tmp/network-fail')
        self.assertTrue(self.checked()['can_upgrade'])

    def test_invalid_or_prerelease_metadata_rejected(self):
        for changes in [dict(prerelease=True), dict(tag_name='v1.1.0;reboot'), dict(assets=[])]:
            self.candidate(**changes)
            self.rpc('check')
            self.assertEqual(self.wait()['error'], 'metadata')

    def test_duplicate_request_and_resume_status(self):
        self.checked()
        self.shell('touch /tmp/slow-download')
        self.assertTrue(self.rpc('upgrade', dict(version='1.1.0-r1'))['started'])
        self.assertEqual(self.rpc('upgrade', dict(version='1.1.0-r1'))['error'], 'busy')
        self.assertTrue(self.rpc('status')['busy'])
        self.assertEqual(self.wait()['state'], 'success')

    def test_stale_and_unchecked_requests_rejected(self):
        self.assertEqual(self.rpc('upgrade', dict(version='1.1.0-r1'))['error'], 'stale')
        self.checked()
        self.assertEqual(self.rpc('upgrade', dict(version='1.2.0-r1'))['error'], 'stale')
        self.assertEqual(self.rpc('upgrade', dict(version=';reboot'))['error'], 'invalid')
        cached = json.loads(self.shell('cat /tmp/carbon-update/release.json'))
        cached['checked'] -= 1801
        self.put('/tmp/carbon-update/release.json', json.dumps(cached))
        self.assertFalse(self.rpc('status')['can_upgrade'])
        self.assertEqual(self.rpc('upgrade', dict(version='1.1.0-r1'))['error'], 'stale')

    def test_mirror_setting_is_validated(self):
        for bad in ['http://mirror.test/', 'https://mirror.test/;reboot', 'https://user@mirror.test/', 'ftp://x/', 'https://-bad/']:
            self.assertEqual(self.rpc('configure', dict(mirror=bad)).get('error'), 'invalid_mirror', bad)
        self.assertEqual(self.rpc('configure', dict(mirror=' https://mirror.test ')), dict(mirror='https://mirror.test/'))
        self.assertEqual(self.rpc('status')['mirror'], 'https://mirror.test/')
        self.assertEqual(self.rpc('configure', dict(mirror='')), dict(mirror=''))
        self.assertEqual(self.rpc('status')['mirror'], '')

    def test_mirror_download_is_used_and_verified(self):
        self.rpc('configure', dict(mirror='https://mirror.test/'))
        self.checked()
        self.assertTrue(self.rpc('upgrade', dict(version='1.1.0-r1'))['started'])
        result = self.wait()
        self.assertEqual((result['state'], result['current']), ('success', '1.1.0-r1'), result)
        self.assertEqual(self.shell('wc -l < /tmp/mirror-hits').strip(), '1')

    def test_bad_or_unreachable_mirror_falls_back_to_github(self):
        self.rpc('configure', dict(mirror='https://mirror.test/'))
        for flag in ['mirror-corrupt', 'mirror-fail']:
            self.setUp()
            self.rpc('configure', dict(mirror='https://mirror.test/'))
            self.shell('touch /tmp/' + flag)
            self.checked()
            self.assertTrue(self.rpc('upgrade', dict(version='1.1.0-r1'))['started'])
            result = self.wait()
            self.assertEqual((result['state'], result['current']), ('success', '1.1.0-r1'), (flag, result))
            self.assertIn('Downloading from github', result['log'])

    def test_downgrade_rejected(self):
        self.candidate('luci-theme-carbon-1.0.0-r1.apk', tag_name='v0.9.0')
        self.metadata['assets'][0]['name'] = 'luci-theme-carbon-0.9.0-r1.apk'
        self.put('/tmp/metadata.json', json.dumps(self.metadata))
        self.assertFalse(self.checked()['can_upgrade'])
        self.assertEqual(self.rpc('upgrade', dict(version='0.9.0-r1'))['error'], 'stale')


if __name__ == '__main__':
    unittest.main(verbosity=2)
