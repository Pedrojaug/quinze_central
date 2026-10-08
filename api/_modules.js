// ============================================================================
// REGISTRO CENTRAL: MÓDULOS, SUBMÓDULOS (ABAS), PERFIS E DADOS
// ----------------------------------------------------------------------------
// Tudo o que define o acesso à plataforma mora aqui. O servidor usa este
// registro para liberar dados (api/_lib.js, /api/sync, /api/doc) e a página usa
// para montar a tela de módulos, o menu e a aba Usuários.
//
// AREAS (módulos de topo, os cartões da tela de módulos)
//   id, nome, ordem, descricao
//   funcoes   perfis que entram no módulo
//   emBreve   true = aparece como cartão "em breve", sem funcionalidade
//   restrito  true = só entra por perfil (não pode ser marcado no Personalizado)
//   entrada   aba aberta ao entrar (padrão: a primeira liberada)
//
// MODULOS (submódulos = abas dentro de um módulo de topo)
//   id        identificador curto e único (vira #id na URL)
//   modulo    id do módulo de topo ao qual a aba pertence
//   nome, ordem
//   funcoes   perfis que recebem a aba (padrão: mestre, gestao, atendimento)
//   colecoes  caminhos de dados que a aba lê e grava ("x/" = tudo dentro de x)
//   leitura   caminhos que a aba só lê
//   arquivo   (abas novas) script, ex.: "/modulos/avisos.js". Ganha o espaço
//             de dados "m/<id>/".
//   card      (opcional) resumo mostrado no cartão do módulo
//   livre     true = a aba pode ser marcada no Personalizado mesmo num módulo "restrito"; marcada,
//             ela conta como acesso ao módulo (ex.: Dados consolidados dentro de 02 Aprovação de peças)
//   grupo     (opcional) agrupa abas lado a lado na navegação (ex.: "Equipe" no Administrativo)
//
// COLECOES_RESTRITAS
//   Caminhos sensíveis (salário, contratos, financeiro). Valem acima de
//   qualquer aba: só os perfis listados leem ou gravam, conferido no servidor.
//
// SO_API
//   Caminhos que nunca passam pela sincronização (/api/sync) nem pela gravação
//   genérica (/api/doc): só a rota própria do módulo lê e grava (e registra auditoria).
// ============================================================================

export const PERFIS = {
  mestre: "Mestre",
  gestao: "Gestão",
  atendimento: "Atendimento",
  coordenador: "Coordenador",
  social: "Social media",
  diretor_arte: "Diretor de arte",
  personalizado: "Personalizado",
};
const TODOS = ["mestre", "gestao", "atendimento", "coordenador", "social", "diretor_arte"];
const GESTAO = ["mestre", "gestao"];

export const AREAS = [
  { id: "atendimento", nome: "01 Atendimento", ordem: 10, funcoes: ["mestre", "gestao", "atendimento", "social"],
    descricao: "Carteira de clientes, onboarding, propostas e agenda" },
  { id: "pecas", nome: "02 Aprovação de peças", ordem: 20, funcoes: TODOS, restrito: true,
    descricao: "Envio de peças, fila de aprovação, números do mês e dados consolidados" },
  { id: "administrativo", nome: "03 Administrativo", ordem: 30, funcoes: GESTAO, restrito: true,
    descricao: "Contratos, assinaturas, pessoal, férias e usuários" },
  { id: "cs", nome: "04 CS / Sucesso do Cliente", ordem: 40, funcoes: TODOS,
    descricao: "Pesquisas NPS, médias e reclamações dos clientes" },
  { id: "politicas", nome: "05 Políticas da empresa", ordem: 50, funcoes: TODOS,
    descricao: "Código de ética e documentos da Quinze" },
  { id: "financeiro", nome: "06 Financeiro", ordem: 60, funcoes: GESTAO, restrito: true,
    descricao: "Contas a receber e a pagar, fluxo de caixa e resultados" },
];

export const MODULOS = [
  { id: "dash", modulo: "atendimento", nome: "Dashboard", ordem: 10,
    colecoes: ["meses/"], leitura: ["producao/"],
    card: { titulo: "Carteira de clientes", texto: "Dashboard, clientes e equipe" } },
  { id: "cli", modulo: "atendimento", nome: "Clientes", ordem: 20, funcoes: ["mestre", "gestao", "atendimento", "social"],
    colecoes: ["meses/", "config/geral"] },
  { id: "onb", modulo: "atendimento", nome: "Onboarding", ordem: 30,
    colecoes: ["onboarding/", "meses/", "config/geral"] },
  { id: "prop", modulo: "atendimento", nome: "Propostas", ordem: 40,
    colecoes: ["propostas/"] },
  { id: "agenda", modulo: "atendimento", nome: "Agenda", ordem: 50,
    colecoes: ["agenda/", "config/agenda"] },
  { id: "and", modulo: "atendimento", nome: "Andamento de produção", ordem: 60,
    colecoes: ["config/geral"] },

  // Instruções 07 e 08: dados em m/atendimento/..., só pela /api/m (o módulo também abre para o social media,
  // que não vê tarefas nem pendências; a rota confere o perfil).
  { id: "tarefas", modulo: "atendimento", nome: "Minhas tarefas", ordem: 15, funcoes: ["mestre", "gestao", "atendimento"], arquivo: "/modulos/tarefas.js", colecoes: [],
    card: { titulo: "Minhas tarefas", texto: "To-do do dia e relatório das 20h" } },
  { id: "pendencias", modulo: "atendimento", nome: "Pendências de clientes", ordem: 16, funcoes: ["mestre", "gestao", "atendimento"], arquivo: "/modulos/pendencias.js", colecoes: [],
    card: { titulo: "Pendências de clientes", texto: "Envios aguardando retorno do cliente" } },
  { id: "relatorio20h", modulo: "atendimento", nome: "Relatório das 20h", ordem: 95, funcoes: GESTAO, arquivo: "/modulos/tarefas.js", colecoes: [] },
  // 02 Aprovação de peças: dados em m/pecas/..., só pela /api/m. O "Envio" também vai para quem tem a
  // permissão extra pode_enviar_pecas (qualquer perfil); ver ajustarPecas() abaixo.
  { id: "envio", modulo: "pecas", nome: "Envio", ordem: 10, funcoes: ["diretor_arte", "social"], arquivo: "/modulos/pecas.js", colecoes: [] },
  { id: "fila", modulo: "pecas", nome: "Fila de aprovação", ordem: 20, funcoes: ["coordenador", "mestre", "gestao"], arquivo: "/modulos/pecas.js", colecoes: [] },
  { id: "pecasdash", modulo: "pecas", nome: "Dashboard mensal", ordem: 30, funcoes: ["mestre", "gestao", "atendimento"], arquivo: "/modulos/pecas.js", colecoes: [] },
  // Instrução 10: "Dados consolidados" saiu do Atendimento (mesmo id, mesmos dados em producao/).
  { id: "prod", modulo: "pecas", nome: "Dados consolidados", ordem: 40, funcoes: ["mestre", "gestao", "atendimento"], livre: true,
    colecoes: ["producao/"] },

  // 03 Administrativo: dados sensíveis em m/administrativo/..., só pela /api/m (com auditoria).
  { id: "contratos", modulo: "administrativo", nome: "Contratos", ordem: 10, funcoes: GESTAO, arquivo: "/modulos/administrativo.js", colecoes: [] },
  { id: "assinaturas", modulo: "administrativo", nome: "Assinatura de documentos", ordem: 20, funcoes: GESTAO, arquivo: "/modulos/administrativo.js", colecoes: [] },
  { id: "pessoal", modulo: "administrativo", nome: "Pessoal", ordem: 30, funcoes: GESTAO, arquivo: "/modulos/administrativo.js", colecoes: [] },
  { id: "ferias", modulo: "administrativo", nome: "Férias", ordem: 40, funcoes: GESTAO, arquivo: "/modulos/administrativo.js", colecoes: [] },
  // Instrução 10: "Equipe e ajustes" saiu do Atendimento (mesmo id e dados) e fica ao lado de Usuários, no grupo "Equipe".
  { id: "team", modulo: "administrativo", nome: "Equipe e ajustes", ordem: 49, funcoes: GESTAO, grupo: "Equipe",
    colecoes: ["meses/", "config/geral"] },
  { id: "users", modulo: "administrativo", nome: "Usuários", ordem: 50, funcoes: GESTAO, grupo: "Equipe",
    colecoes: [] },
  // Instrução 09: POPs em m/administrativo/pops e pop_versoes, só pela /api/m?r=pop/... (edição só do Mestre).
  { id: "pop", modulo: "administrativo", nome: "POP operacional", ordem: 60, funcoes: GESTAO, arquivo: "/modulos/pop.js", colecoes: [] },

  // 04 CS: dados em m/cs/..., só pela /api/m (a edição de reclamações depende de quem registrou).
  { id: "nps", modulo: "cs", nome: "NPS Pesquisa", ordem: 10, funcoes: TODOS, arquivo: "/modulos/cs.js", colecoes: [] },
  { id: "npsmedia", modulo: "cs", nome: "NPS Média", ordem: 20, funcoes: TODOS, arquivo: "/modulos/cs.js", colecoes: [] },
  { id: "reclamacoes", modulo: "cs", nome: "Reclamações", ordem: 30, funcoes: TODOS, arquivo: "/modulos/cs.js", colecoes: [] },
  // 05 Políticas: dados em m/politicas/..., só pela /api/m (a lista de leituras é só da gestão).
  { id: "etica", modulo: "politicas", nome: "Código de ética", ordem: 10, funcoes: TODOS, arquivo: "/modulos/politicas.js", colecoes: [] },

  // 06 Financeiro: dados em m/financeiro/..., só pela /api/m (com log de criação, alteração e exclusão).
  { id: "receber", modulo: "financeiro", nome: "Contas a receber", ordem: 10, funcoes: GESTAO, arquivo: "/modulos/financeiro.js", colecoes: [] },
  { id: "pagar", modulo: "financeiro", nome: "Contas a pagar", ordem: 20, funcoes: GESTAO, arquivo: "/modulos/financeiro.js", colecoes: [] },
  { id: "fluxo", modulo: "financeiro", nome: "Fluxo de caixa", ordem: 30, funcoes: GESTAO, arquivo: "/modulos/financeiro.js", colecoes: [] },
  { id: "findash", modulo: "financeiro", nome: "Dashboard financeiro", ordem: 40, funcoes: GESTAO, arquivo: "/modulos/financeiro.js", colecoes: [] },

  // Novas abas entram aqui. Exemplo:
  // { id: "avisos", modulo: "politicas", nome: "Mural de avisos", ordem: 10, arquivo: "/modulos/avisos.js", funcoes: TODOS },
];

export const COLECOES_RESTRITAS = [
  { caminho: "financeiro/", ler: GESTAO, gravar: GESTAO },
  { caminho: "administrativo/", ler: GESTAO, gravar: GESTAO },
  { caminho: "rh/", ler: GESTAO, gravar: GESTAO },
];

export const SO_API = ["m/atendimento/", "m/pecas/", "m/administrativo/", "m/cs/", "m/politicas/", "m/financeiro/"];
export const soApi = path => SO_API.some(p => path === p.replace(/\/$/, "") || path.startsWith(p));

// ---------------------------------------------------------------------------
export const ALL_TABS = MODULOS.map(m => m.id);
const funcoesDe = m => m.funcoes || ["mestre", "gestao", "atendimento"];
const area = id => AREAS.find(a => a.id === id);
const casa = (path, p) => path === p.replace(/\/$/, "") || (p.endsWith("/") && path.startsWith(p));

// Perfil efetivo (o cadastro antigo "master" vale como mestre).
export const perfilDe = u => (!u ? null : u.papel === "master" ? "mestre" : u.funcao);
export const ehGestao = u => ["mestre", "gestao"].includes(perfilDe(u));
// Envio de peças: diretor de arte, social media ou qualquer usuário com a permissão extra (linha do banco ou sessão).
export const podeEnviarPecas = u => !!u && (["diretor_arte", "social"].includes(perfilDe(u)) || !!(u.pode_enviar_pecas ?? u.podeEnviarPecas));
const ajustarPecas = (u, abas) => { const sem = abas.filter(id => id !== "envio"); return podeEnviarPecas(u) ? [...sem, "envio"] : sem; };

// Abas e módulos que cada perfil fixo recebe (o Personalizado escolhe na mão).
export const FUNCOES = Object.fromEntries(Object.keys(PERFIS).filter(p => p !== "personalizado").map(p => [p, [
  ...MODULOS.filter(m => funcoesDe(m).includes(p) && area(m.modulo)?.funcoes.includes(p)).map(m => m.id),
  ...AREAS.filter(a => a.funcoes.includes(p) && !MODULOS.some(m => m.modulo === a.id)).map(a => a.id),
]]));
export const FUNCOES_NOMES = PERFIS;

// Itens que o Personalizado pode marcar: abas de módulos não restritos (ou marcadas "livre") e módulos sem abas ("em breve").
export const ESCOLHAS = [
  ...MODULOS.filter(m => !area(m.modulo)?.restrito || m.livre).map(m => m.id),
  ...AREAS.filter(a => !a.restrito && !MODULOS.some(m => m.modulo === a.id)).map(a => a.id),
];

// Abas efetivas de um usuário (linha da tabela usuarios).
export function abasDe(u) {
  if (!u) return [];
  const p = perfilDe(u);
  if (p === "mestre") return ajustarPecas(u, ALL_TABS);
  if (FUNCOES[p]) return ajustarPecas(u, FUNCOES[p].filter(id => ALL_TABS.includes(id)));
  return ajustarPecas(u, (u.abas || []).filter(id => ALL_TABS.includes(id) && ESCOLHAS.includes(id)));
}

// Módulos de topo liberados para o usuário.
export function areasDe(u) {
  if (!u) return [];
  const p = perfilDe(u);
  if (p === "mestre") return AREAS.map(a => a.id);
  const comPecas = ids => (podeEnviarPecas(u) && !ids.includes("pecas") ? AREAS.filter(a => a.id === "pecas" || ids.includes(a.id)).map(a => a.id) : ids);
  if (FUNCOES[p]) return comPecas(AREAS.filter(a => a.funcoes.includes(p)).map(a => a.id));
  const marcadas = (u.abas || []).filter(id => ESCOLHAS.includes(id));
  // Uma aba "livre" marcada abre o módulo dela, mesmo restrito.
  return comPecas(AREAS.filter(a => (!a.restrito && marcadas.includes(a.id)) || MODULOS.some(m => m.modulo === a.id && marcadas.includes(m.id) && (!a.restrito || m.livre))).map(a => a.id));
}

const escrita = m => [...(m.colecoes || []), `m/${m.id}/`];
const leitura = m => [...escrita(m), ...(m.leitura || [])];

// O usuário pode ler (write=false) ou gravar (write=true) este caminho?
// "u" é o usuário da sessão (já com u.abas e u.areas calculados em _lib.js).
export function podeCaminho(u, path, write) {
  if (!u) return false;
  const p = perfilDe(u);
  // 1. Coleções sensíveis: só os perfis listados, acima de qualquer aba.
  const r = COLECOES_RESTRITAS.find(c => casa(path, c.caminho));
  if (r) return p === "mestre" || (write ? r.gravar : r.ler).includes(p);
  // 2. Espaço de dados de um módulo de topo: m/<modulo>/... segue as funções do módulo.
  const mm = /^m\/([^/]+)(\/|$)/.exec(path);
  if (mm && area(mm[1])) return (u.areas || areasDe(u)).includes(mm[1]);
  // 3. Mestre lê e grava todo o resto.
  if (p === "mestre") return true;
  // 4. Caminhos declarados pelas abas liberadas.
  const abas = u.abas || abasDe(u);
  const mods = MODULOS.filter(m => abas.includes(m.id));
  return mods.some(m => (write ? escrita(m) : leitura(m)).some(c => casa(path, c)));
}

// O que a página recebe sobre as abas (sem detalhes de permissão).
export const publico = ids => MODULOS
  .filter(m => ids.includes(m.id))
  .sort((a, b) => a.ordem - b.ordem)
  .map(({ id, modulo, nome, ordem, arquivo, card, grupo }) => ({ id, modulo, nome, ordem, arquivo: arquivo || null, card: card || null, grupo: grupo || null }));

// Os cartões da tela de módulos.
export const areasPublicas = (areaIds, abas) => AREAS
  .filter(a => areaIds.includes(a.id))
  .sort((a, b) => a.ordem - b.ordem)
  .map(a => {
    const tabs = MODULOS.filter(m => m.modulo === a.id && abas.includes(m.id)).sort((x, y) => x.ordem - y.ordem).map(m => m.id);
    const emBreve = !!a.emBreve || !tabs.length;
    return { id: a.id, nome: a.nome, descricao: a.descricao, emBreve, abas: tabs,
      entrada: emBreve ? null : `/app?m=${a.id}#${a.entrada && tabs.includes(a.entrada) ? a.entrada : tabs[0]}` };
  });
