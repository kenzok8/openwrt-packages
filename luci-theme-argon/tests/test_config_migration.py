"""Exercise configuration upgrades without writing the host's configuration."""
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ConfigMigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'etc/config').mkdir(parents=True)
        self.config = self.root / 'etc/config/argon'
        binary = self.root / 'bin'
        binary.mkdir()
        uci = binary / 'uci'
        uci.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
p = Path(os.environ['FIXTURE_CONFIG'])
state = json.loads(p.read_text()) if p.exists() and p.read_text().strip() else None
args = [a for a in sys.argv[1:] if a != '-q']
op = args.pop(0)
if op == 'get':
    parts = args[0].split('.')
    if len(parts) == 2:
        if state is None: sys.exit(1)
        print('global')
    else:
        if state is None or parts[-1] not in state: sys.exit(1)
        print(state[parts[-1]])
elif op == 'add':
    state = {}; print('cfg123456')
elif op == 'set':
    key, value = args[0].split('=', 1)
    state[key.split('.')[-1]] = value
elif op == 'delete':
    state.pop(args[0].split('.')[-1], None)
elif op != 'commit':
    raise RuntimeError(args)
if op != 'get': p.write_text(json.dumps(state))
''')
        uci.chmod(0o755)
        self.env = dict(os.environ, FIXTURE_CONFIG=str(self.config),
                        PKG_UPGRADE='1', PATH=str(binary) + os.pathsep + os.environ['PATH'])
        script = (ROOT / 'root/etc/uci-defaults/30_luci-theme-argon').read_text()
        self.script = self.root / 'initialize'
        self.script.write_text(script.replace('/etc/', str(self.root / 'etc') + '/'))

    def initialize(self, state=None):
        if state is not None:
            self.config.write_text(json.dumps(state))
        subprocess.run(['sh', str(self.script)], env=self.env, check=True,
                       capture_output=True)
        return json.loads(self.config.read_text())

    def test_new_install_uses_original_glass_and_local_background(self):
        state = self.initialize()
        self.assertEqual(state['login_style'], 'classic')
        self.assertEqual(state['online_wallpaper'], 'none')
        self.assertEqual(state['blur'], '10')
        self.assertEqual(state['transparency'], '0.5')
        self.assertEqual(state['dark_primary_mode'], 'auto')
        self.assertEqual(state['dark_glass_mode'], 'inherit')
        self.assertEqual(self.initialize(), state)

    def test_old_dark_overrides_are_preserved_and_modes_are_idempotent(self):
        original = dict(primary='#008800', dark_primary='#abcdef', blur='8',
                        transparency='0.4', blur_dark='20', transparency_dark='0.8')
        state = self.initialize(original)
        self.assertEqual(state['dark_primary_mode'], 'custom')
        self.assertEqual(state['dark_glass_mode'], 'custom')
        for key, value in original.items():
            self.assertEqual(state[key], value)
        self.assertEqual(self.initialize(), state)
        shared = self.initialize(dict(blur='8', blur_dark='8', transparency='0', transparency_dark='0'))
        self.assertEqual(shared['dark_glass_mode'], 'inherit')
        explicit = self.initialize(dict(original, dark_primary_mode='auto', dark_glass_mode='inherit'))
        self.assertEqual(explicit['dark_primary_mode'], 'auto')
        self.assertEqual(explicit['dark_glass_mode'], 'inherit')
        self.assertEqual(explicit['dark_primary'], original['dark_primary'])
        self.assertEqual(explicit['blur_dark'], original['blur_dark'])

    def test_existing_options_and_private_keys_are_preserved(self):
        original = dict(login_style='centered', primary='#abcdef', blur='0',
                        transparency='0', online_wallpaper='unsplash', use_api_key='fixture-key')
        state = self.initialize(original)
        for key, value in original.items():
            self.assertEqual(state[key], value)
        self.assertEqual(self.initialize(), state)

    def test_old_bing_switch_migrates_without_overwriting_current_source(self):
        for old, source in [('0', 'none'), ('1', 'bing')]:
            with self.subTest(old=old):
                state = self.initialize({'bing_background': old})
                self.assertEqual(state['online_wallpaper'], source)
                self.assertNotIn('bing_background', state)
        state = self.initialize(dict(bing_background='1', online_wallpaper='wallhaven'))
        self.assertEqual(state['online_wallpaper'], 'wallhaven')
        self.assertNotIn('bing_background', state)

    def test_compatibility_package_hands_off_even_an_unmodified_conffile(self):
        recipe = (ROOT / 'compat/luci-app-argon-config/Makefile').read_text()
        script = re.search(r'define Package/luci-app-argon-config/preinst\n(.*?)\nendef',
                           recipe, re.S).group(1).replace('$$', '$')
        preinst = self.root / 'preinst'
        preinst.write_text(script)
        original = dict(login_style='classic', online_wallpaper='bing', blur='10')
        self.config.write_text(json.dumps(original))
        subprocess.run(['sh', str(preinst)], env=dict(self.env, IPKG_INSTROOT=str(self.root)),
                       check=True, capture_output=True)
        # Model the old package removing its formerly packaged default file.
        self.config.unlink()
        state = self.initialize()
        for key, value in original.items():
            self.assertEqual(state[key], value)
        self.assertFalse((self.root / 'etc/argon-config-migration').exists())
        marker = self.root / 'usr/share/argon/config-integrated'
        marker.parent.mkdir(parents=True)
        marker.touch()
        subprocess.run(['sh', str(preinst)], env=dict(self.env, IPKG_INSTROOT=str(self.root)),
                       check=True, capture_output=True)
        self.assertFalse((self.root / 'etc/argon-config-migration').exists())


if __name__ == '__main__':
    unittest.main()
