// Onboarding (instrução 10): leitura do contrato pela IA, contrato -> Gerenciamento de contratos e repasse -> Carteira.
// Rota /api/m?r=onb/<ação>. Quem tem a aba Onboarding (mestre, gestão, atendimento ou personalizado com a aba) usa.
// O onboarding fica em docs "onboarding/<id>" (sincronizado com a página); o servidor grava nele só com mescla
// (jsonb_deep_merge), sem apagar o que a página gravou.
import crypto from "node:crypto";
import { sql } from "./_lib.js";
import { perfilDe } from "./_modules.js";
import { txt, dataIso, num, auditar } from "./_mdados.js";
import { tokenEnvioDireto, infoArquivo, lerArquivo, linkTemporario, enviar, nomeSeguro, extensao } from "./_arquivos.js";
import { lerArquivoDrive, googleConfigurado } from "./_google.js";
import { perguntarJSON, ErroIA, MSG_IA } from "./_ia.js";
import { contratoDoOnboarding } from "./_adm.js";
import { hojeLocal } from "./_datas.js";

const corpo = req => (req.body && typeof req.body === "object" ? req.body : {});
const so = (req, res, metodo) => { if (req.method !== metodo) { res.status(405).json({ code: "method" }); return false; } return true; };
const quem = u => ({ login: u.login, nome: u.nome || u.login });
const agora = () => new Date().toISOString();
const usaOnboarding = u => perfilDe(u) === "mestre" || (u.abas || []).includes("onb");
const MAX_LEITURA = 22 * 1024 * 1024;   // a API da IA aceita até 32 MB por pedido (o PDF vai em base64)

async function lerOnb(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_\-.]{1,120}$/.test(id)) return null;
  const r = await sql`SELECT data FROM docs WHERE path = ${"onboarding/" + id} AND NOT deleted`;
  return r[0] ? { ...r[0].data, id } : null;
}
// Grava no onboarding só os campos do "patch" (mescla profunda), avisando a página pela sequência.
async function mesclarOnb(id, patch) {
  await sql`UPDATE docs SET data = jsonb_deep_merge(data, ${JSON.stringify(patch)}::jsonb), updated_at = now(), seq = nextval('docs_seq')
            WHERE path = ${"onboarding/" + id} AND NOT deleted`;
}
const negado = res => res.status(403).json({ code: "sem_acesso", msg: "Sem acesso ao Onboarding." });

// ---------- Contrato: envio do PDF ----------
async function contratoToken(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaOnboarding(u)) return negado(res);
  const b = corpo(req), o = await lerOnb(b.id);
  if (!o) return res.status(404).json({ code: "nao_encontrado" });
  const nome = txt(b.nome, 160);
  if (extensao(nome) !== "pdf") return res.status(400).json({ code: "tipo", msg: "Envie o contrato em PDF." });
  if (!(Number(b.tamanho) > 0)) return res.status(400).json({ code: "vazio", msg: "O arquivo está vazio." });
  const chave = `onboarding/contratos/${nomeSeguro(o.id)}/${hojeLocal().replace(/-/g, "")}-${crypto.randomBytes(5).toString("hex")}/${nomeSeguro(nome).replace(/\.[^.]*$/, "")}.pdf`;
  const envio = await tokenEnvioDireto(chave, { tipos: ["application/pdf"], maxBytes: 2 * 1024 * 1024 * 1024 });
  return res.json({ chave, tipo: "application/pdf", ...envio });
}
// Depois do envio: confere o arquivo, guarda no onboarding e cria/atualiza o contrato no Gerenciamento de contratos.
async function contratoConfirmar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaOnboarding(u)) return negado(res);
  const b = corpo(req), o = await lerOnb(b.id);
  if (!o) return res.status(404).json({ code: "nao_encontrado" });
  const chave = String(b.chave || "");
  if (!chave.startsWith(`onboarding/contratos/${nomeSeguro(o.id)}/`) || chave.includes("..")) return res.status(400).json({ code: "chave", msg: "Arquivo inválido. Envie de novo." });
  const info = await infoArquivo(chave);
  if (!info) return res.status(400).json({ code: "sem_arquivo", msg: "O arquivo não chegou ao armazenamento. Envie de novo." });
  const em = agora();
  const pdf = { chave, nome: txt(b.nome, 160) || chave.split("/").pop(), tamanho: info.tamanho, em, por: quem(u) };
  const patch = { contratoPdf: pdf, contratoArquivo: pdf.nome, contratoPdfAnteriores: o.contratoPdf ? [...(o.contratoPdfAnteriores || []), o.contratoPdf] : (o.contratoPdfAnteriores || []) };
  await mesclarOnb(o.id, patch);
  const g = await enviarGerenciamento({ ...o, ...patch }, u);
  return res.json({ ok: true, arquivo: { nome: pdf.nome, tamanho: pdf.tamanho, em }, gerenciamento: g });
}
async function enviarGerenciamento(o, u) {
  try {
    const r = await contratoDoOnboarding(o, u);
    const g = { em: r.acao === "sem_mudanca" ? (o.contratoGerenciamento?.em || r.em) : agora(), acao: r.acao };
    await mesclarOnb(o.id, { contratoGerenciamento: g });
    return g;
  } catch (e) {
    console.error("[onb] gerenciamento:", String(e?.message || e).slice(0, 120));
    return { erro: "Não deu para enviar ao Gerenciamento de contratos agora. Tente de novo." };
  }
}
async function contratoArquivo(u, req, res) {
  if (!usaOnboarding(u)) return negado(res);
  const o = await lerOnb(String(req.query.id || ""));
  if (!o || !o.contratoPdf?.chave) return res.status(404).json({ code: "sem_arquivo" });
  let url = null; try { url = await linkTemporario(o.contratoPdf.chave); } catch { url = null; }
  if (url) { res.statusCode = 302; res.setHeader("location", url); res.setHeader("cache-control", "private, no-store"); return res.end(); }
  return enviar(res, o.contratoPdf.chave, o.contratoPdf.nome, true);
}

// ---------- Contrato: leitura pela IA ----------
// Campos extraídos: chave na ficha, rótulo e tipo. Só o que estiver escrito no contrato; ausente = null.
export const CAMPOS = [
  ["razao", "Razão social / nome do cliente", "texto"], ["nomeFantasia", "Nome fantasia", "texto"], ["cnpj", "CNPJ ou CPF", "doc"],
  ["endereco", "Endereço", "texto"], ["cidade", "Cidade", "texto"], ["uf", "UF", "uf"],
  ["responsavel", "Responsável do cliente", "texto"], ["email", "E-mail do cliente", "email"], ["telefone", "Telefone do cliente", "texto"],
  ["servicos", "Serviço contratado", "texto"], ["postsSemana", "Posts por semana", "int"], ["conteudosMes", "Conteúdos por mês", "int"],
  ["gravacoes", "Gravações por mês", "int"], ["trafego", "Gestão de tráfego", "simnao"], ["trafegoObs", "Observação do tráfego", "texto"],
  ["identidade", "Identidade visual", "simnao"], ["valorMensal", "Valor mensal (R$)", "valor"], ["inicio", "Data de início", "data"],
  ["assinatura", "Data da assinatura", "data"], ["vigencia", "Prazo (meses)", "int"], ["renovacaoAutomatica", "Renovação automática", "simnao"],
  ["dataFinal", "Data final", "data"], ["indiceReajuste", "Índice de reajuste", "texto"], ["dataReajuste", "Data de reajuste", "data"],
  ["formaPagamento", "Forma de pagamento", "texto"], ["diaPagamento", "Dia de pagamento", "int"], ["instagram", "Instagram", "texto"],
  ["outrasRedes", "Outras redes sociais", "texto"], ["outrosContrato", "Outras informações úteis do contrato", "texto"],
];
const SISTEMA_CONTRATO = `Você lê contratos de prestação de serviços de uma agência de comunicação (Quinze) com seus clientes e extrai dados para a ficha do cliente.
Regras: extraia SOMENTE o que está escrito no contrato. Nunca invente nem deduza valores. Campo ausente = null.
Se um dado estiver ilegível, ambíguo ou só puder ser inferido, devolva com "confianca":"baixa". O CLIENTE é a parte CONTRATANTE (não a Quinze).
Datas no formato AAAA-MM-DD. Valores em número (ex.: 1500.5). "sim"/"nao" para perguntas de sim ou não. Prazo em meses (número).
Responda só com JSON: {"campos":{"<chave>":{"valor":...,"confianca":"alta|baixa"} | null, ...}} com estas chaves:
${CAMPOS.map(([k, r]) => `${k} (${r})`).join("; ")}.`;
function validar(tipo, v) {
  if (v == null || v === "") return null;
  if (tipo === "texto") return txt(v, 600) || null;
  if (tipo === "doc") { const d = String(v).replace(/\D/g, ""); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : undefined; }
  if (tipo === "uf") { const x = String(v).trim().toUpperCase(); return /^[A-Z]{2}$/.test(x) ? x : undefined; }
  if (tipo === "email") { const x = String(v).trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) ? x : undefined; }
  if (tipo === "int") { const n = parseInt(String(v).replace(/\D/g, ""), 10); return Number.isFinite(n) && n >= 0 && n < 10000 ? n : undefined; }
  if (tipo === "valor") { const n = typeof v === "number" ? v : num(String(v).replace(/[R$\s.]/g, "").replace(",", ".")); return n != null && n >= 0 ? Math.round(n * 100) / 100 : undefined; }
  if (tipo === "data") return dataIso(String(v).slice(0, 10)) || undefined;
  if (tipo === "simnao") { const x = String(v).toLowerCase(); return /^(sim|s|true|yes)$/.test(x) ? "sim" : /^(n[aã]o|n|false|no)$/.test(x) ? "nao" : undefined; }
  return undefined;
}
const idDrive = link => ((/\/(?:file|document)\/d\/([A-Za-z0-9_-]{10,})/.exec(link || "")) || (/[?&]id=([A-Za-z0-9_-]{10,})/.exec(link || "")) || [])[1] || "";

async function contratoLer(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaOnboarding(u)) return negado(res);
  const b = corpo(req), o = await lerOnb(b.id);
  if (!o) return res.status(404).json({ code: "nao_encontrado" });
  let buf = null, fonte = "", nome = "";
  if (b.fonte !== "drive" && o.contratoPdf?.chave) {
    const info = await infoArquivo(o.contratoPdf.chave);
    if (!info) return res.status(404).json({ code: "sem_arquivo", msg: "O PDF enviado não foi encontrado. Envie de novo." });
    if (info.tamanho > MAX_LEITURA) return res.status(413).json({ code: "grande", msg: `O PDF tem ${Math.round(info.tamanho / 1048576)} MB: grande demais para a leitura automática (até 22 MB). Preencha os campos à mão; o arquivo continua guardado.` });
    buf = await lerArquivo(o.contratoPdf.chave); fonte = "arquivo"; nome = o.contratoPdf.nome;
  } else if (o.links?.contrato) {
    const id = idDrive(o.links.contrato);
    if (!id || !googleConfigurado()) return res.status(400).json({ code: "sem_pdf", msg: "Envie o PDF do contrato (o link do Drive só é lido quando o arquivo está compartilhado com a conta de serviço da Central)." });
    let a = null; try { a = await lerArquivoDrive(id, MAX_LEITURA); } catch { a = null; }
    if (!a || !a.buf) return res.status(400).json({ code: "drive", msg: "Não consegui abrir o contrato pelo link do Drive (compartilhe com a conta de serviço ou envie o PDF)." });
    buf = a.buf; fonte = "drive"; nome = a.nome;
  } else return res.status(400).json({ code: "sem_pdf", msg: "Envie o PDF do contrato assinado primeiro." });
  if (!buf || buf.subarray(0, 5).toString() !== "%PDF-") return res.status(400).json({ code: "pdf", msg: "O arquivo não é um PDF válido." });
  let j;
  try {
    j = await perguntarJSON(SISTEMA_CONTRATO, [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
      { type: "text", text: "Extraia os campos deste contrato." }], 3000);
  } catch (e) {
    if (e instanceof ErroIA) return res.status(502).json({ code: e.code, msg: (MSG_IA[e.code] || "Não deu para ler o contrato agora.") + " Preencha os campos à mão; nada foi perdido." });
    throw e;
  }
  const brutos = j?.campos && typeof j.campos === "object" ? j.campos : {};
  const campos = {};
  for (const [k, rot, tipo] of CAMPOS) {
    const c = brutos[k];
    if (!c || c.valor == null || c.valor === "") { campos[k] = null; continue; }
    const v = validar(tipo, c.valor);
    if (v === null) { campos[k] = null; continue; }
    // Valor fora do formato esperado: vai como texto original, marcado para conferir.
    campos[k] = v === undefined ? { valor: txt(c.valor, 300), confianca: "baixa", formato: false } : { valor: v, confianca: c.confianca === "baixa" ? "baixa" : "alta" };
  }
  const lidos = Object.values(campos).filter(Boolean).length;
  return res.json({ fonte, arquivo: nome, campos, rotulos: Object.fromEntries(CAMPOS.map(([k, r, t]) => [k, { rotulo: r, tipo: t }])), lidos });
}
// Aplica os campos aceitos na ficha (com a marca de origem "contrato"), registra a leitura e envia ao Gerenciamento de contratos.
async function contratoAplicar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaOnboarding(u)) return negado(res);
  const b = corpo(req), o = await lerOnb(b.id);
  if (!o) return res.status(404).json({ code: "nao_encontrado" });
  const valores = b.valores && typeof b.valores === "object" ? b.valores : {};
  const ficha = {}, origem = {}, invalidos = [];
  for (const [k, , tipo] of CAMPOS) {
    if (!(k in valores)) continue;
    const v = validar(tipo, valores[k]);
    if (v === undefined) { invalidos.push(k); continue; }
    ficha[k] = v === null ? "" : v; origem[k] = "contrato";
  }
  if (invalidos.length) return res.status(400).json({ code: "campos", msg: "Confira o formato de: " + invalidos.join(", "), invalidos });
  const em = agora();
  const patch = { ficha, fichaOrigem: origem,
    contratoLeitura: { em, por: quem(u), arquivo: txt(b.arquivo, 160) || o.contratoPdf?.nome || "", fonte: b.fonte === "drive" ? "drive" : "arquivo", campos: Object.keys(ficha) } };
  if (!o.etapas?.contrato?.ok) patch.etapas = { contrato: { ok: true, em } };
  await mesclarOnb(o.id, patch);
  const novo = await lerOnb(o.id);
  const g = await enviarGerenciamento(novo, u);
  return res.json({ ok: true, aplicados: Object.keys(ficha).length, gerenciamento: g });
}

// ---------- Repasse -> Carteira ----------
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
function resumoNome(r) {
  const s = (r || "").toUpperCase().replace(/\b(LTDA|EIRELI|EPP|MEI|ME|S\/A|S\.A)\b\.?/g, "").replace(/[\s,.–-]+$/, "").replace(/\s+/g, " ").trim();
  const w = s.split(" ").filter(Boolean);
  return w.length > 2 ? w.slice(0, 2).join(" ") : s;
}
const titleCity = s => String(s || "").toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, x => x.toLowerCase());
const slug = s => (String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cliente") + "-" + crypto.randomBytes(2).toString("hex");
const vazio = v => v === undefined || v === null || v === "";

async function repasseAplicar(u, req, res) {
  if (!so(req, res, "POST")) return;
  if (!usaOnboarding(u)) return negado(res);
  const o = await lerOnb(corpo(req).id);
  if (!o) return res.status(404).json({ code: "nao_encontrado" });
  const r = o.repasse || {};
  const original = o.repasseOrigem?.de ?? o.atendimento ?? "";
  let novo;
  if (r.vai === "sim" && r.para) novo = r.para;
  else if (o.repasseOrigem) novo = original;            // repasse desfeito: volta ao atendimento de antes
  else return res.json({ ok: true, semMudanca: true, msg: "Sem repasse: a Carteira não muda." });
  // Meses da Carteira: o corrente e os seguintes que já existirem (se não houver o corrente, o mais recente).
  const meses = (await sql`SELECT id FROM docs WHERE parent = 'meses' AND NOT deleted`).map(x => x.id).filter(m => /^\d{4}-\d{2}$/.test(m)).sort();
  const mesAtual = hojeLocal().slice(0, 7);
  let alvo = meses.filter(m => m >= mesAtual);
  if (!alvo.length && meses.length) alvo = [meses[meses.length - 1]];
  if (!alvo.length) return res.status(409).json({ code: "sem_carteira", msg: "Ainda não existe carteira mensal. Crie a carteira do mês e tente de novo." });
  const f = o.ficha || {}, c0 = o.carteira || {};
  const nomeCart = norm(c0.nome || resumoNome(f.razao) || o.nome);
  const docsMes = await sql`SELECT path, parent, id, data FROM docs WHERE parent = ANY(${alvo.map(m => `meses/${m}/clientes`)}) AND NOT deleted`;
  let cid = c0.inserido?.id || "";
  if (!cid) { const ach = docsMes.find(d => norm(d.data.nome) === nomeCart); cid = ach ? ach.id : ""; }
  const cfg = (await sql`SELECT data FROM docs WHERE path = 'config/geral'`)[0]?.data || {};
  const tipos = cfg.tipos || [];
  const cidade = titleCity(f.cidade || "");
  const padrao = { nome: nomeCart, nivel: c0.nivel || "C", tipo: c0.tipo || tipos.find(t => /FEE/i.test(t)) || tipos[0] || "", social: c0.social && c0.social !== "__novo" ? c0.social : "",
    conteudos: Number(c0.conteudos) || (Number(f.postsSemana) > 0 ? Number(f.postsSemana) * 4 : 0), motions: Number(c0.motions) || 0,
    gravacao: Number(c0.gravacao) || Number(f.gravacoes) || 0, cidade, uf: cidade ? (f.uf || "") : "", materialOff: o.materialOff === "sim",
    obs: c0.obs || (f.vigencia ? `Vigência: ${f.vigencia} meses` : "") };
  const em = agora(), entrada = { em, por: quem(u), de: o.atendimento || "", para: novo, origem: "onboarding" };
  const linhas = [], mudou = new Set();
  const existentes = Object.fromEntries(docsMes.filter(d => d.id === cid).map(d => [d.parent.split("/")[1], d]));
  const criar = !cid || !Object.keys(existentes).length;
  if (!cid) cid = slug(nomeCart);
  for (const m of alvo) {
    const d = existentes[m];
    if (d) {
      const patch = {};
      if (d.data.atendimento !== novo) { patch.atendimento = novo; mudou.add("atendimento"); }
      for (const [k, v] of Object.entries(padrao)) if (k !== "nome" && vazio(d.data[k]) && !vazio(v) && v !== 0) { patch[k] = v; mudou.add(k); }
      if (!Object.keys(patch).length) continue;
      patch.historicoResponsavel = [...(d.data.historicoResponsavel || []), entrada]; patch.atualizadoEm = em;
      linhas.push({ path: d.path, parent: d.parent, id: d.id, data: patch });
    } else if (criar) {
      linhas.push({ path: `meses/${m}/clientes/${cid}`, parent: `meses/${m}/clientes`, id: cid,
        data: { ...padrao, atendimento: novo, status: "ativo", atualizadoEm: em, historicoResponsavel: [entrada], criadoPorRepasse: true } });
      mudou.add("cliente criado");
    }
  }
  const mudouOnb = o.atendimento !== novo;
  if (!linhas.length && !mudouOnb) return res.json({ ok: true, semMudanca: true, atendimento: novo, msg: `A Carteira já está com ${novo}.` });
  const aplicado = { para: novo, em, por: quem(u), meses: alvo, clienteId: cid, mudou: [...mudou], criado: criar };
  const patchOnb = { atendimento: novo, repasseAplicado: aplicado, repasseHistorico: [...(o.repasseHistorico || []), entrada] };
  if (!o.repasseOrigem) patchOnb.repasseOrigem = { de: o.atendimento || "", em };
  if (criar) patchOnb.carteira = { inserido: { mes: alvo[0], id: cid, em, porRepasse: true } };
  linhas.push({ path: `onboarding/${o.id}`, parent: "onboarding", id: o.id, data: patchOnb });
  if (novo && !(cfg.atendimentos || []).includes(novo)) linhas.push({ path: "config/geral", parent: "config", id: "geral", data: { atendimentos: [...(cfg.atendimentos || []), novo] } });
  // Uma única instrução: Carteira e onboarding mudam juntos ou nada muda (sem divergência).
  await sql`INSERT INTO docs (path, parent, id, data)
            SELECT x.path, x.parent, x.id, x.data FROM jsonb_to_recordset(${JSON.stringify(linhas)}::jsonb) AS x(path text, parent text, id text, data jsonb)
            ON CONFLICT (path) DO UPDATE SET data = jsonb_deep_merge(CASE WHEN docs.deleted THEN '{}'::jsonb ELSE docs.data END, EXCLUDED.data),
              deleted = false, updated_at = now(), seq = nextval('docs_seq')`;
  await auditar(u, "atendimento", "repasse.carteira", o.id, { de: entrada.de, para: novo, meses: alvo.length, criado: criar });
  return res.json({ ok: true, atendimento: novo, aplicado, msg: `Carteira atualizada: atendimento agora é ${novo}.` });
}

export const rotas = {
  "contrato.token": contratoToken, "contrato.confirmar": contratoConfirmar, "contrato.arquivo": contratoArquivo,
  "contrato.ler": contratoLer, "contrato.aplicar": contratoAplicar, "repasse.aplicar": repasseAplicar,
};
