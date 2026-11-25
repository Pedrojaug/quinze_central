import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function carregarAgendaHelpers() {
  const codigo = fs.readFileSync(path.join(process.cwd(), "src", "js", "06-agenda.js"), "utf8");
  const noop = () => {};
  const stubEl = () => ({ addEventListener: noop, dataset: {}, value: "" });
  const pad2 = n => String(n).padStart(2, "0");
  const isoOf = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const dOf = s => {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const ctx = vm.createContext({
    window: { QZ_SITE: true },
    document: { addEventListener: noop, querySelectorAll: () => [] },
    localStorage: { getItem: () => "", setItem: noop },
    $: stubEl,
    pad2,
    isoOf,
    dOf,
    esc: s => String(s ?? ""),
    cfg: { coordenacao: "" },
    people: () => [],
    clients: [],
    toast: noop,
    friendly: e => String(e),
    loadScript: async () => {},
    db: null,
  });
  const wrapper = `(function(){\n${codigo}\nreturn { AG_SLOT_MIN_PADRAO, AG_SLOT_MAX_PADRAO, agParseHora, validarEventoAgenda, agNormalizarFim, agSlotBounds, Date };\n})()`;
  const mod = vm.runInContext(wrapper, ctx, { filename: "src/js/06-agenda.js" });
  return {
    ...mod,
    agSlotBounds: (...args) => ({ ...mod.agSlotBounds(...args) }),
    agNormalizarFim: (...args) => ({ ...mod.agNormalizarFim(...args) }),
    dt: (...args) => new mod.Date(...args),
  };
}

const ag = carregarAgendaHelpers();

test("validarEventoAgenda aceita viagens de madrugada e voltas noturnas", () => {
  const base = {
    ats: ["RILLI"],
    titulo: "Ida a Mossoró",
    d: "2026-11-25", // quarta-feira
    hi: "04:45",
    hf: "07:20",
  };
  assert.equal(ag.validarEventoAgenda(base), "");
  assert.equal(ag.validarEventoAgenda({ ...base, hi: "04:00", hf: "07:00" }), "");
  assert.equal(ag.validarEventoAgenda({ ...base, hi: "00:00", hf: "03:30" }), "");
  assert.equal(ag.validarEventoAgenda({ ...base, hi: "19:00", hf: "22:45" }), "");
  assert.equal(ag.validarEventoAgenda({ ...base, hi: "23:30", hf: "23:59" }), "");
});

test("validarEventoAgenda rejeita participantes vazios, campos faltando, horários inválidos e fim de semana", () => {
  const valido = {
    ats: ["RILLI"],
    titulo: "Ida a Mossoró",
    d: "2026-11-25",
    hi: "04:45",
    hf: "07:20",
  };
  assert.match(ag.validarEventoAgenda({ ...valido, ats: [] }), /pessoa/i);
  assert.match(ag.validarEventoAgenda({ ...valido, titulo: "   " }), /assunto/i);
  assert.match(ag.validarEventoAgenda({ ...valido, d: "" }), /assunto/i);
  assert.match(ag.validarEventoAgenda({ ...valido, hi: "25:00" }), /válidos/i);
  assert.match(ag.validarEventoAgenda({ ...valido, hi: "4:45" }), /válidos/i);
  assert.match(ag.validarEventoAgenda({ ...valido, hi: "08:00", hf: "08:00" }), /depois/i);
  assert.match(ag.validarEventoAgenda({ ...valido, hi: "08:00", hf: "07:00" }), /depois/i);
  assert.match(ag.validarEventoAgenda({ ...valido, d: "2026-11-28" }), /segunda a sexta/i); // sábado
  assert.match(ag.validarEventoAgenda({ ...valido, d: "2026-11-29" }), /segunda a sexta/i); // domingo
});

test("agSlotBounds mantém 04h-23h por padrão e expande automaticamente para eventos fora da janela", () => {
  assert.deepEqual(ag.agSlotBounds([]), {
    slotMinTime: "04:00:00",
    slotMaxTime: "23:00:00",
  });

  assert.deepEqual(
    ag.agSlotBounds([
      { inicio: "2026-11-25T04:45", fim: "2026-11-25T07:20" },
      { inicio: "2026-11-25T19:30", fim: "2026-11-25T22:45" },
    ]),
    { slotMinTime: "04:00:00", slotMaxTime: "23:00:00" }
  );

  assert.deepEqual(
    ag.agSlotBounds([
      { start: ag.dt(2026, 10, 25, 2, 30), end: ag.dt(2026, 10, 25, 5, 0) },
      { start: ag.dt(2026, 10, 25, 21, 0), end: ag.dt(2026, 10, 25, 23, 30) },
    ]),
    { slotMinTime: "02:00:00", slotMaxTime: "24:00:00" }
  );

  // Evento dia inteiro não deve forçar expansão da grade horária
  assert.deepEqual(
    ag.agSlotBounds([
      { allDay: true, start: ag.dt(2026, 10, 25, 0, 0), end: ag.dt(2026, 10, 26, 0, 0) },
    ]),
    { slotMinTime: "04:00:00", slotMaxTime: "23:00:00" }
  );

  // Evento que termina à meia-noite exata do dia seguinte expande até 24:00:00 sem zerar o início
  assert.deepEqual(
    ag.agSlotBounds([
      { start: ag.dt(2026, 10, 25, 22, 0), end: ag.dt(2026, 10, 26, 0, 0) },
    ]),
    { slotMinTime: "04:00:00", slotMaxTime: "24:00:00" }
  );

  // Evento que atravessa para depois da meia-noite expande toda a janela 00h-24h
  assert.deepEqual(
    ag.agSlotBounds([
      { start: ag.dt(2026, 10, 25, 22, 0), end: ag.dt(2026, 10, 26, 1, 30) },
    ]),
    { slotMinTime: "00:00:00", slotMaxTime: "24:00:00" }
  );
});

test("agNormalizarFim preserva intervalos no mesmo dia e faz clamp em 23:59 ao cruzar meia-noite", () => {
  assert.deepEqual(
    ag.agNormalizarFim(ag.dt(2026, 10, 25, 4, 45), ag.dt(2026, 10, 25, 7, 20)),
    { fimHora: "07:20", fimIso: "2026-11-25T07:20" }
  );
  assert.deepEqual(
    ag.agNormalizarFim(ag.dt(2026, 10, 25, 4, 0), ag.dt(2026, 10, 25, 20, 0)),
    { fimHora: "20:00", fimIso: "2026-11-25T20:00" }
  );
  assert.deepEqual(
    ag.agNormalizarFim(ag.dt(2026, 10, 25, 23, 0), ag.dt(2026, 10, 26, 0, 0)),
    { fimHora: "23:59", fimIso: "2026-11-25T23:59" }
  );
});

test("src/app.html libera inputs de horário da agenda sem min/max/step restritivos", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "src", "app.html"), "utf8");
  const ini = html.match(/<input\b[^>]*id="ag_ini"[^>]*>/i)?.[0] || "";
  const fim = html.match(/<input\b[^>]*id="ag_fim"[^>]*>/i)?.[0] || "";
  assert.ok(ini.includes('type="time"'));
  assert.ok(fim.includes('type="time"'));
  for (const attr of ['min="07:00"', 'max="21:00"', 'step="900"']) {
    assert.equal(ini.includes(attr), false, `ag_ini não deve conter ${attr}`);
    assert.equal(fim.includes(attr), false, `ag_fim não deve conter ${attr}`);
  }
});
