"""Exercise the actual branding RPC against an isolated filesystem and JSON shim."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import struct
import subprocess
import tempfile
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]


def png(width=64, height=64, color=b'\x30\x70\xe0\xff'):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)) +
            chunk(b'IDAT', zlib.compress((b'\0' + color * width) * height)) + chunk(b'IEND', b''))


class BrandingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.directory = self.root / 'branding'
        self.lock = self.root / 'lock'
        self.prefix = str(self.root / 'upload_')
        shim = self.root / 'jshn.sh'
        shim.write_text('''json_load() {
    FIXTURE_JSON=$1
    printf '%s' "$FIXTURE_JSON" | python3 -c 'import json,sys; json.load(sys.stdin)' >/dev/null 2>&1
}
json_get_var() {
    fixture_value=$(printf '%s' "$FIXTURE_JSON" | python3 -c 'import json,sys; v=json.load(sys.stdin); print(v.get(sys.argv[1], "") if isinstance(v,dict) else "")' "$2")
    export "$1=$fixture_value"
}
json_init() { FIXTURE_JSON='{}'; }
json_add_string() {
    FIXTURE_JSON=$(printf '%s' "$FIXTURE_JSON" | python3 -c 'import json,sys; v=json.load(sys.stdin); v[sys.argv[1]]=sys.argv[2]; print(json.dumps(v))' "$1" "$2")
}
json_add_int() {
    FIXTURE_JSON=$(printf '%s' "$FIXTURE_JSON" | python3 -c 'import json,sys; v=json.load(sys.stdin); v[sys.argv[1]]=int(sys.argv[2]); print(json.dumps(v))' "$1" "$2")
}
json_dump() { printf '%s\\n' "$FIXTURE_JSON"; }
''')
        source = (ROOT / 'root/usr/libexec/rpcd/luci.argon_branding').read_text()
        self.script = self.root / 'rpc.sh'
        self.script.write_text(source.replace('/usr/share/libubox/jshn.sh', str(shim))
                               .replace('/www/luci-static/argon/branding', str(self.directory))
                               .replace('/tmp/argon_branding.lock', str(self.lock))
                               .replace('/tmp/argon_branding_', self.prefix))

    def call(self, method, args=None, env=None):
        result = subprocess.run(['sh', str(self.script), 'call', method], input=json.dumps(args or {}) + '\n',
                                capture_output=True, text=True, check=True, env=env)
        return json.loads(result.stdout)

    def upload(self, target='both', data=None):
        token = secrets.token_hex(16)
        Path(self.prefix + token + '.png').write_bytes(data if data is not None else png())
        result = self.call('set', {'target': target, 'token': token})
        self.assertFalse(self.lock.exists())
        self.assertFalse(list(self.directory.glob('.upload.*')))
        return result

    def test_independent_upload_reset_and_manifest(self):
        self.assertEqual(self.call('get'), {'result': 0, 'favicon': '', 'logo': ''})
        first = self.upload()
        image = 'image-' + hashlib.sha256(png()).hexdigest() + '.png'
        self.assertEqual(first, {'result': 0, 'favicon': image, 'logo': image})
        self.assertEqual(self.call('get'), first)
        manifest = json.loads((self.directory / image.replace('.png', '.webmanifest')).read_text())
        self.assertEqual(manifest['icons'], [{'src': image, 'sizes': '64x64', 'type': 'image/png'}])
        self.assertEqual((self.directory / image).stat().st_mode & 0o777, 0o644)
        self.assertEqual(self.directory.stat().st_mode & 0o777, 0o755)
        second = self.upload('logo', png(192, 48))
        self.assertEqual(second['favicon'], image)
        self.assertNotEqual(second['logo'], image)
        reset = self.call('reset', {'target': 'favicon'})
        self.assertEqual(reset['favicon'], '')
        self.assertEqual(reset['logo'], second['logo'])
        self.assertEqual(self.call('reset', {'target': 'both'}), {'result': 0, 'favicon': '', 'logo': ''})

    def test_invalid_images_leave_current_state_intact(self):
        first = self.upload()
        invalid = [b'<svg onload="alert(1)"></svg>', png()[:-4], png(15, 64), png(1025, 64),
                   png(64, 32), png() + b'\0' * 1048576, png().replace(b'IDAT', b'ABCD')]
        for data in invalid:
            with self.subTest(size=len(data)):
                self.assertEqual(self.upload(data=data)['result'], 2)
                self.assertEqual(self.call('get'), first)
                self.assertEqual(list(self.root.glob('upload_*')), [])

    def test_changed_content_changes_urls_and_old_generations_are_bounded(self):
        first = self.upload()
        self.assertEqual(self.upload(), first)
        for value in range(5):
            current = self.upload(data=png(color=bytes([value, 60, 90, 255])))
            self.assertNotEqual(current['favicon'], first['favicon'])
            self.assertLessEqual(len(list(self.directory.glob('*.png'))), 2)
            self.assertLessEqual(len(list(self.directory.glob('*.webmanifest'))), 2)
        self.assertEqual(self.call('get'), current)

    def test_invalid_targets_tokens_and_symlink_sources(self):
        for args in [{'target': '../elsewhere', 'token': 'a'*32}, {'target': 'logo', 'token': '../../etc/config/argon'},
                     {'target': 'both', 'token': 'b'*32}, {'target': 'logo', 'token': ''}]:
            self.assertEqual(self.call('set', args)['result'], 2)
        outside = self.root / 'outside.png'
        outside.write_bytes(png())
        Path(self.prefix + 'a'*32 + '.png').symlink_to(outside)
        self.assertEqual(self.call('set', {'target': 'logo', 'token': 'a'*32})['result'], 2)
        self.assertEqual(outside.read_bytes(), png())
        self.assertFalse(self.directory.exists())

    def test_corrupt_state_and_symlink_assets_fall_back(self):
        state = self.upload()
        (self.directory / 'current.json').write_text('{broken')
        self.assertEqual(self.call('get')['favicon'], '')
        (self.directory / 'current.json').write_text(json.dumps({'favicon': '../outside.png', 'logo': state['logo']}))
        self.assertEqual(self.call('get')['favicon'], '')
        image = self.directory / state['logo']
        image.unlink()
        image.symlink_to(self.root / 'missing')
        self.assertEqual(self.call('get')['logo'], '')

    def test_symlink_directory_and_index_cannot_overwrite_other_files(self):
        outside = self.root / 'outside'
        outside.mkdir()
        self.directory.symlink_to(outside)
        self.assertEqual(self.upload()['result'], 1)
        self.assertEqual(list(outside.iterdir()), [])
        self.directory.unlink()
        self.directory.mkdir()
        sentinel = outside / 'sentinel'
        sentinel.write_text('keep me')
        (self.directory / 'current.json').symlink_to(sentinel)
        self.assertEqual(self.upload()['result'], 1)
        self.assertEqual(sentinel.read_text(), 'keep me')

    def test_busy_and_failed_publication_preserve_state(self):
        first = self.upload()
        self.lock.mkdir()
        self.assertEqual(self.call('reset', {'target': 'both'})['result'], 3)
        self.lock.rmdir()
        fakebin = self.root / 'bin'
        fakebin.mkdir()
        (fakebin / 'mv').write_text('#!/bin/sh\nexit 1\n')
        (fakebin / 'mv').chmod(0o755)
        env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ['PATH'])
        self.assertEqual(self.call('reset', {'target': 'both'}, env=env)['result'], 1)
        self.assertEqual(self.call('get'), first)
        self.assertFalse(self.lock.exists())

    def test_backup_directory_contains_all_state_and_assets(self):
        first = self.upload()
        keep = (ROOT / 'root/lib/upgrade/keep.d/luci-argon-branding').read_text().splitlines()
        self.assertIn('/www/luci-static/argon/branding/', keep)
        shutil.copytree(self.directory, self.root / 'backup')
        shutil.rmtree(self.directory)
        shutil.copytree(self.root / 'backup', self.directory)
        self.assertEqual(self.call('get'), first)
        self.assertTrue((self.directory / first['favicon']).is_file())
        self.assertTrue((self.directory / first['favicon'].replace('.png', '.webmanifest')).is_file())

    def test_read_acl_and_fixed_upload_scope(self):
        acl = json.loads((ROOT / 'root/usr/share/rpcd/acl.d/luci-app-argon-config.json').read_text())['luci-app-argon-config']
        self.assertEqual(acl['read']['ubus']['luci.argon_branding'], ['get'])
        self.assertEqual(acl['write']['ubus']['luci.argon_branding'], ['set', 'reset'])
        self.assertEqual(acl['write']['file']['/tmp/argon_branding_*.png'], ['write'])
        self.assertFalse(any('branding' in name for name in acl['read']['file']))
        self.assertFalse(any(name.startswith('/www') for name in acl['write']['file']))
