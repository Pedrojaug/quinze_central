process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const {
  escolherMesCarteira,
  normalizarClientesCarteira,
  montarPaginacao,
  listarPaginado,
  clientesCarteiraComMes,
} = await import("../api/_mdados.js");

function criarDbMock(responder) {
  const chamadas = [];
  const db = async (strings, ...values) => {
    const sql = strings.join(" ? ");
    chamadas.push({ sql, values });
    return responder(sql, values, chamadas.length);
  };
  db.chamadas = chamadas;
  return db;
}

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

test("listarPaginado usa count, LIMIT/OFFSET com clamp e suporta ordem asc/desc", async () => {
  const dbDesc = criarDbMock(sql => {
    if (sql.includes("count(*)")) return [{ total: 42 }];
    return [{ id: "d2", data: { nome: "Segundo" } }, { id: "d1", data: { nome: "Primeiro" } }];
  });
  const rDesc = await listarPaginado("cs", "reclamacoes", { limite: 999, offset: -5 }, dbDesc);
  assert.equal(rDesc.total, 42);
  assert.equal(rDesc.limite, 200);
  assert.equal(rDesc.offset, 0);
  assert.equal(rDesc.temMais, true);
  assert.equal(rDesc.itens.length, 2);
  assert.equal(dbDesc.chamadas[1].sql.includes("ORDER BY seq DESC"), true);
  assert.deepEqual(dbDesc.chamadas[1].values, ["m/cs/reclamacoes", 200, 0]);

  const dbAsc = criarDbMock(sql => (sql.includes("count(*)") ? [{ total: 1 }] : [{ id: "d1", data: { x: 1 } }]));
  const rAsc = await listarPaginado("cs", "reclamacoes", { limite: 10, offset: 0, ordem: "asc" }, dbAsc);
  assert.equal(rAsc.temMais, false);
  assert.equal(dbAsc.chamadas[1].sql.includes("ORDER BY seq ASC"), true);
});

test("clientesCarteiraComMes usa fast-path para mês existente e fallback para anterior quando ausente", async () => {
  const dbFast = criarDbMock(() => [{ id: "c1", data: { nome: "Cliente A", status: "ativo" } }]);
  const fast = await clientesCarteiraComMes("2026-11", dbFast);
  assert.equal(fast.mes, "2026-11");
  assert.equal(fast.clientes.length, 1);
  assert.equal(dbFast.chamadas.length, 1);
  assert.deepEqual(dbFast.chamadas[0].values, ["meses/2026-11/clientes"]);

  const dbFallback = criarDbMock((sql, values) => {
    if (sql.includes("SELECT DISTINCT parent")) {
      return [{ parent: "meses/2026-09/clientes" }, { parent: "meses/2026-10/clientes" }];
    }
    if (values[0] === "meses/2026-11/clientes") return [];
    if (values[0] === "meses/2026-10/clientes") {
      return [{ id: "c2", data: { nome: "Cliente B", status: "ativo" } }];
    }
    return [];
  });
  const fb = await clientesCarteiraComMes("2026-11", dbFallback);
  assert.equal(fb.mes, "2026-10");
  assert.equal(fb.clientes[0].id, "c2");
  assert.equal(dbFallback.chamadas.length, 3);
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
