import test from "node:test";
import assert from "node:assert/strict";
import {
  hojeLocal,
  horaLocal,
  dataLocal,
  diaSemana,
  ehDiaUtil,
  somarDias,
  diasEntre,
  somarDiasUteis,
  proximoDiaUtil,
  somarMeses,
  br,
  brCurta,
} from "../api/_datas.js";

test("hojeLocal, horaLocal e dataLocal respeitam America/Fortaleza (UTC-3)", () => {
  const inst = new Date("2026-10-09T01:05:00Z");
  assert.equal(hojeLocal(inst), "2026-10-08");
  assert.equal(horaLocal(inst), "22:05");
  assert.equal(dataLocal("2026-10-09T01:05:00Z"), "2026-10-08");
  assert.equal(dataLocal(""), "");
});

test("cálculo de dias, dias úteis e próxima data útil", () => {
  // 2026-10-09 = sexta-feira, 2026-10-10 = sábado, 2026-10-11 = domingo, 2026-10-12 = segunda
  assert.equal(diaSemana("2026-10-09"), 5);
  assert.equal(diaSemana("2026-10-10"), 6);
  assert.equal(diaSemana("2026-10-11"), 0);
  assert.equal(ehDiaUtil("2026-10-09"), true);
  assert.equal(ehDiaUtil("2026-10-10"), false);
  assert.equal(ehDiaUtil("2026-10-11"), false);

  assert.equal(somarDias("2026-10-09", 3), "2026-10-12");
  assert.equal(diasEntre("2026-10-09", "2026-10-12"), 3);
  assert.equal(proximoDiaUtil("2026-10-09"), "2026-10-12");
  assert.equal(somarDiasUteis("2026-10-09", 2), "2026-10-13");
});

test("somarMeses ajusta fim de mês e virada de ano", () => {
  assert.equal(somarMeses("2026-01-31", 1), "2026-02-28");
  assert.equal(somarMeses("2026-11-15", 2), "2027-01-15");
  assert.equal(somarMeses("2026-03-31", 1), "2026-04-30");
});

test("br e brCurta formatam datas ISO", () => {
  assert.equal(br("2026-11-19"), "19/11/2026");
  assert.equal(brCurta("2026-11-19"), "19/11");
  assert.equal(br(""), "");
  assert.equal(brCurta(""), "");
});
