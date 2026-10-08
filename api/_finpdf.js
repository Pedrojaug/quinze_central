// Relatórios em PDF do Financeiro, gerados no servidor sem bibliotecas externas (estável na Vercel).
// Fonte Helvetica padrão do PDF (codificação WinAnsi, acentos do português) e o logo da Quinze no cabeçalho.
// Os números vêm exatamente dos mesmos cálculos da tela (calcularDashboard / calcularFluxo em _fin.js).
import zlib from "node:zlib";
import { logo } from "./_logo.js";

// Larguras (por 1000 unidades) dos caracteres WinAnsi 32..255 da Helvetica e Helvetica-Bold.
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,500,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,556,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
// Caracteres fora do Latin-1 que existem no WinAnsi.
const ESPECIAIS = { 8211: 150, 8212: 151, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8230: 133, 8364: 128, 8722: 45 };
const codigo = ch => { const c = ch.codePointAt(0); if (ESPECIAIS[c]) return ESPECIAIS[c]; return c >= 32 && c <= 255 && !(c >= 127 && c < 160) ? c : 63; };
const bytes = s => [...String(s ?? "")].map(codigo);
const largura = (s, tam, negrito) => bytes(s).reduce((t, c) => t + ((negrito ? W_BOLD : W_REG)[c - 32] || 556), 0) * tam / 1000;
const literal = s => "(" + bytes(s).map(c => (c === 40 || c === 41 || c === 92 ? "\\" + String.fromCharCode(c) : c < 128 ? String.fromCharCode(c) : "\\" + c.toString(8).padStart(3, "0"))).join("") + ")";

const AZUL = [6 / 255, 96 / 255, 255 / 255], TINTA = [0.08, 0.11, 0.17], CINZA = [0.35, 0.38, 0.45], LINHA = [0.85, 0.88, 0.92], FUNDO = [0.94, 0.96, 1];
const A4 = { w: 595.28, h: 841.89 }, MARGEM = 40;

export const brl = v => { const n = Math.round((Number(v) || 0) * 100); const neg = n < 0; const a = Math.abs(n); const int = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "."); return `${neg ? "-" : ""}R$ ${int},${String(a % 100).padStart(2, "0")}`; };
const pct = v => (v == null ? "—" : `${v > 0 ? "+" : ""}${String(v.toFixed(1)).replace(".", ",")}%`);
const br = iso => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const mesBr = m => (m ? `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+m.slice(5, 7) - 1]}/${m.slice(0, 4)}` : "");
const agoraBr = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

class Documento {
  constructor(titulo) { this.titulo = titulo; this.paginas = []; this.novaPagina(); }
  novaPagina() { this.c = []; this.paginas.push(this.c); this.y = A4.h - MARGEM; if (this.paginas.length > 1) this.cabecalhoCurto(); }
  cor(rgb, fill = true) { this.c.push(`${rgb.map(x => x.toFixed(3)).join(" ")} ${fill ? "rg" : "RG"}`); }
  texto(x, y, s, o = {}) {
    const tam = o.tam || 9, neg = !!o.negrito;
    let t = String(s ?? "");
    if (o.max) { while (t.length > 1 && largura(t, tam, neg) > o.max) t = t.slice(0, -2) + "…"; }
    const w = largura(t, tam, neg);
    const px = o.alinhar === "direita" ? x - w : o.alinhar === "centro" ? x - w / 2 : x;
    this.cor(o.cor || TINTA);
    this.c.push(`BT /${neg ? "F2" : "F1"} ${tam} Tf ${px.toFixed(2)} ${y.toFixed(2)} Td ${literal(t)} Tj ET`);
    return w;
  }
  linha(x1, y1, x2, y2, rgb = LINHA, esp = 0.6) { this.cor(rgb, false); this.c.push(`${esp} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); }
  retangulo(x, y, w, h, rgb) { this.cor(rgb); this.c.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  logo(x, y, h) {
    const L = logo();
    if (!L) { this.texto(x, y + h * 0.25, "QUINZE", { tam: h * 0.7, negrito: true, cor: AZUL }); return h * 3; }
    const w = h * L.largura / L.altura; this.c.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`); return w;
  }
  garantir(h) { if (this.y - h < MARGEM + 24) this.novaPagina(); }
  cabecalhoCurto() { this.logo(MARGEM, this.y - 16, 16); this.texto(A4.w - MARGEM, this.y - 11, this.titulo, { tam: 8, cor: CINZA, alinhar: "direita" }); this.y -= 30; }
  cabecalho(linhas) {
    this.logo(MARGEM, this.y - 30, 30);
    this.y -= 52;
    this.texto(MARGEM, this.y, this.titulo, { tam: 16, negrito: true, cor: AZUL });
    this.y -= 16;
    for (const l of linhas) { this.texto(MARGEM, this.y, l, { tam: 9, cor: CINZA }); this.y -= 12; }
    this.y -= 4; this.linha(MARGEM, this.y, A4.w - MARGEM, this.y, AZUL, 1.2); this.y -= 18;
  }
  secao(t) { this.garantir(40); this.texto(MARGEM, this.y, t, { tam: 11, negrito: true, cor: AZUL }); this.y -= 14; }
  // Caixas de resumo lado a lado: [{ rotulo, valor, detalhe }]
  resumo(itens) {
    this.garantir(52);
    const larg = (A4.w - 2 * MARGEM - (itens.length - 1) * 8) / itens.length;
    itens.forEach((it, i) => {
      const x = MARGEM + i * (larg + 8);
      this.retangulo(x, this.y - 40, larg, 44, FUNDO);
      this.texto(x + 8, this.y - 8, it.rotulo, { tam: 8, cor: CINZA, max: larg - 16 });
      this.texto(x + 8, this.y - 23, it.valor, { tam: 12, negrito: true, cor: it.cor || TINTA, max: larg - 16 });
      if (it.detalhe) this.texto(x + 8, this.y - 35, it.detalhe, { tam: 7, cor: CINZA, max: larg - 16 });
    });
    this.y -= 56;
  }
  // Tabela: colunas [{ titulo, largura, alinhar }], linhas [[...]], total opcional [...]
  tabela(colunas, linhas, total) {
    const totalLarg = A4.w - 2 * MARGEM;
    const soma = colunas.reduce((s, c) => s + c.largura, 0);
    const cols = colunas.map(c => ({ ...c, w: c.largura / soma * totalLarg }));
    const cab = () => {
      this.garantir(30);
      this.retangulo(MARGEM, this.y - 4, totalLarg, 15, FUNDO);
      let x = MARGEM;
      for (const c of cols) { this.texto(c.alinhar === "direita" ? x + c.w - 4 : x + 4, this.y, c.titulo, { tam: 7.5, negrito: true, cor: AZUL, alinhar: c.alinhar, max: c.w - 8 }); x += c.w; }
      this.y -= 15;
    };
    cab();
    const linhaT = (vals, negrito) => {
      if (this.y - 13 < MARGEM + 24) { this.novaPagina(); cab(); }
      let x = MARGEM;
      cols.forEach((c, i) => { this.texto(c.alinhar === "direita" ? x + c.w - 4 : x + 4, this.y, vals[i], { tam: 8, negrito, alinhar: c.alinhar, max: c.w - 8 }); x += c.w; });
      this.y -= 4; this.linha(MARGEM, this.y, MARGEM + totalLarg, this.y); this.y -= 9;
    };
    if (!linhas.length) linhaT(["Nenhum registro.", ...cols.slice(1).map(() => "")]);
    linhas.forEach(l => linhaT(l, false));
    if (total) linhaT(total, true);
    this.y -= 10;
  }
  nota(t) { this.garantir(16); this.texto(MARGEM, this.y, t, { tam: 8, cor: CINZA }); this.y -= 14; }
  // Monta o arquivo PDF.
  gerar() {
    const total = this.paginas.length;
    this.paginas.forEach((c, i) => {
      this.c = c;
      this.linha(MARGEM, MARGEM + 6, A4.w - MARGEM, MARGEM + 6);
      this.texto(MARGEM, MARGEM - 6, "Central Quinze · Financeiro · documento interno", { tam: 7, cor: CINZA });
      this.texto(A4.w - MARGEM, MARGEM - 6, `página ${i + 1} de ${total}`, { tam: 7, cor: CINZA, alinhar: "direita" });
    });
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    const catalogo = add(null), paginasId = add(null);
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const L = logo();
    const im = L ? add({ dict: `<< /Type /XObject /Subtype /Image /Width ${L.largura} /Height ${L.altura} /ColorSpace [/Indexed /DeviceRGB ${L.paleta.length / 6 - 1} <${L.paleta}>] /BitsPerComponent ${L.bits} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 1 /BitsPerComponent ${L.bits} /Columns ${L.largura} >> /Length ${L.dados.length} >>`, stream: L.dados }) : 0;
    const ids = this.paginas.map(c => {
      const conteudo = zlib.deflateSync(Buffer.from(c.join("\n"), "latin1"));
      const cid = add({ dict: `<< /Filter /FlateDecode /Length ${conteudo.length} >>`, stream: conteudo });
      return add(`<< /Type /Page /Parent ${paginasId} 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> ${im ? `/XObject << /Im1 ${im} 0 R >> ` : ""}>> /Contents ${cid} 0 R >>`);
    });
    objs[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasId} 0 R >>`;
    objs[paginasId - 1] = `<< /Type /Pages /Kids [${ids.map(i => `${i} 0 R`).join(" ")}] /Count ${ids.length} >>`;
    const info = add(`<< /Title ${literal(this.titulo)} /Producer (Central Quinze) /Creator (Central Quinze) >>`);
    const partes = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets = [];
    let pos = partes[0].length;
    objs.forEach((o, i) => {
      offsets.push(pos);
      const b = typeof o === "string" ? Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1")
        : Buffer.concat([Buffer.from(`${i + 1} 0 obj\n${o.dict}\nstream\n`, "latin1"), o.stream, Buffer.from("\nendstream\nendobj\n", "latin1")]);
      partes.push(b); pos += b.length;
    });
    const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`),
      `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${pos}\n%%EOF\n`].join("");
    partes.push(Buffer.from(xref, "latin1"));
    return Buffer.concat(partes);
  }
}

const STATUS = { aberto: "Aberto", pago: "Pago", atrasado: "Atrasado", cancelado: "Cancelado" };

export async function pdfDashboard(d, u) {
  const p = d.periodo;
  const doc = new Documento("Relatório financeiro — Dashboard");
  doc.cabecalho([
    `Período: ${p.label} · Competência: ${mesBr(p.de)} a ${mesBr(p.ate)} (comparado com ${p.anterior.label})`,
    `Gerado em ${agoraBr()} por ${u.nome || u.login}`,
    "Regime de competência: valores pelo mês de competência (o fluxo de caixa usa a data de pagamento).",
  ]);
  const t = d.totais;
  doc.resumo([
    { rotulo: "Receitas", valor: brl(t.receitas), detalhe: `anterior ${brl(d.anteriorTotais.receitas)} · ${pct(d.variacao.receitas)}` },
    { rotulo: "Despesas", valor: brl(t.despesas), detalhe: `anterior ${brl(d.anteriorTotais.despesas)} · ${pct(d.variacao.despesas)}` },
    { rotulo: "Resultado", valor: brl(t.resultado), cor: t.resultado < 0 ? [0.75, 0.15, 0.1] : AZUL, detalhe: `anterior ${brl(d.anteriorTotais.resultado)} · ${pct(d.variacao.resultado)}` },
    { rotulo: "Inadimplência (em atraso)", valor: brl(d.inadimplencia.valor), detalhe: `${d.inadimplencia.quantidade} lançamento(s)` },
  ]);
  doc.secao("Resultado por mês (competência)");
  doc.tabela([{ titulo: "Mês", largura: 2 }, { titulo: "Receitas", largura: 2, alinhar: "direita" }, { titulo: "Despesas", largura: 2, alinhar: "direita" }, { titulo: "Resultado", largura: 2, alinhar: "direita" }],
    d.meses.map(m => [m.label, brl(m.receitas), brl(m.despesas), brl(m.resultado)]), ["Total", brl(t.receitas), brl(t.despesas), brl(t.resultado)]);
  const tot = l => l.reduce((s, x) => s + x.valor, 0);
  doc.secao("Despesas por categoria");
  doc.tabela([{ titulo: "Categoria", largura: 4 }, { titulo: "Valor", largura: 2, alinhar: "direita" }, { titulo: "%", largura: 1, alinhar: "direita" }],
    d.despesasPorCategoria.map(c => [c.nome, brl(c.valor), t.despesas ? `${(c.valor / t.despesas * 100).toFixed(1).replace(".", ",")}%` : "—"]), ["Total", brl(tot(d.despesasPorCategoria)), ""]);
  doc.secao("Receitas por categoria");
  doc.tabela([{ titulo: "Categoria", largura: 4 }, { titulo: "Valor", largura: 2, alinhar: "direita" }, { titulo: "%", largura: 1, alinhar: "direita" }],
    d.receitasPorCategoria.map(c => [c.nome, brl(c.valor), t.receitas ? `${(c.valor / t.receitas * 100).toFixed(1).replace(".", ",")}%` : "—"]), ["Total", brl(tot(d.receitasPorCategoria)), ""]);
  doc.secao("Receita por cliente (top 5)");
  doc.tabela([{ titulo: "Cliente", largura: 4 }, { titulo: "Receita", largura: 2, alinhar: "direita" }],
    d.receitaPorCliente.map(c => [c.nome, brl(c.valor)]));
  doc.secao("Lançamentos do período");
  doc.tabela([{ titulo: "Comp.", largura: 1.4 }, { titulo: "Venc.", largura: 1.7 }, { titulo: "Tipo", largura: 1.2 }, { titulo: "Descrição", largura: 2.9 },
    { titulo: "Cliente / fornecedor", largura: 2.4 }, { titulo: "Categoria", largura: 1.7 }, { titulo: "Status", largura: 1.3 }, { titulo: "Valor", largura: 1.9, alinhar: "direita" }],
  d.lancamentos.map(l => [mesBr(l.competencia), br(l.vencimento), l.tipo === "receber" ? "Receita" : "Despesa", l.descricao, l.quem, l.categoria, STATUS[l.status] || l.status, brl(l.tipo === "receber" ? l.valor : -l.valor)]),
  ["", "", "", `${d.lancamentos.length} lançamento(s)`, "", "", "Resultado", brl(t.resultado)]);
  doc.nota("Cancelados não entram nos totais. Despesas aparecem com sinal negativo na lista de lançamentos.");
  return doc.gerar();
}

export async function pdfFluxo(d, u) {
  const f = d.filtro;
  const doc = new Documento("Relatório financeiro — Fluxo de caixa");
  doc.cabecalho([
    `Período: ${br(f.de)} a ${br(f.ate)} · agrupado por ${f.agrupar === "dia" ? "dia" : "mês"} · Competência: ${f.compDe || f.compAte ? `${f.compDe ? mesBr(f.compDe) : "início"} a ${f.compAte ? mesBr(f.compAte) : "hoje"}` : "todas"}`,
    `Gerado em ${agoraBr()} por ${u.nome || u.login}`,
    `Regime de caixa: realizado pela data de pagamento; previsão pelos lançamentos em aberto (vencimento). Saldo inicial: ${brl(d.saldoInicial)}${d.saldoInicialData ? ` em ${br(d.saldoInicialData)}` : ""}.`,
  ]);
  const t = d.totais;
  doc.resumo([
    { rotulo: "Saldo no início do período", valor: brl(t.saldoInicialPeriodo) },
    { rotulo: "Entradas realizadas", valor: brl(t.entradas) },
    { rotulo: "Saídas realizadas", valor: brl(t.saidas) },
    { rotulo: "Saldo final realizado", valor: brl(t.saldoFinal), cor: AZUL },
  ]);
  doc.resumo([
    { rotulo: "Entradas previstas (em aberto)", valor: brl(t.prevEntradas) },
    { rotulo: "Saídas previstas (em aberto)", valor: brl(t.prevSaidas) },
    { rotulo: "Saldo final previsto", valor: brl(t.saldoFinalPrevisto), cor: AZUL },
  ]);
  doc.secao("Saldo acumulado");
  doc.tabela([{ titulo: f.agrupar === "dia" ? "Dia" : "Mês", largura: 1.4 }, { titulo: "Entradas", largura: 1.6, alinhar: "direita" }, { titulo: "Saídas", largura: 1.6, alinhar: "direita" },
    { titulo: "Saldo realizado", largura: 1.8, alinhar: "direita" }, { titulo: "Prev. entradas", largura: 1.6, alinhar: "direita" }, { titulo: "Prev. saídas", largura: 1.6, alinhar: "direita" }, { titulo: "Saldo previsto", largura: 1.8, alinhar: "direita" }],
  d.buckets.map(b => [f.agrupar === "dia" ? br(b.chave) : mesBr(b.chave), brl(b.entradas), brl(b.saidas), brl(b.saldo), brl(b.prevEntradas), brl(b.prevSaidas), brl(b.saldoPrevisto)]),
  ["Total", brl(t.entradas), brl(t.saidas), brl(t.saldoFinal), brl(t.prevEntradas), brl(t.prevSaidas), brl(t.saldoFinalPrevisto)]);
  const cols = [{ titulo: "Data", largura: 1.3 }, { titulo: "Tipo", largura: 1.1 }, { titulo: "Descrição", largura: 3.4 }, { titulo: "Cliente / fornecedor", largura: 2.6 },
    { titulo: "Categoria", largura: 1.8 }, { titulo: "Comp.", largura: 1.1 }, { titulo: "Valor", largura: 1.8, alinhar: "direita" }];
  const linhas = l => l.map(x => [br(x.data), x.tipo === "receber" ? "Entrada" : "Saída", x.descricao + (x.atrasado ? " (atrasado)" : ""), x.quem, x.categoria, mesBr(x.competencia), brl(x.tipo === "receber" ? x.valor : -x.valor)]);
  doc.secao("Lançamentos realizados (pagos) no período");
  doc.tabela(cols, linhas(d.realizados), ["", "", `${d.realizados.length} lançamento(s)`, "", "", "Líquido", brl(t.entradas - t.saidas)]);
  doc.secao("Previsão (em aberto) no período");
  doc.tabela(cols, linhas(d.previstos), ["", "", `${d.previstos.length} lançamento(s)`, "", "", "Líquido", brl(t.prevEntradas - t.prevSaidas)]);
  return doc.gerar();
}
