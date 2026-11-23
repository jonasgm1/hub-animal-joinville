# Fontes de monitoramento

> Atualização de 23/11/2026: o cadastro passou a ter quatro fontes, todas no portal da Prefeitura (três buscas de notícias e a carta de castração). A coleta roda duas vezes por dia e, quando a notícia traz dia, horário e endereço, publica o evento com o selo "Coletado automaticamente". Ver "Publicação automática" no fim deste documento.

Conferência em 20 de novembro de 2026, com agente identificado como `AnimalJoinville/1.0`. O cadastro versionado em `data/sources.json` delimita cada endereço e sua finalidade.

| Origem | Resposta observada | Informação de interesse |
| --- | --- | --- |
| [Busca municipal de notícias sobre feira de adoção](https://www.joinville.sc.gov.br/?post_type=noticia&s=feira+de+ado%C3%A7%C3%A3o) | HTTP 200, HTML, 409.608 bytes | Dentro de `main`, a consulta retornou notícias municipais, inclusive dois títulos de feiras do CBEA. Outros resultados da mesma busca eram sobre plantas e ações de saúde. |
| [Carta municipal sobre castração](https://www.joinville.sc.gov.br/servicos/requerer-castracao-de-animal-domestico/) | HTTP 200, HTML, 61.007 bytes | Título em `h1`. O `article` inclui critérios, canais, custo e data publicada de revisão. |
| [Diretrizes para robôs da Prefeitura](https://www.joinville.sc.gov.br/robots.txt) | HTTP 200, text/plain, 757 bytes | O grupo geral impede leitura de diretórios internos. Os dois endereços cadastrados ficaram fora das exclusões verificadas. Há grupos distintos que bloqueiam completamente outros três agentes. |

O [termo municipal](https://www.joinville.sc.gov.br/termo-de-uso-e-politica-de-privacidade/) aborda direitos de terceiros e proteção dos dados. A revisão não identificou proibição expressa de consulta automatizada às duas páginas públicas. O projeto restringe o uso a monitorar alterações e apontar fatos que um editor pode conferir no original. O portal não concede licença geral para reproduzir matérias, fotografias e demais conteúdos. O acesso às páginas privadas e ao autosserviço está fora do escopo.

O [calendário do Shopping Mueller](https://muellerjoinville.com.br/atracao/shopping-mueller-divulga-calendario-de-feirinhas-de-adocao-animal-para-2026/) serviu à conferência editorial. O [termo de uso](https://muellerjoinville.com.br/termos-de-uso/) disponível nesta data continha texto de preenchimento. O monitoramento automático ficou restrito às duas fontes municipais acima.

## Conferência de uma alteração

1. Abrir o endereço original da observação e confirmar que diz respeito a Joinville.
2. Conferir se a publicação anuncia uma edição específica, a data e os horários locais, o endereço, a organização e um contato público. A data que acompanha o título na busca municipal é a data da notícia.
3. Comparar o registro com o que já consta na agenda ou no diretório. Confirmar alterações nos contatos e na elegibilidade diretamente na fonte. Manter data e link de verificação.
4. Diante de página indisponível, estrutura nova, bloqueio em robots ou termos alterados, preservar o registro público aprovado e revisar a origem antes de retomar a rotina.

O endereço `/feed/` do portal retornou HTTP 410. A rota `/noticias/` redirecionou para HTTP. Foi selecionada a URL pública de pesquisa em HTTPS, que respondeu diretamente. As amostras locais de HTML são recortes reduzidos com paráfrases para testes, e o arquivo de diretivas registra a resposta do dia. Elas não alimentam a agenda pública.

## Validação com as fontes reais

Em 22/11/2026, entre 22h32min37s e 22h32min43s UTC, `node scripts/smoke-collect.mjs` executou o mesmo módulo usado pelo Worker com requisições reais, sem gravar no banco. A busca encontrou duas notícias do CBEA, de [15 de outubro](https://www.joinville.sc.gov.br/noticias/cbea-realiza-feira-de-adocao-de-caes-filhotes-e-adultos-neste-domingo-em-joinville/) e de [24 de setembro](https://www.joinville.sc.gov.br/noticias/centro-de-bem-estar-animal-promove-feira-de-adocao-neste-domingo-em-joinville/). O monitor extraiu uma observação da carta de castração. O resultado comprova a descoberta de anúncios, inclusive antigos. O editor confere datas e local antes de criar ou alterar um evento.

Cada execução consulta robots.txt e no máximo quatro notícias distintas na primeira página de resultados. Todos os acessos à mesma origem são sequenciais. A leitura possui prazo de 12 segundos por requisição e limite de 700 KiB por HTML, aferido durante a leitura do corpo. Um bloqueio, HTTP 429, redirecionamento, MIME inesperado ou mudança estrutural falha a coleta daquela fonte. Datas e horários da notícia são indícios textuais para revisão. A assinatura inclui o conteúdo normalizado e os destinos dos links, inclusive se somente o destino de um canal de atendimento mudar.

Validação offline executada com `npx vitest run tests/collect.test.ts`: dez testes aprovados. Para repetir o acesso real, executar `node scripts/smoke-collect.mjs` na raiz após instalar as dependências. O teste não integra a rotina de CI e a lista de resultados pode variar.

## Publicação automática (23/11/2026)

Buscas cadastradas: `feira de adoção`, `adoção cbea` e `castração`. A pesquisa do portal já devolve as notícias mais recentes primeiro; cada execução lê até seis notícias por busca cujo título combine um termo de evento (feira, mutirão, campanha, vacinação) com um termo animal.

Para cada notícia:

- a data de publicação vem da meta `article:published_time`;
- o dia do evento é calculado a partir dela: "neste domingo", "no próximo sábado (22/8)", "18/10" ou "5 de janeiro";
- o horário vem de "das 9h às 13h" e o local de um trecho "no/na ... (rua/avenida ...)";
- se os três existirem e o evento ainda não terminou, o evento é publicado na agenda com o selo "Coletado automaticamente", tipo, organizador (CBEA quando citado) e a notícia como fonte e contato;
- se faltar algum dado, a notícia fica só registrada em `source_observations` (status `pending`); notícias com mais de 21 dias ficam como `stale`.

Não há revisão humana antes da publicação automática: o site não tem painel (o Cloudflare Access exigiria cartão de crédito). Por isso a extração só aceita notícias da Prefeitura com dia, horário e endereço explícitos, e a ficha sempre aponta para a notícia original. Um evento com a mesma ocorrência (título, início e local) ou o mesmo identificador não é recriado, inclusive se a equipe o tiver arquivado. Eventos lançados pela equipe com título diferente podem aparecer em duplicidade; a revisão semanal arquiva o coletado (ver [operacao.md](operacao.md)).

A listagem de busca (≈400 KB) é lida com expressões regulares limitadas ao `<main>`, porque montar o DOM custava ≈50 ms de CPU, acima do limite do plano gratuito de Workers. As notícias, menores, continuam lidas como DOM.

Execução real em produção em 23/11/2026 às 22h05 UTC: as quatro fontes terminaram com status `ok`, 15 observações foram registradas (14 notícias antigas como `stale` e a referência da carta) e nenhum evento, pois não havia feira futura anunciada no portal.
