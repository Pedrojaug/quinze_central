// Logo da Quinze para o PDF do Financeiro: lê o /logo.png do projeto (o mesmo da página) e prepara a imagem
// indexada para o PDF (dados PNG usados direto, FlateDecode + Predictor 15). A transparência é aplicada
// sobre fundo branco na própria paleta. Sem o arquivo, o PDF sai com o nome QUINZE no lugar do logo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cache;
export function logo() {
  if (cache !== undefined) return cache;
  cache = null;
  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const arq = [path.join(aqui, "..", "logo.png"), path.join(process.cwd(), "logo.png")].find(f => fs.existsSync(f));
  if (!arq) return cache;
  try {
    const d = fs.readFileSync(arq);
    let i = 8, ihdr = null, plte = null, trns = null; const idat = [];
    while (i < d.length) {
      const n = d.readUInt32BE(i), t = d.toString("latin1", i + 4, i + 8), c = d.subarray(i + 8, i + 8 + n);
      if (t === "IHDR") ihdr = { w: c.readUInt32BE(0), h: c.readUInt32BE(4), bits: c[8], cor: c[9], entrelacado: c[12] };
      else if (t === "PLTE") plte = c; else if (t === "tRNS") trns = c; else if (t === "IDAT") idat.push(c);
      i += 12 + n;
    }
    if (!ihdr || ihdr.cor !== 3 || ihdr.entrelacado || !plte) return cache;
    const pal = [];
    for (let k = 0; k < plte.length / 3; k++) {
      const a = trns && k < trns.length ? trns[k] / 255 : 1;
      for (let j = 0; j < 3; j++) pal.push(Math.round(plte[k * 3 + j] * a + 255 * (1 - a)));
    }
    cache = { largura: ihdr.w, altura: ihdr.h, bits: ihdr.bits, paleta: Buffer.from(pal).toString("hex"), dados: Buffer.concat(idat) };
  } catch { cache = null; }
  return cache;
}
