// Acesso aos dados dos módulos servidos só pela rota /api/m (m/<modulo>/<colecao>/<id> na tabela docs).
import crypto from "node:crypto";
import { sql, carregarMapaAvatares } from "./_lib.js";

export const novoId = () => Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
const ID = /^[A-Za-z0-9_\-.@+]{1,120}$/;
export const idValido = id => typeof id === "string" && ID.test(id) && id !== "." && id !== "..";

export async function listar(modulo, colecao) {
  const parent = `m/${modulo}/${colecao}`;
  const r = await sql`SELECT id, data FROM docs WHERE parent = ${parent} AND NOT deleted ORDER BY seq`;
  return r.map(x => ({ ...x.data, id: x.id }));
}
export function montarPaginacao(itens = [], { limite = 50, offset = 0 } = {}) {
  const lista = Array.isArray(itens) ? itens : [];
  const lim = Math.min(500, Math.max(1, parseInt(limite, 10) || 50));
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const fatia = lista.slice(off, off + lim);
  return {
    itens: fatia,
    total: lista.length,
    limite: lim,
    offset: off,
    temMais: off + fatia.length < lista.length,
  };
}
export async function listarPaginado(modulo, colecao, { limite = 50, offset = 0, ordem = "desc" } = {}) {
  const parent = `m/${modulo}/${colecao}`;
  const lim = Math.min(200, Math.max(1, parseInt(limite, 10) || 50));
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const [contagem, linhas] = await Promise.all([
    sql`SELECT count(*)::int AS total FROM docs WHERE parent = ${parent} AND NOT deleted`,
    ordem === "asc"
      ? sql`SELECT id, data FROM docs WHERE parent = ${parent} AND NOT deleted ORDER BY seq ASC LIMIT ${lim} OFFSET ${off}`
      : sql`SELECT id, data FROM docs WHERE parent = ${parent} AND NOT deleted ORDER BY seq DESC LIMIT ${lim} OFFSET ${off}`,
  ]);
  const total = Number(contagem[0]?.total) || 0;
  const itens = linhas.map(x => ({ ...x.data, id: x.id }));
  return {
    itens,
    total,
    limite: lim,
    offset: off,
    temMais: off + itens.length < total,
  };
}
export async function ler(modulo, colecao, id) {
  if (!idValido(id)) return null;
  const r = await sql`SELECT data FROM docs WHERE path = ${`m/${modulo}/${colecao}/${id}`} AND NOT deleted`;
  return r[0] ? { ...r[0].data, id } : null;
}
export async function gravar(modulo, colecao, id, data) {
  const parent = `m/${modulo}/${colecao}`, path = `${parent}/${id}`;
  const { id: _x, ...d } = data;
  await sql`INSERT INTO docs (path, parent, id, data) VALUES (${path}, ${parent}, ${id}, ${JSON.stringify(d)}::jsonb)
            ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now(), seq = nextval('docs_seq')`;
  return { ...d, id };
}
// Grava só se ainda não existir (ex.: registro de leitura, que não pode ser refeito). Devolve true se gravou.
export async function criarSeNovo(modulo, colecao, id, data) {
  const parent = `m/${modulo}/${colecao}`, path = `${parent}/${id}`;
  const r = await sql`INSERT INTO docs (path, parent, id, data) VALUES (${path}, ${parent}, ${id}, ${JSON.stringify(data)}::jsonb)
                      ON CONFLICT (path) DO NOTHING RETURNING id`;
  return r.length > 0;
}
export async function apagar(modulo, colecao, id) {
  await sql`UPDATE docs SET deleted = true, data = '{}'::jsonb, updated_at = now(), seq = nextval('docs_seq')
            WHERE path = ${`m/${modulo}/${colecao}/${id}`}`;
}
export async function auditar(u, modulo, acao, alvo, detalhe) {
  await sql`INSERT INTO auditoria (login, modulo, acao, alvo, detalhe)
            VALUES (${u.login}, ${modulo}, ${acao}, ${alvo || null}, ${detalhe ? JSON.stringify(detalhe) : null}::jsonb)`;
}
export function escolherMesCarteira(mesesDisponiveis = [], mesAlvo = null) {
  const ordenados = [...new Set(mesesDisponiveis.filter(m => typeof m === "string" && m.trim()))].sort();
  if (!ordenados.length) return null;
  if (mesAlvo && ordenados.includes(mesAlvo)) return mesAlvo;
  if (mesAlvo) {
    const anteriores = ordenados.filter(m => m <= mesAlvo);
    return anteriores.length ? anteriores[anteriores.length - 1] : ordenados[ordenados.length - 1];
  }
  return ordenados[ordenados.length - 1];
}

export function normalizarClientesCarteira(rows = []) {
  return rows
    .map(x => ({
      id: x.id,
      nome: x.data?.nome || x.id,
      status: x.data?.status || "",
      tipo: x.data?.tipo || "",
      nivel: x.data?.nivel || "",
      atendimento: x.data?.atendimento || "",
      social: x.data?.social || "",
      conteudos: Number(x.data?.conteudos) || 0,
      motions: Number(x.data?.motions) || 0,
    }))
    .filter(c => {
      const st = String(c.status || "").trim().toLowerCase();
      return st !== "inativo" && st !== "retirado";
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

// Clientes da Carteira (do mês alvo ou do mês mais recente com clientes), excluindo inativos e retirados.
export async function clientesCarteiraComMes(mesAlvo = null) {
  if (mesAlvo && /^\d{4}-\d{2}$/.test(mesAlvo)) {
    const rows = await sql`SELECT id, data FROM docs WHERE parent = ${`meses/${mesAlvo}/clientes`} AND NOT deleted`;
    if (rows.length > 0) return { mes: mesAlvo, clientes: normalizarClientesCarteira(rows) };
  }
  const parents = await sql`SELECT DISTINCT parent FROM docs WHERE parent LIKE 'meses/%/clientes' AND NOT deleted`;
  const mesesDisponiveis = parents.map(p => String(p.parent || "").split("/")[1]).filter(Boolean);
  const mes = escolherMesCarteira(mesesDisponiveis, mesAlvo);
  if (!mes) return { mes: null, clientes: [] };
  const rows = await sql`SELECT id, data FROM docs WHERE parent = ${`meses/${mes}/clientes`} AND NOT deleted`;
  return { mes, clientes: normalizarClientesCarteira(rows) };
}
export async function clientesCarteira(mesAlvo = null) {
  const { clientes } = await clientesCarteiraComMes(mesAlvo);
  return clientes;
}
export async function usuariosAtivos() {
  const [r, mapaAv] = await Promise.all([
    sql`SELECT login, nome, funcao, papel FROM usuarios WHERE ativo ORDER BY nome`,
    carregarMapaAvatares(),
  ]);
  return r.map(u => ({ ...u, avatar: mapaAv[u.login] || null }));
}
// Corpo JSON com limite de texto por campo (evita lixo gigante nos documentos).
export const txt = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
export const dataIso = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
export const num = v => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
