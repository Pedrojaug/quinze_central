process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  CACHE_MIDIA_IMUTAVEL,
  CACHE_DRIVE_PROXY,
  CACHE_REDIRECT_ASSINADO_SEG,
  etagArquivo,
  bateIfNoneMatch,
  aplicarHeadersMidia,
  responder304SeIgual,
  versaoAvatares,
} from "../api/_pecas_cache.js";
import { enviarBlobDoBanco, guardarBlobNoBanco } from "../api/_pecas_blobs_db.js";
import { enviar as enviarArquivoDisco } from "../api/_arquivos.js";
import { processarRetencaoPeca } from "../api/_pecas_retencao.js";
import { criarHandler } from "../api/m.js";

function criarResMock() {
  const headers = {};
  const res = {
    statusCode: 200,
    headers,
    body: null,
    endedBody: undefined,
    headersSent: false,
    setHeader(k, v) { headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    end(b) { this.endedBody = b; this.headersSent = true; return this; },
  };
  return res;
}

test("helpers de _pecas_cache.js: ETag determinística, If-None-Match (W/, lista, *) e versaoAvatares", () => {
  assert.equal(etagArquivo(""), "");
  const e1 = etagArquivo("pecas/u1/20261126-abc/arte.png");
  const e2 = etagArquivo("pecas/u1/20261126-abc/arte.png");
  const e3 = etagArquivo("pecas/u1/20261126-abc/arte2.png");
  assert.equal(e1, e2);
  assert.notEqual(e1, e3);
  assert.match(e1, /^"qz-[a-f0-9]{32}"$/);

  assert.equal(bateIfNoneMatch({ "if-none-match": e1 }, e1), true);
  assert.equal(bateIfNoneMatch({ "If-None-Match": `W/${e1}` }, e1), true);
  assert.equal(bateIfNoneMatch({ "if-none-match": `"outro", ${e1}` }, e1), true);
  assert.equal(bateIfNoneMatch({ "if-none-match": "*" }, e1), true);
  assert.equal(bateIfNoneMatch({ "if-none-match": e3 }, e1), false);
  assert.equal(bateIfNoneMatch({}, e1), false);

  const av1 = versaoAvatares({ avAt: "2026-11-26T10:00:00Z", usrAt: "2026-11-26T09:00:00Z", usrCnt: 10 });
  const av2 = versaoAvatares({ avAt: "2026-11-26T10:00:00Z", usrAt: "2026-11-26T09:00:00Z", usrCnt: 10 });
  const av3 = versaoAvatares({ avAt: "2026-11-26T10:01:00Z", usrAt: "2026-11-26T09:00:00Z", usrCnt: 10 });
  assert.equal(av1, av2);
  assert.notEqual(av1, av3);
  assert.equal(av1.length, 16);
  assert.equal(CACHE_REDIRECT_ASSINADO_SEG, 2700);
  assert.equal(CACHE_DRIVE_PROXY, "private, max-age=86400");
});

test("contrato vercel.json e api/m.js: /api/m permite cache de mídia mantendo no-store padrão para JSON", async () => {
  const vj = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  const regraApi = vj.headers.find(h => String(h.source || "").startsWith("/api/"));
  assert.ok(regraApi, "vercel.json deve manter regra de header no-store para endpoints específicos");
  assert.notEqual(regraApi.source, "/api/(.*)");
  assert.equal(regraApi.source.includes("/api/(doc|sync|login|logout|me|senha|users|health|ics)"), true);

  const h = criarHandler({
    exigirSessao: async () => ({ login: "u1", areas: ["pecas"] }),
    resolverModulo: async () => ({
      rotas: {
        lista: async (_u, _req, res) => res.status(200).json({ ok: true }),
        midia: async (_u, _req, res) => {
          aplicarHeadersMidia(res, { contentType: "image/webp", etag: etagArquivo("k1") });
          return res.status(200).end(Buffer.from("ok"));
        },
      },
    }),
  });

  const resJson = criarResMock();
  await h({ query: { r: "pec/lista" } }, resJson);
  assert.equal(resJson.statusCode, 200);
  assert.equal(resJson.headers["cache-control"], "no-store");

  const resMidia = criarResMock();
  await h({ query: { r: "pec/midia" } }, resMidia);
  assert.equal(resMidia.statusCode, 200);
  assert.equal(resMidia.headers["cache-control"], CACHE_MIDIA_IMUTAVEL);
  assert.equal(resMidia.headers.vary, "Cookie");
});

test("enviarBlobDoBanco envia cache imutável + ETag na 1ª carga e responde 304 com 0 queries SQL no hit", async () => {
  const store = new Map();
  let queriesLeitura = 0;
  const sqlMock = async (strings, ...vals) => {
    const q = strings.join("?").replace(/\s+/g, " ").trim();
    if (q.startsWith("INSERT INTO docs")) {
      store.set(vals[0], { data: JSON.parse(vals[3]), deleted: false });
      return [];
    }
    if (q.includes("SELECT data FROM docs WHERE path")) {
      queriesLeitura++;
      const row = store.get(vals[0]);
      return row ? [{ data: row.data }] : [];
    }
    throw new Error("Query inesperada: " + q);
  };

  const chave = "pecas/artur.da/db-20261126-abcdef123456/banner.webp";
  const buf = Buffer.from("RIFFxxxxWEBP");
  await guardarBlobNoBanco({ chave, buf, nome: "banner.webp", tipo: "image/webp" }, sqlMock);

  const res1 = criarResMock();
  await enviarBlobDoBanco(res1, chave, "banner.webp", true, sqlMock, { headers: {} });
  assert.equal(res1.statusCode, 200);
  assert.equal(queriesLeitura, 1);
  assert.equal(res1.headers["cache-control"], CACHE_MIDIA_IMUTAVEL);
  assert.equal(res1.headers.vary, "Cookie");
  assert.equal(res1.headers.etag, etagArquivo(chave));
  assert.deepEqual(res1.endedBody, buf);

  // 2ª chamada com If-None-Match deve retornar 304 SEM tocar no banco
  const res2 = criarResMock();
  await enviarBlobDoBanco(res2, chave, "banner.webp", true, sqlMock, {
    headers: { "if-none-match": res1.headers.etag },
  });
  assert.equal(res2.statusCode, 304);
  assert.equal(queriesLeitura, 1);
  assert.equal(res2.endedBody, undefined);
  assert.equal(res2.headers["cache-control"], CACHE_MIDIA_IMUTAVEL);

  // If-None-Match diferente deve ler do banco novamente
  const res3 = criarResMock();
  await enviarBlobDoBanco(res3, chave, "banner.webp", true, sqlMock, {
    headers: { "if-none-match": '"qz-outro"' },
  });
  assert.equal(res3.statusCode, 200);
  assert.equal(queriesLeitura, 2);
});

test("enviar em disco local (modo VPS) aplica ETag + 304 quando cacheavel=true e mantém no-store quando false", async () => {
  const prevTok = process.env.BLOB_READ_WRITE_TOKEN;
  const prevDir = process.env.ARQUIVOS_DIR;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qz-arqs-"));
  try {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.ARQUIVOS_DIR = tmpDir;

    const chave = "pecas/artur.da/20261126-112233/arte.png";
    const full = path.join(tmpDir, chave);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    fs.writeFileSync(full, bytes);

    const resCache = criarResMock();
    await enviarArquivoDisco(resCache, chave, "arte.png", true, { req: { headers: {} }, cacheavel: true });
    assert.equal(resCache.statusCode, 200);
    assert.equal(resCache.headers["cache-control"], CACHE_MIDIA_IMUTAVEL);
    assert.equal(resCache.headers.etag, etagArquivo(chave));
    assert.deepEqual(resCache.endedBody, bytes);

    const res304 = criarResMock();
    await enviarArquivoDisco(res304, chave, "arte.png", true, {
      req: { headers: { "if-none-match": `W/${resCache.headers.etag}` } },
      cacheavel: true,
    });
    assert.equal(res304.statusCode, 304);
    assert.equal(res304.endedBody, undefined);

    const resNoCache = criarResMock();
    await enviarArquivoDisco(resNoCache, chave, "arte.png", true);
    assert.equal(resNoCache.statusCode, 200);
    assert.equal(resNoCache.headers["cache-control"], "private, no-store");
    assert.equal(resNoCache.headers.etag, undefined);
  } finally {
    if (prevTok === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevTok;
    if (prevDir === undefined) delete process.env.ARQUIVOS_DIR;
    else process.env.ARQUIVOS_DIR = prevDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("processarRetencaoPeca inclui thumbChave em emUso (ativa) e em vencidos (expirada)", () => {
  const agora = Date.parse("2026-11-26T12:00:00.000Z");
  const limite = agora - 7 * 864e5;

  const pecaAtiva = {
    versoes: [{
      enviadaEm: "2026-11-25T12:00:00.000Z",
      arquivos: [{ chave: "pecas/u/1/orig.png", thumbChave: "pecas/u/1/thumb.webp" }],
    }],
  };
  const rAtiva = processarRetencaoPeca(pecaAtiva, limite, new Date(agora).toISOString());
  assert.deepEqual(rAtiva.emUso, ["pecas/u/1/orig.png", "pecas/u/1/thumb.webp"]);
  assert.deepEqual(rAtiva.vencidos, []);

  const pecaVencida = {
    versoes: [{
      enviadaEm: "2026-11-10T12:00:00.000Z",
      arquivos: [{ chave: "pecas/u/2/orig.png", thumbChave: "pecas/u/2/thumb.webp" }],
    }],
  };
  const rVenc = processarRetencaoPeca(pecaVencida, limite, new Date(agora).toISOString());
  assert.deepEqual(rVenc.vencidos, ["pecas/u/2/orig.png", "pecas/u/2/thumb.webp"]);
  assert.equal(pecaVencida.versoes[0].arquivos[0].expirado, true);
  assert.equal(pecaVencida.arquivada, true);
});

test("bundles compilados em public/ carregam miniaturas, render incremental e polling suavizado", () => {
  const modPecasPath = path.join(process.cwd(), "public", "modulos", "pecas.js");
  const pubStorePath = path.join(process.cwd(), "public", "store.js");
  if (!fs.existsSync(modPecasPath) || !fs.existsSync(pubStorePath)) {
    const res = spawnSync(process.execPath, ["build.js"], { encoding: "utf8" });
    assert.equal(res.status, 0);
  }
  const modPecas = fs.readFileSync(modPecasPath, "utf8");
  assert.equal(modPecas.includes("renderizarListaPecasIncremental"), true);
  assert.equal(modPecas.includes("gerarMiniaturaImagem"), true);
  assert.equal(modPecas.includes('preload="none"'), true);
  assert.equal(modPecas.includes("&thumb=1"), true);
  assert.equal(modPecas.includes("&av="), true);
  assert.equal(modPecas.includes("document.hidden ? 60000 : 20000"), true);

  const pubStore = fs.readFileSync(pubStorePath, "utf8");
  assert.equal(pubStore.includes("document.hidden ? 120000 : 30000"), true);

  const appHtml = fs.readFileSync(path.join(process.cwd(), "public", "app.html"), "utf8");
  assert.equal(appHtml.includes("setInterval(atualizarNotificacoes, 30000)"), true);
  assert.equal(appHtml.includes("semAlteracao"), true);
});
