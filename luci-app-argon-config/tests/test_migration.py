"""Check the empty package's handoff without touching the host configuration."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
RECIPE = (ROOT / 'Makefile').read_text()
PREINST = re.search(r'define Package/luci-app-argon-config/preinst\n(.*?)\nendef',
                    RECIPE, re.S).group(1).replace('$$', '$')


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.script = self.root / 'preinst'
        self.script.write_text(PREINST)
        self.config = self.root / 'etc/config/argon'
        self.backup = self.root / 'etc/argon-config-migration/argon'
        self.config.parent.mkdir(parents=True)

    def run_preinst(self, **env):
        return subprocess.run(['sh', str(self.script)], check=False, capture_output=True,
                              env=dict(os.environ, IPKG_INSTROOT=str(self.root), **env))

    def test_fresh_install_has_no_configuration_to_migrate(self):
        self.assertEqual(self.run_preinst().returncode, 0)
        self.assertFalse(self.backup.exists())

    def test_legacy_configuration_is_preserved_byte_for_byte(self):
        data = b"# user settings\nconfig global\n\toption primary '#123456'\n"
        self.config.write_bytes(data)
        self.config.chmod(0o600)
        self.assertEqual(self.run_preinst().returncode, 0)
        self.assertEqual(self.backup.read_bytes(), data)
        self.assertEqual(self.backup.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.config.read_bytes(), data)

    def test_integrated_theme_does_not_create_a_stale_backup(self):
        self.config.write_text('existing integrated configuration')
        marker = self.root / 'usr/share/argon/config-integrated'
        marker.parent.mkdir(parents=True)
        marker.touch()
        self.assertEqual(self.run_preinst().returncode, 0)
        self.assertFalse(self.backup.exists())

    def test_backup_failure_stops_the_upgrade(self):
        self.config.write_text('keep me')
        binary = self.root / 'bin'
        binary.mkdir()
        shim = binary / 'cp'
        shim.write_text('#!/bin/sh\nexit 1\n')
        shim.chmod(0o755)
        self.assertNotEqual(self.run_preinst(PATH=str(binary) + os.pathsep + os.environ['PATH']).returncode, 0)
        self.assertEqual(self.config.read_text(), 'keep me')


if __name__ == '__main__':
    unittest.main()
