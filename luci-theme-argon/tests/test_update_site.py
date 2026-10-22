"""Verify the published update feed against release metadata and package bytes."""

import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / '.github/scripts/generate_update_site.py'
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location('update_site', SCRIPT)
SITE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SITE)


class UpdateSiteTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.packages = self.directory / 'packages'
        self.packages.mkdir()
        self.output = self.directory / 'site'
        self.release = self.release_for('v3.0.0')

    def release_for(self, tag):
        metadata = SITE.resolve(tag)
        release = {'tag_name': tag, 'draft': False, 'prerelease': False,
                   'html_url': f'https://github.com/jerrykuku/luci-theme-argon/releases/tag/{tag}',
                   'published_at': '2026-10-21T01:00:00Z', 'body': '## 更新\n- 修复布局。', 'assets': []}
        for name in [f'luci-theme-argon_{metadata["ipk_version"]}_all.ipk',
                     f'luci-theme-argon-{metadata["apk_version"]}-r{metadata["package_release"]}.apk']:
            content = ('package bytes for ' + name).encode()
            (self.packages / name).write_bytes(content)
            release['assets'].append({'name': name, 'size': len(content),
                                      'digest': 'sha256:' + hashlib.sha256(content).hexdigest()})
        return release

    def generate(self, release=None):
        return SITE.generate(release or self.release, self.packages, 'jerrykuku/luci-theme-argon', self.output)

    def test_manifest_contains_exact_revision_names_digests_sizes_and_notes(self):
        for tag in ['v3.0.0', 'v3.1.0']:
            release = self.release_for(tag)
            manifest = self.generate(release)
            self.assertEqual(json.loads((self.output / 'updates/stable.json').read_text()), manifest)
            self.assertEqual(manifest['schema'], 1)
            self.assertEqual(manifest['tag'], tag)
            self.assertEqual(manifest['notes'], release['body'])
            for kind in ['apk', 'ipk']:
                content = (self.packages / manifest[kind]).read_bytes()
                self.assertEqual(manifest[kind + '_size'], len(content))
                self.assertEqual(manifest[kind + '_sha256'], hashlib.sha256(content).hexdigest())
            self.assertNotIn('checked_at', manifest)
            self.assertNotIn('url', manifest)

    def test_no_site_is_written_for_drafts_previews_or_foreign_releases(self):
        for patch in [{'draft': True}, {'prerelease': True}, {'tag_name': 'v3.1.0-beta.1'},
                      {'tag_name': 'latest'}, {'published_at': ''},
                      {'html_url': 'https://github.com/other/repo/releases/tag/v3.0.0'}]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                self.generate(dict(self.release, **patch))
            self.assertFalse(self.output.exists())

    def test_missing_duplicate_or_mismatched_assets_block_publication(self):
        for mutate in [lambda release: release['assets'].pop(),
                       lambda release: release['assets'].append(release['assets'][0]),
                       lambda release: release['assets'][0].update(size=1),
                       lambda release: release['assets'][0].update(digest='sha256:' + '0' * 64)]:
            release = copy.deepcopy(self.release)
            mutate(release)
            with self.assertRaises(ValueError):
                self.generate(release)
            self.assertFalse(self.output.exists())

    def test_modified_or_linked_local_package_cannot_be_published(self):
        path = self.packages / self.release['assets'][0]['name']
        content = path.read_bytes()
        path.write_bytes(b'corrupted')
        with self.assertRaises(ValueError):
            self.generate()
        target = self.directory / 'external-package'
        target.write_bytes(content)
        path.unlink()
        path.symlink_to(target)
        with self.assertRaises(ValueError):
            self.generate()
        self.assertFalse(self.output.exists())

    def test_large_notes_are_bounded_and_unknown_paths_return_real_404(self):
        self.release['body'] = '更新' * 40000
        manifest = self.generate()
        self.assertEqual(len(manifest['notes']), 32768)
        self.assertTrue((self.output / '404.html').is_file())
        self.assertIn('max-age=300', (self.output / '_headers').read_text())
        self.assertTrue((self.output / '.nojekyll').is_file())

    def test_sources_support_an_unconfigured_primary_and_distinct_https_hosts(self):
        output = self.directory / 'sources.json'
        fallback = 'https://jerrykuku.github.io/luci-theme-argon/updates/stable.json'
        for primary in ['', 'https://owned-project.pages.dev/updates/stable.json', fallback]:
            SITE.configure_sources(primary, fallback, output)
            sources = json.loads(output.read_text())
            self.assertEqual(sources['fallback'], fallback)
            self.assertEqual(sources['primary'], '' if primary == fallback else primary)

    def test_unsafe_or_incomplete_source_urls_are_rejected(self):
        for source in ['http://example.com/updates/stable.json', 'https://user:token@example.com/feed',
                       'https://example.com:443/feed', 'https://example.com/feed?token=secret',
                       'https://example.com/feed#part', 'https://example.com', 'file:///tmp/feed',
                       'https://example.com/feed\n--no-check-certificate']:
            with self.subTest(source=source), self.assertRaises(ValueError):
                SITE.configure_sources(source, 'https://example.com/feed', self.directory / 'sources.json')
        with self.assertRaises(ValueError):
            SITE.configure_sources('', '', self.directory / 'sources.json')


if __name__ == '__main__':
    unittest.main()
