// Retenção de arquivos (7 dias no Blob ou fallback no banco) e arquivamento de peças antigas preservando os dados do dashboard.
import { listar, gravar } from "./_mdados.js";
import { apagarArquivos, listarArquivos } from "./_arquivos.js";
import { ehChaveBanco, apagarBlobsDoBanco, listarBlobsDoBanco } from "./_pecas_blobs_db.js";

const M = "pecas";
export const RETENCAO_DIAS = 7;
export const DIA = 864e5;

export function processarRetencaoPeca(p, limiteMs, emIso) {
  const vencidos = [], emUso = [];
  let alterou = false;
  for (const v of p.versoes || []) {
    const venceu = Date.parse(v.enviadaEm) < limiteMs;
    for (const a of v.arquivos || []) {
      if (a.expirado) continue;
      if (venceu) {
        vencidos.push(a.chave);
        if (a.thumbChave) vencidos.push(a.thumbChave);
        a.expirado = true;
        a.expiradoEm = emIso;
        alterou = true;
      } else if (a.chave) {
        emUso.push(a.chave);
        if (a.thumbChave) emUso.push(a.thumbChave);
      }
    }
  }
  const ultEnvio = (p.versoes && p.versoes.length ? p.versoes[p.versoes.length - 1]?.enviadaEm : null) || p.atualizadoEm || p.criadoEm;
  const ultMs = Date.parse(ultEnvio);
  let arquivouAgora = false;
  if (!Number.isNaN(ultMs) && ultMs < limiteMs && !p.arquivada) {
    p.arquivada = true;
    p.arquivadaEm = emIso;
    arquivouAgora = true;
    alterou = true;
  }
  return { vencidos, emUso, arquivouAgora, alterou };
}

export async function limparVencidos(agoraMs = Date.now()) {
  const limite = agoraMs - RETENCAO_DIAS * DIA, em = new Date(agoraMs).toISOString();
  const out = { arquivosApagados: 0, pecasExpiradas: 0, pecasArquivadas: 0, pecasRemovidas: 0, orfaosApagados: 0 };
  const emUso = new Set();
  for (const p of await listar(M, "pecas")) {
    const r = processarRetencaoPeca(p, limite, em);
    for (const k of r.emUso) emUso.add(k);
    if (r.vencidos.length) {
      const vencidosBanco = r.vencidos.filter(ehChaveBanco);
      const vencidosBlob = r.vencidos.filter(c => !ehChaveBanco(c));
      if (vencidosBanco.length) {
        await apagarBlobsDoBanco(vencidosBanco);
        out.arquivosApagados += vencidosBanco.length;
      }
      if (vencidosBlob.length) {
        try {
          await apagarArquivos(vencidosBlob);
          out.arquivosApagados += vencidosBlob.length;
        } catch {}
      }
      out.pecasExpiradas++;
    }
    if (r.arquivouAgora) {
      out.pecasArquivadas++;
      out.pecasRemovidas++;
    }
    if (r.alterou) await gravar(M, "pecas", p.id, p);
  }
  // Arquivos enviados mas nunca ligados a uma peça (envio abandonado), também com mais de 7 dias.
  try {
    const orfaosBlob = (await listarArquivos("pecas/")).filter(f => !emUso.has(f.chave) && Date.parse(f.enviadoEm) < limite).map(f => f.chave);
    if (orfaosBlob.length) { await apagarArquivos(orfaosBlob); out.orfaosApagados += orfaosBlob.length; }
  } catch {}
  try {
    const orfaosBanco = (await listarBlobsDoBanco()).filter(f => !emUso.has(f.chave) && Date.parse(f.enviadoEm) < limite).map(f => f.chave);
    if (orfaosBanco.length) { await apagarBlobsDoBanco(orfaosBanco); out.orfaosApagados += orfaosBanco.length; }
  } catch {}
  return out;
}
