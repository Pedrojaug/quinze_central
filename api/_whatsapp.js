// Envio de WhatsApp (instrução 07). O provedor fica isolado aqui: para trocar de provedor, mude só este arquivo.
// Provedor atual: UAZAPI (POST <WHATSAPP_API_URL>/send/text, cabeçalho "token", corpo { number, text }).
// WHATSAPP_API_URL e WHATSAPP_TOKEN ficam só nas variáveis da Vercel (o token nunca vai para log, resposta ou página).
// WHATSAPP_DESTINO: números padrão do relatório (separados por vírgula). WHATSAPP_TESTE: número do botão de teste.

export const whatsappConfigurado = () => !!(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_TOKEN);
export const LIMITE_MENSAGEM = 4000;   // caracteres por mensagem (abaixo do limite do WhatsApp, para leitura confortável)

// Normaliza uma lista de números: só dígitos, 10 a 15 dígitos, sem repetir. Aceita id de grupo (...@g.us).
export function numeros(texto) {
  const out = [];
  for (const parte of String(texto || "").split(/[,;\n]+/)) {
    const p = parte.trim();
    if (!p) continue;
    if (/^\d{10,30}@g\.us$/.test(p)) { if (!out.includes(p)) out.push(p); continue; }
    const d = p.replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 15 && !out.includes(d)) out.push(d);
  }
  return out;
}
// Mostra o número sem expor todos os dígitos (para histórico e tela).
export const mascarar = n => (String(n).endsWith("@g.us") ? "grupo …" + String(n).slice(-9, -5) : "…" + String(n).slice(-4));

const espera = ms => new Promise(ok => setTimeout(ok, ms));

// Envia um texto para um número. Até 3 tentativas com intervalo crescente. Devolve { ok, tentativas, erro }.
export async function enviarTexto(destino, texto, { tentativas = 3, intervaloMs = 2000 } = {}) {
  if (!whatsappConfigurado()) return { ok: false, tentativas: 0, erro: "WhatsApp não configurado (WHATSAPP_API_URL e WHATSAPP_TOKEN na Vercel)." };
  const base = String(process.env.WHATSAPP_API_URL).replace(/\/+$/, "");
  let erro = "";
  for (let i = 1; i <= tentativas; i++) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
      const r = await fetch(`${base}/send/text`, { method: "POST", signal: ctrl.signal,
        headers: { "content-type": "application/json", token: process.env.WHATSAPP_TOKEN },
        body: JSON.stringify({ number: destino, text: texto }) }).finally(() => clearTimeout(t));
      if (r.ok) return { ok: true, tentativas: i, erro: "" };
      let msg = ""; try { const j = await r.json(); msg = String(j?.error || j?.message || "").slice(0, 120); } catch { /* sem corpo */ }
      erro = `HTTP ${r.status}${msg ? ": " + msg : ""}`;
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break;   // erro de dados: não adianta repetir
    } catch (e) { erro = e && e.name === "AbortError" ? "tempo esgotado" : "falha de rede"; }
    if (i < tentativas) await espera(intervaloMs * i);
  }
  console.error("[whatsapp] falha no envio para", mascarar(destino), erro);
  return { ok: false, tentativas, erro };
}

// Divide um texto em partes de até "limite" caracteres sem cortar um bloco ao meio (blocos separados por \n\n
// ou passados já como lista). Cada parte ganha o cabeçalho e a numeração (1/2, 2/2) quando houver mais de uma.
export function dividir(cabecalho, blocos, rodape, limite = LIMITE_MENSAGEM) {
  const reserva = 12;   // espaço para " (1/2)"
  const partes = [];
  let atual = [];
  const tamanho = arr => [cabecalho, ...arr].join("\n\n").length + reserva;
  for (const b of [...blocos, ...(rodape ? [rodape] : [])]) {
    if (atual.length && tamanho([...atual, b]) > limite) { partes.push(atual); atual = []; }
    // Bloco sozinho maior que o limite: corta por linhas (caso extremo).
    if (tamanho([b]) > limite) {
      let pedaco = [];
      for (const linha of b.split("\n")) {
        if (pedaco.length && tamanho([[...pedaco, linha].join("\n")]) > limite) { partes.push([pedaco.join("\n")]); pedaco = []; }
        pedaco.push(linha);
      }
      atual = [pedaco.join("\n")];
      continue;
    }
    atual.push(b);
  }
  if (atual.length) partes.push(atual);
  const n = partes.length;
  return partes.map((p, i) => [n > 1 ? `${cabecalho} (${i + 1}/${n})` : cabecalho, ...p].join("\n\n"));
}
