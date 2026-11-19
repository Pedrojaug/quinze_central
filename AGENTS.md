# Guia Técnico e Regras de Manutenção — Central Quinze

Este arquivo orienta desenvolvedores e agentes de IA que atuam em tickets e melhorias na **Central Quinze** (Node.js 22 ESM, Vanilla JS/CSS, Vercel Serverless Functions + Neon Postgres + Vercel Blob).

---

## 1. Mapa Rápido da Arquitetura

* **Frontend principal:** `src/app.html`, `src/app.css` e `src/js/01-base.js` … `99-inicio.js` (concatenados em ordem alfabética por `build.js` dentro de uma IIFE em `public/app.html`).
* **Módulos sob demanda:** ficam em `modulos/`. Podem ser arquivo único (`modulos/<nome>.js`) ou pasta (`modulos/<nome>/01-*.js` … `99-*.js`), compilados por `build.js` para `public/modulos/<nome>.js` e carregados por `src/js/08-modulos.js` via `QZ.modulo(...)`.
* **Camada reativa (`store.js`):** cache em memória + *optimistic updates* via `/api/doc` e polling incremental via `/api/sync`. Dados sensíveis (`SO_API`) usam apenas `/api/m`.
* **Backend (`api/`):** roteador único `api/m.js` (`/api/m?r=<modulo>/<acao>`), regras de acesso/perfis centralizadas em `api/_modules.js`, sessão/auth em `api/_lib.js`, helpers de docs em `api/_mdados.js`, e banco Neon Postgres (tabela `docs` em JSONB).

---

## 2. Regra Anti-Espaguete (Organização Modular)

* **Tamanho-alvo por arquivo:** manter arquivos abaixo de **~400–500 linhas**.
* **Quando um módulo crescer:**
  * **Frontend (`modulos/`):** converter `modulos/<nome>.js` em pasta `modulos/<nome>/` com arquivos numerados (`01-base.js`, `02-styles.js`, ..., `99-init.js`), usando `modulos/pecas/` como referência.
  * **Backend (`api/`):** extrair lógica pura ou subdomínios para `api/_<modulo>_<assunto>.js` (ex.: `api/_pecas_resumo.js`, `api/_pecas_mencoes.js`, `api/_pecas_retencao.js`), mantendo apenas rotas HTTP e validações de acesso no arquivo principal.
* **Não refatorar preventivamente:** módulos estáveis que não estão recebendo tickets (ex.: `politicas.js`, `financeiro.js`) não precisam ser fatiados sem demanda.

---

## 3. Restrições Críticas (Vercel + Neon + Build)

1. **Prefixo `_` obrigatório para auxiliares em `api/`:** qualquer arquivo em `api/` que **não** seja um endpoint HTTP público **deve** começar com `_` (ex.: `_pecas_resumo.js`). A Vercel conta cada arquivo sem `_` como uma Serverless Function separada e o plano tem limite de funções.
2. **Proibido DDL em runtime:** **nunca** execute `ALTER TABLE`, `CREATE TABLE` ou migrações de schema dentro de rotas HTTP, `loadUser()` ou autenticação. Dados extras de usuários/configurações devem ir na tabela `docs` (1 documento por entidade/usuário, ex.: `m/pecas/avatares/<login>`, evitando concentrar tudo num único JSONB sujeito a *race condition*).
3. **Sem segredos ou hashes hardcoded:** **nunca** coloque senhas ou hashes (`PASS_HASH`, `MASTER_PASS_HASH`, tokens) no código-fonte — especialmente no frontend. Validações de privilégio devem acontecer sempre no servidor usando variáveis de ambiente (`MASTER_PASS_HASH`, `CRON_SECRET`, etc.) e/ou usuários `mestre` no banco.
4. **Cuidados de sintaxe do pipeline (`build.js`):**
   * **Nunca** escreva a tag literal `</script` dentro de `src/js/*.js`.
   * **Nunca** use `return` no *top-level* de arquivos dentro de `modulos/<nome>/*.js` (o `build.js` envolve a pasta numa IIFE e adiciona a guarda de carga única automaticamente; `node --check` valida cada arquivo individualmente como script).
5. **Retenção sem perda de histórico:** rotinas de limpeza (como a de 7 dias em `api/_pecas_retencao.js`) devem apagar apenas os arquivos binários no Vercel Blob e arquivar os metadados (`arquivada: true`), preservando os registros para dashboards e relatórios históricos.

---

## 4. Qualidade, Testes e Fluxo Git

* **Comandos obrigatórios antes de commitar ou abrir PR:**
  ```bash
  npm run check   # node --check em todos os .js + build.js + validação de public/modulos e bundle public/app.html
  npm test        # suíte unitária nativa (node --test "tests/*.test.js")
  ```
* **Testes unitários (`tests/*.test.js`):** novas regras de negócio puras (cálculos, permissões, parsers, retenção) devem ser extraídas para módulos/funções puras e cobertas em `tests/` sem depender de conexão real ao Neon (`DATABASE_URL` de teste quando o módulo importar `_lib.js`).
* **Fluxo Git:** **nunca** commitar direto na `main` (dispara deploy automático na Vercel). Sempre trabalhar em branch (`feat/...`, `fix/...`, `refactor/...`, `chore/...`), abrir PR e aguardar o check `check-and-test` do GitHub Actions (`.github/workflows/ci.yml`) passar verde antes do merge.
