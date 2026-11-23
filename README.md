# Hub Animal Joinville

**https://hubanimaljoinville.pages.dev**

Diretório independente de serviços de proteção animal de Joinville, Santa Catarina. O morador encontra quem pode solicitar cada serviço, o contato do responsável, a origem e a data da conferência. A agenda reúne feiras de adoção, mutirões e campanhas.

Projeto parceiro: [Castração Gratuita Joinville](https://castracaojoinville.pages.dev/).

O site é somente leitura: sem formulários, cadastro, painel ou cookies próprios.

## Como a agenda se atualiza

- **Toda semana, pela equipe**: as publicações das ONGs, protetores e redes sociais são revisadas e lançadas em [`data/seed.json`](data/seed.json). A implantação sincroniza o arquivo com o banco (insere, edita e arquiva o que foi removido). Passo a passo: [docs/atualizacao-semanal.md](docs/atualizacao-semanal.md).
- **Duas vezes por dia, sozinha** (06h17 e 18h17 em Joinville): o Worker `hubanimaljoinville-coleta` arquiva eventos encerrados e lê três buscas públicas de notícias da Prefeitura e a carta de castração, respeitando robots.txt. Quando uma notícia recente informa dia, horário e endereço, o evento é publicado com o selo "Coletado automaticamente" e o link da notícia. Notícias sem esses dados ficam só registradas no banco. Uma falha da fonte não altera o que já está publicado. Detalhes em [docs/coleta.md](docs/coleta.md).

A página `/sobre` mostra a última execução de cada fonte.

## Rodar no computador

Node 24 e npm.

```sh
npm ci
npm run dev
```

O comando compila, aplica a migration no D1 local e inicia `wrangler pages dev` na porta 8787. O catálogo é carregado na primeira consulta.

## Verificar

```sh
npm run lint
npm run typecheck
npm run build
npm test
npx playwright install --with-deps chromium
npm run e2e
node scripts/smoke-collect.mjs   # consulta as fontes reais uma vez, sem gravar
```

Com Chrome já instalado, `CHROMIUM_PATH` pode apontar para ele no lugar do `playwright install`.

## Implantar

`npm run deploy` compila, roda os testes (que validam o catálogo) e publica migrations, Pages e o Worker de coleta. Configuração, backup e rollback: [docs/operacao.md](docs/operacao.md).

## Arquitetura

Astro compila o HTML-base e a marca React; um único Worker (Pages em modo avançado, `dist/_worker.js`) responde às rotas com HTML acessível e consultas D1. Busca e filtros usam formulários GET e funcionam sem JavaScript. O mesmo bundle roda como Worker com Cron Trigger, porque o Pages não executa crons. Tudo cabe no plano gratuito da Cloudflare, sem cartão de crédito.

- [Atualização semanal](docs/atualizacao-semanal.md)
- [Fontes dos registros iniciais](docs/fontes.md)
- [Coleta automática](docs/coleta.md)
- [Evidências e limites da validação](docs/validacao.md)

Código sob a licença GPL-3.0 (ver [LICENSE](LICENSE)). Publicações referenciadas, marcas, contatos e materiais de terceiros conservam seus direitos e condições de uso.
