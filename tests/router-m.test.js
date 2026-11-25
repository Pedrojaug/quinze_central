process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";

import test from "node:test";
import assert from "node:assert/strict";
import { MODULOS_DEF, carregarModulo } from "../api/m.js";
import {
  ENDPOINTS_API_PERMITIDOS,
  MAX_ENDPOINTS_VERCEL,
  validarEndpointsApi,
  contemDdlRuntime,
  validarImportsDinamicosM,
} from "../scripts/check.js";

test("MODULOS_DEF e carregarModulo carregam módulos sob demanda com cache", async () => {
  assert.deepEqual(
    Object.keys(MODULOS_DEF).sort(),
    ["adm", "cs", "fin", "onb", "pec", "pen", "pol", "pop", "tar"]
  );
  assert.equal(await carregarModulo("inexistente"), null);

  const p1 = await carregarModulo("pol");
  const p2 = await carregarModulo("pol");
  assert.equal(p1, p2);
  assert.equal(typeof p1.rotas, "object");

  const onb = await carregarModulo("onb");
  assert.equal(typeof onb.rotas, "object");
  assert.equal(typeof onb.rotas.excluir, "function");
});

test("guardrails de scripts/check.js protegem limite Vercel, DDL e import() estático", () => {
  assert.deepEqual(
    validarEndpointsApi([...ENDPOINTS_API_PERMITIDOS, "_pecas.js", "_http.js"]),
    [...ENDPOINTS_API_PERMITIDOS].sort()
  );
  assert.throws(
    () => validarEndpointsApi([...ENDPOINTS_API_PERMITIDOS, "novo_endpoint.js"]),
    /prefixo "_"/
  );
  assert.equal(ENDPOINTS_API_PERMITIDOS.size <= MAX_ENDPOINTS_VERCEL, true);

  assert.equal(contemDdlRuntime("// CREATE TABLE foo (id int)\n/* ALTER TABLE bar ADD x int */"), false);
  assert.equal(contemDdlRuntime("await sql`CREATE TABLE IF NOT EXISTS foo (id int)`;"), true);
  assert.equal(contemDdlRuntime("await sql`ALTER TABLE docs ADD COLUMN x text`;"), true);

  assert.doesNotThrow(() => validarImportsDinamicosM(`
    const a = () => import("./_pecas.js");
    const b = () => import('./_onb.js');
  `));
  assert.throws(
    () => validarImportsDinamicosM("const x = (n) => import(`./_${n}.js`);"),
    /dinâmico inválido/
  );
});
