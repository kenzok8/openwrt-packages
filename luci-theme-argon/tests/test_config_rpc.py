import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


def executable(path, contents):
    path.write_text('#!/bin/sh\n' + contents)
    path.chmod(0o755)


class RpcTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.background = self.root / 'argon/background'
        self.background.mkdir(parents=True)
        self.upload = self.root / 'upload.tmp'
        self.upload.write_text('uploaded image')
        shim = self.root / 'jshn.sh'
        shim.write_text('''json_load() {
    FIXTURE_JSON=$1
    printf '%s' "$FIXTURE_JSON" | python3 -c 'import json,sys; json.load(sys.stdin)' 2>/dev/null
}
json_get_var() {
    fixture_value=$(printf '%s' "$FIXTURE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get(sys.argv[1], ""))' "$2")
    export "$1=$fixture_value"
}
json_cleanup() { :; }
''')
        source = (ROOT / 'root/usr/libexec/rpcd/luci.argon').read_text()
        self.script = self.root / 'luci.argon'
        self.script.write_text(source.replace('. /lib/functions.sh', ':')
                               .replace('. /usr/share/libubox/jshn.sh', f'. "{shim}"')
                               .replace('/www/luci-static/argon/background', str(self.background))
                               .replace('/tmp/argon_background.tmp', str(self.upload)))

    def call(self, method, arguments, env=None):
        process = subprocess.run(['sh', str(self.script), 'call', method],
                                 input=json.dumps(arguments) + '\n', text=True,
                                 capture_output=True, env=env, check=True)
        return json.loads(process.stdout)['result']

    def test_invalid_names_do_not_mutate_directories(self):
        for name in ['', '.', '..', '../outside.jpg', 'a/b.jpg', r'a\b.jpg', '/absolute.jpg']:
            for method, field in [('rename', 'newname'), ('remove', 'filename')]:
                with self.subTest(name=name, method=method):
                    before = [stat.S_IMODE(p.stat().st_mode) for p in [self.background, self.background.parent]]
                    self.assertNotEqual(self.call(method, {field: name}), 0)
                    self.assertEqual(before, [stat.S_IMODE(p.stat().st_mode) for p in [self.background, self.background.parent]])
                    self.assertTrue(self.upload.exists())

    def test_upload_and_delete_unicode_filename(self):
        name = '背景 image.jpg'
        self.assertEqual(self.call('rename', {'newname': name}), 0)
        target = self.background / name
        self.assertEqual(target.read_text(), 'uploaded image')
        self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o644)
        self.assertFalse(self.upload.exists())
        self.assertEqual(self.call('remove', {'filename': name}), 0)
        self.assertFalse(target.exists())

    def test_directory_and_symlink_upload_targets_are_rejected(self):
        outside = self.root / 'outside'
        outside.write_text('keep me')
        (self.background / 'directory').mkdir()
        (self.background / 'link.jpg').symlink_to(outside)
        (self.background / 'broken.jpg').symlink_to(self.root / 'missing')
        for name in ['directory', 'link.jpg', 'broken.jpg']:
            with self.subTest(name=name):
                self.assertNotEqual(self.call('rename', {'newname': name}), 0)
                self.assertTrue(self.upload.exists())
        self.assertEqual(outside.read_text(), 'keep me')
        self.assertNotEqual(self.call('remove', {'filename': 'directory'}), 0)
        self.assertTrue((self.background / 'directory').is_dir())

    def test_symlink_temporary_file_is_rejected(self):
        self.upload.unlink()
        outside = self.root / 'outside'
        outside.write_text('keep me')
        self.upload.symlink_to(outside)
        self.assertNotEqual(self.call('rename', {'newname': 'image.jpg'}), 0)
        self.assertEqual(outside.read_text(), 'keep me')

    def test_failed_remove_reports_failure(self):
        fakebin = self.root / 'fakebin'
        fakebin.mkdir()
        executable(fakebin / 'rm', 'exit 42\n')
        target = self.background / 'image.jpg'
        target.write_text('keep me')
        env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ['PATH'])
        self.assertNotEqual(self.call('remove', {'filename': 'image.jpg'}, env), 0)
        self.assertTrue(target.exists())

    def test_upload_rejects_non_media_files(self):
        for name in ['README.md', 'image.svg', 'script.html', 'file']:
            with self.subTest(name=name):
                self.assertNotEqual(self.call('rename', {'newname': name}), 0)
                self.assertTrue(self.upload.exists())
                self.assertFalse((self.background / name).exists())
        self.assertEqual(self.call('rename', {'newname': 'Background.JPG'}), 0)

    def test_invalid_json_is_rejected(self):
        process = subprocess.run(['sh', str(self.script), 'call', 'rename'],
                                 input='invalid json\n', text=True, capture_output=True, check=True)
        self.assertNotEqual(json.loads(process.stdout)['result'], 0)
        self.assertTrue(self.upload.exists())

    def test_read_acl_does_not_grant_mutation(self):
        acl = json.loads((ROOT / 'root/usr/share/rpcd/acl.d/luci-app-argon-config.json').read_text())['luci-app-argon-config']
        self.assertEqual(set(acl['read']['ubus']['luci.argon']), {'avail'})
        self.assertEqual(set(acl['write']['ubus']['luci.argon']), {'remove', 'rename'})


if __name__ == "__main__":
    unittest.main()
