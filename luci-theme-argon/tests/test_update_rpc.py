"""Run the real update RPC with isolated package managers, HTTP and cache files."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
API = 'https://api.github.com/repos/jerrykuku/luci-theme-argon/releases/latest'


class UpdateRpcTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.cache = self.directory / 'cache.json'
        self.payload = self.directory / 'release.json'
        self.requests = self.directory / 'requests'
        fakebin = self.directory / 'bin'
        fakebin.mkdir()
        scripts = {
            'apk': '''case "$1" in
list) test -n "$APK_VERSION" || exit 1; v=$APK_VERSION; [ ! -f "$INSTALLED" ] || v=$(cat "$INSTALLED"); test -n "$v" || exit 1; printf 'luci-theme-argon-%s noarch [installed]\\n' "$v" ;;
version) test "$COMPARE_FAIL" != 1 || exit 1; [ "$3" = "$4" ] && printf '=\\n' || { [ "$3" = 3.0.0-r20261015 ] && printf '>\\n' || printf '<\\n'; } ;;
add) printf '%s\\n' "$@" >> "$MUTATIONS"; test "$INSTALL_FAIL" != 1 || { echo 'database locked'; exit 1; }; test "$WRONG_VERSION" = 1 || printf '3.0.0-r2' > "$INSTALLED"; echo 'Theme installed' ;;
esac
''',
            'opkg': '''case "$1" in
status) v=$OPKG_VERSION; [ ! -f "$INSTALLED" ] || v=$(cat "$INSTALLED"); test -n "$v" || exit 1; printf 'Package: luci-theme-argon\\nVersion: %s\\nStatus: install ok installed\\n' "$v" ;;
compare-versions) [ "$3" = "<<" ] && [ "$COMPARE_FAIL" != 1 ] && [ "$2" != "$4" ] && [ "$2" != 3.0.0-20261015 ] ;;
install) printf '%s\\n' "$@" >> "$MUTATIONS"; test "$INSTALL_FAIL" != 1 || { echo 'database locked'; exit 1; }; test "$WRONG_VERSION" = 1 || printf '3.0.0-2' > "$INSTALLED"; echo 'Theme installed' ;;
esac
''',
            'df': 'printf "Filesystem 1024-blocks Used Available Capacity Mounted on\\nroot 100000 1000 %s 1%% /\\n" "${FREE_KB:-99000}"\n',
            'wget': '''printf '%s\\n' "$@" >> "$REQUESTS"
test "$FETCH_FAIL" != 1 || exit 8
while [ "$#" -gt 0 ]; do
    if [ "$1" = -O ]; then shift; destination=$1; fi
    shift
done
case "$destination" in
*release.json) cp "$PAYLOAD" "$destination" ;;
*) sleep "${DOWNLOAD_DELAY:-0}"; test "$DOWNLOAD_FAIL" != 1 || exit 8; cp "$PACKAGE_DATA" "$destination" ;;
esac
'''
        }
        for name, content in scripts.items():
            path = fakebin / name
            path.write_text('#!/bin/sh\n' + content)
            path.chmod(0o755)
        helper = self.directory / 'json_fixture.py'
        helper.write_text('''import json,sys
root=json.load(sys.stdin); path=json.loads(sys.argv[1]); op=sys.argv[2]; args=sys.argv[3:]
obj=root
for key in path: obj=obj[int(key)] if isinstance(obj,list) else obj[key]
if op=='select':
    if args[0]=='..': path=path[:-1]
    else:
        child=obj[int(args[0])] if isinstance(obj,list) else obj[args[0]]
        if not isinstance(child,(dict,list)): raise ValueError('not a container')
        path.append(args[0])
    print(json.dumps(path))
elif op=='keys': print(' '.join(map(str,range(len(obj)) if isinstance(obj,list) else obj.keys())))
elif op=='get':
    value=obj.get(args[0],'')
    print(int(value) if isinstance(value,bool) else '' if value is None else value)
elif op=='add':
    obj[args[1]]=int(args[2]) if args[0]=='int' else bool(int(args[2])) if args[0]=='boolean' else {} if args[0]=='object' else args[2]
    print(json.dumps(root))
elif op=='validate':
    if not isinstance(root,(dict,list)): raise ValueError('invalid root')
''')
        shim = self.directory / 'jshn.sh'
        shim.write_text(f'''fixture_json() {{ printf '%s' "$FIXTURE_JSON" | python3 '{helper}' "$FIXTURE_PATH" "$@"; }}
json_load() {{ FIXTURE_JSON=$1; FIXTURE_PATH='[]'; fixture_json validate >/dev/null 2>&1; }}
json_load_file() {{ json_load "$(cat "$1")"; }}
json_init() {{ FIXTURE_JSON='{{}}'; FIXTURE_PATH='[]'; }}
json_get_var() {{ fixture_value=$(fixture_json get "$2"); export "$1=$fixture_value"; }}
json_get_keys() {{ fixture_value=$(fixture_json keys); export "$1=$fixture_value"; }}
json_select() {{ fixture_value=$(fixture_json select "$1" 2>/dev/null) || return 1; FIXTURE_PATH=$fixture_value; }}
json_add_string() {{ FIXTURE_JSON=$(fixture_json add string "$1" "$2"); }}
json_add_int() {{ FIXTURE_JSON=$(fixture_json add int "$1" "$2"); }}
json_add_boolean() {{ FIXTURE_JSON=$(fixture_json add boolean "$1" "$2"); }}
json_add_object() {{ FIXTURE_JSON=$(fixture_json add object "$1" ''); json_select "$1"; }}
json_close_object() {{ json_select ..; }}
json_set_namespace() {{
 if [ "$1" = upgrade_status ]; then FIXTURE_SAVED_JSON=$FIXTURE_JSON; FIXTURE_SAVED_PATH=$FIXTURE_PATH; export "$2=base";
 else FIXTURE_JSON=$FIXTURE_SAVED_JSON; FIXTURE_PATH=$FIXTURE_SAVED_PATH; fi
}}

json_dump() {{ printf '%s\\n' "$FIXTURE_JSON"; }}
''')
        self.script = self.directory / 'rpc.sh'
        self.script.write_text((ROOT / 'root/usr/libexec/rpcd/luci.argon_update').read_text()
                               .replace('/usr/share/libubox/jshn.sh', str(shim))
                               .replace('/var/run/argon-update/release.json', str(self.cache))
                               .replace('/var/run/argon-update', str(self.directory / 'state')))
        self.env = dict(os.environ, PATH=str(fakebin) + os.pathsep + os.environ['PATH'],
                        APK_VERSION='3.0.0-r1', OPKG_VERSION='', PAYLOAD=str(self.payload),
                        REQUESTS=str(self.requests), FETCH_FAIL='0', INSTALLED=str(self.directory / 'installed'),
                        MUTATIONS=str(self.directory / 'mutations'), PACKAGE_DATA=str(self.directory / 'package'))
        (self.directory / 'package').write_bytes(b'argon-package')
        self.release = {'tag_name': 'v3.0.0', 'draft': False, 'prerelease': False,
                        'published_at': '2026-10-16T01:00:00Z', 'body': '## 更新\n- 修复布局。',
                        'assets': [{'name': name, 'digest': 'sha256:' + hashlib.sha256(b'argon-package').hexdigest(), 'size': 13} for name in [
                            'luci-theme-argon-3.0.0-r1.apk', 'luci-theme-argon_3.0.0_all.ipk',
                            'luci-theme-argon-3.0.0-r2.apk', 'luci-theme-argon_3.0.0-2_all.ipk',
                            'luci-theme-argon-3.0.0-r1.apk', 'luci-theme-argon_3.0.0_all.ipk']]}
        self.payload.write_text(json.dumps(self.release))

    def call(self, method, **arguments):
        result = subprocess.run(['sh', str(self.script), 'call', method],
                                input=json.dumps(arguments) + '\n', env=self.env,
                                capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    def test_local_get_and_protocol_have_no_network_or_package_mutation(self):
        result = self.call('get')
        self.assertEqual(result['result'], 0)
        self.assertEqual(result['current_version'], '3.0.0-r1')
        self.assertFalse(result['can_upgrade'])
        self.assertEqual(result['upgrade']['phase'], 'idle')
        self.assertFalse(self.requests.exists())
        protocol = subprocess.check_output(['sh', str(self.script), 'list'], text=True)
        self.assertEqual(json.loads(protocol), {'get': {}, 'check': {}, 'status': {}, 'start': {'tag': 'String', 'package': 'String'}})
        self.env.update(APK_VERSION='', OPKG_VERSION='3.0.0-2')
        self.assertEqual(self.call('get')['package_manager'], 'opkg')
        self.assertEqual(self.call('get')['current_version'], '3.0.0-2')
        self.env['OPKG_VERSION'] = ''
        self.assertEqual(self.call('get')['current_version'], '')

    def test_check_uses_official_url_and_highest_matching_revision(self):
        result = self.call('check', url='http://untrusted.invalid/', version='99.0.0')
        self.assertEqual(result['result'], 0)
        self.assertEqual(result['apk'], 'luci-theme-argon-3.0.0-r2.apk')
        self.assertEqual(result['ipk'], 'luci-theme-argon_3.0.0-2_all.ipk')
        self.assertEqual(result['notes'], self.release['body'])
        self.assertEqual(result['current_version'], '3.0.0-r1')
        requests = self.requests.read_text()
        self.assertIn(API, requests)
        self.assertIn('Cache-Control: no-cache', requests)
        self.assertNotIn('untrusted.invalid', requests)
        self.assertEqual(self.cache.stat().st_mode & 0o777, 0o600)

    def test_success_cache_avoids_network_but_reloads_the_installed_version(self):
        self.call('check')
        before = self.requests.read_text()
        self.env['APK_VERSION'] = '3.0.0-r2'
        self.assertEqual(self.call('check')['current_version'], '3.0.0-r2')
        self.assertEqual(self.requests.read_text(), before)
        self.assertEqual(self.call('get')['tag'], 'v3.0.0')

    def test_expired_or_future_cache_refreshes_and_failed_refresh_keeps_notes(self):
        first = self.call('check')
        for checked_at in [int(time.time()) - 400, int(time.time()) + 1000]:
            old = dict(first, checked_at=checked_at)
            self.cache.write_text(json.dumps(old))
            self.env['FETCH_FAIL'] = '1'
            self.assertEqual(self.call('check')['result'], 1)
            self.assertEqual(json.loads(self.cache.read_text()), old)
            self.assertEqual(self.call('get')['notes'], first['notes'])

    def test_invalid_and_prerelease_responses_never_enter_cache(self):
        for value in ['not JSON', '{}', '[]', json.dumps(dict(self.release, draft=True)),
                      json.dumps(dict(self.release, prerelease=True)),
                      json.dumps(dict(self.release, tag_name='v3.1.0-beta.1'))]:
            with self.subTest(value=value[:60]):
                self.payload.write_text(value)
                self.assertNotEqual(self.call('check')['result'], 0)
                self.assertFalse(self.cache.exists())

    def test_mismatched_and_unsafe_asset_names_are_ignored(self):
        self.release['assets'] = [{'name': name} for name in [
            'luci-theme-argon-4.0.0-r2.apk', 'luci-theme-argon_4.0.0_all.ipk',
            'luci-theme-argon-3.0.0-r2.apk?evil', 'luci-theme-argon_3.0.0-../../tmp_all.ipk']]
        self.payload.write_text(json.dumps(self.release))
        result = self.call('check')
        self.assertEqual(result['result'], 0)
        self.assertEqual(result['apk'], '')
        self.assertEqual(result['ipk'], '')

    def test_linked_cache_is_not_read_or_overwritten_and_failed_download_is_retryable(self):
        outside = self.directory / 'outside'
        outside.write_text('keep me')
        self.cache.symlink_to(outside)
        self.assertNotIn('tag', self.call('get'))
        self.env['FETCH_FAIL'] = '1'
        self.assertEqual(self.call('check')['result'], 1)
        self.env['FETCH_FAIL'] = '0'
        self.assertEqual(self.call('check')['result'], 0)
        self.assertEqual(outside.read_text(), 'keep me')

    def test_acl_separates_read_only_status_and_write_install(self):
        acl = json.loads((ROOT / 'root/usr/share/rpcd/acl.d/luci-app-argon-config.json').read_text())['luci-app-argon-config']
        self.assertEqual(set(acl['read']['ubus']['luci.argon_update']), {'get', 'check', 'status'})
        self.assertEqual(acl['write']['ubus']['luci.argon_update'], ['start'])

    def start(self, **patch):
        return self.call('start', **dict({'tag': 'v3.0.0', 'package':
            'luci-theme-argon-3.0.0-r2.apk' if self.env['APK_VERSION'] else 'luci-theme-argon_3.0.0-2_all.ipk'}, **patch))

    def finished(self):
        for _ in range(100):
            result = self.call('status')
            if not result['upgrade']['active']:
                return result
            time.sleep(.05)
        self.fail('worker did not finish')

    def test_background_install_for_both_managers_and_status_survives_reloads(self):
        for manager in ['apk', 'opkg']:
            with self.subTest(manager=manager):
                installed = self.directory / 'installed'
                installed.unlink(missing_ok=True)
                self.env.update(APK_VERSION='3.0.0-r1' if manager == 'apk' else '',
                                OPKG_VERSION='3.0.0-1' if manager == 'opkg' else '')
                checked = self.call('check')
                self.assertTrue(checked['can_upgrade'])
                self.assertEqual(self.start()['result'], 0)
                done = self.finished()
                self.assertEqual(done['upgrade']['phase'], 'complete', done)
                self.assertEqual(done['current_version'], '3.0.0-r2' if manager == 'apk' else '3.0.0-2')
                self.assertFalse(self.call('get')['can_upgrade'])
                self.assertEqual(self.call('get')['upgrade']['phase'], 'complete')
                command = (self.directory / 'mutations').read_text()
                self.assertNotIn('force-', command)
                self.assertIn('Theme installed', done['upgrade']['log'])
                self.assertEqual((self.directory / 'state/status.json').stat().st_mode & 0o777, 0o600)
                self.assertEqual(list((self.directory / 'state').glob('job.*')), [])

    def test_start_rejects_changed_or_expired_metadata_unknown_versions_and_downgrades(self):
        self.assertEqual(self.start()['result'], 3)
        initial = self.call('check')
        for patch in [{'tag': 'v4.0.0'}, {'package': '../../unsafe.apk'}, {'package': 'luci-theme-argon-3.0.0-r1.apk'}]:
            self.assertEqual(self.start(**patch)['result'], 3)
        for value in ['unknown', '3.0.0-r2', '3.0.0-r20261015']:
            self.env['APK_VERSION'] = value
            self.assertEqual(self.start()['result'], 5)
        self.env['APK_VERSION'] = '3.0.0-r1'
        self.cache.write_text(json.dumps(dict(initial, checked_at=int(time.time()) - 301)))
        self.assertEqual(self.start()['result'], 3)
        self.assertFalse((self.directory / 'mutations').exists())

    def test_unverified_assets_remain_manual_downloads(self):
        for patch in [{'digest': None}, {'digest': 'bad'}, {'size': 0}, {'size': 9000000}]:
            self.cache.unlink(missing_ok=True)
            release = dict(self.release, assets=[dict(self.release['assets'][2], **patch)])
            self.payload.write_text(json.dumps(release))
            checked = self.call('check')
            self.assertEqual(checked['apk'], 'luci-theme-argon-3.0.0-r2.apk')
            self.assertFalse(checked['can_upgrade'])
            self.assertEqual(self.start()['result'], 3)
        self.assertFalse((self.directory / 'mutations').exists())

    def test_download_checksum_storage_and_package_manager_failures_are_retryable(self):
        self.call('check')
        for patch, error in [({'DOWNLOAD_FAIL': '1'}, 'network'), ({'FREE_KB': '10'}, 'space'),
                             ({'INSTALL_FAIL': '1'}, 'install'), ({'WRONG_VERSION': '1'}, 'install')]:
            with self.subTest(error=error):
                old = self.env.copy()
                self.env.update(patch)
                self.assertEqual(self.start()['result'], 0)
                result = self.finished()
                self.assertEqual(result['upgrade']['phase'], 'failed')
                self.assertEqual(result['upgrade']['error'], error, result)
                self.env = old
        (self.directory / 'package').write_bytes(b'wrong-package')
        self.assertEqual(self.start()['result'], 0)
        self.assertEqual(self.finished()['upgrade']['error'], 'checksum')
        (self.directory / 'package').write_bytes(b'argon-package')
        self.assertEqual(self.start()['result'], 0)
        self.assertEqual(self.finished()['upgrade']['phase'], 'complete')

    def test_one_worker_at_a_time_and_private_metadata_snapshot(self):
        self.call('check')
        self.env['DOWNLOAD_DELAY'] = '4'
        start = time.monotonic()
        self.assertEqual(self.start()['result'], 0)
        self.assertLess(time.monotonic() - start, 3)
        self.assertEqual(self.start()['result'], 4)
        self.assertTrue(self.call('get')['upgrade']['active'])
        cached = json.loads(self.cache.read_text())
        cached['apk_sha256'] = '0' * 64
        self.cache.write_text(json.dumps(cached))
        self.assertEqual(self.finished()['upgrade']['phase'], 'complete')
        mutations = (self.directory / 'mutations').read_text()
        self.assertEqual(mutations.count('add'), 1)

    def test_version_is_rechecked_after_download_before_mutation(self):
        self.call('check')
        self.env['DOWNLOAD_DELAY'] = '2'
        self.assertEqual(self.start()['result'], 0)
        (self.directory / 'installed').write_text('3.0.0-r2')
        self.assertEqual(self.finished()['upgrade']['error'], 'version')
        self.assertFalse((self.directory / 'mutations').exists())

    def test_internal_worker_refuses_to_run_or_clean_up_outside_its_private_job(self):
        result = subprocess.run(['sh', str(self.script), 'run', 'apk'], env=self.env,
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.script.exists())
        self.assertTrue(self.payload.exists())
        self.assertFalse((self.directory / 'mutations').exists())

    def test_interrupted_job_is_reported_without_a_stale_lock(self):
        state = self.directory / 'state'
        state.mkdir()
        (state / 'status.json').write_text(json.dumps({'phase': 'installing', 'version': '3.0.0-r2', 'error': ''}))
        self.assertEqual(self.call('status')['upgrade']['error'], 'interrupted')
        self.call('check')
        self.assertEqual(self.start()['result'], 0)
        self.assertEqual(self.finished()['upgrade']['phase'], 'complete')


if __name__ == '__main__':
    unittest.main()
