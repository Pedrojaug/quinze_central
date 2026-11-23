// Armazenamento de contingência no Neon Postgres (tabela docs) quando o Vercel Blob falhar/suspender.
// Importa _lib.js apenas sob demanda para manter os testes unitários independentes de DATABASE_URL.
import crypto from "node:crypto";
import { nomeSeguro } from "./_arquivos.js";

export const BLOBS_DB_PARENT = "m/pecas/blobs";

async function getSql(sqlImpl) {
  if (sqlImpl) return sqlImpl;
  const mod = await import("./_lib.js");
  return mod.sql;
}

export function ehChaveBanco(chave) {
  return /^pecas\/[^/]+\/db-\d{8}-[a-f0-9]+\//i.test(String(chave || ""));
}

export function blobDocId(chave) {
  return crypto.createHash("sha256").update(String(chave || "")).digest("hex").slice(0, 40);
}

export async function guardarBlobNoBanco({ chave, buf, nome, tipo, emIso }, sqlImpl) {
  if (!chave || !Buffer.isBuffer(buf) || !buf.length) {
    throw new Error("Arquivo inválido para armazenamento no banco.");
  }
  const id = blobDocId(chave);
  const docPath = `${BLOBS_DB_PARENT}/${id}`;
  const enviadoEm = emIso || new Date().toISOString();
  const contentType = tipo || "application/octet-stream";
  const doc = {
    chave,
    nome: String(nome || chave.split("/").pop() || "arquivo"),
    tipo: contentType,
    tamanho: buf.length,
    b64: buf.toString("base64"),
    enviadoEm,
  };
  const sql = await getSql(sqlImpl);
  await sql`INSERT INTO docs (path, parent, id, data)
            VALUES (${docPath}, ${BLOBS_DB_PARENT}, ${id}, ${JSON.stringify(doc)}::jsonb)
            ON CONFLICT (path) DO UPDATE SET data = EXCLUDED.data, deleted = false, updated_at = now(), seq = nextval('docs_seq')`;
  return { chave, tamanho: buf.length, tipo: contentType, path: docPath };
}

export async function infoBlobNoBanco(chave, sqlImpl) {
  if (!chave) return null;
  const docPath = `${BLOBS_DB_PARENT}/${blobDocId(chave)}`;
  const sql = await getSql(sqlImpl);
  const r = await sql`SELECT data->>'tipo' AS tipo, (data->>'tamanho')::int AS tamanho FROM docs WHERE path = ${docPath} AND NOT deleted`;
  if (!r || !r[0]) return null;
  return { tamanho: Number(r[0].tamanho) || 0, tipo: r[0].tipo || "" };
}

export async function lerBlobDoBanco(chave, sqlImpl) {
  if (!chave) return null;
  const docPath = `${BLOBS_DB_PARENT}/${blobDocId(chave)}`;
  const sql = await getSql(sqlImpl);
  const r = await sql`SELECT data FROM docs WHERE path = ${docPath} AND NOT deleted`;
  const d = r && r[0]?.data;
  if (!d || typeof d.b64 !== "string") return null;
  return {
    buf: Buffer.from(d.b64, "base64"),
    tipo: d.tipo || "application/octet-stream",
    nome: d.nome || "arquivo",
    tamanho: Number(d.tamanho) || 0,
  };
}

export async function enviarBlobDoBanco(res, chave, nomeDownload, inline = true, sqlImpl) {
  const item = await lerBlobDoBanco(chave, sqlImpl);
  if (!item) return res.status(404).json({ code: "sem_arquivo" });
  const disp = `${inline ? "inline" : "attachment"}; filename="${nomeSeguro(nomeDownload || item.nome)}"`;
  res.setHeader("content-type", item.tipo || "application/octet-stream");
  res.setHeader("content-disposition", disp);
  res.setHeader("cache-control", "private, max-age=3600");
  res.setHeader("x-content-type-options", "nosniff");
  res.statusCode = 200;
  return res.end(item.buf);
}

export async function apagarBlobsDoBanco(chaves, sqlImpl) {
  const paths = [...new Set((chaves || []).filter(Boolean).map(c => `${BLOBS_DB_PARENT}/${blobDocId(c)}`))];
  if (!paths.length) return;
  const sql = await getSql(sqlImpl);
  await sql`DELETE FROM docs WHERE path = ANY(${paths})`;
}

export async function listarBlobsDoBanco(sqlImpl) {
  const sql = await getSql(sqlImpl);
  const r = await sql`SELECT data->>'chave' AS chave, coalesce(data->>'enviadoEm', updated_at::text) AS enviado_em
                      FROM docs WHERE parent = ${BLOBS_DB_PARENT} AND NOT deleted`;
  return (r || []).filter(x => x.chave).map(x => ({ chave: x.chave, enviadoEm: x.enviado_em }));
}
