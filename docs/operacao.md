# Operação

## Onde está publicado

| Peça | Recurso Cloudflare | Configuração |
| --- | --- | --- |
| Site e painel | Pages `hubanimaljoinville` → https://hubanimaljoinville.pages.dev | `wrangler.jsonc` (Pages, modo avançado `dist/_worker.js`) |
| Coleta agendada | Worker `hubanimaljoinville-coleta`, sem rota pública, cron `17 9,21 * * *` (06h17 e 18h17 em Joinville) | `wrangler.cron.jsonc` |
| Banco | D1 `hubanimaljoinville` | binding `DB` nos dois arquivos |
| Antispam | Turnstile `hubanimaljoinville` (managed, domínio `hubanimaljoinville.pages.dev`) | `TURNSTILE_SITE_KEY` em `vars`, `TURNSTILE_SECRET` como secret do Pages |

Pages não executa Cron Triggers. Por isso o mesmo bundle é publicado também como Worker, que só usa o handler `scheduled`: arquiva eventos vencidos, expira dados privados, consulta as fontes e cria rascunhos para a moderação.

## Implantar

```sh
npm ci
npm run deploy
```

O script compila, aplica migrations no D1 remoto, publica o Pages na branch `main` (produção) e o Worker de coleta. No GitHub, o job `deploy` faz o mesmo a cada push na `main` quando o secret `CLOUDFLARE_API_TOKEN` e a variável `CLOUDFLARE_ACCOUNT_ID` existem no repositório. O token precisa das permissões Cloudflare Pages:Edit, Workers Scripts:Edit e D1:Edit.

Secrets do Pages (já configurados; para trocar):

```sh
npx wrangler pages secret put TURNSTILE_SECRET --project-name hubanimaljoinville
npx wrangler pages secret put RATE_SECRET --project-name hubanimaljoinville
```

`RATE_SECRET` é qualquer valor aleatório de 32 bytes. Ele gera o identificador temporário do limite de envios.

## Ativar o painel administrativo

O painel `/admin` falha fechado (HTTP 403) até estas etapas, que exigem o painel Cloudflare Zero Trust:

1. Em Zero Trust → Access → Applications, crie uma aplicação *Self-hosted* para `hubanimaljoinville.pages.dev` com caminho `admin*` (cubra `/admin` e `/admin/*`). Política: *Allow* para os e-mails dos editores. O login por código enviado ao e-mail (One-time PIN) é suficiente.
2. Copie o *Application Audience (AUD) Tag* e o domínio da equipe (`https://SUA-EQUIPE.cloudflareaccess.com`, sem barra final).
3. Adicione em `wrangler.jsonc`, dentro de `vars`, `ACCESS_TEAM` e `ACCESS_AUD`, e publique de novo (`npm run deploy`).
4. Autorize cada editor no banco: `npx wrangler d1 execute DB --remote --command "INSERT INTO admin_users(email) VALUES('editor@exemplo.com')"`. Para revogar, `UPDATE admin_users SET active=0 WHERE email=...`.

O Worker verifica assinatura RS256, emissor, audiência, expiração e o cadastro ativo no D1 em cada operação administrativa.

## Rotina editorial

- **Eventos para moderação**: envios do formulário público e rascunhos da coleta automática. Rascunhos automáticos só aparecem quando a notícia informa dia, horário e um endereço; confira tudo na publicação original antes de aprovar. Nada é publicado sem aprovação.
- **Alterações e descobertas**: mudanças nas cartas de serviço e notícias recentes sem dados suficientes para um rascunho. Notícias publicadas há mais de 21 dias são registradas como `stale` e não entram na fila.
- **Verificações das fontes**: últimas execuções por fonte. Falha, bloqueio em robots.txt ou mudança de estrutura registram erro e preservam tudo o que já estava publicado.

Arquivar mantém o histórico. Restaurar cria uma revisão nova. Um conflito de versão requer reabrir o registro.

A equipe deve identificar o controlador e divulgar um contato de privacidade próprio antes de divulgar amplamente o formulário. O site apaga nome e e-mail privados ao decidir a submissão e expira pendências com mais de 30 dias. O limite é seis envios por hora por origem, guardado como HMAC, sem o IP em claro.

## Acompanhar a coleta

```sh
npx wrangler d1 execute DB --remote --command "SELECT source_id,started_at,status,summary FROM scrape_runs ORDER BY started_at DESC LIMIT 10"
npx wrangler tail hubanimaljoinville-coleta
```

## Backup e recuperação

Antes de cada migration de produção:

```sh
npx wrangler d1 export DB --remote --output backup.sql
npx wrangler d1 time-travel info DB
```

Guarde a cópia fora do repositório (pode conter dados pessoais de envios pendentes). Para ensaiar a restauração, crie outro D1 e execute `npx wrangler d1 execute NOVO_BANCO --remote --file backup.sql`. Em incidente, `npx wrangler d1 time-travel restore DB --bookmark=...` volta o banco a um ponto anterior.

Rollback de código: no painel do Pages, *Deployments* → escolha a implantação anterior → *Rollback*. Para o Worker de coleta, `npx wrangler versions list --config wrangler.cron.jsonc` e `npx wrangler rollback ID --config wrangler.cron.jsonc`. O rollback não altera o banco; novas migrations devem continuar legíveis pelo código anterior.

## Custos e capacidade

Pages, um Worker com cron, D1, Turnstile e Access (até 50 usuários) cabem nos planos gratuitos. Limites do plano gratuito: 100 mil requisições de Worker por dia e 10 ms de CPU por invocação; 5 milhões de linhas lidas e 100 mil escritas no D1 por dia. A listagem de notícias (≈400 KB) é lida por expressões regulares em vez de DOM para caber no limite de CPU. Acompanhe o status das execuções antes de aumentar a frequência ou o número de fontes.

[Limites de Workers](https://developers.cloudflare.com/workers/platform/limits/) · [Preços D1](https://developers.cloudflare.com/d1/platform/pricing/) · [Pages Functions avançado](https://developers.cloudflare.com/pages/functions/advanced-mode/) · [Validação Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) · [JWT do Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) · [Recuperação D1](https://developers.cloudflare.com/d1/reference/time-travel/)
