process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  criarServidor,
  validarPathnameUploadLocal,
  resolverArquivoEstatico,
  avaliarCronsUtc,
} from "../server.js";
import { enviar as enviarArquivoDisco } from "../api/_arquivos.js";
import { etagArquivo, CACHE_MIDIA_IMUTAVEL } from "../api/_pecas_cache.js";

function garantirPublic() {
  const pub = path.join(process.cwd(), "public");
  if (!fs.existsSync(path.join(pub, "app.html"))) {
    const r = spawnSync(process.execPath, ["build.js"], { encoding: "utf8" });
    assert.equal(r.status, 0);
  }
  return pub;
}

async function comServidor(opts, fn) {
  const srv = criarServidor(opts);
  await new Promise(resolve => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise(resolve => srv.close(resolve));
  }
}

test("cleanUrls, arquivos estáticos, cache imutável ?v= e bloqueio de traversal em server.js", async () => {
  const publicDir = garantirPublic();
  assert.equal(resolverArquivoEstatico(publicDir, "/../package.json"), null);
  assert.ok(resolverArquivoEstatico(publicDir, "/app")?.endsWith(`${path.sep}app.html`));

  await comServidor({ publicDir }, async baseUrl => {
    const rIndex = await fetch(`${baseUrl}/`);
    assert.equal(rIndex.status, 200);
    assert.match(rIndex.headers.get("content-type") || "", /^text\/html/);
    assert.equal(rIndex.headers.get("cache-control"), "no-cache");
    assert.equal(rIndex.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(rIndex.headers.get("x-content-type-options"), "nosniff");
    assert.equal(rIndex.headers.get("referrer-policy"), "same-origin");

    const rApp = await fetch(`${baseUrl}/app`);
    assert.equal(rApp.status, 200);
    const htmlApp = await rApp.text();
    assert.equal(htmlApp.includes("window.__QZ_BUILD"), true);

    const rAsset = await fetch(`${baseUrl}/store.js?v=12345678`);
    assert.equal(rAsset.status, 200);
    assert.match(rAsset.headers.get("content-type") || "", /javascript/);
    assert.equal(rAsset.headers.get("cache-control"), "public, max-age=31536000, immutable");

    const rTrav = await fetch(`${baseUrl}/../package.json`);
    assert.equal(rTrav.status, 404);
  });
});

test("roteamento /api/* com req.body JSON e rewrites de /api/cron/*", async () => {
  const publicDir = garantirPublic();
  let capturadoLogin = null;
  let capturadoCron = null;

  const apiHandlers = {
    "/api/login": async (req, res) => {
      capturadoLogin = req.body;
      return res.status(200).json({ ok: true, user: req.body?.user });
    },
    "/api/m": async (req, res) => {
      capturadoCron = req.query?.r;
      return res.status(200).json({ ok: true, rota: req.query?.r });
    },
  };

  await comServidor({ publicDir, apiHandlers }, async baseUrl => {
    const rLogin = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: "eduardo", pass: "segredo" }),
    });
    assert.equal(rLogin.status, 200);
    assert.equal(rLogin.headers.get("cache-control"), "no-store");
    assert.deepEqual(capturadoLogin, { user: "eduardo", pass: "segredo" });
    assert.deepEqual(await rLogin.json(), { ok: true, user: "eduardo" });

    const rCron = await fetch(`${baseUrl}/api/cron/pecas`);
    assert.equal(rCron.status, 200);
    assert.equal(capturadoCron, "pec/pecas.cron");
    assert.deepEqual(await rCron.json(), { ok: true, rota: "pec/pecas.cron" });
  });
});

test("PUT /__blob/ exige sessão, valida pathname e grava em ARQUIVOS_DIR com leitura ETag + 304", async () => {
  const publicDir = garantirPublic();
  const tmpArqs = fs.mkdtempSync(path.join(os.tmpdir(), "qz-srv-arqs-"));
  const prevTok = process.env.BLOB_READ_WRITE_TOKEN;
  const prevDir = process.env.ARQUIVOS_DIR;

  let usuarioAtual = null;
  const exigirSessao = async (_req, res) => {
    if (!usuarioAtual) {
      res.status(401).json({ error: "unauthorized" });
      return null;
    }
    return usuarioAtual;
  };

  try {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.ARQUIVOS_DIR = tmpArqs;

    assert.equal(
      validarPathnameUploadLocal("pecas/artur.da/20261126-abc/arte.png", { login: "artur.da", areas: ["pecas"] }).ok,
      true
    );
    assert.equal(
      validarPathnameUploadLocal("pecas/outro/20261126-abc/arte.png", { login: "artur.da", areas: ["pecas"] }).status,
      403
    );
    assert.equal(
      validarPathnameUploadLocal("pecas/artur.da/../segredo.png", { login: "artur.da", areas: ["pecas"] }).status,
      400
    );
    assert.equal(
      validarPathnameUploadLocal("onboarding/contratos/o1/20261126-aa/contrato.pdf", { login: "u1", areas: ["atendimento"] }).ok,
      true
    );

    await comServidor({ publicDir, arquivosDir: tmpArqs, exigirSessao }, async baseUrl => {
      const chave = "pecas/artur.da/20261126-abc123/arte.png";
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

      // 1. Sem sessão -> 401
      const r401 = await fetch(`${baseUrl}/__blob/?pathname=${encodeURIComponent(chave)}`, {
        method: "PUT",
        body: bytes,
      });
      assert.equal(r401.status, 401);

      // 2. Outro usuário -> 403
      usuarioAtual = { login: "artur.da", areas: ["pecas"] };
      const r403 = await fetch(`${baseUrl}/__blob/?pathname=${encodeURIComponent("pecas/outro/20261126-abc/arte.png")}`, {
        method: "PUT",
        body: bytes,
      });
      assert.equal(r403.status, 403);

      // 3. Upload válido -> 200 + arquivo gravado em disco
      const r200 = await fetch(`${baseUrl}/__blob/?pathname=${encodeURIComponent(chave)}`, {
        method: "PUT",
        body: bytes,
      });
      assert.equal(r200.status, 200);
      const body200 = await r200.json();
      assert.equal(body200.ok, true);
      assert.equal(body200.pathname, chave);
      assert.deepEqual(fs.readFileSync(path.join(tmpArqs, chave)), bytes);

      // 4. Download via enviar() entrega com ETag + Cache-Control e 304 no hit
      const headers1 = {};
      let corpo1 = null;
      const res1 = {
        statusCode: 0,
        setHeader(k, v) { headers1[k.toLowerCase()] = v; },
        end(b) { corpo1 = b; return this; },
        status(s) { this.statusCode = s; return { json: o => ({ status: s, o }) }; },
      };
      await enviarArquivoDisco(res1, chave, "arte.png", true, { req: { headers: {} }, cacheavel: true });
      assert.equal(res1.statusCode, 200);
      assert.equal(headers1["cache-control"], CACHE_MIDIA_IMUTAVEL);
      assert.equal(headers1.etag, etagArquivo(chave));
      assert.deepEqual(corpo1, bytes);

      const res2 = {
        statusCode: 0,
        setHeader() {},
        end() { return this; },
      };
      await enviarArquivoDisco(res2, chave, "arte.png", true, {
        req: { headers: { "if-none-match": headers1.etag } },
        cacheavel: true,
      });
      assert.equal(res2.statusCode, 304);
    });
  } finally {
    if (prevTok === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevTok;
    if (prevDir === undefined) delete process.env.ARQUIVOS_DIR;
    else process.env.ARQUIVOS_DIR = prevDir;
    fs.rmSync(tmpArqs, { recursive: true, force: true });
  }
});

test("avaliarCronsUtc agenda forms (11h), pecas (09h) e relatorio (20h-02h) sem duplicar", () => {
  const vistos = new Set();

  const dPecas = new Date("2026-11-26T09:00:15.000Z");
  assert.deepEqual(avaliarCronsUtc(dPecas, vistos).map(c => c.rota), ["pec/pecas.cron"]);
  assert.deepEqual(avaliarCronsUtc(new Date("2026-11-26T09:00:45.000Z"), vistos), []);

  const dForms = new Date("2026-11-26T11:00:05.000Z");
  assert.deepEqual(avaliarCronsUtc(dForms, vistos).map(c => c.rota), ["cs/forms.cron"]);

  assert.deepEqual(avaliarCronsUtc(new Date("2026-11-26T11:01:00.000Z"), vistos), []);
  assert.deepEqual(avaliarCronsUtc(new Date("2026-11-26T20:00:10.000Z"), vistos).map(c => c.rota), ["tar/relatorio.cron"]);
  assert.deepEqual(avaliarCronsUtc(new Date("2026-11-27T01:00:10.000Z"), vistos).map(c => c.rota), ["tar/relatorio.cron"]);
});
