// 01 Atendimento > Minhas tarefas e relatório diário das 20h no WhatsApp (instrução 07).
// Dados em m/atendimento/<colecao>/<id>, servidos só por aqui (fora da sincronização geral: o módulo Atendimento
// também é aberto ao social media, que não deve ver tarefas). Permissões conferidas aqui:
//   atendimento: vê e edita só as suas tarefas
//   mestre e gestão: veem as de todos (filtro por pessoa), criam tarefa para um atendimento e configuram o relatório
// Coleções: tarefas, relatorio_config (geral), relatorio_envios (<AAAA-MM-DD>, um por dia), relatorio_testes.
//
// PONTO DE EXTENSÃO DO RELATÓRIO: outras funcionalidades acrescentam blocos por atendimento com
//   registrarBlocoRelatorio(id, async (pessoa, contexto) => texto | null)
// "pessoa" = { login, nome }; "contexto" = { hoje } e o que a função montadora ainda passar. O texto entra logo
// abaixo das tarefas daquela pessoa. Ex.: a instrução 08 registra "Pendências de clientes sem retorno".
// Ganchos para tarefas automáticas: garantirTarefaOrigem() e concluirTarefaOrigem() (campo "origem").
import crypto from "node:crypto";
import { sql } from "./_lib.js";
import { perfilDe } from "./_modules.js";
import { listar, ler, gravar, apagar, novoId, idValido, criarSeNovo, clientesCarteira, txt, dataIso } from "./_mdados.js";
import { hojeLocal, horaLocal, dataLocal, diaSemana, diasEntre, proximoDiaUtil, somarDias, somarMeses, br, brCurta } from "./_datas.js";
import { enviarTexto, whatsappConfigurado, numeros, mascarar, dividir } from "./_whatsapp.js";

const M = "atendimento";
const PRIORIDADES = ["baixa", "normal", "alta"];
const REPETICOES = ["", "diaria", "semanal", "mensal"];
const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const negado = (res, msg) => res.status(403).json({ code: "sem_acesso", msg: msg || "Sem permissão." });

export const veTodas = u => ["mestre", "gestao"].includes(perfilDe(u));
export const usaTarefas = u => ["mestre", "gestao", "atendimento"].includes(perfilDe(u));

// Pessoas com lista de tarefas: usuários ativos com perfil atendimento.
export async function atendimentos() {
  const r = await sql`SELECT login, nome FROM usuarios WHERE ativo AND funcao = 'atendimento' ORDER BY nome`;
  return r.map(x => ({ login: x.login, nome: x.nome || x.login }));
}

// ---------- Regras da tarefa ----------
export function situacao(t, hoje = hojeLocal()) {
  const atrasada = t.status === "pendente" && !!t.prazo && t.prazo < hoje;
  return { atrasada, diasAtraso: atrasada ? diasEntre(t.prazo, hoje) : 0 };
}
const naListaDeHoje = (t, hoje) => t.status === "pendente" && (!t.prazo || t.prazo <= hoje);
export function proximaData(t, hoje = hojeLocal()) {
  const base = t.prazo && t.prazo > hoje ? t.prazo : hoje;
  if (t.repetir === "diaria") return proximoDiaUtil(base);
  if (t.repetir === "semanal") return somarDias(base, 7);
  if (t.repetir === "mensal") return somarMeses(base, 1);
  return "";
}
const publica = (t, hoje) => ({ ...t, ...situacao(t, hoje) });

async function lerTarefaPermitida(u, id, res) {
  const t = await ler(M, "tarefas", String(id || ""));
  if (!t) { res.status(404).json({ code: "nao_encontrado", msg: "Tarefa não encontrada." }); return null; }
  if (!veTodas(u) && t.dono?.login !== u.login) { negado(res, "Esta tarefa é de outra pessoa."); return null; }
  return t;
}

// ---------- Ganchos para outras funcionalidades (ex.: pendências de clientes) ----------
const idDeOrigem = origem => "o-" + crypto.createHash("sha1").update(String(origem)).digest("hex").slice(0, 20);
// Cria (ou atualiza o título/prazo de) uma tarefa pendente ligada a uma origem. Não reabre tarefa já concluída.
export async function garantirTarefaOrigem({ origem, dono, titulo, descricao, clienteId, clienteNome, prazo }) {
  const id = idDeOrigem(origem);
  const t = await ler(M, "tarefas", id);
  if (t && t.status === "concluida") return t;
  const em = agora();
  const nova = { titulo: txt(titulo, 200), descricao: txt(descricao, 2000), clienteId: clienteId || "", clienteNome: clienteNome || "",
    prazo: prazo || "", prioridade: "alta", repetir: "", status: "pendente", dono, origem,
    criadoPor: t?.criadoPor || { login: "sistema", nome: "Central Quinze" }, criadoEm: t?.criadoEm || em, atualizadoEm: em };
  if (t && t.titulo === nova.titulo && t.prazo === nova.prazo && t.dono?.login === dono.login && t.descricao === nova.descricao) return t;
  return gravar(M, "tarefas", id, nova);
}
// Conclui automaticamente a tarefa ligada à origem (se existir e estiver pendente).
export async function concluirTarefaOrigem(origem, motivo) {
  const id = idDeOrigem(origem);
  const t = await ler(M, "tarefas", id);
  if (!t || t.status !== "pendente") return false;
  await gravar(M, "tarefas", id, { ...t, status: "concluida", concluidaEm: agora(), concluidaPor: { login: "sistema", nome: "Central Quinze" },
    conclusaoAutomatica: motivo || "origem resolvida", atualizadoEm: agora() });
  return true;
}
// Funções que outras funcionalidades registram para manter as tarefas automáticas em dia antes de listar ou relatar.
const SINCRONIZADORES = [];
export const registrarSincronizador = fn => { if (!SINCRONIZADORES.includes(fn)) SINCRONIZADORES.push(fn); };
async function sincronizar() { for (const fn of SINCRONIZADORES) { try { await fn(); } catch (e) { console.error("[tarefas] sincronizador:", String(e?.message || e).slice(0, 120)); } } }

// ---------- Rotas: tarefas ----------
async function inicio(u, req, res) {
  if (!usaTarefas(u)) return negado(res, "Minhas tarefas é do Atendimento, do Mestre e da gestão.");
  return res.json({ login: u.login, veTodas: veTodas(u), pessoas: veTodas(u) ? await atendimentos() : [quem(u)],
    clientes: await clientesCarteira(), hoje: hojeLocal(), prioridades: PRIORIDADES });
}

async function tarefas(u, req, res) {
  if (!usaTarefas(u)) return negado(res);
  await sincronizar();
  const hoje = hojeLocal(), visao = String(req.query.visao || "hoje"), pessoa = String(req.query.pessoa || "");
  let lista = await listar(M, "tarefas");
  if (!veTodas(u)) lista = lista.filter(t => t.dono?.login === u.login);
  else if (pessoa) lista = lista.filter(t => t.dono?.login === pessoa);
  const limite30 = somarDias(hoje, -30);
  if (visao === "hoje") lista = lista.filter(t => naListaDeHoje(t, hoje));
  else if (visao === "concluidas") lista = lista.filter(t => t.status === "concluida" && dataLocal(t.concluidaEm) >= limite30);
  const peso = { alta: 0, normal: 1, baixa: 2 };
  lista.sort((a, b) => visao === "concluidas" ? (b.concluidaEm || "").localeCompare(a.concluidaEm || "")
    : (a.status === b.status ? 0 : a.status === "pendente" ? -1 : 1) || (a.prazo || "9999").localeCompare(b.prazo || "9999") || peso[a.prioridade] - peso[b.prioridade]);
  return res.json({ hoje, tarefas: lista.map(t => publica(t, hoje)) });
}

async function salvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaTarefas(u)) return negado(res);
  const b = corpo(req);
  const titulo = txt(b.titulo, 200);
  if (!titulo) return res.status(400).json({ code: "titulo", msg: "Escreva o título da tarefa." });
  const prioridade = PRIORIDADES.includes(b.prioridade) ? b.prioridade : "normal";
  const repetir = REPETICOES.includes(b.repetir || "") ? b.repetir || "" : "";
  const prazo = b.prazo === "" || b.prazo === null ? "" : dataIso(b.prazo) || hojeLocal();
  let cliente = { id: "", nome: "" };
  if (b.clienteId) { const c = (await clientesCarteira()).find(x => x.id === b.clienteId); if (!c) return res.status(400).json({ code: "cliente", msg: "Cliente não está na Carteira." }); cliente = c; }
  // Dono: o atendimento é sempre dono das próprias tarefas; mestre e gestão escolhem um atendimento.
  let dono = quem(u);
  if (veTodas(u)) {
    const alvo = (await atendimentos()).find(p => p.login === b.dono);
    if (!alvo) return res.status(400).json({ code: "dono", msg: "Escolha o atendimento responsável." });
    dono = alvo;
  } else if (b.dono && b.dono !== u.login) return negado(res, "Você só cria tarefas para você.");
  const em = agora();
  if (b.id) {
    const t = await lerTarefaPermitida(u, b.id, res); if (!t) return;
    const novo = { ...t, titulo, descricao: txt(b.descricao, 2000), clienteId: cliente.id, clienteNome: cliente.nome, prazo, prioridade, repetir,
      dono: veTodas(u) ? dono : t.dono, atualizadoEm: em };
    return res.json({ ok: true, tarefa: publica(await gravar(M, "tarefas", t.id, novo)) });
  }
  const t = { titulo, descricao: txt(b.descricao, 2000), clienteId: cliente.id, clienteNome: cliente.nome, prazo, prioridade, repetir,
    status: "pendente", dono, origem: "manual", criadoPor: quem(u), criadoEm: em, atualizadoEm: em };
  return res.json({ ok: true, tarefa: publica(await gravar(M, "tarefas", novoId(), t)) });
}

async function concluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaTarefas(u)) return negado(res);
  const t = await lerTarefaPermitida(u, corpo(req).id, res); if (!t) return;
  if (t.status === "concluida") return res.status(409).json({ code: "status", msg: "A tarefa já está concluída." });
  const em = agora(), hoje = hojeLocal();
  const feita = { ...t, status: "concluida", concluidaEm: em, concluidaPor: quem(u), atualizadoEm: em };
  let proxima = null;
  // Recorrente: cria a próxima ocorrência uma única vez (mesmo que a tarefa seja reaberta e concluída de novo).
  if (t.repetir && !t.proximaId) {
    const id = novoId();
    proxima = { titulo: t.titulo, descricao: t.descricao, clienteId: t.clienteId, clienteNome: t.clienteNome, prazo: proximaData(t, hoje),
      prioridade: t.prioridade, repetir: t.repetir, status: "pendente", dono: t.dono, origem: t.origem || "manual", anteriorId: t.id,
      criadoPor: quem(u), criadoEm: em, atualizadoEm: em };
    await gravar(M, "tarefas", id, proxima);
    proxima.id = id; feita.proximaId = id;
  }
  await gravar(M, "tarefas", t.id, feita);
  return res.json({ ok: true, tarefa: publica(feita, hoje), proxima: proxima && publica(proxima, hoje) });
}

async function reabrir(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaTarefas(u)) return negado(res);
  const t = await lerTarefaPermitida(u, corpo(req).id, res); if (!t) return;
  if (t.status !== "concluida") return res.status(409).json({ code: "status", msg: "A tarefa já está pendente." });
  const { concluidaEm, concluidaPor, conclusaoAutomatica, ...resto } = t;
  const novo = { ...resto, status: "pendente", atualizadoEm: agora() };
  await gravar(M, "tarefas", t.id, novo);
  return res.json({ ok: true, tarefa: publica(novo) });
}

async function excluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaTarefas(u)) return negado(res);
  const t = await lerTarefaPermitida(u, corpo(req).id, res); if (!t) return;
  await apagar(M, "tarefas", t.id);
  return res.json({ ok: true });
}

// ---------- Relatório das 20h ----------
const BLOCOS = [];
export function registrarBlocoRelatorio(id, fn) { if (!BLOCOS.some(b => b.id === id)) BLOCOS.push({ id, fn }); }
const CONFIG_PADRAO = { ativo: true, hora: "20:00", dias: [1, 2, 3, 4, 5], destino: "", numeroTeste: "" };
const HORAS = ["17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];   // as rotinas da Vercel passam de hora em hora nesse intervalo
export async function configRelatorio() { return { ...CONFIG_PADRAO, ...((await ler(M, "relatorio_config", "geral")) || {}) }; }
const MAX_ITENS = 15;
const linhaTarefa = t => `• ${t.titulo}${t.clienteNome ? " — " + t.clienteNome : ""}`;

// Monta o relatório do dia: devolve { texto, partes, totais }. "hoje" pode ser simulado nos testes.
export async function montarRelatorio(hoje = hojeLocal()) {
  await sincronizar();
  const pessoas = await atendimentos();
  const todas = await listar(M, "tarefas");
  const blocos = [];
  let feitasEquipe = 0, pendEquipe = 0, atrasEquipe = 0;
  for (const p of pessoas) {
    const minhas = todas.filter(t => t.dono?.login === p.login);
    const feitas = minhas.filter(t => t.status === "concluida" && dataLocal(t.concluidaEm) === hoje);
    const pend = minhas.filter(t => t.status === "pendente").map(t => ({ ...t, ...situacao(t, hoje) }))
      .sort((a, b) => b.diasAtraso - a.diasAtraso || (a.prazo || "9999").localeCompare(b.prazo || "9999"));
    feitasEquipe += feitas.length; pendEquipe += pend.length; atrasEquipe += pend.filter(t => t.atrasada).length;
    const linhas = [`*${p.nome}*`];
    if (!feitas.length && !pend.length) linhas.push("Sem tarefas registradas hoje");
    else {
      linhas.push(`✅ Feito hoje: ${feitas.length}`);
      feitas.slice(0, MAX_ITENS).forEach(t => linhas.push(linhaTarefa(t)));
      if (feitas.length > MAX_ITENS) linhas.push(`• … e mais ${feitas.length - MAX_ITENS}`);
      linhas.push(`⏳ Pendente: ${pend.length}`);
      pend.slice(0, MAX_ITENS).forEach(t => linhas.push(linhaTarefa(t) + (t.atrasada ? ` _(atrasada há ${t.diasAtraso} dia${t.diasAtraso > 1 ? "s" : ""})_` : "")));
      if (pend.length > MAX_ITENS) linhas.push(`• … e mais ${pend.length - MAX_ITENS}`);
    }
    for (const b of BLOCOS) {
      try { const extra = await b.fn(p, { hoje }); if (extra) linhas.push(extra); }
      catch (e) { console.error("[relatorio] bloco", b.id, String(e?.message || e).slice(0, 120)); }
    }
    blocos.push(linhas.join("\n"));
  }
  if (!pessoas.length) blocos.push("Nenhum atendimento cadastrado.");
  const cabecalho = `*Resumo do dia — ${br(hoje)}*`;
  const rodape = `*Total da equipe:* ✅ ${feitasEquipe} feita${feitasEquipe === 1 ? "" : "s"} · ⏳ ${pendEquipe} pendente${pendEquipe === 1 ? "" : "s"}${atrasEquipe ? ` (${atrasEquipe} atrasada${atrasEquipe === 1 ? "" : "s"})` : ""}`;
  const partes = dividir(cabecalho, blocos, rodape);
  return { hoje, partes, totais: { feitas: feitasEquipe, pendentes: pendEquipe, atrasadas: atrasEquipe, pessoas: pessoas.length } };
}

// Para onde vai o relatório. Fora da produção (previews), SEMPRE vai só para o número de teste.
async function destinos(cfg) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") return { lista: numeros(cfg.numeroTeste || process.env.WHATSAPP_TESTE), teste: true };
  return { lista: numeros(cfg.destino || process.env.WHATSAPP_DESTINO), teste: false };
}
async function enviarPartes(lista, partes) {
  const resultados = [];
  for (const n of lista) for (let i = 0; i < partes.length; i++) {
    const r = await enviarTexto(n, partes[i]);
    resultados.push({ destino: mascarar(n), parte: i + 1, ok: r.ok, tentativas: r.tentativas, erro: r.erro });
  }
  return resultados;
}

// Envio do dia (rotina): uma vez por dia, no horário e nos dias configurados. "forcar" ignora horário e dia (não a duplicidade).
export async function executarRelatorio({ agoraData = new Date(), forcar = false, origem = "rotina" } = {}) {
  const cfg = await configRelatorio();
  const hoje = hojeLocal(agoraData), hora = horaLocal(agoraData);
  if (!forcar) {
    if (!cfg.ativo) return { enviado: false, motivo: "desativado" };
    if (!cfg.dias.includes(diaSemana(hoje))) return { enviado: false, motivo: "dia_sem_envio" };
    if (hora < cfg.hora) return { enviado: false, motivo: "antes_do_horario" };
  }
  // Trava do dia: o registro do envio é criado antes de enviar (duas chamadas ao mesmo tempo não duplicam).
  const reg = { data: hoje, status: "enviando", origem, inicio: new Date().toISOString() };
  let pego = await criarSeNovo(M, "relatorio_envios", hoje, reg);
  if (!pego) {
    // Só um envio que falhou por completo pode ser tentado de novo no mesmo dia.
    const r = await sql`UPDATE docs SET data = ${JSON.stringify({ ...reg, tentativaNova: true })}::jsonb, updated_at = now(), seq = nextval('docs_seq')
                        WHERE path = ${`m/${M}/relatorio_envios/${hoje}`} AND data->>'status' = 'falha' RETURNING id`;
    pego = r.length > 0;
  }
  if (!pego) return { enviado: false, motivo: "ja_enviado_hoje" };
  const rel = await montarRelatorio(hoje);
  const dest = await destinos(cfg);
  let resultados = [], status, erro = "";
  if (!whatsappConfigurado()) { status = "falha"; erro = "WhatsApp não configurado na Vercel."; }
  else if (!dest.lista.length) { status = "falha"; erro = dest.teste ? "Sem número de teste (preview)." : "Sem destino configurado."; }
  else {
    resultados = await enviarPartes(dest.lista, dest.teste ? rel.partes.map(p => "[TESTE DO PREVIEW]\n" + p) : rel.partes);
    const ok = resultados.filter(x => x.ok).length;
    status = ok === resultados.length ? "enviado" : ok ? "parcial" : "falha";
    erro = resultados.find(x => !x.ok)?.erro || "";
  }
  const fim = { ...reg, status, erro, fim: new Date().toISOString(), partes: rel.partes.length, totais: rel.totais, resultados, somenteTeste: dest.teste };
  await gravar(M, "relatorio_envios", hoje, fim);
  return { enviado: status !== "falha", status, erro, partes: rel.partes.length };
}

async function relatorioCron(req, res) {
  const segredo = process.env.CRON_SECRET || "";
  const veio = String(req.headers.authorization || "");
  const ok = segredo && veio.length === `Bearer ${segredo}`.length && crypto.timingSafeEqual(Buffer.from(veio), Buffer.from(`Bearer ${segredo}`));
  if (!ok) return res.status(401).json({ code: "unauthorized" });
  // Fora da produção (preview e teste local), dá para simular o horário com ?agora=<ISO> para testar o disparo das 20h.
  const simulado = process.env.VERCEL_ENV !== "production" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(req.query.agora || "")) ? new Date(req.query.agora) : null;
  return res.json({ ok: true, ...(await executarRelatorio(simulado && !isNaN(simulado) ? { agoraData: simulado } : {})) });
}

async function relConfig(u, req, res) {
  if (!veTodas(u)) return negado(res, "A configuração do relatório é do Mestre e da gestão.");
  const cfg = await configRelatorio();
  return res.json({ config: cfg, horas: HORAS, whatsapp: whatsappConfigurado(), producao: process.env.VERCEL_ENV === "production" || !process.env.VERCEL_ENV,
    destinoVercel: numeros(process.env.WHATSAPP_DESTINO).map(mascarar), testeVercel: numeros(process.env.WHATSAPP_TESTE).map(mascarar) });
}
async function relConfigSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!veTodas(u)) return negado(res);
  const b = corpo(req);
  const dias = [...new Set((Array.isArray(b.dias) ? b.dias : []).map(Number).filter(n => n >= 0 && n <= 6))].sort();
  if (!dias.length) return res.status(400).json({ code: "dias", msg: "Escolha pelo menos um dia." });
  if (!HORAS.includes(b.hora)) return res.status(400).json({ code: "hora", msg: "Horário inválido." });
  const destino = numeros(b.destino).join(", "), numeroTeste = numeros(b.numeroTeste).slice(0, 1).join("");
  if (txt(b.destino) && !destino) return res.status(400).json({ code: "destino", msg: "Destino inválido: use números com DDI e DDD, separados por vírgula." });
  const cfg = { ativo: !!b.ativo, hora: b.hora, dias, destino, numeroTeste, atualizadoPor: quem(u), atualizadoEm: agora() };
  await gravar(M, "relatorio_config", "geral", cfg);
  return res.json({ ok: true, config: cfg });
}
async function relPrevia(u, req, res) {
  if (!veTodas(u)) return negado(res);
  const r = await montarRelatorio();
  return res.json(r);
}
// "Enviar agora (teste)": só para o número de teste (da tela ou da Vercel). Não conta como o envio do dia.
async function relTeste(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!veTodas(u)) return negado(res);
  const cfg = await configRelatorio();
  const n = numeros(cfg.numeroTeste || process.env.WHATSAPP_TESTE)[0];
  if (!n) return res.status(400).json({ code: "sem_teste", msg: "Informe o número de teste na configuração (ou WHATSAPP_TESTE na Vercel)." });
  if (!whatsappConfigurado()) return res.status(503).json({ code: "whatsapp", msg: "WhatsApp não configurado: faltam WHATSAPP_API_URL e WHATSAPP_TOKEN na Vercel." });
  const rel = await montarRelatorio();
  const resultados = await enviarPartes([n], rel.partes.map(p => "[TESTE]\n" + p));
  const ok = resultados.every(x => x.ok);
  await gravar(M, "relatorio_testes", novoId(), { data: rel.hoje, em: agora(), por: quem(u), status: ok ? "enviado" : "falha", partes: rel.partes.length, resultados });
  return res.status(ok ? 200 : 502).json({ ok, partes: rel.partes.length, resultados, msg: ok ? "" : "O envio falhou: " + (resultados.find(x => !x.ok)?.erro || "") });
}
async function relHistorico(u, req, res) {
  if (!veTodas(u)) return negado(res);
  const envios = (await listar(M, "relatorio_envios")).map(e => ({ ...e, tipo: "diario" }));
  const testes = (await listar(M, "relatorio_testes")).map(e => ({ ...e, tipo: "teste" }));
  const lista = [...envios, ...testes].sort((a, b) => (b.fim || b.em || b.inicio || "").localeCompare(a.fim || a.em || a.inicio || "")).slice(0, 60);
  return res.json({ historico: lista });
}

export const rotas = {
  inicio, tarefas, "tarefa.salvar": salvar, "tarefa.concluir": concluir, "tarefa.reabrir": reabrir, "tarefa.excluir": excluir,
  "relatorio.config": relConfig, "relatorio.config.salvar": relConfigSalvar, "relatorio.previa": relPrevia,
  "relatorio.teste": relTeste, "relatorio.historico": relHistorico,
};
export const publicas = { "relatorio.cron": relatorioCron };
