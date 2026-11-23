# Validação do MVP

Verificações realizadas em 22 de novembro de 2026. Ambiente Linux, Node 24.22.3, Astro 5.18.2, TypeScript 5.9.3 e Wrangler 4.166.0. O lockfile reproduz as versões resolvidas.

| Verificação | Resultado observado |
| --- | --- |
| ESLint e TypeScript strict | Execução concluída sem erro. |
| Build Astro e bundle ESM do Worker | Concluídos. O Wrangler também aceitou o bundle em deploy simulado com binding D1. |
| Vitest | 19 casos passaram. Incluem filtros, critérios, submissão pública, decisão transacional, exclusão de contato privado, deduplicação, concorrência, restauração, proteção de origem, bloqueio administrativo, datas, arquivamento, indisponibilidade e mudanças de estrutura da fonte. |
| Importador | Nove testes Python passaram. CSV e XLSX, rastreabilidade, limites, datas, filas, duplicatas e SQL aplicado a SQLite. O mesmo lote aplicado duas vezes em D1 local produziu uma pendência e zero fichas públicas. |
| Playwright | Dois cenários móveis passaram em Chromium headless. Busca até o canal de castração e envio até a aprovação e leitura pública, com verificação de privacidade. |
| Acessibilidade | axe-core em sete rotas, com regras WCAG 2 A/AA, 2.1 AA e 2.2 AA. Zero violações reportadas. O primeiro Tab alcançou o atalho para o conteúdo. Sem overflow horizontal no viewport móvel ensaiado. |
| Inspeção visual | Página inicial inspecionada a 393 e 1280 pixels de largura. Busca, links de urgência e navegação permaneceram legíveis. |
| D1 e fontes | Migration aplicada via Wrangler local. O coletor foi executado contra as duas fontes municipais e gerou dados de revisão. Datas em notícias antigas não geraram eventos futuros. |

## Correções que alteraram o resultado

- A lista de arquivo exibia eventos retirados manualmente. Agora exige término passado e distingue arquivamento automático da retirada por editor.
- O build incorporava CSS em linha que a política de segurança bloquearia. Os estilos agora são arquivos de mesma origem.
- A validação dos formulários trata origem, tamanho, campos duplicados e URLs. A disputa por uma mesma versão ou ocorrência tem resposta de conflito. Aprovação e remoção dos contatos privados usam a mesma transação.
- A instalação interrompida deixou um pacote do Wrangler incompleto. Uma instalação limpa a partir do lockfile restaurou a CLI e permitiu aplicar a migration e validar o bundle.

## Abrangência

A automação cobre um índice de notícias e uma carta de serviço. A leitura de uma notícia cria uma candidata. A confirmação da edição, do endereço e dos contatos cabe a um editor. Os dados iniciais foram conferidos em documentos em 20/11 e não houve verificação telefônica nem confirmação de vagas. O calendário do Mueller tem conferência editorial. Em 22/11 restavam duas feiras futuras no conjunto inicial.

Os testes de aprovação no navegador usam identidade e prova antispam substituídas em processo exclusivo de teste. O Worker distribuído contém a autenticação e a verificação reais. Ainda dependem do ambiente de produção o ensaio com um organizador e editor reais, a validação de recuperação de backup remoto, as métricas sob tráfego e o acompanhamento dos crons. A auditoria automatizada e a inspeção visual não cobrem uma sessão com leitor de tela em aparelho físico.

## Validação de 23 de novembro de 2026 (migração para Cloudflare Pages)

Windows 11, Node 24.14.1, Wrangler 4.166.0, Chrome do sistema para o Playwright.

| Verificação | Resultado |
| --- | --- |
| ESLint, TypeScript strict, build | Sem erros. |
| Vitest | 23 testes passaram, incluindo cálculo do dia anunciado, rascunho com horário de Joinville, recusa sem horário/local e criação de rascunho pendente sem duplicação nem publicação. |
| Importador (Python) | 9 testes passaram. |
| Playwright móvel | 2 cenários passaram (busca até contato com axe-core; envio e aprovação). |
| Coleta real (`scripts/smoke-collect.mjs`) | Quatro fontes lidas. Rascunhos extraídos corretamente de notícias antigas do CBEA (ex.: notícia de 06/08 → domingo 09/08, 9h–13h, Arena Joinville). |
| Produção | Pages respondeu 200 em `/`, `/servicos`, `/agenda`, `/organizacoes`, `/enviar-evento`, `/sitemap.xml`; `/admin` respondeu 403 (Access ainda não configurado). Cron executou as quatro fontes com `ok` e arquivou o evento de 21/11. |

Não verificado: envio real pelo formulário público com Turnstile em produção, login no painel (depende do Cloudflare Access) e um rascunho gerado por notícia futura real.

## Validação de 23 de novembro de 2026 (site somente leitura)

O Cloudflare Access exige cartão de crédito, então o painel, o envio público, o Turnstile e o importador foram removidos. O catálogo passou a viver em `data/seed.json` (atualização semanal da equipe) e a coleta da Prefeitura publica sozinha, com selo.

| Verificação | Resultado |
| --- | --- |
| ESLint, TypeScript strict, build | Sem erros. |
| Vitest | 21 testes passaram: validação de todas as entradas do catálogo, sincronização (idempotente, edição, arquivamento do removido, reinclusão, preservação do evento coletado), páginas públicas sem link de envio, 404 em `/enviar-evento` e `/admin`, 405 em POST, HEAD, escape de texto, arquivamento com fonte fora do ar e publicação automática com selo e sem duplicar. |
| Playwright móvel | 1 cenário passou (busca até contato; axe-core sem violações em 7 rotas, sem overflow horizontal). |
| Produção | `npm run deploy` publicou Pages e Worker. `/`, `/servicos`, `/agenda`, `/organizacoes`, `/sobre`, `/privacidade`, `/sitemap.xml` e `/robots.txt` responderam 200; `/enviar-evento` e `/admin` 404; POST 405. O D1 remoto registrou a nova versão do catálogo. Os secrets `TURNSTILE_SECRET` e `RATE_SECRET` foram apagados do Pages. |

Não verificado: um evento publicado automaticamente a partir de notícia futura real (não havia nenhuma no portal nesta data).
