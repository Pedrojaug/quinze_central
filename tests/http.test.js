import test from "node:test";
import assert from "node:assert/strict";
import {
  corpo,
  exigirMetodo,
  erro,
  negado,
  ok,
  quem,
  paginacaoQuery,
  validarCampos,
} from "../api/_http.js";

function criarResMock() {
  const out = { statusCode: 200, body: null };
  return {
    out,
    status(c) {
      out.statusCode = c;
      return this;
    },
    json(b) {
      out.body = b;
      return out;
    },
  };
}

test("corpo, quem e helpers de resposta (ok, erro, negado, exigirMetodo)", () => {
  assert.deepEqual(corpo({ body: { a: 1 } }), { a: 1 });
  assert.deepEqual(corpo({ body: [1, 2] }), {});
  assert.deepEqual(corpo({ body: "txt" }), {});
  assert.deepEqual(corpo(null), {});

  assert.deepEqual(quem({ login: "rilli", nome: "Rilli" }), { login: "rilli", nome: "Rilli" });
  assert.deepEqual(quem({ login: "igor" }), { login: "igor", nome: "igor" });

  const r1 = criarResMock();
  exigirMetodo({ method: "GET" }, r1, "POST");
  assert.equal(r1.out.statusCode, 405);
  assert.deepEqual(r1.out.body, { code: "method" });

  const r2 = criarResMock();
  assert.equal(exigirMetodo({ method: "post" }, r2, ["GET", "POST"]), true);

  const r3 = criarResMock();
  ok(r3, { total: 5 });
  assert.equal(r3.out.statusCode, 200);
  assert.deepEqual(r3.out.body, { ok: true, total: 5 });

  const r4 = criarResMock();
  negado(r4);
  assert.equal(r4.out.statusCode, 403);
  assert.deepEqual(r4.out.body, { code: "sem_acesso", msg: "Sem permissão." });

  const r5 = criarResMock();
  erro(r5, 422, "invalido", "Campo inválido", { campo: "nome" });
  assert.equal(r5.out.statusCode, 422);
  assert.deepEqual(r5.out.body, { code: "invalido", msg: "Campo inválido", campo: "nome" });
});

test("paginacaoQuery faz clamp de limite, calcula offset por página e prioriza offset explícito", () => {
  assert.deepEqual(paginacaoQuery({}), { limite: 50, offset: 0, pagina: 1 });
  assert.deepEqual(paginacaoQuery({ limite: "999", pagina: "3" }), { limite: 200, offset: 400, pagina: 3 });
  assert.deepEqual(paginacaoQuery({ limit: "25", page: "2" }), { limite: 25, offset: 25, pagina: 2 });
  assert.deepEqual(paginacaoQuery({ limite: "20", pagina: "2", offset: "15" }), { limite: 20, offset: 15, pagina: 2 });
  assert.deepEqual(paginacaoQuery({ limite: "-5", offset: "-10" }), { limite: 50, offset: 0, pagina: 1 });
});

test("validarCampos valida todos os tipos, limites, defaults e datas inválidas", () => {
  const esquema = {
    titulo: { tipo: "texto", obrigatorio: true, min: 3, max: 20, rotulo: "Título" },
    resumo: { tipo: "texto", max: 5, truncar: true, padrao: "" },
    valor: { tipo: "numero", obrigatorio: true, min: 0, rotulo: "Valor" },
    qtd: { tipo: "inteiro", min: 1, max: 10, padrao: 1 },
    ativo: { tipo: "booleano", padrao: true },
    vencimento: { tipo: "data", obrigatorio: true, rotulo: "Vencimento" },
    competencia: { tipo: "mes", rotulo: "Competência" },
    status: { tipo: "enum", valores: ["aberta", "fechada"], padrao: "aberta" },
    tags: { tipo: "array", min: 1, max: 3, padrao: [] },
  };

  const okRes = validarCampos({
    titulo: "  Campanha Maio  ",
    resumo: "abcdef",
    valor: "1250,50",
    qtd: "3",
    ativo: "false",
    vencimento: "2026-11-25",
    competencia: "2026-11",
    tags: ["urgente"],
  }, esquema);
  assert.equal(okRes.ok, true);
  assert.deepEqual(okRes.dados, {
    titulo: "Campanha Maio",
    resumo: "abcde",
    valor: 1250.5,
    qtd: 3,
    ativo: false,
    vencimento: "2026-11-25",
    competencia: "2026-11",
    status: "aberta",
    tags: ["urgente"],
  });

  const tituloLongo = validarCampos({
    titulo: "X".repeat(21),
    valor: 10,
    vencimento: "2026-11-25",
  }, esquema);
  assert.equal(tituloLongo.ok, false);
  assert.equal(tituloLongo.campo, "titulo");

  const dataFake = validarCampos({
    titulo: "Teste",
    valor: 10,
    vencimento: "2026-02-31",
  }, esquema);
  assert.equal(dataFake.ok, false);
  assert.equal(dataFake.campo, "vencimento");

  const mesInvalido = validarCampos({
    titulo: "Teste",
    valor: 10,
    vencimento: "2026-11-25",
    competencia: "2026-13",
  }, esquema);
  assert.equal(mesInvalido.ok, false);
  assert.equal(mesInvalido.campo, "competencia");

  const inteiroDecimal = validarCampos({
    titulo: "Teste",
    valor: 10,
    qtd: 1.5,
    vencimento: "2026-11-25",
  }, esquema);
  assert.equal(inteiroDecimal.ok, false);
  assert.equal(inteiroDecimal.campo, "qtd");

  const enumRuim = validarCampos({
    titulo: "Teste",
    valor: 10,
    vencimento: "2026-11-25",
    status: "cancelada",
  }, esquema);
  assert.equal(enumRuim.ok, false);
  assert.equal(enumRuim.campo, "status");
});
