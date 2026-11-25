process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const {
  escolherMesCarteira,
  normalizarClientesCarteira,
  montarPaginacao,
} = await import("../api/_mdados.js");

test("escolherMesCarteira seleciona mês exato, fallback anterior e casos de borda", () => {
  const meses = ["2026-10", "2026-08", "2026-10", "2026-09"];
  assert.equal(escolherMesCarteira(meses, "2026-09"), "2026-09");
  assert.equal(escolherMesCarteira(meses, "2026-11"), "2026-10");
  assert.equal(escolherMesCarteira(meses, "2026-07"), "2026-10");
  assert.equal(escolherMesCarteira(meses, null), "2026-10");
  assert.equal(escolherMesCarteira([], "2026-10"), null);
});

test("normalizarClientesCarteira filtra inativos/retirados, converte números e ordena pt-BR", () => {
  const rows = [
    { id: "c1", data: { nome: "Zebra", status: "ativo", conteudos: "8", motions: "2" } },
    { id: "c2", data: { nome: "Águia", status: "", conteudos: 4, motions: null } },
    { id: "c3", data: { nome: "Inativo Corp", status: " Inativo " } },
    { id: "c4", data: { nome: "Retirado SA", status: "RETIRADO" } },
  ];
  const res = normalizarClientesCarteira(rows);
  assert.deepEqual(res.map(c => c.id), ["c2", "c1"]);
  assert.equal(res[0].conteudos, 4);
  assert.equal(res[0].motions, 0);
  assert.equal(res[1].conteudos, 8);
  assert.equal(res[1].motions, 2);
});

test("montarPaginacao aplica limite, offset e sinaliza temMais corretamente", () => {
  const itens = ["a", "b", "c", "d", "e"];
  assert.deepEqual(montarPaginacao(itens, { limite: 2, offset: 0 }), {
    itens: ["a", "b"],
    total: 5,
    limite: 2,
    offset: 0,
    temMais: true,
  });
  assert.deepEqual(montarPaginacao(itens, { limite: 2, offset: 4 }), {
    itens: ["e"],
    total: 5,
    limite: 2,
    offset: 4,
    temMais: false,
  });
  assert.deepEqual(montarPaginacao(itens, { limite: 1000, offset: -3 }), {
    itens: ["a", "b", "c", "d", "e"],
    total: 5,
    limite: 500,
    offset: 0,
    temMais: false,
  });
});

test("higiene arquitetural Fase 0A: sync sem cleanup legado e sem acoplamento com _adm.js", () => {
  const root = process.cwd();
  const syncSrc = fs.readFileSync(path.join(root, "api", "sync.js"), "utf8");
  assert.equal(/UPDATE\s+docs/i.test(syncSrc), false, "api/sync.js não deve executar UPDATE docs");
  assert.equal(/ANDREW/i.test(syncSrc), false, "api/sync.js não deve conter cleanup legado ANDREW");
  assert.equal(syncSrc.includes("path NOT LIKE 'm/%'"), true, "api/sync.js deve filtrar path NOT LIKE 'm/%'");

  for (const mod of ["_cs.js", "_fin.js", "_pecas.js"]) {
    const src = fs.readFileSync(path.join(root, "api", mod), "utf8");
    assert.equal(/from\s+["']\.\/_adm\.js["']/.test(src), false, `api/${mod} não deve importar de ./_adm.js`);
  }
});
