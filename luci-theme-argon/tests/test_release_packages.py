"""Check release metadata inside packages, independently of their filenames."""

import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / '.github/scripts/check_translation_versions.py'
SPEC = importlib.util.spec_from_file_location('translation_versions', SCRIPT)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)
PACKAGE = 'luci-i18n-argon-config-zh-cn'


def tar_bytes(name, data):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz') as archive:
        info = tarfile.TarInfo(name)
        info.size = len(data)
        archive.addfile(info, io.BytesIO(data))
    return output.getvalue()


def ipk(path, version, name=PACKAGE, ar=False):
    control = f'Package: {name}\nVersion: {version}\nArchitecture: all\n'.encode()
    data = tar_bytes('./control', control)
    if ar:
        header = f'{"control.tar.gz/":<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{len(data):<10}`\n'.encode()
        path.write_bytes(b'!<arch>\n' + header + data + (b'\n' if len(data) % 2 else b''))
    else:
        path.write_bytes(tar_bytes('./control.tar.gz', data))


class ReleasePackageTests(unittest.TestCase):
    def test_ipk_reads_internal_version_in_both_openwrt_archive_forms(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'package.ipk'
            for ar in [False, True]:
                ipk(path, 'v3.0.1', ar=ar)
                self.assertEqual(CHECK.ipk_metadata(path), (PACKAGE, 'v3.0.1'))

    def test_release_command_rejects_unknown_hidden_behind_correct_filename(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            path = directory / f'{PACKAGE}_v3.0.1_all.ipk'
            manifest = directory / 'manifest.txt'
            manifest.write_text(PACKAGE + '\n')
            command = [sys.executable, str(SCRIPT), '--format', 'ipk', '--directory', str(directory),
                       '--manifest', str(manifest), '--expected-version', 'v3.0.1']
            ipk(path, 'unknown')
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('expected', result.stderr)
            self.assertIn('unknown', result.stderr)
            ipk(path, 'v3.0.1')
            result = subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_duplicate_and_misnamed_translation_packages_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            with self.assertRaisesRegex(ValueError, 'expected one'):
                CHECK.verify(directory, 'ipk', [PACKAGE], 'v3.0.1')
            path = directory / f'{PACKAGE}_v3.0.1_all.ipk'
            ipk(path, 'v3.0.1', name='luci-i18n-argon-config-ru')
            with self.assertRaisesRegex(ValueError, 'got luci-i18n-argon-config-ru'):
                CHECK.verify(directory, 'ipk', [PACKAGE], 'v3.0.1')
            ipk(directory / f'{PACKAGE}_unknown_all.ipk', 'unknown')
            with self.assertRaisesRegex(ValueError, 'found 2'):
                CHECK.verify(directory, 'ipk', [PACKAGE], 'v3.0.1')
            with self.assertRaisesRegex(ValueError, 'unique'):
                CHECK.verify(directory, 'ipk', [PACKAGE, PACKAGE], 'v3.0.1')

    def test_apk_reads_version_only_from_package_info(self):
        for version in ['0', '3.0.1-r1', '3.1.0_beta1-r2']:
            dump = f'''# ADB package
info:
  name: {PACKAGE}
  version: {version}
paths:
  - name: etc
    files:
      - name: version
'''
            self.assertEqual(CHECK.apk_metadata(dump), (PACKAGE, version))


if __name__ == '__main__':
    unittest.main()
