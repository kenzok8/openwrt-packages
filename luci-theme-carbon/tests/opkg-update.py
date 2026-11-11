"""Upgrade a legacy IPK using the real OpenWrt 24.10 opkg manager."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.cache' / 'opkg-update'
IMAGE = 'openwrt/rootfs:x86_64-24.10.8@sha256:9972a4b4747cd136abd597475d7b88c51a49fd849d0d53f069a2f4bf446061b9'


def docker(*args, input=None):
    r = subprocess.run(['docker', *args], input=input.encode() if input is not None else None,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180, check=True)
    return r.stdout.decode()


def archive(files):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w:gz') as tar:
        for name, content in files.items():
            content = content.encode() if isinstance(content, str) else content
            entry = tarfile.TarInfo('./' + name)
            entry.size = len(content)
            entry.mode = 0o755 if name == 'postrm' else 0o644
            tar.addfile(entry, io.BytesIO(content))
    return out.getvalue()


class OpkgUpgrade(unittest.TestCase):
    def test_legacy_hook_does_not_reset_preferences(self):
        OUT.mkdir(parents=True, exist_ok=True)
        control = archive({'control': 'Package: luci-theme-carbon\nVersion: 1.0.0-r1\nArchitecture: all\nDescription: Upgrade regression fixture\n',
                           'postrm': '#!/bin/sh\nuci set luci.main.mediaurlbase=/luci-static/bootstrap\nuci commit luci\n'})
        (OUT / 'legacy.ipk').write_bytes(archive({'control.tar.gz': control, 'data.tar.gz': archive({'usr/share/carbon-test-marker': 'old'}), 'debian-binary': '2.0\n'}))
        docker('run', '--rm', '--mount', f'type=bind,source={ROOT},target=/source,readonly',
               '--mount', f'type=bind,source={OUT},target=/out',
               'alpine:3.23@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2',
               'sh', '-c', 'apk add --no-cache tar && sh /source/scripts/build-ipk.sh /out')
        c = docker('run', '-d', '--mount', f'type=bind,source={ROOT},target=/source,readonly', IMAGE, 'sleep', '600').strip()
        def shell(command): return docker('exec', c, 'sh', '-c', command)
        def put(path, text): docker('exec', '-i', c, 'sh', '-c', 'cat > "$1"', 'sh', path, input=text)
        def rpc(method, payload=None):
            return json.loads(docker('exec', '-i', c, '/usr/libexec/rpcd/luci.carbon_update', 'call', method, input=json.dumps(payload or {})))
        def wait():
            for _ in range(100):
                result = rpc('status')
                if not result.get('busy'): return result
                time.sleep(.1)
            self.fail('Worker did not finish')
        try:
            shell('mkdir -p /var/lock; opkg update >/tmp/feeds.log 2>&1; opkg install curl ca-bundle flock >/tmp/tools.log 2>&1')
            shell('opkg install /source/.cache/opkg-update/legacy.ipk; cp -r /source/root/usr/. /usr/; chmod 755 /usr/libexec/rpcd/luci.carbon_update')
            fullversion = (ROOT / 'root/usr/share/carbon/version').read_text().strip()
            name = f'luci-theme-carbon_{fullversion}_all.ipk'
            content = (OUT / name).read_bytes()
            put('/tmp/release.json', json.dumps(dict(tag_name='v' + fullversion.split('-r')[0], draft=False, prerelease=False, body='IPK test',
                assets=[dict(name=name, size=len(content), digest='sha256:' + hashlib.sha256(content).hexdigest())])))
            shell('mv /usr/bin/curl /usr/bin/test-real-curl')
            put('/usr/bin/curl', '''#!/bin/sh
while [ "$#" -gt 0 ]; do
 case "$1" in -o) out=$2; shift ;; https://*) url=$1 ;; esac
 shift
done
case "$url" in
 */releases/latest) cp /tmp/release.json "$out" ;;
 *.ipk) cp /source/.cache/opkg-update/''' + name + ''' "$out" ;;
 *) exit 22 ;;
esac
''')
            shell('chmod 755 /usr/bin/curl; uci set luci.main.lang=zh_cn; uci set luci.main.mediaurlbase=/luci-static/carbon; uci commit luci')
            before = shell('uci show luci.main')
            self.assertTrue(rpc('check')['started'])
            self.assertTrue(wait()['can_upgrade'])
            self.assertTrue(rpc('upgrade', dict(version=fullversion))['started'])
            result = wait()
            self.assertEqual((result['state'], result['current']), ('success', fullversion), result)
            self.assertEqual(shell('uci show luci.main'), before)
            self.assertNotIn('syntax error', result['log'])
            self.assertFalse(result['can_upgrade'])
        finally:
            docker('rm', '-f', c)


if __name__ == '__main__':
    unittest.main(verbosity=2)
