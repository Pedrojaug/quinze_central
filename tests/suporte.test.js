import test from "node:test";
import assert from "node:assert/strict";
import {
  DEV_LOGIN_PADRAO,
  MAX_BYTES_ANEXO,
  calcularKpis,
  decodificarPrint,
  ehDev,
  filtrarChamadosDev,
  gerarCsvChamados,
  listarLoginsDev,
  ordenarFilaDev,
  serializarParaDev,
  serializarParaUsuario,
  validarAtualizacaoDev,
  validarNovoChamado,
  validarReabertura,
} from "../api/_suporte_regras.js";

test("ehDev e listarLoginsDev reconhecem conta dev padrão e DEV_LOGINS customizado", () => {
  assert.deepEqual(listarLoginsDev({}), [DEV_LOGIN_PADRAO]);
  assert.equal(ehDev({ login: "equipe.inteligentte" }, {}), true);
  assert.equal(ehDev({ login: "EQUIPE.INTELIGENTTE" }, {}), true);
  assert.equal(ehDev({ login: "felipe.da" }, {}), false);
  assert.equal(ehDev({ login: "eduardo" }, {}), false);

  const envCustom = { DEV_LOGINS: "eduardo, dev.extra@quinze.com" };
  assert.equal(ehDev({ login: "eduardo" }, envCustom), true);
  assert.equal(ehDev({ login: "dev.extra@quinze.com" }, envCustom), true);
  assert.equal(ehDev({ login: "equipe.inteligentte" }, envCustom), false);
});

test("validarNovoChamado valida campos obrigatórios, áreas gerais e sanitiza contexto técnico", () => {
  const errTipo = validarNovoChamado({ tipo: "invalido", area: "geral", descricao: "Teste longo o suficiente" });
  assert.equal(errTipo.ok, false);
  assert.equal(errTipo.campo, "tipo");

  const errArea = validarNovoChamado({ tipo: "bug", area: "nao_existe", descricao: "Teste longo o suficiente" });
  assert.equal(errArea.ok, false);
  assert.equal(errArea.campo, "area");

  const errDesc = validarNovoChamado({ tipo: "bug", area: "layout_geral", descricao: "curto" });
  assert.equal(errDesc.ok, false);
  assert.equal(errDesc.campo, "descricao");

  const okRes = validarNovoChamado({
    tipo: "melhoria",
    area: "perfil_acesso",
    urgente: true,
    descricao: "  Botão de salvar perfil não fecha o modal no celular.  ",
    origemUrl: "https://evil.example/phish",
    metaTecnica: { navegador: "Chrome", viewport: "390x844", tema: "dark", extraIgnorado: "x" },
  });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.dados.area, "perfil_acesso");
  assert.equal(okRes.dados.urgente, true);
  assert.equal(okRes.dados.origem_url, "");
  assert.deepEqual(okRes.dados.meta_tecnica, { navegador: "Chrome", viewport: "390x844", tema: "dark" });

  const okUrlRel = validarNovoChamado({
    tipo: "bug",
    area: "pecas",
    descricao: "Cliente Consult faltando na lista de envio.",
    origemUrl: "/app?m=pecas#envio",
  });
  assert.equal(okUrlRel.ok, true);
  assert.equal(okUrlRel.dados.origem_url, "/app?m=pecas#envio");
});

test("decodificarPrint aceita PNG/JPG/WEBP válidos e rejeita tipos/tamanhos inválidos", () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const resPng = decodificarPrint(`data:image/png;base64,${pngBytes.toString("base64")}`, "print.png");
  assert.equal(resPng.tipo, "image/png");
  assert.equal(resPng.buf.length, pngBytes.length);

  const webpBytes = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
  const resWebp = decodificarPrint(webpBytes.toString("base64"), "tela.webp");
  assert.equal(resWebp.tipo, "image/webp");

  assert.equal(decodificarPrint("AAAA", "script.svg").erro, "tipo_invalido");
  assert.equal(decodificarPrint(Buffer.from("not-png").toString("base64"), "fake.png").erro, "imagem_invalida");

  const grande = Buffer.alloc(MAX_BYTES_ANEXO + 10, 0xff);
  grande[0] = 0xff; grande[1] = 0xd8; grande[2] = 0xff;
  assert.equal(decodificarPrint(grande.toString("base64"), "grande.jpg").erro, "arquivo_grande");
});

test("esteira dev: bloqueia atalhos freestyle, exige resposta ao finalizar e permite reabertura pelo solicitante", () => {
  const base = {
    id: 5,
    usuario_login: "felipe.da",
    usuario_nome: "Felipe",
    usuario_funcao: "Diretor de arte",
    tipo: "bug",
    area: "pecas",
    urgente: false,
    descricao: "Falta cliente na lista.",
    status: "enviado",
    resposta_usuario: "",
    reaberturas_count: 0,
    historico_reaberturas: [],
    anexos: [{ id: "abc123", nome: "print.png", chave: "suporte/5/abc123-print.png", tamanho: 1200, tipo: "image/png" }],
    origem_url: "/app?m=pecas#envio",
    meta_tecnica: { viewport: "1440x900" },
    criado_em: "2026-11-27T12:00:00.000Z",
    atualizado_em: "2026-11-27T12:00:00.000Z",
    iniciado_em: null,
    finalizado_em: null,
  };

  // Isolamento de contexto técnico na visão pública e remoção de nota_interna
  const pub = serializarParaUsuario(base);
  assert.equal("nota_interna" in pub, false);
  assert.equal("origem_url" in pub, false);
  assert.equal("meta_tecnica" in pub, false);
  assert.equal("chave" in pub.anexos[0], false);
  assert.equal(pub.anexos[0].url, "/api/m?r=sup/anexo&id=5&aid=abc123");

  const devView = serializarParaDev(base);
  assert.equal("nota_interna" in devView, false);
  assert.equal(devView.origem_url, "/app?m=pecas#envio");

  // Não permite pular etapa 1 (enviado) direto para etapa 3 (finalizado)
  const pulo = validarAtualizacaoDev(base, { status: "finalizado", resposta_usuario: "Feito!" });
  assert.equal(pulo.ok, false);
  assert.equal(pulo.statusHttp, 409);
  assert.equal(pulo.code, "status_transicao_invalida");

  // Etapa 1 -> Etapa 2 (em_desenvolvimento)
  const emDev = validarAtualizacaoDev(base, { status: "em_desenvolvimento" }, "2026-11-27T13:00:00.000Z");
  assert.equal(emDev.ok, true);
  assert.equal(emDev.dados.status, "em_desenvolvimento");
  assert.equal(emDev.dados.iniciado_em, "2026-11-27T13:00:00.000Z");
  assert.equal(emDev.dados.finalizado_em, null);

  const rowEmDev = { ...base, ...emDev.dados };

  // Não permite finalizar sem mensagem explicando o que foi feito
  const semResp = validarAtualizacaoDev(rowEmDev, { status: "finalizado", resposta_usuario: "ok" });
  assert.equal(semResp.ok, false);
  assert.equal(semResp.statusHttp, 400);
  assert.equal(semResp.code, "resposta_obrigatoria");

  // Permite devolver para Enviados se puxado por engano
  const devolver = validarAtualizacaoDev(rowEmDev, { status: "enviado" }, "2026-11-27T13:10:00.000Z");
  assert.equal(devolver.ok, true);
  assert.equal(devolver.dados.status, "enviado");

  // Etapa 2 -> Etapa 3 (finalizado) com mensagem obrigatória
  const fin = validarAtualizacaoDev(
    rowEmDev,
    { status: "finalizado", resposta_usuario: "Adicionamos a Consult na lista de envio de peças!" },
    "2026-11-27T14:00:00.000Z"
  );
  assert.equal(fin.ok, true);
  assert.equal(fin.dados.status, "finalizado");
  assert.equal(fin.dados.finalizado_em, "2026-11-27T14:00:00.000Z");

  const rowFin = { ...rowEmDev, ...fin.dados };

  // Dev não volta finalizado direto para em_desenvolvimento (quem reabre é o solicitante)
  const voltaDev = validarAtualizacaoDev(rowFin, { status: "em_desenvolvimento" });
  assert.equal(voltaDev.ok, false);
  assert.equal(voltaDev.statusHttp, 409);

  // Solicitante reabre -> volta para Etapa 1 (enviado)
  const outro = validarReabertura(rowFin, { motivo: "Continua quebrado" }, { login: "leticia.sm" });
  assert.equal(outro.ok, false);
  assert.equal(outro.statusHttp, 403);

  const okReab = validarReabertura(rowFin, { motivo: "Consult ainda não aparece na etapa de envio." }, { login: "felipe.da" }, "2026-11-27T15:00:00.000Z");
  assert.equal(okReab.ok, true);
  assert.equal(okReab.dados.status, "enviado");
  assert.equal(okReab.dados.reaberturas_count, 1);
  assert.equal(okReab.dados.historico_reaberturas.length, 1);
  assert.equal(okReab.dados.finalizado_em, null);
});

test("ordenarFilaDev, calcularKpis, filtrarChamadosDev e gerarCsvChamados funcionam sem nota_interna", () => {
  const rows = [
    { id: 1, status: "enviado", urgente: false, reaberturas_count: 0, tipo: "sugestao", area: "geral", usuario_login: "a", usuario_nome: "Ana", descricao: "Ideia", criado_em: "2026-11-27T10:00:00Z" },
    { id: 2, status: "enviado", urgente: false, reaberturas_count: 1, tipo: "bug", area: "pecas", usuario_login: "b", usuario_nome: "Bia", descricao: "Voltou", criado_em: "2026-11-27T09:00:00Z" },
    { id: 3, status: "em_desenvolvimento", urgente: true, reaberturas_count: 0, tipo: "bug", area: "atendimento", usuario_login: "c", usuario_nome: "Caio", descricao: "Travou", criado_em: "2026-11-27T08:00:00Z" },
    { id: 4, status: "finalizado", urgente: true, reaberturas_count: 0, tipo: "melhoria", area: "cs", usuario_login: "d", usuario_nome: "Dani", descricao: "=CMD()", resposta_usuario: "Resolvido", finalizado_em: "2026-11-27T11:00:00Z", criado_em: "2026-11-26T10:00:00Z" },
  ];

  const ord = ordenarFilaDev(rows, "todos");
  assert.deepEqual(ord.map(r => r.id), [3, 2, 1, 4]);

  const kpis = calcularKpis(rows, "2026-11");
  assert.deepEqual(kpis, {
    urgentesPendentes: 1,
    enviados: 2,
    emDesenvolvimento: 1,
    reabertosPendentes: 1,
    finalizadosMes: 1,
    total: 4,
  });

  const apenasPendentes = filtrarChamadosDev(rows, { status: "pendentes" });
  assert.deepEqual(apenasPendentes.map(r => r.id), [1, 2, 3]);

  const todos = filtrarChamadosDev(rows, { status: "todos" });
  assert.deepEqual(todos.map(r => r.id), [1, 2, 3, 4]);

  const csv = gerarCsvChamados([rows[3]]);
  assert.equal(csv.startsWith("\uFEFF"), true);
  assert.equal(csv.includes("\"'=CMD()\""), true);
  assert.equal(csv.includes("Nota Interna"), false);
});
