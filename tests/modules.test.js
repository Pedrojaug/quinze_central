import test from "node:test";
import assert from "node:assert/strict";
import {
  ALL_TABS,
  AREAS,
  perfilDe,
  podeEnviarPecas,
  abasDe,
  areasDe,
  podeCaminho,
  SO_API,
  soApi,
} from "../api/_modules.js";

test("perfilDe normaliza cargos e grafias variadas", () => {
  assert.equal(perfilDe(null), null);
  assert.equal(perfilDe({ papel: "master", funcao: "atendimento" }), "mestre");
  assert.equal(perfilDe({ funcao: "Mestre" }), "mestre");
  assert.equal(perfilDe({ funcao: "Gestão" }), "gestao");
  assert.equal(perfilDe({ funcao: "admin" }), "gestao");
  assert.equal(perfilDe({ funcao: "Gerente" }), "gestao");
  assert.equal(perfilDe({ funcao: "Atendimento" }), "atendimento");
  assert.equal(perfilDe({ funcao: "Coordenadora" }), "coordenador");
  assert.equal(perfilDe({ funcao: "Social Media" }), "social");
  assert.equal(perfilDe({ funcao: "sm" }), "social");
  assert.equal(perfilDe({ funcao: "Diretor de arte" }), "diretor_arte");
  assert.equal(perfilDe({ funcao: "Designer" }), "diretor_arte");
  assert.equal(perfilDe({ funcao: "da" }), "diretor_arte");
  assert.equal(perfilDe({ funcao: "personalizado" }), "personalizado");
});

test("podeEnviarPecas bloqueia social/atendimento e respeita flag no personalizado", () => {
  assert.equal(podeEnviarPecas(null), false);
  assert.equal(podeEnviarPecas({ funcao: "mestre" }), true);
  assert.equal(podeEnviarPecas({ funcao: "gestao" }), true);
  assert.equal(podeEnviarPecas({ funcao: "coordenador" }), true);
  assert.equal(podeEnviarPecas({ funcao: "diretor_arte" }), true);
  assert.equal(podeEnviarPecas({ funcao: "social", pode_enviar_pecas: true }), false);
  assert.equal(podeEnviarPecas({ funcao: "atendimento", pode_enviar_pecas: true }), false);
  assert.equal(podeEnviarPecas({ funcao: "personalizado" }), false);
  assert.equal(podeEnviarPecas({ funcao: "personalizado", pode_enviar_pecas: true }), true);
});

test("abasDe e areasDe para mestre, social e personalizado", () => {
  const mestre = { funcao: "mestre" };
  assert.deepEqual(new Set(abasDe(mestre)), new Set(ALL_TABS));
  assert.deepEqual(areasDe(mestre), AREAS.map(a => a.id));

  const social = { funcao: "social", pode_enviar_pecas: true };
  const abasSocial = abasDe(social);
  const areasSocial = areasDe(social);
  assert.equal(abasSocial.includes("envio"), false);
  assert.equal(abasSocial.includes("cli"), true);
  assert.equal(abasSocial.includes("fila"), true);
  assert.equal(abasSocial.includes("pecasdash"), true);
  assert.equal(abasSocial.includes("npsmedia"), true);
  assert.equal(abasSocial.includes("reclamacoes"), true);
  assert.equal(abasSocial.includes("etica"), false);
  assert.equal(AREAS.some(a => a.id === "politicas"), false);
  assert.equal(areasSocial.includes("administrativo"), false);
  assert.equal(areasSocial.includes("financeiro"), false);

  const pers = {
    funcao: "personalizado",
    abas: ["receber", "contratos", "pessoal", "fila", "prod"],
  };
  const abasPers = abasDe(pers);
  assert.equal(abasPers.includes("receber"), false);
  assert.equal(abasPers.includes("contratos"), false);
  assert.equal(abasPers.includes("pessoal"), false);
  assert.equal(abasPers.includes("fila"), true);
  assert.equal(abasPers.includes("prod"), true);
  assert.equal(abasPers.includes("envio"), false);
  assert.deepEqual(areasDe(pers), ["pecas"]);

  const persComEnvio = { funcao: "personalizado", abas: [], pode_enviar_pecas: true };
  assert.equal(abasDe(persComEnvio).includes("envio"), true);
  assert.deepEqual(areasDe(persComEnvio), ["pecas"]);
});

test("podeCaminho e soApi protegem coleções restritas e rotas só-API", () => {
  const mestre = { funcao: "mestre" };
  const gestao = { funcao: "gestao" };
  const coord = { funcao: "coordenador" };
  const social = { funcao: "social" };
  const da = { funcao: "diretor_arte" };
  const pers = { funcao: "personalizado", abas: ["fila", "prod"] };

  for (const pathRestrito of ["financeiro/lanc1", "administrativo/c1", "rh/folha"]) {
    assert.equal(podeCaminho(mestre, pathRestrito, true), true);
    assert.equal(podeCaminho(gestao, pathRestrito, true), true);
    assert.equal(podeCaminho(coord, pathRestrito, false), false);
    assert.equal(podeCaminho(pers, pathRestrito, false), false);
  }

  assert.equal(podeCaminho(social, "meses/2026-11/clientes/cli_1", true), true);
  assert.equal(podeCaminho(da, "meses/2026-11/clientes/cli_1", false), false);
  assert.equal(podeCaminho(da, "m/pecas/pecas/p1", true), true);
  assert.equal(podeCaminho(pers, "m/pecas/pecas/p1", false), true);
  assert.equal(podeCaminho(pers, "m/financeiro/lanc/1", false), false);

  assert.equal(soApi("m/pecas/pecas/1"), true);
  assert.equal(soApi("m/financeiro/x"), true);
  assert.equal(soApi("m/administrativo/y"), true);
  assert.equal(soApi("meses/2026-11/clientes/c1"), false);
  assert.equal(soApi("config/geral"), false);

  for (const area of AREAS) {
    assert.equal(SO_API.includes(`m/${area.id}/`), true);
    assert.equal(soApi(`m/${area.id}/doc1`), true);
  }
});
