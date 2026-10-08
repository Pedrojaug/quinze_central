// Leitura de um link enviado ao cliente (instrução 08), feita só pelo servidor.
// - Só https/http públicos: endereços internos (localhost, rede privada) são recusados, inclusive depois de redirecionar.
// - Google Drive/Docs: tenta pela conta de serviço (arquivos compartilhados com ela) e depois o link público.
// - Se não der para ler (link privado, login, página vazia), devolve { ok: false } e NÃO inventa conteúdo.
// Devolve { ok: true, fonte, nome, blocos } onde "blocos" são partes de mensagem para a IA (texto, PDF ou imagem).
import dns from "node:dns/promises";
import net from "node:net";
import { lerArquivoDrive, googleConfigurado } from "./_google.js";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_TEXTO = 8000;

function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:") && ipPrivado(x.slice(7));
}
async function hostSeguro(host) {
  const testes = String(process.env.QZ_HOSTS_TESTE || "").split(",").filter(Boolean);
  if (testes.includes(host)) return true;   // só no servidor de teste local
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (net.isIP(host)) return !ipPrivado(host);
  try { const ips = await dns.lookup(host, { all: true }); return ips.length > 0 && ips.every(x => !ipPrivado(x.address)); }
  catch { return false; }
}

// GET com redirecionamento manual (no máximo 4), conferindo cada endereço. Lê no máximo MAX_BYTES.
async function buscar(url) {
  let atual = url;
  for (let i = 0; i < 5; i++) {
    const u = new URL(atual);
    if (!["https:", "http:"].includes(u.protocol) || !(await hostSeguro(u.hostname))) return { erro: "endereco_bloqueado" };
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
    let r;
    try { r = await fetch(atual, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (CentralQuinze leitor de links)", accept: "text/html,application/pdf,image/*,*/*;q=0.5", "accept-language": "pt-BR,pt;q=0.9" } }); }
    catch { clearTimeout(t); return { erro: "sem_resposta" }; }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { clearTimeout(t); atual = new URL(r.headers.get("location"), atual).toString(); continue; }
    const tipo = String(r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const partes = []; let total = 0;
    try {
      const leitor = r.body.getReader();
      while (true) { const { done, value } = await leitor.read(); if (done) break; total += value.length; if (total > MAX_BYTES) { ctrl.abort(); break; } partes.push(value); }
    } catch { /* cortado */ } finally { clearTimeout(t); }
    return { status: r.status, tipo, urlFinal: atual, buf: Buffer.concat(partes), grande: total > MAX_BYTES };
  }
  return { erro: "redirecionamentos" };
}

const entidades = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
function lerHtml(html) {
  const meta = nome => { const m = new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]*content=["']([^"']*)["']`, "i").exec(html) || new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${nome}["']`, "i").exec(html); return m ? entidades(m[1]).trim() : ""; };
  const titulo = entidades((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || "").trim();
  const texto = entidades(html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return { titulo: meta("og:title") || titulo, descricao: meta("og:description") || meta("description"), texto: texto.slice(0, MAX_TEXTO) };
}
const pareceLogin = (urlFinal, html) => /accounts\.google\.com|ServiceLogin|\/login|signin/i.test(urlFinal)
  || /<title>\s*(Fazer login|Sign in|Login|Entrar)[^<]*<\/title>/i.test(html) || /Você precisa de acesso|You need access|Solicitar acesso|Request access/i.test(html);

function idDrive(u) {
  const m = /\/(?:file|document|spreadsheets|presentation|forms)\/d\/([A-Za-z0-9_-]{10,})/.exec(u.pathname) || /\/folders\/([A-Za-z0-9_-]{10,})/.exec(u.pathname);
  return m ? m[1] : u.searchParams.get("id") || "";
}
const IMAGENS = ["image/jpeg", "image/png", "image/gif", "image/webp"];

function blocosDeArquivo(tipo, buf, nome) {
  if (!buf || !buf.length) return null;
  if (tipo === "application/pdf" && buf.subarray(0, 5).toString() === "%PDF-") return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } }];
  if (IMAGENS.includes(tipo)) return [{ type: "image", source: { type: "base64", media_type: tipo, data: buf.toString("base64") } }];
  if (/^text\/|json|csv/.test(tipo)) return [{ type: "text", text: `Conteúdo do arquivo${nome ? " \"" + nome + "\"" : ""}:\n` + buf.toString("utf8").slice(0, MAX_TEXTO) }];
  return null;
}

export async function lerLink(link) {
  let u;
  try { u = new URL(String(link || "").trim()); } catch { return { ok: false, motivo: "link_invalido" }; }
  if (!["https:", "http:"].includes(u.protocol)) return { ok: false, motivo: "link_invalido" };
  const google = /(^|\.)(drive|docs)\.google\.com$/.test(u.hostname);
  // 1. Google: pela conta de serviço (arquivo compartilhado com ela).
  if (google && googleConfigurado()) {
    const id = idDrive(u);
    if (id) {
      try {
        const a = await lerArquivoDrive(id, MAX_BYTES);
        if (a) {
          const blocos = a.texto ? [{ type: "text", text: `Arquivo "${a.nome}":\n${a.texto.slice(0, MAX_TEXTO)}` }] : blocosDeArquivo(a.tipo, a.buf, a.nome);
          return { ok: true, fonte: "drive", nome: a.nome, blocos: [{ type: "text", text: `Nome do arquivo no Drive: ${a.nome} (${a.tipo})` }, ...(blocos || [])] };
        }
      } catch (e) { console.error("[link] drive:", String(e?.message || e).slice(0, 100)); }
    }
  }
  // 2. Google público: exportação de Docs/Planilhas/Apresentações e download direto de arquivos do Drive.
  const tentativas = [];
  if (google) {
    const id = idDrive(u);
    if (id && /\/document\/d\//.test(u.pathname)) tentativas.push(`https://docs.google.com/document/d/${id}/export?format=txt`);
    if (id && /\/spreadsheets\/d\//.test(u.pathname)) tentativas.push(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`);
    if (id && /\/presentation\/d\//.test(u.pathname)) tentativas.push(`https://docs.google.com/presentation/d/${id}/export/txt`);
    if (id && /\/file\/d\//.test(u.pathname)) tentativas.push(`https://drive.google.com/uc?export=download&id=${id}`);
  }
  tentativas.push(u.toString());
  let nomeVisto = "";
  for (const url of tentativas) {
    const r = await buscar(url);
    if (r.erro === "endereco_bloqueado") return { ok: false, motivo: "endereco_bloqueado" };
    if (r.erro || r.status >= 400 || !r.buf?.length) continue;
    if (r.tipo === "text/html" || (!r.tipo && /^\s*</.test(r.buf.toString("utf8", 0, 200)))) {
      const html = r.buf.toString("utf8");
      if (pareceLogin(r.urlFinal, html)) continue;
      const h = lerHtml(html);
      const tituloUtil = h.titulo && !/^(Google Drive|Google Docs|Documentos Google|Planilhas Google)$/i.test(h.titulo) ? h.titulo : "";
      if (google && tituloUtil) nomeVisto = tituloUtil.replace(/\s*-\s*Google (Drive|Docs|Sheets|Slides|Planilhas|Documentos|Apresentações)\s*$/i, "");
      // Página do Drive sem conteúdo: só o nome do arquivo (ainda é uma leitura real, mas pobre).
      if (google && h.texto.length < 200 && !nomeVisto) continue;
      if (!google && h.texto.length < 40 && !tituloUtil) continue;
      const partes = google && nomeVisto
        ? [`Nome do arquivo no Google Drive: ${nomeVisto}`, h.descricao && `Descrição: ${h.descricao}`]
        : [tituloUtil && `Título da página: ${tituloUtil}`, h.descricao && `Descrição: ${h.descricao}`, h.texto && `Texto da página:\n${h.texto}`];
      return { ok: true, fonte: google ? "drive_publico" : "pagina", nome: nomeVisto || tituloUtil, blocos: [{ type: "text", text: partes.filter(Boolean).join("\n") }] };
    }
    if (r.grande) return { ok: true, fonte: "arquivo", nome: nomeVisto, blocos: [{ type: "text", text: `Arquivo grande demais para ler (${r.tipo}).${nomeVisto ? " Nome: " + nomeVisto : ""}` }], parcial: true };
    const blocos = blocosDeArquivo(r.tipo, r.buf, nomeVisto);
    if (blocos) return { ok: true, fonte: "arquivo", nome: nomeVisto, blocos };
  }
  return { ok: false, motivo: "nao_legivel" };
}
