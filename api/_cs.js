// 04 CS / Sucesso do Cliente (todos os perfis): NPS Pesquisa, NPS Média e Reclamações.
// Dados em m/cs/<colecao>/<id>, servidos só por aqui. A IA roda no servidor (api/_ia.js).
import { ehGestao } from "./_lib.js";
import { listar, ler, gravar, apagar, criarSeNovo, novoId, idValido, clientesCarteira, usuariosAtivos, txt, dataIso } from "./_mdados.js";
import { googleConfigurado, criarFormulario, lerRespostas, lerArquivoDrive, ErroGoogle } from "./_google.js";
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
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

// ---------- Formulário Oficial NPS Quinze (pré-configurado e modelo para futuras pesquisas) ----------
const FORM_OFICIAL_URL = "https://docs.google.com/forms/d/e/1FAIpQLSfffcy03jOmkjcdaTupY503OfnDXi-qE-MQDkY9Tslzyf7qIA/viewform";
const FORM_OFICIAL_ID_DOC = "form_nps_quinze_oficial";
const QUESTOES_OFICIAIS = [
  { questionId: "44175803", tipo: "aberta", texto: "Qual o nome da sua empresa?" },
  { questionId: "146075408", tipo: "multipla", texto: "Quem é o profissional da Quinze que atende sua conta?", opcoes: ["ANDRÉ", "LAÍS", "MARCOS", "RILLI", "EDUARDO"] },
  { questionId: "43789252", tipo: "escala", escalaMax: 5, texto: "Como você avalia o atendimento do profissional responsável pela sua conta?", opcoes: ["1", "2", "3", "4", "5"] },
  { questionId: "1814874153", tipo: "escala", escalaMax: 5, texto: "O grupo de WhatsApp da sua conta é claro, organizado e útil no dia a dia?", opcoes: ["1", "2", "3", "4", "5"] },
  { questionId: "264430526", tipo: "escala", escalaMax: 5, texto: "Como você avalia a qualidade dos conteúdos desenvolvidos pela Quinze (ideias, textos e legendas)?", opcoes: ["1", "2", "3", "4", "5"] },
  { questionId: "1568671969", tipo: "escala", escalaMax: 5, texto: "As artes e vídeos produzidos refletem bem a identidade e o padrão visual da sua marca?", opcoes: ["1", "2", "3", "4", "5"] },
  { questionId: "1740485521", tipo: "multipla", texto: "O planejamento de conteúdo está alinhado às necessidades atuais da sua empresa?", opcoes: ["Sim, totalmente", "Parcialmente", "Não muito", "Não tenho acompanhado os planejamentos"] },
  { questionId: "141836756", tipo: "multipla", texto: "Você costuma receber os relatórios de performance:", opcoes: ["Por e-mail", "Nas reuniões", "Em ambos", "Por Whatsapp", "Não costumo receber"] },
  { questionId: "190103263", tipo: "multipla", texto: "Você costuma analisar esses relatórios?", opcoes: ["Sempre", "Às vezes", "Raramente", "Nunca"] },
  { questionId: "1627992717", tipo: "escala", escalaMax: 10, texto: "Em uma escala de 0 a 10, qual nota você dá para os serviços da Quinze hoje?", opcoes: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] },
  { questionId: "2058057943", tipo: "nps", escalaMax: 10, texto: "Qual a probabilidade de você indicar a Quinze para alguém?", opcoes: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] },
  { questionId: "1645281809", tipo: "multipla", texto: "Você sente a Quinze como um parceiro estratégico do seu negócio (e não apenas como um fornecedor)?", opcoes: ["Sim", "Em parte", "Ainda não"] },
  { questionId: "1291161530", tipo: "aberta", texto: "Tem algo a contribuir, elogiar ou sugerir como melhoria para a Quinze?" },
];

async function garantirPesquisaOficial() {
  const todas = await listar(M, "pesquisas");
  if (todas.some(p => p.id === FORM_OFICIAL_ID_DOC || String(p.formularioUrl || "").includes("1FAIpQLSfffcy03jOmkjcdaTupY503OfnDXi-qE-MQDkY9Tslzyf7qIA"))) return;
  const mes = hojeSP().slice(0, 7);
  const p = {
    titulo: "NPS Quinze — Pesquisa de Satisfação",
    clienteId: null,
    clienteNome: "Todos os clientes",
    mes,
    tom: "Próximo, direto e consultivo",
    objetivo: "Avaliar atendimento, organização do grupo de WhatsApp, qualidade dos conteúdos, artes/vídeos, planejamento, relatórios de performance, percepção estratégica e NPS da Quinze.",
    briefing: "Pesquisa oficial de satisfação e NPS da Quinze vinculada ao Google Forms (13 perguntas cobrindo Atendimento, WhatsApp, Conteúdos, Design/Vídeo, Planejamento, Relatórios e NPS).",
    perguntas: QUESTOES_OFICIAIS.map(({ questionId, ...q }) => q),
    formQuestoes: QUESTOES_OFICIAIS,
    formularioUrl: FORM_OFICIAL_URL,
    formularioOrigem: "google_link",
    status: "formulario_gerado",
    criadoEm: agora(),
    atualizadoEm: agora(),
  };
  await criarSeNovo(M, "pesquisas", FORM_OFICIAL_ID_DOC, p);
}

// ---------- Inspecionar qualquer link público do Google Forms ----------
export async function inspecionarGoogleForm(linkBruto) {
  let u;
  try { u = new URL(txt(linkBruto, 600)); } catch { return null; }
  if (u.protocol !== "https:") return null;
  // Extrai formId de edição se for um link /forms/d/<ID>/edit (e não /forms/d/e/<PUB_ID>/viewform)
  const mEdit = /^\/forms\/d\/(?!e\/)([A-Za-z0-9_-]{15,})\b/.exec(u.pathname);
  const formIdExtraido = mEdit ? mEdit[1] : "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(u.toString(), { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 QuinzeCentral/1.0" } });
    if (!r.ok) return { url: u.toString(), formId: formIdExtraido, perguntas: [], formQuestoes: [] };
    const html = await r.text();
    const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
    if (!m) return { url: r.url || u.toString(), formId: formIdExtraido, perguntas: [], formQuestoes: [] };
    const d = JSON.parse(m[1]);
    const titulo = txt(d?.[1]?.[8] || d?.[3] || "", 200);
    const descricao = txt(d?.[1]?.[0] || "", 2000);
    const itens = Array.isArray(d?.[1]?.[1]) ? d[1][1] : [];
    const formQuestoes = [];
    let jaTemNps = false;
    // Primeiro passo: identifica se há pergunta de recomendação/indicação 0-10
    for (const q of itens) {
      const texto = txt(q?.[1], 300);
      const tipoG = q?.[3];
      const entryId = String(q?.[4]?.[0]?.[0] || "");
      const optsRaw = Array.isArray(q?.[4]?.[0]?.[1]) ? q[4][0][1].map(o => txt(o?.[0], 120)).filter(Boolean) : [];
      if (!texto) continue;
      const eh0a10 = tipoG === 5 && optsRaw.includes("0") && optsRaw.includes("10");
      const eh1a5 = tipoG === 5 && !eh0a10 && optsRaw.includes("1") && optsRaw.includes("5");
      let tipo = "aberta", escalaMax = undefined;
      if (eh0a10) {
        if (!jaTemNps && /indica|recomend|nps/i.test(texto)) { tipo = "nps"; jaTemNps = true; }
        else tipo = "escala";
        escalaMax = 10;
      } else if (eh1a5) {
        tipo = "escala";
        escalaMax = 5;
      } else if ([2, 3, 4].includes(tipoG) && optsRaw.length) {
        tipo = "multipla";
      }
      formQuestoes.push({ questionId: entryId, tipo, texto, ...(escalaMax ? { escalaMax } : {}), ...(optsRaw.length ? { opcoes: optsRaw } : {}) });
    }
    if (!jaTemNps) {
      const primeira0a10 = formQuestoes.find(q => q.escalaMax === 10);
      if (primeira0a10) primeira0a10.tipo = "nps";
    }
    const urlFinal = (r.url || u.toString()).split("?")[0];
    return {
      url: urlFinal,
      formId: formIdExtraido,
      titulo,
      descricao,
      formQuestoes,
      perguntas: formQuestoes.map(({ questionId, ...rest }) => rest),
    };
  } catch {
    return { url: u.toString(), formId: formIdExtraido, perguntas: [], formQuestoes: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Perguntas ----------
export const MAX_PERGUNTAS = 25;
export function limparPerguntas(lista) {
  const out = (Array.isArray(lista) ? lista : []).slice(0, MAX_PERGUNTAS).map(p => {
    const tipo = ["nps", "escala", "aberta", "multipla"].includes(p?.tipo) ? p.tipo : "aberta";
    const q = { tipo, texto: txt(p?.texto, 300) };
    if (tipo === "escala") q.escalaMax = Number(p?.escalaMax) === 10 ? 10 : 5;
    if (tipo === "multipla" || tipo === "escala") q.opcoes = (Array.isArray(p.opcoes) ? p.opcoes : []).map(o => txt(o, 120)).filter(Boolean).slice(0, 15);
    return q;
  }).filter(p => p.texto);
  return out;
}
export function conferirPerguntas(lista) {
  if (!lista.length) return "Inclua as perguntas.";
  if (lista.length > MAX_PERGUNTAS) return `No máximo ${MAX_PERGUNTAS} perguntas.`;
  const nps = lista.filter(p => p.tipo === "nps").length;
  if (nps < 1) return "A pesquisa precisa de pelo menos uma pergunta NPS (nota de 0 a 10).";
  if (lista.some(p => p.tipo === "multipla" && (p.opcoes || []).length < 2)) return "Perguntas de múltipla escolha precisam de pelo menos 2 opções.";
  return "";
}
const MODELO_PERGUNTAS = QUESTOES_OFICIAIS.map(({ questionId, ...q }) => q);

// ---------- Mensagem de WhatsApp ----------
export const saudacao = hora => (hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite");
const horaSP = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date())) % 24;
export function mensagemWhatsApp({ cliente, link, hora }) {
  return `${saudacao(hora)}, ${cliente}! Tudo bem?\n\n`
    + `Estamos sempre buscando melhorar o nosso trabalho com vocês e a sua opinião é muito importante para isso. `
    + `Pode nos ajudar respondendo a uma pesquisa rapidinha? Leva menos de 3 minutos:\n\n${link}\n\n`
    + `Muito obrigado pela parceria! 💛\nEquipe Quinze`;
}

// ---------- NPS ----------
// Promotores: 9 e 10. Neutros: 7 e 8. Detratores: 0 a 6. NPS = % promotores - % detratores.
export function calcularNps(notas) {
  const validas = notas.filter(x => Number.isFinite(x) && x >= 0 && x <= 10);
  const n = validas.length;
  if (!n) return { n: 0, media: null, nps: null, promotores: 0, neutros: 0, detratores: 0 };
  const promotores = validas.filter(x => x >= 9).length, detratores = validas.filter(x => x <= 6).length;
  return { n, media: Math.round(validas.reduce((a, b) => a + b, 0) / n * 10) / 10,
    nps: Math.round((promotores - detratores) / n * 1000) / 10, promotores, neutros: n - promotores - detratores, detratores };
}

// Vincula nome digitado pelo cliente ao cadastro da Carteira
function vincularClientePorNome(nomeResp, clientes) {
  const limpo = txt(nomeResp, 160);
  if (!limpo) return { clienteId: null, clienteNome: "Todos os clientes" };
  const nResp = norm(limpo);
  if (!nResp) return { clienteId: null, clienteNome: limpo };
  const cli = (clientes || []).find(c => {
    const nc = norm(c.nome);
    return nc && (nc === nResp || (nResp.length >= 3 && nc.length >= 3 && (nResp.includes(nc) || nc.includes(nResp))));
  });
  return cli ? { clienteId: cli.id, clienteNome: cli.nome, atendimentoCarteira: cli.atendimento || "" } : { clienteId: `ext_${nResp.slice(0, 40)}`, clienteNome: limpo.toUpperCase() };
}

// Extrai atendimento e nota de serviços das respostas estruturadas
function extrairMetadadosRespostas(respostasArr, atendimentoPadrao = "") {
  let atendimento = txt(atendimentoPadrao, 80).toUpperCase();
  let notaServicos = null;
  let comentario = "";
  for (const x of respostasArr || []) {
    const p = String(x.pergunta || "");
    const v = String(x.valor || "").trim();
    if (!v) continue;
    if (!atendimento && /profissional.*atende|quem.*atende|atendimento responsável/i.test(p)) {
      atendimento = v.toUpperCase();
    } else if (notaServicos == null && /0 a 10.*nota.*servi|nota.*servi.*hoje/i.test(p)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0 && n <= 10) notaServicos = n;
    } else if (!comentario && /contribuir|elogiar|sugerir|melhor|coment|aberta|contribui/i.test(p) && !/^\d+$/.test(v)) {
      comentario = v;
    }
  }
  return { atendimento, notaServicos, comentario };
}

// Ponto de entrada da integração com o Google Forms / Planilhas / Importação
export async function registrarResposta(pesquisaId, resposta, opt = {}) {
  const p = pesquisaId ? await ler(M, "pesquisas", pesquisaId) : null;
  const nota = Number(resposta?.nota);
  if (!Number.isInteger(nota) || nota < 0 || nota > 10) throw new Error("nota_invalida");
  const respostasLimpas = (Array.isArray(resposta.respostas) ? resposta.respostas : []).slice(0, MAX_PERGUNTAS)
    .map(x => ({ pergunta: txt(x?.pergunta, 300), valor: txt(x?.valor, 2000) })).filter(x => x.pergunta && x.valor !== "");
  const meta = extrairMetadadosRespostas(respostasLimpas, resposta.atendimento || "");
  const recebidaEm = txt(resposta.recebidaEm, 40) || agora();
  const mes = mesValido(resposta.mes) ? resposta.mes : (mesValido(recebidaEm.slice(0, 7)) ? recebidaEm.slice(0, 7) : (p?.mes || hojeSP().slice(0, 7)));
  const r = {
    pesquisaId: p?.id || pesquisaId || FORM_OFICIAL_ID_DOC,
    pesquisaTitulo: p?.titulo || p?.clienteNome || "NPS Quinze — Pesquisa de Satisfação",
    clienteId: resposta.clienteId !== undefined ? resposta.clienteId : (p?.clienteId || null),
    clienteNome: txt(resposta.clienteNome || p?.clienteNome || "Todos os clientes", 160),
    atendimento: meta.atendimento,
    notaServicos: resposta.notaServicos != null ? Number(resposta.notaServicos) : meta.notaServicos,
    comentario: meta.comentario,
    mes,
    nota,
    respostas: respostasLimpas,
    recebidaEm,
    origem: txt(opt.origem || resposta.origem || "google_forms", 30),
    teste: !!opt.teste,
    registradaPor: opt.por || null,
  };
  if (opt.id) return (await criarSeNovo(M, "respostas", opt.id, r)) ? { ...r, id: opt.id } : null;
  const id = novoId();
  await gravar(M, "respostas", id, r);
  return { ...r, id };
}

// ---------- Parser de CSV / TSV do Google Forms ou Google Sheets ----------
function parseGradeTexto(texto) {
  const limpo = String(texto || "").replace(/^\uFEFF/, "").trim();
  if (!limpo) return [];
  // Detecta se é separado por TAB (colado direto do Excel/Google Sheets) ou vírgula/ponto-e-vírgula (CSV)
  const primeiraLinha = limpo.split(/\r?\n/)[0] || "";
  const sep = primeiraLinha.includes("\t") ? "\t" : (primeiraLinha.split(";").length > primeiraLinha.split(",").length ? ";" : ",");
  const linhas = [];
  let atual = [], campo = "", emAspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i], prox = limpo[i + 1];
    if (emAspas) {
      if (ch === '"' && prox === '"') { campo += '"'; i++; }
      else if (ch === '"') emAspas = false;
      else campo += ch;
    } else {
      if (ch === '"') emAspas = true;
      else if (ch === sep) { atual.push(campo.trim()); campo = ""; }
      else if (ch === "\r" && prox === "\n") { atual.push(campo.trim()); linhas.push(atual); atual = []; campo = ""; i++; }
      else if (ch === "\n" || ch === "\r") { atual.push(campo.trim()); linhas.push(atual); atual = []; campo = ""; }
      else campo += ch;
    }
  }
  if (campo.length || atual.length) { atual.push(campo.trim()); linhas.push(atual); }
  return linhas.filter(l => l.some(c => c !== ""));
}

function converterDataPlanilha(str) {
  const s = String(str || "").trim();
  if (!s) return "";
  // ISO: 2026-11-10...
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).toISOString();
  // BR: DD/MM/AAAA HH:MM:SS ou DD/MM/AAAA
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    const [, dd, mm, yyyy, hh = "12", min = "00", ss = "00"] = m;
    const dt = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min, +ss));
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const tent = Date.parse(s);
  return !isNaN(tent) ? new Date(tent).toISOString() : "";
}

export async function importarLinhasPlanilha(textoCsvOuTsv, pesquisa, clientes, opt = {}) {
  const grade = parseGradeTexto(textoCsvOuTsv);
  if (grade.length < 2) return { lidas: 0, novas: 0, ignoradas: 0 };
  const cab = grade[0].map(h => String(h || "").trim());
  // Localiza colunas especiais
  const idxData = cab.findIndex(h => /carimbo de data|timestamp|data/i.test(h));
  const idxEmpresa = cab.findIndex(h => /nome da sua empresa|empresa|cliente/i.test(h));
  let idxNps = cab.findIndex(h => /probabilidade.*indicar|recomendaria|indicar a quinze|\bnps\b/i.test(h));
  const idxServicos = cab.findIndex(h => /0 a 10.*nota.*servi|nota.*servi.*hoje/i.test(h));
  if (idxNps < 0) idxNps = idxServicos;
  if (idxNps < 0) {
    // Procura qualquer coluna cujos valores nas linhas sejam números de 0 a 10
    idxNps = cab.findIndex((_, col) => col !== idxData && grade.slice(1).some(r => /^(10|[0-9])$/.test(String(r[col] || "").trim())));
  }
  if (idxNps < 0) throw new Error("Não encontramos a coluna da nota NPS (0 a 10) na planilha/arquivo. Verifique se a linha de cabeçalho foi incluída.");

  let lidas = 0, novas = 0, ignoradas = 0;
  for (let i = 1; i < grade.length; i++) {
    const row = grade[i];
    const notaStr = String(row[idxNps] ?? "").trim().replace(",", ".");
    const nota = Number(notaStr);
    if (!Number.isInteger(nota) || nota < 0 || nota > 10) { ignoradas++; continue; }
    lidas++;
    const dataRaw = idxData >= 0 ? row[idxData] : "";
    const recebidaEm = converterDataPlanilha(dataRaw) || agora();
    const nomeEmp = idxEmpresa >= 0 ? row[idxEmpresa] : "";
    const vinc = nomeEmp ? vincularClientePorNome(nomeEmp, clientes) : {
      clienteId: pesquisa?.clienteId || null,
      clienteNome: pesquisa?.clienteNome || "Todos os clientes",
    };
    const respostas = [];
    for (let c = 0; c < cab.length; c++) {
      if (c === idxData || c === idxNps) continue;
      const pergunta = cab[c];
      const valor = String(row[c] ?? "").trim();
      if (pergunta && valor !== "") respostas.push({ pergunta, valor });
    }
    const chaveUnica = `${pesquisa?.id || FORM_OFICIAL_ID_DOC}|${dataRaw || i}|${norm(vinc.clienteNome)}|${nota}|${respostas.map(x => x.valor).join("|")}`;
    const id = "imp_" + crypto.createHash("sha1").update(chaveUnica).digest("hex").slice(0, 24);
    const gravada = await registrarResposta(pesquisa?.id || FORM_OFICIAL_ID_DOC, {
      nota,
      respostas,
      clienteId: vinc.clienteId,
      clienteNome: vinc.clienteNome,
      atendimento: vinc.atendimentoCarteira || "",
      recebidaEm,
    }, { id, origem: opt.origem || "planilha_forms", por: opt.por || null });
    if (gravada) novas++; else ignoradas++;
  }
  return { lidas, novas, ignoradas };
}

// Extrai ID de uma planilha Google Sheets a partir do link
function extrairSheetId(urlBruta) {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{15,})/.exec(String(urlBruta || ""));
  return m ? m[1] : "";
}
async function baixarCsvPlanilhaGoogle(planilhaUrl) {
  const sheetId = extrairSheetId(planilhaUrl);
  if (!sheetId) throw new Error("Link do Google Sheets inválido.");
  const gidMatch = /[?#&]gid=(\d+)/.exec(String(planilhaUrl || ""));
  const gid = gidMatch ? gidMatch[1] : "0";
  // 1) Tenta via export CSV direto (funciona quando a planilha está com "Qualquer pessoa com o link pode ver" ou publicada)
  const urlCsv = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  try {
    const r = await fetch(urlCsv, { redirect: "follow" });
    if (r.ok) {
      const ct = String(r.headers.get("content-type") || "");
      const txtCsv = await r.text();
      if (!ct.includes("text/html") && txtCsv && !txtCsv.trim().startsWith("<!DOCTYPE")) return txtCsv;
    }
  } catch {}
  // 2) Tenta via Conta de Serviço do Google Drive (se compartilhada com a conta de serviço)
  if (googleConfigurado()) {
    const arq = await lerArquivoDrive(sheetId);
    if (arq?.texto) return arq.texto;
  }
  throw new Error("Não foi possível ler a planilha automaticamente. No Google Sheets, clique em Compartilhar → 'Qualquer pessoa com o link pode ler' (ou importe o CSV / cole os dados abaixo).");
}

// ---------- Rotas: NPS Pesquisa ----------
async function inicio(u, req, res) {
  await garantirPesquisaOficial();
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
  const cli = b.clienteId ? clientes.find(c => c.id === b.clienteId) : null;
  if (!mesValido(b.mes)) return res.status(400).json({ code: "mes", msg: "Escolha o mês de referência." });
  const tom = txt(b.tom, 1000), objetivo = txt(b.objetivo, 6000), titulo = txt(b.titulo, 200);
  if (!tom || !objetivo) return res.status(400).json({ code: "campos", msg: "Preencha o tom de voz e o objetivo." });
  const clienteId = cli ? cli.id : null;
  const clienteNome = cli ? cli.nome : "Todos os clientes";
  const p = { ...(atual || { status: "rascunho", criadoEm: agora(), criadoPor: quem(u), perguntas: [], briefing: "" }),
    titulo: titulo || atual?.titulo || (cli ? `NPS – ${cli.nome}` : `Pesquisa Geral – ${b.mes}`),
    clienteId, clienteNome, mes: b.mes, tom, objetivo, atualizadoEm: agora() };
  const id = b.id || novoId();
  await gravar(M, "pesquisas", id, p);
  return res.json({ ok: true, pesquisa: { ...p, id } });
}

// Cria ou atualiza uma pesquisa diretamente a partir de um link do Google Forms (atual ou futuro!)
async function pesquisaImportarForm(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const link = txt(b.link, 600);
  if (!link) return res.status(400).json({ code: "link", msg: "Cole o link do formulário do Google Forms." });
  const info = await inspecionarGoogleForm(link);
  if (!info) return res.status(400).json({ code: "link", msg: "Link inválido. Use um link https://docs.google.com/forms/... ou https://forms.gle/..." });
  const clientes = await clientesCarteira();
  const cli = b.clienteId ? clientes.find(c => c.id === b.clienteId) : null;
  const mes = mesValido(b.mes) ? b.mes : hojeSP().slice(0, 7);
  const perguntas = info.perguntas.length ? info.perguntas : MODELO_PERGUNTAS;
  const formQuestoes = info.formQuestoes.length ? info.formQuestoes : QUESTOES_OFICIAIS;
  const titulo = txt(b.titulo, 200) || info.titulo || (cli ? `Pesquisa – ${cli.nome}` : `Pesquisa de Satisfação – ${mes}`);
  const id = b.id && (await ler(M, "pesquisas", b.id)) ? b.id : novoId();
  const p = {
    titulo,
    clienteId: cli ? cli.id : null,
    clienteNome: cli ? cli.nome : "Todos os clientes",
    mes,
    tom: "Próximo, direto e consultivo",
    objetivo: info.descricao || `Pesquisa vinculada ao Google Forms (${perguntas.length} perguntas).`,
    briefing: info.descricao || `Formulário importado do Google Forms com ${perguntas.length} perguntas.`,
    perguntas,
    formQuestoes,
    formId: info.formId || "",
    formularioUrl: info.url || link,
    planilhaUrl: txt(b.planilhaUrl, 600) || "",
    formularioOrigem: "google_link",
    status: "formulario_gerado",
    criadoEm: agora(),
    criadoPor: quem(u),
    atualizadoEm: agora(),
  };
  await gravar(M, "pesquisas", id, p);
  return res.json({ ok: true, pesquisa: { ...p, id }, perguntasDetectadas: info.perguntas.length });
}

async function pesquisaBriefing(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id, modelo } = corpo(req);
  const p = await ler(M, "pesquisas", id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  if (etapa(p.status) > etapa("perguntas_em_aprovacao")) return res.status(409).json({ code: "etapa", msg: "As perguntas já foram aprovadas." });
  let briefing, perguntas;
  const ehGeral = !p.clienteId || p.clienteNome === "Todos os clientes";
  if (modelo === true) {
    briefing = `Objetivo: ${p.objetivo}\nPúblico: ${ehGeral ? "todos os clientes da Quinze (pesquisa geral do mês)" : `responsáveis pela conta do cliente ${p.clienteNome}`}.\nTom: ${p.tom}\nReferência: ${p.mes}.`;
    perguntas = MODELO_PERGUNTAS;
  } else {
    try {
      const publicoTexto = ehGeral ? "para todos os clientes da agência Quinze (pesquisa geral do mês)" : `para o cliente "${p.clienteNome}"`;
      const j = await perguntarJSON(
        "Você ajuda a equipe de atendimento da Quinze, uma agência de comunicação e marketing digital, a montar pesquisas mensais de satisfação (NPS) com clientes. Escreva em português do Brasil. Responda só com JSON válido, sem texto fora do JSON.",
        `Monte a pesquisa do mês ${p.mes} ${publicoTexto}.\n\nTom de voz pedido:\n${p.tom}\n\nO que o levantamento do mês quer descobrir:\n${p.objetivo}\n\n`
        + `Devolva JSON no formato {"briefing": "texto curto com objetivo, público, o que se busca e tom (até 120 palavras)", "perguntas": [{"tipo": "nps"|"aberta"|"multipla", "texto": "...", "opcoes": ["..."] (só em multipla)}]}.\n`
        + `Regras: exatamente uma pergunta tipo "nps" (nota de 0 a 10 sobre recomendar a Quinze); ${ehGeral ? 'a primeira pergunta deve ser aberta para o cliente informar o nome da empresa ("Qual é o nome da sua empresa?"); ' : ''}no total até 10 perguntas; perguntas curtas, no tom pedido.`);
      briefing = txt(j.briefing, 3000);
      perguntas = j.perguntas;
    } catch (e) { return falhaIA(res, e); }
  }
  perguntas = limparPerguntas(perguntas);
  if (perguntas.filter(q => q.tipo === "nps").length === 0) perguntas.push({ tipo: "nps", texto: "Qual a probabilidade de você indicar a Quinze para alguém?" });
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
async function pesquisaLink(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const p = await ler(M, "pesquisas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  let url = p.formularioUrl || "";
  if (b.link) {
    try { url = new URL(txt(b.link, 500)).toString(); } catch { return res.status(400).json({ code: "link", msg: "Cole um link válido (https://...)." }); }
    if (!url.startsWith("https://")) return res.status(400).json({ code: "link", msg: "O link precisa começar com https://" });
  }
  const info = b.link ? await inspecionarGoogleForm(url) : null;
  if (info?.formQuestoes?.length) {
    p.formQuestoes = info.formQuestoes;
    p.perguntas = info.perguntas;
    if (info.titulo && !p.titulo) p.titulo = info.titulo;
    if (info.formId && !p.formId) p.formId = info.formId;
  }
  if (b.planilhaUrl !== undefined) p.planilhaUrl = txt(b.planilhaUrl, 600);
  Object.assign(p, {
    formularioUrl: info?.url || url,
    formularioOrigem: p.formularioOrigem || "manual",
    status: etapa(p.status) < etapa("formulario_gerado") ? "formulario_gerado" : p.status,
    atualizadoEm: agora(),
  });
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
  const cliente = txt(b.clienteNome, 120) || (p.clienteId ? p.clienteNome : "parceiro");
  let link = p.formularioUrl;
  const params = [];
  const empQ = (p.formQuestoes || []).find(q => /empresa|cliente/i.test(q.texto) && q.tipo !== "nps");
  if (empQ?.questionId && cliente && cliente !== "parceiro" && cliente !== "Todos os clientes") {
    params.push(`entry.${empQ.questionId}=${encodeURIComponent(cliente)}`);
  }
  const atQ = (p.formQuestoes || []).find(q => /profissional.*atende|quem.*atende/i.test(q.texto));
  if (atQ?.questionId && cliente && cliente !== "parceiro") {
    const cliCad = (await clientesCarteira()).find(c => norm(c.nome) === norm(cliente));
    if (cliCad?.atendimento) {
      const optMatch = (atQ.opcoes || []).find(o => norm(o) === norm(cliCad.atendimento)) || cliCad.atendimento;
      params.push(`entry.${atQ.questionId}=${encodeURIComponent(optMatch)}`);
    }
  }
  if (params.length) {
    const sep = link.includes("?") ? "&" : "?";
    link = `${link}${sep}usp=pp_url&${params.join("&")}`;
  }
  return res.json({ mensagem: mensagemWhatsApp({ cliente, link, hora }), linkPersonalizado: link });
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

// ---------- Google Forms & Sheets Sync ----------
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
  const ehGeral = !p.clienteId || p.clienteNome === "Todos os clientes";
  const nomeTitulo = ehGeral ? "Quinze" : p.clienteNome;
  try {
    const f = await criarFormulario({ titulo: `Pesquisa de satisfação – ${nomeTitulo} – ${mesLongo(p.mes)}`,
      descricao: `Olá! Queremos saber como foi o nosso trabalho com vocês em ${mesLongo(p.mes)}. São ${p.perguntas.length} perguntas rápidas, leva menos de 3 minutos. Obrigado pela parceria! — Equipe Quinze`,
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

export async function sincronizarForms(soPesquisa) {
  const todasPesquisas = await listar(M, "pesquisas");
  const pesquisas = todasPesquisas.filter(p => (p.formId || p.planilhaUrl) && (!soPesquisa || p.id === soPesquisa));
  const clientes = await clientesCarteira();
  const out = { formularios: pesquisas.length, novas: 0, erros: [] };
  for (const p of pesquisas) {
    // 1) Se tiver planilha do Google Sheets vinculada, sincroniza pela planilha
    if (p.planilhaUrl) {
      try {
        const csv = await baixarCsvPlanilhaGoogle(p.planilhaUrl);
        const rPlan = await importarLinhasPlanilha(csv, p, clientes, { origem: "google_sheets" });
        out.novas += rPlan.novas;
        await gravar(M, "pesquisas", p.id, { ...p, respostasSincronizadasEm: agora(), respostasNoForm: rPlan.lidas });
      } catch (e) {
        out.erros.push(`${p.titulo || p.clienteNome}: ${e.message}`.slice(0, 200));
      }
    }
    // 2) Se tiver formId e Google configurado, sincroniza também via Google Forms API
    if (p.formId && googleConfigurado()) {
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
          let clienteId = p.clienteId || null;
          let clienteNome = p.clienteNome || "Todos os clientes";
          let atendimento = "";
          const empQ = (p.formQuestoes || []).find(q => /empresa|cliente/i.test(q.texto) && q.tipo !== "nps");
          if (empQ) {
            const nomeResp = valor(empQ.questionId).trim();
            if (nomeResp) {
              const vinc = vincularClientePorNome(nomeResp, clientes);
              clienteId = vinc.clienteId;
              clienteNome = vinc.clienteNome;
              atendimento = vinc.atendimentoCarteira || "";
            }
          }
          const id = "g_" + crypto.createHash("sha1").update(r.responseId).digest("hex").slice(0, 24);
          const novo = await registrarResposta(p.id, { nota, respostas, clienteId, clienteNome, atendimento, recebidaEm: r.lastSubmittedTime || r.createTime }, { id, origem: "google_forms" });
          if (novo) out.novas++;
        }
        await gravar(M, "pesquisas", p.id, { ...p, respostasSincronizadasEm: agora(), respostasNoForm: lista.length });
      } catch (e) {
        if (!(e instanceof ErroGoogle)) throw e;
        out.erros.push(`${p.titulo || p.clienteNome} (${p.mes}): ${e.message}`.slice(0, 200));
      }
    }
  }
  return out;
}
async function formsSync(u, req, res) {
  return res.json({ ok: true, ...(await sincronizarForms(corpo(req).id || "")) });
}
async function formsCron(req, res) {
  const segredo = process.env.CRON_SECRET || "";
  const veio = String(req.headers.authorization || "");
  const ua = String(req.headers["user-agent"] || "");
  const ok = segredo
    ? (veio.length === `Bearer ${segredo}`.length && crypto.timingSafeEqual(Buffer.from(veio), Buffer.from(`Bearer ${segredo}`)))
    : (ua.startsWith("vercel-cron/") || req.headers["x-vercel-cron"] === "1");
  if (!ok) return res.status(401).json({ code: "unauthorized" });
  return res.json({ ok: true, ...(await sincronizarForms("")) });
}

// Importação direta de CSV/TSV ou planilha colada pelo usuário
async function respostasImportar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  await garantirPesquisaOficial();
  const pesquisa = b.pesquisaId ? await ler(M, "pesquisas", b.pesquisaId) : await ler(M, "pesquisas", FORM_OFICIAL_ID_DOC);
  const clientes = await clientesCarteira();
  let texto = String(b.texto || b.csv || "").trim();
  if (!texto && b.planilhaUrl) {
    try {
      texto = await baixarCsvPlanilhaGoogle(b.planilhaUrl);
      if (pesquisa && b.planilhaUrl !== pesquisa.planilhaUrl) {
        await gravar(M, "pesquisas", pesquisa.id, { ...pesquisa, planilhaUrl: txt(b.planilhaUrl, 600), atualizadoEm: agora() });
      }
    } catch (e) {
      return res.status(400).json({ code: "planilha", msg: e.message });
    }
  }
  if (!texto) return res.status(400).json({ code: "vazio", msg: "Envie o arquivo CSV do Google Forms, cole os dados da planilha ou informe o link do Google Sheets." });
  try {
    const r = await importarLinhasPlanilha(texto, pesquisa, clientes, { origem: "importacao_csv", por: quem(u) });
    if (pesquisa) await gravar(M, "pesquisas", pesquisa.id, { ...pesquisa, respostasSincronizadasEm: agora(), respostasNoForm: (pesquisa.respostasNoForm || 0) + r.novas });
    return res.json({ ok: true, ...r });
  } catch (e) {
    return res.status(400).json({ code: "formato", msg: e.message });
  }
}

// Registro manual/direto de uma resposta individual de cliente
async function respostaRegistrar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  await garantirPesquisaOficial();
  const pesquisaId = b.pesquisaId || FORM_OFICIAL_ID_DOC;
  const clientes = await clientesCarteira();
  const cli = b.clienteId ? clientes.find(c => c.id === b.clienteId) : null;
  const vinc = cli ? { clienteId: cli.id, clienteNome: cli.nome, atendimentoCarteira: cli.atendimento || "" } : vincularClientePorNome(b.clienteNome, clientes);
  try {
    const r = await registrarResposta(pesquisaId, {
      nota: Number(b.nota),
      notaServicos: b.notaServicos !== "" && b.notaServicos != null ? Number(b.notaServicos) : null,
      clienteId: vinc.clienteId,
      clienteNome: vinc.clienteNome,
      atendimento: b.atendimento || vinc.atendimentoCarteira || "",
      mes: b.mes || hojeSP().slice(0, 7),
      respostas: Array.isArray(b.respostas) ? b.respostas : [],
      recebidaEm: b.data ? `${b.data}T12:00:00Z` : agora(),
    }, { origem: "manual", por: quem(u) });
    return res.json({ ok: true, resposta: r });
  } catch (e) {
    return res.status(400).json({ code: "dados", msg: e.message === "nota_invalida" ? "Informe a nota NPS de 0 a 10." : e.message });
  }
}

async function respostaExcluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const r = await ler(M, "respostas", id);
  if (!r) return res.status(404).json({ code: "nao_encontrado" });
  await apagar(M, "respostas", id);
  return res.json({ ok: true });
}

// ---------- Rotas: NPS Média e Resultados Detalhados ----------
function filtrar(lista, q) {
  return lista.filter(r => {
    if (q.teste ? !r.teste : r.teste) return false;
    if (q.de && r.mes < q.de) return false;
    if (q.ate && r.mes > q.ate) return false;
    if (q.pesquisa && r.pesquisaId !== q.pesquisa) return false;
    if (q.cliente && (r.clienteId || r.clienteNome) !== q.cliente && r.clienteNome !== q.cliente) return false;
    if (q.atendimento && String(r.atendimento || "").toUpperCase() !== q.atendimento.toUpperCase()) return false;
    if (q.perfil === "promotor" && !(r.nota >= 9)) return false;
    if (q.perfil === "neutro" && !(r.nota === 7 || r.nota === 8)) return false;
    if (q.perfil === "detrator" && !(r.nota <= 6)) return false;
    return true;
  });
}
const chaveRelatorio = q => ["r", q.de || "inicio", q.ate || "fim", q.pesquisa || "todas", q.cliente || "todos", q.atendimento || "todos"].join("_").replace(/[^A-Za-z0-9_\-.]/g, "");
const lerFiltro = src => ({
  de: mesValido(src.de) ? src.de : "",
  ate: mesValido(src.ate) ? src.ate : "",
  pesquisa: txt(src.pesquisa, 120),
  cliente: txt(src.cliente, 160),
  atendimento: txt(src.atendimento, 80),
  perfil: ["promotor", "neutro", "detrator"].includes(src.perfil) ? src.perfil : "",
  teste: false,
});

function agregarPorPergunta(respostasFiltradas) {
  const mapa = new Map();
  for (const r of respostasFiltradas) {
    for (const item of r.respostas || []) {
      const perg = String(item.pergunta || "").trim();
      const val = String(item.valor || "").trim();
      if (!perg || !val || /nome da sua empresa|qual.*empresa/i.test(perg)) continue;
      let g = mapa.get(perg);
      if (!g) { g = { pergunta: perg, valores: [], numericos: [] }; mapa.set(perg, g); }
      g.valores.push(val);
      if (/^(10|[0-9])$/.test(val)) g.numericos.push(Number(val));
    }
  }
  const out = [];
  for (const g of mapa.values()) {
    const n = g.valores.length;
    if (!n) continue;
    // Se pelo menos 80% das respostas desta pergunta são números (0-10 ou 1-5), trata como Escala
    if (g.numericos.length >= n * 0.8 && !/profissional|relat|planejamento|parceiro/i.test(g.pergunta)) {
      const maxVal = Math.max(...g.numericos);
      const escalaMax = maxVal > 5 || /0 a 10/i.test(g.pergunta) ? 10 : 5;
      const media = Math.round(g.numericos.reduce((a, b) => a + b, 0) / g.numericos.length * 10) / 10;
      out.push({ pergunta: g.pergunta, tipo: "escala", escalaMax, n: g.numericos.length, media });
    } else {
      // Múltipla escolha ou texto
      const cont = {};
      for (const v of g.valores) cont[v] = (cont[v] || 0) + 1;
      const unicos = Object.keys(cont);
      if (unicos.length <= 10 && g.valores.every(v => v.length <= 80)) {
        const opcoes = Object.entries(cont)
          .map(([valor, count]) => ({ valor, count, pct: Math.round(count / n * 100) }))
          .sort((a, b) => b.count - a.count);
        out.push({ pergunta: g.pergunta, tipo: "multipla", n, opcoes });
      }
    }
  }
  return out;
}

async function respostas(u, req, res) {
  await garantirPesquisaOficial();
  const q = lerFiltro(req.query);
  const [listaBruta, carteira, pesquisas] = await Promise.all([
    listar(M, "respostas"),
    clientesCarteira(),
    listar(M, "pesquisas"),
  ]);
  const mapaCli = new Map(carteira.map(c => [c.id, c]));
  // Enriquecimento retroativo de atendimento/meta a partir da carteira e das respostas
  const lista = listaBruta.map(r => {
    const meta = extrairMetadadosRespostas(r.respostas, r.atendimento || mapaCli.get(r.clienteId)?.atendimento || "");
    return {
      ...r,
      atendimento: meta.atendimento,
      notaServicos: r.notaServicos != null ? r.notaServicos : meta.notaServicos,
      comentario: r.comentario || meta.comentario,
    };
  });
  const todas = filtrar(lista, q);
  const agruparMes = Object.entries(todas.reduce((acc, r) => {
    const chave = r.mes || "geral";
    (acc[chave] ||= []).push(r);
    return acc;
  }, {})).map(([chave, rs]) => ({ chave, nome: chave, ...calcularNps(rs.map(r => r.nota)) })).sort((a, b) => a.chave.localeCompare(b.chave));

  const agruparCliente = Object.entries(todas.reduce((acc, r) => {
    const chave = r.clienteId || r.clienteNome || "geral";
    (acc[chave] ||= []).push(r);
    return acc;
  }, {})).map(([chave, rs]) => {
    const notasServ = rs.map(r => r.notaServicos).filter(x => Number.isFinite(x));
    const ult = rs.slice().sort((a, b) => (b.recebidaEm || "").localeCompare(a.recebidaEm || ""))[0];
    return {
      chave,
      clienteId: rs[0].clienteId || chave,
      nome: rs[0].clienteNome || (chave === "geral" ? "Pesquisa Geral" : chave),
      atendimento: ult?.atendimento || mapaCli.get(rs[0].clienteId)?.atendimento || "",
      mediaServicos: notasServ.length ? Math.round(notasServ.reduce((a, b) => a + b, 0) / notasServ.length * 10) / 10 : null,
      ultimaEm: ult?.recebidaEm || "",
      ...calcularNps(rs.map(r => r.nota)),
    };
  }).sort((a, b) => (b.nps ?? -999) - (a.nps ?? -999) || b.n - a.n);

  // Lista completa de clientes para o filtro (clientes da carteira + clientes que já responderam pesquisa)
  const opcoesClientesMap = new Map();
  for (const c of carteira) opcoesClientesMap.set(c.id, { id: c.id, nome: c.nome, respostas: 0 });
  for (const r of lista.filter(x => !x.teste)) {
    const ch = r.clienteId || r.clienteNome;
    if (!ch) continue;
    const atual = opcoesClientesMap.get(ch) || { id: ch, nome: r.clienteNome || ch, respostas: 0 };
    atual.respostas++;
    opcoesClientesMap.set(ch, atual);
  }
  const clientesFiltro = [...opcoesClientesMap.values()].sort((a, b) => b.respostas - a.respostas || a.nome.localeCompare(b.nome, "pt-BR"));
  const atendimentos = [...new Set([
    ...carteira.map(c => c.atendimento),
    ...lista.map(r => r.atendimento),
  ].filter(Boolean).map(s => s.toUpperCase()))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  const notasServGlobal = todas.map(r => r.notaServicos).filter(x => Number.isFinite(x));
  const total = {
    ...calcularNps(todas.map(r => r.nota)),
    mediaServicos: notasServGlobal.length ? Math.round(notasServGlobal.reduce((a, b) => a + b, 0) / notasServGlobal.length * 10) / 10 : null,
  };

  const rel = await ler(M, "relatorios", chaveRelatorio(q));
  return res.json({
    filtro: q,
    total,
    porMes: agruparMes,
    porCliente: agruparCliente,
    porPergunta: agregarPorPergunta(todas),
    listaRespostas: todas.slice().sort((a, b) => (b.recebidaEm || "").localeCompare(a.recebidaEm || "")).slice(0, 200),
    abertas: todas.flatMap(r => r.respostas.filter(x => x.valor && !/^\d+$/.test(x.valor) && !/nome da sua empresa|profissional.*atende|planejamento|relat|parceiro estrat/i.test(x.pergunta)).map(x => ({ cliente: r.clienteNome, atendimento: r.atendimento, nota: r.nota, mes: r.mes, pergunta: x.pergunta, valor: x.valor }))).slice(-200),
    relatorio: rel,
    clientes: clientesFiltro,
    pesquisas: pesquisas.map(p => ({ id: p.id, titulo: p.titulo || p.clienteNome || "Pesquisa", mes: p.mes, formularioUrl: p.formularioUrl, planilhaUrl: p.planilhaUrl || "", perguntas: p.perguntas || [] })),
    atendimentos,
    gestao: ehGestao(u),
    ia: iaDisponivel(),
    google: googleConfigurado(),
  });
}
async function relatorioGerar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const q = lerFiltro(corpo(req));
  const todas = filtrar(await listar(M, "respostas"), q);
  const abertas = todas.flatMap(r => r.respostas.filter(x => x.valor && !/^\d+$/.test(x.valor)).map(x => `- [${r.clienteNome}, ${r.mes}, nota NPS ${r.nota}] ${x.pergunta}: ${x.valor}`));
  if (!abertas.length) return res.status(400).json({ code: "sem_respostas", msg: "Não há respostas neste período/filtro para analisar." });
  let j;
  try {
    j = await perguntarJSON(
      "Você analisa pesquisas de satisfação de clientes de uma agência de comunicação (Quinze). Escreva em português do Brasil, de forma objetiva. Responda só com JSON válido.",
      `Respostas da pesquisa do período (${q.de || "início"} a ${q.ate || "hoje"}${q.cliente ? ", filtrado por cliente" : ", todos os clientes"}):\n${abertas.slice(-150).join("\n").slice(0, 30000)}\n\n`
      + `Liste de 3 a 5 pontos de melhoria concretos e insights, baseados só nessas respostas. JSON: {"pontos": [{"titulo": "curto", "detalhe": "1 a 2 frases, citando a evidência"}]}`, 1500);
  } catch (e) { return falhaIA(res, e); }
  const pontos = (Array.isArray(j.pontos) ? j.pontos : []).map(p => ({ titulo: txt(p?.titulo, 120), detalhe: txt(p?.detalhe, 600) })).filter(p => p.titulo).slice(0, 5);
  if (pontos.length < 1) return res.status(502).json({ code: "ia_formato", msg: MSG_IA.ia_formato });
  const rel = { pontos, geradoEm: agora(), geradoPor: quem(u), respostasAnalisadas: todas.length, filtro: q };
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
  inicio, "pesquisa.salvar": pesquisaSalvar, "pesquisa.importar_form": pesquisaImportarForm,
  "pesquisa.briefing": pesquisaBriefing, "pesquisa.perguntas": pesquisaPerguntas,
  "pesquisa.aprovar": pesquisaAprovar, "pesquisa.link": pesquisaLink, "pesquisa.mensagem": pesquisaMensagem,
  "pesquisa.enviada": pesquisaEnviada, "pesquisa.excluir": pesquisaExcluir,
  respostas, "respostas.importar": respostasImportar, "resposta.registrar": respostaRegistrar, "resposta.excluir": respostaExcluir,
  "relatorio.gerar": relatorioGerar,
  reclamacoes, "reclamacao.salvar": reclamacaoSalvar, "reclamacao.excluir": reclamacaoExcluir,
  "pesquisa.formulario": pesquisaFormulario, "forms.sync": formsSync,
};
export const publicas = { "forms.cron": formsCron };
