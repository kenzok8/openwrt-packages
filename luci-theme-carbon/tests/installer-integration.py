"""carbon-install.sh against the real apk (OpenWrt 25.12) and opkg (24.10) managers.

Usage: python3 tests/installer-integration.py      (requires Docker and network access)
Fixture packages are disposable: the APK is signed with a throwaway test key, the
IPK only carries marker files. Dependencies come from the official feeds.
"""
import io
from pathlib import Path
import shutil
import subprocess
import tarfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / '.cache' / 'update-tests'
OUT = ROOT / '.cache' / 'installer-tests'
ALPINE = 'alpine:3.23@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2'
APK_IMAGE = 'openwrt/rootfs:x86_64-25.12.6@sha256:14401c04218c2e0da0448f099710ada2460636a92395f353351cc616cf3f67af'
OPKG_IMAGE = 'openwrt/rootfs:x86_64-24.10.8@sha256:9972a4b4747cd136abd597475d7b88c51a49fd849d0d53f069a2f4bf446061b9'
DEPS = "CARBON_DEPS='curl ca-bundle flock'"   # luci-base is not needed by the fixtures
PREPARE = ('mkdir -p /usr/share/ucode/luci/template /var/lock && touch /usr/share/ucode/luci/template/header.ut /etc/config/luci && '
           'uci set luci.main=core && uci set luci.themes=internal && uci commit luci')


def docker(*args, check=True):
    r = subprocess.run(['docker', *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
    out = r.stdout.decode()
    if check and r.returncode:
        raise AssertionError(f'docker {" ".join(args[:3])}… exited {r.returncode}:\n{out}')
    return r.returncode, out


def archive(files):
    # Like ipkg-build: parent directory entries first, then the files.
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w:gz') as tar:
        dirs = sorted({'/'.join(name.split('/')[:i]) for name in files for i in range(1, name.count('/') + 1)})
        for d in dirs:
            entry = tarfile.TarInfo('./' + d)
            entry.type, entry.mode = tarfile.DIRTYPE, 0o755
            tar.addfile(entry)
        for name, content in files.items():
            content = content.encode() if isinstance(content, str) else content
            entry = tarfile.TarInfo('./' + name)
            entry.size, entry.mode = len(content), 0o644
            tar.addfile(entry, io.BytesIO(content))
    return out.getvalue()


def fixture_ipk(path):
    control = archive({'control': 'Package: luci-theme-carbon\nVersion: 1.1.0-r1\nDepends: curl, ca-bundle, flock\n'
                                   'Architecture: all\nDescription: installer test fixture\n'})
    data = archive({'www/luci-static/carbon/marker': 'ipk\n', 'usr/share/carbon/version': '1.1.0-r1\n'})
    path.write_bytes(archive({'debian-binary': '2.0\n', 'control.tar.gz': control, 'data.tar.gz': data}))


def build(name, *args):
    subprocess.run(['sh', str(ROOT / 'scripts' / 'build-installer.sh'), str(OUT / name), *map(str, args)],
                   check=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    return f'/source/.cache/installer-tests/{name}/carbon-install.sh'


class Router:
    def __init__(self, image):
        self.id = docker('run', '-d', '--mount', f'type=bind,source={ROOT},target=/source,readonly', image, 'sleep', '900')[1].strip()
        self.sh(PREPARE)

    def sh(self, command, check=True):
        return docker('exec', self.id, 'sh', '-c', command, check=check)

    def close(self):
        docker('rm', '-f', self.id, check=False)


class InstallerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        FIXTURES.mkdir(parents=True, exist_ok=True)
        docker('run', '--rm', '--mount', f'type=bind,source={ROOT},target=/source,readonly',
               '--mount', f'type=bind,source={FIXTURES},target=/fixtures', ALPINE,
               'sh', '-c', 'apk add --no-cache openssl >/dev/null && sh /source/tests/make-update-fixtures.sh')
        shutil.rmtree(OUT, ignore_errors=True)
        OUT.mkdir(parents=True)
        fixture_ipk(OUT / 'fixture.ipk')
        key = FIXTURES / 'keys' / 'carbon-apk.pem'
        cls.good = build('good', '--ipk', OUT / 'fixture.ipk', '--apk', FIXTURES / 'luci-theme-carbon-1.1.0-r1.apk', '--key', key)
        (OUT / 'bad').mkdir()
        shutil.copy(FIXTURES / 'wrong.apk', OUT / 'bad' / 'luci-theme-carbon-1.1.0-r1.apk')
        cls.wrong = build('wrong', '--ipk', OUT / 'fixture.ipk', '--apk', OUT / 'bad' / 'luci-theme-carbon-1.1.0-r1.apk', '--key', key)
        cls.key = key.read_text()

    def router(self, image):
        r = Router(image)
        self.addCleanup(r.close)
        return r

    def test_apk_native_install_trust_key_and_uninstall(self):
        r = self.router(APK_IMAGE)
        code, out = r.sh(f'{DEPS} sh {self.good}', check=False)
        self.assertEqual(code, 0, out)
        self.assertIn('installed with apk', out)
        self.assertIn('luci-theme-carbon-1.1.0-r1', r.sh('apk list --installed luci-theme-carbon')[1])
        self.assertEqual(r.sh('test -e /etc/apk/keys/carbon-apk.pem', check=False)[0], 1, 'system trust unchanged')
        self.assertEqual(r.sh('uci get luci.main.mediaurlbase')[1].strip(), '/luci-static/carbon')
        # signature checks stay enabled for everything else
        self.assertEqual(r.sh('apk verify /source/.cache/update-tests/luci-theme-carbon-1.1.0-r1.apk', check=False)[0] != 0, True)

        code, out = r.sh(f'{DEPS} sh {self.good} --trust-key', check=False)
        self.assertEqual(code, 0, out)
        self.assertEqual(r.sh('cat /etc/apk/keys/carbon-apk.pem')[1], self.key)

        code, out = r.sh(f'sh {self.good} uninstall', check=False)
        self.assertEqual(code, 0, out)
        self.assertEqual(r.sh('apk list --installed luci-theme-carbon')[1].strip(), '')

    def test_apk_wrong_signature_installs_nothing(self):
        r = self.router(APK_IMAGE)
        code, out = r.sh(f'{DEPS} sh {self.wrong}', check=False)
        self.assertNotEqual(code, 0, out)
        self.assertIn('signature verification failed', out)
        self.assertEqual(r.sh('apk list --installed luci-theme-carbon')[1].strip(), '')
        self.assertEqual(r.sh('test -e /www/luci-static/carbon', check=False)[0], 1)

    def test_apk_script_only_install_is_migrated(self):
        r = self.router(APK_IMAGE)
        self.assertEqual(r.sh(f'sh {self.good} --files', check=False)[0], 0)
        self.assertEqual(r.sh('cat /www/luci-static/carbon/marker')[1], 'ipk\n')
        self.assertEqual(r.sh('apk list --installed luci-theme-carbon')[1].strip(), '')
        code, out = r.sh(f'{DEPS} sh {self.good}', check=False)
        self.assertEqual(code, 0, out)
        self.assertIn('luci-theme-carbon-1.1.0-r1', r.sh('apk list --installed luci-theme-carbon')[1])

    def test_opkg_native_install_and_uninstall(self):
        r = self.router(OPKG_IMAGE)
        self.assertEqual(r.sh(f'sh {self.good} --files', check=False)[0], 0)
        code, out = r.sh(f'{DEPS} sh {self.good}', check=False)
        self.assertEqual(code, 0, out)
        self.assertIn('installed with opkg', out)
        status = r.sh('opkg status luci-theme-carbon')[1]
        self.assertIn('Version: 1.1.0-r1', status)
        self.assertRegex(status, r'Status: .* installed')
        owned = r.sh('opkg files luci-theme-carbon')[1]
        self.assertIn('/www/luci-static/carbon/marker', owned)
        self.assertEqual(r.sh('cat /www/luci-static/carbon/marker', check=False)[1], 'ipk\n', owned)

        code, out = r.sh(f'sh {self.good} uninstall', check=False)
        self.assertEqual(code, 0, out)
        self.assertNotIn('Version:', r.sh('opkg status luci-theme-carbon', check=False)[1])
        self.assertEqual(r.sh('test -e /www/luci-static/carbon/marker', check=False)[0], 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
