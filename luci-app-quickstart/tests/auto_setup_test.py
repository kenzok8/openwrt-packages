"""Exercise the real script with task-owned paths and mocked package installs."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


class AutoSetupTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.logs = self.root / "log"
        self.logs.mkdir()
        (self.root / "bin").mkdir()
        (self.root / "metadata").mkdir()
        self.installed = self.root / "installed"
        self.configured = self.root / "configured"
        helper = self.root / "functions.sh"
        helper.write_text('config_load() { return 0; }\nconfig_get() { eval "$1=\\\"$FIXTURE_MAIN\\\""; }\n')
        installer = self.root / "bin/is-opkg"
        installer.write_text('#!/bin/sh\nprintf "%s\\n" "$@" >> "$FIXTURE_INSTALLED"\n')
        installer.chmod(0o700)
        source = (Path(__file__).resolve().parents[1] / "root/usr/libexec/quickstart/auto_setup.sh").read_text()
        source = source.replace("/var/log", str(self.logs)).replace("/lib/functions.sh", str(helper)).replace("/usr/libexec/istorea", str(self.root / "metadata"))
        self.script = self.root / "auto_setup.sh"
        self.script.write_text(source)
        self.env = dict(os.environ, PATH=str(self.root / "bin") + ":" + os.environ["PATH"], FIXTURE_MAIN=str(self.root / "data"), FIXTURE_INSTALLED=str(self.installed), FIXTURE_CONFIGURED=str(self.configured))

    def run_script(self, *args):
        return subprocess.run(["sh", str(self.script), *args], env=self.env, capture_output=True, text=True, timeout=5)

    def test_rejects_all_invalid_arguments_before_side_effects(self):
        for name in ("../other", "--help", "two packages", "pkg'", "", "a" * 129):
            result = self.run_script("aria2", name)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(self.installed.exists())
            self.assertEqual(list(self.logs.iterdir()), [])

    def test_normal_packages_install_configure_and_report(self):
        packages = ("aria2", "foo+bar_1.2-3")
        for name in packages:
            (self.root / "metadata" / (name + ".sh")).write_text('printf "%s\\n" "' + name + '" >> "$FIXTURE_CONFIGURED"\n')
        result = self.run_script(*packages)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.installed.read_text().splitlines(), ["install", "app-meta-aria2", "install", "app-meta-foo+bar_1.2-3"])
        self.assertEqual(self.configured.read_text().splitlines(), list(packages))
        self.assertEqual((self.logs / "auto_setup.success").read_text().splitlines(), list(packages))
        self.assertEqual((self.logs / "auto_setup.input").read_text().splitlines(), list(packages))
        self.assertEqual((self.logs / "auto_setup.failed").read_text(), "")


if __name__ == "__main__":
    unittest.main()
