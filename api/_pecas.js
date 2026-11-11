// 02 Aprovação de peças: Envio, Fila de aprovação e Dashboard mensal.
// Dados em m/pecas/<colecao>/<id>, servidos só por aqui (fora da sincronização geral). Permissões sempre conferidas aqui:
//   enviar e reenviar: todos os usuários ativos (vê só as suas peças)
//   decidir e ver todas: coordenador, mestre e gestão
//   dashboard: mestre, gestão, coordenador e atendimento
// Arquivos: o navegador envia direto ao Vercel Blob com um token do servidor; ficam 7 dias e são apagados pela rotina diária.
// Os contadores mensais (m/pecas/contadores/<AAAA-MM>) são atualizados a cada envio e decisão e nunca são apagados.
import crypto from "node:crypto";
import { sql } from "./_lib.js";
import { perfilDe, podeEnviarPecas, ehGestao } from "./_modules.js";
import { listar, ler, gravar, apagar, novoId, clientesCarteira, txt, usuariosAtivos } from "./_mdados.js";
import { tokenEnvioDireto, infoArquivo, apagarArquivos, listarArquivos, linkTemporario, enviar, nomeSeguro, extensao } from "./_arquivos.js";
import { hojeSP } from "./_adm.js";

const M = "pecas";
export const RETENCAO_DIAS = 7;
export const MAX_ARQUIVOS = 10, MAX_LINKS = 10;
export const MAX_BYTES = 100 * 1024 * 1024;   // por arquivo (envio direto ao armazenamento, sem passar pela função)
const TIPOS = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};
export const STATUS = { pendente: "Pendente", aprovada: "Aprovada", reprovada: "Reprovada", alteracao_solicitada: "Alteração solicitada" };
const DECISOES = ["aprovada", "reprovada", "alteracao_solicitada"];
const DIA = 864e5;
const MASTER_PASS_HASH = "a8698d96861f332be3627b5461c3d4ac120295ae33c8e26b9c0db82afa657084";

const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const mesAtual = () => hojeSP().slice(0, 7);
export const diaSP = iso => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
  } catch { return ""; }
};

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

// Confere a senha mestre (aceita a senha mestre global da plataforma OU a senha de qualquer usuário Mestre ativo)
async function conferirSenhaMestre(senhaRaw) {
  const s = String(senhaRaw || "").trim();
  if (!s || s.length > 200) return false;
  const hash = crypto.createHash("sha256").update(s).digest("hex");
  if (hash === MASTER_PASS_HASH) return true;
  try {
    const r = await sql`SELECT 1 FROM app_users a
                        JOIN usuarios u ON lower(a.username) = u.login
                        WHERE u.ativo AND (u.papel = 'master' OR u.funcao = 'mestre')
                          AND a.pass_hash = crypt(${s}, a.pass_hash)
                        LIMIT 1`;
    if (r.length > 0) return true;
  } catch {}
  return false;
}

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
export function resumoContadores(c, carteira = [], pecasAtivasMes = []) {
  c = c || {};
  const nomes = c.nomes || {};
  const porUsuario = {}, porCoord = {}, porCli = {};
  const cliObj = id => (porCli[id] ||= {
    pecas: 0, versoes: 0, aprovada: 0, reprovada: 0, alteracao_solicitada: 0, pendente: 0,
    v1_decididas: 0, v1_aprovadas: 0, porUsuario: {}, porCoord: {},
  });
  for (const [k, v] of Object.entries(c)) {
    let m;
    if ((m = /^enviadas:(.+)$/.exec(k))) (porUsuario[m[1]] ||= { pecas: 0, versoes: 0 }).pecas = v;
    else if ((m = /^versoes:(.+)$/.exec(k))) (porUsuario[m[1]] ||= { pecas: 0, versoes: 0 }).versoes = v;
    else if ((m = /^dec:(.+):(aprovada|reprovada|alteracao_solicitada)$/.exec(k))) (porCoord[m[1]] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 })[m[2]] = v;
    else if ((m = /^cli_pecas:(.+)$/.exec(k))) cliObj(m[1]).pecas = v;
    else if ((m = /^cli_versoes:(.+)$/.exec(k))) cliObj(m[1]).versoes = v;
    else if ((m = /^cli_dec:([^:]+):(aprovada|reprovada|alteracao_solicitada)$/.exec(k))) cliObj(m[1])[m[2]] = v;
    else if ((m = /^cli_v1_dec:(.+)$/.exec(k))) cliObj(m[1]).v1_decididas = v;
    else if ((m = /^cli_v1_apr:(.+)$/.exec(k))) cliObj(m[1]).v1_aprovadas = v;
    else if ((m = /^cli_env:([^:]+):(.+)$/.exec(k))) (cliObj(m[1]).porUsuario[m[2]] ||= { pecas: 0, versoes: 0 }).pecas = v;
    else if ((m = /^cli_ver:([^:]+):(.+)$/.exec(k))) (cliObj(m[1]).porUsuario[m[2]] ||= { pecas: 0, versoes: 0 }).versoes = v;
    else if ((m = /^cli_aprov:([^:]+):([^:]+):(aprovada|reprovada|alteracao_solicitada)$/.exec(k))) (cliObj(m[1]).porCoord[m[2]] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 })[m[3]] = v;
  }
  const enviadas = Object.entries(porUsuario).map(([login, x]) => ({ login, nome: nomes[login] || login, ...x })).sort((a, b) => b.pecas - a.pecas || b.versoes - a.versoes);
  const decisoes = Object.entries(porCoord).map(([login, x]) => ({ login, nome: nomes[login] || login, ...x, total: x.aprovada + x.reprovada + x.alteracao_solicitada })).sort((a, b) => b.total - a.total);
  const v1d = c.v1_decididas || 0, v1a = c.v1_aprovadas || 0;
  // Complementa com peças ativas do mês (pendentes na fila e retrocompatibilidade de peças anteriores ao contador por cliente)
  const vivasPorCli = {};
  for (const p of pecasAtivasMes) {
    if (!p.clienteId) continue;
    const cid = p.clienteId;
    if (p.clienteNome && !nomes[`cli:${cid}`]) nomes[`cli:${cid}`] = p.clienteNome;
    const v = (vivasPorCli[cid] ||= { pecas: 0, versoes: 0, aprovada: 0, reprovada: 0, alteracao_solicitada: 0, pendente: 0, v1_decididas: 0, v1_aprovadas: 0, porUsuario: {}, porCoord: {} });
    v.pecas++;
    const qtdV = Array.isArray(p.versoes) ? p.versoes.length : (p.versao || 1);
    v.versoes += qtdV;
    if (p.status === "pendente") v.pendente++;
    const rem = p.remetente?.login;
    if (rem) {
      if (p.remetente?.nome && !nomes[rem]) nomes[rem] = p.remetente.nome;
      const uEntry = (v.porUsuario[rem] ||= { pecas: 0, versoes: 0 });
      uEntry.pecas++;
      uEntry.versoes += qtdV;
    }
    for (const h of p.historico || []) {
      if (DECISOES.includes(h.tipo)) {
        v[h.tipo]++;
        if (h.versao === 1) { v.v1_decididas++; if (h.tipo === "aprovada") v.v1_aprovadas++; }
        const ap = h.por?.login;
        if (ap) {
          if (h.por?.nome && !nomes[ap]) nomes[ap] = h.por.nome;
          (v.porCoord[ap] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 })[h.tipo]++;
        }
      }
    }
  }
  for (const [cid, v] of Object.entries(vivasPorCli)) {
    const o = cliObj(cid);
    o.pendente = v.pendente;
    if (o.pecas < v.pecas) o.pecas = v.pecas;
    if (o.versoes < v.versoes) o.versoes = v.versoes;
    if (o.aprovada < v.aprovada) o.aprovada = v.aprovada;
    if (o.reprovada < v.reprovada) o.reprovada = v.reprovada;
    if (o.alteracao_solicitada < v.alteracao_solicitada) o.alteracao_solicitada = v.alteracao_solicitada;
    if (o.v1_decididas < v.v1_decididas) o.v1_decididas = v.v1_decididas;
    if (o.v1_aprovadas < v.v1_aprovadas) o.v1_aprovadas = v.v1_aprovadas;
    for (const [ul, ux] of Object.entries(v.porUsuario)) {
      const uo = (o.porUsuario[ul] ||= { pecas: 0, versoes: 0 });
      if (uo.pecas < ux.pecas) uo.pecas = ux.pecas;
      if (uo.versoes < ux.versoes) uo.versoes = ux.versoes;
    }
    for (const [al, ax] of Object.entries(v.porCoord)) {
      const ao = (o.porCoord[al] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 });
      if (ao.aprovada < ax.aprovada) ao.aprovada = ax.aprovada;
      if (ao.reprovada < ax.reprovada) ao.reprovada = ax.reprovada;
      if (ao.alteracao_solicitada < ax.alteracao_solicitada) ao.alteracao_solicitada = ax.alteracao_solicitada;
    }
  }
  const mapaCarteira = new Map((carteira || []).map(cl => [cl.id, cl]));
  const idsClientes = new Set([...mapaCarteira.keys(), ...Object.keys(porCli)]);
  const clientes = [...idsClientes].map(id => {
    const meta = mapaCarteira.get(id) || {};
    const st = porCli[id] || { pecas: 0, versoes: 0, aprovada: 0, reprovada: 0, alteracao_solicitada: 0, pendente: 0, v1_decididas: 0, v1_aprovadas: 0, porUsuario: {}, porCoord: {} };
    const envCli = Object.entries(st.porUsuario).map(([login, x]) => ({ login, nome: nomes[login] || login, ...x })).sort((a, b) => b.pecas - a.pecas || b.versoes - a.versoes);
    const decCli = Object.entries(st.porCoord).map(([login, x]) => ({ login, nome: nomes[login] || login, ...x, total: x.aprovada + x.reprovada + x.alteracao_solicitada })).sort((a, b) => b.total - a.total);
    return {
      id,
      nome: meta.nome || nomes[`cli:${id}`] || id,
      tipo: meta.tipo || "",
      nivel: meta.nivel || "",
      atendimento: meta.atendimento || "",
      social: meta.social || "",
      metaConteudos: (Number(meta.conteudos) || 0) + (Number(meta.motions) || 0),
      pecas: st.pecas || 0,
      versoes: st.versoes || 0,
      aprovada: st.aprovada || 0,
      reprovada: st.reprovada || 0,
      alteracao_solicitada: st.alteracao_solicitada || 0,
      pendente: st.pendente || 0,
      primeiraDecididas: st.v1_decididas || 0,
      primeiraAprovadas: st.v1_aprovadas || 0,
      taxaPrimeira: st.v1_decididas ? Math.round(st.v1_aprovadas / st.v1_decididas * 1000) / 10 : null,
      enviadas: envCli,
      decisoes: decCli,
    };
  }).sort((a, b) => b.pecas - a.pecas || b.versoes - a.versoes || a.nome.localeCompare(b.nome, "pt-BR"));
  const tiposCliente = [...new Set(clientes.map(x => x.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const atendimentosCliente = [...new Set(clientes.map(x => x.atendimento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { enviadas, decisoes, totais: { pecas: c.pecas || 0, versoes: c.versoes || 0, aprovada: c.aprovada || 0, reprovada: c.reprovada || 0, alteracao_solicitada: c.alteracao_solicitada || 0,
    primeiraDecididas: v1d, primeiraAprovadas: v1a, taxaPrimeira: v1d ? Math.round(v1a / v1d * 1000) / 10 : null }, clientes, tiposCliente, atendimentosCliente };
}

// Resumo analítico por intervalo de datas (Hoje, Ontem, Semana ou Personalizado)
export function resumoPorIntervalo(todasPecas = [], carteira = [], de = null, ate = null) {
  const nomes = {};
  const porUsuario = {}, porCoord = {}, porCli = {};
  const cliObj = id => (porCli[id] ||= {
    pecas: 0, versoes: 0, aprovada: 0, reprovada: 0, alteracao_solicitada: 0, pendente: 0,
    v1_decididas: 0, v1_aprovadas: 0, porUsuario: {}, porCoord: {},
  });

  let totPecas = 0, totVersoes = 0, totAprovadas = 0, totReprovadas = 0, totAlt = 0, totV1d = 0, totV1a = 0;

  for (const p of todasPecas) {
    if (!p.clienteId) continue;
    const cid = p.clienteId;
    if (p.clienteNome && !nomes[`cli:${cid}`]) nomes[`cli:${cid}`] = p.clienteNome;
    const cObj = cliObj(cid);

    const rem = p.remetente?.login;
    if (rem) {
      if (p.remetente?.nome && !nomes[rem]) nomes[rem] = p.remetente.nome;
      porUsuario[rem] ||= { pecas: 0, versoes: 0 };
    }

    // 1. Envio da peça inicial (versão 1)
    const diaCriacao = diaSP(p.criadoEm || (p.versoes && p.versoes[0]?.enviadaEm));
    if (diaCriacao && (!de || diaCriacao >= de) && (!ate || diaCriacao <= ate)) {
      cObj.pecas++;
      totPecas++;
      if (rem) {
        porUsuario[rem].pecas++;
        (cObj.porUsuario[rem] ||= { pecas: 0, versoes: 0 }).pecas++;
      }
    }

    // 2. Versões enviadas
    for (const v of p.versoes || []) {
      const diaV = diaSP(v.enviadaEm);
      if (diaV && (!de || diaV >= de) && (!ate || diaV <= ate)) {
        cObj.versoes++;
        totVersoes++;
        if (rem) {
          porUsuario[rem].versoes++;
          (cObj.porUsuario[rem] ||= { pecas: 0, versoes: 0 }).versoes++;
        }
      }
    }

    // 3. Decisões no histórico
    for (const h of p.historico || []) {
      if (DECISOES.includes(h.tipo)) {
        const diaDec = diaSP(h.em);
        if (diaDec && (!de || diaDec >= de) && (!ate || diaDec <= ate)) {
          cObj[h.tipo]++;
          if (h.tipo === "aprovada") totAprovadas++;
          else if (h.tipo === "reprovada") totReprovadas++;
          else if (h.tipo === "alteracao_solicitada") totAlt++;

          if (h.versao === 1) {
            cObj.v1_decididas++;
            totV1d++;
            if (h.tipo === "aprovada") {
              cObj.v1_aprovadas++;
              totV1a++;
            }
          }

          const ap = h.por?.login;
          if (ap) {
            if (h.por?.nome && !nomes[ap]) nomes[ap] = h.por.nome;
            const coordGlobal = (porCoord[ap] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 });
            coordGlobal[h.tipo]++;
            const coordCli = (cObj.porCoord[ap] ||= { aprovada: 0, reprovada: 0, alteracao_solicitada: 0 });
            coordCli[h.tipo]++;
          }
        }
      }
    }

    // 4. Pendentes
    if (p.status === "pendente") {
      const diaAtual = diaSP(p.atualizadoEm || p.criadoEm);
      if (!de || diaAtual >= de) {
        cObj.pendente++;
      }
    }
  }

  const enviadas = Object.entries(porUsuario)
    .filter(([_, x]) => x.pecas > 0 || x.versoes > 0)
    .map(([login, x]) => ({ login, nome: nomes[login] || login, ...x }))
    .sort((a, b) => b.pecas - a.pecas || b.versoes - a.versoes);

  const decisoes = Object.entries(porCoord)
    .map(([login, x]) => ({ login, nome: nomes[login] || login, ...x, total: x.aprovada + x.reprovada + x.alteracao_solicitada }))
    .filter(x => x.total > 0)
    .sort((a, b) => b.total - a.total);

  const mapaCarteira = new Map((carteira || []).map(cl => [cl.id, cl]));
  const idsClientes = new Set([...mapaCarteira.keys(), ...Object.keys(porCli)]);

  const clientes = [...idsClientes].map(id => {
    const meta = mapaCarteira.get(id) || {};
    const st = porCli[id] || { pecas: 0, versoes: 0, aprovada: 0, reprovada: 0, alteracao_solicitada: 0, pendente: 0, v1_decididas: 0, v1_aprovadas: 0, porUsuario: {}, porCoord: {} };
    const envCli = Object.entries(st.porUsuario)
      .filter(([_, x]) => x.pecas > 0 || x.versoes > 0)
      .map(([login, x]) => ({ login, nome: nomes[login] || login, ...x }))
      .sort((a, b) => b.pecas - a.pecas || b.versoes - a.versoes);
    const decCli = Object.entries(st.porCoord)
      .map(([login, x]) => ({ login, nome: nomes[login] || login, ...x, total: x.aprovada + x.reprovada + x.alteracao_solicitada }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total);

    return {
      id,
      nome: meta.nome || nomes[`cli:${id}`] || id,
      tipo: meta.tipo || "",
      nivel: meta.nivel || "",
      atendimento: meta.atendimento || "",
      social: meta.social || "",
      metaConteudos: (Number(meta.conteudos) || 0) + (Number(meta.motions) || 0),
      pecas: st.pecas || 0,
      versoes: st.versoes || 0,
      aprovada: st.aprovada || 0,
      reprovada: st.reprovada || 0,
      alteracao_solicitada: st.alteracao_solicitada || 0,
      pendente: st.pendente || 0,
      primeiraDecididas: st.v1_decididas || 0,
      primeiraAprovadas: st.v1_aprovadas || 0,
      taxaPrimeira: st.v1_decididas ? Math.round(st.v1_aprovadas / st.v1_decididas * 1000) / 10 : null,
      enviadas: envCli,
      decisoes: decCli,
    };
  }).sort((a, b) => b.pecas - a.pecas || b.versoes - a.versoes || a.nome.localeCompare(b.nome, "pt-BR"));

  const tiposCliente = [...new Set(clientes.map(x => x.tipo).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const atendimentosCliente = [...new Set(clientes.map(x => x.atendimento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return {
    enviadas,
    decisoes,
    totais: {
      pecas: totPecas,
      versoes: totVersoes,
      aprovada: totAprovadas,
      reprovada: totReprovadas,
      alteracao_solicitada: totAlt,
      primeiraDecididas: totV1d,
      primeiraAprovadas: totV1a,
      taxaPrimeira: totV1d ? Math.round(totV1a / totV1d * 1000) / 10 : null,
    },
    clientes,
    tiposCliente,
    atendimentosCliente,
  };
}

// ---------- Peça vista pela página (sem as chaves internas dos arquivos) ----------
function publica(p, u) {
  const expira = v => new Date(Date.parse(v.enviadaEm) + RETENCAO_DIAS * DIA).toISOString();
  return { id: p.id, titulo: p.titulo, clienteId: p.clienteId, clienteNome: p.clienteNome, remetente: p.remetente, aprovadores: p.aprovadores || [], status: p.status, versao: p.versao,
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
  const usuarios = todos.filter(podeDecidir).map(x => ({ login: x.login, nome: x.nome || x.login, funcao: perfilDe(x) }));
  return res.json({ podeEnviar: podeEnviar(u), podeDecidir: podeDecidir(u), veTodas: veTodas(u), veDash: veDash(u), ehGestao: ehGestao(u), login: u.login, funcao: perfilDe(u),
    clientes: podeEnviar(u) ? await clientesCarteira() : [], seqClientes: podeEnviar(u) ? await lerSeqClientes() : {}, usuarios, maxArquivos: MAX_ARQUIVOS, maxLinks: MAX_LINKS, maxMB: MAX_BYTES / 1048576,
    retencaoDias: RETENCAO_DIAS, status: STATUS, mes: mesAtual() });
}

// Token para o navegador enviar UM arquivo direto ao armazenamento.
async function uploadToken(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u)) return negado(res, "Seu usuário não envia peças.");
  const b = corpo(req);
  const nome = txt(b.nome, 160), ext = extensao(nome), tamanho = Number(b.tamanho);
  if (!TIPOS[ext]) return res.status(400).json({ code: "tipo_invalido", msg: "Envie JPG, PNG, PDF ou vídeo (MP4/MOV/WEBM)." });
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
  const p = { titulo, clienteId: cli.id, clienteNome: cli.nome, remetente: quem(u), aprovadores, status: "pendente", versao: 1,
    versoes: [{ n: 1, enviadaEm: em, obs, arquivos: a.arquivos, links: l.links }],
    historico: [{ tipo: "envio", versao: 1, em, por: quem(u), comentario: obs }], criadoEm: em, atualizadoEm: em };
  await gravar(M, "pecas", id, p);
  await contar(mesAtual(), {
    pecas: 1, versoes: 1, [`enviadas:${u.login}`]: 1, [`versoes:${u.login}`]: 1,
    [`cli_pecas:${cli.id}`]: 1, [`cli_versoes:${cli.id}`]: 1, [`cli_env:${cli.id}:${u.login}`]: 1, [`cli_ver:${cli.id}:${u.login}`]: 1,
  }, { [u.login]: u.nome || u.login, [`cli:${cli.id}`]: cli.nome });
  return res.json({ ok: true, seqCliente: numPeca, peca: publica({ ...p, id }, u) });
}

async function pecaReenviar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!podeEnviar(u)) return negado(res, "Seu usuário não envia peças.");
  const b = corpo(req);
  const p = await ler(M, "pecas", b.id);
  if (!p) return res.status(404).json({ code: "nao_encontrado", msg: "Peça não encontrada (pode ter expirado)." });
  if (p.remetente?.login !== u.login && !podeDecidir(u)) return negado(res, "Só quem enviou a peça pode reenviar.");
  if (!["reprovada", "alteracao_solicitada"].includes(p.status)) return res.status(409).json({ code: "status", msg: "Só dá para reenviar peças reprovadas ou com alteração solicitada." });
  const obs = txt(b.obs, 2000);
  const a = await conferirArquivos(u, b.arquivos); if (a.erro) return res.status(400).json({ code: "arquivos", msg: a.erro });
  const l = conferirLinks(b.links); if (l.erro) return res.status(400).json({ code: "links", msg: l.erro });
  if (!a.arquivos.length && !l.links.length) return res.status(400).json({ code: "vazio", msg: "Anexe pelo menos um arquivo ou um link do Google Drive." });
  const em = agora(), n = p.versao + 1;
  p.versoes.push({ n, enviadaEm: em, obs, arquivos: a.arquivos, links: l.links });
  p.historico.push({ tipo: "reenvio", versao: n, em, por: quem(u), comentario: obs });
  Object.assign(p, { versao: n, status: "pendente", atualizadoEm: em });
  await gravar(M, "pecas", p.id, p);
  const incReenvio = { versoes: 1, [`versoes:${u.login}`]: 1 };
  const nomesReenvio = { [u.login]: u.nome || u.login };
  if (p.clienteId) {
    incReenvio[`cli_versoes:${p.clienteId}`] = 1;
    incReenvio[`cli_ver:${p.clienteId}:${u.login}`] = 1;
    if (p.clienteNome) nomesReenvio[`cli:${p.clienteId}`] = p.clienteNome;
  }
  await contar(mesAtual(), incReenvio, nomesReenvio);
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
  p.historico.push({ tipo: decisao, versao: p.versao, em, por: quem(u), comentario });
  Object.assign(p, { status: decisao, atualizadoEm: em, decididoEm: em, decididoPor: quem(u) });
  await gravar(M, "pecas", p.id, p);
  const inc = { [decisao]: 1, [`dec:${u.login}:${decisao}`]: 1 };
  const nomesDec = { [u.login]: u.nome || u.login };
  if (p.clienteId) {
    inc[`cli_dec:${p.clienteId}:${decisao}`] = 1;
    inc[`cli_aprov:${p.clienteId}:${u.login}:${decisao}`] = 1;
    if (p.versao === 1) { inc[`cli_v1_dec:${p.clienteId}`] = 1; if (decisao === "aprovada") inc[`cli_v1_apr:${p.clienteId}`] = 1; }
    if (p.clienteNome) nomesDec[`cli:${p.clienteId}`] = p.clienteNome;
  }
  if (p.versao === 1) { inc.v1_decididas = 1; if (decisao === "aprovada") inc.v1_aprovadas = 1; }
  await contar(mesAtual(), inc, nomesDec);
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
  p.historico = Array.isArray(p.historico) ? p.historico : [];
  p.historico.push({ tipo: "comentario", versao: p.versao, em, por: quem(u), comentario });
  p.atualizadoEm = em;
  await gravar(M, "pecas", p.id, p);
  return res.json({ ok: true, peca: publica(p, u) });
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
  if (chaves.length) { try { await apagarArquivos(chaves); } catch {} }
  await apagar(M, "pecas", p.id);
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
  if (chaves.length) { try { await apagarArquivos(chaves); } catch {} }
  return res.json({ ok: true, apagadas: alvos.length });
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
  if (!veDash(u)) return negado(res, "O dashboard é do Mestre, da gestão, coordenação, atendimento e social media.");
  const de = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.de || "")) ? req.query.de : null;
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.ate || "")) ? req.query.ate : null;
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.mes || "")) ? req.query.mes : mesAtual();

  const [carteira, todasPecas, rMeses] = await Promise.all([
    clientesCarteira(),
    listar(M, "pecas"),
    sql`SELECT id FROM docs WHERE parent = ${`m/${M}/contadores`} AND NOT deleted ORDER BY id DESC`,
  ]);

  const meses = rMeses.map(r => r.id);
  const listaMeses = [...new Set([mesAtual(), ...meses])].sort().reverse();

  if (de || ate) {
    const dadosIntervalo = resumoPorIntervalo(todasPecas, carteira, de, ate);
    return res.json({ mes, de, ate, meses: listaMeses, ...dadosIntervalo });
  }

  const c = await ler(M, "contadores", mes);
  const pecasAtivasMes = todasPecas.filter(p => String(p.criadoEm || p.atualizadoEm || "").slice(0, 7) === mes);
  return res.json({ mes, meses: listaMeses, ...resumoContadores(c, carteira, pecasAtivasMes) });
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
  "peca.comentar": pecaComentar, "peca.excluir": pecaExcluir, "fila.apagar": filaApagar,
  pecas, "peca.arquivo": pecaArquivo, dashboard, "limpeza.executar": limpezaExecutar,
};
export const publicas = { "pecas.cron": pecasCron };
