// 03 Administrativo (só mestre e gestão): contratos, assinatura de documentos, pessoal e férias.
// Dados em m/administrativo/<colecao>/<id>, servidos só por aqui (nunca pela sincronização geral).
// Toda consulta ou alteração de Pessoal vai para a tabela auditoria.
import crypto from "node:crypto";
import { sql, ehGestao } from "./_lib.js";
import { listar, ler, gravar, apagar, auditar, novoId, idValido, clientesCarteira, txt, dataIso, num } from "./_mdados.js";
import { decodificar, guardar, enviar, extensao, nomeSeguro, lerArquivo, linkTemporario } from "./_arquivos.js";
import { enviarArquivoDrive, googleConfigurado, emailContaServico } from "./_google.js";

const M = "administrativo";
const TIPOS_CONTRATO = ["Fee mensal", "Job", "Prestação de serviço", "Fornecedor", "Locação", "Outro"];

// ---------- Datas ----------
export const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const d = iso => new Date(iso + "T12:00:00Z");
const iso = dt => dt.toISOString().slice(0, 10);
export function somarMeses(isoData, meses) {
  const [y, m, dd] = isoData.split("-").map(Number);
  const alvo = new Date(Date.UTC(y, m - 1 + meses, 1, 12));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate();
  alvo.setUTCDate(Math.min(dd, ultimo));
  return iso(alvo);
}
const somarDias = (isoData, n) => { const x = d(isoData); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
const diasEntre = (a, b) => Math.round((d(b) - d(a)) / 864e5);
// Data final padrão: início + prazo em meses - 1 dia (ex.: 01/01/2026 + 12 meses -> 31/12/2026).
export const dataFinalPadrao = (inicio, prazo) => (inicio && prazo > 0 ? somarDias(somarMeses(inicio, prazo), -1) : "");

// ---------- Contratos: status ----------
// vigente: faltam mais de 60 dias
// vencendo: faltam 60 dias ou menos, e há renovação automática ou a gestão já decidiu não renovar
// pendente_renovacao: vencendo ou vencido, sem renovação automática e sem decisão/renovação registrada
// vencido: passou da data final e a gestão marcou "não renovar"
// renovado_automaticamente: passou da data final com renovação automática (o próximo vencimento é recalculado)
export function statusContrato(c, hoje = hojeSP()) {
  if (!c.dataFinal) return { status: "vigente", dias: null, proximoVencimento: "" };
  const dias = diasEntre(hoje, c.dataFinal);
  if (dias < 0) {
    if (c.renovacaoAutomatica && c.prazoMeses > 0) {
      let prox = c.dataFinal;
      for (let i = 0; i < 600 && prox < hoje; i++) prox = dataFinalPadrao(somarDias(prox, 1), c.prazoMeses);
      return { status: "renovado_automaticamente", dias, proximoVencimento: prox };
    }
    return { status: c.naoRenovar ? "vencido" : "pendente_renovacao", dias, proximoVencimento: "" };
  }
  if (dias <= 60) return { status: c.renovacaoAutomatica || c.naoRenovar ? "vencendo" : "pendente_renovacao", dias, proximoVencimento: c.dataFinal };
  return { status: "vigente", dias, proximoVencimento: c.dataFinal };
}
// Sem datas (ex.: veio do onboarding sem leitura completa): status "sem_datas" até a gestão completar.
const comStatus = c => ({ ...c, ...(c.dataFinal || c.inicio ? statusContrato(c) : { status: "sem_datas", dias: null, proximoVencimento: "" }),
  arquivo: c.arquivo ? { nome: c.arquivo.nome, tamanho: c.arquivo.tamanho } : null, arquivosAnteriores: (c.arquivosAnteriores || []).map(a => ({ nome: a.nome, em: a.em })) });

// ---------- IGP-M (Banco Central, SGS série 189: IGP-M, variação % mensal, FGV) ----------
const SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados";
const br = isoData => isoData.split("-").reverse().join("/");
export async function buscarIgpm(desdeMes, hoje = hojeSP()) {
  const url = `${SGS}?formato=json&dataInicial=${br(desdeMes + "-01")}&dataFinal=${br(hoje)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("bcb " + r.status);
    const lista = await r.json();
    if (!Array.isArray(lista)) throw new Error("bcb formato");
    const meses = lista.map(x => ({ mes: String(x.data).split("/").reverse().slice(0, 2).join("-"), valor: Number(String(x.valor).replace(",", ".")) }))
      .filter(x => /^\d{4}-\d{2}$/.test(x.mes) && Number.isFinite(x.valor) && x.mes >= desdeMes);
    return { meses, ...acumular(meses) };
  } finally { clearTimeout(t); }
}
// Acumulado composto: (1 + v1/100) x (1 + v2/100) x ... - 1
export function acumular(meses) {
  const f = meses.reduce((a, x) => a * (1 + x.valor / 100), 1);
  return { acumulado: Math.round((f - 1) * 1e6) / 1e4, de: meses[0]?.mes || "", ate: meses[meses.length - 1]?.mes || "" };
}

// ---------- 13º salário (só CLT) ----------
// Conta o mês em que a pessoa trabalhou 15 dias ou mais no ano. Valor = salário / 12 x meses.
export function decimoTerceiro(p, ano) {
  if (p.tipo !== "CLT") return { aplica: false };
  const ini = p.entrada || `${ano}-01-01`, fim = p.saida || `${ano}-12-31`;
  let meses = 0;
  for (let m = 1; m <= 12; m++) {
    const a = `${ano}-${String(m).padStart(2, "0")}-01`;
    const b = somarDias(somarMeses(a, 1), -1);
    const de = ini > a ? ini : a, ate = fim < b ? fim : b;
    if (de <= ate && diasEntre(de, ate) + 1 >= 15) meses++;
  }
  const salario = Number(p.salario) || 0;
  const valor = Math.round(salario / 12 * meses * 100) / 100;
  const p1 = Math.round(valor / 2 * 100) / 100;
  return { aplica: true, ano, meses, valor, parcela1: p1, parcela2: Math.round((valor - p1) * 100) / 100,
    vencimento1: `${ano}-11-30`, vencimento2: `${ano}-12-20` };
}

// ---------- Ajudas ----------
const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const semChave = a => (a ? { nome: a.nome, tamanho: a.tamanho, em: a.em || "", por: a.por || null } : null);

// ---------- Contratos ----------
async function contratos(u, req, res) {
  const lista = (await listar(M, "contratos")).map(comStatus).sort((a, b) => (a.dataFinal || "9").localeCompare(b.dataFinal || "9"));
  const conta = s => lista.filter(c => c.status === s).length;
  return res.json({ contratos: lista, tipos: TIPOS_CONTRATO, clientes: await clientesCarteira(), hoje: hojeSP(),
    alertas: { vencendo: conta("vencendo"), vencidos: conta("vencido"), pendentes: conta("pendente_renovacao"),
      proximos: lista.filter(c => c.proximoVencimento && c.proximoVencimento >= hojeSP()).sort((a, b) => a.proximoVencimento.localeCompare(b.proximoVencimento)).slice(0, 5)
        .map(c => ({ id: c.id, contraparte: c.contraparte, proximoVencimento: c.proximoVencimento, status: c.status })) } });
}
async function contratoSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const atual = b.id ? await ler(M, "contratos", b.id) : null;
  if (b.id && !atual) return res.status(404).json({ code: "nao_encontrado" });
  const c = {
    ...(atual || { criadoEm: agora(), criadoPor: quem(u), historico: [] }),
    contraparte: txt(b.contraparte, 200), clienteId: txt(b.clienteId, 120), tipo: txt(b.tipo, 60),
    valorMensal: num(b.valorMensal), inicio: dataIso(b.inicio), prazoMeses: Math.max(0, Math.min(600, parseInt(b.prazoMeses, 10) || 0)),
    renovacaoAutomatica: !!b.renovacaoAutomatica, ultimoReajuste: dataIso(b.ultimoReajuste), obs: txt(b.obs, 3000),
  };
  c.dataFinal = dataIso(b.dataFinal) || dataFinalPadrao(c.inicio, c.prazoMeses);
  if (!c.contraparte || !c.inicio || !c.prazoMeses || c.valorMensal == null || c.valorMensal < 0) return res.status(400).json({ code: "campos", msg: "Preencha contraparte, início, prazo e valor mensal." });
  if (!atual && !b.arquivo) return res.status(400).json({ code: "sem_arquivo", msg: "Anexe o arquivo do contrato." });
  if (b.arquivo) {
    const nome = txt(b.arquivo.nome, 150);
    const { buf, erro } = decodificar(b.arquivo.b64, nome);
    if (erro) return res.status(400).json({ code: erro });
    const g = await guardar(`administrativo/contratos/${novoId()}-${nomeSeguro(nome)}`, buf, nome);
    c.arquivo = { chave: g.chave, nome, tamanho: g.tamanho, em: agora(), por: quem(u) };
  }
  c.atualizadoEm = agora(); c.atualizadoPor = quem(u);
  const id = b.id || novoId();
  await gravar(M, "contratos", id, c);
  await auditar(u, M, atual ? "contrato.alterar" : "contrato.criar", id);
  return res.json({ ok: true, contrato: comStatus({ ...c, id }) });
}
// ---------- Contrato vindo do onboarding (instrução 10) ----------
// Chamado pelo servidor a partir da rota do onboarding (o Atendimento continua sem acesso à coleção de contratos).
// Um contrato por onboarding (id estável "onb-<onboardingId>"): subir de novo atualiza o mesmo (nova versão do arquivo).
// Nunca sobrescreve o que a gestão já preencheu; nasce (ou volta) como "a conferir". Auditoria sem valores.
const idOnb = onbId => "onb-" + String(onbId).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100);
export async function contratoDoOnboarding(o, u, { origem = "onboarding" } = {}) {
  const f = o.ficha || {};
  const id = idOnb(o.id), atual = await ler(M, "contratos", id), em = agora();
  const inicio = dataIso(f.inicio) || dataIso(f.assinatura);
  const prazo = Math.max(0, Math.min(600, parseInt(f.vigencia, 10) || 0));
  const lido = {
    contraparte: txt(f.razao || o.nome, 200), clienteId: txt(o.carteira?.inserido?.id, 120), tipo: "",
    valorMensal: f.valorMensal === undefined || f.valorMensal === null || f.valorMensal === "" ? null : num(f.valorMensal), inicio, prazoMeses: prazo, renovacaoAutomatica: f.renovacaoAutomatica === "sim",
    dataFinal: dataIso(f.dataFinal) || dataFinalPadrao(inicio, prazo), ultimoReajuste: dataIso(f.dataReajuste) || inicio,
    linkContrato: /^https?:\/\//.test(o.links?.contrato || "") ? txt(o.links.contrato, 600) : "",
  };
  const arquivo = o.contratoPdf?.chave ? { chave: o.contratoPdf.chave, nome: o.contratoPdf.nome, tamanho: o.contratoPdf.tamanho, em: o.contratoPdf.em, por: o.contratoPdf.por } : null;
  let c, acao;
  if (!atual) {
    c = { ...lido, obs: `Veio do onboarding de ${o.nome || o.id}. Conferir os dados.`, origem: "onboarding", onboardingId: o.id, conferido: false,
      arquivo, arquivosAnteriores: [], criadoEm: em, criadoPor: quem(u), historico: [{ tipo: "onboarding", acao: "criado", em, por: quem(u) }] };
    acao = "criado";
  } else {
    c = { ...atual };
    let mudou = false;
    for (const [k, v] of Object.entries(lido)) {
      const vazio = c[k] == null || c[k] === "" || (k === "prazoMeses" && !c[k]);
      if (vazio && v !== "" && v != null && !(k === "prazoMeses" && !v)) { c[k] = v; mudou = true; }
    }
    if (arquivo && arquivo.chave !== c.arquivo?.chave) {
      if (c.arquivo) c.arquivosAnteriores = [...(c.arquivosAnteriores || []), c.arquivo];
      c.arquivo = arquivo; mudou = true;
    }
    if (!mudou) return { id, acao: "sem_mudanca", em: atual.atualizadoEm || atual.criadoEm };
    c.conferido = false;
    c.historico = [...(c.historico || []), { tipo: "onboarding", acao: "atualizado", em, por: quem(u) }];
    acao = "atualizado";
  }
  c.atualizadoEm = em; c.atualizadoPor = quem(u);
  await gravar(M, "contratos", id, c);
  await auditar(u, M, "contrato.onboarding." + acao, id, { onboarding: o.id, origem });
  return { id, acao, em };
}
// Gestão: importa os contratos dos onboardings que já têm contrato anexado (PDF guardado ou link), sem duplicar.
async function contratosImportar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const obs = await sql`SELECT id, data FROM docs WHERE parent = 'onboarding' AND NOT deleted`;
  let criados = 0, existentes = 0, semContrato = 0;
  for (const r of obs) {
    const o = { ...r.data, id: r.id };
    if (!o.contratoPdf?.chave && !/^https?:\/\//.test(o.links?.contrato || "")) { semContrato++; continue; }
    if (await ler(M, "contratos", idOnb(o.id))) { existentes++; continue; }
    await contratoDoOnboarding(o, u, { origem: "importacao" }); criados++;
  }
  return res.json({ ok: true, criados, existentes, semContrato });
}
async function contratoConferir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const c = await ler(M, "contratos", id);
  if (!c) return res.status(404).json({ code: "nao_encontrado" });
  if (!c.inicio || !c.prazoMeses || c.valorMensal == null || !c.tipo) return res.status(400).json({ code: "campos", msg: "Antes de confirmar, complete tipo, valor mensal, início e prazo (Editar)." });
  c.conferido = true; c.conferidoEm = agora(); c.conferidoPor = quem(u);
  c.historico = [...(c.historico || []), { tipo: "conferido", em: c.conferidoEm, por: quem(u) }];
  await gravar(M, "contratos", id, c);
  await auditar(u, M, "contrato.conferido", id);
  return res.json({ ok: true, contrato: comStatus({ ...c, id }) });
}
async function contratoExcluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  if (!(await ler(M, "contratos", id))) return res.status(404).json({ code: "nao_encontrado" });
  await apagar(M, "contratos", id);
  await auditar(u, M, "contrato.excluir", id);
  return res.json({ ok: true });
}
async function contratoArquivo(u, req, res) {
  const c = await ler(M, "contratos", String(req.query.id || ""));
  if (!c || !c.arquivo) return res.status(404).json({ code: "sem_arquivo" });
  // Arquivos grandes (ex.: PDF do onboarding): link temporário direto do armazenamento, depois de conferir a permissão.
  let url = null; try { url = await linkTemporario(c.arquivo.chave); } catch { url = null; }
  if (url) { res.statusCode = 302; res.setHeader("location", url); res.setHeader("cache-control", "private, no-store"); return res.end(); }
  return enviar(res, c.arquivo.chave, c.arquivo.nome, req.query.ver === "1");
}
async function igpm(u, req, res) {
  const desde = String(req.query.desde || "");
  if (!/^\d{4}-\d{2}$/.test(desde) || desde > hojeSP().slice(0, 7)) return res.status(400).json({ code: "periodo" });
  try {
    const r = await buscarIgpm(desde);
    if (!r.meses.length) return res.status(502).json({ code: "igpm_sem_dados", manual: true });
    return res.json({ fonte: "Banco Central (SGS 189 - IGP-M)", ...r });
  } catch {
    return res.status(502).json({ code: "igpm_indisponivel", manual: true });
  }
}
async function contratoReajustar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const c = await ler(M, "contratos", b.id);
  if (!c) return res.status(404).json({ code: "nao_encontrado" });
  const pct = num(b.percentual);
  if (pct == null || pct < -50 || pct > 100) return res.status(400).json({ code: "percentual" });
  const anterior = Number(c.valorMensal) || 0;
  const novo = Math.round(anterior * (1 + pct / 100) * 100) / 100;
  const data = dataIso(b.data) || hojeSP();
  c.historico = [...(c.historico || []), { tipo: "reajuste", data, percentual: pct, valorAnterior: anterior, valorNovo: novo,
    fonte: b.fonte === "igpm" ? "igpm" : "manual", sugerido: num(b.sugerido), periodo: txt(b.periodo, 40), por: quem(u), em: agora() }];
  c.valorMensal = novo; c.ultimoReajuste = data; c.atualizadoEm = agora(); c.atualizadoPor = quem(u);
  await gravar(M, "contratos", b.id, c);
  await auditar(u, M, "contrato.reajuste", b.id, { percentual: pct });
  return res.json({ ok: true, contrato: comStatus({ ...c, id: b.id }) });
}
// Renovação: "renovar" estende a data final pelo prazo; "nao_renovar" registra a decisão; "desfazer" tira a decisão.
async function contratoRenovar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const c = await ler(M, "contratos", b.id);
  if (!c) return res.status(404).json({ code: "nao_encontrado" });
  if (b.acao === "renovar") {
    const de = c.dataFinal;
    c.dataFinal = dataIso(b.novaDataFinal) || dataFinalPadrao(somarDias(c.dataFinal, 1), c.prazoMeses);
    c.naoRenovar = false;
    c.historico = [...(c.historico || []), { tipo: "renovacao", de, ate: c.dataFinal, por: quem(u), em: agora() }];
  } else if (b.acao === "nao_renovar") {
    c.naoRenovar = true;
    c.historico = [...(c.historico || []), { tipo: "nao_renovar", por: quem(u), em: agora() }];
  } else if (b.acao === "desfazer") {
    c.naoRenovar = false;
    c.historico = [...(c.historico || []), { tipo: "decisao_desfeita", por: quem(u), em: agora() }];
  } else return res.status(400).json({ code: "acao" });
  c.atualizadoEm = agora(); c.atualizadoPor = quem(u);
  await gravar(M, "contratos", b.id, c);
  await auditar(u, M, "contrato." + b.acao, b.id);
  return res.json({ ok: true, contrato: comStatus({ ...c, id: b.id }) });
}

// ---------- Assinatura de documentos ----------
// Instrução 06: o assinado vai para a pasta de assinados do Google Drive (DRIVE_PASTA_ASSINADOS_ID).
// drive_status: pendente (sem integração ou ainda não enviado) -> enviado (com link) ou erro (com a causa curta).
export async function enviarParaDrive(a, buf) {
  if (!googleConfigurado()) return { drive_status: "pendente", drive_erro: "Integração com o Google ainda não configurada." };
  try {
    const arquivo = buf || (await lerArquivo(a.assinadoArquivo.chave));
    if (!arquivo) return { drive_status: "erro", drive_erro: "Arquivo assinado não encontrado no sistema.", drive_em: agora() };
    const f = await enviarArquivoDrive(a.assinadoArquivo.nome, arquivo, a.assinadoArquivo.tipo);
    return { drive_status: "enviado", drive_id: f.id, drive_nome: f.nome, drive_link: f.link, drive_erro: "", drive_em: agora() };
  } catch (e) {
    const causa = e.status === 404 ? "Pasta de assinados não encontrada ou sem acesso para a conta de serviço."
      : e.status === 403 && /quota/i.test(e.message) ? "A conta de serviço não tem espaço no Drive: use uma pasta num Drive compartilhado."
      : e.status === 403 ? "Sem permissão na pasta de assinados (compartilhe com a conta de serviço como Editor)." : e.message;
    return { drive_status: "erro", drive_erro: String(causa).slice(0, 200), drive_em: agora() };
  }
}
const statusAssinatura = (a, hoje = hojeSP()) => (a.assinado ? "assinado" : a.prazo && a.prazo < hoje ? "vencido" : "pendente");
const pubAssinatura = a => ({ ...a, status: statusAssinatura(a), original: semChave(a.original), assinadoArquivo: semChave(a.assinadoArquivo) });
async function assinaturas(u, req, res) {
  const lista = (await listar(M, "assinaturas")).map(pubAssinatura).sort((a, b) => (a.prazo || "9").localeCompare(b.prazo || "9"));
  return res.json({ assinaturas: lista, hoje: hojeSP(), alertas: { vencidos: lista.filter(a => a.status === "vencido").length, pendentes: lista.filter(a => a.status === "pendente").length },
    google: { configurado: googleConfigurado(), contaServico: emailContaServico(), driveParaEnviar: lista.filter(a => a.assinado && a.drive_status !== "enviado").length } });
}
// Reenvia ao Drive um assinado (botão "Tentar de novo") ou todos os que ainda não foram (envio em lote).
async function reenviarDrive(u, a, id) {
  Object.assign(a, await enviarParaDrive(a));
  await gravar(M, "assinaturas", id, a);
  await auditar(u, M, "assinatura.drive", id, { status: a.drive_status });
  return a;
}
async function assinaturaDrive(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const a = await ler(M, "assinaturas", id);
  if (!a || !a.assinado) return res.status(404).json({ code: "nao_encontrado", msg: "Documento assinado não encontrado." });
  if (a.drive_status === "enviado") return res.json({ ok: true, assinatura: pubAssinatura({ ...a, id }) });
  await reenviarDrive(u, a, id);
  return res.status(a.drive_status === "erro" ? 502 : 200).json({ ok: a.drive_status === "enviado", assinatura: pubAssinatura({ ...a, id }), msg: a.drive_erro || "" });
}
async function assinaturaDriveLote(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!googleConfigurado()) return res.status(409).json({ code: "google", msg: "Integração com o Google ainda não configurada." });
  const lista = (await listar(M, "assinaturas")).filter(a => a.assinado && a.drive_status !== "enviado");
  let enviados = 0, erros = 0;
  for (const a of lista) { const r = await reenviarDrive(u, a, a.id); if (r.drive_status === "enviado") enviados++; else erros++; }
  return res.json({ ok: true, enviados, erros });
}
async function assinaturaSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const titulo = txt(b.titulo, 150), prazo = dataIso(b.prazo);
  if (!titulo || !prazo) return res.status(400).json({ code: "campos", msg: "Preencha título e prazo." });
  const nome = txt(b.arquivo?.nome, 150);
  const { buf, erro } = decodificar(b.arquivo?.b64, nome);
  if (erro) return res.status(400).json({ code: erro });
  const g = await guardar(`administrativo/assinaturas/${novoId()}-${nomeSeguro(nome)}`, buf, nome);
  const id = novoId();
  const a = { titulo, prazo, obs: txt(b.obs, 2000), original: { chave: g.chave, nome, tamanho: g.tamanho, em: agora(), por: quem(u) },
    assinado: false, drive_status: null, criadoEm: agora(), criadoPor: quem(u) };
  await gravar(M, "assinaturas", id, a);
  await auditar(u, M, "assinatura.criar", id);
  return res.json({ ok: true, assinatura: pubAssinatura({ ...a, id }) });
}
async function assinaturaAssinado(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const a = await ler(M, "assinaturas", b.id);
  if (!a) return res.status(404).json({ code: "nao_encontrado" });
  const ext = extensao(b.arquivo?.nome);
  const { buf, erro } = decodificar(b.arquivo?.b64, b.arquivo?.nome);
  if (erro) return res.status(400).json({ code: erro });
  const hoje = hojeSP();
  const usuario = nomeSeguro(u.login.split("@")[0]).toLowerCase();
  const nomePadrao = `${hoje}_${usuario}_${nomeSeguro(a.titulo)}.${ext}`;   // AAAA-MM-DD_usuario_documento.ext
  const g = await guardar(`administrativo/assinaturas/${novoId()}-${nomePadrao}`, buf, nomePadrao);
  a.assinadoArquivo = { chave: g.chave, nome: nomePadrao, nomeOriginal: txt(b.arquivo.nome, 150), tamanho: g.tamanho, tipo: g.tipo, em: agora(), por: quem(u) };
  a.assinado = true; a.assinadoEm = agora(); a.assinadoPor = quem(u);
  Object.assign(a, { drive_id: "", drive_link: "", drive_nome: "" }, await enviarParaDrive(a, buf));
  await gravar(M, "assinaturas", b.id, a);
  await auditar(u, M, "assinatura.assinado", b.id, { arquivo: nomePadrao });
  return res.json({ ok: true, assinatura: pubAssinatura({ ...a, id: b.id }) });
}
async function assinaturaArquivo(u, req, res) {
  const a = await ler(M, "assinaturas", String(req.query.id || ""));
  const f = a && (req.query.qual === "assinado" ? a.assinadoArquivo : a.original);
  if (!f) return res.status(404).json({ code: "sem_arquivo" });
  return enviar(res, f.chave, f.nome, false);
}
async function assinaturaExcluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  if (!(await ler(M, "assinaturas", id))) return res.status(404).json({ code: "nao_encontrado" });
  await apagar(M, "assinaturas", id);
  await auditar(u, M, "assinatura.excluir", id);
  return res.json({ ok: true });
}

// ---------- Pessoal (com auditoria de consulta e alteração) ----------
async function pessoal(u, req, res) {
  const ano = parseInt(req.query.ano, 10) || Number(hojeSP().slice(0, 4));
  const lista = (await listar(M, "pessoal")).map(p => ({ ...p, decimo: decimoTerceiro(p, ano) }))
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || "", "pt-BR"));
  const clt = lista.filter(p => p.decimo.aplica);
  const soma = k => Math.round(clt.reduce((s, p) => s + p.decimo[k], 0) * 100) / 100;
  await auditar(u, M, "pessoal.consultar", null, { ano, registros: lista.length });
  return res.json({ pessoas: lista, ano, totais: { pessoasClt: clt.length, decimo: soma("valor"), parcela1: soma("parcela1"), parcela2: soma("parcela2") } });
}
async function pessoaSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const atual = b.id ? await ler(M, "pessoal", b.id) : null;
  if (b.id && !atual) return res.status(404).json({ code: "nao_encontrado" });
  const tipo = b.tipo === "PJ" ? "PJ" : b.tipo === "CLT" ? "CLT" : "";
  const p = { ...(atual || { criadoEm: agora(), criadoPor: quem(u) }),
    nome: txt(b.nome, 150), entrada: dataIso(b.entrada), tipo, cargo: txt(b.cargo, 100),
    salario: tipo === "CLT" ? num(b.salario) : null, saida: dataIso(b.saida), atualizadoEm: agora(), atualizadoPor: quem(u) };
  if (!p.nome || !p.entrada || !tipo) return res.status(400).json({ code: "campos", msg: "Preencha nome, entrada e tipo de contrato." });
  if (tipo === "CLT" && (p.salario == null || p.salario < 0)) return res.status(400).json({ code: "campos", msg: "Informe o salário (CLT)." });
  if (p.saida && p.saida < p.entrada) return res.status(400).json({ code: "campos", msg: "A saída não pode ser antes da entrada." });
  const id = b.id || novoId();
  await gravar(M, "pessoal", id, p);
  const mudou = atual ? Object.keys(p).filter(k => !/^(atualizado|criado)/.test(k) && JSON.stringify(p[k]) !== JSON.stringify(atual[k])) : ["novo"];
  await auditar(u, M, atual ? "pessoal.alterar" : "pessoal.criar", id, { nome: p.nome, campos: mudou });
  return res.json({ ok: true, pessoa: { ...p, id, decimo: decimoTerceiro(p, Number(hojeSP().slice(0, 4))) } });
}
async function pessoaExcluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const p = await ler(M, "pessoal", id);
  if (!p) return res.status(404).json({ code: "nao_encontrado" });
  await apagar(M, "pessoal", id);
  await auditar(u, M, "pessoal.excluir", id, { nome: p.nome });
  return res.json({ ok: true });
}
async function auditoria(u, req, res) {
  const r = await sql`SELECT at, login, acao, alvo, detalhe FROM auditoria WHERE modulo = ${M} AND acao LIKE 'pessoal.%' ORDER BY at DESC LIMIT 200`;
  return res.json({ registros: r });
}

// ---------- Férias (só CLT; só a gestão lança) ----------
async function feriasProximas() {
  const hoje = hojeSP();
  const pessoas = Object.fromEntries((await listar(M, "pessoal")).map(p => [p.id, p]));
  return (await listar(M, "ferias")).filter(f => f.fim >= hoje)
    .map(f => ({ ...f, nome: pessoas[f.pessoaId]?.nome || f.nome || "?" }))
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}
async function ferias(u, req, res) {
  const pessoas = (await listar(M, "pessoal")).filter(p => p.tipo === "CLT" && (!p.saida || p.saida >= hojeSP()))
    .map(p => ({ id: p.id, nome: p.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return res.json({ ferias: await feriasProximas(), pessoas, hoje: hojeSP() });
}
async function feriasSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehGestao(u)) return res.status(403).json({ code: "sem_acesso" });
  const b = corpo(req);
  const p = await ler(M, "pessoal", b.pessoaId);
  if (!p) return res.status(400).json({ code: "pessoa", msg: "Escolha a pessoa." });
  if (p.tipo !== "CLT") return res.status(400).json({ code: "so_clt", msg: "Férias só para contratos CLT." });
  const inicio = dataIso(b.inicio), fim = dataIso(b.fim);
  if (!inicio || !fim || fim < inicio) return res.status(400).json({ code: "datas", msg: "Confira as datas de início e fim." });
  if (fim < hojeSP()) return res.status(400).json({ code: "datas", msg: "Lance só férias de hoje em diante." });
  const id = b.id && (await ler(M, "ferias", b.id)) ? b.id : novoId();
  const f = { pessoaId: b.pessoaId, nome: p.nome, inicio, fim, obs: txt(b.obs, 1000), criadoEm: agora(), criadoPor: quem(u) };
  await gravar(M, "ferias", id, f);
  await auditar(u, M, "ferias.lancar", id, { pessoa: p.nome });
  return res.json({ ok: true, ferias: { ...f, id } });
}
async function feriasExcluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  if (!(await ler(M, "ferias", id))) return res.status(404).json({ code: "nao_encontrado" });
  await apagar(M, "ferias", id);
  await auditar(u, M, "ferias.excluir", id);
  return res.json({ ok: true });
}
// Link secreto do calendário .ics (para assinar no Google Agenda). Só a gestão vê e pode trocar o link.
async function tokenIcs(novo) {
  const atual = await ler(M, "config", "ics");
  if (atual && atual.token && !novo) return atual.token;
  const token = crypto.randomBytes(24).toString("base64url");
  await gravar(M, "config", "ics", { token, criadoEm: agora() });
  return token;
}
async function icsLink(u, req, res) {
  const token = await tokenIcs(req.method === "POST" && corpo(req).novo === true);
  if (req.method === "POST") await auditar(u, M, "ferias.ics_novo_link", null);
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return res.json({ base: `https://${host}/api/m?r=adm/ferias.ics&t=${token}` });
}
const icsTexto = s => String(s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\r?\n/g, "\\n");
async function feriasIcs(req, res) {
  const t = String(req.query.t || "");
  const cfg = await ler(M, "config", "ics");
  const ok = cfg && cfg.token && t.length === cfg.token.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(cfg.token));
  if (!ok) return res.status(403).json({ code: "sem_acesso" });
  const pessoa = String(req.query.p || "");
  const lista = (await feriasProximas()).filter(f => !pessoa || f.pessoaId === pessoa);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Quinze//Central Quinze//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:Férias - Quinze", "X-WR-TIMEZONE:America/Sao_Paulo"];
  for (const f of lista) {
    linhas.push("BEGIN:VEVENT", `UID:ferias-${f.id}@quinze-central`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${f.inicio.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${somarDias(f.fim, 1).replace(/-/g, "")}`,
      `SUMMARY:${icsTexto("Férias - " + f.nome)}`, ...(f.obs ? [`DESCRIPTION:${icsTexto(f.obs)}`] : []), "TRANSP:TRANSPARENT", "END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  res.setHeader("content-type", "text/calendar; charset=utf-8");
  res.setHeader("content-disposition", `inline; filename="ferias-quinze.ics"`);
  res.setHeader("cache-control", "private, max-age=300");
  res.statusCode = 200;
  return res.end(linhas.join("\r\n") + "\r\n");
}

// Toda rota daqui exige gestão (o módulo já é só mestre/gestão; conferido de novo por segurança).
const gestao = fn => (u, req, res) => (ehGestao(u) ? fn(u, req, res) : res.status(403).json({ code: "sem_acesso" }));
export const rotas = Object.fromEntries(Object.entries({
  contratos, "contrato.salvar": contratoSalvar, "contrato.excluir": contratoExcluir, "contrato.arquivo": contratoArquivo,
  "contrato.reajustar": contratoReajustar, "contrato.renovar": contratoRenovar, igpm,
  "contratos.importar": contratosImportar, "contrato.conferir": contratoConferir,
  assinaturas, "assinatura.salvar": assinaturaSalvar, "assinatura.assinado": assinaturaAssinado,
  "assinatura.arquivo": assinaturaArquivo, "assinatura.excluir": assinaturaExcluir,
  "assinatura.drive": assinaturaDrive, "assinatura.drive_lote": assinaturaDriveLote,
  pessoal, "pessoa.salvar": pessoaSalvar, "pessoa.excluir": pessoaExcluir, auditoria,
  ferias, "ferias.salvar": feriasSalvar, "ferias.excluir": feriasExcluir, "ics.link": icsLink,
}).map(([k, f]) => [k, gestao(f)]));
export const publicas = { "ferias.ics": feriasIcs };
