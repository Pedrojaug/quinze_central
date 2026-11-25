import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function criarMockDom(temaInicial) {
  const storageMap = new Map();
  if (temaInicial !== undefined) storageMap.set("qz-theme", temaInicial);
  const storage = {
    getItem: k => (storageMap.has(k) ? storageMap.get(k) : null),
    setItem: (k, v) => { storageMap.set(k, String(v)); },
  };
  const meta = { content: "light" };
  const btn = {
    dataset: {},
    attrs: {},
    textContent: "",
    title: "",
    listeners: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
    click() { (this.listeners.click || []).forEach(fn => fn()); },
  };
  const doc = {
    documentElement: { dataset: { theme: "light" } },
    querySelector: sel => (sel === 'meta[name="color-scheme"]' ? meta : null),
    querySelectorAll: sel => (sel === "[data-qz-theme-toggle]" ? [btn] : []),
  };
  const winListeners = {};
  const win = {
    QZ: {},
    localStorage: storage,
    location: { pathname: "/app", search: "", hash: "" },
    addEventListener(ev, fn) { (winListeners[ev] ||= []).push(fn); },
    dispatchStorage(key, newValue) { (winListeners.storage || []).forEach(fn => fn({ key, newValue })); },
  };
  return { win, doc, storage, storageMap, meta, btn };
}

function carregarTema(mock) {
  const codigo = fs.readFileSync(path.join(process.cwd(), "src", "js", "08b-shared.js"), "utf8");
  const ctx = vm.createContext({
    window: mock.win,
    document: mock.doc,
    URLSearchParams,
    Intl,
    Date,
    setTimeout,
    clearTimeout,
    navigator: {},
  });
  vm.runInContext(codigo, ctx, { filename: "src/js/08b-shared.js" });
  return mock.win.QZ.tema;
}

test("QZ.tema normaliza valores e lê storage com fallback seguro para claro", () => {
  const m1 = criarMockDom("dark");
  const tema1 = carregarTema(m1);
  assert.equal(tema1.normalizar("dark"), "dark");
  assert.equal(tema1.normalizar("light"), "light");
  assert.equal(tema1.normalizar("auto"), "light");
  assert.equal(tema1.normalizar(null), "light");
  assert.equal(tema1.ler(m1.storage), "dark");

  const storageQuebrado = { getItem() { throw new Error("bloqueado"); } };
  assert.equal(tema1.ler(storageQuebrado), "light");
});

test("QZ.tema.aplicar, alternar e iniciar atualizam DOM, meta, botões, localStorage e sincronizam abas", () => {
  const mock = criarMockDom();
  const tema = carregarTema(mock);

  const inicial = tema.iniciar({ doc: mock.doc, win: mock.win, storage: mock.storage });
  assert.equal(inicial, "light");
  assert.equal(mock.doc.documentElement.dataset.theme, "light");
  assert.equal(mock.meta.content, "light");
  assert.equal(mock.btn.attrs["aria-pressed"], "false");
  assert.match(mock.btn.textContent, /Escuro/);

  mock.btn.click();
  assert.equal(mock.doc.documentElement.dataset.theme, "dark");
  assert.equal(mock.meta.content, "dark");
  assert.equal(mock.storageMap.get("qz-theme"), "dark");
  assert.equal(mock.btn.attrs["aria-pressed"], "true");
  assert.match(mock.btn.textContent, /Claro/);

  const aposAlternar = tema.alternar({ doc: mock.doc, storage: mock.storage });
  assert.equal(aposAlternar, "light");
  assert.equal(mock.storageMap.get("qz-theme"), "light");

  // Sincronização de outra aba via evento storage
  mock.win.dispatchStorage("qz-theme", "dark");
  assert.equal(mock.doc.documentElement.dataset.theme, "dark");
  assert.equal(mock.btn.attrs["aria-pressed"], "true");

  // Chamada repetida de iniciar não duplica listener de clique
  tema.iniciar({ doc: mock.doc, win: mock.win, storage: mock.storage });
  assert.equal(mock.btn.listeners.click.length, 1);
});

test("Páginas HTML contêm anti-FOUC e src/app.css define paleta dark azul-ardósia preservando .sheet clara", () => {
  for (const arq of ["src/app.html", "index.html", "pop.html"]) {
    const html = fs.readFileSync(path.join(process.cwd(), arq), "utf8");
    assert.match(html, /localStorage\.getItem\(["']qz-theme["']\)/, `${arq} deve conter snippet anti-FOUC`);
  }
  const css = fs.readFileSync(path.join(process.cwd(), "src", "app.css"), "utf8");
  assert.match(css, /:root\[data-theme="dark"\][^}]*--paper:#0B1120/);
  assert.match(css, /:root\[data-theme="dark"\][^}]*#agCal/);
  assert.match(css, /\.sheet\{background:#fff/);
});
