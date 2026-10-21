// IA (OpenAI como provedor principal, com fallback para Anthropic), chamada só pelo servidor.
// As chaves ficam nas variáveis de ambiente da Vercel (OPENAI_API_KEY ou ANTHROPIC_API_KEY): nunca vão para a página nem para o log.
// OPENAI_MODEL (opcional) troca o modelo da OpenAI (padrão: gpt-4o-mini).
// ANTHROPIC_MODEL (opcional) troca o modelo da Anthropic (padrão: claude-3-5-sonnet-latest).
import { extractText } from "unpdf";

const URL_OPENAI = "https://api.openai.com/v1/chat/completions";
const MODELO_PADRAO_OPENAI = "gpt-4o-mini";

const URL_ANTHROPIC = "https://api.anthropic.com/v1/messages";
const MODELO_PADRAO_ANTHROPIC = "claude-3-5-sonnet-latest";

const modeloOpenAI = () => process.env.OPENAI_MODEL || MODELO_PADRAO_OPENAI;

const modeloAnthropic = () => {
  const m = process.env.ANTHROPIC_MODEL;
  if (!m || m === "claude-sonnet-5-5") return MODELO_PADRAO_ANTHROPIC;
  return m;
};

export const iaDisponivel = () => !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

export class ErroIA extends Error {
  constructor(code, status, detalhe) {
    super(code);
    this.code = code;
    this.status = status || 502;
    this.detalhe = detalhe || null;
  }
}

const ULTIMO = {};

// Converte blocos de documento PDF em texto estruturado para a OpenAI
async function converterBlocoPDF(source) {
  const buf = Buffer.from(source.data || "", "base64");
  try {
    const { text } = await extractText(new Uint8Array(buf));
    const texto = Array.isArray(text) ? text.join("\n\n") : String(text || "");
    return {
      type: "text",
      text: `--- CONTEÚDO EXTRAÍDO DO ARQUIVO PDF ---\n\n${texto.trim() || "(PDF sem texto selecionável/legível)"}\n\n--- FIM DO CONTEÚDO DO PDF ---`
    };
  } catch (err) {
    console.error("[ia] erro ao extrair texto de PDF:", err);
    return { type: "text", text: "(Não foi possível extrair o texto deste PDF)." };
  }
}

// Prepara o conteúdo do pedido para o formato esperado pela OpenAI
async function prepararConteudoOpenAI(pedido) {
  if (typeof pedido === "string") return pedido;
  if (!Array.isArray(pedido)) return String(pedido || "");

  const partes = [];
  for (const item of pedido) {
    if (!item) continue;
    if (typeof item === "string") {
      partes.push({ type: "text", text: item });
    } else if (item.type === "text") {
      partes.push({ type: "text", text: String(item.text || "") });
    } else if (item.type === "image" && item.source?.data) {
      const mime = item.source.media_type || "image/jpeg";
      partes.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${item.source.data}` }
      });
    } else if (item.type === "document" && item.source?.data) {
      const blocoTexto = await converterBlocoPDF(item.source);
      partes.push(blocoTexto);
    }
  }

  if (partes.length === 1 && partes[0].type === "text") {
    return partes[0].text;
  }
  return partes;
}

// Execução via OpenAI
async function perguntarOpenAI(chave, sistema, pedido, maxTokens, signal) {
  let r;
  try {
    const conteudoUsuario = await prepararConteudoOpenAI(pedido);
    const messages = [];
    if (sistema) messages.push({ role: "system", content: sistema });
    messages.push({ role: "user", content: conteudoUsuario });

    r = await fetch(URL_OPENAI, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${chave}`
      },
      body: JSON.stringify({
        model: modeloOpenAI(),
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages
      })
    });
  } catch (e) {
    throw new ErroIA("ia_indisponivel_0", 502, { rede: e && e.name === "AbortError" ? "tempo_esgotado" : "falha_de_rede" });
  }

  if (!r.ok) {
    let tipo = "", texto = "";
    try {
      const e = (await r.json())?.error || {};
      tipo = String(e.type || "").slice(0, 60);
      texto = String(e.message || "").slice(0, 160);
    } catch { /* sem corpo */ }
    console.error("[ia] resposta HTTP OpenAI", r.status, tipo, texto);
    ULTIMO[r.status] = texto;
    const code = r.status === 401 || r.status === 403 ? "ia_chave_invalida" : r.status === 404 ? "ia_modelo" : r.status === 429 ? "ia_limite" : "ia_indisponivel";
    throw new ErroIA(code + "_" + r.status, 502, { http: r.status, tipo, texto });
  }

  const j = await r.json();
  const texto = j.choices?.[0]?.message?.content || "";
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a < 0 || b <= a) throw new ErroIA("ia_formato");
  try {
    return JSON.parse(texto.slice(a, b + 1));
  } catch {
    throw new ErroIA("ia_formato");
  }
}

// Execução via Anthropic (fallback)
async function perguntarAnthropic(chave, sistema, pedido, maxTokens, signal) {
  let r;
  try {
    r = await fetch(URL_ANTHROPIC, {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {})
      },
      body: JSON.stringify({
        model: modeloAnthropic(),
        max_tokens: maxTokens,
        system: sistema,
        messages: [{ role: "user", content: pedido }]
      })
    });
  } catch (e) {
    throw new ErroIA("ia_indisponivel_0", 502, { rede: e && e.name === "AbortError" ? "tempo_esgotado" : "falha_de_rede" });
  }

  if (!r.ok) {
    let tipo = "", texto = "";
    try {
      const e = (await r.json())?.error || {};
      tipo = String(e.type || "").slice(0, 60);
      texto = String(e.message || "").slice(0, 160);
    } catch { /* sem corpo */ }
    console.error("[ia] resposta HTTP Anthropic", r.status, tipo, texto);
    ULTIMO[r.status] = texto;
    const code = r.status === 401 || r.status === 403 ? "ia_chave_invalida" : r.status === 404 ? "ia_modelo" : r.status === 429 ? "ia_limite" : "ia_indisponivel";
    throw new ErroIA(code + "_" + r.status, 502, { http: r.status, tipo, texto });
  }

  const j = await r.json();
  const texto = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}");
  if (a < 0 || b <= a) throw new ErroIA("ia_formato");
  try {
    return JSON.parse(texto.slice(a, b + 1));
  } catch {
    throw new ErroIA("ia_formato");
  }
}

// Pede uma resposta em JSON e devolve o objeto já lido.
export async function perguntarJSON(sistema, pedido, maxTokens = 2000) {
  const chaveOpenAI = process.env.OPENAI_API_KEY;
  const chaveAnthropic = process.env.ANTHROPIC_API_KEY;

  if (!chaveOpenAI && !chaveAnthropic) {
    throw new ErroIA("ia_sem_chave", 503);
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 55000);

  try {
    if (chaveOpenAI) {
      return await perguntarOpenAI(chaveOpenAI, sistema, pedido, maxTokens, ctrl.signal);
    }
    return await perguntarAnthropic(chaveAnthropic, sistema, pedido, maxTokens, ctrl.signal);
  } finally {
    clearTimeout(t);
  }
}

// Mensagens para a tela. Aceita o código com o status no fim (ia_chave_invalida_401 -> ia_chave_invalida).
const MENSAGENS = {
  ia_sem_chave: "A IA ainda não está configurada: falta preencher a chave OPENAI_API_KEY na Vercel.",
  ia_chave_invalida: "A chave da IA (OPENAI_API_KEY) não foi aceita. Confira o valor na Vercel.",
  ia_modelo: "O modelo de IA configurado não foi encontrado (OPENAI_MODEL).",
  ia_limite: "A IA está com limite de uso no momento. Tente de novo em alguns minutos.",
  ia_formato: "A IA respondeu num formato inesperado. Tente gerar de novo.",
  ia_indisponivel: "Não deu para falar com a IA agora. Tente de novo.",
};

export const MSG_IA = new Proxy(MENSAGENS, {
  get: (m, k) => {
    if (m[k]) return m[k];
    const st = (/_(\d+)$/.exec(String(k)) || [])[1];
    const base = m[String(k).replace(/_\d+$/, "")];
    return base && st && ULTIMO[st] ? `${base} (HTTP ${st}: ${ULTIMO[st]})` : base;
  }
});
