process.env.DATABASE_URL ||= "postgresql://test:test@localhost/test";

import test from "node:test";
import assert from "node:assert/strict";

const {
  diaSP,
  horaSP,
  resumoDinamico,
  processarRetencaoPeca,
  RETENCAO_DIAS,
  calcularPicosHorario,
  podeEnviar,
  podeDecidir,
  veTodas,
  veDash,
} = await import("../api/_pecas.js");

test("diaSP e horaSP convertem ISO para America/Sao_Paulo corretamente", () => {
  // 01:30 UTC corresponde a 22:30 do dia anterior em SP (UTC-3)
  assert.equal(diaSP("2026-11-12T01:30:00Z"), "2026-11-11");
  assert.equal(horaSP("2026-11-12T01:30:00Z"), 22);
  assert.equal(diaSP("2026-11-12T15:00:00Z"), "2026-11-12");
  assert.equal(horaSP("2026-11-12T15:00:00Z"), 12);
  assert.equal(diaSP(""), "");
  assert.equal(diaSP("invalido"), "");
  assert.equal(horaSP(null), null);
  assert.equal(horaSP("invalido"), null);
});

test("resumoDinamico calcula online+offline, metas, porcentagens e filtros", () => {
  const carteira = [
    { id: "c1", nome: "Cli Parcial", conteudos: 8, motions: 2, tipo: "FEE MENSAL", nivel: "A", atendimento: "Ana", social: "Bia" },
    { id: "c2", nome: "Cli Superou", conteudos: 2, motions: 0, tipo: "FEE MENSAL", nivel: "B", atendimento: "Ana", social: "Bia" },
    { id: "c3", nome: "Cli Zero Envios", conteudos: 4, motions: 1, tipo: "FEE MENSAL", nivel: "C", atendimento: "Ana", social: "Bia" },
    { id: "c4", nome: "Cli Sem Meta", conteudos: 0, motions: 0, tipo: "JOB", nivel: "D", atendimento: "Ana", social: "Bia" },
  ];

  const pecas = [
    {
      id: "p1", clienteId: "c1", clienteNome: "Cli Parcial", tipoMidia: "online", status: "aprovada",
      criadoEm: "2026-11-12T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-11-12T12:00:00Z" }, { n: 2, enviadaEm: "2026-11-12T16:00:00Z" }],
      historico: [
        { tipo: "alteracao_solicitada", versao: 1, em: "2026-11-12T14:00:00Z", por: { login: "edu", nome: "Edu" } },
        { tipo: "aprovada", versao: 2, em: "2026-11-12T18:00:00Z", por: { login: "edu", nome: "Edu" } },
      ],
      remetente: { login: "d1", nome: "Designer 1" },
    },
    {
      id: "p2", clienteId: "c1", clienteNome: "Cli Parcial", tipoMidia: "offline", status: "aprovada",
      criadoEm: "2026-11-13T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-11-13T12:00:00Z" }],
      historico: [{ tipo: "aprovada", versao: 1, em: "2026-11-13T14:00:00Z", por: { login: "edu", nome: "Edu" } }],
      remetente: { login: "d1", nome: "Designer 1" },
    },
    {
      id: "p3", clienteId: "c1", clienteNome: "Cli Parcial", tipoMidia: "online", status: "pendente",
      criadoEm: "2026-11-14T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-11-14T12:00:00Z" }],
      historico: [],
      remetente: { login: "d2", nome: "Designer 2" },
    },
    {
      id: "p4", clienteId: "c2", clienteNome: "Cli Superou", tipoMidia: "online", status: "aprovada",
      criadoEm: "2026-11-15T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-11-15T12:00:00Z" }],
      historico: [{ tipo: "aprovada", versao: 1, em: "2026-11-15T13:00:00Z", por: { login: "well", nome: "Well" } }],
      remetente: { login: "d1", nome: "Designer 1" },
    },
    {
      id: "p5", clienteId: "c2", clienteNome: "Cli Superou", tipoMidia: "online", status: "aprovada",
      criadoEm: "2026-11-15T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-11-15T12:00:00Z" }],
      historico: [{ tipo: "aprovada", versao: 1, em: "2026-11-15T13:00:00Z", por: { login: "well", nome: "Well" } }],
      remetente: { login: "d1", nome: "Designer 1" },
    },
    {
      id: "p6", clienteId: "c2", clienteNome: "Cli Superou", tipoMidia: "online", status: "reprovada",
      criadoEm: "2026-11-15T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-11-15T12:00:00Z" }],
      historico: [{ tipo: "reprovada", versao: 1, em: "2026-11-15T13:00:00Z", por: { login: "well", nome: "Well" } }],
      remetente: { login: "d2", nome: "Designer 2" },
    },
    {
      id: "p7", clienteId: "c4", clienteNome: "Cli Sem Meta", tipoMidia: "online", status: "pendente",
      criadoEm: "2026-11-16T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-11-16T12:00:00Z" }],
      historico: [],
      remetente: { login: "d1", nome: "Designer 1" },
    },
    {
      id: "p8", clienteId: "cFora", clienteNome: "Fora Carteira", tipoMidia: "online", status: "aprovada",
      criadoEm: "2026-11-16T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-11-16T12:00:00Z" }],
      historico: [{ tipo: "aprovada", versao: 1, em: "2026-11-16T13:00:00Z", por: { login: "edu", nome: "Edu" } }],
      remetente: { login: "d1", nome: "Designer 1" },
    },
    // Peça de outro mês (deve ser ignorada no filtro de novembro)
    {
      id: "pOut", clienteId: "c1", clienteNome: "Cli Parcial", tipoMidia: "online", status: "aprovada",
      criadoEm: "2026-10-20T12:00:00Z",
      versoes: [{ n: 1, enviadaEm: "2026-10-20T12:00:00Z" }],
      historico: [{ tipo: "aprovada", versao: 1, em: "2026-10-20T13:00:00Z", por: { login: "edu", nome: "Edu" } }],
      remetente: { login: "d1", nome: "Designer 1" },
    },
  ];

  const r = resumoDinamico(pecas, carteira, d => d.startsWith("2026-11"));
  assert.equal(r.totais.pecas, 8);
  assert.equal(r.totais.pecasOnline, 7);
  assert.equal(r.totais.pecasOffline, 1);
  assert.equal(r.totais.versoes, 9);
  assert.equal(r.totais.aprovada, 5);
  assert.equal(r.totais.aprovadasOnline, 4);
  assert.equal(r.totais.aprovadasOffline, 1);
  assert.equal(r.totais.alteracao_solicitada, 1);
  assert.equal(r.totais.reprovada, 1);
  assert.equal(r.totais.primeiraDecididas, 6);
  assert.equal(r.totais.primeiraAprovadas, 4);
  assert.equal(r.totais.taxaPrimeira, 66.7);

  // Metas: 10 + 2 + 5 + 0 = 17 (14 conteúdos + 3 motions em 3 clientes com meta)
  assert.equal(r.totais.metaConteudos, 17);
  assert.equal(r.totais.metaConteudosBase, 14);
  assert.equal(r.totais.metaMotions, 3);
  assert.equal(r.totais.clientesComMeta, 3);
  assert.equal(r.totais.pctCarteira, 47.1);
  assert.equal(r.totais.pctCarteiraAprovada, 29.4);

  const byId = Object.fromEntries(r.clientes.map(c => [c.id, c]));
  assert.equal(byId.c1.pctCarteira, 30);
  assert.equal(byId.c1.pctCarteiraAprovada, 20);
  assert.equal(byId.c1.pendente, 1);
  assert.equal(byId.c2.pctCarteira, 150);
  assert.equal(byId.c3.pecas, 0);
  assert.equal(byId.c3.pctCarteira, 0);
  assert.equal(byId.c4.pctCarteira, null);
  assert.equal(byId.cFora.metaConteudos, 0);
  assert.equal(byId.cFora.pctCarteira, null);

  const d1 = r.enviadas.find(u => u.login === "d1");
  assert.equal(d1.pecas, 6);
  assert.equal(d1.pecasOnline, 5);
  assert.equal(d1.pecasOffline, 1);
  assert.equal(d1.aprovadas, 5);

  const rSemMeta = resumoDinamico(pecas, [], d => d.startsWith("2026-11"));
  assert.equal(rSemMeta.totais.metaConteudos, 0);
  assert.equal(rSemMeta.totais.pctCarteira, null);
  assert.equal(rSemMeta.totais.pctCarteiraAprovada, null);
});

test("processarRetencaoPeca expira arquivos antigos, arquiva peça sem apagá-la e mantém histórico no dashboard", () => {
  const agoraMs = Date.parse("2026-11-19T12:00:00.000Z");
  const limiteMs = agoraMs - RETENCAO_DIAS * 864e5;
  const emIso = new Date(agoraMs).toISOString();

  // 1. Peça inteiramente > 7 dias: expira arquivo e marca arquivada = true
  const pAntiga = {
    id: "ant1",
    clienteId: "c1",
    clienteNome: "Cli 1",
    status: "aprovada",
    criadoEm: "2026-11-05T12:00:00Z",
    versoes: [{ n: 1, enviadaEm: "2026-11-05T12:00:00Z", arquivos: [{ chave: "pecas/u/old.png" }], links: [] }],
    historico: [{ tipo: "aprovada", versao: 1, em: "2026-11-05T15:00:00Z", por: { login: "edu", nome: "Edu" } }],
  };
  const r1 = processarRetencaoPeca(pAntiga, limiteMs, emIso);
  assert.deepEqual(r1.vencidos, ["pecas/u/old.png"]);
  assert.deepEqual(r1.emUso, []);
  assert.equal(r1.arquivouAgora, true);
  assert.equal(r1.alterou, true);
  assert.equal(pAntiga.versoes[0].arquivos[0].expirado, true);
  assert.equal(pAntiga.versoes[0].arquivos[0].expiradoEm, emIso);
  assert.equal(pAntiga.arquivada, true);
  assert.equal(pAntiga.arquivadaEm, emIso);

  // 2. Idempotência ao rodar novamente na mesma peça
  const r1Again = processarRetencaoPeca(pAntiga, limiteMs, emIso);
  assert.deepEqual(r1Again.vencidos, []);
  assert.equal(r1Again.arquivouAgora, false);
  assert.equal(r1Again.alterou, false);

  // 3. Peça mista (v1 antiga, v2 recente): expira v1, mantém v2 emUso e NÃO arquiva
  const pMista = {
    id: "mista1",
    clienteId: "c1",
    clienteNome: "Cli 1",
    status: "pendente",
    criadoEm: "2026-11-05T12:00:00Z",
    versoes: [
      { n: 1, enviadaEm: "2026-11-05T12:00:00Z", arquivos: [{ chave: "pecas/u/v1.png" }], links: [] },
      { n: 2, enviadaEm: "2026-11-18T12:00:00Z", arquivos: [{ chave: "pecas/u/v2.png" }], links: [] },
    ],
    historico: [],
  };
  const r2 = processarRetencaoPeca(pMista, limiteMs, emIso);
  assert.deepEqual(r2.vencidos, ["pecas/u/v1.png"]);
  assert.deepEqual(r2.emUso, ["pecas/u/v2.png"]);
  assert.equal(r2.arquivouAgora, false);
  assert.equal(r2.alterou, true);
  assert.equal(pMista.versoes[0].arquivos[0].expirado, true);
  assert.equal(!!pMista.versoes[1].arquivos[0].expirado, false);
  assert.equal(!!pMista.arquivada, false);

  // 4. Peça arquivada continua sendo contabilizada normalmente no dashboard mensal
  const dash = resumoDinamico([pAntiga, pMista], [{ id: "c1", nome: "Cli 1", conteudos: 4, motions: 0 }], d => d.startsWith("2026-11"));
  assert.equal(dash.totais.pecas, 2);
  assert.equal(dash.totais.aprovada, 1);
  assert.equal(dash.totais.pctCarteira, 50);
  assert.equal(dash.totais.pctCarteiraAprovada, 25);
});

test("calcularPicosHorario contabiliza v1 e versões extras no fuso de Brasília", () => {
  const pecas = [
    {
      id: "p1",
      clienteId: "c1",
      criadoEm: "2026-11-12T13:10:00Z", // 10:10 SP
      versoes: [
        { n: 1, enviadaEm: "2026-11-12T13:10:00Z" },
        { n: 2, enviadaEm: "2026-11-12T18:45:00Z" }, // 15:45 SP
      ],
    },
    {
      id: "p2",
      clienteId: "c2",
      criadoEm: "2026-11-12T13:50:00Z", // 10:50 SP
      versoes: [{ n: 1, enviadaEm: "2026-11-12T13:50:00Z" }],
    },
  ];
  const { horas, horasPorCli } = calcularPicosHorario(pecas, d => d === "2026-11-12");
  assert.equal(horas.length, 24);
  assert.equal(horas[10].total, 2);
  assert.equal(horas[10].pecas, 2);
  assert.equal(horas[10].versoes, 0);
  assert.equal(horas[15].total, 1);
  assert.equal(horas[15].pecas, 0);
  assert.equal(horas[15].versoes, 1);
  assert.equal(horasPorCli.c1[10], 1);
  assert.equal(horasPorCli.c1[15], 1);
  assert.equal(horasPorCli.c2[10], 1);
});

test("permissões de peças (podeEnviar, podeDecidir, veTodas, veDash)", () => {
  const mestre = { funcao: "mestre", areas: ["pecas"] };
  const coord = { funcao: "coordenador", areas: ["pecas"] };
  const da = { funcao: "diretor_arte", areas: ["pecas"] };
  const social = { funcao: "social", areas: ["pecas"] };
  const atend = { funcao: "atendimento", areas: ["atendimento"] };

  assert.equal(podeEnviar(mestre), true);
  assert.equal(podeEnviar(coord), true);
  assert.equal(podeEnviar(da), true);
  assert.equal(podeEnviar(social), false);
  assert.equal(podeEnviar(atend), false);

  assert.equal(podeDecidir(mestre), true);
  assert.equal(podeDecidir(coord), true);
  assert.equal(podeDecidir(da), false);
  assert.equal(podeDecidir(social), false);

  assert.equal(veTodas(coord), true);
  assert.equal(veTodas(social), true);
  assert.equal(veTodas(atend), true);
  assert.equal(veTodas(da), true); // da tem area "pecas"

  assert.equal(veDash(mestre), true);
  assert.equal(veDash(coord), true);
  assert.equal(veDash(social), true);
  assert.equal(veDash(atend), true);
});
