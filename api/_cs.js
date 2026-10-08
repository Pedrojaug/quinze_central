// 04 CS / Sucesso do Cliente (todos os perfis): NPS Pesquisa, NPS Média e Reclamações.
// Dados em m/cs/<colecao>/<id>, servidos só por aqui. A IA roda no servidor (api/_ia.js).
import { ehGestao } from "./_lib.js";
import { listar, ler, gravar, apagar, criarSeNovo, novoId, idValido, clientesCarteira, usuariosAtivos, txt, dataIso } from "./_mdados.js";
import { googleConfigurado, criarFormulario, lerRespostas, ErroGoogle } from "./_google.js";
import crypto from "node:crypto";
import { perguntarJSON, iaDisponivel, ErroIA, MSG_IA } from "./_ia.js";
import { hojeSP } from "./_adm.js";

const M = "cs";
export const STATUS = ["rascunho", "perguntas_em_aprovacao", "aprovada", "formulario_gerado", "enviada"];
const etapa = s => STATUS.indexOf(s);
const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const mesValido = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));
const podeEditar = (u, item) => ehGestao(u) || item?.criadoPor?.login === u.login;
const falhaIA = (res, e) => {
  if (e instanceof ErroIA) return res.status(e.status).json({ code: e.code, msg: MSG_IA[e.code] || MSG_IA.ia_indisponivel });
  throw e;
};

// ---------- Perguntas ----------
// Tipos: nps (0 a 10, obrigatória, uma só), aberta, multipla (com opções). No máximo 6 perguntas.
export const MAX_PERGUNTAS = 6;
export function limparPerguntas(lista) {
  const out = (Array.isArray(lista) ? lista : []).slice(0, 12).map(p => {
    const tipo = ["nps", "aberta", "multipla"].includes(p?.tipo) ? p.tipo : "aberta";
    const q = { tipo, texto: txt(p?.texto, 300) };
    if (tipo === "multipla") q.opcoes = (Array.isArray(p.opcoes) ? p.opcoes : []).map(o => txt(o, 120)).filter(Boolean).slice(0, 8);
    return q;
  }).filter(p => p.texto);
  return out;
}
export function conferirPerguntas(lista) {
  if (!lista.length) return "Inclua as perguntas.";
  if (lista.length > MAX_PERGUNTAS) return `No máximo ${MAX_PERGUNTAS} perguntas.`;
  const nps = lista.filter(p => p.tipo === "nps").length;
  if (nps !== 1) return "A pesquisa precisa de exatamente uma pergunta NPS (nota de 0 a 10).";
  if (lista.some(p => p.tipo === "multipla" && (p.opcoes || []).length < 2)) return "Perguntas de múltipla escolha precisam de pelo menos 2 opções.";
  return "";
}
const MODELO_PERGUNTAS = [
  { tipo: "nps", texto: "De 0 a 10, o quanto você recomendaria a Quinze para um amigo ou colega?" },
  { tipo: "aberta", texto: "O que mais contribuiu para a sua nota?" },
  { tipo: "multipla", texto: "Como você avalia a agilidade do nosso atendimento neste mês?", opcoes: ["Muito boa", "Boa", "Regular", "Ruim"] },
  { tipo: "aberta", texto: "O que podemos melhorar no próximo mês?" },
];

// ---------- Mensagem de WhatsApp ----------
export const saudacao = hora => (hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite");
const horaSP = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date())) % 24;
export function mensagemWhatsApp({ cliente, link, hora }) {
  return `${saudacao(hora)}, ${cliente}! Tudo bem?\n\n`
    + `Estamos sempre buscando melhorar o nosso trabalho com vocês e a sua opinião é muito importante para isso. `
    + `Pode nos ajudar respondendo a uma pesquisa rapidinha? Leva menos de 2 minutos:\n\n${link}\n\n`
    + `Muito obrigado pela parceria! 💛\nEquipe Quinze`;
}

// ---------- NPS ----------
// Promotores: 9 e 10. Neutros: 7 e 8. Detratores: 0 a 6. NPS = % promotores - % detratores.
export function calcularNps(notas) {
  const n = notas.length;
  if (!n) return { n: 0, media: null, nps: null, promotores: 0, neutros: 0, detratores: 0 };
  const promotores = notas.filter(x => x >= 9).length, detratores = notas.filter(x => x <= 6).length;
  return { n, media: Math.round(notas.reduce((a, b) => a + b, 0) / n * 10) / 10,
    nps: Math.round((promotores - detratores) / n * 1000) / 10, promotores, neutros: n - promotores - detratores, detratores };
}

// Ponto de entrada da integração com o Google Forms (instrução 06): cada resposta recebida chama esta função.
// resposta = { nota: 0..10, respostas: [{ pergunta, valor }], recebidaEm?, origem? }
export async function registrarResposta(pesquisaId, resposta, opt = {}) {
  const p = await ler(M, "pesquisas", pesquisaId);
  if (!p) throw new Error("pesquisa_nao_encontrada");
  const nota = Number(resposta?.nota);
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) throw new Error("nota_invalida");
  const r = {
    pesquisaId, clienteId: p.clienteId, clienteNome: p.clienteNome, mes: p.mes, nota,
    respostas: (Array.isArray(resposta.respostas) ? resposta.respostas : []).slice(0, 12)
      .map(x => ({ pergunta: txt(x?.pergunta, 300), valor: txt(x?.valor, 2000) })).filter(x => x.pergunta),
    recebidaEm: txt(resposta.recebidaEm, 40) || agora(), origem: txt(opt.origem || resposta.origem || "google_forms", 30),
    teste: !!opt.teste, registradaPor: opt.por || null,
  };
  // Com opt.id (ex.: "g_<responseId>" do Google Forms), grava só se ainda não existir: a mesma resposta nunca entra duas vezes.
  if (opt.id) return (await criarSeNovo(M, "respostas", opt.id, r)) ? { ...r, id: opt.id } : null;
  const id = novoId();
  await gravar(M, "respostas", id, r);
  return { ...r, id };
}

// ---------- Rotas: NPS Pesquisa ----------
async function inicio(u, req, res) {
  const pesquisas = (await listar(M, "pesquisas")).sort((a, b) => (b.mes || "").localeCompare(a.mes || "") || (b.criadoEm || "").localeCompare(a.criadoEm || ""));
  return res.json({ pesquisas, clientes: await clientesCarteira(), ia: iaDisponivel(), google: googleConfigurado(), gestao: ehGestao(u), status: STATUS, maxPerguntas: MAX_PERGUNTAS });
}
async function pesquisaSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const atual = b.id ? await ler(M, "pesquisas", b.id) : null;
  if (b.id && !atual) return res.status(404).json({ code: "nao_encontrado" });
  if (atual && etapa(atual.status) > etapa("perguntas_em_aprovacao")) return res.status(409).json({ code: "etapa", msg: "As perguntas já foram aprovadas: tom e objetivo não mudam mais." });
  const clientes = await clientesCarteira();
  const cli = clientes.find(c => c.id === b.clienteId);
  if (!cli) return res.status(400).json({ code: "cliente", msg: "Escolha o cliente da Carteira." });
  if (!mesValido(b.mes)) return res.status(400).json({ code: "mes", msg: "Escolha o mês de referência." });
  const tom = txt(b.tom, 1000), objetivo = txt(b.objetivo, 6000);
  if (!tom || !objetivo) return res.status(400).json({ code: "campos", msg: "Preencha o tom de voz e o objetivo." });
  const p = { ...(atual || { status: "rascunho", criadoEm: agora(), criadoPor: quem(u), perguntas: [], briefing: "" }),
    clienteId: cli.id, clienteNome: cli.nome, mes: b.mes, tom, objetivo, atualizadoEm: agora() };
  const id = b.id || novoId();
  await gravar(M, "pesquisas", id, p);
  return res.json({ ok: true, pesquisa: { ...p, id } });
}
async function pesquisaBriefing(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id, modelo } = corpo(req);
  const p = await ler(M, "pesquisas", id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (etapa(p.status) > etapa("perguntas_em_aprovacao")) return res.status(409).json({ code: "etapa", msg: "As perguntas já foram aprovadas." });
  let briefing, perguntas;
  if (modelo === true) {
    // Sem IA: briefing a partir do que foi preenchido e perguntas-modelo, para editar.
    briefing = `Objetivo: ${p.objetivo}\nPúblico: responsáveis pela conta do cliente ${p.clienteNome}.\nTom: ${p.tom}\nReferência: ${p.mes}.`;
    perguntas = MODELO_PERGUNTAS;
  } else {
    try {
      const j = await perguntarJSON(
        "Você ajuda a equipe de atendimento da Quinze, uma agência de comunicação e marketing digital, a montar pesquisas mensais de satisfação (NPS) com clientes. Escreva em português do Brasil. Responda só com JSON válido, sem texto fora do JSON.",
        `Monte a pesquisa do mês ${p.mes} para o cliente "${p.clienteNome}".\n\nTom de voz pedido:\n${p.tom}\n\nO que o levantamento do mês quer descobrir:\n${p.objetivo}\n\n`
        + `Devolva JSON no formato {"briefing": "texto curto com objetivo, público, o que se busca e tom (até 120 palavras)", "perguntas": [{"tipo": "nps"|"aberta"|"multipla", "texto": "...", "opcoes": ["..."] (só em multipla)}]}.\n`
        + `Regras: exatamente uma pergunta tipo "nps" (nota de 0 a 10 sobre recomendar a Quinze), primeiro; no total no máximo ${MAX_PERGUNTAS} perguntas; perguntas curtas, no tom pedido.`);
      briefing = txt(j.briefing, 3000);
      perguntas = j.perguntas;
    } catch (e) { return falhaIA(res, e); }
  }
  perguntas = limparPerguntas(perguntas);
  if (perguntas.filter(q => q.tipo === "nps").length === 0) perguntas.unshift(MODELO_PERGUNTAS[0]);
  perguntas = perguntas.slice(0, MAX_PERGUNTAS);
  Object.assign(p, { briefing, perguntas, origemPerguntas: modelo === true ? "modelo" : "ia", status: "perguntas_em_aprovacao", geradoEm: agora(), atualizadoEm: agora() });
  await gravar(M, "pesquisas", id, p);
  return res.json({ ok: true, pesquisa: { ...p, id } });
}
async function pesquisaPerguntas(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const p = await ler(M, "pesquisas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (p.status !== "perguntas_em_aprovacao") return res.status(409).json({ code: "etapa", msg: p.status === "rascunho" ? "Gere o briefing primeiro." : "As perguntas já foram aprovadas." });
  const perguntas = limparPerguntas(b.perguntas);
  if (perguntas.length > MAX_PERGUNTAS) return res.status(400).json({ code: "perguntas", msg: `No máximo ${MAX_PERGUNTAS} perguntas.` });
  Object.assign(p, { perguntas, briefing: b.briefing != null ? txt(b.briefing, 3000) : p.briefing, atualizadoEm: agora() });
  await gravar(M, "pesquisas", b.id, p);
  return res.json({ ok: true, pesquisa: { ...p, id: b.id }, aviso: conferirPerguntas(perguntas) });
}
async function pesquisaAprovar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const p = await ler(M, "pesquisas", id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (p.status !== "perguntas_em_aprovacao") return res.status(409).json({ code: "etapa", msg: "Só dá para aprovar perguntas geradas e ainda não aprovadas." });
  const erro = conferirPerguntas(p.perguntas || []);
  if (erro) return res.status(400).json({ code: "perguntas", msg: erro });
  Object.assign(p, { status: "aprovada", aprovadoEm: agora(), aprovadoPor: quem(u), atualizadoEm: agora() });
  await gravar(M, "pesquisas", id, p);
  return res.json({ ok: true, pesquisa: { ...p, id } });
}
// Temporário até a instrução 06 (Google Forms): a pessoa cria o formulário e cola o link.
async function pesquisaLink(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const p = await ler(M, "pesquisas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (etapa(p.status) < etapa("aprovada")) return res.status(409).json({ code: "etapa", msg: "Aprove as perguntas antes de seguir para o formulário." });
  let url;
  try { url = new URL(txt(b.link, 500)); } catch { return res.status(400).json({ code: "link", msg: "Cole um link válido (https://...)." }); }
  if (url.protocol !== "https:") return res.status(400).json({ code: "link", msg: "O link precisa começar com https://" });
  Object.assign(p, { formularioUrl: url.toString(), formularioOrigem: "manual", status: etapa(p.status) < etapa("formulario_gerado") ? "formulario_gerado" : p.status, atualizadoEm: agora() });
  await gravar(M, "pesquisas", b.id, p);
  return res.json({ ok: true, pesquisa: { ...p, id: b.id } });
}
async function pesquisaMensagem(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const p = await ler(M, "pesquisas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (etapa(p.status) < etapa("formulario_gerado") || !p.formularioUrl) return res.status(409).json({ code: "etapa", msg: "Gere ou cole o link do formulário primeiro." });
  const hora = Number.isInteger(b.hora) && b.hora >= 0 && b.hora <= 23 ? b.hora : horaSP();
  const cliente = txt(b.clienteNome, 120) || p.clienteNome;
  return res.json({ mensagem: mensagemWhatsApp({ cliente, link: p.formularioUrl, hora }) });
}
async function pesquisaEnviada(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const p = await ler(M, "pesquisas", id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (etapa(p.status) < etapa("formulario_gerado")) return res.status(409).json({ code: "etapa", msg: "Gere ou cole o link do formulário primeiro." });
  Object.assign(p, { status: "enviada", enviadaEm: agora(), enviadaPor: quem(u), atualizadoEm: agora() });
  await gravar(M, "pesquisas", id, p);
  return res.json({ ok: true, pesquisa: { ...p, id } });
}
async function pesquisaExcluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const p = await ler(M, "pesquisas", id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (!podeEditar(u, p)) return res.status(403).json({ code: "sem_acesso", msg: "Só quem criou, o Mestre e a gestão excluem." });
  await apagar(M, "pesquisas", id);
  return res.json({ ok: true });
}

// ---------- Google Forms (instrução 06) ----------
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const mesLongo = m => `${MESES_LONGOS[+m.slice(5) - 1]} de ${m.slice(0, 4)}`;
async function pesquisaFormulario(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const p = await ler(M, "pesquisas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (etapa(p.status) < etapa("aprovada")) return res.status(409).json({ code: "etapa", msg: "Aprove as perguntas antes de gerar o formulário." });
  if (p.formId && b.novo !== true) return res.status(409).json({ code: "ja_gerado", msg: "O formulário desta pesquisa já foi gerado." });
  if (!googleConfigurado()) return res.status(503).json({ code: "google", msg: "A integração com o Google ainda não está configurada." });
  try {
    const f = await criarFormulario({ titulo: `Pesquisa de satisfação – ${p.clienteNome} – ${mesLongo(p.mes)}`,
      descricao: `Olá! Queremos saber como foi o nosso trabalho com vocês em ${mesLongo(p.mes)}. São ${p.perguntas.length} perguntas rápidas, leva menos de 2 minutos. Obrigado pela parceria! — Equipe Quinze`,
      perguntas: p.perguntas });
    Object.assign(p, { formId: f.formId, formularioUrl: f.linkResposta, formularioEdicao: f.linkEdicao, formQuestoes: f.questoes, formularioOrigem: "google",
      formularioGeradoEm: agora(), formularioGeradoPor: quem(u), avisoForm: f.avisoDono || "",
      status: etapa(p.status) < etapa("formulario_gerado") ? "formulario_gerado" : p.status, atualizadoEm: agora() });
    await gravar(M, "pesquisas", b.id, p);
    return res.json({ ok: true, pesquisa: { ...p, id: b.id } });
  } catch (e) {
    if (e instanceof ErroGoogle) return res.status(502).json({ code: "google", msg: `O Google recusou: ${e.message}` });
    throw e;
  }
}
// Lê as respostas dos formulários gerados e registra as novas (sem duplicar, pelo responseId).
export async function sincronizarForms(soPesquisa) {
  const pesquisas = (await listar(M, "pesquisas")).filter(p => p.formId && (!soPesquisa || p.id === soPesquisa));
  const out = { formularios: pesquisas.length, novas: 0, erros: [] };
  for (const p of pesquisas) {
    try {
      const lista = await lerRespostas(p.formId);
      const qs = Object.fromEntries((p.formQuestoes || []).map(q => [q.questionId, q]));
      for (const r of lista) {
        const ans = r.answers || {};
        const valor = qid => (ans[qid]?.textAnswers?.answers || []).map(a => a.value).join("; ");
        const npsQ = (p.formQuestoes || []).find(q => q.tipo === "nps");
        const nota = Number(npsQ ? valor(npsQ.questionId) : NaN);
        if (!Number.isInteger(nota)) continue;
        const respostas = Object.keys(ans).filter(qid => qs[qid] && qs[qid].tipo !== "nps").map(qid => ({ pergunta: qs[qid].texto, valor: valor(qid) }));
        const id = "g_" + crypto.createHash("sha1").update(r.responseId).digest("hex").slice(0, 24);
        const novo = await registrarResposta(p.id, { nota, respostas, recebidaEm: r.lastSubmittedTime || r.createTime }, { id, origem: "google_forms" });
        if (novo) out.novas++;
      }
      await gravar(M, "pesquisas", p.id, { ...p, respostasSincronizadasEm: agora(), respostasNoForm: lista.length });
    } catch (e) {
      if (!(e instanceof ErroGoogle)) throw e;
      out.erros.push(`${p.clienteNome} (${p.mes}): ${e.message}`.slice(0, 200));
    }
  }
  return out;
}
async function formsSync(u, req, res) {
  if (!googleConfigurado()) return res.status(503).json({ code: "google", msg: "A integração com o Google ainda não está configurada." });
  return res.json({ ok: true, ...(await sincronizarForms(corpo(req).id || "")) });
}
// Rotina agendada (Vercel Cron). Protegida pelo CRON_SECRET, que a Vercel envia no cabeçalho Authorization.
async function formsCron(req, res) {
  const segredo = process.env.CRON_SECRET || "";
  const veio = String(req.headers.authorization || "");
  const ok = segredo && veio.length === `Bearer ${segredo}`.length && crypto.timingSafeEqual(Buffer.from(veio), Buffer.from(`Bearer ${segredo}`));
  if (!ok) return res.status(401).json({ code: "unauthorized" });
  if (!googleConfigurado()) return res.json({ ok: true, ignorado: "google_nao_configurado" });
  return res.json({ ok: true, ...(await sincronizarForms("")) });
}

// ---------- Rotas: NPS Média ----------
function filtrar(lista, q) {
  return lista.filter(r => (!q.de || r.mes >= q.de) && (!q.ate || r.mes <= q.ate) && (!q.cliente || r.clienteId === q.cliente) && (q.teste ? r.teste : !r.teste));
}
const chaveRelatorio = q => ["r", q.de || "inicio", q.ate || "fim", q.cliente || "todos", q.teste ? "teste" : "real"].join("_").replace(/[^A-Za-z0-9_\-.]/g, "");
const lerFiltro = (src, u) => ({ de: mesValido(src.de) ? src.de : "", ate: mesValido(src.ate) ? src.ate : "",
  cliente: idValido(String(src.cliente || "")) ? String(src.cliente) : "", teste: false });
async function respostas(u, req, res) {
  const q = lerFiltro(req.query, u);
  const lista = await listar(M, "respostas");
  const todas = filtrar(lista, q);
  const agrupar = k => Object.entries(todas.reduce((acc, r) => ((acc[r[k]] ||= []).push(r), acc), {}))
    .map(([chave, rs]) => ({ chave, nome: rs[0].clienteNome, ...calcularNps(rs.map(r => r.nota)) }));
  const rel = await ler(M, "relatorios", chaveRelatorio(q));
  return res.json({ filtro: q, total: calcularNps(todas.map(r => r.nota)),
    porMes: agrupar("mes").sort((a, b) => a.chave.localeCompare(b.chave)),
    porCliente: agrupar("clienteId").sort((a, b) => (b.nps ?? -999) - (a.nps ?? -999)),
    abertas: todas.flatMap(r => r.respostas.filter(x => x.valor && !/^\d+$/.test(x.valor)).map(x => ({ cliente: r.clienteNome, mes: r.mes, pergunta: x.pergunta, valor: x.valor }))).slice(-200),
    relatorio: rel, clientes: await clientesCarteira(), gestao: ehGestao(u), ia: iaDisponivel(), google: googleConfigurado() });
}
async function relatorioGerar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const q = lerFiltro(corpo(req), u);
  const todas = filtrar(await listar(M, "respostas"), q);
  const abertas = todas.flatMap(r => r.respostas.filter(x => x.valor && !/^\d+$/.test(x.valor)).map(x => `- [${r.clienteNome}, ${r.mes}, nota ${r.nota}] ${x.pergunta}: ${x.valor}`));
  if (!abertas.length) return res.status(400).json({ code: "sem_respostas", msg: "Não há respostas abertas neste período." });
  let j;
  try {
    j = await perguntarJSON(
      "Você analisa pesquisas de satisfação de clientes de uma agência de comunicação (Quinze). Escreva em português do Brasil, de forma objetiva. Responda só com JSON válido.",
      `Respostas abertas do período (${q.de || "início"} a ${q.ate || "hoje"}${q.cliente ? ", um cliente" : ", todos os clientes"}):\n${abertas.slice(-150).join("\n").slice(0, 30000)}\n\n`
      + `Liste de 3 a 5 pontos de melhoria concretos, baseados só nessas respostas. JSON: {"pontos": [{"titulo": "curto", "detalhe": "1 a 2 frases, citando a evidência"}]}`, 1500);
  } catch (e) { return falhaIA(res, e); }
  const pontos = (Array.isArray(j.pontos) ? j.pontos : []).map(p => ({ titulo: txt(p?.titulo, 120), detalhe: txt(p?.detalhe, 600) })).filter(p => p.titulo).slice(0, 5);
  if (pontos.length < 1) return res.status(502).json({ code: "ia_formato", msg: MSG_IA.ia_formato });
  const rel = { pontos, geradoEm: agora(), geradoPor: quem(u), respostasAnalisadas: abertas.length, filtro: q };
  await gravar(M, "relatorios", chaveRelatorio(q), rel);
  return res.json({ ok: true, relatorio: rel });
}

// ---------- Rotas: Reclamações ----------
const CANAIS = ["WhatsApp", "E-mail", "Telefone", "Reunião", "Outro"];
const GRAVIDADES = ["baixa", "media", "alta"];
const STATUS_RECL = ["aberta", "em_andamento", "resolvida"];
async function reclamacoes(u, req, res) {
  const lista = (await listar(M, "reclamacoes")).sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .map(r => ({ ...r, podeEditar: podeEditar(u, r) }));
  const usuarios = (await usuariosAtivos()).map(x => ({ login: x.login, nome: x.nome }));
  return res.json({ reclamacoes: lista, clientes: await clientesCarteira(), usuarios, canais: CANAIS, gravidades: GRAVIDADES, status: STATUS_RECL, hoje: hojeSP() });
}
async function reclamacaoSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const atual = b.id ? await ler(M, "reclamacoes", b.id) : null;
  if (b.id && !atual) return res.status(404).json({ code: "nao_encontrado" });
  if (atual && !podeEditar(u, atual)) return res.status(403).json({ code: "sem_acesso", msg: "Só quem registrou, o Mestre e a gestão editam." });
  const cli = (await clientesCarteira()).find(c => c.id === b.clienteId) || (atual && atual.clienteId === b.clienteId ? { id: atual.clienteId, nome: atual.clienteNome } : null);
  if (!cli) return res.status(400).json({ code: "cliente", msg: "Escolha o cliente da Carteira." });
  const usuarios = await usuariosAtivos();
  const resp = usuarios.find(x => x.login === b.responsavel);
  const r = { ...(atual || { criadoEm: agora(), criadoPor: quem(u) }),
    clienteId: cli.id, clienteNome: cli.nome, data: dataIso(b.data), canal: CANAIS.includes(b.canal) ? b.canal : "",
    gravidade: GRAVIDADES.includes(b.gravidade) ? b.gravidade : "", descricao: txt(b.descricao, 5000),
    responsavel: resp ? { login: resp.login, nome: resp.nome } : null, status: STATUS_RECL.includes(b.status) ? b.status : "aberta",
    resolucao: txt(b.resolucao, 5000), atualizadoEm: agora(), atualizadoPor: quem(u) };
  if (!r.data || !r.canal || !r.gravidade || !r.descricao) return res.status(400).json({ code: "campos", msg: "Preencha data, canal, gravidade e descrição." });
  if (r.status === "resolvida") {
    if (!r.resolucao) return res.status(400).json({ code: "resolucao", msg: "Descreva a resolução para marcar como resolvida." });
    r.dataResolucao = dataIso(b.dataResolucao) || atual?.dataResolucao || hojeSP();
  } else r.dataResolucao = "";
  const id = b.id || novoId();
  await gravar(M, "reclamacoes", id, r);
  return res.json({ ok: true, reclamacao: { ...r, id, podeEditar: true } });
}
async function reclamacaoExcluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const r = await ler(M, "reclamacoes", id);
  if (!r) return res.status(404).json({ code: "nao_encontrado" });
  if (!podeEditar(u, r)) return res.status(403).json({ code: "sem_acesso", msg: "Só quem registrou, o Mestre e a gestão excluem." });
  await apagar(M, "reclamacoes", id);
  return res.json({ ok: true });
}

export const rotas = {
  inicio, "pesquisa.salvar": pesquisaSalvar, "pesquisa.briefing": pesquisaBriefing, "pesquisa.perguntas": pesquisaPerguntas,
  "pesquisa.aprovar": pesquisaAprovar, "pesquisa.link": pesquisaLink, "pesquisa.mensagem": pesquisaMensagem,
  "pesquisa.enviada": pesquisaEnviada, "pesquisa.excluir": pesquisaExcluir,
  respostas, "relatorio.gerar": relatorioGerar,
  reclamacoes, "reclamacao.salvar": reclamacaoSalvar, "reclamacao.excluir": reclamacaoExcluir,
  "pesquisa.formulario": pesquisaFormulario, "forms.sync": formsSync,
};
export const publicas = { "forms.cron": formsCron };
