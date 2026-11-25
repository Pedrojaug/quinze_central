import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

function carregarShared(fetchImpl) {
  const codigo = fs.readFileSync(path.join(process.cwd(), "src", "js", "08b-shared.js"), "utf8");
  const windowObj = {
    QZ: {},
    QZ_SITE: false,
    location: { pathname: "/app", search: "?m=pecas", hash: "#fila", href: "" },
  };
  const ctx = vm.createContext({
    window: windowObj,
    fetch: fetchImpl || (async () => ({ ok: true, status: 200, json: async () => ({}) })),
    URLSearchParams,
    Intl,
    Date,
    setTimeout,
    clearTimeout,
    navigator: {},
  });
  vm.runInContext(codigo, ctx, { filename: "src/js/08b-shared.js" });
  return windowObj.QZ;
}

test("QZ.fmt formata datas, moeda, escape HTML e soma dias corretamente", () => {
  const { fmt } = carregarShared();
  assert.equal(fmt.esc('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(fmt.br("2026-11-25"), "25/11/2026");
  assert.equal(fmt.br("2026-11-25T15:30:00Z"), "25/11/2026");
  assert.equal(fmt.br(""), "");
  assert.equal(fmt.brCurta("2026-11-25"), "25/11");
  assert.equal(fmt.mesBr("2026-11"), "nov/2026");
  assert.equal(fmt.mesBr("invalido"), "");
  assert.match(fmt.brl(1250.5), /1\.250,50/);
  assert.equal(fmt.hojeSP(new Date("2026-10-09T01:05:00Z")), "2026-10-08");
  assert.equal(fmt.somarDias("2026-11-25", 5), "2026-11-30");
  assert.match(fmt.brHora("2026-11-25T18:00:00Z"), /25\/11\/2026/);
});

test("QZ.api e QZ.criarApi montam query, enviam POST e padronizam erros HTTP", async () => {
  const chamadas = [];
  const QZ = carregarShared(async (url, init) => {
    chamadas.push({ url, init });
    if (url.includes("cs/falha429")) {
      return { ok: false, status: 429, json: async () => ({ code: "rate_limit" }) };
    }
    if (url.includes("cs/unauth")) {
      return { ok: false, status: 401, json: async () => ({ code: "unauthorized" }) };
    }
    if (url.includes("cs/erro400")) {
      return { ok: false, status: 400, json: async () => ({ code: "dados_invalidos", msg: "Campo obrigatório" }) };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, itens: [1, 2] }) };
  });

  const csApi = QZ.criarApi("cs");
  const rGet = await csApi("listar", undefined, { query: { limite: 20, vazio: "", nulo: null } });
  assert.deepEqual(rGet, { ok: true, itens: [1, 2] });
  assert.equal(chamadas[0].url, "/api/m?r=cs/listar&limite=20");
  assert.equal(chamadas[0].init.method, "GET");

  await csApi("respostas&de=2026-01&ate=2026-11", undefined, { query: { cli: "c1" } });
  assert.equal(chamadas[1].url, "/api/m?r=cs/respostas&de=2026-01&ate=2026-11&cli=c1");

  await csApi("salvar", { nome: "Teste" });
  assert.equal(chamadas[2].url, "/api/m?r=cs/salvar");
  assert.equal(chamadas[2].init.method, "POST");
  assert.equal(chamadas[2].init.body, '{"nome":"Teste"}');

  await assert.rejects(() => csApi("erro400"), err => err.status === 400 && err.code === "dados_invalidos" && err.message === "Campo obrigatório");
  await assert.rejects(() => csApi("falha429"), err => err.status === 429 && /Muitas requisições/i.test(err.message));
  await assert.rejects(() => csApi("unauth"), err => err.status === 401 && err.code === "unauthenticated");
});

test("QZ.ui gera badges, estados, paginação e armarConfirmacao em dois cliques", () => {
  const { ui } = carregarShared();
  assert.equal(ui.carregando("Buscando…"), '<div class="qz-state">Buscando…</div>');
  assert.equal(ui.vazio("Nada aqui", "Tente filtrar"), '<div class="qz-empty"><b>Nada aqui</b><div>Tente filtrar</div></div>');
  assert.equal(ui.erroBox("<Falha>"), '<div class="note warn">&lt;Falha&gt;</div>');
  assert.equal(ui.badge("Pago", "ok"), '<span class="qz-badge qz-badge-ok">Pago</span>');
  assert.equal(ui.badge("Estranho", "hack\"onclick=1"), '<span class="qz-badge qz-badge-neutro">Estranho</span>');

  assert.equal(ui.renderPaginacao({ total: 0 }), "");
  assert.match(ui.renderPaginacao({ total: 120, exibidos: 50, temMais: true }), /Mostrando 50 de 120.*data-qz-mais/);
  assert.equal(ui.renderPaginacao({ total: 10, exibidos: 10, temMais: false }).includes("data-qz-mais"), false);

  const btn = { textContent: "Excluir", dataset: {} };
  assert.equal(ui.armarConfirmacao(btn, { rotulo: "Confirmar?", timeoutMs: 5000 }), false);
  assert.equal(btn.textContent, "Confirmar?");
  assert.equal(btn.dataset.qzArm, "1");
  assert.equal(ui.armarConfirmacao(btn, { rotulo: "Confirmar?", timeoutMs: 5000 }), true);
  assert.equal(btn.textContent, "Excluir");
  assert.equal(btn.dataset.qzArm, "");
});

test("build.js injeta __QZ_BUILD determinístico em app.html e _modelo.js segue padrão /api/m", () => {
  const appHtmlPath = path.join(process.cwd(), "public", "app.html");
  if (!fs.existsSync(appHtmlPath)) {
    const res = spawnSync(process.execPath, ["build.js"], { encoding: "utf8" });
    assert.equal(res.status, 0);
  }
  const html = fs.readFileSync(appHtmlPath, "utf8");
  const mHash = /window\.__QZ_BUILD\s*=\s*"([a-f0-9]{8})";/.exec(html);
  assert.ok(mHash, "public/app.html deve definir window.__QZ_BUILD com 8 chars hex");
  assert.equal(html.includes(`/app.css?v=${mHash[1]}`), true);
  assert.equal(html.includes(`/store.js?v=${mHash[1]}`), true);

  const modSrc = fs.readFileSync(path.join(process.cwd(), "src", "js", "08-modulos.js"), "utf8");
  assert.equal(modSrc.includes("window.__QZ_BUILD"), true);

  const modeloSrc = fs.readFileSync(path.join(process.cwd(), "modulos", "_modelo.js"), "utf8");
  const modeloCodigo = modeloSrc.replace(/\/\/[^\r\n]*/g, "");
  assert.equal(modeloCodigo.includes("ctx.dados("), false);
  assert.equal(modeloCodigo.includes("QZ.criarApi("), true);
});
