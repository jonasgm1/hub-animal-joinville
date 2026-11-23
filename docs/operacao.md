# Operação

## Onde está publicado

| Peça | Recurso Cloudflare | Configuração |
| --- | --- | --- |
| Site | Pages `hubanimaljoinville` → https://hubanimaljoinville.pages.dev | `wrangler.jsonc` (Pages, modo avançado `dist/_worker.js`) |
| Coleta agendada | Worker `hubanimaljoinville-coleta`, sem rota pública, cron `17 9,21 * * *` (06h17 e 18h17 em Joinville) | `wrangler.cron.jsonc` |
| Banco | D1 `hubanimaljoinville` | binding `DB` nos dois arquivos |

Pages não executa Cron Triggers. Por isso o mesmo bundle é publicado também como Worker, que só usa o handler `scheduled`: sincroniza o catálogo, arquiva eventos vencidos, consulta as fontes e publica eventos coletados. Não há secrets: o site não tem login, formulários nem chaves externas.

## Implantar

```sh
npm ci
npm run deploy
```

O script compila, roda os testes (inclusive a validação de `data/seed.json`), aplica migrations no D1 remoto, publica o Pages na branch `main` (produção) e o Worker de coleta.

No GitHub, o job `deploy` faz o mesmo a cada push na `main` quando o secret `CLOUDFLARE_API_TOKEN` e a variável `CLOUDFLARE_ACCOUNT_ID` existem no repositório. O token é gratuito (painel Cloudflare → *My Profile* → *API Tokens*) e precisa das permissões Cloudflare Pages:Edit, Workers Scripts:Edit e D1:Edit. Com isso, a atualização semanal vira só editar `data/seed.json` pelo GitHub e salvar.

## Rotina semanal

Ver [atualizacao-semanal.md](atualizacao-semanal.md). Depois de publicar, confira a agenda no site. Eventos coletados automaticamente aparecem com o selo "Coletado automaticamente"; se algum estiver errado, retire-o do banco:

```sh
npx wrangler d1 execute DB --remote --command "UPDATE events SET status='archived',actor='editor',revision=revision+1 WHERE slug='SLUG-DO-EVENTO'"
```

Se o mesmo evento aparecer duas vezes (um lançado pela equipe e outro coletado, com títulos diferentes), arquive o coletado da mesma forma. Um registro arquivado assim não volta: a coleta não recria eventos com o mesmo título, início e local.

## Acompanhar a coleta

A página `/sobre` mostra a última execução de cada fonte. Mais detalhes:

```sh
npx wrangler d1 execute DB --remote --command "SELECT source_id,started_at,status,summary FROM scrape_runs ORDER BY started_at DESC LIMIT 10"
npx wrangler d1 execute DB --remote --command "SELECT url,status,observed_at FROM source_observations ORDER BY observed_at DESC LIMIT 20"
npx wrangler tail hubanimaljoinville-coleta
```

## Backup e recuperação

Antes de cada migration de produção:

```sh
npx wrangler d1 export DB --remote --output backup.sql
npx wrangler d1 time-travel info DB
```

Para ensaiar a restauração, crie outro D1 e execute `npx wrangler d1 execute NOVO_BANCO --remote --file backup.sql`. Em incidente, `npx wrangler d1 time-travel restore DB --bookmark=...` volta o banco a um ponto anterior. O catálogo também pode ser recriado a qualquer momento a partir de `data/seed.json`.

Rollback de código: no painel do Pages, *Deployments* → escolha a implantação anterior → *Rollback*. Para o Worker de coleta, `npx wrangler versions list --config wrangler.cron.jsonc` e `npx wrangler rollback ID --config wrangler.cron.jsonc`. O rollback não altera o banco; novas migrations devem continuar legíveis pelo código anterior.

As tabelas `submissions`, `admin_users` e `rate_limits` da migration inicial ficaram sem uso depois da remoção do envio público e do painel; estão vazias e podem ser removidas numa migration futura.

## Custos e capacidade

Pages, um Worker com cron e D1 cabem nos planos gratuitos, sem cartão de crédito. Limites do plano gratuito: 100 mil requisições de Worker por dia e 10 ms de CPU por invocação; 5 milhões de linhas lidas e 100 mil escritas no D1 por dia. A listagem de notícias (≈400 KB) é lida por expressões regulares em vez de DOM para caber no limite de CPU. Acompanhe o status das execuções antes de aumentar a frequência ou o número de fontes.

[Limites de Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Preços D1](https://developers.cloudflare.com/d1/platform/pricing/) · [Pages Functions avançado](https://developers.cloudflare.com/pages/functions/advanced-mode/) · [Recuperação D1](https://developers.cloudflare.com/d1/reference/time-travel/)
