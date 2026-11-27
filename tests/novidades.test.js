import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function extrairScriptIndex() {
  const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 2, "index.html deve conter o script anti-FOUC e o script principal");
  return { html, script: scripts[scripts.length - 1][1] };
}

function criarDomMock() {
  const storageMap = new Map();
  const storage = {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => { storageMap.set(k, String(v)); },
  };
  const mkEl = (id) => ({
    id,
    hidden: false,
    open: false,
    innerHTML: "",
    textContent: "",
    title: "",
    value: "",
    attrs: {},
    listeners: {},
    classList: { toggle() {} },
    setAttribute(k, v) { this.attrs[k] = v; if (k === "open") this.open = true; },
    removeAttribute(k) { delete this.attrs[k]; if (k === "open") this.open = false; },
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    click() { (this.listeners.click || []).forEach(fn => fn({ target: this })); },
    showModal() { this.open = true; },
    close() { this.open = false; },
    focus() {},
    select() {},
  });

  const ids = [
    "#homeNovBtn", "#homeNovDot", "#novDlg", "#novBody", "#novClose", "#novOk",
    "#qzThemeBtn", "#profHomeCancel", "#profHomePick", "#profHomeRm", "#profHomeFile",
    "#frmHomeProfile", "#frmPwd", "#pwCancel", "#myPwd", "#myProfile", "#show", "#frm", "#out",
    "#pass", "#user",
  ];
  const mapa = Object.fromEntries(ids.map(s => [s, mkEl(s)]));
  const doc = {
    documentElement: { dataset: { theme: "light" } },
    querySelector: sel => {
      if (sel === 'meta[name="color-scheme"]') return { content: "light" };
      return mapa[sel] || null;
    },
    querySelectorAll: () => [],
  };
  const winListeners = {};
  const win = {
    addEventListener(ev, fn) { (winListeners[ev] ||= []).push(fn); },
  };

  return { mapa, doc, win, storage, storageMap };
}

test("index.html possui botão, bolinha de notificação e pop-up de Novidades com a edição de hoje em linguagem simples", () => {
  const { html, script } = extrairScriptIndex();
  for (const id of ["homeNovBtn", "homeNovDot", "novDlg", "novBody", "novClose", "novOk"]) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html deve conter #${id}`);
  }

  const dom = criarDomMock();
  const ctx = vm.createContext({
    window: dom.win,
    document: dom.doc,
    localStorage: dom.storage,
    location: { search: "" },
    URLSearchParams,
    fetch: async () => ({ ok: false }),
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(script, ctx, { filename: "index.html" });

  const nov = dom.win.__qzNovidades;
  assert.ok(nov, "helpers de novidades devem estar disponíveis");
  assert.equal(nov.NOVIDADES.length, 1, "deve haver apenas a edição de hoje inicialmente");

  const atual = nov.NOVIDADES[0];
  assert.equal(atual.id, "2026-11-27");
  assert.equal(atual.data, "27/11/2026");
  assert.match(atual.titulo, /novidades/i);
  assert.match(atual.resumo, /painel de novidades/i);
  assert.ok(Array.isArray(atual.itens) && atual.itens.length >= 4);
  const texto = [atual.titulo, atual.resumo, ...atual.itens].join(" ");
  assert.match(texto, /Meu to-do/);
  assert.match(texto, /Suporte/);
  assert.doesNotMatch(texto, /\b(PR|commit|API|JSONB|SO_API|endpoint)\b/);

  // Sem leitura prévia: bolinha vermelha visível
  nov.atualizarBotaoNovidades();
  assert.equal(nov.temNovidadeNaoLida(), true);
  assert.equal(dom.mapa["#homeNovDot"].hidden, false);

  // Ao clicar para abrir: marca como lido, esconde a bolinha e renderiza histórico
  dom.mapa["#homeNovBtn"].click();
  assert.equal(nov.temNovidadeNaoLida(), false);
  assert.equal(dom.mapa["#homeNovDot"].hidden, true);
  assert.equal(dom.mapa["#novDlg"].open, true);
  assert.match(dom.mapa["#novBody"].innerHTML, /Mais recente/);
  assert.match(dom.mapa["#novBody"].innerHTML, /Atualizações anteriores/);
  assert.match(dom.mapa["#novBody"].innerHTML, /primeira edição do painel/);

  // Fecha pelo botão "Entendi"
  dom.mapa["#novOk"].click();
  assert.equal(dom.mapa["#novDlg"].open, false);

  // Simula atualização futura (id diferente salvo) -> bolinha reaparece
  dom.storage.setItem(nov.chaveNovidades(), "2026-11-20");
  nov.atualizarBotaoNovidades();
  assert.equal(nov.temNovidadeNaoLida(), true);
  assert.equal(dom.mapa["#homeNovDot"].hidden, false);
});
