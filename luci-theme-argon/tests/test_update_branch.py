"""Exercise feed publication against a local Git remote and an isolated hook."""

import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

SCRIPT = Path(__file__).resolve().parents[1] / '.github/scripts/publish_update_branch.py'
SPEC = importlib.util.spec_from_file_location('update_branch', SCRIPT)
PUBLISH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PUBLISH)
HOOK = 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/test-secret-id'


class UpdateBranchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.remote = self.directory / 'remote.git'
        self.repository = self.directory / 'checkout'
        self.site = self.directory / 'site'
        self.run_git('init', '--bare', str(self.remote))
        self.run_git('init', '-b', 'main', str(self.repository))
        self.git('config', 'user.name', 'Test Maintainer')
        self.git('config', 'user.email', 'test@example.invalid')
        (self.repository / 'README').write_text('Source branch\n')
        self.git('add', 'README')
        self.git('commit', '-m', 'Initial source')
        self.git('remote', 'add', 'origin', str(self.remote))
        self.git('push', 'origin', 'main')
        self.original = self.git('rev-parse', 'HEAD').strip()
        (self.site / 'updates').mkdir(parents=True)
        (self.site / '.nojekyll').touch()
        (self.site / '404.html').write_text('<title>Not found</title>\n')
        (self.site / '_headers').write_text('/updates/stable.json\n  Cache-Control: max-age=300\n')
        (self.site / 'updates/stable.json').write_text(json.dumps({'schema': 1, 'tag': 'v3.1.0', 'notes': '更新'}))

    def run_git(self, *arguments):
        return subprocess.check_output(['git', *arguments], stderr=subprocess.PIPE).decode()

    def git(self, *arguments):
        return self.run_git('-C', str(self.repository), *arguments)

    def remote_git(self, *arguments):
        return self.run_git('--git-dir', str(self.remote), *arguments)

    def publish(self):
        return PUBLISH.publish(self.site, self.repository)

    def test_first_publication_creates_only_the_feed_branch_and_preserves_dirty_checkout(self):
        (self.repository / 'README').write_text('Staged maintainer work\n')
        self.git('add', 'README')
        (self.repository / 'README').write_text('Unstaged maintainer work\n')
        before = self.git('status', '--porcelain')
        staged = self.git('diff', '--cached')
        commit, changed = self.publish()
        self.assertTrue(changed)
        self.assertEqual(self.git('status', '--porcelain'), before)
        self.assertEqual(self.git('diff', '--cached'), staged)
        self.assertEqual(self.git('rev-parse', 'HEAD').strip(), self.original)
        self.assertEqual(self.remote_git('rev-parse', 'main').strip(), self.original)
        self.assertEqual(self.remote_git('rev-list', '--parents', '-1', commit).split(), [commit])
        for path in self.site.rglob('*'):
            if path.is_file():
                self.assertEqual(self.remote_git('show', f'updates:{path.relative_to(self.site).as_posix()}'), path.read_text())
        self.assertEqual(self.remote_git('show', 'updates:.argon-update-feed').encode(), PUBLISH.MARKER)
        self.assertNotIn('README', self.remote_git('ls-tree', '-r', '--name-only', 'updates').splitlines())

    def test_republication_preserves_history_and_identical_artifacts_are_idempotent(self):
        first, changed = self.publish()
        repeated, changed = self.publish()
        self.assertFalse(changed)
        self.assertEqual(repeated, first)
        (self.site / 'updates/stable.json').write_text(json.dumps({'schema': 1, 'tag': 'v3.1.1'}))
        second, changed = self.publish()
        self.assertTrue(changed)
        self.assertNotEqual(second, first)
        self.assertEqual(self.remote_git('rev-parse', 'updates^').strip(), first)
        self.assertEqual(self.remote_git('rev-list', '--count', 'updates').strip(), '2')

    def test_unchanged_publication_still_triggers_an_optional_hook_for_retries(self):
        first, _ = self.publish()
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch('sys.argv', [str(SCRIPT), '--site', str(self.site), '--repository', str(self.repository)]), \
                patch.dict(PUBLISH.os.environ, {'CF_PAGES_DEPLOY_HOOK': HOOK}), \
                patch.object(PUBLISH, 'urlopen', return_value=response) as request, redirect_stdout(io.StringIO()):
            PUBLISH.main()
        request.assert_called_once()
        self.assertEqual(self.remote_git('rev-parse', 'updates').strip(), first)

    def test_unrelated_existing_updates_branch_is_not_replaced(self):
        self.git('push', 'origin', 'main:updates')
        with self.assertRaisesRegex(ValueError, 'not managed'):
            self.publish()
        self.assertEqual(self.remote_git('rev-parse', 'updates').strip(), self.original)

    def test_concurrent_remote_change_is_rejected_without_force(self):
        first, _ = self.publish()
        tree = self.git('rev-parse', f'{first}^{{tree}}').strip()
        competitor = PUBLISH.git(self.repository, 'commit-tree', tree, '-p', first,
                                 data=b'Concurrent feed publication\n').stdout.decode().strip()
        (self.site / 'updates/stable.json').write_text(json.dumps({'schema': 1, 'tag': 'v3.1.1'}))
        original_git = PUBLISH.git

        def concurrent_git(repository, *arguments, **kwargs):
            if arguments[0] == 'push':
                original_git(repository, 'push', 'origin', f'{competitor}:refs/heads/updates')
            return original_git(repository, *arguments, **kwargs)

        with patch.object(PUBLISH, 'git', side_effect=concurrent_git), self.assertRaises(subprocess.CalledProcessError):
            self.publish()
        self.assertEqual(self.remote_git('rev-parse', 'updates').strip(), competitor)

    def test_unexpected_or_linked_artifact_files_are_not_published(self):
        extra = self.site / 'unrelated.txt'
        extra.write_text('Do not publish')
        with self.assertRaises(ValueError):
            self.publish()
        extra.unlink()
        manifest = self.site / 'updates/stable.json'
        target = self.directory / 'external.json'
        manifest.rename(target)
        manifest.symlink_to(target)
        with self.assertRaises(ValueError):
            self.publish()
        self.assertEqual(self.remote_git('branch', '--list', 'updates'), '')


class DeployHookTests(unittest.TestCase):
    def test_missing_hook_uses_git_integration_without_a_request(self):
        with patch.object(PUBLISH, 'urlopen') as request:
            self.assertFalse(PUBLISH.trigger_hook(''))
            request.assert_not_called()

    def test_hook_sends_a_post_without_api_credentials_or_artifacts(self):
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(PUBLISH, 'urlopen', return_value=response) as request:
            self.assertTrue(PUBLISH.trigger_hook(HOOK))
            sent = request.call_args.args[0]
            self.assertEqual(sent.full_url, HOOK)
            self.assertEqual(sent.get_method(), 'POST')
            self.assertEqual(sent.data, b'')
            self.assertIsNone(sent.get_header('Authorization'))
            self.assertEqual(request.call_args.kwargs['timeout'], 30)

    def test_http_errors_do_not_disclose_the_hook_url(self):
        with patch.object(PUBLISH, 'urlopen', side_effect=HTTPError(HOOK, 403, 'Forbidden', {}, None)):
            with self.assertRaises(RuntimeError) as failure:
                PUBLISH.trigger_hook(HOOK)
        self.assertNotIn(HOOK, str(failure.exception))
        self.assertNotIn('test-secret-id', str(failure.exception))

    def test_other_endpoints_and_urls_containing_credentials_are_rejected(self):
        for url in ['http://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/test',
                    'https://unrelated.invalid/hook', HOOK + '?token=secret', HOOK + '#fragment',
                    HOOK.replace('api.cloudflare.com', 'user:secret@api.cloudflare.com')]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                PUBLISH.trigger_hook(url)


if __name__ == '__main__':
    unittest.main()
