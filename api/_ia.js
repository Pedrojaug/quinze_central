// IA (API da Anthropic), chamada só pelo servidor.
// A chave fica na variável de ambiente ANTHROPIC_API_KEY da Vercel: nunca vai para a página nem para o log.
// ANTHROPIC_MODEL (opcional) troca o modelo.
// ANTHROPIC_WORKSPACE_ID (opcional): obrigatório quando a chave não é de um workspace específico (chave de usuário).
const URL_API = "https://api.anthropic.com/v1/messages";
const MODELO_PADRAO = "claude-sonnet-5-5";

export const iaDisponivel = () => !!process.env.ANTHROPIC_API_KEY;

export class ErroIA extends Error {
  constructor(code, status, detalhe) { super(code); this.code = code; this.status = status || 502; this.detalhe = detalhe || null; }
}

// Pede uma resposta em JSON e devolve o objeto já lido.
export async function perguntarJSON(sistema, pedido, maxTokens = 2000) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new ErroIA("ia_sem_chave", 503);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 55000);
  let r;
  try {
    r = await fetch(URL_API, {
      method: "POST", signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": chave, "anthropic-version": "2023-06-01",
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {}) },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || MODELO_PADRAO, max_tokens: maxTokens, system: sistema,
        messages: [{ role: "user", content: pedido }] }),
    });
  } catch (e) {
    throw new ErroIA("ia_indisponivel_0", 502, { rede: e && e.name === "AbortError" ? "tempo_esgotado" : "falha_de_rede" });
  } finally { clearTimeout(t); }
  if (!r.ok) {
    // Só o código HTTP e o tipo de erro da Anthropic vão para o log e para a resposta (nada da requisição, que leva a chave).
    let tipo = "", texto = "";
    try { const e = (await r.json())?.error || {}; tipo = String(e.type || "").slice(0, 60); texto = String(e.message || "").slice(0, 160); } catch { /* sem corpo */ }
    console.error("[ia] resposta HTTP", r.status, tipo);
    ULTIMO[r.status] = texto;
    const code = r.status === 401 || r.status === 403 ? "ia_chave_invalida" : r.status === 404 ? "ia_modelo" : r.status === 429 ? "ia_limite" : "ia_indisponivel";
    // O código devolvido leva o status HTTP (ex.: ia_chave_invalida_403), para diagnóstico sem expor nada sensível.
    throw new ErroIA(code + "_" + r.status, 502, { http: r.status, tipo });
  }
  const j = await r.json();
  const texto = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a < 0 || b <= a) throw new ErroIA("ia_formato");
  try { return JSON.parse(texto.slice(a, b + 1)); } catch { throw new ErroIA("ia_formato"); }
}

// Mensagens para a tela. Aceita o código com o status no fim (ia_chave_invalida_403 -> ia_chave_invalida).
const ULTIMO = {};   // última mensagem de erro da Anthropic por status HTTP (nunca contém a chave)
const MENSAGENS = {
  ia_sem_chave: "A IA ainda não está ligada: falta preencher a chave ANTHROPIC_API_KEY na Vercel.",
  ia_chave_invalida: "A chave da IA (ANTHROPIC_API_KEY) não foi aceita. Confira o valor na Vercel.",
  ia_modelo: "O modelo de IA configurado não foi encontrado (ANTHROPIC_MODEL).",
  ia_limite: "A IA está com limite de uso no momento. Tente de novo em alguns minutos.",
  ia_formato: "A IA respondeu num formato inesperado. Tente gerar de novo.",
  ia_indisponivel: "Não deu para falar com a IA agora. Tente de novo.",
};
export const MSG_IA = new Proxy(MENSAGENS, { get: (m, k) => {
  if (m[k]) return m[k];
  const st = (/_(\d+)$/.exec(String(k)) || [])[1];
  const base = m[String(k).replace(/_\d+$/, "")];
  return base && st && ULTIMO[st] ? `${base} (Anthropic, HTTP ${st}: ${ULTIMO[st]})` : base;
} });
