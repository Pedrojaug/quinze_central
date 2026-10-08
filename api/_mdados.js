// Acesso aos dados dos módulos servidos só pela rota /api/m (m/<modulo>/<colecao>/<id> na tabela docs).
import crypto from "node:crypto";
import { sql } from "./_lib.js";

export const novoId = () => Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
const ID = /^[A-Za-z0-9_\-.@+]{1,120}$/;
export const idValido = id => typeof id === "string" && ID.test(id) && id !== "." && id !== "..";

export async function listar(modulo, colecao) {
  const parent = `m/${modulo}/${colecao}`;
  const r = await sql`SELECT id, data FROM docs WHERE parent = ${parent} AND NOT deleted ORDER BY seq`;
  return r.map(x => ({ ...x.data, id: x.id }));
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
// Clientes da Carteira (mês mais recente que tiver clientes), para as listas suspensas.
export async function clientesCarteira() {
  const r = await sql`SELECT parent, id, data FROM docs WHERE parent LIKE 'meses/%/clientes' AND NOT deleted`;
  const porMes = {};
  r.forEach(x => (porMes[x.parent.split("/")[1]] ||= []).push({ id: x.id, nome: x.data.nome || x.id, status: x.data.status || "" }));
  const mes = Object.keys(porMes).sort().pop();
  return (mes ? porMes[mes] : []).filter(c => c.status !== "inativo").sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
export async function usuariosAtivos() {
  const r = await sql`SELECT login, nome, funcao, papel FROM usuarios WHERE ativo ORDER BY nome`;
  return r;
}
// Corpo JSON com limite de texto por campo (evita lixo gigante nos documentos).
export const txt = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
export const dataIso = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
export const num = v => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
