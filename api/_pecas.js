// 02 Aprovação de peças: Envio, Fila de aprovação e Dashboard mensal.
// Dados em m/pecas/<colecao>/<id>, servidos só por aqui (fora da sincronização geral). Permissões sempre conferidas aqui:
//   enviar e reenviar: todos os usuários ativos (vê só as suas peças)
//   decidir e ver todas: coordenador, mestre e gestão
//   dashboard: mestre, gestão, coordenador e atendimento
// Arquivos: o navegador envia direto ao Vercel Blob com um token do servidor; ficam 7 dias e são apagados pela rotina diária.
// Os metadados da peça (com arquivada: true) e os contadores mensais permanecem para preservar o histórico do dashboard.
import crypto from "node:crypto";
import { sql, conferirSenhaMestre } from "./_lib.js";
import { perfilDe, podeEnviarPecas, ehGestao } from "./_modules.js";
import { listar, ler, gravar, apagar, novoId, clientesCarteira, clientesCarteiraComMes, txt, usuariosAtivos } from "./_mdados.js";
import { tokenEnvioDireto, guardar, infoArquivo, apagarArquivos, linkTemporario, enviar, nomeSeguro } from "./_arquivos.js";
import { hojeSP } from "./_adm.js";
import { DECISOES, diaSP, horaSP, resumoDinamico, resumoPorIntervalo, resumoPorMes, calcularPicosHorario } from "./_pecas_resumo.js";
import { resolverMencoes, mencoesNaoLidasPara, marcarMencoesLidasNaPeca } from "./_pecas_mencoes.js";
import { RETENCAO_DIAS, DIA, processarRetencaoPeca, limparVencidos } from "./_pecas_retencao.js";
import { extrairDriveFileId, inspecionarLinksDrive, baixarImagemDrive } from "./_pecas_drive.js";
import { TIPOS_PECAS, MAX_BYTES_DIRETO, MAX_BYTES_SERVIDOR, extensaoPeca, montarChavePeca, validarUploadBase64 } from "./_pecas_upload.js";
import { ehChaveBanco, guardarBlobNoBanco, infoBlobNoBanco, enviarBlobDoBanco, apagarBlobsDoBanco } from "./_pecas_blobs_db.js";

export { diaSP, horaSP, resumoDinamico, resumoPorIntervalo, resumoPorMes, calcularPicosHorario, RETENCAO_DIAS, processarRetencaoPeca, limparVencidos };

const M = "pecas";
export const MAX_ARQUIVOS = 10, MAX_LINKS = 10;
export const MAX_BYTES = MAX_BYTES_DIRETO;   // por arquivo (envio direto ao armazenamento, sem passar pela função)
export const STATUS = { pendente: "Pendente", aprovada: "Aprovada", reprovada: "Reprovada", alteracao_solicitada: "Alteração solicitada" };

const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const mesAtual = () => hojeSP().slice(0, 7);

// ---------- Permissões ----------
export const podeEnviar = u => podeEnviarPecas(u);
export const podeDecidir = u => ["coordenador", "mestre", "gestao"].includes(perfilDe(u));
export const veTodas = u => {
  if (!u) return false;
  const p = perfilDe(u);
  if (["coordenador", "mestre", "gestao", "atendimento", "social"].includes(p)) return true;
  const abas = u.abas || [];
  return abas.includes("fila") || abas.includes("pecasdash") || (u.areas || []).includes("pecas");
};
export const veDash = u => {
  if (!u) return false;
  const p = perfilDe(u);
  if (["mestre", "gestao", "coordenador", "atendimento", "social"].includes(p)) return true;
  const abas = u.abas || [];
  return abas.includes("pecasdash") || abas.includes("fila") || (u.areas || []).includes("pecas");
};
const podeVer = (u, p) => veTodas(u) || (podeEnviar(u) && p.remetente?.login === u.login) || (p.aprovadores || []).some(a => a.login === u.login);
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

export async function sincronizarContadoresNoBanco(mes, dadosDinamicos) {
  const path = `m/${M}/contadores/${mes}`;
  const t = dadosDinamicos.totais || {};
  const c = {
    pecas: t.pecas || 0,
    versoes: t.versoes || 0,
    aprovada: t.aprovada || 0,
    reprovada: t.reprovada || 0,
    alteracao_solicitada: t.alteracao_solicitada || 0,
    v1_decididas: t.primeiraDecididas || 0,
    v1_aprovadas: t.primeiraAprovadas || 0,
    nomes: {},
  };
  for (const cl of dadosDinamicos.clientes || []) {
    c[`cli_pecas:${cl.id}`] = cl.pecas;
    c[`cli_versoes:${cl.id}`] = cl.versoes;
    c[`cli_dec:${cl.id}:aprovada`] = cl.aprovada;
    c[`cli_dec:${cl.id}:reprovada`] = cl.reprovada;
    c[`cli_dec:${cl.id}:alteracao_solicitada`] = cl.alteracao_solicitada;
    c[`cli_v1_dec:${cl.id}`] = cl.primeiraDecididas;
    c[`cli_v1_apr:${cl.id}`] = cl.primeiraAprovadas;
    c.nomes[`cli:${cl.id}`] = cl.nome;
  }
  for (const u of dadosDinamicos.enviadas || []) {
    c[`enviadas:${u.login}`] = u.pecas;
    c[`versoes:${u.login}`] = u.versoes;
    c[`aprovadas_user:${u.login}`] = u.aprovadas || 0;
    c.nomes[u.login] = u.nome;
  }
  for (const d of dadosDinamicos.decisoes || []) {
    c[`dec:${d.login}:aprovada`] = d.aprovada;
    c[`dec:${d.login}:reprovada`] = d.reprovada;
    c[`dec:${d.login}:alteracao_solicitada`] = d.alteracao_solicitada;
    c.nomes[d.login] = d.nome;
  }
  try {
    await sql`INSERT INTO docs (path, parent, id, data) VALUES (${path}, ${`m/${M}/contadores`}, ${mes}, ${JSON.stringify(c)}::jsonb)
      ON CONFLICT (path) DO UPDATE SET data = ${JSON.stringify(c)}::jsonb, deleted = false, updated_at = now()`;
  } catch (e) {
    console.error("[pecas] erro ao sincronizar contadores no banco:", e?.message || e);
  }
}

// ---------- Peça vista pela página (sem as chaves internas dos arquivos) ----------
function publica(p, u) {
  const expira = v => new Date(Date.parse(v.enviadaEm) + RETENCAO_DIAS * DIA).toISOString();
  return { id: p.id, titulo: p.titulo, clienteId: p.clienteId, clienteNome: p.clienteNome, remetente: p.remetente, aprovadores: p.aprovadores || [], status: p.status, versao: p.versao, tipoMidia: p.tipoMidia || "online",
    criadoEm: p.criadoEm, atualizadoEm: p.atualizadoEm, minha: p.remetente?.login === u.login,
    versoes: p.versoes.map(v => ({ n: v.n, enviadaEm: v.enviadaEm, expiraEm: expira(v), obs: v.obs, links: v.links, linksMeta: v.linksMeta || {},
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
    const ext = extensaoPeca(chave);
    if (!chave.startsWith(pre) || chave.includes("..") || !/^[A-Za-z0-9._\/-]{1,300}$/.test(chave) || !TIPOS_PECAS[ext]) return { erro: "Arquivo inválido. Envie de novo." };
    const info = ehChaveBanco(chave) ? await infoBlobNoBanco(chave) : await infoArquivo(chave);
    if (!info) return { erro: `O arquivo "${txt(a?.nome, 80)}" não chegou ao armazenamento. Envie de novo.` };
    out.push({ chave, nome: txt(a?.nome, 160) || chave.split("/").pop(), tipo: TIPOS_PECAS[ext], tamanho: info.tamanho });
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

async function lerSeqClientes() {
  const doc = (await ler(M, "sequencia", "clientes")) || {};
  const mapa = { ...(doc.porCliente || {}) };
  for (const p of await listar(M, "pecas")) {
    if (p.clienteId) mapa[p.clienteId] = (Number(mapa[p.clienteId]) || 0);
  }
  const cont = {};
  for (const p of await listar(M, "pecas")) if (p.clienteId) cont[p.clienteId] = (cont[p.clienteId] || 0) + 1;
  for (const [cid, n] of Object.entries(cont)) mapa[cid] = Math.max(Number(mapa[cid] || 0), n);
  return mapa;
}
async function proximoNumeroPeca(clienteId) {
  const doc = (await ler(M, "sequencia", "clientes")) || {};
  const porCliente = { ...(doc.porCliente || {}) };
  const atuais = (await listar(M, "pecas")).filter(p => p.clienteId === clienteId).length;
  const prox = Math.max(Number(porCliente[clienteId] || 0), atuais) + 1;
  porCliente[clienteId] = prox;
  await gravar(M, "sequencia", "clientes", { porCliente, atualizadoEm: agora() });
  return prox;
}

// ---------- Rotas ----------
async function inicio(u, req, res) {
  const todos = await usuariosAtivos();
  const usuarios = todos.filter(x => podeDecidir(x) && x.login !== "equipe.inteligentte").map(x => ({ login: x.login, nome: x.nome || x.login, avatar: x.avatar || null, funcao: perfilDe(x), podeDecidir: true }));
  const equipe = todos.filter(x => x.login !== "equipe.inteligentte").map(x => ({
    login: x.login,
    nome: x.nome || x.login,
    avatar: x.avatar || null,
    funcao: perfilDe(x),
    podeDecidir: podeDecidir(x),
  }));
  return res.json({ podeEnviar: podeEnviar(u), podeDecidir: podeDecidir(u), veTodas: veTodas(u), veDash: veDash(u), ehGestao: ehGestao(u), login: u.login, nome: u.nome || u.login, avatar: u.avatar || null, funcao: perfilDe(u),
    clientes: podeEnviar(u) ? await clientesCarteira() : [], seqClientes: podeEnviar(u) ? await lerSeqClientes() : {}, usuarios, equipe, maxArquivos: MAX_ARQUIVOS, maxLinks: MAX_LINKS, maxMB: MAX_BYTES / 1048576,
    maxMBServidor: MAX_BYTES_SERVIDOR / 1048576, retencaoDias: RETENCAO_DIAS, status: STATUS, mes: mesAtual() });
}

// Token para o navegador enviar UM arquivo direto ao armazenamento.
async function uploadToken(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u)) return negado(res, "Seu usuário não envia peças.");
  const b = corpo(req);
  const tamanho = Number(b.tamanho);
  const dia = hojeSP().replace(/-/g, "");
  const montado = montarChavePeca({ login: u.login, nome: b.nome, dia, randHex: crypto.randomBytes(6).toString("hex") });
  if (montado.erro) return res.status(400).json({ code: montado.erro, msg: montado.msg });
  if (!(tamanho > 0)) return res.status(400).json({ code: "arquivo_vazio", msg: "O arquivo está vazio." });
  if (tamanho > MAX_BYTES) return res.status(400).json({ code: "arquivo_grande", msg: `O arquivo passa de ${MAX_BYTES / 1048576} MB.` });
  try {
    const envio = await tokenEnvioDireto(montado.chave, { tipos: [montado.tipo], maxBytes: MAX_BYTES });
    return res.json({ chave: montado.chave, tipo: montado.tipo, ...envio });
  } catch (e) {
    if (e?.code === "blob_nao_configurado") {
      return res.status(503).json({ code: e.code, msg: e.message });
    }
    throw e;
  }
}

// Fallback pelo servidor (same-origin): tenta Vercel Blob (auto-ajustando access) e, se indisponível/suspenso, grava na tabela docs.
async function uploadArquivo(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u)) return negado(res, "Seu usuário não envia peças.");
  const b = corpo(req);
  const v = validarUploadBase64({ nome: b.nome, b64: b.b64, maxBytes: MAX_BYTES_SERVIDOR });
  if (v.erro) return res.status(400).json({ code: v.erro, msg: v.msg });
  const dia = hojeSP().replace(/-/g, "");
  const montado = montarChavePeca({ login: u.login, nome: v.nomeLimpo, dia, randHex: crypto.randomBytes(6).toString("hex") });
  if (montado.erro) return res.status(400).json({ code: montado.erro, msg: montado.msg });
  try {
    const g = await guardar(montado.chave, v.buf, montado.nomeLimpo, v.tipo);
    return res.json({ chave: g.chave, nome: montado.nomeLimpo, tipo: g.tipo, tamanho: g.tamanho, armazenamento: "blob" });
  } catch (errBlob) {
    console.error("[pecas] upload.arquivo Blob falhou, salvando fallback no banco:", String(errBlob?.message || errBlob).slice(0, 160));
    const montadoDb = montarChavePeca({
      login: u.login,
      nome: v.nomeLimpo,
      dia,
      randHex: crypto.randomBytes(6).toString("hex"),
      prefixoPasta: "db-",
    });
    try {
      const gDb = await guardarBlobNoBanco({ chave: montadoDb.chave, buf: v.buf, nome: montadoDb.nomeLimpo, tipo: v.tipo });
      return res.json({ chave: gDb.chave, nome: montadoDb.nomeLimpo, tipo: gDb.tipo, tamanho: gDb.tamanho, armazenamento: "banco" });
    } catch (errDb) {
      console.error("[pecas] upload.arquivo fallback no banco falhou:", String(errDb?.message || errDb).slice(0, 160));
      return res.status(503).json({
        code: "armazenamento_indisponivel",
        msg: "Não foi possível salvar o arquivo no armazenamento. Tente novamente ou envie via link do Google Drive.",
      });
    }
  }
}

async function pecaEnviar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u)) return negado(res, "Seu usuário não envia peças.");
  const b = corpo(req);
  const tipoMidia = String(b.tipoMidia || "").trim().toLowerCase();
  if (!["online", "offline"].includes(tipoMidia)) {
    return res.status(400).json({ code: "tipo_midia_obrigatorio", msg: "Selecione se a peça é Online ou Offline." });
  }
  const tituloInformado = txt(b.titulo, 160), obs = txt(b.obs, 2000);
  // Título opcional: se não informado, gera automaticamente "Peça #X | Nome do Cliente" no momento do envio.
  const cli = (await clientesCarteira()).find(c => c.id === b.clienteId);
  if (!cli) return res.status(400).json({ code: "cliente", msg: "Escolha o cliente da Carteira." });
  const a = await conferirArquivos(u, b.arquivos); if (a.erro) return res.status(400).json({ code: "arquivos", msg: a.erro });
  const l = conferirLinks(b.links); if (l.erro) return res.status(400).json({ code: "links", msg: l.erro });
  if (!a.arquivos.length && !l.links.length) return res.status(400).json({ code: "vazio", msg: "Anexe pelo menos um arquivo ou um link do Google Drive." });

  // Aprovadores selecionados (opcional; coordenadores e gestão sempre têm direito de aprovar)
  const todos = await usuariosAtivos();
  const loginsAprovadores = Array.isArray(b.aprovadores) ? b.aprovadores.map(s => String(s).trim()) : [];
  const aprovadores = todos.filter(x => loginsAprovadores.includes(x.login) && podeDecidir(x)).map(quem);

  const em = agora(), id = novoId();
  const numPeca = await proximoNumeroPeca(cli.id);
  const titulo = tituloInformado || `Peça #${numPeca} | ${cli.nome}`;
  const mencoesEnvio = resolverMencoes(obs, b.mencoes, todos, u.login);
  let linksMeta = {};
  if (l.links.length) {
    try { linksMeta = await inspecionarLinksDrive(l.links); } catch {}
  }
  const p = { titulo, clienteId: cli.id, clienteNome: cli.nome, tipoMidia, remetente: quem(u), aprovadores, status: "pendente", versao: 1,
    versoes: [{ n: 1, enviadaEm: em, obs, arquivos: a.arquivos, links: l.links, linksMeta }],
    historico: [{ id: novoId(), tipo: "envio", versao: 1, em, por: quem(u), comentario: obs, mencoes: mencoesEnvio, vistoPor: [u.login] }], criadoEm: em, atualizadoEm: em };
  await gravar(M, "pecas", id, p);
  await contar(mesAtual(), {
    pecas: 1, versoes: 1, [`enviadas:${u.login}`]: 1, [`versoes:${u.login}`]: 1,
    [`cli_pecas:${cli.id}`]: 1, [`cli_versoes:${cli.id}`]: 1, [`cli_env:${cli.id}:${u.login}`]: 1, [`cli_ver:${cli.id}:${u.login}`]: 1,
  }, { [u.login]: u.nome || u.login, [`cli:${cli.id}`]: cli.nome });
  return res.json({ ok: true, seqCliente: numPeca, peca: publica({ ...p, id }, u) });
}

async function pecaReenviar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u) && !podeDecidir(u)) return negado(res, "Seu usuário não tem permissão para enviar ou editar peças.");
  const b = corpo(req);
  const p = await ler(M, "pecas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado", msg: "Peça não encontrada (pode ter expirado)." });
  if (p.remetente?.login !== u.login && !podeDecidir(u)) return negado(res, "Só quem enviou a peça ou a coordenação/gestão pode reenviar ou editar.");
  if (!["aprovada", "reprovada", "alteracao_solicitada", "pendente"].includes(p.status)) {
    return res.status(409).json({ code: "status", msg: "Status da peça não permite nova versão." });
  }
  const obs = txt(b.obs, 2000);
  const a = await conferirArquivos(u, b.arquivos); if (a.erro) return res.status(400).json({ code: "arquivos", msg: a.erro });
  const l = conferirLinks(b.links); if (l.erro) return res.status(400).json({ code: "links", msg: l.erro });
  if (!a.arquivos.length && !l.links.length) return res.status(400).json({ code: "vazio", msg: "Anexe pelo menos um arquivo ou um link do Google Drive." });
  const em = agora(), n = (p.versao || 1) + 1;
  const statusAnterior = p.status;
  if (b.titulo && typeof b.titulo === "string" && b.titulo.trim()) {
    p.titulo = txt(b.titulo.trim(), 160);
  }
  if (b.tipoMidia && ["online", "offline"].includes(String(b.tipoMidia).trim().toLowerCase())) {
    p.tipoMidia = String(b.tipoMidia).trim().toLowerCase();
  } else if (!p.tipoMidia) {
    p.tipoMidia = "online";
  }
  let linksMeta = {};
  if (l.links.length) {
    try { linksMeta = await inspecionarLinksDrive(l.links); } catch {}
  }
  p.versoes.push({ n, enviadaEm: em, obs, arquivos: a.arquivos, links: l.links, linksMeta });
  const tipoHist = statusAnterior === "aprovada" ? "edicao_aprovada" : "reenvio";
  const todos = await usuariosAtivos();
  const mencoesReenvio = resolverMencoes(obs, b.mencoes, todos, u.login);
  marcarMencoesLidasNaPeca(p, u.login);
  p.historico.push({ id: novoId(), tipo: tipoHist, versao: n, em, por: quem(u), comentario: obs || (statusAnterior === "aprovada" ? "Material aprovado foi editado (nova versão)" : "Nova versão enviada"), mencoes: mencoesReenvio, vistoPor: [u.login] });
  Object.assign(p, { versao: n, status: "pendente", atualizadoEm: em });
  p.arquivada = false;
  delete p.arquivadaEm;
  await gravar(M, "pecas", p.id, p);
  const incReenvio = { versoes: 1, [`versoes:${u.login}`]: 1 };
  const nomesReenvio = { [u.login]: u.nome || u.login };
  if (p.clienteId) {
    incReenvio[`cli_versoes:${p.clienteId}`] = 1;
    incReenvio[`cli_ver:${p.clienteId}:${u.login}`] = 1;
    if (p.clienteNome) nomesReenvio[`cli:${p.clienteId}`] = p.clienteNome;
  }
  await contar(mesAtual(), incReenvio, nomesReenvio);

  // Mantém os contadores do mês sincronizados dinamicamente
  try {
    const todasRestantes = await listar(M, "pecas");
    const cart = await clientesCarteira();
    const dadosAtuais = resumoDinamico(todasRestantes, cart, d => String(d || "").slice(0, 7) === mesAtual());
    sincronizarContadoresNoBanco(mesAtual(), dadosAtuais).catch(() => {});
  } catch {}

  return res.json({ ok: true, peca: publica(p, u) });
}

async function pecaDecidir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const decisao = String(b.decisao || ""), comentario = txt(b.comentario, 3000);
  if (!DECISOES.includes(decisao)) return res.status(400).json({ code: "decisao", msg: "Decisão inválida." });
  if (decisao !== "aprovada" && !comentario) return res.status(400).json({ code: "comentario", msg: "Escreva um comentário para reprovar ou pedir alteração." });
  const p = await ler(M, "pecas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado", msg: "Peça não encontrada (pode ter expirado)." });
  const souAprovador = (p.aprovadores || []).some(a => a.login === u.login);
  // Coordenadores, Mestre e Gestão têm direito de aprovar qualquer peça (Social Media e Atendimento não decidem)
  const autorizado = (podeDecidir(u) || souAprovador) && !["social", "atendimento"].includes(perfilDe(u));
  if (!autorizado) return negado(res, "Apenas coordenadores e gestão podem aprovar ou decidir peças.");
  if (p.status !== "pendente") return res.status(409).json({ code: "status", msg: "Esta peça já foi decidida." });
  const em = agora();
  const todos = await usuariosAtivos();
  const mencoesDec = resolverMencoes(comentario, b.mencoes, todos, u.login);
  if (["alteracao_solicitada", "reprovada"].includes(decisao) && p.remetente?.login && p.remetente.login !== u.login) {
    if (!mencoesDec.some(m => m.login === p.remetente.login)) {
      mencoesDec.push({ login: p.remetente.login, nome: p.remetente.nome || p.remetente.login });
    }
  }
  marcarMencoesLidasNaPeca(p, u.login);
  p.historico.push({ id: novoId(), tipo: decisao, versao: p.versao, em, por: quem(u), comentario, mencoes: mencoesDec, vistoPor: [u.login] });
  Object.assign(p, { status: decisao, atualizadoEm: em, decididoEm: em, decididoPor: quem(u) });
  await gravar(M, "pecas", p.id, p);
  const inc = { [decisao]: 1, [`dec:${u.login}:${decisao}`]: 1 };
  const nomesDec = { [u.login]: u.nome || u.login };
  if (decisao === "aprovada" && p.remetente?.login) {
    inc[`aprovadas_user:${p.remetente.login}`] = 1;
    if (p.remetente.nome) nomesDec[p.remetente.login] = p.remetente.nome;
  }
  if (p.clienteId) {
    inc[`cli_dec:${p.clienteId}:${decisao}`] = 1;
    inc[`cli_aprov:${p.clienteId}:${u.login}:${decisao}`] = 1;
    if (p.versao === 1) { inc[`cli_v1_dec:${p.clienteId}`] = 1; if (decisao === "aprovada") inc[`cli_v1_apr:${p.clienteId}`] = 1; }
    if (p.clienteNome) nomesDec[`cli:${p.clienteId}`] = p.clienteNome;
  }
  if (p.versao === 1) { inc.v1_decididas = 1; if (decisao === "aprovada") inc.v1_aprovadas = 1; }
  await contar(mesAtual(), inc, nomesDec);

  // Mantém os contadores do mês sincronizados dinamicamente
  try {
    const todasRestantes = await listar(M, "pecas");
    const cart = await clientesCarteira();
    const dadosAtuais = resumoDinamico(todasRestantes, cart, d => String(d || "").slice(0, 7) === mesAtual());
    sincronizarContadoresNoBanco(mesAtual(), dadosAtuais).catch(() => {});
  } catch {}

  return res.json({ ok: true, peca: publica(p, u) });
}

// Comentário em material que não foi aprovado (pendente, alteração solicitada ou reprovada)
async function pecaComentar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const id = String(b.id || "").trim();
  const comentario = txt(b.comentario, 3000);
  if (!comentario) return res.status(400).json({ code: "comentario_vazio", msg: "Escreva um comentário." });
  const p = await ler(M, "pecas", id);
  if (!p) return res.status(404).json({ code: "nao_encontrado", msg: "Peça não encontrada (pode ter expirado)." });
  if (!podeVer(u, p)) return negado(res, "Sem permissão para ver esta peça.");
  if (p.status === "aprovada") {
    return res.status(400).json({ code: "ja_aprovada", msg: "Esta peça já foi aprovada. Comentários só são permitidos em materiais não aprovados." });
  }
  const em = agora();
  const todos = await usuariosAtivos();
  const mencoesCom = resolverMencoes(comentario, b.mencoes, todos, u.login);
  if (p.remetente?.login && p.remetente.login !== u.login) {
    if (!mencoesCom.some(m => m.login === p.remetente.login)) {
      mencoesCom.push({ login: p.remetente.login, nome: p.remetente.nome || p.remetente.login });
    }
  }
  marcarMencoesLidasNaPeca(p, u.login);
  p.historico = Array.isArray(p.historico) ? p.historico : [];
  p.historico.push({ id: novoId(), tipo: "comentario", versao: p.versao, em, por: quem(u), comentario, mencoes: mencoesCom, vistoPor: [u.login] });
  p.atualizadoEm = em;
  await gravar(M, "pecas", p.id, p);
  return res.json({ ok: true, peca: publica(p, u) });
}

// Notificações leves para o cabeçalho global e o módulo de peças: menções não lidas para o usuário logado + total de pendentes
async function notificacoes(u, req, res) {
  if (!veTodas(u) && !podeEnviar(u)) return res.json({ mencoes: [], pendentes: 0 });
  const lista = (await listar(M, "pecas")).filter(p => !p.arquivada && podeVer(u, p));
  const pendentes = lista.filter(p => p.status === "pendente").length;
  const mencoes = [];
  for (const p of lista) {
    mencoes.push(...mencoesNaoLidasPara(p, u.login));
  }
  mencoes.sort((a, b) => (b.em || "").localeCompare(a.em || ""));
  return res.json({ mencoes, pendentes });
}

// Marcar menção(ões) como lida(s) pelo usuário logado (por peça, por evento específico ou todas)
async function mencaoLer(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  const pecaId = b.pecaId ? String(b.pecaId).trim() : "";
  const hid = b.hid ? String(b.hid).trim() : null;
  const todas = !!b.todas;

  if (pecaId && !todas) {
    const p = await ler(M, "pecas", pecaId);
    if (!p) return res.status(404).json({ code: "nao_encontrado", msg: "Peça não encontrada." });
    if (marcarMencoesLidasNaPeca(p, u.login, hid)) {
      await gravar(M, "pecas", p.id, p);
    }
    return res.json({ ok: true });
  }

  let marcadas = 0;
  for (const p of await listar(M, "pecas")) {
    if (marcarMencoesLidasNaPeca(p, u.login, null)) {
      await gravar(M, "pecas", p.id, p);
      marcadas++;
    }
  }
  return res.json({ ok: true, marcadas });
}

async function removerChavesArmazenamento(chaves) {
  const lista = (chaves || []).filter(Boolean);
  if (!lista.length) return;
  const banco = lista.filter(ehChaveBanco);
  const blob = lista.filter(c => !ehChaveBanco(c));
  if (banco.length) { try { await apagarBlobsDoBanco(banco); } catch {} }
  if (blob.length) { try { await apagarArquivos(blob); } catch {} }
}

// Excluir uma peça individual mediante senha mestre
async function pecaExcluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  if (!(await conferirSenhaMestre(b.senhaMestre))) {
    return res.status(403).json({ code: "senha_mestre", msg: "Senha mestre incorreta." });
  }
  const p = await ler(M, "pecas", String(b.id || ""));
  if (!p) return res.status(404).json({ code: "nao_encontrado", msg: "Peça não encontrada." });
  const chaves = [];
  for (const v of p.versoes || []) {
    for (const a of v.arquivos || []) if (a.chave && !a.expirado) chaves.push(a.chave);
  }
  await removerChavesArmazenamento(chaves);
  await apagar(M, "pecas", p.id);

  // Mantém os contadores do mês sincronizados dinamicamente com as peças restantes
  try {
    const todasRestantes = await listar(M, "pecas");
    const cart = await clientesCarteira();
    const dadosAtuais = resumoDinamico(todasRestantes, cart, d => String(d || "").slice(0, 7) === mesAtual());
    sincronizarContadoresNoBanco(mesAtual(), dadosAtuais).catch(() => {});
  } catch {}

  return res.json({ ok: true });
}

// Apagar a fila de peças (todas ou filtradas) mediante senha mestre
async function filaApagar(u, req, res) {
  if (!so(req, res, "POST")) return;
  const b = corpo(req);
  if (!(await conferirSenhaMestre(b.senhaMestre))) {
    return res.status(403).json({ code: "senha_mestre", msg: "Senha mestre incorreta." });
  }
  const todas = await listar(M, "pecas");
  const idsFiltro = Array.isArray(b.ids) && b.ids.length ? new Set(b.ids.map(String)) : null;
  const alvos = todas.filter(p => {
    if (idsFiltro) return idsFiltro.has(p.id);
    if (p.arquivada) return false;
    if (b.status && p.status !== b.status) return false;
    if (b.clienteId && p.clienteId !== b.clienteId) return false;
    return true;
  });
  const chaves = [];
  for (const p of alvos) {
    for (const v of p.versoes || []) {
      for (const a of v.arquivos || []) if (a.chave && !a.expirado) chaves.push(a.chave);
    }
    await apagar(M, "pecas", p.id);
  }
  await removerChavesArmazenamento(chaves);

  // Mantém os contadores do mês sincronizados dinamicamente com as peças restantes
  try {
    const todasRestantes = await listar(M, "pecas");
    const cart = await clientesCarteira();
    const dadosAtuais = resumoDinamico(todasRestantes, cart, d => String(d || "").slice(0, 7) === mesAtual());
    sincronizarContadoresNoBanco(mesAtual(), dadosAtuais).catch(() => {});
  } catch {}

  return res.json({ ok: true, apagadas: alvos.length });
}

export function versaoListaPecas({ pecasSeq = 0, pecasCnt = 0, avAt = "", usrAt = "", usrCnt = 0 } = {}) {
  const raw = `${pecasSeq ?? 0}|${pecasCnt ?? 0}|${avAt ?? ""}|${usrAt ?? ""}|${usrCnt ?? 0}`;
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

async function obterVersaoListaPecas() {
  try {
    const r = await sql`
      SELECT
        coalesce((SELECT max(seq) FROM docs WHERE parent = 'm/pecas/pecas'), 0)::text AS pecas_seq,
        coalesce((SELECT count(*) FROM docs WHERE parent = 'm/pecas/pecas' AND NOT deleted), 0)::text AS pecas_cnt,
        coalesce((SELECT max(updated_at)::text FROM docs WHERE path = 'm/pecas/config/avatares' OR parent = 'm/pecas/avatares'), '') AS av_at,
        coalesce((SELECT max(coalesce(atualizado_em, criado_em))::text FROM usuarios), '') AS usr_at,
        coalesce((SELECT count(*) FROM usuarios WHERE ativo), 0)::text AS usr_cnt
    `;
    const row = r[0];
    if (!row) return null;
    return versaoListaPecas({
      pecasSeq: row.pecas_seq,
      pecasCnt: row.pecas_cnt,
      avAt: row.av_at,
      usrAt: row.usr_at,
      usrCnt: row.usr_cnt,
    });
  } catch {
    return null;
  }
}

async function pecas(u, req, res) {
  if (!veTodas(u) && !podeEnviar(u)) return negado(res);
  const versao = await obterVersaoListaPecas();
  if (versao && req.query.v && String(req.query.v) === versao) {
    return res.json({ semAlteracao: true, versao });
  }
  const [todasPecas, todosUsers] = await Promise.all([listar(M, "pecas"), usuariosAtivos()]);
  const lista = todasPecas.filter(p => !p.arquivada && podeVer(u, p))
    .sort((a, b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""));
  const perfis = {};
  for (const x of todosUsers) {
    if (x.login) perfis[x.login] = { nome: x.nome || x.login, avatar: x.avatar || null, funcao: perfilDe(x) };
  }
  return res.json({ pecas: lista.map(p => publica(p, u)), perfis, versao });
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
  if (ehChaveBanco(a.chave)) return enviarBlobDoBanco(res, a.chave, a.nome, true);
  let url = null;
  try { url = await linkTemporario(a.chave); } catch (e) { console.error("[pecas] link temporário:", String(e?.message || e).slice(0, 120)); }
  if (url) { res.statusCode = 302; res.setHeader("location", url); res.setHeader("cache-control", "private, no-store"); return res.end(); }
  return enviar(res, a.chave, a.nome, true);
}

// Inspeciona tipo de arquivos do Google Drive em lote (útil para peças enviadas antes de linksMeta).
async function driveMeta(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!veTodas(u) && !podeEnviar(u)) return negado(res);
  const b = corpo(req);
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : [])
    .map(x => String(x || "").trim())
    .filter(id => /^[A-Za-z0-9_-]{10,200}$/.test(id)))].slice(0, 30);
  if (!ids.length) return res.json({ meta: {} });
  const meta = await inspecionarLinksDrive(ids);
  return res.json({ meta });
}

// Proxy autenticado de fallback para imagens do Google Drive vinculadas a uma peça visível ao usuário.
async function driveArquivo(u, req, res) {
  const pecaId = String(req.query.pecaId || "").trim();
  const fid = String(req.query.id || "").trim();
  if (!pecaId || !/^[A-Za-z0-9_-]{10,200}$/.test(fid)) {
    return res.status(400).json({ code: "parametros", msg: "Parâmetros inválidos." });
  }
  const p = await ler(M, "pecas", pecaId);
  if (!p || !podeVer(u, p)) return res.status(p ? 403 : 404).json({ code: p ? "sem_acesso" : "nao_encontrado" });
  const pertence = (p.versoes || []).some(v => (v.links || []).some(l => extrairDriveFileId(l) === fid));
  if (!pertence) return res.status(404).json({ code: "nao_encontrado" });
  const img = await baixarImagemDrive(fid, 4 * 1024 * 1024);
  if (!img) return res.status(404).json({ code: "nao_encontrado" });
  res.statusCode = 200;
  res.setHeader("content-type", img.tipo);
  res.setHeader("cache-control", "private, max-age=3600");
  res.setHeader("x-content-type-options", "nosniff");
  return res.end(img.buf);
}

async function dashboard(u, req, res) {
  if (!veDash(u)) return negado(res, "O dashboard é do Mestre, da gestão, coordenação, atendimento e social media.");

  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || "")) ? req.query.de : null;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || "")) ? req.query.ate : null;
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.mes || "")) ? req.query.mes : mesAtual();
  const tipoMidia = ["online", "offline"].includes(String(req.query.tipoMidia || "").toLowerCase())
    ? String(req.query.tipoMidia).toLowerCase()
    : null;
  const mesCarteiraAlvo = (de || ate) ? (ate || de).slice(0, 7) : mes;

  const [cartRes, todasPecas, rMeses] = await Promise.all([
    clientesCarteiraComMes(mesCarteiraAlvo),
    listar(M, "pecas"),
    sql`SELECT id FROM docs WHERE parent = ${`m/${M}/contadores`} AND NOT deleted ORDER BY id DESC`,
  ]);
  const carteira = cartRes.clientes;
  const carteiraMes = cartRes.mes;

  const meses = rMeses.map(r => r.id);
  const mesesDasPecas = todasPecas
    .map(p => diaSP(p.criadoEm || (p.versoes && p.versoes[0]?.enviadaEm) || p.atualizadoEm).slice(0, 7))
    .filter(m => /^\d{4}-\d{2}$/.test(m));
  const listaMeses = [...new Set([mesAtual(), ...meses, ...mesesDasPecas])].sort().reverse();

  const filtroData = (de || ate)
    ? dia => (!de || dia >= de) && (!ate || dia <= ate)
    : dia => String(dia || "").slice(0, 7) === mes;

  const pecasParaDash = tipoMidia
    ? todasPecas.filter(p => (p.tipoMidia || "online") === tipoMidia)
    : todasPecas;

  const { horas, horasPorCli } = calcularPicosHorario(pecasParaDash, filtroData);
  const dados = resumoDinamico(pecasParaDash, carteira, filtroData);
  for (const cl of dados.clientes || []) {
    cl.horas = horasPorCli[cl.id] || Array(24).fill(0);
  }

  // Sincroniza em background o documento contadores no banco para o mês atual (apenas visão geral sem filtro de mídia)
  if (!de && !ate && !tipoMidia && mes === mesAtual()) {
    sincronizarContadoresNoBanco(mes, dados).catch(() => {});
  }

  return res.json({ mes, de, ate, tipoMidia, carteiraMes, meses: listaMeses, horas, ...dados });
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
  inicio, "upload.token": uploadToken, "upload.arquivo": uploadArquivo, "peca.enviar": pecaEnviar, "peca.reenviar": pecaReenviar, "peca.decidir": pecaDecidir,
  "peca.comentar": pecaComentar, "peca.excluir": pecaExcluir, "fila.apagar": filaApagar,
  pecas, "peca.arquivo": pecaArquivo, "drive.meta": driveMeta, "drive.arquivo": driveArquivo, dashboard, "limpeza.executar": limpezaExecutar,
  notificacoes, "mencao.ler": mencaoLer,
};
export const publicas = { "pecas.cron": pecasCron };
