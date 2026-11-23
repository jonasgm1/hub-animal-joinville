"""Transforma linhas de uma planilha em observações editoriais pendentes."""

import argparse
import csv
from datetime import date, datetime, timezone
import hashlib
import io
import ipaddress
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import urlsplit
from xml.etree.ElementTree import ParseError
from zipfile import BadZipFile, ZipFile
from zoneinfo import ZoneInfo


MAX_BYTES = 2 * 1024 * 1024
MAX_EXPANDED = 12 * 1024 * 1024
MAX_ROWS = 1000
MAX_COLS = 32
MAX_CHARS = 2500
COMMON = 'slug title description sourceUrl verifiedAt'.split()
EXTRA = {
    'services': 'category species cost audience eligibility address hours phone whatsapp email steps documents organization website'.split(),
    'organizations': 'area address hours phone whatsapp email website volunteering projects social'.split(),
    'events': 'type location organizer contact organization start end'.split(),
}
ALIASES = {
    'nome': 'title', 'titulo': 'title', 'descricao': 'description', 'fonte': 'sourceUrl',
    'url da fonte': 'sourceUrl', 'data de verificacao': 'verifiedAt', 'categoria': 'category',
    'especies': 'species', 'condicao de acesso': 'cost', 'publico': 'audience',
    'criterios': 'eligibility', 'endereco': 'address', 'horario': 'hours', 'telefone': 'phone',
    'como solicitar': 'steps', 'documentos': 'documents', 'organizacao vinculada': 'organization',
    'site': 'website', 'area': 'area', 'voluntariado': 'volunteering', 'projetos': 'projects',
    'rede social': 'social', 'tipo': 'type', 'local': 'location', 'organizador': 'organizer',
    'contato publico': 'contact', 'inicio': 'start', 'fim': 'end', 'servico': 'title',
}
KINDS = {'aberto', 'criterios', 'campanha', 'disponibilidade', 'incerto'}
TZ = ZoneInfo('America/Sao_Paulo')


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', str(text).strip().lower())
                   if not unicodedata.combining(c))


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def https_public(value):
    if re.search(r'[\s\\\x00-\x1f\x7f]', value):
        return False
    try:
        parsed = urlsplit(value)
        host = (parsed.hostname or '').encode('idna').decode().lower().rstrip('.')
        if parsed.scheme != 'https' or parsed.port not in (None, 443) or '@' in parsed.netloc:
            return False
        if not re.fullmatch(r'(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}', host):
            return False
        if host.endswith(('.internal', '.local', '.localhost', '.onion', '.lan', '.home.arpa')):
            return False
        try:
            ipaddress.ip_address(host)
        except ValueError:
            return True
        return False
    except (ValueError, UnicodeError):
        return False


def cell_value(value):
    if isinstance(value, (datetime, date)):
        value = value.isoformat()
    value = '' if value is None else unicodedata.normalize('NFC', str(value)).strip()
    if len(value) > MAX_CHARS or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', value):
        raise ValueError('célula longa demais ou com controle inválido')
    return value


def local_time(value):
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})?', value):
        raise ValueError('início e término exigem data e horário ISO')
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        first = result.replace(tzinfo=TZ, fold=0)
        second = result.replace(tzinfo=TZ, fold=1)
        if first.utcoffset() != second.utcoffset():
            raise ValueError('horário local ambíguo ou inexistente; use o deslocamento UTC')
        result = first
    return result.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def header_keys(headers, entity):
    permitted = COMMON + EXTRA[entity]
    known = {normalized(field): field for field in permitted}
    known.update({k: v for k, v in ALIASES.items() if v in permitted})
    fields = [known.get(normalized(name)) for name in headers]
    if None in fields or len(fields) != len(set(fields)):
        raise ValueError('cabeçalho vazio, desconhecido ou duplicado; use apenas as colunas públicas documentadas')
    if not {'title', 'sourceUrl'}.issubset(fields):
        raise ValueError('cabeçalho requer title e sourceUrl')
    return fields


def candidate_from(values, fields):
    data = {k: v for k, raw in zip(fields, values) if (v := cell_value(raw))}
    if not data.get('title') or len(data['title']) > 160:
        raise ValueError('título obrigatório de até 160 caracteres')
    if not data.get('sourceUrl') or any(not https_public(data[key]) for key in ('sourceUrl', 'website', 'social') if key in data):
        raise ValueError('informe URL pública HTTPS sem credenciais para cada link')
    if 'slug' in data and not re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*', data['slug']):
        raise ValueError('slug inválido')
    if 'cost' in data and data['cost'] not in KINDS:
        raise ValueError('condição de acesso desconhecida')
    if 'verifiedAt' in data:
        supplied = data['verifiedAt']
        if re.fullmatch(r'\d{4}-\d\d-\d\dT00:00:00', supplied):
            supplied = supplied[:10]
        parsed = date.fromisoformat(supplied)
        if parsed.isoformat() != supplied or parsed > datetime.now(TZ).date():
            raise ValueError('data de verificação inválida')
        data['verifiedAt'] = parsed.isoformat()
    for field in ('start', 'end'):
        if field in data:
            data[field] = local_time(data[field])
    if 'start' in data and 'end' in data and data['end'] <= data['start']:
        raise ValueError('término deve ser posterior ao início')
    if 'species' in data:
        data['species'] = list(dict.fromkeys(s.strip() for s in re.split('[,;|]', data['species']) if s.strip()))
    return data


def csv_rows(raw):
    source = raw.decode('utf-8-sig')
    try:
        dialect = csv.Sniffer().sniff(source[:8192], delimiters=',;\t')
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ',' if ',' in source.split('\n', 1)[0] else ';'
    reader = csv.reader(io.StringIO(source, newline=''), delimiter=delimiter, strict=True)
    while True:
        first_line = reader.line_num + 1
        row = next(reader, None)
        if row is None:
            return
        yield None, first_line, row


def xlsx_rows(raw, sheet):
    from openpyxl import load_workbook
    from openpyxl.utils.exceptions import InvalidFileException

    with ZipFile(io.BytesIO(raw)) as archive:
        members = archive.infolist()
        if len(members) > 300 or sum(i.file_size for i in members) > MAX_EXPANDED:
            raise ValueError('pacote XLSX excede os limites descompactados')
        for i in members:
            name = i.filename.lower()
            if name.endswith(('.bin', '.vba')) or '/externallinks/' in name or i.flag_bits & 1:
                raise ValueError('macros, vínculos externos e arquivos protegidos não são aceitos')
            if name.endswith(('.xml', '.rels')):
                xml = archive.read(i).decode('utf-8-sig')
                if '\x00' in xml or re.search(r'<!\s*(?:DOCTYPE|ENTITY)\b', xml, re.I):
                    raise ValueError('declarações de entidade ou DTD não são aceitas')
    try:
        book = load_workbook(io.BytesIO(raw), read_only=True, data_only=False, keep_links=False)
    except (KeyError, IndexError, InvalidFileException, OSError) as error:
        raise ValueError('estrutura XLSX inválida') from error
    try:
        if sheet is None and len(book.sheetnames) != 1:
            raise ValueError('escolha a planilha com --aba')
        if sheet is not None and sheet not in book.sheetnames:
            raise ValueError('aba inexistente')
        ws = book[sheet or book.sheetnames[0]]
        if (ws.max_column or 0) > MAX_COLS or (ws.max_row or 0) > MAX_ROWS + 1:
            raise ValueError('dimensões da aba excedem o limite')
        ws.reset_dimensions()
        for row_num, row in enumerate(ws.iter_rows(), 1):
            if row_num > MAX_ROWS + 1 or len(row) > MAX_COLS:
                raise ValueError('dimensões da aba excedem o limite')
            if any(cell.data_type in ('f', 'e') for cell in row):
                raise ValueError(f'linha {row_num}: fórmulas e células com erros não são aceitas')
            yield ws.title, row_num, [cell.value for cell in row]
    finally:
        book.close()


def ingest(path, entity, sheet=None):
    if entity not in EXTRA:
        raise ValueError('tipo de registro inválido')
    with path.open('rb') as source:
        raw = source.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('arquivo excede 2 MiB')
    ext = path.suffix.lower()
    if ext == '.xlsx':
        rows = xlsx_rows(raw, sheet)
    elif ext == '.csv' and sheet is None:
        rows = csv_rows(raw)
    else:
        raise ValueError('use .xlsx com aba opcional ou .csv sem aba')
    file_hash = digest(raw)
    observations = {}
    fields = None
    observed_at = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    try:
        for row_count, (sheet_name, row_num, values) in enumerate(rows, 1):
            if row_count > MAX_ROWS + 1 or len(values) > MAX_COLS:
                raise ValueError('limite de linhas ou colunas excedido')
            if fields is None:
                fields = header_keys(values, entity)
                continue
            if not any(v is not None and v != '' for v in values):
                continue
            if len(values) > len(fields):
                raise ValueError(f'linha {row_num}: dados sem cabeçalho')
            try:
                record = candidate_from(values, fields)
            except ValueError as error:
                raise ValueError(f'linha {row_num}: {error}') from error
            encoded = compact([entity, record]).encode()
            if len(encoded) > 30_000:
                raise ValueError(f'linha {row_num}: registro excede 30 mil bytes')
            key = digest(encoded)
            if key in observations:
                continue
            context = {'kind': 'import', 'entity': entity, 'candidate': record,
                       'provenance': {'file': path.name, 'sha256': file_hash, 'sheet': sheet_name, 'row': row_num}}
            observations[key] = {'id': 'import-' + key, 'source_id': record['sourceUrl'],
                                 'url': record['sourceUrl'], 'context': context, 'digest': key,
                                 'observed_at': observed_at, 'status': 'pending'}
    finally:
        rows.close()
    if fields is None or not observations:
        raise ValueError('nenhuma linha de dados')
    return list(observations.values())


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def as_sql(rows):
    statements = []
    for item in rows:
        url = literal(item['url'])
        statements.append(f"INSERT INTO sources (id, url, kind) VALUES ({url},{url},'reference') ON CONFLICT(url) DO NOTHING;")
        columns = ('id', 'url', 'digest', 'context', 'observed_at', 'status')
        values = [literal(compact(item[k]) if k == 'context' else item[k]) for k in columns]
        statements.append(f"INSERT INTO source_observations ({','.join(columns)},source_id) "
                          f"SELECT {','.join(values)},id FROM sources WHERE url={url} ON CONFLICT(id) DO NOTHING;")
    return '\n'.join(statements)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('arquivo', type=Path)
    parser.add_argument('--tipo', choices=EXTRA, required=True)
    parser.add_argument('--aba')
    parser.add_argument('--formato', choices=['json', 'sql'], default='json')
    args = parser.parse_args()
    try:
        observations = ingest(args.arquivo, args.tipo, args.aba)
    except (OSError, ValueError, csv.Error, BadZipFile, ParseError, RuntimeError) as error:
        print(f'Importação recusada: {error}', file=sys.stderr)
        return 1
    output = as_sql(observations) if args.formato == 'sql' else json.dumps(observations, ensure_ascii=False, indent=2)
    print(output)
    return 0


if __name__ == '__main__':
    sys.exit(main())
