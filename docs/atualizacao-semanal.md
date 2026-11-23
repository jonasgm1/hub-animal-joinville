# Atualização semanal da agenda e do diretório

O site é somente leitura: não há formulário, cadastro nem painel. Tudo o que aparece no diretório e na agenda vem de duas origens:

1. **`data/seed.json`**, o catálogo que a equipe revisa uma vez por semana a partir das publicações das ONGs, protetores, redes sociais e órgãos públicos;
2. **a coleta automática** das notícias da Prefeitura, que roda duas vezes por dia e publica sozinha os eventos com dia, horário e local explícitos (ver [coleta.md](coleta.md)).

## Rotina

1. Levante os eventos da semana nas fontes que a equipe acompanha. Use só o que foi divulgado publicamente; não copie fotos nem textos longos.
2. Edite `data/seed.json`:
   - **novo evento**: acrescente um objeto em `events` (formato abaixo);
   - **mudança**: altere o objeto existente, mantendo o mesmo `slug`;
   - **cancelamento**: apague o objeto. O site arquiva o registro (some da agenda, fica no histórico do banco);
   - eventos que já terminaram podem ficar no arquivo ou ser apagados; a rotina diária já os move para "eventos encerrados".
3. Atualize `verifiedAt` (data `AAAA-MM-DD` da conferência) em tudo que foi conferido.
4. Rode `npm test`. O primeiro teste valida cada entrada do catálogo e acusa o `slug` com problema.
5. Publique: `npm run deploy` (ou faça push na `main` com o secret `CLOUDFLARE_API_TOKEN` configurado no GitHub). Na primeira visita depois da implantação, o site compara a versão do arquivo e aplica inserções, edições e arquivamentos no D1.

## Formato de um evento

```json
{
  "slug": "feira-turma-do-gatil-2026-12-05",
  "title": "Feira de adoção da Turma do Gatil",
  "type": "Feira de adoção",
  "description": "Uma ou duas frases com o essencial, escritas pela equipe.",
  "start": "2026-12-05T13:00:00.000Z",
  "end": "2026-12-05T18:00:00.000Z",
  "location": "Shopping Mueller, Rua Visconde de Taunay, 235, Centro, Joinville/SC",
  "organizer": "Turma do Gatil",
  "organization": "turma-do-gatil",
  "contact": "contato público divulgado pelo organizador",
  "sourceUrl": "https://link-da-publicacao-original",
  "verifiedAt": "2026-12-01"
}
```

- `slug`: minúsculas, números e hífens; único dentro de `events`. Sugestão: nome curto + data.
- `type`: um de `Feira de adoção`, `Campanha`, `Mutirão`, `Encontro`.
- `start` e `end`: **horário UTC**. Joinville está em UTC−3: 10h locais = `13:00:00.000Z`. `end` precisa ser depois de `start`.
- `organization` (opcional): `slug` de uma entrada de `organizations`; o teste confere que ela existe.
- `contact`: só contatos que o próprio organizador tornou públicos (perfil, telefone ou e-mail divulgado).
- `sourceUrl`: endereço HTTPS da publicação usada na conferência (post, página, notícia).

Serviços e organizações seguem o mesmo princípio; use as entradas existentes no arquivo como modelo. Serviços exigem `category`, `cost`, `audience`, `eligibility` e `steps`.

## Redes sociais

A coleta automática não lê Instagram, Facebook nem WhatsApp. Se a equipe usar alguma ferramenta para levantar publicações dessas redes, ela roda fora deste projeto, sob as regras de cada plataforma, e o resultado entra aqui só depois de conferido por uma pessoa.
