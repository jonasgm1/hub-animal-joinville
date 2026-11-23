# Importar planilhas para revisão

O importador lê uma aba XLSX ou um CSV e prepara propostas para o painel administrativo. Ele roda no computador do operador, sem rede. Uma pessoa da curadoria confere a fonte, o município e os detalhes antes de editar ou publicar uma ficha.

## Preparar o arquivo

Use Python 3.11 ou mais recente com a base de fusos IANA disponível no sistema. Na raiz do projeto, instale as dependências para planilhas.

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
```

Cada arquivo ou aba deve conter um só tipo de registro. A primeira linha define as colunas. Use `services`, `organizations` ou `events` no argumento `--tipo`. Para CSV, salve em UTF-8 com ou sem BOM e use vírgula, ponto e vírgula ou tabulação. Células com quebras de linha precisam estar entre aspas conforme o formato CSV.

| Tipo | Colunas |
| --- | --- |
| Todos | `title`, `sourceUrl`, `slug`, `description`, `verifiedAt` |
| Serviços | `category`, `species`, `cost`, `audience`, `eligibility`, `address`, `hours`, `phone`, `whatsapp`, `email`, `steps`, `documents`, `organization`, `website` |
| Organizações | `area`, `address`, `hours`, `phone`, `whatsapp`, `email`, `website`, `volunteering`, `projects`, `social` |
| Eventos | `type`, `location`, `organizer`, `contact`, `organization`, `start`, `end` |

Cada linha precisa conter o título e a URL HTTPS da fonte original. O campo `organization` usa o slug da organização. `cost` aceita `aberto`, `criterios`, `campanha`, `disponibilidade` e `incerto`. Separe as espécies por vírgula. Registre a data em `verifiedAt` apenas se houve verificação documental, no formato AAAA-MM-DD. Um campo ausente fica ausente até a revisão. Para datas de eventos, use AAAA-MM-DDTHH:MM no horário local de Joinville ou uma data/hora ISO com fuso explícito. O resultado usa UTC.

Também são aceitos cabeçalhos em português como `Nome`, `Fonte`, `Descrição`, `Categoria`, `Espécies`, `Como solicitar`, `Público`, `Critérios`, `Telefone`, `Início` e `Fim`. O dicionário `ALIASES` no script contém as correspondências. Renomeie ou remova colunas não reconhecidas antes de importar. Leve à cópia de trabalho apenas informações para publicação e contatos institucionais públicos. Uma célula de descrição ou contato livre pode conter dados pessoais e precisa de conferência.

## Gerar e revisar

```sh
python scripts/importar.py levantamento.xlsx --aba Serviços --tipo services > revisao.json
python scripts/importar.py levantamento.xlsx --aba Serviços --tipo services --formato sql > revisao.sql
python scripts/importar.py agenda.csv --tipo events > propostas-agenda.json
```

O JSON inclui o tipo, os campos da proposta, o nome do arquivo, o hash SHA-256 dos bytes originais, a aba (quando aplicável) e a linha. No CSV com texto multilinha, a linha indicada é a primeira linha física do registro. O nome do arquivo fica no painel. Evite incluir nomes pessoais nele. A data de importação e a data de verificação editorial são independentes.

O importador admite até 2 MiB por arquivo, 1.000 linhas de dados, 32 colunas, 2.500 caracteres por célula e 30 mil bytes por registro normalizado. Para XLSX, o pacote admite até 300 partes e 12 MiB descompactados. Planilhas com fórmulas, macros ou vínculos externos são recusadas. Links têm de usar HTTPS e um nome de domínio público em formato válido. O importador não consulta as URLs e não verifica titularidade, conteúdo ou disponibilidade de atendimento.

Se uma linha falhar, o comando sai com erro antes de emitir o lote. Corrija o arquivo e repita o comando. Confira o código de saída antes de aplicar o SQL. O conteúdo normalizado de cada linha e o tipo determinam a identidade da proposta. Repetições mantêm apenas a primeira origem daquele conteúdo. Uma linha modificada produz nova proposta. Reimportar uma linha já encerrada preserva a decisão anterior.

## Carregar no banco

Aplique as migrations do projeto antes do lote. Use o nome do recurso D1 definido na configuração de implantação.

```sh
npx wrangler d1 execute DB --local --file revisao.sql
```

Abra o painel e consulte as mudanças pendentes. Para enviar a um ambiente remoto, use a configuração e a credencial desse ambiente e substitua `--local` por `--remote`. O SQL gerado insere apenas referências em `sources` e propostas pendentes em `source_observations`. É seguro reaplicar o mesmo SQL após uma execução parcial. Evite versionar planilhas externas e lotes de revisão.

## Testar

```sh
python -m unittest discover -s tests -p test_importar.py -v
```

Os testes criam planilhas temporárias e aplicam o SQL gerado à migration real em SQLite. Cobrem os formatos de entrada, a conversão para UTC, a fila de revisão, falhas de validação, deduplicação após decisão e preservação das tabelas públicas.
