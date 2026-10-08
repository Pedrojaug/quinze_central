// POP operacional por função (instrução 09). Rota /api/m?r=pop/<ação>.
// Dados em m/administrativo/... (fora da sincronização geral):
//   pops/<funcao>                   { rotulo, publicada: N|null, rascunho: N|null }
//   pop_versoes/<funcao>__v<N>      { funcao, numero, estado: rascunho|publicado, conteudo, autor, criadoEm, publicadoEm, resumoMudanca }
//   pop_ia_usos/<id>                { em, login, funcao, atalho, escopo, ok } (sem o texto do pedido)
// Permissões (conferidas aqui): só o Mestre edita, vê rascunhos e histórico, publica, restaura e usa o Claude.
// A gestão lê todos os POPs publicados. "Meu POP": cada pessoa recebe só o POP publicado da própria função e o geral.
// Versões publicadas nunca são alteradas: publicar cria uma versão nova; restaurar copia uma versão antiga para o rascunho.
import { sql } from "./_lib.js";
import { perfilDe, AREAS, MODULOS, PERFIS } from "./_modules.js";
import { listar, ler, gravar, apagar, criarSeNovo, novoId, txt } from "./_mdados.js";
import { perguntarJSON, ErroIA, MSG_IA } from "./_ia.js";
import { FUNCOES_POP, V1, V2 } from "./_pop_base.js";

const M = "administrativo";
const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const negado = (res, msg) => res.status(403).json({ code: "sem_acesso", msg: msg || "Sem permissão." });
const ehMestre = u => perfilDe(u) === "mestre";
const ehGestao = u => ["mestre", "gestao"].includes(perfilDe(u));
const FUNCOES = Object.keys(FUNCOES_POP);
const idVersao = (f, n) => `${f}__v${n}`;
export const IA_POR_MINUTO = 6;
const MAX_POP_BYTES = 60000;

// ---------- Conteúdo: limpeza e limites ----------
export function limparConteudo(c) {
  c = c && typeof c === "object" ? c : {};
  const passo = x => ({ t: txt(typeof x === "string" ? x : x?.t, 1500), n: (typeof x === "object" && x?.n === 1) ? 1 : 0 });
  const out = {
    titulo: txt(c.titulo, 150), introducao: txt(c.introducao, 6000), linksTitulo: txt(c.linksTitulo, 60),
    links: (Array.isArray(c.links) ? c.links : []).slice(0, 20).map(l => ({ rotulo: txt(l?.rotulo, 120), url: txt(l?.url, 600) })).filter(l => l.rotulo || l.url),
    atividades: (Array.isArray(c.atividades) ? c.atividades : []).slice(0, 40).map(a => ({
      nome: txt(a?.nome, 200), quando: txt(a?.quando, 600), ferramentas: txt(a?.ferramentas, 600), pronto: txt(a?.pronto, 600), duvidas: txt(a?.duvidas, 600),
      passos: (Array.isArray(a?.passos) ? a.passos : []).slice(0, 60).map(passo).filter(x => x.t) })).filter(a => a.nome || a.passos.length),
  };
  if (Array.isArray(c.plataformas)) out.plataformas = c.plataformas.slice(0, 30).map(x => ({ nome: txt(x?.nome, 150), funcao: txt(x?.funcao, 300), link: txt(x?.link, 600) })).filter(x => x.nome);
  return out;
}

// ---------- Importação inicial (uma vez, idempotente) ----------
let baseOk = false;
export async function garantirBase() {
  if (baseOk) return;
  const ja = await ler(M, "pops", "plataformas");
  if (!ja || !ja.importado) {
    const em = agora(), autor = { login: "sistema", nome: "Importação inicial (ClickUp)" };
    for (const f of FUNCOES) {
      let publicada = null, rascunho = null;
      if (V1[f]) {
        await criarSeNovo(M, "pop_versoes", idVersao(f, 1), { funcao: f, numero: 1, estado: "publicado", conteudo: limparConteudo(V1[f]), autor, criadoEm: em, publicadoEm: em,
          resumoMudanca: "Importação do POP original exportado do ClickUp.", avisoExportacao: true });
        publicada = 1;
      }
      if (V2[f]) {
        const n = publicada ? 2 : 1;
        await criarSeNovo(M, "pop_versoes", idVersao(f, n), { funcao: f, numero: n, estado: "rascunho", conteudo: limparConteudo(V2[f]),
          autor: { login: "sistema", nome: "Proposta inicial (instrução 09)" }, criadoEm: em, resumoMudanca: publicada ? "Versão aprimorada: estrutura padrão e fluxos da Central Quinze. Aguardando revisão do Mestre." : "Esqueleto inicial. Aguardando o Mestre completar." });
        rascunho = n;
      }
      await criarSeNovo(M, "pops", f, { funcao: f, rotulo: FUNCOES_POP[f], publicada, rascunho, importado: true, criadoEm: em });
    }
  }
  baseOk = true;
}
async function meta(f) { return (await ler(M, "pops", f)) || { funcao: f, rotulo: FUNCOES_POP[f], publicada: null, rascunho: null }; }
const versao = (f, n) => (n ? ler(M, "pop_versoes", idVersao(f, n)) : null);
async function proximoNumero(f) {
  const r = await sql`SELECT coalesce(max((data->>'numero')::int), 0) AS n FROM docs WHERE parent = ${`m/${M}/pop_versoes`} AND data->>'funcao' = ${f}`;
  return Number(r[0]?.n || 0) + 1;
}
const pubVersao = v => (v ? { numero: v.numero, estado: v.estado, conteudo: v.conteudo, autor: v.autor, criadoEm: v.criadoEm, publicadoEm: v.publicadoEm || null,
  atualizadoEm: v.atualizadoEm || null, resumoMudanca: v.resumoMudanca || "", avisoExportacao: !!v.avisoExportacao, restauradoDe: v.restauradoDe || null } : null);

// ---------- Leitura ----------
// "Meu POP": o publicado da própria função + o geral de plataformas. O Mestre recebe todos os publicados.
async function meu(u, req, res) {
  await garantirBase();
  const p = perfilDe(u);
  const funcoes = p === "mestre" ? FUNCOES.filter(f => f !== "plataformas") : FUNCOES.includes(p) ? [p] : [];
  const out = [];
  for (const f of [...funcoes, "plataformas"]) {
    const m = await meta(f);
    const v = await versao(f, m.publicada);
    if (v) out.push({ funcao: f, rotulo: m.rotulo, versao: { numero: v.numero, conteudo: v.conteudo, publicadoEm: v.publicadoEm, avisoExportacao: !!v.avisoExportacao } });
  }
  return res.json({ nome: u.nome, perfil: PERFIS[p] || p, pops: out });
}
async function lista(u, req, res) {
  if (!ehGestao(u)) return negado(res, "O POP operacional fica no Administrativo (Mestre e gestão). Use \"Meu POP\".");
  await garantirBase();
  const out = [];
  for (const f of FUNCOES) {
    const m = await meta(f);
    const pub = await versao(f, m.publicada);
    const item = { funcao: f, rotulo: m.rotulo, publicada: pub ? { numero: pub.numero, publicadoEm: pub.publicadoEm } : null };
    if (ehMestre(u)) { const r = await versao(f, m.rascunho); item.rascunho = r ? { numero: r.numero, atualizadoEm: r.atualizadoEm || r.criadoEm } : null; }
    out.push(item);
  }
  return res.json({ mestre: ehMestre(u), pops: out });
}
async function ver(u, req, res) {
  if (!ehGestao(u)) return negado(res);
  await garantirBase();
  const f = String(req.query.funcao || "");
  if (!FUNCOES.includes(f)) return res.status(404).json({ code: "nao_encontrado" });
  const m = await meta(f);
  const pedida = parseInt(req.query.versao, 10);
  if (!ehMestre(u)) {
    // Gestão: só a publicada atual.
    if (pedida && pedida !== m.publicada) return negado(res, "Só o Mestre vê rascunhos e versões antigas.");
    return res.json({ funcao: f, rotulo: m.rotulo, publicada: pubVersao(await versao(f, m.publicada)) });
  }
  return res.json({ funcao: f, rotulo: m.rotulo, publicada: pubVersao(await versao(f, m.publicada)), rascunho: pubVersao(await versao(f, m.rascunho)),
    pedida: pedida ? pubVersao(await versao(f, pedida)) : null });
}
async function historico(u, req, res) {
  if (!ehMestre(u)) return negado(res, "Só o Mestre vê o histórico.");
  const f = String(req.query.funcao || "");
  if (!FUNCOES.includes(f)) return res.status(404).json({ code: "nao_encontrado" });
  const r = await sql`SELECT data FROM docs WHERE parent = ${`m/${M}/pop_versoes`} AND data->>'funcao' = ${f} AND NOT deleted ORDER BY (data->>'numero')::int DESC`;
  const m = await meta(f);
  return res.json({ atual: m.publicada, rascunho: m.rascunho, versoes: r.map(x => { const v = pubVersao(x.data); delete v.conteudo; return v; }) });
}

// ---------- Edição (só Mestre) ----------
async function salvarRascunho(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehMestre(u)) return negado(res, "Só o Mestre edita o POP.");
  await garantirBase();
  const b = corpo(req), f = String(b.funcao || "");
  if (!FUNCOES.includes(f)) return res.status(404).json({ code: "nao_encontrado" });
  if (JSON.stringify(b.conteudo || {}).length > MAX_POP_BYTES) return res.status(413).json({ code: "grande", msg: "O POP passou do tamanho máximo. Divida em mais atividades ou encurte os textos." });
  const conteudo = limparConteudo(b.conteudo);
  if (!conteudo.titulo) return res.status(400).json({ code: "titulo", msg: "Dê um título ao POP." });
  const m = await meta(f), em = agora();
  let r = await versao(f, m.rascunho);
  if (r && r.estado === "rascunho") {
    r = { ...r, conteudo, resumoMudanca: txt(b.resumoMudanca, 500) || r.resumoMudanca || "", atualizadoEm: em, atualizadoPor: quem(u) };
    await gravar(M, "pop_versoes", idVersao(f, r.numero), r);
  } else {
    let n = await proximoNumero(f);
    while (!(await criarSeNovo(M, "pop_versoes", idVersao(f, n), { funcao: f, numero: n, estado: "rascunho", conteudo, autor: quem(u), criadoEm: em, resumoMudanca: txt(b.resumoMudanca, 500) }))) n++;
    r = await versao(f, n);
    await gravar(M, "pops", f, { ...m, rascunho: n });
  }
  return res.json({ ok: true, rascunho: pubVersao(r) });
}
async function publicar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehMestre(u)) return negado(res, "Só o Mestre publica.");
  const b = corpo(req), f = String(b.funcao || "");
  if (!FUNCOES.includes(f)) return res.status(404).json({ code: "nao_encontrado" });
  const m = await meta(f);
  const r = await versao(f, m.rascunho);
  if (!r || r.estado !== "rascunho") return res.status(409).json({ code: "sem_rascunho", msg: "Não há rascunho para publicar. Salve o rascunho primeiro." });
  const em = agora();
  const pub = { ...r, estado: "publicado", publicadoEm: em, publicadoPor: quem(u), resumoMudanca: txt(b.resumoMudanca, 500) || r.resumoMudanca || "" };
  delete pub.avisoExportacao;
  // O rascunho vira a nova versão publicada (as versões publicadas anteriores ficam como estão).
  const ok = await sql`UPDATE docs SET data = ${JSON.stringify(pub)}::jsonb, updated_at = now(), seq = nextval('docs_seq')
                       WHERE path = ${`m/${M}/pop_versoes/${idVersao(f, r.numero)}`} AND data->>'estado' = 'rascunho' RETURNING id`;
  if (!ok.length) return res.status(409).json({ code: "concorrencia", msg: "O rascunho mudou. Recarregue." });
  await gravar(M, "pops", f, { ...m, publicada: r.numero, rascunho: null, atualizadoEm: em });
  return res.json({ ok: true, publicada: pubVersao(pub) });
}
async function restaurar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehMestre(u)) return negado(res);
  const b = corpo(req), f = String(b.funcao || ""), n = parseInt(b.versao, 10);
  if (!FUNCOES.includes(f)) return res.status(404).json({ code: "nao_encontrado" });
  const antiga = await versao(f, n);
  if (!antiga || antiga.estado !== "publicado") return res.status(404).json({ code: "nao_encontrado", msg: "Versão publicada não encontrada." });
  const m = await meta(f), em = agora();
  const atual = await versao(f, m.rascunho);
  if (atual && atual.estado === "rascunho") {
    if (!b.substituirRascunho) return res.status(409).json({ code: "tem_rascunho", msg: `Já existe um rascunho (v${atual.numero}). Confirme para substituí-lo pela v${n}.` });
    await gravar(M, "pop_versoes", idVersao(f, atual.numero), { ...atual, conteudo: antiga.conteudo, restauradoDe: n, atualizadoEm: em, atualizadoPor: quem(u),
      resumoMudanca: `Restaurado da v${n}.` });
    return res.json({ ok: true, rascunho: pubVersao(await versao(f, atual.numero)) });
  }
  let k = await proximoNumero(f);
  while (!(await criarSeNovo(M, "pop_versoes", idVersao(f, k), { funcao: f, numero: k, estado: "rascunho", conteudo: antiga.conteudo, restauradoDe: n, autor: quem(u), criadoEm: em, resumoMudanca: `Restaurado da v${n}.` }))) k++;
  await gravar(M, "pops", f, { ...m, rascunho: k });
  return res.json({ ok: true, rascunho: pubVersao(await versao(f, k)) });
}
async function descartarRascunho(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehMestre(u)) return negado(res);
  const f = String(corpo(req).funcao || "");
  if (!FUNCOES.includes(f)) return res.status(404).json({ code: "nao_encontrado" });
  const m = await meta(f);
  const r = await versao(f, m.rascunho);
  if (!r || r.estado !== "rascunho") return res.status(409).json({ code: "sem_rascunho", msg: "Não há rascunho." });
  await apagar(M, "pop_versoes", idVersao(f, r.numero));
  await gravar(M, "pops", f, { ...m, rascunho: null });
  return res.json({ ok: true });
}
async function rotulo(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehMestre(u)) return negado(res);
  const b = corpo(req), f = String(b.funcao || ""), r = txt(b.rotulo, 60);
  if (!FUNCOES.includes(f) || !r) return res.status(400).json({ code: "rotulo", msg: "Rótulo inválido." });
  await gravar(M, "pops", f, { ...(await meta(f)), rotulo: r });
  return res.json({ ok: true });
}

// ---------- Ajudar com o Claude (só Mestre) ----------
// Resumo dos recursos reais da Central, lido do registro de módulos NO MOMENTO da chamada.
export function recursosCentral() {
  const nome = p => PERFIS[p] || p;
  const linhas = AREAS.slice().sort((a, b) => a.ordem - b.ordem).map(a => {
    const abas = MODULOS.filter(m => m.modulo === a.id).sort((x, y) => x.ordem - y.ordem)
      .map(m => `${m.nome} (${(m.funcoes || ["mestre", "gestao", "atendimento"]).map(nome).join(", ")})`);
    return `- ${a.nome}${a.descricao ? ": " + a.descricao : ""}${abas.length ? "\n  Abas: " + abas.join("; ") : ""}`;
  });
  linhas.push("- Meu POP: atalho na tela de módulos e no topo de cada módulo; mostra o POP publicado da função da pessoa e o POP Uso das plataformas.");
  return linhas.join("\n");
}
const nomesRecursos = () => [...AREAS.map(a => a.nome.replace(/^\d+\s+/, "")), ...AREAS.map(a => a.nome), ...MODULOS.map(m => m.nome), "Meu POP", "Central Quinze"]
  .map(x => x.toLowerCase());
const SISTEMA_POP = `Você ajuda o Mestre da agência Quinze a escrever os POPs (procedimentos operacionais padrão) de cada função.
Regras fixas:
1. Escreva em português do Brasil, no tom claro e direto dos POPs existentes (frases curtas, verbos no imperativo, checklists).
2. NÃO invente prazos, horários, regras, nomes de pessoas, valores ou ferramentas que não estejam nos POPs recebidos ou no registro da Central Quinze. Quando faltar informação, escreva [CONFIRMAR: o que falta] em vez de supor.
3. Cite apenas telas, módulos e fluxos da Central Quinze que estão no registro recebido. Se o pedido citar algo que não está no registro, não inclua e explique na "explicacao".
4. Proponha no máximo o trecho pedido (o "escopo"). Não reescreva o POP inteiro se o escopo não for o POP inteiro.
5. Mantenha a estrutura: atividades com nome, quando, passos (lista; "n":1 marca subitem), ferramentas, critério de pronto e quem acionar. Aceita **negrito**, links e observações do tipo "🌐 Uso do ClickUp: ...".
6. Preserve as regras que já existem no texto (não remova regra existente sem o pedido explícito).
Responda só com JSON, no formato pedido para o escopo, mais "explicacao" (uma ou duas frases sobre o que mudou) e "recursosCitados" (lista dos nomes de telas/módulos da Central citados na proposta).`;
const ATALHOS = {
  melhorar: "Melhore o texto selecionado: mais claro, direto e no tom dos POPs, sem mudar o sentido.",
  completar: "Complete este passo com o que faltar para alguém executá-lo sem dúvidas, sem inventar informações (use [CONFIRMAR]).",
  checklist: "Transforme esta atividade em um checklist de passos curtos e verificáveis, um por linha.",
  revisar: "Revise clareza e consistência (termos, tom, ordem dos passos, contradições com os outros POPs). Corrija só o necessário.",
  sugerir: "Sugira as tarefas/passos que faltam nesta atividade, mantendo os existentes. Marque com [CONFIRMAR] o que depender de definição.",
  adaptar: "Adapte à Central Quinze: onde fizer sentido, indique a tela da Central (do registro) em que o passo é feito. Não cite nada fora do registro.",
  livre: "",
};
const FORMATO = {
  trecho: `{"texto":"novo texto do trecho","explicacao":"...","recursosCitados":[]}`,
  atividade: `{"atividade":{"nome":"","quando":"","passos":[{"t":"","n":0}],"ferramentas":"","pronto":"","duvidas":""},"explicacao":"...","recursosCitados":[]}`,
  pop: `{"conteudo":{"titulo":"","introducao":"","links":[{"rotulo":"","url":""}],"atividades":[{"nome":"","quando":"","passos":[{"t":"","n":0}],"ferramentas":"","pronto":"","duvidas":""}]},"explicacao":"...","recursosCitados":[]}`,
};
async function ia(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!ehMestre(u)) return negado(res, "Só o Mestre usa o Claude no POP.");
  const b = corpo(req), f = String(b.funcao || "");
  if (!FUNCOES.includes(f)) return res.status(404).json({ code: "nao_encontrado" });
  const atalho = Object.prototype.hasOwnProperty.call(ATALHOS, b.atalho) ? b.atalho : "livre";
  const pedido = txt(b.pedido, 2000);
  if (atalho === "livre" && !pedido) return res.status(400).json({ code: "pedido", msg: "Escreva o que você quer." });
  if (JSON.stringify(b.conteudo || {}).length > MAX_POP_BYTES) return res.status(413).json({ code: "grande", msg: "O POP está grande demais para enviar ao Claude. Selecione um trecho ou uma atividade." });
  // Limite de uso por minuto (por pessoa).
  const desde = new Date(Date.now() - 60000).toISOString();
  const usos = await sql`SELECT count(*)::int AS n FROM docs WHERE parent = ${`m/${M}/pop_ia_usos`} AND data->>'login' = ${u.login} AND data->>'em' > ${desde}`;
  if ((usos[0]?.n || 0) >= IA_POR_MINUTO) return res.status(429).json({ code: "limite", msg: `Limite de ${IA_POR_MINUTO} pedidos por minuto. Espere um pouco e tente de novo.` });
  const conteudo = limparConteudo(b.conteudo);
  const sel = b.selecao && typeof b.selecao === "object" ? { caminho: txt(b.selecao.caminho, 80), texto: txt(b.selecao.texto, 3000) } : null;
  const ai = Number.isInteger(b.atividade) && conteudo.atividades[b.atividade] ? b.atividade : null;
  // Escopo: trecho selecionado > atividade em foco > POP inteiro.
  let escopo = sel && sel.texto ? "trecho" : ai !== null ? "atividade" : "pop";
  if (["checklist", "sugerir"].includes(atalho) && ai !== null) escopo = "atividade";
  if (["melhorar", "completar"].includes(atalho) && escopo !== "trecho") return res.status(400).json({ code: "selecao", msg: "Selecione o trecho (ou clique no passo) que o Claude deve trabalhar." });
  if (["checklist", "sugerir"].includes(atalho) && ai === null) return res.status(400).json({ code: "atividade", msg: "Clique numa atividade para o Claude trabalhar nela." });
  // Demais POPs (para manter o padrão e evitar contradição): publicados e, na falta, o rascunho.
  const outros = [];
  for (const g of FUNCOES.filter(x => x !== f)) {
    const m = await meta(g); const v = (await versao(g, m.publicada)) || (await versao(g, m.rascunho));
    if (v) outros.push(`### ${m.rotulo} (v${v.numero}, ${v.estado})\n${JSON.stringify(v.conteudo).slice(0, 9000)}`);
  }
  const m = await meta(f);
  const texto = [`## Registro atual da Central Quinze (só estes recursos existem)\n${recursosCentral()}`,
    `## Outros POPs\n${outros.join("\n\n")}`,
    `## POP aberto: ${m.rotulo}\n${JSON.stringify(conteudo)}`,
    escopo === "trecho" ? `## Trecho selecionado (${sel.caminho})\n${sel.texto}` : escopo === "atividade" ? `## Atividade em foco (índice ${ai})\n${JSON.stringify(conteudo.atividades[ai])}` : "## Escopo: o POP inteiro",
    `## Pedido do Mestre\n${[ATALHOS[atalho], pedido].filter(Boolean).join("\n")}`,
    `## Responda no formato do escopo "${escopo}"\n${FORMATO[escopo]}`].join("\n\n");
  const uso = { em: agora(), login: u.login, funcao: f, atalho, escopo };
  let j;
  try { j = await perguntarJSON(SISTEMA_POP, texto, escopo === "pop" ? 6000 : 2500); }
  catch (e) {
    await gravar(M, "pop_ia_usos", novoId(), { ...uso, ok: false, erro: e.code || "erro" });
    if (e instanceof ErroIA) return res.status(e.status || 502).json({ code: e.code, msg: MSG_IA[e.code] || "Não deu para falar com o Claude agora. Seu texto não foi alterado." });
    throw e;
  }
  let depois;
  if (escopo === "trecho") depois = txt(j.texto, 3000);
  else if (escopo === "atividade") depois = limparConteudo({ atividades: [j.atividade] }).atividades[0] || null;
  else depois = limparConteudo({ ...conteudo, ...(j.conteudo || {}), plataformas: j.conteudo?.plataformas || conteudo.plataformas });
  if (!depois) { await gravar(M, "pop_ia_usos", novoId(), { ...uso, ok: false, erro: "formato" }); return res.status(502).json({ code: "ia_formato", msg: MSG_IA.ia_formato }); }
  // Confere os recursos citados contra o registro: o que não existir vira aviso para o Mestre.
  const nomes = nomesRecursos();
  const citados = (Array.isArray(j.recursosCitados) ? j.recursosCitados : []).map(x => txt(x, 80)).filter(Boolean);
  const inexistentes = citados.filter(c => !nomes.some(n => n === c.toLowerCase() || c.toLowerCase().includes(n) || n.includes(c.toLowerCase())));
  await gravar(M, "pop_ia_usos", novoId(), { ...uso, ok: true });
  return res.json({ escopo, caminho: sel?.caminho || null, atividade: ai, depois, explicacao: txt(j.explicacao, 600), recursosCitados: citados, avisoInexistentes: inexistentes });
}

export const rotas = {
  meu, lista, ver, historico, "rascunho.salvar": salvarRascunho, publicar, restaurar, "rascunho.descartar": descartarRascunho, rotulo, ia,
};
// Rotas abertas a qualquer pessoa logada (as demais conferem Mestre/gestão aqui dentro).
export const qualquerPerfil = true;
