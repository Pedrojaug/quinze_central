# Roadmap de Estabilização Arquitetural — Central Quinze

Este documento define o plano diretor de preparação técnica da **Central Quinze** antes das próximas adições e expansões de produto. O objetivo é eliminar gargalos estruturais, padronizar a criação de novos módulos e garantir que o sistema cresça com segurança sem precisar reescrever o que já funciona em produção.

---

## 1. Diagnóstico e Diretriz Geral

### Pontos de atenção mapeados
- **Duas arquiteturas de frontend convivendo:** o núcleo legado (`src/app.html` + `src/js/01-*.js`…`99-*.js` + `store.js`) usa concatenação em IIFE global, enquanto módulos mais novos (`modulos/` + `/api/m`) carregam sob demanda.
- **Boilerplate repetitivo:** sem bundler de módulos ES e sem biblioteca compartilhada de UI/API, cada feature nova repete montagem manual de DOM, modais, tabelas, formatação e chamadas `fetch`.
- **Tabela única `docs` (JSONB):** útil para prototipação inicial, mas gera carregamento excessivo em memória e complexidade para relatórios, filtros e histórico em grande volume.
- **Bundle único e limite Vercel:** `api/` já opera perto do limite de 12 Serverless Functions do plano Hobby (10 funções na raiz), e `api/m.js` importa todos os módulos estaticamente no mesmo cold start.
- **Pendência de segurança herdada:** `SENHA_PADRAO_INICIAL = "12345678"` ainda existe em `api/_lib.js` (tema do PR #56).

### Decisões acordadas
- **Perfil das expansões:** UI operacional da Central (tabelas, formulários, filtros, fluxos de aprovação, dashboards) — **Vanilla JS + `esbuild` + `src/shared/`** atende com máxima simplicidade e velocidade.
- **Operação:** equipe possui acesso completo ao **Neon Postgres** e à **Vercel** para rodar migrations e configurar variáveis de ambiente.
- **Estratégia:** **Strangler Pattern incremental** — 1 PR pequeno e validado por fase, mantendo a operação em produção estável.

### Regra de Ouro para novas expansões
1. **Congelar `src/js/` e `store.js` para features novas:** mexer no legado apenas para correções pontuais ou ajustes simples de manutenção.
2. **Todo módulo ou expansão nova** nasce em `modulos/<nome>/index.js` + rota em `/api/m` + biblioteca compartilhada `src/shared/`.
3. **Expansões com volume, histórico ou relatórios** devem usar **tabelas SQL próprias no Neon** (via `migrations/`), evitando inflar a tabela `docs`.

---

## 2. Fases do Plano

### Fase 0A — Higiene Técnica & Desacoplamento *(Concluída neste PR)*
- [x] Documentar este roadmap em `docs/ROADMAP_ARQUITETURA.md`.
- [x] Remover cleanup pontual (`ANDREW`) que rodava `UPDATE docs` em todo boot (`since === 0`) de `api/sync.js` e simplificar a filtragem para `path NOT LIKE 'm/%'`.
- [x] Derivar `SO_API` automaticamente a partir de `AREAS` em `api/_modules.js`.
- [x] Otimizar `clientesCarteiraComMes()` em `api/_mdados.js` para buscar direto o mês solicitado (ou listar apenas os `parent` distintos antes de ler os documentos do mês escolhido), sem carregar todos os meses da história.
- [x] Centralizar `hojeSP` e funções de data em `api/_datas.js`, removendo importações cruzadas de `_cs.js`, `_fin.js` e `_pecas.js` para `_adm.js`.

### Fase 0B — Segurança de Autenticação *(Substitui o PR #56)*
- [ ] Alinhar com o dono do repositório (`Pedrojaug`) e fechar o PR #56 (atualmente com conflitos após o PR #58).
- [ ] Antes do deploy: consultar no Neon quais usuários ainda possuem `pass_hash` correspondente a `12345678` / `1234578` para comunicar ou redefinir sem travar a equipe.
- [ ] Remover `SENHA_PADRAO_INICIAL` e o fallback `12345678`/`1234578` de `api/_lib.js`.
- [ ] Gerar senha temporária aleatória no servidor em `api/users.js` e exibir modal de cópia única em `src/js/07-usuarios.js`.
- [ ] Migrar validação da senha mestre compartilhada para hash bcrypt em variável de ambiente (`MASTER_PASS_BCRYPT` na Vercel), se aplicável.

### Fase 1 — Fundação Backend & Banco
- [ ] Trocar importações estáticas em `api/m.js` por lazy-loading dinâmico (`import()`) por módulo, reduzindo peso de cold start.
- [ ] Criar `api/_http.js` com helpers padronizados de leitura de corpo, método HTTP, respostas de erro e validação básica de payloads.
- [ ] Formalizar sistema de migrations SQL versionadas (`migrations/001_...sql` + `scripts/migrate.js`) integrado à tabela existente `schema_migrations` do Neon.
- [ ] Adicionar paginação e filtros seguros em `api/_mdados.js` para evitar `listar()` irrestrito onde houver crescimento.
- [ ] Adicionar travas automáticas em `scripts/check.js`:
  - impedir novos arquivos sem prefixo `_` em `api/` fora de uma allowlist explícita (proteção do limite Vercel);
  - impedir `ALTER TABLE` / `CREATE TABLE` dentro de `api/` (DDL somente via `migrations/`).

### Fase 2 — Fundação Frontend (`esbuild` + `src/shared/`)
- [ ] Adicionar `esbuild` como `devDependency` e evoluir `build.js` para empacotar módulos novos com `modulos/<nome>/index.js` em ESM (mantendo 100% compatível com os módulos atuais).
- [ ] Substituir o cache busting por janela de tempo em `src/js/08-modulos.js` por hash determinístico gerado no `build.js`.
- [ ] Criar `src/shared/` com utilitários reutilizáveis para os módulos novos:
  - `src/shared/api.js`: wrapper único de `fetch` para `/api/m` com tratamento de sessão, erro padronizado e estados de carregamento;
  - `src/shared/ui.js`: helpers de DOM, modais, confirmação, empty states, tabelas/filtros e toast;
  - `src/shared/format.js`: datas, moeda BRL, texto e escape HTML.
- [ ] Atualizar `modulos/_modelo.js` para refletir o novo padrão oficial (`esbuild` + `src/shared/` + `/api/m`, sem depender de `ctx.dados()`).

### Fase 3 — Contratos, Tipagem Leve & Rede de Segurança
- [ ] Adicionar `jsconfig.json` + checagem `tsc --noEmit` usando JSDoc (`// @ts-check`) nos arquivos de `src/shared/`, `api/_http.js` e novos módulos.
- [ ] Criar testes unitários para rotas/regras de `api/_*.js` usando mocks de banco e fixtures isoladas.
- [ ] Atualizar `AGENTS.md` e `docs/ARQUITETURA.md` documentando o novo padrão obrigatório para módulos e tabelas SQL.

### Fase 4 — Fatiamento Sob Demanda (Durante as Expansões)
- [ ] **Não refatorar preventivamente módulos estáveis sem ticket/expansão.**
- [ ] Quando um arquivo legado grande (`api/_cs.js`, `modulos/cs.js`, `api/_adm.js`, `modulos/administrativo.js`, `src/js/07-usuarios.js`, `src/js/04-onboarding-telas.js`, `api/_pecas.js`, `modulos/pendencias.js`) receber uma nova demanda relevante, abrir um **PR preparatório de fatiamento** antes de implementar a feature.

---

## 3. Critério para Liberar Expansões Grandes
As novas adições e expansões de grande porte ficam liberadas para iniciar com segurança assim que as **Fases 0A, 0B, 1, 2 e 3** estiverem concluídas, validadas pelo CI (`npm run check && npm test`) e em produção.
