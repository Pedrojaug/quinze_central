// Helpers puros de cache HTTP (ETag, 304 Not Modified, headers privados) e versionamento de avatares.
// Não importa _lib.js para permitir testes unitários sem DATABASE_URL.
import crypto from "node:crypto";

export const CACHE_MIDIA_IMUTAVEL = "private, max-age=604800, immutable";
export const CACHE_DRIVE_PROXY = "private, max-age=86400";
export const CACHE_REDIRECT_ASSINADO_SEG = 2700;

export function etagArquivo(chave) {
  const s = String(chave || "").trim();
  if (!s) return "";
  const hash = crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
  return `"qz-${hash}"`;
}

export function bateIfNoneMatch(headers, etag) {
  if (!etag || !headers) return false;
  const raw = headers["if-none-match"] ?? headers["If-None-Match"];
  if (!raw || typeof raw !== "string") return false;
  const alvo = String(etag).trim().replace(/^W\//i, "");
  return raw.split(",").some(parte => {
    const item = parte.trim();
    if (!item) return false;
    if (item === "*") return true;
    return item.replace(/^W\//i, "") === alvo;
  });
}

export function aplicarHeadersMidia(res, { contentType, disposition, etag, cacheControl = CACHE_MIDIA_IMUTAVEL } = {}) {
  if (contentType) res.setHeader("content-type", contentType);
  if (disposition) res.setHeader("content-disposition", disposition);
  res.setHeader("cache-control", cacheControl);
  if (etag) res.setHeader("etag", etag);
  res.setHeader("vary", "Cookie");
  res.setHeader("x-content-type-options", "nosniff");
}

export function responder304SeIgual(req, res, { etag, cacheControl = CACHE_MIDIA_IMUTAVEL } = {}) {
  if (!etag || !bateIfNoneMatch(req?.headers, etag)) return false;
  if (typeof res.setHeader === "function") {
    res.setHeader("etag", etag);
    res.setHeader("cache-control", cacheControl);
    res.setHeader("vary", "Cookie");
  }
  res.statusCode = 304;
  if (typeof res.end === "function") res.end();
  return true;
}

export function versaoAvatares({ avAt = "", usrAt = "", usrCnt = 0 } = {}) {
  const raw = `${avAt ?? ""}|${usrAt ?? ""}|${usrCnt ?? 0}`;
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}
