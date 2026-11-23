import csv
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZIP_DEFLATED, ZipFile

from openpyxl import Workbook


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('importador', ROOT / 'scripts' / 'importar.py')
importador = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importador)
URL = 'https://public.example.org/programa'


class TestImportacao(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.folder = Path(self.directory.name)

    def csv(self, *rows, name='lote.csv', delimiter=';'):
        path = self.folder / name
        with path.open('w', encoding='utf-8-sig', newline='') as file:
            csv.writer(file, delimiter=delimiter).writerows(rows)
        return path

    def xlsx(self, rows, second=False):
        path = self.folder / 'materiais.xlsx'
        book = Workbook()
        ws = book.active
        ws.title = 'Candidatos'
        for row in rows:
            ws.append(row)
        if second:
            book.create_sheet('Instruções')
        book.save(path)
        book.close()
        return path

    def test_csv_canonical_and_provenance(self):
        path = self.csv(['Nome', 'Fonte', 'Espécies', 'Descrição'],
                        ['Serviço editorial', URL, 'Cães, Gatos, Cães', 'Duas\nlinhas'],
                        ['Outro', URL, '', 'Texto'])
        rows = importador.ingest(path, 'services')
        self.assertEqual(len(rows), 2)
        item = rows[0]
        self.assertEqual(item['context']['candidate']['species'], ['Cães', 'Gatos'])
        self.assertNotIn('verifiedAt', item['context']['candidate'])
        self.assertEqual(item['context']['provenance']['sha256'], hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(rows[1]['context']['provenance']['row'], 4)
        self.assertEqual(item['status'], 'pending')

    def test_csv_xlsx_same_content_same_id(self):
        headings = ['title', 'sourceUrl', 'start', 'end']
        values = ['Feira de teste', URL, '2026-12-12T10:00', '2026-12-12T15:00']
        rows = [headings, values, values]
        xlsx = self.xlsx(rows, second=True)
        with self.assertRaisesRegex(ValueError, 'aba'):
            importador.ingest(xlsx, 'events')
        items = importador.ingest(xlsx, 'events', 'Candidatos')
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['id'], importador.ingest(self.csv(*rows, delimiter=','), 'events')[0]['id'])
        self.assertEqual(items[0]['context']['candidate']['start'], '2026-12-12T13:00:00.000Z')
        self.assertEqual(items[0]['context']['provenance']['sheet'], 'Candidatos')

    def test_sql_round_trip_into_review_only_and_no_reopening(self):
        conn = sqlite3.connect(':memory:')
        self.addCleanup(conn.close)
        conn.executescript((ROOT / 'migrations' / '0001_initial.sql').read_text())
        conn.execute('INSERT INTO sources (id,url) VALUES (?,?)', ('fonte-ja-cadastrada', URL))
        names = ['title', 'sourceUrl', 'description']
        title = "Associação d'Água"
        path = self.csv(names, [title, URL, "Texto; com apóstrofo ' e aspas."])
        records = importador.ingest(path, 'organizations')
        sql = importador.as_sql(records)
        conn.executescript(sql)
        context, status, source_id = conn.execute('SELECT context,status,source_id FROM source_observations').fetchone()
        self.assertEqual(json.loads(context)['candidate']['title'], title)
        self.assertEqual(status, 'pending')
        self.assertEqual(source_id, 'fonte-ja-cadastrada')
        conn.execute("UPDATE source_observations SET status='rejected'")
        conn.executescript(sql)
        self.assertEqual(conn.execute('SELECT status FROM source_observations').fetchall(), [('rejected',)])
        changed = self.csv(names, [title, URL, 'Novo texto público.'])
        conn.executescript(importador.as_sql(importador.ingest(changed, 'organizations')))
        self.assertEqual(conn.execute('SELECT COUNT(*) FROM source_observations').fetchone()[0], 2)
        for table in ('services', 'events', 'organizations', 'submissions', 'change_history'):
            self.assertEqual(conn.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0)

    def test_unsafe_links(self):
        for link in ['http://exemplo.org/', 'javascript:void(0)', 'https://localhost',
                     'https://127.0.0.1/a', 'https://[::1]/', 'https://abc.internal',
                     'https://a:b@exemplo.org/', 'https://public.example.org:99999']:
            with self.subTest(link=link), self.assertRaisesRegex(ValueError, 'linha 2'):
                importador.ingest(self.csv(['title', 'sourceUrl'], ['Título', link]), 'organizations')
        path = self.csv(['title', 'sourceUrl', 'social'], ['Título', URL, 'http://link.example.org'])
        with self.assertRaisesRegex(ValueError, 'HTTPS'):
            importador.ingest(path, 'organizations')

    def test_reject_nonpublic_headers_and_duplicates(self):
        for extras in [['private_contact'], ['nome'], [''], ['sender']]:
            with self.subTest(extras=extras), self.assertRaisesRegex(ValueError, 'cabeçalho'):
                importador.ingest(self.csv(['title', 'sourceUrl', *extras], ['Item', URL, 'valor']), 'events')

    def test_validate_limits(self):
        with self.assertRaisesRegex(ValueError, 'longa'):
            importador.ingest(self.csv(['title', 'sourceUrl'], ['x' * 3000, URL]), 'services')
        rows = [['Item', URL]] * (importador.MAX_ROWS + 1)
        with self.assertRaisesRegex(ValueError, 'limite'):
            importador.ingest(self.csv(['title', 'sourceUrl'], *rows), 'services')
        path = self.folder / 'grande.csv'
        path.write_bytes(b'x' * (importador.MAX_BYTES + 1))
        with self.assertRaisesRegex(ValueError, 'MiB'):
            importador.ingest(path, 'services')

    def test_xlsx_reject_external_parts_and_formulas(self):
        path = self.xlsx([['title', 'sourceUrl'], ['=SUM(1,2)', URL]])
        with self.assertRaisesRegex(ValueError, 'fórmulas'):
            importador.ingest(path, 'events')
        with ZipFile(path, 'a', ZIP_DEFLATED) as archive:
            archive.writestr('xl/externalLinks/externalLink1.xml', '<link/>')
        with self.assertRaisesRegex(ValueError, 'externos'):
            importador.ingest(path, 'services')

    def test_reject_invalid_dates_and_time_ranges(self):
        invalid_sets = [
            (['start', 'end'], ['2026-05-12T15:00', '2026-05-12T10:00']),
            (['start'], ['2026-02-30T10:00']),
            (['start'], ['2026-12-10']),
            (['verifiedAt'], ['2026-02-30']),
            (['verifiedAt'], ['2999-12-12']),
        ]
        for keys, values in invalid_sets:
            path = self.csv(['title', 'sourceUrl', *keys], ['Feira', URL, *values])
            with self.subTest(keys=keys, values=values), self.assertRaisesRegex(ValueError, 'linha 2'):
                importador.ingest(path, 'events')

    def test_cli_fails_atomically(self):
        path = self.csv(['title', 'sourceUrl'], ['Primeira', URL], ['Sem fonte', ''])
        p = subprocess.run([sys.executable, str(ROOT / 'scripts' / 'importar.py'), str(path),
                            '--tipo', 'services', '--formato', 'sql'], capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertEqual(p.stdout, '')
        self.assertIn('linha 3', p.stderr)


if __name__ == '__main__':
    unittest.main()
