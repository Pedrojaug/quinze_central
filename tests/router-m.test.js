process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MODULOS_DEF, carregarModulo, criarHandler } from "../api/m.js";
import { AREAS, MODULOS } from "../api/_modules.js";
import {
  ENDPOINTS_API_PERMITIDOS,
  MAX_ENDPOINTS_VERCEL,
  validarEndpointsApi,
  contemDdlRuntime,
  validarImportsDinamicosM,
} from "../scripts/check.js";

function criarResMock() {
  const res = { statusCode: 200, body: null, headersSent: false };
  res.status = c => { res.statusCode = c; return res; };
  res.json = b => { res.body = b; res.headersSent = true; return res; };
  return res;
}

test("MODULOS_DEF e carregarModulo carregam módulos sob demanda com cache", async () => {
  assert.deepEqual(
    Object.keys(MODULOS_DEF).sort(),
    ["adm", "cs", "fin", "onb", "pec", "pen", "pop", "sup", "tar"]
  );
  assert.equal(await carregarModulo("inexistente"), null);

  const p1 = await carregarModulo("sup");
  const p2 = await carregarModulo("sup");
  assert.equal(p1, p2);
  assert.equal(typeof p1.rotas, "object");

  const onb = await carregarModulo("onb");
  assert.equal(typeof onb.rotas, "object");
  assert.equal(typeof onb.rotas.excluir, "function");
});

test("integridade de contrato entre MODULOS_DEF, api/_modules.js e arquivos em modulos/", async () => {
  const areaIds = new Set(AREAS.map(a => a.id));
  const reAcao = /^[a-zA-Z0-9_.-]{1,40}$/;

  for (const [chave, def] of Object.entries(MODULOS_DEF)) {
    if (def.area !== null) {
      assert.equal(areaIds.has(def.area), true, `Área "${def.area}" de ${chave} deve existir em AREAS`);
    }
    const mod = await carregarModulo(chave);
    assert.equal(typeof mod.rotas, "object", `${chave} deve exportar rotas`);
    const nomesRotas = Object.keys(mod.rotas);
    assert.ok(nomesRotas.length > 0, `${chave} deve possuir ao menos uma rota`);
    for (const acao of nomesRotas) {
      assert.equal(reAcao.test(acao), true, `Rota inválida em ${chave}: ${acao}`);
      assert.equal(typeof mod.rotas[acao], "function", `Rota ${chave}/${acao} deve ser função`);
    }
    if (mod.publicas) {
      for (const acao of Object.keys(mod.publicas)) {
        assert.equal(reAcao.test(acao), true, `Rota pública inválida em ${chave}: ${acao}`);
        assert.equal(typeof mod.publicas[acao], "function", `Rota pública ${chave}/${acao} deve ser função`);
      }
    }
  }

  for (const m of MODULOS) {
    if (!m.arquivo) continue;
    const base = m.arquivo.replace(/^\/modulos\//, "").replace(/\.js$/, "");
    const arq = path.join(process.cwd(), "modulos", `${base}.js`);
    const dir = path.join(process.cwd(), "modulos", base);
    assert.equal(fs.existsSync(arq) || fs.existsSync(dir), true, `Arquivo/pasta ausente para ${m.arquivo}`);
  }
});

test("criarHandler aplica contratos de roteamento, sessão, área, públicas e erro 500", async () => {
  let chamouSessao = 0;
  let rotaExecutada = null;
  const fakeMods = {
    pop: {
      area: null,
      rotas: { listar: async (u, req, res) => { rotaExecutada = { mod: "pop", u }; return res.status(200).json({ ok: true }); } },
    },
    fin: {
      area: "financeiro",
      publicas: { ping: async (req, res) => { rotaExecutada = { mod: "fin.pub" }; return res.status(200).json({ pong: true }); } },
      rotas: {
        listar: async (u, req, res) => { rotaExecutada = { mod: "fin", u }; return res.status(200).json({ ok: true }); },
        quebrar: async () => { throw new Error("falha simulada"); },
      },
    },
  };

  // Módulo e ação inválidos -> 404
  const h = criarHandler({
    exigirSessao: async (_req, res) => {
      chamouSessao++;
      return res._sessao;
    },
    resolverModulo: async k => fakeMods[k] || null,
  });

  // Nota: para testar falta de área em `fin`, usamos o MODULOS_DEF real no mapa de chaves:
  // então aqui testamos com `pop` (area null) e `fin` (area "financeiro").
  const r404Mod = criarResMock();
  await h({ query: { r: "desconhecido/listar" } }, r404Mod);
  assert.equal(r404Mod.statusCode, 404);
  assert.deepEqual(r404Mod.body, { code: "rota" });

  const r404Acao = criarResMock();
  await h({ query: { r: "fin/../segredo" } }, r404Acao);
  assert.equal(r404Acao.statusCode, 404);
  assert.deepEqual(r404Acao.body, { code: "rota" });

  // Rota pública não exige sessão
  const rPub = criarResMock();
  await h({ query: { r: "fin/ping" } }, rPub);
  assert.equal(chamouSessao, 0);
  assert.equal(rPub.statusCode, 200);
  assert.deepEqual(rPub.body, { pong: true });

  // Sem sessão -> para antes da rota
  const rNoAuth = criarResMock();
  const hNoAuth = criarHandler({
    exigirSessao: async (_req, res) => { res.status(401).json({ error: "unauthorized" }); return null; },
    resolverModulo: async k => fakeMods[k] || null,
  });
  await hNoAuth({ query: { r: "fin/listar" } }, rNoAuth);
  assert.equal(rNoAuth.statusCode, 401);

  // Sem área exigida -> 403
  const r403 = criarResMock();
  r403._sessao = { login: "artur.da", areas: ["pecas"] };
  await h({ query: { r: "fin/listar" } }, r403);
  assert.equal(r403.statusCode, 403);
  assert.deepEqual(r403.body, { code: "sem_acesso" });

  // pop (area: null) funciona mesmo com areas vazias
  const rPop = criarResMock();
  rPop._sessao = { login: "artur.da", areas: [] };
  await h({ query: { r: "pop/listar" } }, rPop);
  assert.equal(rPop.statusCode, 200);
  assert.equal(rotaExecutada.mod, "pop");

  // Ação inexistente em módulo válido -> 404
  const r404Fn = criarResMock();
  r404Fn._sessao = { login: "eduardo", areas: ["financeiro"] };
  await h({ query: { r: "fin/naoexiste" } }, r404Fn);
  assert.equal(r404Fn.statusCode, 404);

  // Sucesso com área válida
  const rOk = criarResMock();
  rOk._sessao = { login: "eduardo", areas: ["financeiro"] };
  await h({ query: { r: "fin/listar" } }, rOk);
  assert.equal(rOk.statusCode, 200);
  assert.equal(rotaExecutada.mod, "fin");

  // Exceção na rota -> 500
  const r500 = criarResMock();
  r500._sessao = { login: "eduardo", areas: ["financeiro"] };
  const origErr = console.error;
  console.error = () => {};
  try {
    await h({ query: { r: "fin/quebrar" } }, r500);
  } finally {
    console.error = origErr;
  }
  assert.equal(r500.statusCode, 500);
  assert.deepEqual(r500.body, { code: "erro" });
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
