// 01 Atendimento > Pendências de clientes (instrução 08): tudo o que a Quinze enviou ao cliente e ainda não teve retorno.
// Dados em m/atendimento/pendencias/<id> e m/atendimento/pendencias_config/geral, servidos só por aqui.
// Permissões (conferidas aqui): atendimento, mestre e gestão veem TODAS; cada pessoa edita as suas (criou ou é responsável);
// mestre e gestão editam todas e configuram os prazos. Os demais perfis recebem 403.
// A plataforma NÃO envia nada ao cliente: gera a mensagem para o atendimento copiar e colar.
// Ligações com a instrução 07: pendência atrasada vira tarefa do responsável (concluída sozinha quando há retorno)
// e o relatório das 20h ganha o bloco "Pendências de clientes sem retorno".
import { sql } from "./_lib.js";
import { perfilDe } from "./_modules.js";
import { listar, ler, gravar, apagar, novoId, clientesCarteira, txt, dataIso } from "./_mdados.js";
import { perguntarJSON, ErroIA, MSG_IA, iaDisponivel } from "./_ia.js";
import { lerLink } from "./_linkleitor.js";
import { hojeLocal, horaLocal, dataLocal, diasEntre, somarDiasUteis, br, brCurta } from "./_datas.js";
import { garantirTarefaOrigem, concluirTarefaOrigem, registrarBlocoRelatorio, registrarSincronizador } from "./_tarefas.js";

const M = "atendimento";
export const TIPOS = { material_ooh_offline: "Material OOH/offline", orcamento: "Orçamento", retorno_necessario: "Retorno necessário" };
export const STATUS = { rascunho: "Rascunho", aguardando_retorno: "Aguardando retorno", respondida: "Respondida", aprovada: "Aprovada", recusada: "Recusada", cancelada: "Cancelada" };
const RETORNOS = ["respondida", "aprovada", "recusada"];
const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const negado = (res, msg) => res.status(403).json({ code: "sem_acesso", msg: msg || "Sem permissão." });
const ehGestao = u => ["mestre", "gestao"].includes(perfilDe(u));
export const usaPendencias = u => ["mestre", "gestao", "atendimento"].includes(perfilDe(u));
const podeEditar = (u, p) => ehGestao(u) || p.criadoPor?.login === u.login || p.responsavel?.login === u.login;

// ---------- Prazos e situação ----------
const PRAZOS_PADRAO = { material_ooh_offline: 2, orcamento: 2, retorno_necessario: 2 };
export async function prazos() { return { ...PRAZOS_PADRAO, ...((await ler(M, "pendencias_config", "geral"))?.prazos || {}) }; }
export function situacao(p, hoje = hojeLocal()) {
  const enviado = p.enviadoEm ? dataLocal(p.enviadoEm) : "";
  const aguardando = p.status === "aguardando_retorno";
  const diasSemRetorno = aguardando && enviado ? Math.max(0, diasEntre(enviado, hoje)) : 0;
  const atrasada = aguardando && !!p.prazo && p.prazo < hoje;
  return { diasSemRetorno, atrasada, diasAtraso: atrasada ? diasEntre(p.prazo, hoje) : 0 };
}
const publica = (p, u, hoje) => ({ ...p, ...situacao(p, hoje), podeEditar: podeEditar(u, p) });

// ---------- Mensagens ----------
const saudacao = hora => (hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite");
const horaAgora = () => Number(horaLocal().slice(0, 2));
// Nome do cliente da Carteira (geralmente em maiúsculas) com iniciais maiúsculas.
export const nomeCliente = n => (n && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, x => x.toLowerCase()) : n || "");
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const prazoTexto = iso => `${DIAS_SEMANA[new Date(iso + "T12:00:00Z").getUTCDay()]} (${brCurta(iso)})`;
const PEDIDO = {
  material_ooh_offline: { abre: "Seguem os materiais para sua conferência", pede: "Pode conferir e nos dizer se está tudo certo para seguirmos com a produção?" },
  orcamento: { abre: "Segue o orçamento que preparamos", pede: "Pode nos confirmar se o orçamento está aprovado para seguirmos?" },
  retorno_necessario: { abre: "Segue para sua análise", pede: "Precisamos do seu retorno para darmos sequência." },
};
export function mensagemPadrao({ cliente, tipo, titulo, resumo, link, prazo, hora = horaAgora() }) {
  const p = PEDIDO[tipo] || PEDIDO.retorno_necessario;
  return `${saudacao(hora)}, ${cliente}! Tudo bem?\n\n${p.abre}: *${titulo}*.${resumo ? "\n" + resumo : ""}\n\n${link}\n\n${p.pede} Se possível, nos dê um retorno até ${prazoTexto(prazo)}.\n\nQualquer dúvida, estou à disposição!`;
}
export function mensagemCobranca({ cliente, titulo, link, enviadoEm, cobrancas = 0, hora = horaAgora() }) {
  const quando = brCurta(dataLocal(enviadoEm));
  return `${saudacao(hora)}, ${cliente}! Tudo bem?\n\n${cobrancas ? "Passando mais uma vez" : "Passando"} para lembrar do envio do dia ${quando}: *${titulo}*.\n${link}\n\nConseguiu dar uma olhada? Precisamos do seu retorno para seguirmos com o trabalho. Obrigado!`;
}

const SISTEMA_CLASSIFICAR = `Você classifica envios que uma agência de comunicação (Quinze) faz aos clientes e ainda aguardam resposta.
Tipos possíveis:
- material_ooh_offline: peças e materiais de mídia exterior ou offline (outdoor, busdoor, panfleto, banner, impressos, fachada, adesivos etc.).
- orcamento: orçamentos, propostas de valores, tabelas de preço.
- retorno_necessario: qualquer outro envio que dependa de resposta ou decisão do cliente (aprovações de posts, dúvidas, informações pendentes).
Regras: use SOMENTE o conteúdo recebido. Não invente nomes, valores, datas ou detalhes que não estejam lá. Se o conteúdo for pouco, faça um título e um resumo genéricos e fiéis ao que existe.
Responda só com JSON: {"tipo":"material_ooh_offline|orcamento|retorno_necessario","titulo":"até 60 caracteres","resumo":"uma linha, até 140 caracteres","confianca":"alta|media|baixa"}`;
const SISTEMA_MENSAGEM = `Você escreve mensagens de WhatsApp de um atendimento da agência Quinze para um cliente, no tom da Quinze: cordial, profissional e curto, em português do Brasil.
Use exatamente os dados recebidos. Não invente nada além deles. A mensagem DEVE: começar com a saudação e o nome do cliente exatamente como recebidos; dizer o que está sendo enviado (título e resumo); trazer o link exatamente como recebido, sozinho numa linha; dizer o que precisamos do cliente; pedir retorno até o prazo recebido. Pode usar *negrito* do WhatsApp no título. No máximo 600 caracteres. Sem assinatura com nome de pessoa.
Responda só com JSON: {"mensagem":"..."}`;

async function classificar({ blocos, link, nota, descricao, cliente }) {
  const contexto = [`Cliente: ${cliente}`, `Link: ${link}`, nota && `Nota do atendimento: ${nota}`, descricao && `Descrição do atendimento (o link não pôde ser lido): ${descricao}`].filter(Boolean).join("\n");
  const pedido = [{ type: "text", text: contexto + (blocos?.length ? "\n\nConteúdo lido do link:" : "\n\nO conteúdo do link NÃO foi lido. Classifique só pela descrição e pela nota acima.") }, ...(blocos || [])];
  const j = await perguntarJSON(SISTEMA_CLASSIFICAR, pedido, 600);
  const tipo = TIPOS[j.tipo] ? j.tipo : "retorno_necessario";
  return { tipo, titulo: txt(j.titulo, 80) || "Envio para o cliente", resumo: txt(j.resumo, 200), confianca: ["alta", "media", "baixa"].includes(j.confianca) ? j.confianca : "media" };
}
// Gera a mensagem com a IA; se a IA falhar ou não respeitar os dados (link, nome, saudação), usa o modelo fixo.
async function gerarMensagem(dados, variar) {
  const padrao = mensagemPadrao(dados);
  if (!iaDisponivel()) return { mensagem: padrao, fonte: "modelo" };
  const sauda = saudacao(dados.hora ?? horaAgora());
  const fatos = { saudacao: sauda, cliente: dados.cliente, tipo: TIPOS[dados.tipo], titulo: dados.titulo, resumo: dados.resumo, link: dados.link,
    pedido: (PEDIDO[dados.tipo] || PEDIDO.retorno_necessario).pede, prazo_de_retorno: prazoTexto(dados.prazo) };
  try {
    const j = await perguntarJSON(SISTEMA_MENSAGEM, `Dados:\n${JSON.stringify(fatos, null, 1)}${variar ? `\n\nEscreva uma versão diferente da anterior (variação ${variar}).` : ""}`, 700);
    const m = txt(j.mensagem, 1200);
    if (m && m.includes(dados.link) && m.startsWith(sauda) && m.includes(dados.cliente)) return { mensagem: m, fonte: "ia" };
  } catch (e) { console.error("[pendencias] mensagem:", e.code || "erro"); }
  return { mensagem: padrao, fonte: "modelo" };
}

// ---------- Pessoas ----------
async function pessoas() {
  const r = await sql`SELECT login, nome, funcao FROM usuarios WHERE ativo AND funcao IN ('atendimento', 'gestao', 'mestre') ORDER BY nome`;
  return r.map(x => ({ login: x.login, nome: x.nome || x.login, perfil: x.funcao }));
}

// ---------- Rotas ----------
async function inicio(u, req, res) {
  if (!usaPendencias(u)) return negado(res, "Pendências de clientes é do Atendimento, do Mestre e da gestão.");
  return res.json({ login: u.login, nome: u.nome, gestao: ehGestao(u), pessoas: await pessoas(), clientes: await clientesCarteira(),
    tipos: TIPOS, status: STATUS, prazos: await prazos(), hoje: hojeLocal(), ia: iaDisponivel() });
}

async function pendencias(u, req, res) {
  if (!usaPendencias(u)) return negado(res);
  await sincronizarTarefas();
  const hoje = hojeLocal();
  // Rascunhos só aparecem para quem os criou (não contam como pendência).
  const lista = (await listar(M, "pendencias")).filter(p => p.status !== "rascunho" || p.criadoPor?.login === u.login);
  return res.json({ hoje, pendencias: lista.map(p => publica(p, u, hoje)) });
}

// Passo 1: interpreta o link e cria o rascunho (com mensagem). Se não der para ler e não vier descrição, pede a descrição.
async function interpretar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const link = txt(b.link, 1500), nota = txt(b.nota, 300), descricao = txt(b.descricao, 300);
  let url; try { url = new URL(link); } catch { /* inválido */ }
  if (!url || !["https:", "http:"].includes(url.protocol)) return res.status(400).json({ code: "link", msg: "Cole um link completo (começando com https://)." });
  const cli = (await clientesCarteira()).find(c => c.id === b.clienteId);
  if (!cli) return res.status(400).json({ code: "cliente", msg: "Escolha o cliente da Carteira." });
  let resp = quem(u);
  if (b.responsavel && b.responsavel !== u.login) {
    if (!ehGestao(u)) return negado(res, "Só o Mestre e a gestão escolhem outro responsável.");
    const p = (await pessoas()).find(x => x.login === b.responsavel);
    if (!p) return res.status(400).json({ code: "responsavel", msg: "Responsável inválido." });
    resp = { login: p.login, nome: p.nome };
  }
  const leitura = await lerLink(link);
  if (leitura.motivo === "endereco_bloqueado") return res.status(400).json({ code: "link", msg: "Este endereço não pode ser lido pela plataforma." });
  if (!leitura.ok && !descricao) return res.json({ precisaDescricao: true, msg: "Não consegui ler esse link (pode ser privado ou exigir login). Descreva em uma linha o que foi enviado." });
  const cliente = nomeCliente(cli.nome);
  let c;
  try { c = await classificar({ blocos: leitura.ok ? leitura.blocos : null, link, nota, descricao, cliente }); }
  catch (e) {
    if (!(e instanceof ErroIA)) throw e;
    // Sem IA: o rascunho nasce com o tipo padrão e título da nota/descrição; o usuário ajusta.
    c = { tipo: "retorno_necessario", titulo: txt(descricao || nota || leitura.nome || "Envio para o cliente", 80), resumo: "", confianca: "baixa", erroIA: MSG_IA[e.code] || "IA indisponível" };
  }
  const pz = await prazos(), hoje = hojeLocal();
  const prazo = somarDiasUteis(hoje, pz[c.tipo] || 2);
  const m = await gerarMensagem({ cliente, tipo: c.tipo, titulo: c.titulo, resumo: c.resumo, link, prazo });
  const em = agora();
  const p = { link, clienteId: cli.id, clienteNome: cli.nome, responsavel: resp, nota, descricao, tipo: c.tipo, tipoSugerido: c.tipo,
    titulo: c.titulo, resumo: c.resumo, confianca: c.confianca, prazo, mensagem: m.mensagem, mensagemFonte: m.fonte,
    leitura: { ok: !!leitura.ok, fonte: leitura.ok ? leitura.fonte : "descricao", nome: leitura.nome || "", baseadoSoNaDescricao: !leitura.ok },
    status: "rascunho", cobrancas: [], historico: [{ em, por: quem(u), acao: "rascunho", nota: leitura.ok ? "Link lido e classificado" : "Classificado só pela descrição" }],
    criadoPor: quem(u), criadoEm: em, atualizadoEm: em, ...(c.erroIA ? { avisoIA: c.erroIA } : {}) };
  const id = novoId();
  await gravar(M, "pendencias", id, p);
  return res.json({ pendencia: publica({ ...p, id }, u) });
}

async function lerPermitida(u, id, res, { rascunho } = {}) {
  const p = await ler(M, "pendencias", String(id || ""));
  if (!p) { res.status(404).json({ code: "nao_encontrado", msg: "Pendência não encontrada." }); return null; }
  if (!podeEditar(u, p)) { negado(res, "Só quem criou, o responsável, o Mestre e a gestão editam esta pendência."); return null; }
  if (rascunho === true && p.status !== "rascunho") { res.status(409).json({ code: "status", msg: "Esta pendência já foi aprovada." }); return null; }
  if (rascunho === false && p.status === "rascunho") { res.status(409).json({ code: "status", msg: "Aprove a mensagem primeiro." }); return null; }
  return p;
}
function aplicarEdicao(p, b) {
  if (b.tipo && TIPOS[b.tipo]) p.tipo = b.tipo;
  if (b.titulo !== undefined) p.titulo = txt(b.titulo, 80) || p.titulo;
  if (b.resumo !== undefined) p.resumo = txt(b.resumo, 200);
  if (b.prazo !== undefined && dataIso(b.prazo)) p.prazo = dataIso(b.prazo);
  if (b.mensagem !== undefined) p.mensagem = txt(b.mensagem, 3000);
}
async function rascunhoSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res, { rascunho: true }); if (!p) return;
  aplicarEdicao(p, b); p.atualizadoEm = agora();
  await gravar(M, "pendencias", p.id, p);
  return res.json({ pendencia: publica(p, u) });
}
// Regerar a mensagem (com o tipo, título, resumo e prazo atuais). Trocar o tipo recalcula o prazo padrão.
async function mensagemRegerar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res, { rascunho: true }); if (!p) return;
  const tipoAntes = p.tipo;
  aplicarEdicao(p, { ...b, mensagem: undefined });
  if (b.tipo && b.tipo !== tipoAntes && !b.prazo) p.prazo = somarDiasUteis(hojeLocal(), (await prazos())[p.tipo] || 2);
  p.variacao = (p.variacao || 0) + 1;
  const m = await gerarMensagem({ cliente: nomeCliente(p.clienteNome), tipo: p.tipo, titulo: p.titulo, resumo: p.resumo, link: p.link, prazo: p.prazo }, p.variacao);
  Object.assign(p, { mensagem: m.mensagem, mensagemFonte: m.fonte, atualizadoEm: agora() });
  await gravar(M, "pendencias", p.id, p);
  return res.json({ pendencia: publica(p, u) });
}
// Aprovar (ao copiar a mensagem): a pendência passa a contar, com status aguardando_retorno.
async function aprovar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res, { rascunho: true }); if (!p) return;
  aplicarEdicao(p, b);
  if (!p.mensagem) return res.status(400).json({ code: "mensagem", msg: "A mensagem está vazia." });
  const em = agora();
  if (!p.prazo || p.prazo < hojeLocal()) p.prazo = somarDiasUteis(hojeLocal(), (await prazos())[p.tipo] || 2);
  Object.assign(p, { status: "aguardando_retorno", enviadoEm: em, aprovadoPor: quem(u), atualizadoEm: em });
  p.historico.push({ em, por: quem(u), acao: "aguardando_retorno", nota: "Mensagem aprovada e copiada" });
  await gravar(M, "pendencias", p.id, p);
  return res.json({ pendencia: publica(p, u) });
}
async function descartar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const p = await lerPermitida(u, corpo(req).id, res, { rascunho: true }); if (!p) return;
  await apagar(M, "pendencias", p.id);
  return res.json({ ok: true });
}
// Registrar retorno do cliente (respondida, aprovada ou recusada) ou cancelar.
async function retorno(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res, { rascunho: false }); if (!p) return;
  const st = String(b.status || "");
  if (![...RETORNOS, "cancelada", "aguardando_retorno"].includes(st)) return res.status(400).json({ code: "status", msg: "Status inválido." });
  if (st === p.status) return res.status(409).json({ code: "status", msg: "A pendência já está com esse status." });
  const nota = txt(b.nota, 1000), data = dataIso(b.data) || hojeLocal(), em = agora();
  p.historico.push({ em, por: quem(u), acao: st, de: p.status, data, nota });
  if (RETORNOS.includes(st)) p.retorno = { status: st, data, nota, em, por: quem(u) };
  if (st === "aguardando_retorno") delete p.retorno;   // reabrir
  Object.assign(p, { status: st, atualizadoEm: em });
  await gravar(M, "pendencias", p.id, p);
  if (st !== "aguardando_retorno") await concluirTarefaOrigem(origemDe(p.id), "pendência com retorno");
  return res.json({ pendencia: publica(p, u) });
}
// Cobrança: gera o follow-up para copiar e registra no histórico.
async function cobranca(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const p = await lerPermitida(u, corpo(req).id, res, { rascunho: false }); if (!p) return;
  if (p.status !== "aguardando_retorno") return res.status(409).json({ code: "status", msg: "Só pendências aguardando retorno recebem cobrança." });
  const mensagem = mensagemCobranca({ cliente: nomeCliente(p.clienteNome), titulo: p.titulo, link: p.link, enviadoEm: p.enviadoEm, cobrancas: (p.cobrancas || []).length });
  const em = agora();
  p.cobrancas = [...(p.cobrancas || []), { em, por: quem(u) }];
  p.historico.push({ em, por: quem(u), acao: "cobranca", nota: `Cobrança nº ${p.cobrancas.length}` });
  p.atualizadoEm = em;
  await gravar(M, "pendencias", p.id, p);
  return res.json({ mensagem, pendencia: publica(p, u) });
}
async function configSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehGestao(u)) return negado(res, "Os prazos são configurados pelo Mestre e pela gestão.");
  const b = corpo(req).prazos || {};
  const out = {};
  for (const k of Object.keys(TIPOS)) { const n = parseInt(b[k], 10); if (!(n >= 1 && n <= 30)) return res.status(400).json({ code: "prazo", msg: "Prazo entre 1 e 30 dias úteis." }); out[k] = n; }
  await gravar(M, "pendencias_config", "geral", { prazos: out, atualizadoPor: quem(u), atualizadoEm: agora() });
  return res.json({ ok: true, prazos: out });
}

// ---------- Ligação com tarefas e relatório (instrução 07) ----------
const origemDe = id => `pendencia:${id}`;
// Pendência atrasada -> tarefa do responsável; pendência com retorno -> tarefa concluída. Idempotente.
export async function sincronizarTarefas(hoje = hojeLocal()) {
  for (const p of await listar(M, "pendencias")) {
    if (p.status === "rascunho") continue;
    const s = situacao(p, hoje);
    if (p.status === "aguardando_retorno" && s.atrasada) {
      await garantirTarefaOrigem({ origem: origemDe(p.id), dono: p.responsavel, prazo: p.prazo, clienteId: p.clienteId, clienteNome: p.clienteNome,
        titulo: `Cobrar retorno: ${p.titulo}`, descricao: `${TIPOS[p.tipo]} enviado em ${br(dataLocal(p.enviadoEm))}. Link: ${p.link}` });
    } else if (p.status !== "aguardando_retorno") await concluirTarefaOrigem(origemDe(p.id), "pendência com retorno");
  }
}
// Bloco do relatório das 20h por atendimento.
export async function blocoRelatorio(pessoa, { hoje = hojeLocal() } = {}) {
  const minhas = (await listar(M, "pendencias")).filter(p => p.status === "aguardando_retorno" && p.responsavel?.login === pessoa.login)
    .map(p => ({ ...p, ...situacao(p, hoje) })).sort((a, b) => b.diasSemRetorno - a.diasSemRetorno);
  if (!minhas.length) return null;
  const atrasadas = minhas.filter(p => p.atrasada).length;
  return [`📌 Pendências de clientes sem retorno: ${minhas.length} aguardando${atrasadas ? `, ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""}`,
    ...minhas.slice(0, 3).map(p => `• ${nomeCliente(p.clienteNome)} — ${TIPOS[p.tipo]} — ${p.diasSemRetorno} dia${p.diasSemRetorno === 1 ? "" : "s"} sem retorno`)].join("\n");
}
registrarSincronizador(() => sincronizarTarefas());
registrarBlocoRelatorio("pendencias", blocoRelatorio);

export const rotas = {
  inicio, pendencias, interpretar, "rascunho.salvar": rascunhoSalvar, "mensagem.regerar": mensagemRegerar, aprovar, descartar,
  retorno, cobranca, "config.salvar": configSalvar,
};
