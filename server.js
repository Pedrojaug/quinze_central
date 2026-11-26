// Servidor HTTP standalone (Node.js 22 ESM) para rodar a Central Quinze em VPS/Docker sem Vercel.
// Reutiliza diretamente os handlers de api/*.js, serve public/ com cleanUrls, recebe uploads locais em /__blob/ e agenda os crons.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { TIPOS_PECAS, extensaoPeca } from "./api/_pecas_upload.js";
import { nomeSeguro } from "./api/_arquivos.js";

const MAX_BODY_JSON_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_LOCAL_BYTES = 150 * 1024 * 1024;

const MIME_ESTATICO = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

const ENDPOINTS_API = {
  "/api/doc": () => import("./api/doc.js"),
  "/api/health": () => import("./api/health.js"),
  "/api/ics": () => import("./api/ics.js"),
  "/api/login": () => import("./api/login.js"),
  "/api/logout": () => import("./api/logout.js"),
  "/api/m": () => import("./api/m.js"),
  "/api/me": () => import("./api/me.js"),
  "/api/senha": () => import("./api/senha.js"),
  "/api/sync": () => import("./api/sync.js"),
  "/api/users": () => import("./api/users.js"),
};

const REWRITES_CRON = {
  "/api/cron/forms": "cs/forms.cron",
  "/api/cron/pecas": "pec/pecas.cron",
  "/api/cron/relatorio": "tar/relatorio.cron",
};

export const CRONS_AGENDADOS = [
  { nome: "forms", rota: "cs/forms.cron", minuto: 0, horasUtc: [11] },
  { nome: "pecas", rota: "pec/pecas.cron", minuto: 0, horasUtc: [9] },
  { nome: "relatorio", rota: "tar/relatorio.cron", minuto: 0, horasUtc: [20, 21, 22, 23, 0, 1, 2] },
];

export function avaliarCronsUtc(data = new Date(), executadosSet = new Set()) {
  const min = data.getUTCMinutes();
  const hora = data.getUTCHours();
  const dia = data.toISOString().slice(0, 10);
  const hh = String(hora).padStart(2, "0");
  const devidos = [];
  for (const cron of CRONS_AGENDADOS) {
    if (min !== cron.minuto || !cron.horasUtc.includes(hora)) continue;
    const chave = `${dia}-${hh}-${cron.nome}`;
    if (executadosSet.has(chave)) continue;
    executadosSet.add(chave);
    devidos.push({ ...cron, chave });
  }
  if (executadosSet.size > 200) {
    const prefixoHoje = `${dia}-`;
    for (const k of executadosSet) {
      if (!k.startsWith(prefixoHoje)) executadosSet.delete(k);
    }
  }
  return devidos;
}

export function validarPathnameUploadLocal(pathname, usuario) {
  const s = String(pathname || "");
  if (!s || s.startsWith("/") || s.includes("..") || !/^[A-Za-z0-9._\/-]{1,300}$/.test(s)) {
    return { ok: false, status: 400, code: "pathname_invalido" };
  }
  const login = String(usuario?.login || "").trim();
  if (!login) return { ok: false, status: 401, code: "unauthorized" };
  const prePecas = `pecas/${nomeSeguro(login).toLowerCase()}/`;
  const ext = extensaoPeca(s);
  if (s.startsWith(prePecas) && TIPOS_PECAS[ext]) {
    return { ok: true, pathname: s };
  }
  const areas = Array.isArray(usuario?.areas) ? usuario.areas : [];
  if (s.startsWith("onboarding/contratos/") && ext === "pdf" && areas.includes("atendimento")) {
    return { ok: true, pathname: s };
  }
  return { ok: false, status: 403, code: "sem_acesso" };
}

export function resolverArquivoEstatico(publicDir, urlPathname) {
  const root = path.resolve(publicDir);
  let bruto;
  try {
    bruto = decodeURIComponent(String(urlPathname || "/"));
  } catch {
    return null;
  }
  if (bruto.includes("\0") || bruto.includes("\\")) return null;
  const segmentos = bruto.split("/").filter(Boolean);
  if (segmentos.some(seg => seg === "." || seg === "..")) return null;

  const candidatos = [];
  if (!segmentos.length) {
    candidatos.push("index.html");
  } else {
    const rel = segmentos.join("/");
    candidatos.push(rel);
    if (!path.posix.extname(rel)) {
      candidatos.push(`${rel}.html`);
      candidatos.push(path.posix.join(rel, "index.html"));
    }
  }

  for (const rel of candidatos) {
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) continue;
    try {
      const st = fs.statSync(abs);
      if (st.isFile()) return abs;
    } catch {}
  }
  return null;
}

function adaptarResposta(res) {
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = obj => {
    if (!res.headersSent) res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = val => {
    if (val == null) {
      res.end();
      return res;
    }
    if (Buffer.isBuffer(val) || typeof val === "string") {
      res.end(val);
      return res;
    }
    if (!res.headersSent) res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(val));
    return res;
  };
  return res;
}

function lerCorpoJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let estourou = false;
    req.on("data", chunk => {
      if (estourou) return;
      total += chunk.length;
      if (total > MAX_BODY_JSON_BYTES) {
        estourou = true;
        reject(Object.assign(new Error("Payload excede o limite."), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (estourou) return;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      const ct = String(req.headers["content-type"] || "").toLowerCase();
      if (!ct || ct.includes("json")) {
        try {
          return resolve(JSON.parse(raw));
        } catch {
          return resolve({});
        }
      }
      return resolve({});
    });
    req.on("error", err => {
      if (!estourou) reject(err);
    });
  });
}

function tratarUploadLocal(req, res, { exigirSessao, dirArquivos }) {
  return (async () => {
    if (req.method !== "PUT") return res.status(405).json({ code: "method" });
    const u = await exigirSessao(req, res);
    if (!u) return;
    const valid = validarPathnameUploadLocal(req.query.pathname, u);
    if (!valid.ok) return res.status(valid.status).json({ code: valid.code });

    const dirBase = path.resolve(dirArquivos);
    const dest = path.resolve(dirBase, valid.pathname);
    if (!dest.startsWith(dirBase + path.sep)) {
      return res.status(400).json({ code: "pathname_invalido" });
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tempPath = `${dest}.part-${crypto.randomBytes(6).toString("hex")}`;

    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(tempPath);
      let bytes = 0;
      let encerrado = false;
      const limparTemp = () => {
        try { fs.unlinkSync(tempPath); } catch {}
      };
      req.on("data", chunk => {
        if (encerrado) return;
        bytes += chunk.length;
        if (bytes > MAX_UPLOAD_LOCAL_BYTES) {
          encerrado = true;
          ws.destroy();
          limparTemp();
          req.destroy();
          res.status(413).json({ code: "arquivo_grande" });
          resolve();
          return;
        }
        if (!ws.write(chunk)) req.pause();
      });
      ws.on("drain", () => {
        if (!encerrado) req.resume();
      });
      req.on("end", () => {
        if (encerrado) return;
        ws.end();
      });
      ws.on("finish", () => {
        if (encerrado) return;
        try {
          fs.renameSync(tempPath, dest);
          res.status(200).json({ ok: true, pathname: valid.pathname, bytes });
          resolve();
        } catch (err) {
          limparTemp();
          reject(err);
        }
      });
      const onErr = err => {
        if (encerrado) return;
        encerrado = true;
        ws.destroy();
        limparTemp();
        reject(err);
      };
      req.on("error", onErr);
      ws.on("error", onErr);
    });
  })();
}

export function criarServidor({
  publicDir = path.join(process.cwd(), "public"),
  arquivosDir = process.env.ARQUIVOS_DIR || "/data/arquivos",
  exigirSessao = null,
  apiHandlers = null,
} = {}) {
  const cacheEndpoints = new Map();
  const resolverEndpoint = async rota => {
    if (apiHandlers && apiHandlers[rota]) return apiHandlers[rota];
    const loader = ENDPOINTS_API[rota];
    if (!loader) return null;
    let prom = cacheEndpoints.get(rota);
    if (!prom) {
      prom = loader()
        .then(mod => mod.default || mod)
        .catch(err => {
          cacheEndpoints.delete(rota);
          throw err;
        });
      cacheEndpoints.set(rota, prom);
    }
    return prom;
  };

  const sessaoFn = exigirSessao || (async (req, res) => {
    const { requireSession } = await import("./api/_lib.js");
    return requireSession(req, res);
  });

  const server = http.createServer(async (req, res) => {
    adaptarResposta(res);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");

    try {
      const url = new URL(req.url || "/", "http://localhost");
      const query = {};
      for (const [k, v] of url.searchParams.entries()) query[k] = v;
      req.query = query;

      if (url.pathname === "/__blob" || url.pathname === "/__blob/") {
        await tratarUploadLocal(req, res, { exigirSessao: sessaoFn, dirArquivos: arquivosDir });
        return;
      }

      let endpointPath = url.pathname;
      if (REWRITES_CRON[endpointPath]) {
        req.query.r = REWRITES_CRON[endpointPath];
        endpointPath = "/api/m";
      }

      if (endpointPath.startsWith("/api/")) {
        const handler = await resolverEndpoint(endpointPath);
        if (!handler) return res.status(404).json({ code: "rota" });
        if (endpointPath !== "/api/m") {
          res.setHeader("Cache-Control", "no-store");
        }
        if (["POST", "PUT", "PATCH"].includes(req.method || "")) {
          try {
            req.body = await lerCorpoJson(req);
          } catch (err) {
            if (err?.status === 413) return res.status(413).json({ code: "too_large" });
            return res.status(400).json({ code: "bad_request" });
          }
        }
        await handler(req, res);
        return;
      }

      if (!["GET", "HEAD"].includes(req.method || "")) {
        return res.status(405).end();
      }
      const arquivo = resolverArquivoEstatico(publicDir, url.pathname);
      if (!arquivo) return res.status(404).send("Not Found");

      const ext = path.extname(arquivo).toLowerCase();
      res.setHeader("Content-Type", MIME_ESTATICO[ext] || "application/octet-stream");
      if (ext === ".html") {
        res.setHeader("Cache-Control", "no-cache");
      } else if (url.searchParams.has("v")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
      res.statusCode = 200;
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(arquivo).pipe(res);
    } catch (err) {
      console.error("[server]", err?.message || err);
      if (!res.headersSent) res.status(500).json({ code: "erro" });
    }
  });

  server._resolverEndpoint = resolverEndpoint;
  return server;
}

export function iniciarCrons({ resolverM } = {}) {
  const segredo = String(process.env.CRON_SECRET || "").trim();
  if (!segredo || process.env.DISABLE_CRONS === "1") return null;
  const executados = new Set();

  const executarTick = async () => {
    const devidos = avaliarCronsUtc(new Date(), executados);
    if (!devidos.length) return;
    let mHandler;
    try {
      mHandler = resolverM ? await resolverM() : (await import("./api/m.js")).default;
    } catch (err) {
      console.error("[cron] falha ao carregar api/m.js:", err?.message || err);
      return;
    }
    for (const cron of devidos) {
      const reqMock = {
        method: "GET",
        query: { r: cron.rota },
        headers: { authorization: `Bearer ${segredo}` },
      };
      const resMock = adaptarResposta({
        statusCode: 200,
        headersSent: false,
        setHeader() {},
        end(b) {
          this.headersSent = true;
          this.rawBody = b;
          return this;
        },
      });
      try {
        await mHandler(reqMock, resMock);
        console.log(`[cron] ${cron.nome} (${cron.rota}) -> HTTP ${resMock.statusCode}`);
      } catch (err) {
        console.error(`[cron] erro em ${cron.nome}:`, err?.message || err);
      }
    }
  };

  const timer = setInterval(() => {
    executarTick().catch(() => {});
  }, 30000);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Math.max(1, parseInt(process.env.PORT || "3000", 10) || 3000);
  const host = process.env.HOST || "0.0.0.0";
  const publicDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(path.join(publicDir, "app.html"))) {
    console.warn("[server] public/app.html não encontrado. Execute `npm run build` antes de iniciar.");
  }
  const dirArqs = process.env.ARQUIVOS_DIR || "/data/arquivos";
  fs.mkdirSync(dirArqs, { recursive: true });

  const srv = criarServidor({ publicDir, arquivosDir: dirArqs });
  const cronTimer = iniciarCrons({ resolverM: () => srv._resolverEndpoint("/api/m") });
  srv.listen(port, host, () => {
    console.log(`[server] Central Quinze rodando em http://${host}:${port} (ARQUIVOS_DIR=${dirArqs})`);
  });

  const desligar = sinal => {
    console.log(`[server] encerrando (${sinal})...`);
    if (cronTimer) clearInterval(cronTimer);
    srv.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => desligar("SIGTERM"));
  process.on("SIGINT", () => desligar("SIGINT"));
}
