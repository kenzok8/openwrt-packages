"""Run shell RPC/build regressions in temporary directories; no router required."""
import ast
import json
import os
from pathlib import Path
import re
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

    def test_invalid_json_is_rejected(self):
        process = subprocess.run(['sh', str(self.script), 'call', 'rename'],
                                 input='invalid json\n', text=True, capture_output=True, check=True)
        self.assertNotEqual(json.loads(process.stdout)['result'], 0)
        self.assertTrue(self.upload.exists())

    def test_read_acl_does_not_grant_mutation(self):
        acl = json.loads((ROOT / 'root/usr/share/rpcd/acl.d/luci-app-argon-config.json').read_text())['luci-app-argon-config']
        self.assertEqual(set(acl['read']['ubus']['luci.argon']), {'avail'})
        self.assertEqual(set(acl['write']['ubus']['luci.argon']), {'remove', 'rename'})


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.builder = self.root / 'builder'
        self.builder.mkdir()
        for name in ['scripts', 'package', 'bin/luci-app-argon-config', 'bin/luci-theme-argon', 'logs']:
            (self.builder / name).mkdir(parents=True)
        (self.builder / 'feeds.conf.default').write_text('fixture feeds\n')
        (self.builder / 'logs/build.log').write_text('build log')
        executable(self.builder / 'scripts/feeds', '''[ "${FIXTURE_FEED_STATUS:-0}" -eq 0 ] || exit "$FIXTURE_FEED_STATUS"
if [ "$1" = update ]; then
    shift
    for feed in "$@"; do
        mkdir -p "feeds/$feed"
    done
elif [ "$1" = install ] && [ -d feeds/base ]; then
    # Model a core dependency resolved from the SDK's base feed.
    mkdir -p package/feeds/base/openssl
    printf 'fixture dependency' > package/feeds/base/openssl/Makefile
fi
''')
        fakebin = self.root / 'fakebin'
        fakebin.mkdir()
        executable(fakebin / 'sed', 'exit 0\n')  # Avoid BSD/GNU sed differences.
        executable(fakebin / 'nproc', 'echo 1\n')
        executable(fakebin / 'make', '''[ "$1" = defconfig ] && exit 0
[ "${FIXTURE_COMPILE_STATUS:-0}" -eq 0 ] || exit "$FIXTURE_COMPILE_STATUS"
if [ "${FIXTURE_REQUIRE_BASE:-0}" -eq 1 ] && [ ! -f package/feeds/base/openssl/Makefile ]; then
    echo 'fatal error: openssl/des.h: No such file or directory' >&2
    exit 86
fi
mkdir -p bin/packages/x86_64/base
if [ "${FIXTURE_MISSING_PACKAGE:-0}" -eq 0 ]; then
    printf 'package' > "bin/packages/x86_64/base/luci-app-argon-config.${FIXTURE_FORMAT:-ipk}"
fi
''')
        self.env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ['PATH'])
        self.script = self.root / 'build.sh'
        self.script.write_text((ROOT / '.github/workflows/build.sh').read_text().replace('cd /builder', f'cd "{self.builder}"'))

    def run_build(self, **variables):
        env = dict(self.env, **variables)
        return subprocess.run(['sh', str(self.script)], env=env, text=True, capture_output=True)

    def test_compile_failure_is_preserved_and_logs_are_archived(self):
        result = self.run_build(FIXTURE_COMPILE_STATUS='42')
        self.assertEqual(result.returncode, 42, result.stderr)
        self.assertTrue((self.builder / 'bin/logs.tar.xz').exists())

    def test_core_dependencies_are_available_for_compilation(self):
        result = self.run_build(FIXTURE_REQUIRE_BASE='1')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_feed_failure_stops_build(self):
        result = self.run_build(FIXTURE_FEED_STATUS='39')
        self.assertEqual(result.returncode, 39, result.stderr)
        self.assertTrue((self.builder / 'bin/luci-app-argon-config').exists())

    def test_missing_package_fails_even_if_compile_succeeds(self):
        result = self.run_build(FIXTURE_MISSING_PACKAGE='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('did not produce', result.stderr)

    def test_success_moves_packages_and_archives_logs(self):
        result = self.run_build(FIXTURE_FORMAT='apk')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.builder / 'package/luci-app-argon-config').is_dir())
        self.assertTrue((self.builder / 'package/luci-theme-argon').is_dir())
        self.assertTrue((self.builder / 'bin/logs.tar.xz').exists())


class TranslationTests(unittest.TestCase):
    def test_catalogs_cover_current_messages_and_preserve_placeholders(self):
        source = (ROOT / 'htdocs/luci-static/resources/view/argon-config.js').read_text()
        acl = json.loads((ROOT / 'root/usr/share/rpcd/acl.d/luci-app-argon-config.json').read_text())
        messages = set(re.findall(r"_\('([^']*)'\)", source)) | {'Argon Config', acl['luci-app-argon-config']['description']}
        catalogs = sorted((ROOT / 'po').glob('*/argon-config.po'))
        self.assertTrue(catalogs)
        for path in catalogs:
            language = path.parent.name
            translations = {}
            current = {}
            field = None
            for line in path.read_text().splitlines() + ['']:
                if not line:
                    if 'msgid' in current:
                        translations[current['msgid']] = current.get('msgstr', '')
                    current, field = {}, None
                elif line.startswith(('msgid ', 'msgstr ')):
                    field, value = line.split(' ', 1)
                    current[field] = ast.literal_eval(value)
                elif line.startswith('"') and field:
                    current[field] += ast.literal_eval(line)
            for message in messages:
                with self.subTest(language=language, message=message):
                    self.assertTrue(translations.get(message))
                    self.assertEqual(re.findall(r'%[^\s]*?[sm]', message), re.findall(r'%[^\s]*?[sm]', translations[message]))
                    self.assertEqual(re.findall(r'</?[^>]+>', message), re.findall(r'</?[^>]+>', translations[message]))


if __name__ == '__main__':
    unittest.main()
