"""Keep every shipped catalog complete and preserve runtime formatting."""
import ast
from collections import Counter
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
LITERAL = r'''(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')'''
FORMAT = re.compile(r'%(?:\d+\$)?[-+#0 ]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[a-zA-Z%]')


def catalog(path):
    entries = {}
    for block in re.split(r'\n\s*\n', path.read_text()):
        values = {}
        key = None
        for line in block.splitlines():
            if line.startswith(('msgid ', 'msgstr ')):
                key = line.split()[0]
                values[key] = ast.literal_eval(line[len(key) + 1:])
            elif line.startswith('"') and key:
                values[key] += ast.literal_eval(line)
        if values.get('msgid'):
            msgid = values['msgid']
            if msgid in entries:
                raise ValueError(f'{path}: duplicate message {msgid!r}')
            entries[msgid] = (values.get('msgstr', ''),
                              bool(re.search(r'^#,.*\bfuzzy\b', block, re.M)))
    return entries


class TranslationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = catalog(ROOT / 'po/templates/argon-config.pot')
        cls.catalogs = {p.parent.name: catalog(p)
                        for p in sorted((ROOT / 'po').glob('*/argon-config.po'))}

    def test_all_languages_match_template_without_empty_or_fuzzy_messages(self):
        self.assertTrue(self.template)
        self.assertTrue(self.catalogs)
        for language, entries in self.catalogs.items():
            with self.subTest(language=language):
                self.assertEqual(entries.keys(), self.template.keys())
                for msgid, (translation, fuzzy) in entries.items():
                    self.assertTrue(translation.strip(), msgid)
                    self.assertFalse(fuzzy, msgid)

    def test_translations_preserve_placeholders_markup_and_hex_defaults(self):
        patterns = (FORMAT, re.compile(r'</?[A-Za-z][^>]*>'),
                    re.compile(r'#[0-9a-fA-F]{3,8}\b'))
        for language, entries in self.catalogs.items():
            for msgid, (translation, _) in entries.items():
                with self.subTest(language=language, message=msgid):
                    for pattern in patterns:
                        self.assertEqual(Counter(pattern.findall(msgid)),
                                         Counter(pattern.findall(translation)))

    def test_template_covers_static_messages_in_current_sources(self):
        messages = set()
        calls = re.compile(r'(?<!\w)_\(\s*(' + LITERAL + ')')
        for directory, extension in [('htdocs', '*.js'), ('ucode', '*.ut')]:
            for path in (ROOT / directory).rglob(extension):
                messages.update(ast.literal_eval(m[1])
                                for m in calls.finditer(path.read_text()))

        def labels(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    if key in ('title', 'description') and isinstance(item, str):
                        messages.add(item)
                    labels(item)
            elif isinstance(value, list):
                for item in value:
                    labels(item)

        for directory in ['luci/menu.d', 'rpcd/acl.d']:
            for path in (ROOT / 'root/usr/share' / directory).glob('*.json'):
                labels(json.loads(path.read_text()))
        self.assertTrue(messages)
        self.assertEqual(messages, self.template.keys())


if __name__ == '__main__':
    unittest.main()
