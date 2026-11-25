# Roadmap de Estabilização Arquitetural — Central Quinze

Este documento define o plano diretor de preparação técnica da **Central Quinze** antes das próximas adições e expansões de produto. O objetivo é eliminar gargalos estruturais, padronizar a criação de novos módulos e garantir que o sistema cresça com segurança sem precisar reescrever o que já funciona em produção.

---

## 1. Diagnóstico e Diretriz Geral

### Pontos de atenção mapeados
- **Duas arquiteturas de frontend convivendo:** o núcleo legado (`src/app.html` + `src/js/01-*.js`…`99-*.js` + `store.js`) usa concatenação em IIFE global, enquanto módulos mais novos (`modulos/` + `/api/m`) carregam sob demanda.
- **Boilerplate repetitivo:** sem camada compartilhada de UI/API no frontend, cada feature nova repete montagem manual de DOM, modais, tabelas, formatação e chamadas `fetch`.
- **Tabela única `docs` (JSONB):** útil para prototipação inicial, mas gera carregamento excessivo em memória e complexidade para relatórios, filtros e histórico em grande volume.
- **Bundle único e limite Vercel:** `api/` já opera perto do limite de 12 Serverless Functions do plano Hobby (10 funções na raiz), e `api/m.js` importa todos os módulos estaticamente no mesmo cold start.

### Decisões acordadas
- **Perfil das expansões:** UI operacional da Central (tabelas, formulários, filtros, fluxos de aprovação, dashboards) — **100% Vanilla JS com zero novas dependências** (`build.js` nativo em Node + camada compartilhada em `QZ`, sem frameworks, sem `esbuild` e sem `typescript`).
- **Banco de dados e operação:** equipe possui acesso completo ao **Neon Postgres** e à **Vercel** para rodar migrations e configurar variáveis de ambiente. O Neon está na **`versaoBanco = 7`** com `schema_migrations(versao integer, nome text, aplicada_em timestamptz)`.
- **Estratégia:** **Strangler Pattern incremental** — 1 PR pequeno e validado por fase, mantendo a operação em produção estável.

### Regra de Ouro para novas expansões
1. **Congelar `src/js/` e `store.js` para features novas:** mexer no legado apenas para correções pontuais ou ajustes simples de manutenção.
2. **Todo módulo ou expansão nova** nasce em `modulos/<nome>/01-*.js`…`99-*.js` (ou arquivo único enxuto) consumindo os utilitários compartilhados de `QZ` (`QZ.api`, `QZ.fmt`, `QZ.ui`) + `/api/m`.
3. **Banco por perfil de dado:** expansões com volume crescente, histórico, filtros cruzados ou relatórios devem usar **tabelas SQL próprias no Neon** via `migrations/` (a partir da versão `008`); configurações simples e listas pequenas (< ~200 itens) podem continuar em `docs`.

---

## 2. Fases do Plano

### Fase 0 — Higiene Técnica & Desacoplamento *(Concluída neste PR)*
- [x] Documentar este roadmap em `docs/ROADMAP_ARQUITETURA.md`.
- [x] Remover cleanup pontual (`ANDREW`) que rodava `UPDATE docs` em todo boot (`since === 0`) de `api/sync.js` e simplificar a filtragem para `path NOT LIKE 'm/%'`.
- [x] Derivar `SO_API` automaticamente a partir de `AREAS` em `api/_modules.js`.
- [x] Otimizar `clientesCarteiraComMes()` em `api/_mdados.js` para buscar direto o mês solicitado (ou listar apenas os `parent` distintos antes de ler os documentos do mês escolhido), sem carregar todos os meses da história.
- [x] Centralizar `hojeSP` e funções de data em `api/_datas.js`, removendo importações cruzadas de `_cs.js`, `_fin.js` e `_pecas.js` para `_adm.js`.

### Fase 1 — Fundação Backend & Banco
- [ ] Trocar importações estáticas em `api/m.js` por lazy-loading com literais estáticos (`import("./_...")`), compatível com `@vercel/nft` e reduzindo o cold start.
- [ ] Criar `api/_http.js` com helpers padronizados de leitura de corpo, método HTTP, respostas de erro, paginação e validação declarativa de payloads.
- [ ] Formalizar sistema de migrations SQL versionadas (`migrations/008_...sql` + `scripts/migrate.js`) integrado à tabela existente `schema_migrations` (`versao`, `nome`, `aplicada_em`) do Neon.
- [ ] Adicionar paginação segura (`listarPaginado` e `montarPaginacao`) em `api/_mdados.js` para evitar `listar()` irrestrito onde houver crescimento.
- [ ] Adicionar travas automáticas em `scripts/check.js`:
  - impedir novos arquivos sem prefixo `_` em `api/` fora da allowlist explícita e respeitar o limite de funções da Vercel;
  - impedir `CREATE`/`ALTER`/`DROP TABLE|INDEX|SEQUENCE|SCHEMA` dentro de `api/` (DDL somente via `migrations/`);
  - impedir `import()` dinâmico com variável/interpolação em `api/m.js`.

### Fase 2 — Fundação Frontend (100% Vanilla JS, zero dependências novas)
- [ ] Criar camada compartilhada no próprio objeto global `QZ` (`QZ.api`, `QZ.fmt`, `QZ.ui`) + classes utilitárias reutilizáveis em `src/app.css`.
- [ ] Substituir o cache busting por janela de tempo em `src/js/08-modulos.js` por hash determinístico gerado pelo `build.js`.
- [ ] Atualizar `modulos/_modelo.js` para refletir o novo padrão oficial (`QZ.api` + `QZ.fmt` + `QZ.ui` + `/api/m`, sem depender de `ctx.dados()`).

### Fase 3 — Contratos & Rede de Segurança
- [ ] Criar testes unitários de contrato e integração para `api/m.js`, `api/_http.js`, utilitários `QZ` e rotas críticas de `api/_*.js` com mock de `sql`.
- [ ] Atualizar `AGENTS.md` e `docs/ARQUITETURA.md` documentando o novo padrão obrigatório para módulos, `api/_http.js` e tabelas SQL via `migrations/`.

### Fase 4 — Fatiamento Sob Demanda (Durante as Expansões)
- [ ] **Não refatorar preventivamente módulos estáveis sem ticket/expansão.**
- [ ] Quando um arquivo legado grande (`api/_cs.js`, `modulos/cs.js`, `api/_adm.js`, `modulos/administrativo.js`, `src/js/07-usuarios.js`, `src/js/04-onboarding-telas.js`, `api/_pecas.js`, `modulos/pendencias.js`) receber uma nova demanda relevante, abrir um **PR preparatório de fatiamento** antes de implementar a feature.

---

## 3. Critério para Liberar Expansões Grandes
As novas adições e expansões de grande porte ficam liberadas para iniciar com segurança assim que as **Fases 0, 1, 2 e 3** estiverem concluídas, validadas pelo CI (`npm run check && npm test`) e em produção.
