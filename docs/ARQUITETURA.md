# Arquitetura e Guia Técnico · Central Quinze

Este documento serve como mapa de sobrevivência para os desenvolvedores da **Inteligentte**. Ele explica como as peças do sistema se conectam, onde os dados vivem e como evitar quebras.

---

## 1. O Pipeline de Compilação (`build.js`)

A aplicação não utiliza bundlers pesados (como Webpack ou Vite). Ela usa um compilador em script Node nativo ([`build.js`](file:///c:/Users/equip/Downloads/quinze-central/build.js)):

1. Limpa e recria a pasta `public/`.
2. Copia arquivos estáticos básicos: `index.html`, `pop.html`, `store.js`, `logo.png` e `src/app.css`.
3. Copia recursivamente todos os scripts da pasta `modulos/` para `public/modulos/`.
4. Varre os scripts de `src/js/` (arquivos `01-base.js` até `99-inicio.js`), **ordena alfabeticamente** e os concatena em uma única tag `<script>` dentro de `src/app.html`, gerando o arquivo final `public/app.html`.

> ⚠️ **Atenção:** Como os scripts são concatenados por ordem alfabética (`01`, `02`, `03`...), o escopo de variáveis dentro de uma função IIFE é compartilhado. Se você criar um script novo em `src/js/`, utilize a numeração correta para garantir a ordem de dependências.

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

### Roteador Central (`api/m.js`)
Para não estourar o limite de funções da Vercel (especialmente no plano Hobby/Pro), todos os módulos usam uma rota coringa:
$$\text{URL: } \texttt{/api/m?r=<modulo>/<acao>}$$

O arquivo [`api/m.js`](file:///c:/Users/equip/Downloads/quinze-central/api/m.js) intercepta a requisição, valida a sessão e o papel do usuário (`u.areas`), e delega a chamada para o manipulador específico:
* `pop` ➔ `api/_pop.js`
* `tar` ➔ `api/_tarefas.js`
* `onb` ➔ `api/_onb.js` e `api/_onbexcluir.js`
* `pen` ➔ `api/_pendencias.js`
* `pec` ➔ `api/_pecas.js`
* `adm` ➔ `api/_adm.js`
* `cs` ➔ `api/_cs.js`
* `pol` ➔ `api/_pol.js`
* `fin` ➔ `api/_fin.js`

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
* `usuarios`: Cadastro de colaboradores, perfil (`funcao`), papel, abas liberadas e permissões especiais.
* `app_users`: Armazena os hashes de senha (Bcrypt) dos usuários com autenticação direta.
* `app_secrets`: Guarda segredos internos do sistema (como a chave `session_secret` usada para assinar o cookie HMAC).
* `login_attempts`: Registro de tentativas de login para bloqueio por força bruta.
* `auditoria`: Histórico de ações críticas de exclusão e edição nos módulos administrativo e financeiro.
* `schema_migrations`: Controle de versão do banco.
