// Helpers puros de validação, sanitização e tradução de erros para upload de peças.
// Não importa _lib.js para permitir testes unitários sem DATABASE_URL.
import { nomeSeguro } from "./_arquivos.js";

export const TIPOS_PECAS = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export const MAX_BYTES_DIRETO = 100 * 1024 * 1024;
export const MAX_BYTES_SERVIDOR = 3 * 1024 * 1024;

export function extensaoPeca(nomeBruto) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(nomeBruto || "").trim());
  return m ? m[1].toLowerCase() : "";
}

function normalizarNomeExibicao(nomeBruto, ext) {
  const limpo = String(nomeBruto || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  const semExt = limpo.replace(/\.[^.]+$/, "").trim() || "arquivo";
  const maxStem = Math.max(1, 160 - ext.length - 1);
  return `${semExt.slice(0, maxStem)}.${ext}`;
}

export function montarChavePeca({ login, nome, dia, randHex }) {
  const ext = extensaoPeca(nome);
  const tipo = TIPOS_PECAS[ext];
  if (!tipo) {
    return {
      erro: "tipo_invalido",
      msg: "Envie JPG, PNG, WEBP, GIF, PDF ou vídeo (MP4/MOV/WEBM).",
    };
  }
  const nomeLimpo = normalizarNomeExibicao(nome, ext);
  const semExt = String(nome || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().replace(/\.[^.]+$/, "");
  const stem = nomeSeguro(semExt || "arquivo");
  const loginSeg = nomeSeguro(login || "usuario").toLowerCase();
  const diaSeg = String(dia || "").replace(/[^0-9]/g, "") || "00000000";
  const randSeg = String(randHex || "").replace(/[^a-f0-9]/gi, "") || "000000";
  const chave = `pecas/${loginSeg}/${diaSeg}-${randSeg}/${stem}.${ext}`;
  return { chave, ext, tipo, nomeLimpo };
}

export function validarUploadBase64({ nome, b64, maxBytes = MAX_BYTES_SERVIDOR }) {
  const ext = extensaoPeca(nome);
  const tipo = TIPOS_PECAS[ext];
  if (!tipo) {
    return {
      erro: "tipo_invalido",
      msg: "Envie JPG, PNG, WEBP, GIF, PDF ou vídeo (MP4/MOV/WEBM).",
    };
  }
  if (typeof b64 !== "string") {
    return { erro: "arquivo_vazio", msg: "O arquivo enviado está vazio." };
  }
  const b64Limpo = b64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!b64Limpo) {
    return { erro: "arquivo_vazio", msg: "O arquivo enviado está vazio." };
  }
  if (b64Limpo.length > Math.ceil(maxBytes * 1.45)) {
    return {
      erro: "arquivo_grande",
      msg: `O arquivo passa de ${Math.round(maxBytes / 1048576)} MB para envio alternativo.`,
    };
  }
  const buf = Buffer.from(b64Limpo, "base64");
  if (!buf.length) {
    return { erro: "arquivo_vazio", msg: "O arquivo enviado está vazio." };
  }
  if (buf.length > maxBytes) {
    return {
      erro: "arquivo_grande",
      msg: `O arquivo passa de ${Math.round(maxBytes / 1048576)} MB para envio alternativo.`,
    };
  }
  if (ext === "pdf" && buf.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return { erro: "pdf_invalido", msg: "O arquivo PDF parece corrompido ou inválido." };
  }
  return {
    buf,
    ext,
    tipo,
    nomeLimpo: normalizarNomeExibicao(nome, ext),
  };
}

export function traduzirErroBlob(status, corpoTexto) {
  let code = "";
  let message = "";
  const bruto = String(corpoTexto || "").trim();
  if (bruto.startsWith("{")) {
    try {
      const j = JSON.parse(bruto);
      code = String(j?.error?.code || j?.code || "").trim().toLowerCase();
      message = String(j?.error?.message || j?.message || j?.msg || "").trim();
    } catch {}
  }

  if (code === "content_type_not_allowed" || /content\s*type.*not allowed/i.test(message)) {
    return "O armazenamento recusou o formato/tipo do arquivo.";
  }
  if (code === "file_too_large" || status === 413) {
    return "O arquivo excede o tamanho máximo permitido.";
  }
  if (code === "rate_limited" || status === 429) {
    return "Muitos envios ao mesmo tempo. Aguarde alguns segundos e tente de novo.";
  }
  if (code === "forbidden" || code === "store_suspended" || status === 401 || status === 403) {
    return message
      ? `O armazenamento recusou a permissão de envio (${status}): ${message.slice(0, 120)}`
      : `O armazenamento recusou a permissão de envio (${status}).`;
  }
  if (code === "service_unavailable" || status >= 500) {
    return `O serviço de armazenamento está temporariamente indisponível (${status}).`;
  }
  if (message) {
    return `O armazenamento recusou o arquivo (${status}): ${message.slice(0, 140)}`;
  }
  return status ? `O armazenamento recusou o arquivo (${status}).` : "Falha de conexão com o armazenamento.";
}
