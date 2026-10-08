// Integração com o Google (instrução 06): Drive (documentos assinados) e Forms (pesquisas NPS).
// Autenticação por conta de serviço: o JSON da chave fica só na variável GOOGLE_SERVICE_ACCOUNT_JSON da Vercel
// (sensível). Nada da chave vai para log, resposta ou página; os erros levam só status HTTP e mensagem curta do Google.
import crypto from "node:crypto";

const ESCOPOS = ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/forms.body", "https://www.googleapis.com/auth/forms.responses.readonly"].join(" ");
let token = null;

function credencial() {
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!bruto) return null;
  try { const j = JSON.parse(bruto); return j.client_email && j.private_key ? { email: j.client_email, chave: j.private_key } : null; } catch { return null; }
}
export const googleConfigurado = () => !!credencial();
export const emailContaServico = () => credencial()?.email || "";
export const pastaAssinados = () => process.env.DRIVE_PASTA_ASSINADOS_ID || "";
export const donoForms = () => process.env.GOOGLE_FORMS_DONO_EMAIL || "";

export class ErroGoogle extends Error {
  constructor(msg, status) { super(msg); this.status = status || 0; }
}
const b64url = b => Buffer.from(b).toString("base64url");

async function obterToken() {
  if (token && token.exp > Date.now() + 60000) return token.valor;
  const c = credencial();
  if (!c) throw new ErroGoogle("Integração com o Google não configurada (GOOGLE_SERVICE_ACCOUNT_JSON).");
  const agora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(JSON.stringify({ iss: c.email, scope: ESCOPOS, aud: "https://oauth2.googleapis.com/token", iat: agora, exp: agora + 3600 }));
  let assinatura;
  try { assinatura = crypto.createSign("RSA-SHA256").update(`${cab}.${corpo}`).sign(c.chave, "base64url"); }
  catch { throw new ErroGoogle("A chave da conta de serviço é inválida (confira o JSON colado na Vercel)."); }
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${cab}.${corpo}.${assinatura}` }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new ErroGoogle(`Google recusou a conta de serviço (${j.error || r.status}).`, r.status);
  token = { valor: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return token.valor;
}

// Chamada à API do Google com novas tentativas em limite de uso (429) e erros temporários (5xx).
async function google(url, opt = {}, tentativas = 3) {
  for (let i = 0; ; i++) {
    const t = await obterToken();
    const r = await fetch(url, { ...opt, headers: { authorization: `Bearer ${t}`, ...(opt.headers || {}) } });
    if (r.ok) return r.status === 204 ? {} : r.json();
    const j = await r.json().catch(() => ({}));
    if ((r.status === 429 || r.status >= 500) && i < tentativas - 1) { await new Promise(ok => setTimeout(ok, 800 * 2 ** i)); continue; }
    const msg = String(j?.error?.message || j?.error || `HTTP ${r.status}`).slice(0, 200);
    console.error("[google] HTTP", r.status, url.split("?")[0].replace(/[A-Za-z0-9_-]{20,}/g, "…"));
    throw new ErroGoogle(msg, r.status);
  }
}
const DRIVE = "https://www.googleapis.com/drive/v3", UPLOAD = "https://www.googleapis.com/upload/drive/v3", FORMS = "https://forms.googleapis.com/v1";
const aspas = s => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// ---------- Drive ----------
// Envia o arquivo à pasta de assinados. Em colisão de nome, acrescenta _2, _3...
export async function enviarArquivoDrive(nome, buf, tipo) {
  const pasta = pastaAssinados();
  if (!pasta) throw new ErroGoogle("Pasta de assinados não configurada (DRIVE_PASTA_ASSINADOS_ID).");
  const ext = (nome.match(/(\.[^.]+)$/) || [""])[0], base = ext ? nome.slice(0, -ext.length) : nome;
  const existe = async n => (await google(`${DRIVE}/files?` + new URLSearchParams({ q: `name = '${aspas(n)}' and '${aspas(pasta)}' in parents and trashed = false`,
    fields: "files(id)", supportsAllDrives: "true", includeItemsFromAllDrives: "true", pageSize: "1" }))).files?.length > 0;
  let final = nome;
  for (let k = 2; k < 100 && (await existe(final)); k++) final = `${base}_${k}${ext}`;
  const limite = "qz" + crypto.randomBytes(8).toString("hex");
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: final, parents: [pasta] })}\r\n--${limite}\r\ncontent-type: ${tipo || "application/octet-stream"}\r\n\r\n`),
    buf, Buffer.from(`\r\n--${limite}--`)]);
  const f = await google(`${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`, {
    method: "POST", headers: { "content-type": `multipart/related; boundary=${limite}` }, body: corpo }, 2);
  return { id: f.id, nome: f.name, link: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view` };
}

// ---------- Forms ----------
// Cria o formulário com as perguntas aprovadas. NPS = escala 0 a 10 obrigatória.
export async function criarFormulario({ titulo, descricao, perguntas }) {
  const form = await google(`${FORMS}/forms`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ info: { title: titulo, documentTitle: titulo } }) });
  const requests = [{ updateFormInfo: { info: { description: descricao }, updateMask: "description" } }];
  perguntas.forEach((p, i) => {
    let question;
    if (p.tipo === "nps") question = { required: true, scaleQuestion: { low: 0, high: 10, lowLabel: "Nada provável", highLabel: "Extremamente provável" } };
    else if (p.tipo === "multipla") question = { required: false, choiceQuestion: { type: "RADIO", options: (p.opcoes || []).map(value => ({ value })) } };
    else question = { required: false, textQuestion: { paragraph: true } };
    requests.push({ createItem: { item: { title: p.texto, questionItem: { question } }, location: { index: i } } });
  });
  const upd = await google(`${FORMS}/forms/${form.formId}:batchUpdate`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests, includeFormInResponse: false }) });
  const questoes = perguntas.map((p, i) => ({ questionId: upd.replies?.[i + 1]?.createItem?.questionId?.[0] || "", tipo: p.tipo, texto: p.texto }));
  // Publica e aceita respostas (formulários criados pela API podem nascer não publicados).
  try {
    await google(`${FORMS}/forms/${form.formId}:setPublishSettings`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } }, updateMask: "publishState" }) }, 2);
  } catch (e) { if (e.status !== 404 && e.status !== 400) throw e; }
  // Acesso de Editor ao dono (Eduardo) e resposta aberta a qualquer pessoa com o link.
  let avisoDono = "";
  if (donoForms()) {
    try {
      await google(`${DRIVE}/files/${form.formId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "writer", type: "user", emailAddress: donoForms() }) }, 2);
    } catch (e) { avisoDono = `Não deu para dar acesso de editor a ${donoForms()}: ${e.message}`; }
  }
  return { formId: form.formId, linkResposta: form.responderUri || `https://docs.google.com/forms/d/${form.formId}/viewform`,
    linkEdicao: `https://docs.google.com/forms/d/${form.formId}/edit`, questoes, avisoDono };
}

// Lê as respostas de um formulário (todas as páginas).
export async function lerRespostas(formId) {
  const out = [];
  let pagina = "";
  for (let i = 0; i < 50; i++) {
    const j = await google(`${FORMS}/forms/${formId}/responses?` + new URLSearchParams({ pageSize: "500", ...(pagina ? { pageToken: pagina } : {}) }));
    out.push(...(j.responses || []));
    if (!j.nextPageToken) break;
    pagina = j.nextPageToken;
  }
  return out;
}

// ---------- Leitura de arquivo do Drive (pendências de clientes, leitura de contrato) ----------
// Só funciona para arquivos compartilhados com a conta de serviço. Devolve { nome, tipo, texto?, buf? } ou null.
const EXPORTA = { "application/vnd.google-apps.document": "text/plain", "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain" };
export async function lerArquivoDrive(id, maxBytes = 4 * 1024 * 1024) {
  if (!googleConfigurado() || !/^[A-Za-z0-9_-]{10,200}$/.test(String(id))) return null;
  let meta;
  try { meta = await google(`${DRIVE}/files/${id}?fields=id,name,mimeType,size&supportsAllDrives=true`, {}, 1); }
  catch (e) { if (e.status === 404 || e.status === 403) return null; throw e; }
  const t = await obterToken();
  const exp = EXPORTA[meta.mimeType];
  const url = exp ? `${DRIVE}/files/${id}/export?mimeType=${encodeURIComponent(exp)}` : `${DRIVE}/files/${id}?alt=media&supportsAllDrives=true`;
  if (!exp && Number(meta.size || 0) > maxBytes) return { nome: meta.name, tipo: meta.mimeType };
  const r = await fetch(url, { headers: { authorization: `Bearer ${t}` } });
  if (!r.ok) return { nome: meta.name, tipo: meta.mimeType };
  const buf = Buffer.from(await r.arrayBuffer());
  if (exp) return { nome: meta.name, tipo: meta.mimeType, texto: buf.toString("utf8").slice(0, 20000) };
  return { nome: meta.name, tipo: meta.mimeType, buf: buf.length <= maxBytes ? buf : null };
}
