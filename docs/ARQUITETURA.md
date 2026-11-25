# Arquitetura e Guia Técnico · Central Quinze

Este documento serve como mapa de sobrevivência para os desenvolvedores da **Inteligentte**. Ele explica como as peças do sistema se conectam, onde os dados vivem e como evitar quebras.

---

## 1. O Pipeline de Compilação (`build.js`)

A aplicação não utiliza bundlers pesados (como Webpack ou Vite). Ela usa um compilador em script Node nativo ([`build.js`](file:///c:/Users/equip/Downloads/quinze-central/build.js)), mantendo **100% Vanilla JS sem dependências extras de frontend**:

1. Limpa e recria a pasta `public/`.
2. Copia arquivos estáticos básicos: `index.html`, `pop.html`, `store.js`, `logo.png` e `src/app.css`.
3. Processa os scripts de `modulos/`: arquivos soltos (`modulos/<nome>.js`) são copiados para `public/modulos/`, e pastas de módulo (`modulos/<nome>/*.js`, como `modulos/pecas/`) têm seus arquivos ordenados alfabeticamente, concatenados e envolvidos numa IIFE com guarda de carga única em `public/modulos/<nome>.js`.
4. Varre os scripts de `src/js/` (arquivos `01-base.js` até `99-inicio.js`), **ordena alfabeticamente**, calcula o hash SHA-256 determinístico do build (`window.__QZ_BUILD`) para cache busting em `/app.css?v=`, `/store.js?v=` e módulos carregados sob demanda, e injeta tudo em `public/app.html`.

### Kit Compartilhado (`src/js/08b-shared.js` + `src/app.css`)
Módulos novos (ver [`modulos/_modelo.js`](file:///c:/Users/equip/Downloads/quinze-central/modulos/_modelo.js)) devem usar `QZ.criarApi(...)` / `QZ.api(...)`, `QZ.fmt` (`esc`, `br`, `brCurta`, `brHora`, `mesBr`, `brl`, `hojeSP`, `somarDias`, `copiar`), `QZ.ui` (`carregando`, `vazio`, `erroBox`, `badge`, `armarConfirmacao`, `renderPaginacao`) e as classes `.qz-*` de `src/app.css`.

> ⚠️ **Atenção:** Como os scripts são concatenados por ordem alfabética (`01`, `02`, `03`...), o escopo de variáveis dentro da IIFE é compartilhado. Se você criar um script novo em `src/js/` ou `modulos/<nome>/`, utilize a numeração correta para garantir a ordem de dependências, e rode `npm run check && npm test` para validar sintaxe, guardrails, bundle e testes unitários (`tests/*.test.js`).

---

## 2. A Camada de Dados do Cliente (`store.js`)

O arquivo [`store.js`](file:///c:/Users/equip/Downloads/quinze-central/store.js) emula a interface de banco do Claude Artifacts (`window.claude.use('db')`) para evitar a reescrita do frontend original.

### Como funciona:
* **Cache em Memória:** Mantém todos os documentos em um `Map` local no navegador (`cache`).
* **Optimistic Updates:** Ao chamar `doc.set()`, `doc.update()` ou `doc.delete()`, o cache local é alterado e a tela renderiza na hora. Uma requisição HTTP (`PUT` ou `DELETE`) é enviada para `/api/doc`. Se a API falhar, o valor original é restaurado (*rollback*).
* **Polling Incremental:** A cada **12 segundos** (ou **20 segundos** se a aba estiver em segundo plano), o cliente chama `GET /api/sync?since=${seq}`. O servidor retorna apenas os documentos com sequência maior que a atual.
* **Foco da Aba:** Quando o usuário volta para a aba da Central (`visibilitychange`), uma chamada de sincronização imediata é disparada.

---

## 3. O Backend Serverless (`api/`)

As rotas residem na pasta `api/` e rodam como Vercel Serverless Functions no runtime Node.js 22:

### Roteador Central (`api/m.js`) e Helpers (`api/_http.js`)
Para não estourar o limite de funções da Vercel (especialmente no plano Hobby/Pro), todos os módulos usam uma rota coringa:
$$\text{URL: } \texttt{/api/m?r=<modulo>/<acao>}$$

O arquivo [`api/m.js`](file:///c:/Users/equip/Downloads/quinze-central/api/m.js) intercepta a requisição, carrega sob demanda apenas o módulo pedido (via `import()` com literais estáticos), valida a sessão e o papel do usuário (`u.areas`), e delega a chamada para o manipulador específico. Novas rotas usam [`api/_http.js`](file:///c:/Users/equip/Downloads/quinze-central/api/_http.js) para parsing, métodos, respostas e validação declarativa de campos:
* `pop` ➔ `api/_pop.js`
* `tar` ➔ `api/_tarefas.js`
* `onb` ➔ `api/_onb.js` e `api/_onbexcluir.js`
* `pen` ➔ `api/_pendencias.js`
* `pec` ➔ `api/_pecas.js` (apoiado por arquivos auxiliares `api/_pecas_resumo.js`, `api/_pecas_mencoes.js` e `api/_pecas_retencao.js`)
* `adm` ➔ `api/_adm.js`
* `cs` ➔ `api/_cs.js`
* `pol` ➔ `api/_pol.js`
* `fin` ➔ `api/_fin.js`

> 💡 **Convenção em `api/`:** todo arquivo auxiliar importado pelas rotas deve iniciar com `_` para que a Vercel não o publique como uma Serverless Function independente.

### Rotas Fixas Especiais:
* `/api/sync`: Entrega documentos sincronizados para o `store.js`.
* `/api/doc`: Realiza escritas e exclusões genéricas com controle de autorização.
* `/api/login` & `/api/logout`: Gerenciamento de credenciais e cookies de sessão.
* `/api/me`: Retorna os dados do usuário conectado, abas e permissões.
* `/api/users`: Cadastro e gerenciamento de permissões pela gestão.
* `/api/health`: Checagem de disponibilidade do banco e versão do schema.

---

## 4. O Banco de Dados (Neon PostgreSQL)

O sistema utiliza a biblioteca `@neondatabase/serverless` via HTTP sem estado.

### Principais Tabelas:
* `docs`: Armazena todos os documentos do sistema em formato `jsonb`.
  * Colunas: `path` (chave primária em formato de caminho, ex: `meses/2026-10/clientes/cli_1`), `parent`, `id`, `data` (JSONB), `deleted` (boolean), `updated_at`, `seq` (gerado pela sequence `docs_seq`).
  * **Padrões importantes em `docs`:** avatares são gravados individualmente em `m/pecas/avatares/<login>` (com leitura retrocompatível para o mapa legado `m/pecas/config/avatares`); peças com arquivos expirados após 7 dias são marcadas com `arquivada: true` (saem da fila ativa, mas permanecem preservadas para o dashboard mensal).
* `usuarios`: Cadastro de colaboradores, perfil (`funcao`), papel, abas liberadas e permissões especiais.
* `app_users`: Armazena os hashes de senha (Bcrypt) dos usuários com autenticação direta.
* `app_secrets`: Guarda segredos internos do sistema (como a chave `session_secret` usada para assinar o cookie HMAC).
* `login_attempts`: Registro de tentativas de login para bloqueio por força bruta.
* `auditoria`: Histórico de ações críticas de exclusão e edição nos módulos administrativo e financeiro.
* `schema_migrations`: Controle de versão do banco (`versao integer`, `nome text`, `aplicada_em timestamptz`). Baseline legado `1..7`; novas alterações de schema ficam em `migrations/008_...sql` em diante e são aplicadas via `npm run migrate:status` / `npm run migrate` ([`scripts/migrate.js`](file:///c:/Users/equip/Downloads/quinze-central/scripts/migrate.js)).
  * **Regra para expansões:** entidades novas com volume crescente, histórico, relatórios ou filtros cruzados devem usar tabelas SQL próprias via `migrations/`; configurações simples e listas pequenas (< ~200 itens) podem ficar em `docs` com paginação (`listarPaginado`).
