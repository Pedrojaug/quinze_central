// 06 Financeiro (só mestre e gestão): contas a receber, contas a pagar, fluxo de caixa e dashboard.
// Lançamentos manuais em m/financeiro/lancamentos/<id>; configuração em m/financeiro/config/geral.
// Servidos só por aqui (nunca pela sincronização geral). Criação, alteração e exclusão vão para a auditoria
// (sem valores). Nada de dado financeiro no console.
import { sql, ehGestao } from "./_lib.js";
import { listar, ler, gravar, apagar, auditar, novoId, clientesCarteira, txt, dataIso, num } from "./_mdados.js";
import { hojeSP, somarMeses } from "./_adm.js";
import { pdfDashboard, pdfFluxo } from "./_finpdf.js";

const M = "financeiro";
const CATEGORIAS = {
  receber: ["Fee mensal", "Job", "Produção", "Outros"],
  pagar: ["Salários", "Fornecedores", "Impostos", "Aluguel", "Software", "Marketing", "Outros"],
};
const FORMAS = ["Pix", "Boleto", "Transferência", "Cartão", "Dinheiro", "Outro"];
const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const mesOk = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const somarMes = (mes, n) => somarMeses(mes + "-01", n).slice(0, 7);

// ---------- Configuração ----------
async function config() {
  const c = (await ler(M, "config", "geral")) || {};
  return { categorias: { receber: c.categorias?.receber?.length ? c.categorias.receber : CATEGORIAS.receber,
    pagar: c.categorias?.pagar?.length ? c.categorias.pagar : CATEGORIAS.pagar },
    saldoInicial: Number(c.saldoInicial) || 0, saldoInicialData: c.saldoInicialData || "" };
}

// ---------- Lançamentos ----------
// status gravado: aberto | pago | cancelado. "atrasado" é calculado: aberto com vencimento antes de hoje.
export const statusEfetivo = (l, hoje = hojeSP()) => (l.status === "aberto" && l.vencimento && l.vencimento < hoje ? "atrasado" : l.status);
const comStatus = (l, hoje) => ({ ...l, statusEfetivo: statusEfetivo(l, hoje) });
async function todos() { const hoje = hojeSP(); return (await listar(M, "lancamentos")).map(l => comStatus(l, hoje)); }

async function lancamentos(u, req, res) {
  const tipo = req.query.tipo === "pagar" ? "pagar" : "receber";
  const lista = (await todos()).filter(l => l.tipo === tipo).sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || ""));
  const cfg = await config();
  const fornecedores = [...new Set((await listar(M, "lancamentos")).filter(l => l.tipo === "pagar" && l.fornecedor).map(l => l.fornecedor))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return res.json({ tipo, lancamentos: lista, categorias: cfg.categorias[tipo], formas: FORMAS, hoje: hojeSP(),
    clientes: tipo === "receber" ? await clientesCarteira() : [], fornecedores });
}
function validar(b, tipo, clientes) {
  const l = {
    tipo, descricao: txt(b.descricao, 200), categoria: txt(b.categoria, 60), valor: r2(num(b.valor)),
    vencimento: dataIso(b.vencimento), competencia: mesOk(b.competencia) ? b.competencia : "", forma: FORMAS.includes(b.forma) ? b.forma : "",
    obs: txt(b.obs, 2000),
  };
  if (tipo === "receber") {
    const c = clientes.find(x => x.id === b.clienteId);
    l.clienteId = c ? c.id : ""; l.clienteNome = c ? c.nome : txt(b.clienteNome, 150);
    if (!l.clienteNome) return { erro: "Escolha o cliente." };
  } else {
    l.fornecedor = txt(b.fornecedor, 150);
    if (!l.fornecedor) return { erro: "Informe o fornecedor." };
  }
  if (!l.descricao || !l.categoria || !(num(b.valor) > 0) || !l.vencimento || !l.competencia) return { erro: "Preencha descrição, categoria, valor, vencimento e competência." };
  return { l };
}
async function salvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const tipo = b.tipo === "pagar" ? "pagar" : "receber";
  const atual = b.id ? await ler(M, "lancamentos", b.id) : null;
  if (b.id && !atual) return res.status(404).json({ code: "nao_encontrado" });
  const { l, erro } = validar(b, atual ? atual.tipo : tipo, await clientesCarteira());
  if (erro) return res.status(400).json({ code: "campos", msg: erro });
  if (atual) {
    const novo = { ...atual, ...l, tipo: atual.tipo, atualizadoEm: agora(), atualizadoPor: quem(u) };
    await gravar(M, "lancamentos", b.id, novo);
    const campos = Object.keys(l).filter(k => JSON.stringify(l[k]) !== JSON.stringify(atual[k]));
    await auditar(u, M, "lancamento.alterar", b.id, { tipo: atual.tipo, campos });
    return res.json({ ok: true, lancamentos: [comStatus({ ...novo, id: b.id })] });
  }
  const n = Math.max(1, Math.min(60, parseInt(b.repetir, 10) || 1));
  const grupo = n > 1 ? novoId() : "";
  const criados = [];
  for (let i = 0; i < n; i++) {
    const item = { ...l, competencia: somarMes(l.competencia, i), vencimento: somarMeses(l.vencimento, i),
      descricao: n > 1 ? `${l.descricao} (${i + 1}/${n})` : l.descricao, status: "aberto", dataPagamento: "",
      grupo, parcela: n > 1 ? `${i + 1}/${n}` : "", criadoEm: agora(), criadoPor: quem(u) };
    const id = novoId();
    await gravar(M, "lancamentos", id, item);
    await auditar(u, M, "lancamento.criar", id, { tipo: l.tipo, recorrencia: n > 1 ? `${i + 1}/${n}` : undefined });
    criados.push(comStatus({ ...item, id }));
  }
  return res.json({ ok: true, lancamentos: criados });
}
async function mudarStatus(u, req, res, acao) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const l = await ler(M, "lancamentos", b.id);
  if (!l) return res.status(404).json({ code: "nao_encontrado" });
  if (acao === "pagar") {
    if (l.status === "cancelado") return res.status(409).json({ code: "cancelado", msg: "Lançamento cancelado não pode ser pago." });
    l.status = "pago"; l.dataPagamento = dataIso(b.dataPagamento) || hojeSP();
  } else if (acao === "reabrir") { l.status = "aberto"; l.dataPagamento = ""; }
  else if (acao === "cancelar") { l.status = "cancelado"; l.dataPagamento = ""; }
  l.atualizadoEm = agora(); l.atualizadoPor = quem(u);
  await gravar(M, "lancamentos", b.id, l);
  await auditar(u, M, "lancamento." + acao, b.id, { tipo: l.tipo });
  return res.json({ ok: true, lancamento: comStatus({ ...l, id: b.id }) });
}
async function excluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const { id } = corpo(req);
  const l = await ler(M, "lancamentos", id);
  if (!l) return res.status(404).json({ code: "nao_encontrado" });
  await apagar(M, "lancamentos", id);
  await auditar(u, M, "lancamento.excluir", id, { tipo: l.tipo, descricao: l.descricao });
  return res.json({ ok: true });
}
async function categorias(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const tipo = b.tipo === "pagar" ? "pagar" : "receber";
  const lista = [...new Set((Array.isArray(b.lista) ? b.lista : []).map(x => txt(x, 60)).filter(Boolean))].slice(0, 40);
  if (!lista.length) return res.status(400).json({ code: "campos", msg: "Informe ao menos uma categoria." });
  const c = (await ler(M, "config", "geral")) || {};
  c.categorias = { ...(c.categorias || {}), [tipo]: lista };
  await gravar(M, "config", "geral", c);
  await auditar(u, M, "config.categorias", tipo);
  return res.json({ ok: true, categorias: lista });
}
async function saldoInicial(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const v = num(b.saldoInicial);
  if (v == null) return res.status(400).json({ code: "campos", msg: "Informe o saldo inicial." });
  const c = (await ler(M, "config", "geral")) || {};
  c.saldoInicial = r2(v); c.saldoInicialData = dataIso(b.data) || "";
  await gravar(M, "config", "geral", c);
  await auditar(u, M, "config.saldo_inicial", null);
  return res.json({ ok: true, saldoInicial: c.saldoInicial, saldoInicialData: c.saldoInicialData });
}
async function auditoria(u, req, res) {
  const r = await sql`SELECT at, login, acao, alvo, detalhe FROM auditoria WHERE modulo = ${M} ORDER BY at DESC LIMIT 200`;
  return res.json({ registros: r });
}

// ---------- Filtro de competência (comum ao fluxo, ao dashboard e ao PDF) ----------
const filtroComp = q => ({ compDe: mesOk(q.compDe) ? q.compDe : "", compAte: mesOk(q.compAte) ? q.compAte : "" });
const naComp = (l, f) => (!f.compDe || l.competencia >= f.compDe) && (!f.compAte || l.competencia <= f.compAte);

// ---------- Fluxo de caixa (regime de caixa: data de pagamento) ----------
// Realizado: lançamentos pagos, pela data de pagamento. Previsão: lançamentos em aberto, pelo vencimento
// (os atrasados entram como previstos para hoje). Saldo = saldo inicial + entradas - saídas.
export async function calcularFluxo(q) {
  const hoje = hojeSP();
  const cfg = await config();
  const f = filtroComp(q);
  const de = dataIso(q.de) || `${hoje.slice(0, 7)}-01`;
  const ate = dataIso(q.ate) || somarMeses(`${hoje.slice(0, 7)}-01`, 3);
  const agrupar = q.agrupar === "dia" ? "dia" : "mes";
  const chave = d => (agrupar === "dia" ? d : d.slice(0, 7));
  const base = cfg.saldoInicialData || "0000-01-01";
  const itens = (await todos()).filter(l => l.status !== "cancelado" && naComp(l, f));
  const sinal = l => (l.tipo === "receber" ? 1 : -1);
  const pagos = itens.filter(l => l.status === "pago" && l.dataPagamento && l.dataPagamento >= base);
  const abertos = itens.filter(l => l.status === "aberto").map(l => ({ ...l, dataPrevista: l.vencimento < hoje ? hoje : l.vencimento }));
  const saldoAntes = r2(cfg.saldoInicial + pagos.filter(l => l.dataPagamento < de).reduce((s, l) => s + sinal(l) * l.valor, 0));
  const noPeriodo = pagos.filter(l => l.dataPagamento >= de && l.dataPagamento <= ate);
  const previstos = abertos.filter(l => l.dataPrevista >= de && l.dataPrevista <= ate);
  // Realizado até antes do período + realizado no período até hoje = ponto de partida da previsão.
  const mapa = {};
  const b = k => (mapa[k] ||= { chave: k, entradas: 0, saidas: 0, prevEntradas: 0, prevSaidas: 0 });
  noPeriodo.forEach(l => { const x = b(chave(l.dataPagamento)); if (l.tipo === "receber") x.entradas += l.valor; else x.saidas += l.valor; });
  previstos.forEach(l => { const x = b(chave(l.dataPrevista)); if (l.tipo === "receber") x.prevEntradas += l.valor; else x.prevSaidas += l.valor; });
  const buckets = Object.values(mapa).sort((a, c) => a.chave.localeCompare(c.chave));
  let saldo = saldoAntes, prev = saldoAntes;
  for (const x of buckets) {
    x.entradas = r2(x.entradas); x.saidas = r2(x.saidas); x.prevEntradas = r2(x.prevEntradas); x.prevSaidas = r2(x.prevSaidas);
    saldo = r2(saldo + x.entradas - x.saidas);
    prev = r2(prev + x.entradas - x.saidas + x.prevEntradas - x.prevSaidas);
    x.saldo = saldo; x.saldoPrevisto = prev;
  }
  const soma = (l, t) => r2(l.filter(x => x.tipo === t).reduce((s, x) => s + x.valor, 0));
  const totais = { saldoInicialPeriodo: saldoAntes, entradas: soma(noPeriodo, "receber"), saidas: soma(noPeriodo, "pagar"),
    prevEntradas: soma(previstos, "receber"), prevSaidas: soma(previstos, "pagar") };
  totais.saldoFinal = r2(saldoAntes + totais.entradas - totais.saidas);
  totais.saldoFinalPrevisto = r2(totais.saldoFinal + totais.prevEntradas - totais.prevSaidas);
  const resumo = l => ({ id: l.id, tipo: l.tipo, descricao: l.descricao, quem: l.clienteNome || l.fornecedor || "", categoria: l.categoria, valor: l.valor, competencia: l.competencia });
  return { filtro: { de, ate, agrupar, ...f }, hoje, saldoInicial: cfg.saldoInicial, saldoInicialData: cfg.saldoInicialData, buckets, totais,
    realizados: noPeriodo.sort((a, c) => a.dataPagamento.localeCompare(c.dataPagamento)).map(l => ({ ...resumo(l), data: l.dataPagamento })),
    previstos: previstos.sort((a, c) => a.dataPrevista.localeCompare(c.dataPrevista)).map(l => ({ ...resumo(l), data: l.dataPrevista, vencimento: l.vencimento, atrasado: l.vencimento < hoje })) };
}
async function fluxo(u, req, res) { return res.json(await calcularFluxo(req.query)); }

// ---------- Dashboard (regime de competência) ----------
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const mesLabel = m => `${NOMES_MES[+m.slice(5) - 1]}/${m.slice(0, 4)}`;
// Período por competência: mês, trimestre, semestre, ano ou personalizado (compDe..compAte).
export function periodoCompetencia(q, hoje = hojeSP()) {
  const g = ["mes", "trimestre", "semestre", "ano", "personalizado"].includes(q.periodo) ? q.periodo : "mes";
  const ano = /^\d{4}$/.test(String(q.ano || "")) ? Number(q.ano) : Number(hoje.slice(0, 4));
  const tam = { mes: 1, trimestre: 3, semestre: 6, ano: 12 }[g];
  if (g === "personalizado") {
    const de = mesOk(q.compDe) ? q.compDe : hoje.slice(0, 7), ate = mesOk(q.compAte) && q.compAte >= de ? q.compAte : de;
    const n = (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5)) - Number(de.slice(5)) + 1;
    return { periodo: g, de, ate, label: `${mesLabel(de)} a ${mesLabel(ate)}`, anterior: { de: somarMes(de, -n), ate: somarMes(de, -1), label: `${mesLabel(somarMes(de, -n))} a ${mesLabel(somarMes(de, -1))}` } };
  }
  const maxN = 12 / tam;
  const n = Math.min(maxN, Math.max(1, parseInt(q.n, 10) || Math.ceil(Number(hoje.slice(5, 7)) / tam)));
  const de = `${ano}-${String((n - 1) * tam + 1).padStart(2, "0")}`, ate = somarMes(de, tam - 1);
  const nome = (a, k) => (g === "mes" ? mesLabel(`${a}-${String(k).padStart(2, "0")}`) : g === "trimestre" ? `${k}º trimestre de ${a}` : g === "semestre" ? `${k}º semestre de ${a}` : `${a}`);
  const pa = n === 1 ? ano - 1 : ano, pn = n === 1 ? maxN : n - 1;
  const pde = somarMes(de, -tam);
  return { periodo: g, de, ate, label: nome(ano, n), anterior: { de: pde, ate: somarMes(pde, tam - 1), label: nome(pa, pn) } };
}
function totaisComp(itens) {
  const receitas = r2(itens.filter(l => l.tipo === "receber").reduce((s, l) => s + l.valor, 0));
  const despesas = r2(itens.filter(l => l.tipo === "pagar").reduce((s, l) => s + l.valor, 0));
  return { receitas, despesas, resultado: r2(receitas - despesas), quantidade: itens.length };
}
export async function calcularDashboard(q) {
  const hoje = hojeSP();
  const p = periodoCompetencia(q, hoje);
  const todosL = (await todos()).filter(l => l.status !== "cancelado");
  const atual = todosL.filter(l => l.competencia >= p.de && l.competencia <= p.ate);
  const anterior = todosL.filter(l => l.competencia >= p.anterior.de && l.competencia <= p.anterior.ate);
  const t = totaisComp(atual), ta = totaisComp(anterior);
  const vari = (a, b) => (b ? r2((a - b) / Math.abs(b) * 100) : null);
  const meses = [];
  for (let m = p.de; m <= p.ate; m = somarMes(m, 1)) meses.push({ mes: m, label: mesLabel(m), ...totaisComp(atual.filter(l => l.competencia === m)) });
  const agrupa = (lista, k) => Object.entries(lista.reduce((acc, l) => ((acc[l[k] || "—"] = (acc[l[k] || "—"] || 0) + l.valor), acc), {}))
    .map(([nome, valor]) => ({ nome, valor: r2(valor) })).sort((a, b) => b.valor - a.valor);
  const atrasados = atual.filter(l => l.tipo === "receber" && l.statusEfetivo === "atrasado");
  return { periodo: p, hoje, totais: t, anteriorTotais: ta,
    variacao: { receitas: vari(t.receitas, ta.receitas), despesas: vari(t.despesas, ta.despesas), resultado: vari(t.resultado, ta.resultado) },
    meses, despesasPorCategoria: agrupa(atual.filter(l => l.tipo === "pagar"), "categoria"),
    receitasPorCategoria: agrupa(atual.filter(l => l.tipo === "receber"), "categoria"),
    receitaPorCliente: agrupa(atual.filter(l => l.tipo === "receber"), "clienteNome").slice(0, 5),
    inadimplencia: { valor: r2(atrasados.reduce((s, l) => s + l.valor, 0)), quantidade: atrasados.length },
    recebido: r2(atual.filter(l => l.tipo === "receber" && l.status === "pago").reduce((s, l) => s + l.valor, 0)),
    pago: r2(atual.filter(l => l.tipo === "pagar" && l.status === "pago").reduce((s, l) => s + l.valor, 0)),
    lancamentos: atual.sort((a, b) => a.competencia.localeCompare(b.competencia) || a.vencimento.localeCompare(b.vencimento))
      .map(l => ({ id: l.id, tipo: l.tipo, competencia: l.competencia, vencimento: l.vencimento, descricao: l.descricao, quem: l.clienteNome || l.fornecedor || "",
        categoria: l.categoria, valor: l.valor, status: l.statusEfetivo, dataPagamento: l.dataPagamento || "" })) };
}
async function dashboard(u, req, res) { return res.json(await calcularDashboard(req.query)); }

// ---------- PDF ----------
async function pdf(u, req, res) {
  const qual = req.query.qual === "fluxo" ? "fluxo" : "dashboard";
  const dados = qual === "fluxo" ? await calcularFluxo(req.query) : await calcularDashboard(req.query);
  const buf = qual === "fluxo" ? await pdfFluxo(dados, u) : await pdfDashboard(dados, u);
  await auditar(u, M, "relatorio.pdf", qual);
  res.setHeader("content-type", "application/pdf");
  res.setHeader("content-disposition", `attachment; filename="financeiro-${qual}-${hojeSP()}.pdf"`);
  res.setHeader("cache-control", "private, no-store");
  res.statusCode = 200;
  return res.end(buf);
}

const gestao = fn => (u, req, res) => (ehGestao(u) ? fn(u, req, res) : res.status(403).json({ code: "sem_acesso" }));
export const rotas = Object.fromEntries(Object.entries({
  lancamentos, "lancamento.salvar": salvar, "lancamento.pagar": (u, q, r) => mudarStatus(u, q, r, "pagar"),
  "lancamento.reabrir": (u, q, r) => mudarStatus(u, q, r, "reabrir"), "lancamento.cancelar": (u, q, r) => mudarStatus(u, q, r, "cancelar"),
  "lancamento.excluir": excluir, categorias, "saldo.inicial": saldoInicial, auditoria, fluxo, dashboard, pdf,
  config: async (u, req, res) => res.json(await config()),
}).map(([k, f]) => [k, gestao(f)]));
