// Guarda arquivos (contratos, documentos assinados e peças).
// Na Vercel: Vercel Blob privado (BLOB_READ_WRITE_TOKEN, criado pela própria Vercel ao ligar o Blob).
// Sem o token (testes locais): pasta local ARQUIVOS_DIR.
// O endereço do arquivo nunca vai para a página: o download passa pela rota do módulo, que confere a permissão.
import fs from "node:fs";
import path from "node:path";
import { etagArquivo, aplicarHeadersMidia, responder304SeIgual } from "./_pecas_cache.js";

export const MAX_ARQUIVO = 3 * 1024 * 1024;   // 3 MB (o envio vai em base64 e a Vercel aceita até 4,5 MB por requisição)
const TIPOS = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain" };
const MIME_POR_EXT = {
  ...TIPOS,
  webp: "image/webp",
  gif: "image/gif",
  jfif: "image/jpeg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};
export const extensao = nome => (String(nome || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || "";
export const tipoPermitido = nome => !!TIPOS[extensao(nome)];
const ACENTOS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
export const nomeSeguro = s => String(s || "arquivo").normalize("NFD").replace(ACENTOS, "")
  .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "arquivo";
const blobToken = () => String(process.env.BLOB_READ_WRITE_TOKEN || "").trim();
const local = () => !blobToken();
const emVercel = () => process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
let accessDetectado = null;
export function resetAccessDetectado() {
  accessDetectado = null;
}
export function detectarAccessAlternativo(err, atual) {
  const msg = String(err?.message || "");
  if (/public store|cannot use private/i.test(msg) && atual !== "public") return "public";
  if (/private store|cannot use public/i.test(msg) && atual !== "private") return "private";
  return null;
}
const blobAccess = () => accessDetectado || (String(process.env.BLOB_ACCESS || "").trim().toLowerCase() === "public" ? "public" : "private");
const dirLocal = () => process.env.ARQUIVOS_DIR || "/tmp/qz-arquivos";
function erroBlobNaoConfigurado() {
  return Object.assign(
    new Error("Armazenamento de arquivos (Vercel Blob) não configurado neste ambiente."),
    { code: "blob_nao_configurado", status: 503 }
  );
}

// Decodifica o base64 vindo da página e confere tamanho e tipo.
export function decodificar(b64, nome) {
  if (typeof b64 !== "string" || !tipoPermitido(nome)) return { erro: "tipo_invalido" };
  const buf = Buffer.from(b64.replace(/^data:[^,]*,/, ""), "base64");
  if (!buf.length) return { erro: "arquivo_vazio" };
  if (buf.length > MAX_ARQUIVO) return { erro: "arquivo_grande" };
  if (extensao(nome) === "pdf" && buf.subarray(0, 5).toString() !== "%PDF-") return { erro: "pdf_invalido" };
  return { buf };
}

export async function guardar(chave, buf, nome, tipoExplicito) {
  const contentType = tipoExplicito || MIME_POR_EXT[extensao(nome)] || "application/octet-stream";
  if (local()) {
    if (emVercel()) throw erroBlobNaoConfigurado();
    const f = path.join(dirLocal(), chave);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
    return { chave, tamanho: buf.length, tipo: contentType };
  }
  const { put } = await import("@vercel/blob");
  const access = blobAccess();
  let r;
  try {
    r = await put(chave, buf, { token: blobToken(), access, contentType, addRandomSuffix: false, allowOverwrite: false });
  } catch (e) {
    const alt = detectarAccessAlternativo(e, access);
    if (!alt) throw e;
    accessDetectado = alt;
    r = await put(chave, buf, { token: blobToken(), access: alt, contentType, addRandomSuffix: false, allowOverwrite: false });
  }
  return { chave: r.pathname, tamanho: buf.length, tipo: contentType };
}

async function _getBlob(chave) {
  const { get } = await import("@vercel/blob");
  const access = blobAccess();
  let r;
  try {
    r = await get(chave, { token: blobToken(), access });
  } catch (e) {
    const alt = detectarAccessAlternativo(e, access);
    if (!alt) throw e;
    accessDetectado = alt;
    r = await get(chave, { token: blobToken(), access: alt });
  }
  if ((!r || r.statusCode === 404) && !accessDetectado && !String(process.env.BLOB_ACCESS || "").trim()) {
    const alt = access === "private" ? "public" : "private";
    try {
      const rAlt = await get(chave, { token: blobToken(), access: alt });
      if (rAlt && rAlt.statusCode === 200) {
        accessDetectado = alt;
        return rAlt;
      }
    } catch {}
  }
  return r;
}

// Envia o arquivo na resposta (download ou visualização embutida).
export async function enviar(res, chave, nomeDownload, inline, opts = {}) {
  const { req = null, cacheavel = false } = opts || {};
  const disp = `${inline ? "inline" : "attachment"}; filename="${nomeSeguro(nomeDownload)}"`;
  const etag = cacheavel ? etagArquivo(chave) : "";
  if (cacheavel && req && responder304SeIgual(req, res, { etag })) return res;
  if (local()) {
    const f = path.join(dirLocal(), chave);
    if (!chave || !fs.existsSync(f)) return res.status(404).json({ code: "sem_arquivo" });
    const contentType = MIME_POR_EXT[extensao(chave)] || "application/octet-stream";
    if (cacheavel) {
      aplicarHeadersMidia(res, { contentType, disposition: disp, etag });
    } else {
      res.setHeader("content-type", contentType);
      res.setHeader("content-disposition", disp);
      res.setHeader("cache-control", "private, no-store");
    }
    res.statusCode = 200;
    return res.end(fs.readFileSync(f));
  }
  const r = await _getBlob(chave);
  if (!r || r.statusCode !== 200) return res.status(404).json({ code: "sem_arquivo" });
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  const contentType = r.blob.contentType || "application/octet-stream";
  if (cacheavel) {
    aplicarHeadersMidia(res, { contentType, disposition: disp, etag });
  } else {
    res.setHeader("content-type", contentType);
    res.setHeader("content-disposition", disp);
    res.setHeader("cache-control", "private, no-store");
  }
  res.statusCode = 200;
  return res.end(buf);
}

// Lê o arquivo guardado (para reenviar ao Google Drive, por exemplo).
export async function lerArquivo(chave) {
  if (local()) {
    const f = path.join(dirLocal(), chave);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  const r = await _getBlob(chave);
  return r && r.statusCode === 200 ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
}

// ---------- Envio direto do navegador para o armazenamento (peças, sem passar pela função) ----------
// O servidor gera um token de cliente válido só para aquele caminho (chave), tipos e tamanho; o navegador
// envia o arquivo direto para o Vercel Blob (PUT), com barra de progresso. Sem o token do Blob (teste local),
// o envio vai para a rota local /__blob do servidor de teste.
export async function tokenEnvioDireto(chave, { tipos, maxBytes, minutos = 30 }) {
  if (local()) {
    if (emVercel()) throw erroBlobNaoConfigurado();
    return { url: `/__blob/?pathname=${encodeURIComponent(chave)}`, headers: {}, storeId: "local" };
  }
  const tokenRw = blobToken();
  const { generateClientTokenFromReadWriteToken } = await import("@vercel/blob/client");
  const token = await generateClientTokenFromReadWriteToken({ token: tokenRw, pathname: chave,
    allowedContentTypes: tipos, maximumSizeInBytes: maxBytes, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + minutos * 60000 });
  const storeId = token.split("_")[3];
  return { url: `https://vercel.com/api/blob/?${new URLSearchParams({ pathname: chave })}`, storeId,
    headers: { authorization: `Bearer ${token}`, "x-api-version": "13", "x-vercel-blob-access": blobAccess(), "x-vercel-blob-store-id": storeId } };
}

// Confere se o arquivo existe no armazenamento (depois do envio direto). Devolve { tamanho, tipo } ou null.
export async function infoArquivo(chave) {
  if (local()) {
    const f = path.join(dirLocal(), chave);
    return fs.existsSync(f) ? { tamanho: fs.statSync(f).size, tipo: MIME_POR_EXT[extensao(chave)] || "" } : null;
  }
  const { head } = await import("@vercel/blob");
  try { const h = await head(chave, { token: blobToken() }); return { tamanho: h.size, tipo: h.contentType || "" }; }
  catch (e) { if (/not.?found/i.test(`${e?.name} ${e?.message}`)) return null; throw e; }
}

export async function apagarArquivos(chaves) {
  const lista = (chaves || []).filter(Boolean);
  if (!lista.length) return;
  if (local()) { for (const c of lista) { try { fs.unlinkSync(path.join(dirLocal(), c)); } catch {} } return; }
  const { del } = await import("@vercel/blob");
  for (let i = 0; i < lista.length; i += 100) await del(lista.slice(i, i + 100), { token: blobToken() });
}

// Arquivos guardados sob um prefixo, com a data de envio (para apagar os esquecidos).
export async function listarArquivos(prefixo) {
  if (local()) {
    const base = path.join(dirLocal(), prefixo), out = [];
    const andar = d => { if (!fs.existsSync(d)) return; for (const n of fs.readdirSync(d)) { const f = path.join(d, n); const st = fs.statSync(f);
      if (st.isDirectory()) andar(f); else out.push({ chave: path.relative(dirLocal(), f).split(path.sep).join("/"), enviadoEm: st.mtime.toISOString() }); } };
    andar(base);
    return out;
  }
  const { list } = await import("@vercel/blob");
  const out = [];
  let cursor;
  do {
    const r = await list({ token: blobToken(), prefix: prefixo, cursor, limit: 1000 });
    out.push(...r.blobs.map(b => ({ chave: b.pathname, enviadoEm: new Date(b.uploadedAt).toISOString() })));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

// Link temporário (10 minutos) para ver um arquivo privado direto do armazenamento, depois de a rota conferir
// a permissão. Evita o limite de 4,5 MB de resposta das funções. Local: null (a rota envia o arquivo).
let delegacao = null;
export async function linkTemporario(chave, minutos = 10) {
  if (local()) return null;
  const access = blobAccess();
  if (access === "public") return null;
  const { issueSignedToken, presignUrl } = await import("@vercel/blob");
  const agora = Date.now();
  const margemMs = Math.max(15, Number(minutos) + 15) * 60000;
  if (!delegacao || delegacao.validUntil < agora + margemMs)
    delegacao = await issueSignedToken({ token: blobToken(), pathname: "*", operations: ["get"], validUntil: agora + 6 * 60 * 60000 });
  try {
    const r = await presignUrl(delegacao, { operation: "get", pathname: chave, access, validUntil: agora + minutos * 60000 });
    return r.presignedUrl;
  } catch (e) {
    const alt = detectarAccessAlternativo(e, access);
    if (alt === "public") {
      accessDetectado = "public";
      return null;
    }
    throw e;
  }
}
