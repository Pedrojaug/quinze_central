process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

const {
  AVATARES_LEGADO_PATH,
  AVATARES_PARENT,
  mesclarAvataresDocs,
  hashConfereTimingSafe,
} = await import("../api/_lib.js");

test("mesclarAvataresDocs combina mapa legado e docs individuais corretamente", () => {
  const rows = [
    {
      path: AVATARES_LEGADO_PATH,
      data: {
        eduardo: "data:image/png;base64,LEGADO_EDU",
        igor: "data:image/png;base64,LEGADO_IGOR",
        mari: "data:image/png;base64,LEGADO_MARI",
        vazio: "",
      },
    },
    {
      path: `${AVATARES_PARENT}/eduardo`,
      parent: AVATARES_PARENT,
      id: "eduardo",
      data: { avatar: "data:image/webp;base64,NOVO_EDU" },
    },
    {
      path: `${AVATARES_PARENT}/mari`,
      parent: AVATARES_PARENT,
      id: "mari",
      data: { avatar: null, removido: true },
    },
    {
      path: `${AVATARES_PARENT}/gabriel.da`,
      parent: AVATARES_PARENT,
      id: "gabriel.da",
      data: { avatar: "data:image/jpeg;base64,NOVO_GAB" },
    },
  ];

  const map = mesclarAvataresDocs(rows);
  assert.equal(map.eduardo, "data:image/webp;base64,NOVO_EDU");
  assert.equal(map.igor, "data:image/png;base64,LEGADO_IGOR");
  assert.equal(map["gabriel.da"], "data:image/jpeg;base64,NOVO_GAB");
  assert.equal("mari" in map, false);
  assert.equal("vazio" in map, false);
});

test("hashConfereTimingSafe valida SHA-256 hex com timingSafeEqual", () => {
  const hashValido = crypto.createHash("sha256").update("segredo-teste-123").digest("hex");
  assert.equal(hashConfereTimingSafe("segredo-teste-123", hashValido), true);
  assert.equal(hashConfereTimingSafe("  segredo-teste-123  ", hashValido.toUpperCase()), true);
  assert.equal(hashConfereTimingSafe("outra-senha", hashValido), false);
  assert.equal(hashConfereTimingSafe("", hashValido), false);
  assert.equal(hashConfereTimingSafe("segredo-teste-123", ""), false);
  assert.equal(hashConfereTimingSafe("segredo-teste-123", "hash-invalido"), false);
});
