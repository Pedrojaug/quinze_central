// 02 Aprovação de peças: Envio, Fila de aprovação e Dashboard mensal.
// Dados em m/pecas/<colecao>/<id>, servidos só por aqui (fora da sincronização geral). Permissões sempre conferidas aqui:
//   enviar e reenviar: diretor de arte, social media ou quem tem a permissão extra pode_enviar_pecas (vê só as suas peças)
//   decidir e ver todas: coordenador, mestre e gestão
//   dashboard: mestre, gestão e atendimento (atendimento não vê as peças)
// Arquivos: o navegador envia direto ao Vercel Blob com um token do servidor; ficam 7 dias e são apagados pela rotina diária.
// Os contadores mensais (m/pecas/contadores/<AAAA-MM>) são atualizados a cada envio e decisão e nunca são apagados.
import crypto from "node:crypto";
import { sql } from "./_lib.js";
import { perfilDe, podeEnviarPecas } from "./_modules.js";
import { listar, ler, gravar, apagar, novoId, clientesCarteira, txt } from "./_mdados.js";
import { tokenEnvioDireto, infoArquivo, apagarArquivos, listarArquivos, linkTemporario, enviar, nomeSeguro, extensao } from "./_arquivos.js";
import { hojeSP } from "./_adm.js";

const M = "pecas";
export const RETENCAO_DIAS = 7;
export const MAX_ARQUIVOS = 10, MAX_LINKS = 10;
export const MAX_BYTES = 100 * 1024 * 1024;   // por arquivo (envio direto ao armazenamento, sem passar pela função)
const TIPOS = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
export const STATUS = { pendente: "Pendente", aprovada: "Aprovada", reprovada: "Reprovada", alteracao_solicitada: "Alteração solicitada" };
const DECISOES = ["aprovada", "reprovada", "alteracao_solicitada"];
const DIA = 864e5;

const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const mesAtual = () => hojeSP().slice(0, 7);

// ---------- Permissões ----------
export const podeEnviar = u => podeEnviarPecas(u);
export const podeDecidir = u => ["coordenador", "mestre", "gestao"].includes(perfilDe(u));
export const veTodas = u => ["coordenador", "mestre", "gestao"].includes(perfilDe(u));
export const veDash = u => ["mestre", "gestao", "atendimento"].includes(perfilDe(u));
const podeVer = (u, p) => veTodas(u) || (podeEnviar(u) && p.remetente?.login === u.login);
const negado = (res, msg) => res.status(403).json({ code: "sem_acesso", msg: msg || "Sem permissão." });
const prefixoDe = u => `pecas/${nomeSeguro(u.login).toLowerCase()}/`;

// ---------- Contadores mensais (atualizados no momento de cada evento, numa só instrução: sem perder contagem) ----------
async function contar(mes, inc, nomes) {
  const path = `m/${M}/contadores/${mes}`;
  await sql`INSERT INTO docs (path, parent, id, data) VALUES (${path}, ${`m/${M}/contadores`}, ${mes}, '{}'::jsonb) ON CONFLICT (path) DO NOTHING`;
  await sql`UPDATE docs SET
      data = docs.data
        || (SELECT coalesce(jsonb_object_agg(e.key, coalesce((docs.data->>e.key)::int, 0) + e.value::int), '{}'::jsonb) FROM jsonb_each_text(${JSON.stringify(inc)}::jsonb) e)
        || jsonb_build_object('nomes', coalesce(docs.data->'nomes', '{}'::jsonb) || ${JSON.stringify(nomes || {})}::jsonb),
      deleted = false, updated_at = now(), seq = nextval('docs_seq')
    WHERE path = ${path}`;
}
export function resumoContadores(c) {
  c = c || {};
  const nomes = c.nomes || {};
  const porUsuario = {}, porCoord = {};
  for (const [k, v] of Object.entries(c)) {
    let m;
    if ((m = /^enviadas:(.+)$/.exec(k))) (porUsuario[m[1]] ||= { pecas: 0, versoes: 0 }).pecas = v;
    else if ((m = /^versoes:(.+)$/.exec(k))) (porUsuario[m[1]] ||= { pecas: 0, versoes: 0 }).versoes = v;
    else if ((m = /^dec:(.+):(aprovada|reprovada|alteracao_solicitada)$/.exec(k))) (porCoord[m[1]] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 })[m[2]] = v;
  }
  const enviadas = Object.entries(porUsuario).map(([login, x]) => ({ login, nome: nomes[login] || login, ...x })).sort((a, b) => b.pecas - a.pecas || b.versoes - a.versoes);
  const decisoes = Object.entries(porCoord).map(([login, x]) => ({ login, nome: nomes[login] || login, ...x, total: x.aprovada + x.reprovada + x.alteracao_solicitada })).sort((a, b) => b.total - a.total);
  const v1d = c.v1_decididas || 0, v1a = c.v1_aprovadas || 0;
  return { enviadas, decisoes, totais: { pecas: c.pecas || 0, versoes: c.versoes || 0, aprovada: c.aprovada || 0, reprovada: c.reprovada || 0, alteracao_solicitada: c.alteracao_solicitada || 0,
    primeiraDecididas: v1d, primeiraAprovadas: v1a, taxaPrimeira: v1d ? Math.round(v1a / v1d * 1000) / 10 : null } };
}

// ---------- Peça vista pela página (sem as chaves internas dos arquivos) ----------
function publica(p, u) {
  const expira = v => new Date(Date.parse(v.enviadaEm) + RETENCAO_DIAS * DIA).toISOString();
  return { id: p.id, titulo: p.titulo, clienteId: p.clienteId, clienteNome: p.clienteNome, remetente: p.remetente, status: p.status, versao: p.versao,
    criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm, minha: p.remetente?.login === u.login,
    versoes: p.versoes.map(v => ({ n: v.n, enviadaEm: v.enviadaEm, expiraEm: expira(v), obs: v.obs, links: v.links,
      arquivos: v.arquivos.map((a, i) => ({ i, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, expirado: !!a.expirado })) })),
    historico: p.historico };
}

// ---------- Validação de arquivos e links enviados ----------
async function conferirArquivos(u, lista) {
  const arr = Array.isArray(lista) ? lista : [];
  if (arr.length > MAX_ARQUIVOS) return { erro: `No máximo ${MAX_ARQUIVOS} arquivos por peça.` };
  const out = [], pre = prefixoDe(u);
  for (const a of arr) {
    const chave = String(a?.chave || "");
    if (!chave.startsWith(pre) || chave.includes("..") || !/^[A-Za-z0-9._\/-]{1,300}$/.test(chave) || !TIPOS[extensao(chave)]) return { erro: "Arquivo inválido. Envie de novo." };
    const info = await infoArquivo(chave);
    if (!info) return { erro: `O arquivo "${txt(a?.nome, 80)}" não chegou ao armazenamento. Envie de novo.` };
    out.push({ chave, nome: txt(a?.nome, 160) || chave.split("/").pop(), tipo: TIPOS[extensao(chave)], tamanho: info.tamanho });
  }
  return { arquivos: out };
}
function conferirLinks(lista) {
  const arr = (Array.isArray(lista) ? lista : []).map(l => txt(l, 600)).filter(Boolean);
  if (arr.length > MAX_LINKS) return { erro: `No máximo ${MAX_LINKS} links.` };
  for (const l of arr) {
    let url; try { url = new URL(l); } catch { return { erro: `Link inválido: ${l.slice(0, 80)}` }; }
    if (url.protocol !== "https:" || !/(^|\.)(drive|docs)\.google\.com$/.test(url.hostname)) return { erro: "Use links do Google Drive (https://drive.google.com/...)." };
  }
  return { links: arr };
}

// ---------- Rotas ----------
async function inicio(u, req, res) {
  return res.json({ podeEnviar: podeEnviar(u), podeDecidir: podeDecidir(u), veTodas: veTodas(u), veDash: veDash(u), login: u.login,
    clientes: podeEnviar(u) ? await clientesCarteira() : [], maxArquivos: MAX_ARQUIVOS, maxLinks: MAX_LINKS, maxMB: MAX_BYTES / 1048576,
    retencaoDias: RETENCAO_DIAS, status: STATUS, mes: mesAtual() });
}

// Token para o navegador enviar UM arquivo direto ao armazenamento.
async function uploadToken(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u)) return negado(res, "Seu usuário não envia peças.");
  const b = corpo(req);
  const nome = txt(b.nome, 160), ext = extensao(nome), tamanho = Number(b.tamanho);
  if (!TIPOS[ext]) return res.status(400).json({ code: "tipo_invalido", msg: "Envie JPG, PNG ou PDF." });
  if (!(tamanho > 0)) return res.status(400).json({ code: "arquivo_vazio", msg: "O arquivo está vazio." });
  if (tamanho > MAX_BYTES) return res.status(400).json({ code: "arquivo_grande", msg: `O arquivo passa de ${MAX_BYTES / 1048576} MB.` });
  const dia = hojeSP().replace(/-/g, "");
  const chave = `${prefixoDe(u)}${dia}-${crypto.randomBytes(6).toString("hex")}/${nomeSeguro(nome).replace(/\.[^.]*$/, "")}.${ext}`;
  const envio = await tokenEnvioDireto(chave, { tipos: [TIPOS[ext]], maxBytes: MAX_BYTES });
  return res.json({ chave, tipo: TIPOS[ext], ...envio });
}

async function pecaEnviar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u)) return negado(res, "Seu usuário não envia peças.");
  const b = corpo(req);
  const titulo = txt(b.titulo, 160), obs = txt(b.obs, 2000);
  if (!titulo) return res.status(400).json({ code: "titulo", msg: "Informe o título da peça." });
  const cli = (await clientesCarteira()).find(c => c.id === b.clienteId);
  if (!cli) return res.status(400).json({ code: "cliente", msg: "Escolha o cliente da Carteira." });
  const a = await conferirArquivos(u, b.arquivos); if (a.erro) return res.status(400).json({ code: "arquivos", msg: a.erro });
  const l = conferirLinks(b.links); if (l.erro) return res.status(400).json({ code: "links", msg: l.erro });
  if (!a.arquivos.length && !l.links.length) return res.status(400).json({ code: "vazio", msg: "Anexe pelo menos um arquivo ou um link do Drive." });
  const em = agora(), id = novoId();
  const p = { titulo, clienteId: cli.id, clienteNome: cli.nome, remetente: quem(u), status: "pendente", versao: 1,
    versoes: [{ n: 1, enviadaEm: em, obs, arquivos: a.arquivos, links: l.links }],
    historico: [{ tipo: "envio", versao: 1, em, por: quem(u), comentario: obs }], criadoEm: em, atualizadoEm: em };
  await gravar(M, "pecas", id, p);
  await contar(mesAtual(), { pecas: 1, versoes: 1, [`enviadas:${u.login}`]: 1, [`versoes:${u.login}`]: 1 }, { [u.login]: u.nome || u.login });
  return res.json({ ok: true, peca: publica({ ...p, id }, u) });
}

async function pecaReenviar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u)) return negado(res, "Seu usuário não envia peças.");
  const b = corpo(req);
  const p = await ler(M, "pecas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado", msg: "Peça não encontrada (pode ter expirado)." });
  if (p.remetente?.login !== u.login) return negado(res, "Só quem enviou a peça pode reenviar.");
  if (!["reprovada", "alteracao_solicitada"].includes(p.status)) return res.status(409).json({ code: "status", msg: "Só dá para reenviar peças reprovadas ou com alteração solicitada." });
  const obs = txt(b.obs, 2000);
  const a = await conferirArquivos(u, b.arquivos); if (a.erro) return res.status(400).json({ code: "arquivos", msg: a.erro });
  const l = conferirLinks(b.links); if (l.erro) return res.status(400).json({ code: "links", msg: l.erro });
  if (!a.arquivos.length && !l.links.length) return res.status(400).json({ code: "vazio", msg: "Anexe pelo menos um arquivo ou um link do Drive." });
  const em = agora(), n = p.versao + 1;
  p.versoes.push({ n, enviadaEm: em, obs, arquivos: a.arquivos, links: l.links });
  p.historico.push({ tipo: "reenvio", versao: n, em, por: quem(u), comentario: obs });
  Object.assign(p, { versao: n, status: "pendente", atualizadoEm: em });
  await gravar(M, "pecas", p.id, p);
  await contar(mesAtual(), { versoes: 1, [`versoes:${u.login}`]: 1 }, { [u.login]: u.nome || u.login });
  return res.json({ ok: true, peca: publica(p, u) });
}

async function pecaDecidir(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeDecidir(u)) return negado(res, "Só coordenador, Mestre ou gestão aprovam, reprovam ou pedem alteração.");
  const b = corpo(req);
  const decisao = String(b.decisao || ""), comentario = txt(b.comentario, 3000);
  if (!DECISOES.includes(decisao)) return res.status(400).json({ code: "decisao", msg: "Decisão inválida." });
  if (decisao !== "aprovada" && !comentario) return res.status(400).json({ code: "comentario", msg: "Escreva um comentário para reprovar ou pedir alteração." });
  const p = await ler(M, "pecas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado", msg: "Peça não encontrada (pode ter expirado)." });
  if (p.remetente?.login === u.login) return negado(res, "Você não pode decidir uma peça que você mesmo enviou.");
  if (p.status !== "pendente") return res.status(409).json({ code: "status", msg: "Esta peça já foi decidida." });
  const em = agora();
  p.historico.push({ tipo: decisao, versao: p.versao, em, por: quem(u), comentario });
  Object.assign(p, { status: decisao, atualizadoEm: em, decididoEm: em, decididoPor: quem(u) });
  await gravar(M, "pecas", p.id, p);
  const inc = { [decisao]: 1, [`dec:${u.login}:${decisao}`]: 1 };
  if (p.versao === 1) { inc.v1_decididas = 1; if (decisao === "aprovada") inc.v1_aprovadas = 1; }
  await contar(mesAtual(), inc, { [u.login]: u.nome || u.login });
  return res.json({ ok: true, peca: publica(p, u) });
}

async function pecas(u, req, res) {
  if (!veTodas(u) && !podeEnviar(u)) return negado(res);
  const lista = (await listar(M, "pecas")).filter(p => podeVer(u, p))
    .sort((a, b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""));
  return res.json({ pecas: lista.map(p => publica(p, u)) });
}

// Visualização de um arquivo: confere a permissão e manda para um link temporário (ou envia o arquivo, no teste local).
async function pecaArquivo(u, req, res) {
  const q = req.query;
  const p = await ler(M, "pecas", String(q.id || ""));
  if (!p || !podeVer(u, p)) return res.status(p ? 403 : 404).json({ code: p ? "sem_acesso" : "nao_encontrado" });
  const v = p.versoes.find(x => x.n === Number(q.v));
  const a = v && v.arquivos[Number(q.i)];
  if (!a) return res.status(404).json({ code: "nao_encontrado" });
  if (a.expirado) return res.status(410).json({ code: "expirado", msg: "Arquivo expirado." });
  let url = null;
  try { url = await linkTemporario(a.chave); } catch (e) { console.error("[pecas] link temporário:", String(e?.message || e).slice(0, 120)); }
  if (url) { res.statusCode = 302; res.setHeader("location", url); res.setHeader("cache-control", "private, no-store"); return res.end(); }
  return enviar(res, a.chave, a.nome, true);
}

async function dashboard(u, req, res) {
  if (!veDash(u)) return negado(res, "O dashboard é do Mestre, da gestão e do atendimento.");
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.mes || "")) ? req.query.mes : mesAtual();
  const c = await ler(M, "contadores", mes);
  const meses = (await sql`SELECT id FROM docs WHERE parent = ${`m/${M}/contadores`} AND NOT deleted ORDER BY id DESC`).map(r => r.id);
  return res.json({ mes, meses: [...new Set([mesAtual(), ...meses])].sort().reverse(), ...resumoContadores(c) });
}

// ---------- Retenção: arquivos com mais de 7 dias são apagados; peças sem envio há mais de 7 dias saem da fila ----------
export async function limparVencidos(agoraMs = Date.now()) {
  const limite = agoraMs - RETENCAO_DIAS * DIA, em = new Date(agoraMs).toISOString();
  const out = { arquivosApagados: 0, pecasExpiradas: 0, pecasRemovidas: 0, orfaosApagados: 0 };
  const emUso = new Set();
  for (const p of await listar(M, "pecas")) {
    const vencidos = [];
    for (const v of p.versoes) {
      const venceu = Date.parse(v.enviadaEm) < limite;
      for (const a of v.arquivos) {
        if (a.expirado) continue;
        if (venceu) { vencidos.push(a.chave); a.expirado = true; a.expiradoEm = em; } else emUso.add(a.chave);
      }
    }
    if (vencidos.length) { await apagarArquivos(vencidos); out.arquivosApagados += vencidos.length; out.pecasExpiradas++; }
    if (Date.parse(p.versoes[p.versoes.length - 1].enviadaEm) < limite) { await apagar(M, "pecas", p.id); out.pecasRemovidas++; }
    else if (vencidos.length) await gravar(M, "pecas", p.id, p);
  }
  // Arquivos enviados mas nunca ligados a uma peça (envio abandonado), também com mais de 7 dias.
  const orfaos = (await listarArquivos("pecas/")).filter(f => !emUso.has(f.chave) && Date.parse(f.enviadoEm) < limite).map(f => f.chave);
  if (orfaos.length) { await apagarArquivos(orfaos); out.orfaosApagados = orfaos.length; }
  return out;
}
async function limpezaExecutar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!["mestre", "gestao"].includes(perfilDe(u))) return negado(res);
  return res.json({ ok: true, ...(await limparVencidos()) });
}
// Rotina diária (Vercel Cron), protegida pelo CRON_SECRET que a Vercel envia no cabeçalho Authorization.
async function pecasCron(req, res) {
  const segredo = process.env.CRON_SECRET || "";
  const veio = String(req.headers.authorization || "");
  const ok = segredo && veio.length === `Bearer ${segredo}`.length && crypto.timingSafeEqual(Buffer.from(veio), Buffer.from(`Bearer ${segredo}`));
  if (!ok) return res.status(401).json({ code: "unauthorized" });
  return res.json({ ok: true, ...(await limparVencidos()) });
}

export const rotas = {
  inicio, "upload.token": uploadToken, "peca.enviar": pecaEnviar, "peca.reenviar": pecaReenviar, "peca.decidir": pecaDecidir,
  pecas, "peca.arquivo": pecaArquivo, dashboard, "limpeza.executar": limpezaExecutar,
};
export const publicas = { "pecas.cron": pecasCron };
