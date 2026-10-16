"""Exercise the appearance RPC validation, transaction lifetime and ACL boundary."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AppearanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.log = self.directory / 'calls.jsonl'
        shim = self.directory / 'jshn.sh'
        shim.write_text('''json_load() {
 FIXTURE_JSON=$1
 printf '%s' "$FIXTURE_JSON" | python3 -c 'import json,sys; json.load(sys.stdin)' >/dev/null 2>&1
}
json_get_var() {
 value=$(printf '%s' "$FIXTURE_JSON" | python3 -c 'import json,sys; v=json.load(sys.stdin); print(v.get("mode", "") if isinstance(v,dict) else "")')
 export "$1=$value"
}
''')
        binary = self.directory / 'uci'
        binary.write_text('''#!/usr/bin/env python3
import json,os,sys
args=sys.argv[1:]
with open(os.environ['UCI_LOG'],'a') as f: f.write(json.dumps(args)+'\\n')
command=args[5]
if command==os.environ.get('FAIL_COMMAND'): sys.exit(1)
if command=='get': print('global' if args[6]=='argon.@global[0]' else os.environ.get('CURRENT_MODE','normal'))
''')
        binary.chmod(0o755)
        source = (ROOT / 'root/usr/libexec/rpcd/luci.argon_appearance').read_text()
        self.script = self.directory / 'rpc.sh'
        self.script.write_text(source.replace('/usr/share/libubox/jshn.sh', str(shim))
                               .replace('/tmp/argon-appearance.XXXXXX', str(self.directory / 'transaction.XXXXXX')))
        self.env = dict(os.environ, PATH=str(self.directory) + os.pathsep + os.environ['PATH'], UCI_LOG=str(self.log))

    def call(self, method, payload=None, raw=None, **environment):
        self.log.unlink(missing_ok=True)
        result = subprocess.run(['sh', str(self.script), 'call', method],
                                input=raw if raw is not None else json.dumps(payload or {}) + '\n',
                                text=True, capture_output=True, check=True, env=dict(self.env, **environment))
        self.assertFalse(list(self.directory.glob('transaction.*')))
        return json.loads(result.stdout), [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_get_sanitizes_legacy_values_without_writing(self):
        for value in ['normal', 'light', 'dark', 'bad-value', '']:
            result, calls = self.call('get', CURRENT_MODE=value)
            self.assertEqual(result, {'result': 0, 'mode': value if value in ['normal', 'light', 'dark'] else 'normal'})
            self.assertTrue(all(call[5] == 'get' for call in calls))

    def test_invalid_values_never_reach_uci(self):
        for value in ['', 'system', '../dark', 'dark;touch /tmp/injected', ['dark'], None, 1]:
            result, calls = self.call('set', {'mode': value})
            self.assertEqual(result['result'], 2)
            self.assertEqual(calls, [])
        self.assertEqual(self.call('set', raw='bad json\n')[0]['result'], 2)

    def test_only_mode_is_written_in_a_private_transaction(self):
        result, calls = self.call('set', {'mode': 'dark', 'primary': '#abcdef'})
        self.assertEqual(result, {'result': 0, 'mode': 'dark'})
        self.assertEqual([c[5:] for c in calls if c[5] != 'get'], [['set', 'argon.@global[0].mode=dark'], ['commit', 'argon']])
        self.assertEqual(len({c[4] for c in calls}), 1)
        self.assertTrue(calls[0][4].startswith(str(self.directory / 'transaction.')))
        self.assertEqual(self.call('set', {'mode': 'normal'})[1][-1][5], 'get')

    def test_failed_writes_do_not_report_success(self):
        for command in ['get', 'set', 'commit']:
            result, calls = self.call('set', {'mode': 'dark'}, FAIL_COMMAND=command)
            self.assertEqual(result['result'], 1)
            if command == 'set':
                self.assertFalse(any(c[5] == 'commit' for c in calls))

    def test_read_roles_cannot_write_appearance(self):
        for name in ['luci-theme-argon', 'luci-app-argon-config']:
            acl = json.loads((ROOT / f'root/usr/share/rpcd/acl.d/{name}.json').read_text())[name]
            self.assertEqual(acl['read']['ubus']['luci.argon_appearance'], ['get'])
        self.assertEqual(acl['write']['ubus']['luci.argon_appearance'], ['set'])
