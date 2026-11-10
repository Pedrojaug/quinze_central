// 01 Atendimento > Pendências de clientes (instrução 08): tudo o que a Quinze enviou ao cliente e ainda não teve retorno.
// Dados em m/atendimento/pendencias/<id> e m/atendimento/pendencias_config/geral, servidos só por aqui.
// Permissões (conferidas aqui): atendimento, coordenador, mestre e gestão veem TODAS; cada pessoa edita as suas (criou ou é responsável);
// mestre, gestão e coordenação editam todas e configuram os prazos. Os demais perfis recebem 403.
// A plataforma NÃO envia nada ao cliente: registra a pendência para acompanhamento e gera a mensagem de cobrança para copiar e colar.
// Ligações com a instrução 07: pendência atrasada vira tarefa do responsável (concluída sozinha quando há retorno)
// e o relatório das 20h ganha o bloco "Pendências de clientes sem retorno".
import { sql } from "./_lib.js";
import { perfilDe } from "./_modules.js";
import { listar, ler, gravar, apagar, novoId, clientesCarteira, txt, dataIso } from "./_mdados.js";
import { perguntarJSON, ErroIA, MSG_IA, iaDisponivel } from "./_ia.js";
import { lerLink } from "./_linkleitor.js";
import { hojeLocal, horaLocal, dataLocal, diasEntre, somarDiasUteis, br, brCurta } from "./_datas.js";
import { garantirTarefaOrigem, atualizarPrazoOrigem, concluirTarefaOrigem, registrarBlocoRelatorio, registrarSincronizador } from "./_tarefas.js";

const M = "atendimento";
export const TIPOS = { material_ooh_offline: "Material OOH/offline", orcamento: "Orçamento", retorno_necessario: "Retorno necessário" };
export const STATUS = { aguardando_retorno: "Aguardando retorno", respondida: "Respondida", aprovada: "Aprovada", recusada: "Recusada", cancelada: "Cancelada" };
const RETORNOS = ["respondida", "aprovada", "recusada"];
const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const negado = (res, msg) => res.status(403).json({ code: "sem_acesso", msg: msg || "Sem permissão." });
const ehGestao = u => ["mestre", "gestao", "coordenador"].includes(perfilDe(u));
export const usaPendencias = u => ["mestre", "gestao", "coordenador", "atendimento"].includes(perfilDe(u));
const podeEditar = (u, p) => ehGestao(u) || p.criadoPor?.login === u.login || p.responsavel?.login === u.login;

// ---------- Prazos e situação ----------
const PRAZOS_PADRAO = { material_ooh_offline: 2, orcamento: 2, retorno_necessario: 2 };
export async function prazos() { return { ...PRAZOS_PADRAO, ...((await ler(M, "pendencias_config", "geral"))?.prazos || {}) }; }
export function situacao(p, hoje = hojeLocal()) {
  const enviado = p.enviadoEm ? dataLocal(p.enviadoEm) : (p.criadoEm ? dataLocal(p.criadoEm) : "");
  const aguardando = p.status === "aguardando_retorno";
  const diasSemRetorno = aguardando && enviado ? Math.max(0, diasEntre(enviado, hoje)) : 0;
  const atrasada = aguardando && !!p.prazo && p.prazo < hoje;
  return { diasSemRetorno, atrasada, diasAtraso: atrasada ? diasEntre(p.prazo, hoje) : 0 };
}
const publica = (p, u, hoje) => ({ ...p, ...situacao(p, hoje), podeEditar: podeEditar(u, p) });

// ---------- Mensagens ----------
const saudacao = hora => (hora >= 5 && hora < 12 ? "Bom dia" : hora >= 12 && hora < 18 ? "Boa tarde" : "Boa noite");
const horaAgora = () => Number(horaLocal().slice(0, 2));
// Nome do cliente da Carteira (geralmente em maiúsculas) com iniciais maiúsculas.
export const nomeCliente = n => (n && n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, x => x.toLowerCase()) : n || "");
const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const prazoTexto = iso => (iso ? `${DIAS_SEMANA[new Date(iso + "T12:00:00Z").getUTCDay()]} (${brCurta(iso)})` : "assim que possível");
const PEDIDO = {
  material_ooh_offline: { abre: "Seguem os materiais para sua conferência", pede: "Pode conferir e nos dizer se está tudo certo para seguirmos com a produção?" },
  orcamento: { abre: "Segue o orçamento que preparamos", pede: "Pode nos confirmar se o orçamento está aprovado para seguirmos?" },
  retorno_necessario: { abre: "Segue para sua análise", pede: "Precisamos do seu retorno para darmos sequência." },
};
export function mensagemPadrao({ cliente, tipo, titulo, resumo, link, prazo, hora = horaAgora() }) {
  const p = PEDIDO[tipo] || PEDIDO.retorno_necessario;
  const trechoLink = link ? `\n\n${link}` : "";
  return `${saudacao(hora)}, ${cliente}! Tudo bem?\n\n${p.abre}: *${titulo}*.${resumo ? "\n" + resumo : ""}${trechoLink}\n\n${p.pede} Se possível, nos dê um retorno até ${prazoTexto(prazo)}.\n\nQualquer dúvida, estou à disposição!`;
}
export function mensagemCobranca({ cliente, titulo, link, enviadoEm, cobrancas = 0, hora = horaAgora() }) {
  const quando = brCurta(dataLocal(enviadoEm));
  const trechoLink = link ? `\n${link}` : "";
  return `${saudacao(hora)}, ${cliente}! Tudo bem?\n\n${cobrancas ? "Passando mais uma vez" : "Passando"} para lembrar${quando ? ` do envio do dia ${quando}` : ""}: *${titulo}*.${trechoLink}\n\nConseguiu dar uma olhada? Precisamos do seu retorno para seguirmos com o trabalho. Obrigado!`;
}

const SISTEMA_CLASSIFICAR = `Você classifica envios que uma agência de comunicação (Quinze) faz aos clientes e ainda aguardam resposta.
Tipos possíveis:
- material_ooh_offline: peças e materiais de mídia exterior ou offline (outdoor, busdoor, panfleto, banner, impressos, fachada, adesivos etc.).
- orcamento: orçamentos, propostas de valores, tabelas de preço.
- retorno_necessario: qualquer outro envio que dependa de resposta ou decisão do cliente (aprovações de posts, dúvidas, informações pendentes).
Regras: use SOMENTE o conteúdo recebido. Não invente nomes, valores, datas ou detalhes que não estejam lá. Se o conteúdo for pouco, faça um título e um resumo genéricos e fiéis ao que existe.
Responda só com JSON: {"tipo":"material_ooh_offline|orcamento|retorno_necessario","titulo":"até 60 caracteres","resumo":"uma linha, até 140 caracteres","confianca":"alta|media|baixa"}`;
const SISTEMA_MENSAGEM = `Você escreve mensagens de WhatsApp de um atendimento da agência Quinze para um cliente, no tom da Quinze: cordial, profissional e curto, em português do Brasil.
Use exatamente os dados recebidos. Não invente nada além deles. A mensagem DEVE: começar com a saudação e o nome do cliente exatamente como recebidos; dizer o que está sendo enviado (título e resumo); se houver link nos dados, trazer o link exatamente como recebido, sozinho numa linha (se não houver link, NÃO mencione nem invente link); dizer o que precisamos do cliente; pedir retorno até o prazo recebido. Pode usar *negrito* do WhatsApp no título. No máximo 600 caracteres. Sem assinatura com nome de pessoa.
Responda só com JSON: {"mensagem":"..."}`;

async function classificar({ blocos, link, nota, descricao, cliente }) {
  const contexto = [`Cliente: ${cliente}`, link && `Link: ${link}`, nota && `Assunto / Nota: ${nota}`, descricao && `Descrição do atendimento: ${descricao}`].filter(Boolean).join("\n");
  const instrucaoConteudo = blocos?.length
    ? "\n\nConteúdo lido do link:"
    : link
    ? "\n\nO conteúdo do link NÃO foi lido. Classifique só pelo assunto, descrição e nota acima."
    : "\n\nClassifique com base no assunto e descrição acima.";
  const pedido = [{ type: "text", text: contexto + instrucaoConteudo }, ...(blocos || [])];
  const j = await perguntarJSON(SISTEMA_CLASSIFICAR, pedido, 600);
  const tipo = TIPOS[j.tipo] ? j.tipo : "retorno_necessario";
  return { tipo, titulo: txt(j.titulo, 80) || txt(nota || descricao || "Envio para o cliente", 80), resumo: txt(j.resumo, 200), confianca: ["alta", "media", "baixa"].includes(j.confianca) ? j.confianca : "media" };
}
// Gera a mensagem com a IA; se a IA falhar ou não respeitar os dados (link, nome, saudação), usa o modelo fixo.
async function gerarMensagem(dados, variar) {
  const padrao = mensagemPadrao(dados);
  if (!iaDisponivel()) return { mensagem: padrao, fonte: "modelo" };
  const sauda = saudacao(dados.hora ?? horaAgora());
  const fatos = { saudacao: sauda, cliente: dados.cliente, tipo: TIPOS[dados.tipo], titulo: dados.titulo, resumo: dados.resumo, link: dados.link || "",
    pedido: (PEDIDO[dados.tipo] || PEDIDO.retorno_necessario).pede, prazo_de_retorno: prazoTexto(dados.prazo) };
  try {
    const j = await perguntarJSON(SISTEMA_MENSAGEM, `Dados:\n${JSON.stringify(fatos, null, 1)}${variar ? `\n\nEscreva uma versão diferente da anterior (variação ${variar}).` : ""}`, 700);
    const m = txt(j.mensagem, 1200);
    const linkOk = !dados.link || m.includes(dados.link);
    if (m && linkOk && m.startsWith(sauda) && m.includes(dados.cliente)) return { mensagem: m, fonte: "ia" };
  } catch (e) { console.error("[pendencias] mensagem:", e.code || "erro"); }
  return { mensagem: padrao, fonte: "modelo" };
}

// ---------- Pessoas ----------
async function pessoas() {
  const r = await sql`SELECT login, nome, funcao FROM usuarios WHERE ativo ORDER BY nome`;
  return r.map(x => ({ login: x.login, nome: x.nome || x.login, perfil: x.funcao }));
}

// ---------- Rotas ----------
async function inicio(u, req, res) {
  if (!usaPendencias(u)) return negado(res, "Pendências de clientes é do Atendimento, da Coordenação, do Mestre e da gestão.");
  return res.json({ login: u.login, nome: u.nome, gestao: ehGestao(u), pessoas: await pessoas(), clientes: await clientesCarteira(),
    tipos: TIPOS, status: STATUS, prazos: await prazos(), hoje: hojeLocal(), ia: iaDisponivel() });
}

async function pendencias(u, req, res) {
  if (!usaPendencias(u)) return negado(res);
  await sincronizarTarefas();
  const hoje = hojeLocal();
  const lista = await listar(M, "pendencias");
  return res.json({ hoje, pendencias: lista.map(p => publica(p, u, hoje)) });
}

// Criação rápida e edição direta de pendência (similar a Minhas Tarefas: já registra e armazena como aguardando_retorno).
async function salvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const existente = b.id ? await lerPermitida(u, b.id, res) : null;
  if (b.id && !existente) return;

  const titulo = txt(b.titulo || b.nota || b.descricao, 160);
  if (!titulo) return res.status(400).json({ code: "titulo", msg: "Descreva o que está pendente com o cliente." });

  let cli = { id: "", nome: "" };
  if (b.clienteId) {
    const achou = (await clientesCarteira()).find(c => c.id === b.clienteId);
    if (achou) cli = achou;
    else if (existente && existente.clienteId === b.clienteId) cli = { id: existente.clienteId, nome: existente.clienteNome || "" };
    else return res.status(400).json({ code: "cliente", msg: "Escolha um cliente da Carteira." });
  } else if (existente) {
    cli = { id: existente.clienteId, nome: existente.clienteNome || "" };
  } else {
    return res.status(400).json({ code: "cliente", msg: "Escolha o cliente." });
  }

  let resp = existente?.responsavel || quem(u);
  if (b.responsavel) {
    if (b.responsavel === u.login) resp = quem(u);
    else if (ehGestao(u)) {
      const p = (await pessoas()).find(x => x.login === b.responsavel);
      if (p) resp = { login: p.login, nome: p.nome };
      else if (existente && existente.responsavel?.login === b.responsavel) resp = existente.responsavel;
      else return res.status(400).json({ code: "responsavel", msg: "Responsável inválido." });
    } else if (!existente || b.responsavel !== existente.responsavel?.login) {
      return negado(res, "Só a gestão e a coordenação escolhem outro responsável.");
    }
  }

  const tipo = TIPOS[b.tipo] ? b.tipo : (existente?.tipo || "retorno_necessario");
  const pz = await prazos(), hoje = hojeLocal(), em = agora();
  const prazo = b.prazo ? (dataIso(b.prazo) || existente?.prazo || somarDiasUteis(hoje, pz[tipo] || 2)) : (existente?.prazo || somarDiasUteis(hoje, pz[tipo] || 2));
  const link = b.link !== undefined ? txt(b.link, 1500) : (existente?.link || "");
  if (link) {
    let url; try { url = new URL(link); } catch { /* inválido */ }
    if (!url || !["https:", "http:"].includes(url.protocol)) return res.status(400).json({ code: "link", msg: "Cole um link completo (começando com https://)." });
  }
  const nota = b.nota !== undefined ? txt(b.nota, 500) : (existente?.nota || "");
  const resumo = b.resumo !== undefined ? txt(b.resumo, 300) : (existente?.resumo || "");

  if (existente) {
    const mudouPrazo = prazo !== existente.prazo;
    const historico = [...(existente.historico || [])];
    if (mudouPrazo) historico.push({ em, por: quem(u), acao: "reprogramada", nota: `Prazo: ${br(existente.prazo)} → ${br(prazo)}` });
    const mensagem = b.mensagem !== undefined ? txt(b.mensagem, 3000) : (existente.mensagem || mensagemPadrao({ cliente: nomeCliente(cli.nome), tipo, titulo, resumo: resumo || nota, link, prazo }));
    const atualizado = {
      ...existente,
      clienteId: cli.id,
      clienteNome: cli.nome,
      responsavel: resp,
      tipo,
      titulo,
      resumo,
      nota,
      link,
      prazo,
      mensagem,
      status: existente.status === "rascunho" ? "aguardando_retorno" : existente.status,
      enviadoEm: existente.enviadoEm || em,
      historico,
      atualizadoEm: em,
    };
    await gravar(M, "pendencias", existente.id, atualizado);
    if (mudouPrazo) await atualizarPrazoOrigem(origemDe(existente.id), prazo);
    await sincronizarTarefas(hoje);
    return res.json({ ok: true, pendencia: publica(atualizado, u, hoje) });
  }

  const mensagem = txt(b.mensagem, 3000) || mensagemPadrao({ cliente: nomeCliente(cli.nome), tipo, titulo, resumo: resumo || nota, link, prazo });
  const nova = {
    link,
    clienteId: cli.id,
    clienteNome: cli.nome,
    responsavel: resp,
    nota,
    descricao: nota,
    tipo,
    tipoSugerido: tipo,
    titulo,
    resumo,
    confianca: "alta",
    prazo,
    mensagem,
    mensagemFonte: "modelo",
    leitura: { ok: false, fonte: "manual", nome: "", baseadoSoNaDescricao: false, semLink: !link },
    status: "aguardando_retorno",
    enviadoEm: em,
    aprovadoPor: quem(u),
    cobrancas: [],
    historico: [{ em, por: quem(u), acao: "aguardando_retorno", nota: "Pendência registrada" }],
    criadoPor: quem(u),
    criadoEm: em,
    atualizadoEm: em,
  };
  const id = novoId();
  await gravar(M, "pendencias", id, nova);
  await sincronizarTarefas(hoje);
  return res.json({ ok: true, pendencia: publica({ ...nova, id }, u, hoje) });
}

// Passo 1 (legado/IA): interpreta o envio e já salva como aguardando_retorno para não ficar preso em rascunho.
async function interpretar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const link = txt(b.link, 1500), nota = txt(b.nota, 300), descricao = txt(b.descricao, 300);
  if (link) {
    let url; try { url = new URL(link); } catch { /* inválido */ }
    if (!url || !["https:", "http:"].includes(url.protocol)) return res.status(400).json({ code: "link", msg: "Cole um link completo (começando com https://)." });
  }
  if (!link && !nota && !descricao) {
    return res.status(400).json({ code: "assunto", msg: "Informe o que foi enviado (assunto/nota) ou cole um link." });
  }
  const cli = (await clientesCarteira()).find(c => c.id === b.clienteId);
  if (!cli) return res.status(400).json({ code: "cliente", msg: "Escolha o cliente da Carteira." });
  let resp = quem(u);
  if (b.responsavel && b.responsavel !== u.login) {
    if (!ehGestao(u)) return negado(res, "Só o Mestre, a gestão e a coordenação escolhem outro responsável.");
    const p = (await pessoas()).find(x => x.login === b.responsavel);
    if (!p) return res.status(400).json({ code: "responsavel", msg: "Responsável inválido." });
    resp = { login: p.login, nome: p.nome };
  }

  let leitura = { ok: false, fonte: "manual", nome: "", baseadoSoNaDescricao: false };
  if (link) {
    leitura = await lerLink(link);
    if (leitura.motivo === "endereco_bloqueado") return res.status(400).json({ code: "link", msg: "Este endereço não pode ser lido pela plataforma." });
    if (!leitura.ok && !descricao && !nota) return res.json({ precisaDescricao: true, msg: "Não consegui ler esse link (pode ser privado ou exigir login). Descreva em uma linha o que foi enviado." });
  }

  const cliente = nomeCliente(cli.nome);
  let c;
  try { c = await classificar({ blocos: leitura.ok ? leitura.blocos : null, link, nota, descricao, cliente }); }
  catch (e) {
    if (!(e instanceof ErroIA)) throw e;
    c = { tipo: "retorno_necessario", titulo: txt(descricao || nota || leitura.nome || "Envio para o cliente", 80), resumo: "", confianca: "baixa", erroIA: MSG_IA[e.code] || "IA indisponível" };
  }
  const pz = await prazos(), hoje = hojeLocal();
  const prazo = dataIso(b.prazo) || somarDiasUteis(hoje, pz[c.tipo] || 2);
  const m = await gerarMensagem({ cliente, tipo: c.tipo, titulo: c.titulo, resumo: c.resumo, link, prazo });
  const em = agora();
  const p = { link, clienteId: cli.id, clienteNome: cli.nome, responsavel: resp, nota, descricao, tipo: c.tipo, tipoSugerido: c.tipo,
    titulo: c.titulo, resumo: c.resumo, confianca: c.confianca, prazo, mensagem: m.mensagem, mensagemFonte: m.fonte,
    leitura: { ok: !!leitura.ok, fonte: leitura.ok ? leitura.fonte : (link ? "descricao" : "manual"), nome: leitura.nome || "", baseadoSoNaDescricao: !leitura.ok && !!link, semLink: !link },
    status: "aguardando_retorno", enviadoEm: em, aprovadoPor: quem(u), cobrancas: [],
    historico: [{ em, por: quem(u), acao: "aguardando_retorno", nota: "Pendência registrada" }],
    criadoPor: quem(u), criadoEm: em, atualizadoEm: em, ...(c.erroIA ? { avisoIA: c.erroIA } : {}) };
  const id = novoId();
  await gravar(M, "pendencias", id, p);
  await sincronizarTarefas(hoje);
  return res.json({ pendencia: publica({ ...p, id }, u, hoje) });
}

async function lerPermitida(u, id, res) {
  const p = await ler(M, "pendencias", String(id || ""));
  if (!p) { res.status(404).json({ code: "nao_encontrado", msg: "Pendência não encontrada." }); return null; }
  if (!podeEditar(u, p)) { negado(res, "Só quem criou, o responsável, a coordenação, o Mestre e a gestão editam esta pendência."); return null; }
  return p;
}
function aplicarEdicao(p, b) {
  if (b.tipo && TIPOS[b.tipo]) p.tipo = b.tipo;
  if (b.titulo !== undefined) p.titulo = txt(b.titulo, 160) || p.titulo;
  if (b.resumo !== undefined) p.resumo = txt(b.resumo, 300);
  if (b.prazo !== undefined && dataIso(b.prazo)) p.prazo = dataIso(b.prazo);
  if (b.mensagem !== undefined) p.mensagem = txt(b.mensagem, 3000);
}
async function rascunhoSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res); if (!p) return;
  aplicarEdicao(p, b);
  if (p.status === "rascunho") { p.status = "aguardando_retorno"; p.enviadoEm = p.enviadoEm || agora(); }
  p.atualizadoEm = agora();
  await gravar(M, "pendencias", p.id, p);
  return res.json({ pendencia: publica(p, u) });
}
// Regerar a mensagem (com o tipo, título, resumo e prazo atuais). Trocar o tipo recalcula o prazo padrão.
async function mensagemRegerar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res); if (!p) return;
  const tipoAntes = p.tipo;
  aplicarEdicao(p, { ...b, mensagem: undefined });
  if (b.tipo && b.tipo !== tipoAntes && !b.prazo) p.prazo = somarDiasUteis(hojeLocal(), (await prazos())[p.tipo] || 2);
  p.variacao = (p.variacao || 0) + 1;
  const m = await gerarMensagem({ cliente: nomeCliente(p.clienteNome), tipo: p.tipo, titulo: p.titulo, resumo: p.resumo, link: p.link, prazo: p.prazo }, p.variacao);
  Object.assign(p, { mensagem: m.mensagem, mensagemFonte: m.fonte, atualizadoEm: agora() });
  await gravar(M, "pendencias", p.id, p);
  return res.json({ pendencia: publica(p, u) });
}
// Aprovar (ao copiar a mensagem): garante que a pendência está em aguardando_retorno.
async function aprovar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res); if (!p) return;
  aplicarEdicao(p, b);
  const em = agora();
  if (!p.prazo || p.prazo < hojeLocal()) p.prazo = somarDiasUteis(hojeLocal(), (await prazos())[p.tipo] || 2);
  Object.assign(p, { status: "aguardando_retorno", enviadoEm: p.enviadoEm || em, aprovadoPor: quem(u), atualizadoEm: em });
  p.historico.push({ em, por: quem(u), acao: "aguardando_retorno", nota: "Mensagem copiada" });
  await gravar(M, "pendencias", p.id, p);
  return res.json({ pendencia: publica(p, u) });
}
async function excluir(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const p = await lerPermitida(u, corpo(req).id, res); if (!p) return;
  await concluirTarefaOrigem(origemDe(p.id), "pendência excluída");
  await apagar(M, "pendencias", p.id);
  return res.json({ ok: true });
}
const descartar = excluir;

// Registrar retorno do cliente (respondida, aprovada ou recusada), cancelar ou reabrir.
async function retorno(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res); if (!p) return;
  const st = String(b.status || "");
  if (![...RETORNOS, "cancelada", "aguardando_retorno"].includes(st)) return res.status(400).json({ code: "status", msg: "Status inválido." });
  if (st === p.status) return res.status(409).json({ code: "status", msg: "A pendência já está com esse status." });
  const nota = txt(b.nota, 1000), data = dataIso(b.data) || hojeLocal(), em = agora();
  p.historico.push({ em, por: quem(u), acao: st, de: p.status, data, nota });
  if (RETORNOS.includes(st)) p.retorno = { status: st, data, nota, em, por: quem(u) };
  if (st === "aguardando_retorno") delete p.retorno;   // reabrir
  Object.assign(p, { status: st, atualizadoEm: em });
  await gravar(M, "pendencias", p.id, p);
  if (st !== "aguardando_retorno") await concluirTarefaOrigem(origemDe(p.id), "pendência com retorno");
  else await sincronizarTarefas(hojeLocal());
  return res.json({ pendencia: publica(p, u) });
}
// Cobrança: gera o follow-up para copiar e registra no histórico.
async function cobranca(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const p = await lerPermitida(u, corpo(req).id, res); if (!p) return;
  if (p.status !== "aguardando_retorno") return res.status(409).json({ code: "status", msg: "Só pendências aguardando retorno recebem cobrança." });
  const mensagem = mensagemCobranca({ cliente: nomeCliente(p.clienteNome), titulo: p.titulo, link: p.link, enviadoEm: p.enviadoEm || p.criadoEm, cobrancas: (p.cobrancas || []).length });
  const em = agora();
  p.cobrancas = [...(p.cobrancas || []), { em, por: quem(u) }];
  p.historico.push({ em, por: quem(u), acao: "cobranca", nota: `Cobrança nº ${p.cobrancas.length}` });
  p.atualizadoEm = em;
  await gravar(M, "pendencias", p.id, p);
  return res.json({ mensagem, pendencia: publica(p, u) });
}
async function reprogramarPrazo(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaPendencias(u)) return negado(res);
  const b = corpo(req);
  const p = await lerPermitida(u, b.id, res); if (!p) return;
  const novoPrazo = dataIso(b.prazo);
  if (!novoPrazo) return res.status(400).json({ code: "prazo", msg: "Informe uma data válida." });
  const em = agora(), antes = p.prazo;
  p.prazo = novoPrazo;
  p.atualizadoEm = em;
  p.historico.push({ em, por: quem(u), acao: "reprogramada", nota: `Prazo: ${br(antes)} → ${br(novoPrazo)}` });
  await gravar(M, "pendencias", p.id, p);
  await atualizarPrazoOrigem(origemDe(p.id), novoPrazo);
  return res.json({ pendencia: publica(p, u) });
}
async function configSalvar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehGestao(u)) return negado(res, "Os prazos são configurados pelo Mestre, pela gestão e pela coordenação.");
  const b = corpo(req).prazos || {};
  const out = {};
  for (const k of Object.keys(TIPOS)) { const n = parseInt(b[k], 10); if (!(n >= 1 && n <= 30)) return res.status(400).json({ code: "prazo", msg: "Prazo entre 1 e 30 dias úteis." }); out[k] = n; }
  await gravar(M, "pendencias_config", "geral", { prazos: out, atualizadoPor: quem(u), atualizadoEm: agora() });
  return res.json({ ok: true, prazos: out });
}

// ---------- Ligação com tarefas e relatório (instrução 07) ----------
const origemDe = id => `pendencia:${id}`;
// Pendência atrasada -> tarefa do responsável; pendência com retorno -> tarefa concluída. Também promove rascunhos antigos.
export async function sincronizarTarefas(hoje = hojeLocal()) {
  for (const p of await listar(M, "pendencias")) {
    if (p.status === "rascunho") {
      const em = p.enviadoEm || p.criadoEm || agora();
      p.status = "aguardando_retorno";
      p.enviadoEm = em;
      await gravar(M, "pendencias", p.id, p);
    }
    const s = situacao(p, hoje);
    if (p.status === "aguardando_retorno" && s.atrasada) {
      const linkTxt = p.link ? `. Link: ${p.link}` : "";
      await garantirTarefaOrigem({ origem: origemDe(p.id), dono: p.responsavel, prazo: p.prazo, clienteId: p.clienteId, clienteNome: p.clienteNome,
        titulo: `Cobrar retorno: ${p.titulo}`, descricao: `${TIPOS[p.tipo] || "Pendência"} enviado em ${br(dataLocal(p.enviadoEm || p.criadoEm))}${linkTxt}` });
    } else if (p.status !== "aguardando_retorno") await concluirTarefaOrigem(origemDe(p.id), "pendência com retorno");
  }
}
// Bloco do relatório das 20h por atendimento.
export async function blocoRelatorio(pessoa, { hoje = hojeLocal() } = {}) {
  const minhas = (await listar(M, "pendencias")).filter(p => p.status === "aguardando_retorno" && p.responsavel?.login === pessoa.login)
    .map(p => ({ ...p, ...situacao(p, hoje) })).sort((a, b) => b.diasSemRetorno - a.diasSemRetorno);
  if (!minhas.length) return null;
  const atrasadas = minhas.filter(p => p.atrasada).length;
  return [`📌 Pendências de clientes sem retorno: ${minhas.length} aguardando${atrasadas ? `, ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}` : ""}`,
    ...minhas.slice(0, 3).map(p => `• ${nomeCliente(p.clienteNome)} — ${TIPOS[p.tipo] || "Retorno"} — ${p.diasSemRetorno} dia${p.diasSemRetorno === 1 ? "" : "s"} sem retorno`)].join("\n");
}
registrarSincronizador(() => sincronizarTarefas());
registrarBlocoRelatorio("pendencias", blocoRelatorio);

export const rotas = {
  inicio, pendencias, salvar, excluir, interpretar, "rascunho.salvar": rascunhoSalvar, "mensagem.regerar": mensagemRegerar, aprovar, descartar,
  retorno, cobranca, "prazo.salvar": reprogramarPrazo, "config.salvar": configSalvar,
};
