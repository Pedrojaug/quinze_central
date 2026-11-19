import test from "node:test";
import assert from "node:assert/strict";
import {
  resolverMencoes,
  eventoNotificaUsuario,
  mencoesNaoLidasPara,
  marcarMencoesLidasNaPeca,
} from "../api/_pecas_mencoes.js";

const EQUIPE = [
  { login: "andre.silva", nome: "André Silva" },
  { login: "andre.costa", nome: "André" },
  { login: "eduardo", nome: "Eduardo" },
  { login: "gabriel.da", nome: "Gabriel" },
  { login: "equipe.inteligentte", nome: "Equipe Inteligentte" },
];

test("resolverMencoes extrai @Nome com acento, prioriza nome composto, ignora autor e suporte", () => {
  const texto = "Ajustar com @Andre Silva, @eduardo e @equipe.inteligentte, aviso do @Gabriel.";
  const res = resolverMencoes(texto, [{ login: "andre.costa" }, "equipe.inteligentte"], EQUIPE, "gabriel.da");
  const logins = res.map(x => x.login);

  assert.equal(logins.includes("andre.silva"), true);
  assert.equal(logins.includes("andre.costa"), true); // via mencoesInput
  assert.equal(logins.includes("eduardo"), true);
  assert.equal(logins.includes("gabriel.da"), false); // próprio autor ignorado
  assert.equal(logins.includes("equipe.inteligentte"), false); // conta suporte ignorada
});

test("eventoNotificaUsuario e mencoesNaoLidasPara notificam mencionados e remetente nos eventos certos", () => {
  const peca = {
    id: "p1",
    titulo: "Post 01",
    clienteNome: "Cliente X",
    status: "alteracao_solicitada",
    versao: 1,
    remetente: { login: "gabriel.da", nome: "Gabriel" },
    historico: [
      { id: "h1", tipo: "comentario", versao: 1, em: "2026-11-18T10:00:00Z", por: { login: "eduardo", nome: "Eduardo" }, comentario: "Revisar fonte", mencoes: [], vistoPor: ["eduardo"] },
      { id: "h2", tipo: "alteracao_solicitada", versao: 1, em: "2026-11-18T11:00:00Z", por: { login: "eduardo", nome: "Eduardo" }, comentario: "Subir logo", mencoes: [{ login: "andre.silva", nome: "André Silva" }], vistoPor: ["eduardo"] },
      { id: "h3", tipo: "aprovada", versao: 1, em: "2026-11-18T12:00:00Z", por: { login: "eduardo", nome: "Eduardo" }, comentario: "", mencoes: [], vistoPor: ["eduardo"] },
      { id: "h4", tipo: "comentario", versao: 1, em: "2026-11-18T13:00:00Z", por: { login: "gabriel.da", nome: "Gabriel" }, comentario: "Feito!", mencoes: [], vistoPor: ["gabriel.da"] },
    ],
  };

  // Remetente (Gabriel) recebe comentário e alteração solicitada, mas não aprovação sem menção nem o próprio comentário
  const gabNaoLidas = mencoesNaoLidasPara(peca, "gabriel.da");
  assert.deepEqual(gabNaoLidas.map(x => x.hid), ["h1", "h2"]);
  assert.equal(gabNaoLidas[0].souRemetente, true);
  assert.equal(eventoNotificaUsuario(peca, peca.historico[2], "gabriel.da"), false);
  assert.equal(eventoNotificaUsuario(peca, peca.historico[3], "gabriel.da"), false);

  // Usuário mencionado explicitamente (André Silva) recebe apenas h2
  const andreNaoLidas = mencoesNaoLidasPara(peca, "andre.silva");
  assert.deepEqual(andreNaoLidas.map(x => x.hid), ["h2"]);
  assert.equal(andreNaoLidas[0].foiMencionado, true);
  assert.equal(andreNaoLidas[0].souRemetente, false);
});

test("marcarMencoesLidasNaPeca marca evento específico ou todos e evita repetições", () => {
  const peca = {
    id: "p2",
    titulo: "Banner",
    clienteNome: "Cli",
    status: "reprovada",
    versao: 1,
    remetente: { login: "gabriel.da", nome: "Gabriel" },
    historico: [
      { id: "h1", tipo: "comentario", versao: 1, em: "2026-11-18T10:00:00Z", por: { login: "eduardo", nome: "Eduardo" }, comentario: "Oi", mencoes: [], vistoPor: ["eduardo"] },
      { id: "h2", tipo: "reprovada", versao: 1, em: "2026-11-18T11:00:00Z", por: { login: "eduardo", nome: "Eduardo" }, comentario: "Refazer", mencoes: [], vistoPor: ["eduardo"] },
    ],
  };

  // Marca apenas h1
  assert.equal(marcarMencoesLidasNaPeca(peca, "gabriel.da", "h1"), true);
  assert.deepEqual(mencoesNaoLidasPara(peca, "gabriel.da").map(x => x.hid), ["h2"]);

  // Tentar marcar h1 de novo retorna false
  assert.equal(marcarMencoesLidasNaPeca(peca, "gabriel.da", "h1"), false);

  // Marca todas as restantes
  assert.equal(marcarMencoesLidasNaPeca(peca, "gabriel.da", null), true);
  assert.deepEqual(mencoesNaoLidasPara(peca, "gabriel.da"), []);
});
