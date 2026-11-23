// Inspeção e proxy seguro de mídia para links do Google Drive no módulo de Peças.
// Não importa _lib.js para poder ser testado unitariamente sem DATABASE_URL.
import { googleConfigurado, metadadosArquivoDrive, lerArquivoDrive } from "./_google.js";

const ID_DRIVE_RE = /^[A-Za-z0-9_-]{10,200}$/;
const EXT_IMAGEM = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "svg"]);
const EXT_VIDEO = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv", "wmv"]);

const CACHE_MAX = 500;
const TTL_CONHECIDO_MS = 6 * 60 * 60 * 1000;
const TTL_DESCONHECIDO_MS = 10 * 60 * 1000;
const cacheMetaDrive = new Map();

export function limparCacheDriveMeta() {
  cacheMetaDrive.clear();
}

export function extrairDriveFileId(urlBruta) {
  const s = String(urlBruta || "").trim();
  if (!s) return "";
  let u;
  try {
    u = new URL(s);
  } catch {
    return "";
  }
  if (!["https:", "http:"].includes(u.protocol)) return "";
  if (!/(^|\.)(drive|docs)\.google\.com$/i.test(u.hostname)) return "";
  if (/\/folders\//i.test(u.pathname)) return "";
  const m1 = /\/file\/d\/([A-Za-z0-9_-]{10,200})(?:[/?#]|$)/.exec(u.pathname);
  if (m1) return m1[1];
  if (/\/(?:document|spreadsheets|presentation|forms)\/d\//i.test(u.pathname)) return "";
  const idParam = u.searchParams.get("id") || "";
  if (ID_DRIVE_RE.test(idParam)) return idParam;
  return "";
}

export function urlImagemDrive(fid, largura = 1600) {
  const w = Math.max(200, Math.min(2400, Math.round(Number(largura) || 1600)));
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fid)}&sz=w${w}`;
}

export function urlPreviewDrive(fid) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fid)}/preview`;
}

export function ehHostGoogleDrive(hostname) {
  const h = String(hostname || "").trim().toLowerCase();
  if (!h) return false;
  if (h === "drive.google.com" || h === "docs.google.com" || h === "drive.usercontent.google.com") return true;
  return h.endsWith(".googleusercontent.com") && h.length > ".googleusercontent.com".length;
}

function limparNomeDrive(nome) {
  return String(nome || "")
    .trim()
    .replace(/\s*[-–—]\s*Google\s+Drive\s*$/i, "")
    .trim();
}

export function classificarTipoDrive({ mimeType, nome, ogType } = {}) {
  const mime = String(mimeType || "").trim().toLowerCase().split(";")[0];
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";

  const nomeLimpo = limparNomeDrive(nome);
  const mExt = /\.([a-z0-9]{2,5})$/i.exec(nomeLimpo);
  if (mExt) {
    const ext = mExt[1].toLowerCase();
    if (EXT_IMAGEM.has(ext)) return "imagem";
    if (EXT_VIDEO.has(ext)) return "video";
    if (ext === "pdf") return "pdf";
  }

  const og = String(ogType || "").trim().toLowerCase();
  if (og.includes("video")) return "video";

  return "desconhecido";
}

function decodificarEntidades(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = Number(n);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : _;
    });
}

function extrairMetaTag(html, chave) {
  const escChave = chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${escChave}["'][^>]*content=["']([^"']*)["']`, "i").exec(html);
  if (r1) return decodificarEntidades(r1[1]).trim();
  const r2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escChave}["']`, "i").exec(html);
  return r2 ? decodificarEntidades(r2[1]).trim() : "";
}

export function extrairMetadadosHtmlDrive(html) {
  const s = String(html || "");
  if (
    /accounts\.google\.com|ServiceLogin/i.test(s) ||
    /<title[^>]*>\s*(Fazer login|Sign in|Login|Entrar)\b/i.test(s) ||
    /Você precisa de acesso|You need access|Solicitar acesso|Request access/i.test(s)
  ) {
    return { privado: true, nome: "", ogType: "" };
  }

  const ogTitle = extrairMetaTag(s, "og:title");
  const ogType = extrairMetaTag(s, "og:type");
  const mTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(s);
  const titleBruto = mTitle ? decodificarEntidades(mTitle[1]).trim() : "";

  const candidatos = [ogTitle, titleBruto].map(limparNomeDrive).filter(t => t && !/^Google\s+Drive$/i.test(t));
  const nome = candidatos[0] || "";
  return { privado: false, nome, ogType };
}

function nomeDeContentDisposition(header) {
  const s = String(header || "");
  if (!s) return "";
  const mStar = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\r\n]+)/i.exec(s);
  if (mStar) {
    try { return limparNomeDrive(decodeURIComponent(mStar[1].replace(/^["']|["']$/g, ""))); } catch {}
  }
  const mSimple = /filename\s*=\s*"([^"]+)"/i.exec(s) || /filename\s*=\s*([^;\r\n]+)/i.exec(s);
  return mSimple ? limparNomeDrive(mSimple[1].replace(/^["']|["']$/g, "")) : "";
}

async function lerHeadHtmlLimitado(res, maxBytes = 65536) {
  if (!res.body || typeof res.body.getReader !== "function") {
    if (typeof res.text === "function") return (await res.text()).slice(0, maxBytes);
    return "";
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder("utf-8", { fatal: false });
  let total = 0;
  let texto = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) {
        total += value.length;
        texto += dec.decode(value, { stream: true });
        if (/<\/head>/i.test(texto) || total >= maxBytes) break;
      }
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }
  return texto.slice(0, maxBytes);
}

async function fetchDriveSeguro(urlInicial, { fetchImpl = fetch, maxSaltos = 3, timeoutMs = 3000 } = {}) {
  let atual = urlInicial;
  for (let i = 0; i <= maxSaltos; i++) {
    let u;
    try { u = new URL(atual); } catch { return null; }
    if (u.protocol !== "https:" || !ehHostGoogleDrive(u.hostname)) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(atual, {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; CentralQuinze/1.0)",
          "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });
    } catch {
      clearTimeout(timer);
      return null;
    }

    if (res && res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      try { await res.body?.cancel?.(); } catch {}
      const loc = res.headers?.get?.("location");
      if (!loc) return null;
      try { atual = new URL(loc, atual).toString(); } catch { return null; }
      continue;
    }

    return { res, urlFinal: atual, clear: () => clearTimeout(timer) };
  }
  return null;
}

function gravarCache(fid, valor) {
  const ttl = valor.tipo === "desconhecido" ? TTL_DESCONHECIDO_MS : TTL_CONHECIDO_MS;
  if (cacheMetaDrive.size >= CACHE_MAX) {
    const primeira = cacheMetaDrive.keys().next().value;
    if (primeira !== undefined) cacheMetaDrive.delete(primeira);
  }
  cacheMetaDrive.set(fid, { valor, exp: Date.now() + ttl });
}

export async function inspecionarDriveId(fid, { fetchImpl = fetch, driveApiImpl, semCache = false } = {}) {
  const id = String(fid || "").trim();
  const fallback = { fileId: id, tipo: "desconhecido", nome: "", mimeType: "" };
  if (!ID_DRIVE_RE.test(id)) return fallback;

  if (!semCache) {
    const hit = cacheMetaDrive.get(id);
    if (hit) {
      if (Date.now() < hit.exp) return { fileId: id, ...hit.valor };
      cacheMetaDrive.delete(id);
    }
  }

  let resultado = { tipo: "desconhecido", nome: "", mimeType: "" };
  let privado = false;

  try {
    // 1. Google Drive API (se configurada ou injetada em teste)
    if (driveApiImpl || googleConfigurado()) {
      try {
        const meta = await (driveApiImpl || metadadosArquivoDrive)(id);
        if (meta) {
          const nome = limparNomeDrive(meta.nome || "");
          const mimeType = String(meta.mimeType || "").trim();
          const tipo = classificarTipoDrive({ mimeType, nome });
          resultado = { tipo, nome, mimeType };
          if (tipo !== "desconhecido") {
            if (!semCache) gravarCache(id, resultado);
            return { fileId: id, ...resultado };
          }
        }
      } catch {}
    }

    // 2. Página pública /view (apenas <head> limitado a 64 KB)
    const viewReq = await fetchDriveSeguro(`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`, {
      fetchImpl, maxSaltos: 3, timeoutMs: 3000,
    });
    if (viewReq) {
      try {
        if (viewReq.res.ok) {
          const html = await lerHeadHtmlLimitado(viewReq.res, 65536);
          const metaHtml = extrairMetadadosHtmlDrive(html);
          if (metaHtml.privado) {
            privado = true;
          } else {
            const nome = metaHtml.nome || resultado.nome;
            const tipo = classificarTipoDrive({ mimeType: resultado.mimeType, nome, ogType: metaHtml.ogType });
            resultado = { tipo, nome, mimeType: resultado.mimeType };
            if (tipo !== "desconhecido") {
              if (!semCache) gravarCache(id, resultado);
              return { fileId: id, ...resultado };
            }
          }
        } else {
          try { await viewReq.res.body?.cancel?.(); } catch {}
        }
      } finally {
        viewReq.clear();
      }
    }

    // 3. Fallback cabeçalhos de download (quando não privado)
    if (!privado) {
      const dlReq = await fetchDriveSeguro(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, {
        fetchImpl, maxSaltos: 3, timeoutMs: 2500,
      });
      if (dlReq) {
        try {
          const ct = String(dlReq.res.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase();
          const disp = dlReq.res.headers?.get?.("content-disposition") || "";
          const nomeDisp = nomeDeContentDisposition(disp);
          const nome = nomeDisp || resultado.nome;
          const mimeEfetivo = ct && ct !== "text/html" && ct !== "application/octet-stream" ? ct : "";
          const tipo = classificarTipoDrive({ mimeType: mimeEfetivo, nome });
          resultado = { tipo, nome, mimeType: mimeEfetivo || resultado.mimeType };
        } finally {
          try { await dlReq.res.body?.cancel?.(); } catch {}
          dlReq.clear();
        }
      }
    }
  } catch {}

  if (!semCache) gravarCache(id, resultado);
  return { fileId: id, ...resultado };
}

export async function inspecionarLinksDrive(links, existentes = {}, opts = {}) {
  const arr = Array.isArray(links) ? links : [];
  const ids = [];
  const vistos = new Set();
  for (const item of arr) {
    const s = String(item || "").trim();
    if (!s) continue;
    const fid = ID_DRIVE_RE.test(s) ? s : extrairDriveFileId(s);
    if (!fid || vistos.has(fid)) continue;
    vistos.add(fid);
    ids.push(fid);
    if (ids.length >= 30) break;
  }

  const out = {};
  const pendentes = [];
  for (const fid of ids) {
    const ex = existentes && existentes[fid];
    if (ex && ex.tipo && ex.tipo !== "desconhecido") {
      out[fid] = { tipo: ex.tipo, nome: ex.nome || "", mimeType: ex.mimeType || "" };
    } else {
      pendentes.push(fid);
    }
  }

  if (pendentes.length) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(5, pendentes.length) }, async () => {
      while (cursor < pendentes.length) {
        const fid = pendentes[cursor++];
        const r = await inspecionarDriveId(fid, opts);
        out[fid] = { tipo: r.tipo, nome: r.nome || "", mimeType: r.mimeType || "" };
      }
    });
    await Promise.all(workers);
  }

  return out;
}

async function lerBufferLimitado(res, maxBytes) {
  const cl = Number(res.headers?.get?.("content-length") || 0);
  if (cl > maxBytes) {
    try { await res.body?.cancel?.(); } catch {}
    return null;
  }
  if (!res.body || typeof res.body.getReader !== "function") {
    if (typeof res.arrayBuffer !== "function") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= maxBytes ? buf : null;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.length) {
      total += value.length;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  }
  return total > 0 ? Buffer.concat(chunks) : null;
}

export async function baixarImagemDrive(fid, maxBytes = 4 * 1024 * 1024, { fetchImpl = fetch, lerDriveImpl } = {}) {
  const id = String(fid || "").trim();
  if (!ID_DRIVE_RE.test(id)) return null;

  // 1. Conta de serviço Drive API (funciona inclusive para arquivos compartilhados só com a conta de serviço)
  if (lerDriveImpl || googleConfigurado()) {
    try {
      const arq = await (lerDriveImpl || lerArquivoDrive)(id, maxBytes);
      const tipo = String(arq?.tipo || "").split(";")[0].trim().toLowerCase();
      if (arq && tipo.startsWith("image/") && Buffer.isBuffer(arq.buf) && arq.buf.length > 0 && arq.buf.length <= maxBytes) {
        return { tipo, nome: arq.nome || `${id}`, buf: arq.buf };
      }
    } catch {}
  }

  // 2. Fallback thumbnail público do Google Drive
  const req = await fetchDriveSeguro(urlImagemDrive(id, 2400), {
    fetchImpl, maxSaltos: 4, timeoutMs: 4000,
  });
  if (!req) return null;
  try {
    if (!req.res.ok) {
      try { await req.res.body?.cancel?.(); } catch {}
      return null;
    }
    const ct = String(req.res.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) {
      try { await req.res.body?.cancel?.(); } catch {}
      return null;
    }
    const buf = await lerBufferLimitado(req.res, maxBytes);
    if (!buf) return null;
    const nome = nomeDeContentDisposition(req.res.headers?.get?.("content-disposition") || "") || id;
    return { tipo: ct, nome, buf };
  } catch {
    return null;
  } finally {
    req.clear();
  }
}
