// Guarda arquivos (contratos, documentos assinados, código de ética).
// Na Vercel: Vercel Blob privado (BLOB_READ_WRITE_TOKEN, criado pela própria Vercel ao ligar o Blob).
// Sem o token (testes locais): pasta local ARQUIVOS_DIR.
// O endereço do arquivo nunca vai para a página: o download passa pela rota do módulo, que confere a permissão.
import fs from "node:fs";
import path from "node:path";

export const MAX_ARQUIVO = 3 * 1024 * 1024;   // 3 MB (o envio vai em base64 e a Vercel aceita até 4,5 MB por requisição)
const TIPOS = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain" };
export const extensao = nome => (String(nome || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || "";
export const tipoPermitido = nome => !!TIPOS[extensao(nome)];
const ACENTOS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
export const nomeSeguro = s => String(s || "arquivo").normalize("NFD").replace(ACENTOS, "")
  .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "arquivo";
const local = () => !process.env.BLOB_READ_WRITE_TOKEN;
const dirLocal = () => process.env.ARQUIVOS_DIR || "/tmp/qz-arquivos";

// Decodifica o base64 vindo da página e confere tamanho e tipo.
export function decodificar(b64, nome) {
  if (typeof b64 !== "string" || !tipoPermitido(nome)) return { erro: "tipo_invalido" };
  const buf = Buffer.from(b64.replace(/^data:[^,]*,/, ""), "base64");
  if (!buf.length) return { erro: "arquivo_vazio" };
  if (buf.length > MAX_ARQUIVO) return { erro: "arquivo_grande" };
  if (extensao(nome) === "pdf" && buf.subarray(0, 5).toString() !== "%PDF-") return { erro: "pdf_invalido" };
  return { buf };
}

export async function guardar(chave, buf, nome) {
  const contentType = TIPOS[extensao(nome)] || "application/octet-stream";
  if (local()) {
    const f = path.join(dirLocal(), chave);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, buf);
    return { chave, tamanho: buf.length, tipo: contentType };
  }
  const { put } = await import("@vercel/blob");
  const r = await put(chave, buf, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  return { chave: r.pathname, tamanho: buf.length, tipo: contentType };
}

// Envia o arquivo na resposta (download ou visualização embutida).
export async function enviar(res, chave, nomeDownload, inline) {
  const disp = `${inline ? "inline" : "attachment"}; filename="${nomeSeguro(nomeDownload)}"`;
  if (local()) {
    const f = path.join(dirLocal(), chave);
    if (!chave || !fs.existsSync(f)) return res.status(404).json({ code: "sem_arquivo" });
    res.setHeader("content-type", TIPOS[extensao(chave)] || "application/octet-stream");
    res.setHeader("content-disposition", disp);
    res.statusCode = 200;
    return res.end(fs.readFileSync(f));
  }
  const { get } = await import("@vercel/blob");
  const r = await get(chave, { access: "private" });
  if (!r || r.statusCode !== 200) return res.status(404).json({ code: "sem_arquivo" });
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  res.setHeader("content-type", r.blob.contentType || "application/octet-stream");
  res.setHeader("content-disposition", disp);
  res.setHeader("cache-control", "private, no-store");
  res.statusCode = 200;
  return res.end(buf);
}

// Lê o arquivo guardado (para reenviar ao Google Drive, por exemplo).
export async function lerArquivo(chave) {
  if (local()) {
    const f = path.join(dirLocal(), chave);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  const { get } = await import("@vercel/blob");
  const r = await get(chave, { access: "private" });
  return r && r.statusCode === 200 ? Buffer.from(await new Response(r.stream).arrayBuffer()) : null;
}

// ---------- Envio direto do navegador para o armazenamento (peças, sem passar pela função) ----------
// O servidor gera um token de cliente válido só para aquele caminho (chave), tipos e tamanho; o navegador
// envia o arquivo direto para o Vercel Blob (PUT), com barra de progresso. Sem o token do Blob (teste local),
// o envio vai para a rota local /__blob do servidor de teste.
export async function tokenEnvioDireto(chave, { tipos, maxBytes, minutos = 30 }) {
  if (local()) return { url: `/__blob/?pathname=${encodeURIComponent(chave)}`, headers: {} };
  const { generateClientTokenFromReadWriteToken } = await import("@vercel/blob/client");
  const token = await generateClientTokenFromReadWriteToken({ token: process.env.BLOB_READ_WRITE_TOKEN, pathname: chave,
    allowedContentTypes: tipos, maximumSizeInBytes: maxBytes, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + minutos * 60000 });
  const storeId = token.split("_")[3];
  return { url: `https://vercel.com/api/blob/?${new URLSearchParams({ pathname: chave })}`,
    headers: { authorization: `Bearer ${token}`, "x-api-version": "12", "x-vercel-blob-access": "private", "x-vercel-blob-store-id": storeId } };
}

// Confere se o arquivo existe no armazenamento (depois do envio direto). Devolve { tamanho, tipo } ou null.
export async function infoArquivo(chave) {
  if (local()) {
    const f = path.join(dirLocal(), chave);
    return fs.existsSync(f) ? { tamanho: fs.statSync(f).size, tipo: TIPOS[extensao(chave)] || "" } : null;
  }
  const { head } = await import("@vercel/blob");
  try { const h = await head(chave); return { tamanho: h.size, tipo: h.contentType || "" }; }
  catch (e) { if (/not.?found/i.test(`${e?.name} ${e?.message}`)) return null; throw e; }
}

export async function apagarArquivos(chaves) {
  const lista = (chaves || []).filter(Boolean);
  if (!lista.length) return;
  if (local()) { for (const c of lista) { try { fs.unlinkSync(path.join(dirLocal(), c)); } catch {} } return; }
  const { del } = await import("@vercel/blob");
  for (let i = 0; i < lista.length; i += 100) await del(lista.slice(i, i + 100));
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
    const r = await list({ prefix: prefixo, cursor, limit: 1000 });
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
  const { issueSignedToken, presignUrl } = await import("@vercel/blob");
  const agora = Date.now();
  if (!delegacao || delegacao.validUntil < agora + 15 * 60000)
    delegacao = await issueSignedToken({ pathname: "*", operations: ["get"], validUntil: agora + 60 * 60000 });
  const r = await presignUrl(delegacao, { operation: "get", pathname: chave, access: "private", validUntil: agora + minutos * 60000 });
  return r.presignedUrl;
}
