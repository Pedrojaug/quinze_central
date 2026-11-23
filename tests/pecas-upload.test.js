import test from "node:test";
import assert from "node:assert/strict";
import { tokenEnvioDireto, detectarAccessAlternativo, resetAccessDetectado } from "../api/_arquivos.js";
import {
  TIPOS_PECAS,
  MAX_BYTES_SERVIDOR,
  extensaoPeca,
  montarChavePeca,
  validarUploadBase64,
  traduzirErroBlob,
} from "../api/_pecas_upload.js";

test("extensaoPeca extrai extensão com nomes normais, maiúsculas, múltiplos pontos e > 160 chars", () => {
  assert.equal(extensaoPeca("banner.png"), "png");
  assert.equal(extensaoPeca("ARTE_FINAL.JPEG"), "jpeg");
  assert.equal(extensaoPeca("v1.2.final.WebP"), "webp");
  assert.equal(extensaoPeca("foto.jfif"), "jfif");
  const nomeLongo = `${"a".repeat(220)}.png`;
  assert.equal(extensaoPeca(nomeLongo), "png");
  assert.equal(extensaoPeca("sem_extensao"), "");
  assert.equal(extensaoPeca(""), "");
});

test("montarChavePeca higieniza login com ponto, remove .., suporta novos formatos e rejeita proibidos", () => {
  const r1 = montarChavePeca({
    login: "artur.da",
    nome: "arte..finalação (2).png",
    dia: "20261123",
    randHex: "a1b2c3d4e5f6",
  });
  assert.equal(r1.erro, undefined);
  assert.equal(r1.tipo, "image/png");
  assert.equal(r1.chave.startsWith("pecas/artur.da/20261123-a1b2c3d4e5f6/"), true);
  assert.equal(r1.chave.includes(".."), false);
  assert.equal(r1.chave.endsWith(".png"), true);

  for (const [arq, esp] of [
    ["card.webp", "image/webp"],
    ["animacao.gif", "image/gif"],
    ["foto.jfif", "image/jpeg"],
    [`${"muito-longo-".repeat(20)}arte.jpg`, "image/jpeg"],
  ]) {
    const r = montarChavePeca({ login: "artur.da", nome: arq, dia: "20261123", randHex: "abcdef" });
    assert.equal(r.tipo, esp);
    assert.ok(r.nomeLimpo.length <= 160);
    assert.equal(r.nomeLimpo.endsWith("." + extensaoPeca(arq)), true);
  }

  const proibido = montarChavePeca({ login: "artur.da", nome: "script.exe", dia: "20261123", randHex: "1234" });
  assert.equal(proibido.erro, "tipo_invalido");
  assert.equal(TIPOS_PECAS.webp, "image/webp");

  const rDb = montarChavePeca({
    login: "pablo.da",
    nome: "CAPA.png",
    dia: "20261123",
    randHex: "001122334455",
    prefixoPasta: "db-",
  });
  assert.equal(rDb.chave, "pecas/pablo.da/db-20261123-001122334455/CAPA.png");
});

test("validarUploadBase64 valida imagens com/sem prefixo data:, PDFs reais/falsos, vazio, tamanho e extensão", () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const b64 = pngBytes.toString("base64");

  const okSemPrefixo = validarUploadBase64({ nome: "peca.png", b64 });
  assert.equal(okSemPrefixo.erro, undefined);
  assert.equal(okSemPrefixo.tipo, "image/png");
  assert.deepEqual(okSemPrefixo.buf, pngBytes);

  const okComPrefixo = validarUploadBase64({ nome: "peca.webp", b64: `data:image/webp;base64,${b64}` });
  assert.equal(okComPrefixo.erro, undefined);
  assert.equal(okComPrefixo.tipo, "image/webp");

  const pdfValido = validarUploadBase64({
    nome: "catalogo.pdf",
    b64: Buffer.from("%PDF-1.7\n1 0 obj\n").toString("base64"),
  });
  assert.equal(pdfValido.erro, undefined);
  assert.equal(pdfValido.tipo, "application/pdf");

  const pdfFalso = validarUploadBase64({
    nome: "falso.pdf",
    b64: Buffer.from("nao e pdf").toString("base64"),
  });
  assert.equal(pdfFalso.erro, "pdf_invalido");

  assert.equal(validarUploadBase64({ nome: "vazio.png", b64: "" }).erro, "arquivo_vazio");
  assert.equal(validarUploadBase64({ nome: "ruin.exe", b64 }).erro, "tipo_invalido");

  const b64Grande = Buffer.alloc(128, 0x41).toString("base64");
  assert.equal(validarUploadBase64({ nome: "grande.jpg", b64: b64Grande, maxBytes: 64 }).erro, "arquivo_grande");
  assert.equal(MAX_BYTES_SERVIDOR, 3 * 1024 * 1024);
});

test("traduzirErroBlob interpreta JSON de erro do Blob e códigos HTTP comuns", () => {
  assert.equal(
    traduzirErroBlob(400, JSON.stringify({ error: { code: "content_type_not_allowed", message: "contentType invalid" } })),
    "O armazenamento recusou o formato/tipo do arquivo."
  );
  assert.match(
    traduzirErroBlob(403, JSON.stringify({ error: { code: "forbidden", message: "Access denied" } })),
    /403.*Access denied/
  );
  assert.equal(traduzirErroBlob(413, ""), "O arquivo excede o tamanho máximo permitido.");
  assert.match(traduzirErroBlob(503, "Service Unavailable"), /temporariamente indisponível \(503\)/);
  assert.equal(traduzirErroBlob(0, ""), "Falha de conexão com o armazenamento.");
});

test("tokenEnvioDireto respeita modo local, erro 503 na Vercel sem token e aplica trim + x-api-version 13", async () => {
  const prevTok = process.env.BLOB_READ_WRITE_TOKEN;
  const prevVercel = process.env.VERCEL;
  const prevVercelEnv = process.env.VERCEL_ENV;

  try {
    // 1. Modo local (sem token e fora da Vercel)
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    const localRes = await tokenEnvioDireto("pecas/artur.da/20261123-abc/teste.png", {
      tipos: ["image/png"],
      maxBytes: 1024 * 1024,
    });
    assert.equal(localRes.storeId, "local");
    assert.equal(localRes.url.startsWith("/__blob/?pathname="), true);

    // 2. Ambiente Vercel sem BLOB_READ_WRITE_TOKEN deve acusar 503 blob_nao_configurado
    process.env.VERCEL = "1";
    await assert.rejects(
      () => tokenEnvioDireto("pecas/artur.da/20261123-abc/teste.png", { tipos: ["image/png"], maxBytes: 1024 }),
      err => err?.code === "blob_nao_configurado" && err?.status === 503
    );

    // 3. Token com espaços/quebra de linha gera headers v13 com storeId limpo
    process.env.BLOB_READ_WRITE_TOKEN = "  vercel_blob_rw_storeTest99_secretXYZ123  \n";
    const prodRes = await tokenEnvioDireto("pecas/artur.da/20261123-abc/teste.png", {
      tipos: ["image/png"],
      maxBytes: 1024 * 1024,
    });
    assert.equal(prodRes.storeId, "storeTest99");
    assert.equal(prodRes.headers["x-api-version"], "13");
    assert.equal(prodRes.headers["x-vercel-blob-store-id"], "storeTest99");
    assert.equal(prodRes.headers["x-vercel-blob-access"], "private");
    assert.equal(prodRes.headers.authorization.startsWith("Bearer vercel_blob_client_storeTest99_"), true);
  } finally {
    resetAccessDetectado();
    if (prevTok === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevTok;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercelEnv;
  }
});

test("detectarAccessAlternativo identifica divergência entre store public e private", () => {
  assert.equal(detectarAccessAlternativo(new Error("Cannot use private access on a public store"), "private"), "public");
  assert.equal(detectarAccessAlternativo(new Error("Cannot use public access on a private store"), "public"), "private");
  assert.equal(detectarAccessAlternativo(new Error("Cannot use private access on a public store"), "public"), null);
  assert.equal(detectarAccessAlternativo(new Error("Store is suspended"), "private"), null);
});
