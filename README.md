# Hub Animal Joinville

**https://hubanimaljoinville.pages.dev**

Diretório independente de serviços de proteção animal de Joinville, Santa Catarina. O morador encontra quem pode solicitar cada serviço, o contato do responsável, a origem e a data da conferência. A agenda reúne feiras de adoção, mutirões e campanhas, com envios moderados e busca automática nas notícias da Prefeitura.

Projeto parceiro: [Castração Gratuita Joinville](https://castracaojoinville.pages.dev/).

## Como a agenda se atualiza sozinha

Duas vezes por dia (06h17 e 18h17 em Joinville) o Worker `hubanimaljoinville-coleta`:

1. arquiva eventos encerrados e apaga dados privados de envios antigos;
2. consulta três buscas públicas de notícias da Prefeitura (feira de adoção, CBEA, castração/vacinação) e a carta de serviço de castração, respeitando robots.txt;
3. quando uma notícia recente informa dia, horário e endereço, cria um **rascunho de evento** na fila de moderação (o dia é calculado a partir da data da notícia, como "neste domingo" ou "(22/8)");
4. registra mudanças nas cartas de serviço e notícias sem dados suficientes como observações para revisão.

Nada é publicado sem aprovação no painel. Uma falha da fonte não altera o que já está publicado. Detalhes em [docs/coleta.md](docs/coleta.md).

## Rodar no computador

Node 24 e npm; Python 3.12 apenas para o importador de planilhas.

```sh
npm ci
npm run dev
```

O comando compila, aplica a migration no D1 local e inicia `wrangler pages dev` na porta 8787. Os registros conferidos são carregados na primeira consulta.

## Verificar

```sh
npm run lint
npm run typecheck
npm run build
npm test
python -m pip install -r requirements.txt
python -m unittest discover -s tests -p 'test_*.py' -v
npx playwright install --with-deps chromium
npm run e2e
node scripts/smoke-collect.mjs   # consulta as fontes reais uma vez, sem gravar
```

Com Chrome já instalado, `CHROMIUM_PATH` pode apontar para ele no lugar do `playwright install`.

## Implantar

`npm run deploy` publica tudo (migrations, Pages e Worker de coleta). Configuração, painel administrativo (Cloudflare Access), backup e rollback: [docs/operacao.md](docs/operacao.md).

## Arquitetura

Astro compila o HTML-base e a marca React; um único Worker (Pages em modo avançado, `dist/_worker.js`) responde às rotas com HTML acessível e consultas D1. Busca e filtros usam formulários GET e funcionam sem JavaScript; só o desafio Turnstile do envio público usa script. O mesmo bundle roda como Worker com Cron Trigger, porque o Pages não executa crons.

- [Fontes dos registros iniciais](docs/fontes.md)
- [Monitoramento e revisão editorial](docs/coleta.md)
- [Importar CSV ou XLSX para revisão](docs/importacao.md)
- [Evidências e limites da validação](docs/validacao.md)

Código sob a licença GPL-3.0 (ver [LICENSE](LICENSE)). Publicações referenciadas, marcas, contatos e materiais de terceiros conservam seus direitos e condições de uso.
