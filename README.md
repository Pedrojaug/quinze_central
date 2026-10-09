# Central Quinze 🚀

> **Ecossistema Integrado de Gestão de Carteira, Onboarding, Operação e Backoffice da Quinze Comunicação.**

![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel&style=flat-square)
![Node](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&style=flat-square)
![PostgreSQL](https://img.shields.io/badge/Database-Neon%20Postgres-00E599?logo=postgresql&style=flat-square)
![Region](https://img.shields.io/badge/Region-São%20Paulo%20(gru1)-0660FF?style=flat-square)
![Architecture](https://img.shields.io/badge/Frontend-Vanilla%20JS%20%2F%20CSS-F7DF1E?style=flat-square)

---

## 📌 1. Visão Geral

A **Central Quinze** é a plataforma interna que centraliza as operações da agência **Quinze Comunicação**. Ela unifica o fluxo comercial, distribuição de carteiras, implantação de novos clientes, esteira de aprovação de peças, backoffice administrativo e financeiro.

A aplicação foi desenhada com foco em **velocidade e simplicidade operacional**: cada membro da equipe visualiza exatamente os dados que lhe competem em tempo real, com atualizações otimistas na interface e sincronização automática em segundo plano.

---

## 🧩 2. Módulos do Sistema

O sistema é dividido em **6 Grandes Áreas** com controle granular de permissões, além do portal de Procedimentos Operacionais:

### `01` Atendimento
* **Dashboard da Carteira:** Visão consolidada da carteira do mês, faturamento, níveis de clientes e carga de trabalho por Social Media.
* **Clientes:** Gestão de clientes ativos, distribuição por atendimento e social media, volume de postagens e nível de complexidade (A, B, C, D).
* **Onboarding:** Fluxo completo desde o aceite da proposta até a entrega das primeiras peças, com rastreamento de dias úteis e prazos de implantação.
* **Propostas:** Emissão e histórico de propostas comerciais em PDF com parâmetros de serviço e valores contratuais.
* **Agenda:** Calendário integrado de reuniões, alinhamentos da equipe e exportação direta em formato iCalendar (`.ics`).
* **Minhas Tarefas & Relatório das 20h:** Checklist diário operacional com lembretes automáticos e fechamento diário via WhatsApp.
* **Pendências de Clientes:** Acompanhamento de materiais e aprovações aguardando retorno do cliente.

### `02` Aprovação de Peças
* **Envio de Peças:** Upload e submissão de criativos e cópias por designers e social medias.
* **Fila de Aprovação:** Gestão e revisão interna por coordenadores e gestores antes do envio ao cliente.
* **Dashboard Mensal:** Métricas de refações, prazos de entrega e volume produzido por colaborador.
* **Dados Consolidados:** Visão unificada da produção da agência.

### `03` Administrativo
* **Contratos:** Armazenamento, status e controle de vigência dos contratos de clientes.
* **Assinatura de Documentos:** Integração com Google Drive para coleta e guarda de termos assinados.
* **Pessoal & Férias:** Ficha interna confidencial de colaboradores e escala anual de férias da equipe.
* **Equipe e Ajustes:** Configuração global de atendimentos, social medias e parâmetros operacionais.
* **Gestão de Usuários:** Cadastro, definição de papéis, permissões de abas e controle de acesso.

### `04` CS (Customer Success)
* **NPS Pesquisa & Média:** Acompanhamento de índices de satisfação dos clientes com automação via Google Forms.
* **Reclamações:** Registro de feedbacks críticos, tratativas e resolução de atritos.

### `05` Políticas da Empresa
* **Código de Ética:** Publicação e versionamento dos termos de conduta da empresa.
* **Rastreamento de Leituras:** Registro obrigatório com confirmação de leitura por cada colaborador.

### `06` Financeiro
* **Contas a Receber e a Pagar:** Lançamentos, datas de vencimento, comprovantes e baixa de títulos.
* **Fluxo de Caixa & DRE:** Visão do saldo atual, conciliação e demonstrativo financeiro em tempo real.
* **Relatórios em PDF:** Geração e download de relatórios executivos para a diretoria.

### 📘 Meu POP (Procedimentos Operacionais Padrão)
* Página acessível interna e publicamente (`/pop`) onde cada colaborador consulta o guia passo a passo da sua função e regras operacionais.
* Suporte a enriquecimento e geração de procedimentos com Inteligência Artificial (**Anthropic Claude**).

---

## 🏗️ 3. Arquitetura Técnica

```
quinze-central/
├── api/               # Vercel Serverless Functions (Node.js 22.x)
│   ├── m.js           # Roteador central multi-módulo (economia de cotas serverless)
│   ├── sync.js        # Sincronização incremental com o Neon PostgreSQL
│   ├── doc.js         # CRUD genérico de documentos com validação de permissões
│   ├── login.js       # Autenticação híbrida (IMAP Locaweb + Bcrypt)
│   └── _*.js          # Lógicas internas, integradores externos e segurança
├── modulos/           # Scripts JS dinâmicos carregados sob demanda por módulo
├── src/               # Código-fonte do Painel Operacional
│   ├── app.html       # Esqueleto do painel
│   ├── app.css        # Design System (tokens, responsividade e temas)
│   └── js/            # Módulos JS numerados e concatenados pelo build (01 a 99)
├── public/            # Diretório de build final distribuído pela Vercel
├── build.js           # Pipeline de montagem de assets estáticos e scripts
├── store.js           # Camada de banco reativa no cliente (emulação Firestore + Sync Neon)
├── vercel.json        # Configuração de deploy, rotas, crons e região (gru1)
└── package.json       # Dependências de backend e engines suportadas
```

### Principais Decisões Arquiteturais:
1. **Frontend Vanilla Ultra-Rápido:** Sem o peso de frameworks como React ou Vue, a página é carregada instantaneamente, utilizando tipografia moderna (*Bricolage Grotesque* e *Figtree*) e CSS nativo.
2. **Reatividade & Optimistic UI (`store.js`):** Qualquer ação de salvar, editar ou excluir reflete **imediatamente na interface** antes mesmo de esperar a resposta do servidor. Se a rede falhar, o estado anterior é restaurado automaticamente (*rollback*).
3. **Sincronização Incremental:** O cliente mantém um cache em memória e consulta a cada **12 segundos** apenas os documentos alterados desde a última sequência (`since`), economizando processamento e banda.
4. **Router Centralizado (`/api/m`):** Para respeitar os limites de funções serverless da Vercel, todos os módulos usam um roteador unificado que valida permissões no servidor antes de delegar a execução.
5. **Infraestrutura em São Paulo (`gru1`):** Servidores da Vercel configurados na região brasileira para latência mínima.

---

## 🔐 4. Autenticação e Perfis de Acesso

O sistema adota um modelo de **autenticação híbrida**:
* **E-mail Corporativo (@quinzecomunicacao.com.br):** Validado em tempo real via **IMAP (Locaweb)**. Nenhuma senha de e-mail é armazenada na base de dados.
* **Usuário Interno:** Para perfis sem e-mail institucional, a autenticação ocorre com senha individual protegida por hash **Bcrypt (12 rounds)** na tabela `app_users`.
* **Proteção Anti-Brute-Force:** Limite de 10 tentativas incorretas em 15 minutos bloqueia o IP e o usuário temporariamente.
* **Sessão Segura:** Cookie `qz_sess` assinado com **HMAC-SHA256** utilizando segredo armazenado na base de dados (`app_secrets`).

### Níveis de Permissão:
| Perfil | Acesso Padrão |
| :--- | :--- |
| **Mestre** | Acesso irrestrito a todos os dados, configurações, exclusões e módulos. |
| **Gestão** | Acesso completo operacional, financeiro, administrativo e relatórios. |
| **Atendimento** | Carteira, onboarding, clientes, tarefas, propostas e agenda. |
| **Coordenador** | Fila de aprovação de peças, métricas e políticas. |
| **Social Media** | Envio de peças, visualização de carteira e políticas. |
| **Diretor de Arte**| Envio e acompanhamento de peças. |
| **Personalizado** | Conjunto customizado de abas atribuído individualmente pela gestão. |

---

## ⚙️ 5. Variáveis de Ambiente

Crie um arquivo `.env.local` na raiz para execução local ou configure diretamente nas **Environment Variables** da Vercel:

| Variável | Obrigatória | Finalidade |
| :--- | :---: | :--- |
| `DATABASE_URL` | **Sim** | URL de conexão PostgreSQL do **Neon** com SSL (`sslmode=require`). |
| `DB_ENDPOINT_PREVIEW` | Não | Endpoint de branch do Neon para ambientes de Preview. |
| `CRON_SECRET` | Recomendada | Chave de proteção para as rotas de Cron da Vercel (`/api/cron/...`). |
| `BLOB_READ_WRITE_TOKEN` | Opcional | Token do **Vercel Blob** para upload e armazenamento de arquivos em nuvem. |
| `ANTHROPIC_API_KEY` | Opcional | Chave de API da **Anthropic** para geração e análise de POPs com Claude. |
| `WHATSAPP_API_URL` | Opcional | Endpoint da API de WhatsApp para envio de tarefas e relatórios. |
| `WHATSAPP_TOKEN` | Opcional | Token de autenticação da API de WhatsApp. |
| `WHATSAPP_DESTINO` | Opcional | Número(s) de destino dos relatórios automáticos. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Opcional | Credencial de conta de serviço Google para integração com Drive e Forms. |
| `DRIVE_PASTA_ASSINADOS_ID` | Opcional | ID da pasta do Google Drive onde termos assinados são salvos. |
| `GOOGLE_FORMS_DONO_EMAIL` | Opcional | E-mail do responsável pelos formulários NPS. |
| `IMAP_HOST` | Opcional | Host do servidor IMAP da Locaweb (padrão: `email-ssl.com.br`). |
| `IMAP_PORT` | Opcional | Porta do servidor IMAP (padrão: `993`). |

> Consulte o arquivo [`.env.example`](file:///.env.example) para um modelo pronto para preenchimento.

---

## 🚀 6. Como Rodar Localmente

### Pré-requisitos
* **Node.js** na versão `22.x` instalada.
* Acesso a uma instância do **Neon PostgreSQL** com as tabelas criadas.

### Passo a Passo

1. **Clone o repositório:**
   ```bash
   git clone https://github.com/Pedrojaug/quinze_central.git
   cd quinze_central
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   ```bash
   cp .env.example .env.local
   # Preencha a DATABASE_URL no .env.local
   ```

4. **Execute o build dos arquivos estáticos:**
   ```bash
   node build.js
   ```
   *O comando gera a pasta `public/` compilando `src/app.html`, estilos e scripts na ordem correta.*

5. **Inicie o servidor de desenvolvimento:**
   Para testar com as funções serverless locais:
   ```bash
   npx vercel dev
   ```
   Acesse no navegador: `http://localhost:3000`

---

## 🔄 7. Fluxo de Deploy Contínuo (CI/CD)

O deploy é **100% automatizado** via integração entre GitHub e Vercel:

1. Qualquer alteração enviada para a branch `main` dispara um build automático.
2. A Vercel executa `node build.js` e publica os arquivos estáticos da pasta `public/`.
3. As funções em `api/` são publicadas como serverless na região `gru1` (São Paulo).
4. As tarefas agendadas (*Crons*) disparam automaticamente de acordo com o cronograma:
   * **11:00:** Sincronização de formulários NPS (`/api/cron/forms`).
   * **09:00:** Lembrete de peças pendentes (`/api/cron/pecas`).
   * **20:00 até 02:00:** Relatório noturno de tarefas e pendências (`/api/cron/relatorio`).

---

## 👥 8. Equipe & Manutenção

* **Repositório:** [https://github.com/Pedrojaug/quinze_central](https://github.com/Pedrojaug/quinze_central)
* **Desenvolvido para:** Quinze Comunicação
* **Manutenção:** Equipe de Tecnologia & Operações da Quinze

---
*Documentação atualizada em Outubro de 2026.*
