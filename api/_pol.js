// 05 Políticas da empresa (todos os perfis): Código de ética.
// Versões em m/politicas/versoes/v<N>; leituras em m/politicas/leituras/v<N>__<login> (uma por pessoa e versão,
// gravada só se ainda não existir: não dá para registrar duas vezes nem desfazer).
// Só mestre e gestão publicam e veem a lista de quem leu; os demais recebem só o próprio status.
import { ehGestao, sql } from "./_lib.js";
import { listar, ler, gravar, criarSeNovo, txt } from "./_mdados.js";
import { decodificar, guardar, enviar, extensao } from "./_arquivos.js";
import { PERFIS, perfilDe } from "./_modules.js";

const M = "politicas";
const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const agora = () => new Date().toISOString();
const idLeitura = (n, login) => `v${n}__${login}`;

async function versaoAtual() {
  const cfg = await ler(M, "config", "etica");
  if (!cfg || !cfg.atual) return null;
  return ler(M, "versoes", "v" + cfg.atual);
}
const pubVersao = v => (v ? { numero: v.numero, tipo: v.tipo, titulo: v.titulo, texto: v.tipo === "texto" ? v.texto : "",
  arquivo: v.arquivo ? { nome: v.arquivo.nome, tamanho: v.arquivo.tamanho } : null, publicadoEm: v.publicadoEm, publicadoPor: v.publicadoPor } : null);

// Usado pela tela inicial (/api/me): a pessoa ainda não leu a versão atual?
export async function eticaPendente(u) {
  if (!u || !(u.areas || []).includes(M)) return false;
  const cfg = await ler(M, "config", "etica");
  if (!cfg || !cfg.atual) return false;
  return !(await ler(M, "leituras", idLeitura(cfg.atual, u.login)));
}

async function etica(u, req, res) {
  const v = await versaoAtual();
  const minhas = (await sql`SELECT data FROM docs WHERE parent = 'm/politicas/leituras' AND NOT deleted AND data->>'login' = ${u.login} ORDER BY seq`).map(r => ({ versao: r.data.versao, em: r.data.em }));
  return res.json({ versao: pubVersao(v), minhaLeitura: v ? minhas.find(l => l.versao === v.numero) || null : null, minhasLeituras: minhas, podePublicar: ehGestao(u) });
}
async function publicar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehGestao(u)) return res.status(403).json({ code: "sem_acesso", msg: "Só o Mestre e a gestão publicam." });
  const b = corpo(req);
  const titulo = txt(b.titulo, 150) || "Código de ética";
  const v = { titulo, publicadoEm: agora(), publicadoPor: { login: u.login, nome: u.nome || u.login } };
  if (b.arquivo) {
    const nome = txt(b.arquivo.nome, 150);
    if (extensao(nome) !== "pdf") return res.status(400).json({ code: "tipo_invalido", msg: "Envie o arquivo em PDF." });
    const { buf, erro } = decodificar(b.arquivo.b64, nome);
    if (erro) return res.status(400).json({ code: erro, msg: erro === "arquivo_grande" ? "O PDF passa de 3 MB." : "Arquivo inválido." });
    Object.assign(v, { tipo: "pdf", arquivo: { buf, nome } });
  } else {
    const texto = txt(b.texto, 200000);
    if (texto.length < 20) return res.status(400).json({ code: "campos", msg: "Cole o texto do código de ética ou envie o PDF." });
    Object.assign(v, { tipo: "texto", texto });
  }
  const versoes = await listar(M, "versoes");
  let numero = versoes.reduce((m, x) => Math.max(m, x.numero || 0), 0) + 1;
  if (v.arquivo) {
    const g = await guardar(`politicas/etica/v${numero}-${Date.now().toString(36)}.pdf`, v.arquivo.buf, v.arquivo.nome);
    v.arquivo = { chave: g.chave, nome: v.arquivo.nome, tamanho: g.tamanho };
  }
  // Grava a versão só se o número ainda estiver livre (duas publicações ao mesmo tempo não se sobrepõem).
  while (!(await criarSeNovo(M, "versoes", "v" + numero, { ...v, numero }))) numero++;
  await gravar(M, "config", "etica", { atual: numero, atualizadoEm: agora() });
  return res.json({ ok: true, versao: pubVersao({ ...v, numero }) });
}
async function arquivo(u, req, res) {
  const n = parseInt(req.query.v, 10);
  const v = n > 0 ? await ler(M, "versoes", "v" + n) : await versaoAtual();
  if (!v || !v.arquivo) return res.status(404).json({ code: "sem_arquivo" });
  return enviar(res, v.arquivo.chave, `codigo-de-etica-v${v.numero}.pdf`, req.query.ver === "1");
}
// "Li e estou ciente": sempre da pessoa logada (nunca de outra) e só da versão atual.
async function ciente(u, req, res) {
  if (!so(req, res, "POST")) return;
  const v = await versaoAtual();
  if (!v) return res.status(409).json({ code: "sem_documento", msg: "Ainda não há código de ética publicado." });
  const pedida = parseInt(corpo(req).versao, 10);
  if (pedida !== v.numero) return res.status(409).json({ code: "versao", msg: "Há uma versão mais nova. Recarregue a página e leia a versão atual." });
  const reg = { login: u.login, nome: u.nome || u.login, perfil: PERFIS[perfilDe(u)] || perfilDe(u), versao: v.numero, em: agora() };
  const ok = await criarSeNovo(M, "leituras", idLeitura(v.numero, u.login), reg);
  if (!ok) return res.status(409).json({ code: "ja_registrado", msg: "Você já registrou a leitura desta versão." });
  return res.json({ ok: true, leitura: { versao: reg.versao, em: reg.em } });
}
async function situacao() {
  const v = await versaoAtual();
  const usuarios = await sql`SELECT login, nome, funcao, papel FROM usuarios WHERE ativo ORDER BY nome`;
  const leituras = await listar(M, "leituras");
  const daAtual = v ? Object.fromEntries(leituras.filter(l => l.versao === v.numero).map(l => [l.login, l])) : {};
  const lista = usuarios.map(x => ({ login: x.login, nome: x.nome, perfil: PERFIS[perfilDe(x)] || perfilDe(x) || "",
    status: daAtual[x.login] ? "lido" : "pendente", em: daAtual[x.login]?.em || "" }));
  const versoes = (await listar(M, "versoes")).sort((a, b) => b.numero - a.numero)
    .map(x => ({ ...pubVersao(x), leituras: leituras.filter(l => l.versao === x.numero).length }));
  return { versao: pubVersao(v), lista, lidos: lista.filter(x => x.status === "lido").length, total: lista.length, versoes };
}
async function leituras(u, req, res) {
  if (!ehGestao(u)) return res.status(403).json({ code: "sem_acesso" });
  return res.json(await situacao());
}
async function csv(u, req, res) {
  if (!ehGestao(u)) return res.status(403).json({ code: "sem_acesso" });
  const s = await situacao();
  const cel = x => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const dt = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
  const linhas = [["Nome", "Login", "Perfil", "Versão", "Status", "Data e hora da leitura"].map(cel).join(";"),
    ...s.lista.map(x => [x.nome, x.login, x.perfil, s.versao ? "v" + s.versao.numero : "", x.status === "lido" ? "Lido" : "Pendente", dt(x.em)].map(cel).join(";"))];
  res.setHeader("content-type", "text/csv; charset=utf-8");
  res.setHeader("content-disposition", `attachment; filename="codigo-de-etica-leituras${s.versao ? "-v" + s.versao.numero : ""}.csv"`);
  res.statusCode = 200;
  return res.end(String.fromCharCode(0xfeff) + linhas.join("\r\n") + "\r\n");
}

export const rotas = { etica, "etica.publicar": publicar, "etica.arquivo": arquivo, "etica.ciente": ciente, "etica.leituras": leituras, "etica.csv": csv };
