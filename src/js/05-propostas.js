  // ---------- Propostas ----------
  const PR_ASSIN = {nome:"Eduardo Pedrosa", tel:"(84) 99655-2286", email:"eduardo@quinzecomunicacao.com"};
  const PR_EXCL = [
    "Custos com impressão de materiais gráficos",
    "Gastos com materiais audiovisuais (vídeos, áudios, jingles)",
    "Custos com viagens e deslocamentos para outras cidades",
    "Profissional de social media em tempo real para eventos",
    "Verba para gestão de tráfego pago, bem como os valores a serem pagos nas plataformas digitais",
    "Produção cênica para VTs (seleção de casting, cenários etc.)",
  ];
  const PR_PAG = ["Primeiro pagamento no ato da contratação.", "50% na contratação e 50% na finalização.", "Boleto bancário com vencimento todo dia 15 de cada mês.", "Pagamento em parcela única.", "Valores incluem impostos."];
  const QZ_RODAPE = "Quinze Comunicação LTDA · CNPJ 18.836.421/0001-12 · Rua Tiradentes, 259, Sala 601, Centro Empresarial Caiçara · Mossoró/RN";
  const PR_GROUPS = [["unicos","Serviços únicos"],["recorrentes","Serviços recorrentes"],["opcionais","Opcionais recomendados"]];
  let props = [], prSel = null, prMode = "", prDraft = null;
  const brl = v => (Number(v) || 0).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
  function parseBRL(s){
    if (typeof s === "number") return s;
    let t = String(s || "").replace(/[^\d,.-]/g, "");
    if (!t) return 0;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    else if ((t.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
    const n = parseFloat(t);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  const dataExtenso = iso => { const d = dOf(iso || todayIso()); return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; };
  const clone = o => JSON.parse(JSON.stringify(o));
  function blankProp(){
    let as = PR_ASSIN;
    try { const s = JSON.parse(localStorage.getItem("prop-assin") || "null"); if (s && s.nome) as = s; } catch {}
    return {cliente:"", responsavel:"", cnpj:"", endereco:"", telefone:"", atendimento: as.nome, data: todayIso(), validade: 15, objetivo:"",
      unicos:[], recorrentes:[], opcionais:[], mostrarValores:true, feeFixo:"", desconto:{pct:"", regra:"primeiros", meses:3},
      periodo:{ativo:false, inicio:"", fim:""}, prazoMinimo:3, pagamento:"Primeiro pagamento no ato da contratação.", observacoes:"",
      exclusoes:[...PR_EXCL.slice(0,5)], outrasExclusoes:"", compacta:false, assinante:{...as}, status:"rascunho"};
  }
  function prCalc(p){
    const sum = a => (a || []).reduce((s, i) => s + parseBRL(i.valor), 0);
    const su = sum(p.unicos), sr = sum(p.recorrentes);
    const fee = parseBRL(p.feeFixo) || sr;
    const pct = Number(String(p.desconto?.pct || "").replace(",", ".")) || 0;
    const base = fee || su;
    const comDesc = pct ? Math.round(base * (1 - pct / 100) * 100) / 100 : null;
    return {su, sr, fee, pct, base, comDesc};
  }
  function prRows(p){
    const c = prCalc(p), mv = p.mostrarValores !== false, rows = [], per = p.periodo?.ativo;
    const val = i => mv ? brl(parseBRL(i.valor)) : "";
    if ((p.unicos || []).length) {
      rows.push({k:"sec", l:"Serviços únicos"});
      p.unicos.forEach(i => rows.push({k:"item", l:i.titulo || "Serviço", v: val(i)}));
      if (p.unicos.length > 1 || !mv) rows.push({k:"sub", l:"Total dos serviços únicos", v: brl(c.su)});
    }
    if ((p.recorrentes || []).length || parseBRL(p.feeFixo)) {
      rows.push({k:"sec", l: per ? "Serviços no período" : "Serviços recorrentes (mensal)"});
      (p.recorrentes || []).forEach(i => rows.push({k:"item", l:i.titulo || "Serviço", v: val(i)}));
      const lbl = per ? `Total no período${p.periodo.inicio && p.periodo.fim ? ` (${br(p.periodo.inicio)} a ${br(p.periodo.fim)})` : ""}` : (parseBRL(p.feeFixo) ? "Fee mensal" : "Total mensal (fee)");
      rows.push({k:"sub", l: lbl, v: brl(c.fee) + (per ? "" : "/mês")});
    }
    if (c.pct) {
      const r = p.desconto?.regra, m = Number(p.desconto?.meses) || 0, mensal = c.fee && !per;
      const l = r === "combo" ? `Contratando todos os serviços: ${c.pct}% de desconto` : r === "sempre" ? `Com ${c.pct}% de desconto` : `Com ${c.pct}% de desconto nos ${m || "primeiros"}${m ? " primeiros" : ""} meses`;
      rows.push({k:"hl", l, v: brl(c.comDesc) + (mensal ? "/mês" : "")});
    }
    if ((p.opcionais || []).length) {
      rows.push({k:"sec", l:"Opcionais recomendados (não inclusos no total)"});
      p.opcionais.forEach(i => rows.push({k:"opt", l:i.titulo || "Opcional", v: parseBRL(i.valor) ? "+ " + brl(parseBRL(i.valor)) : ""}));
    }
    return rows;
  }
  function prConds(p){
    const out = [];
    if (Number(p.prazoMinimo) > 0 && ((p.recorrentes || []).length || parseBRL(p.feeFixo)) && !p.periodo?.ativo) out.push(`Contrato mínimo de ${p.prazoMinimo} meses.`);
    if (p.periodo?.ativo && p.periodo.inicio && p.periodo.fim) out.push(`Vigência: de ${br(p.periodo.inicio)} a ${br(p.periodo.fim)}.`);
    (p.pagamento || "").split("\n").map(s => s.trim()).filter(Boolean).forEach(s => out.push(s));
    (p.observacoes || "").split("\n").map(s => s.trim()).filter(Boolean).forEach(s => out.push(s));
    out.push(`Proposta válida por ${Number(p.validade) || 15} dias a partir de ${br(p.data)}.`);
    return out;
  }
  const prExcl = p => [...(p.exclusoes || []), ...(p.outrasExclusoes || "").split("\n").map(s => s.trim()).filter(Boolean)];
  const prClientRows = p => [["Cliente", p.cliente], ["Responsável", p.responsavel], ["CNPJ", p.cnpj], ["Telefone", p.telefone], ["Endereço", p.endereco], ["Atendimento", p.atendimento]].filter(x => x[1]);
  const logoSrc = () => document.querySelector(".brand img")?.src || "";

  function sheetHtml(p){
    const rows = prRows(p), conds = prConds(p), ex = prExcl(p), as = p.assinante || PR_ASSIN;
    const grp = (k, t) => (p[k] || []).length ? `<div class="sh-tag">${t}</div>` + p[k].map((i, n) => `<div class="sh-svc"><b>${n+1}. ${esc(i.titulo || "Serviço")}</b>${i.desc ? `<br>${esc(i.desc).replace(/\n/g,"<br>")}` : ""}</div>`).join("") : "";
    return `<div class="sheet${p.compacta ? " compact" : ""}">
      <div class="sh-top"><img src="${logoSrc()}" alt="Quinze"><div class="r"><b>PROPOSTA COMERCIAL</b>Mossoró, ${dataExtenso(p.data)}</div></div>
      <h1>Proposta de serviços · ${esc(p.cliente)}</h1>
      <div class="sh-box">${prClientRows(p).map(([l,v]) => `<div><span>${l}:</span> <b>${esc(v)}</b></div>`).join("")}</div>
      ${p.objetivo ? `<h2>Objetivo</h2><p>${esc(p.objetivo).replace(/\n/g,"<br>")}</p>` : ""}
      <h2>Escopo dos serviços</h2>${PR_GROUPS.map(([k,t]) => grp(k, t)).join("")}
      <h2>Investimento</h2>
      <table class="sh-tbl"><thead><tr><th>Item</th><th class="v">Valor</th></tr></thead><tbody>
        ${rows.map(r => r.k === "sec" ? `<tr><td colspan="2" style="color:#1F3A5F;font-weight:700;padding-top:9px">${esc(r.l)}</td></tr>` : `<tr class="${r.k}"><td>${esc(r.l)}</td><td class="v">${esc(r.v || "")}</td></tr>`).join("")}
      </tbody></table>
      <h2>Condições</h2><ul>${conds.map(c => `<li>${esc(c)}</li>`).join("")}</ul>
      ${ex.length ? `<h2>Não estão incluídos nesta proposta</h2><ul>${ex.map(c => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
      <div class="sh-sign"><div class="ln"></div><b>${esc(as.nome)}</b><br>Agência Quinze Comunicação<br>${esc([as.tel, as.email].filter(Boolean).join(" · "))}</div>
      <div class="sh-foot">${esc(QZ_RODAPE)}</div>
    </div>`;
  }

  async function exportPropPdf(p){
    const JsPDF = await ensurePdf();
    const doc = new JsPDF({unit:"mm", format:"a4", compress:true});
    const W = 210, M = 20, CW = W - 2*M, C = !!p.compacta, fs = C ? 9 : 10, lh = C ? 4.1 : 4.7, TOP = 31;
    const navy = [31,58,95], ink = [58,58,58], gray = [107,107,107];
    const img = document.querySelector(".brand img");
    const lw = 32, lhh = img && img.naturalWidth ? lw * img.naturalHeight / img.naturalWidth : 7.3;
    const header = () => {
      try { doc.addImage(logoSrc(), "PNG", M, 11, lw, lhh); } catch {}
      doc.setFont("helvetica","bold").setFontSize(8.5).setTextColor(...navy).text("PROPOSTA COMERCIAL", W-M, 14.5, {align:"right"});
      doc.setFont("helvetica","normal").setFontSize(8).setTextColor(...gray).text(`Mossoró, ${dataExtenso(p.data)}`, W-M, 19, {align:"right"});
      doc.setDrawColor(...navy).setLineWidth(0.6).line(M, 23, W-M, 23);
    };
    let y = TOP;
    const ensure = h => { if (y + h > 276) { doc.addPage(); header(); y = TOP; } };
    const text = (t, {bold=false, size=fs, color=ink, indent=0, gap=0} = {}) => {
      doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color);
      doc.splitTextToSize(String(t), CW - indent).forEach(line => { ensure(lh); doc.text(line, M + indent, y); y += lh * size / fs; });
      y += gap;
    };
    const h2 = t => { ensure(14); y += C ? 2.5 : 4; doc.setFont("helvetica","bold").setFontSize(fs + 1).setTextColor(...navy).text(t.toUpperCase(), M, y); y += 1.8; doc.setDrawColor(217).setLineWidth(0.3).line(M, y, W-M, y); y += C ? 4.2 : 5.2; };
    const bullets = list => list.forEach(t => { doc.setFont("helvetica","normal").setFontSize(fs).setTextColor(...ink); const ls = doc.splitTextToSize(t, CW - 5); ensure(lh * ls.length); doc.text("•", M + 1, y); ls.forEach(l => { doc.text(l, M + 5, y); y += lh; }); y += 0.6; });

    header();
    text(`Proposta de serviços · ${p.cliente}`, {bold:true, size: C ? 15 : 17, color:[31,31,31], gap: C ? 2 : 3});
    // Caixa de dados do cliente
    const cr = prClientRows(p), half = Math.ceil(cr.length / 2), rowH = C ? 4.6 : 5.2, boxH = half * rowH + 5;
    ensure(boxH + 4);
    doc.setFillColor(242,242,242).rect(M, y - 4, CW, boxH, "F"); doc.setFillColor(...navy).rect(M, y - 4, 1.3, boxH, "F");
    cr.forEach(([l, v], i) => {
      const col = i < half ? 0 : 1, row = i < half ? i : i - half, x = M + 5 + col * (CW / 2), yy = y + 0.6 + row * rowH;
      doc.setFont("helvetica","normal").setFontSize(fs - 1).setTextColor(...gray).text(l + ":", x, yy);
      const lwid = doc.getTextWidth(l + ": ");
      doc.setFont("helvetica","bold").setTextColor(43,43,43).text(doc.splitTextToSize(String(v), CW/2 - 8 - lwid)[0] || "", x + lwid, yy);
    });
    y += boxH + (C ? 1 : 2);
    if (p.objetivo) { h2("Objetivo"); text(p.objetivo, {gap:1}); }
    h2("Escopo dos serviços");
    PR_GROUPS.forEach(([k, t]) => {
      if (!(p[k] || []).length) return;
      ensure(10); doc.setFont("helvetica","bold").setFontSize(fs - 2).setTextColor(...navy).text(t.toUpperCase(), M, y); y += C ? 4 : 4.8;
      p[k].forEach((i, n) => { text(`${n+1}. ${i.titulo || "Serviço"}`, {bold:true, color:[31,31,31]}); if (i.desc) text(i.desc, {indent:4, gap: C ? 1 : 1.6}); else y += 1; });
    });
    h2("Investimento");
    const rows = prRows(p);
    doc.autoTable({
      startY: y - 2, margin: {left:M, right:M, top:TOP}, theme:"plain",
      head: [["Item", "Valor"]], body: rows.map(r => [r.l, r.v || ""]),
      styles: {font:"helvetica", fontSize: fs - 0.5, cellPadding: C ? 1.6 : 2.1, textColor: ink, lineColor:[225,225,225], lineWidth:{bottom:0.2}},
      headStyles: {fillColor: navy, textColor: 255, fontStyle:"bold"},
      columnStyles: {1: {halign:"right", cellWidth: 48}},
      didParseCell: d => {
        if (d.section !== "body") { if (d.column.index === 1) d.cell.styles.halign = "right"; return; }
        const k = rows[d.row.index].k;
        if (k === "sec") { d.cell.styles.fontStyle = "bold"; d.cell.styles.textColor = navy; }
        if (k === "sub") { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = [242,242,242]; }
        if (k === "hl") { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = [232,237,243]; d.cell.styles.textColor = navy; }
        if (k === "opt") { d.cell.styles.fontStyle = "italic"; d.cell.styles.textColor = gray; }
      },
      didDrawPage: d => { if (d.pageNumber > 1) header(); },
    });
    y = doc.lastAutoTable.finalY + 4;
    h2("Condições"); bullets(prConds(p));
    const ex = prExcl(p);
    if (ex.length) { h2("Não estão incluídos nesta proposta"); bullets(ex); }
    const as = p.assinante || PR_ASSIN;
    ensure(26); y += C ? 7 : 10;
    doc.setDrawColor(107).setLineWidth(0.3).line(M, y, M + 70, y); y += 5;
    doc.setFont("helvetica","bold").setFontSize(fs + 0.5).setTextColor(31,31,31).text(as.nome || "", M, y); y += lh;
    doc.setFont("helvetica","normal").setFontSize(fs - 0.5).setTextColor(...ink).text("Agência Quinze Comunicação", M, y); y += lh;
    doc.text([as.tel, as.email].filter(Boolean).join(" · "), M, y);
    const n = doc.internal.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setDrawColor(217).setLineWidth(0.3).line(M, 284, W-M, 284);
      doc.setFont("helvetica","normal").setFontSize(7).setTextColor(138).text(QZ_RODAPE, W/2, 288, {align:"center"});
      if (n > 1) doc.text(`${i}/${n}`, W-M, 288, {align:"right"});
    }
    const dl = await claude.use("downloads");
    if (!dl) { toast("Download indisponível nesta visualização."); return; }
    await dl.save({filename: `Proposta ${p.cliente}.pdf`.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\\/:*?"<>|]+/g, "-"), data: doc.output("blob")});
  }

  // Lista
  function renderPropList(){
    const box = $("#prList"); if (!box) return;
    const q = ($("#prQ")?.value || "").trim().toLowerCase();
    const list = props.filter(p => !q || (p.cliente || "").toLowerCase().includes(q)).sort((a,b) => (b.atualizadoEm || "").localeCompare(a.atualizadoEm || ""));
    box.innerHTML = list.map(p => {
      const c = prCalc(p);
      const resumo = [c.su ? `${brl(c.su)} únicos` : "", c.fee ? `${brl(c.fee)}${p.periodo?.ativo ? " no período" : "/mês"}` : ""].filter(Boolean).join(" · ");
      return `<button type="button" class="pr-item" data-prsel="${esc(p.id)}" aria-current="${p.id === prSel}">
        <span class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="nm">${esc(p.cliente || "Sem nome")}</span><span class="st-pill ${p.status === "aprovada" ? "ok" : "rev"}">${p.status === "aprovada" ? "Aprovada" : "Em revisão"}</span></span>
        <span class="meta">${br(p.data)} · ${esc(p.atendimento || "")}${resumo ? " · " + resumo : ""}</span></button>`;
    }).join("") || `<p class="muted" style="margin:4px">${props.length ? "Nenhuma proposta com essa busca." : "Nenhuma proposta ainda."}</p>`;
  }
  // Área principal
  function renderPropMain(){
    const box = $("#prMain"); if (!box) return;
    if (prMode === "edit" && prDraft) { box.innerHTML = propForm(prDraft); prTotals(); return; }
    const p = props.find(x => x.id === prSel);
    if (!p) { box.innerHTML = `<div class="ob-empty"><h2>Nenhuma proposta aberta</h2><p class="muted">Crie uma proposta nova ou escolha uma da lista. Todas ficam salvas para a equipe.</p><button class="btn primary" type="button" data-prnew>Nova proposta</button></div>`; return; }
    const ok = p.status === "aprovada";
    box.innerHTML = `<div class="pr-actions">
        <div class="row"><span class="st-pill ${ok ? "ok" : "rev"}">${ok ? "Aprovada" : "Em revisão"}</span><span class="hint" style="margin:0">${ok ? `Aprovada em ${br(isoDay(p.aprovadaEm))}.` : "Confira a visualização. Se estiver ok, aprove para exportar o PDF."}</span></div>
        <div class="row"><button class="btn" type="button" data-pradj>Ajustar</button><button class="btn" type="button" data-prdup>Duplicar</button>
        <button class="btn primary" type="button" data-prpdf>${ok ? "Exportar PDF" : "Está ok · aprovar e exportar PDF"}</button></div></div>
      <div class="sheet-wrap">${sheetHtml(p)}</div>`;
  }
  function itemRows(k){
    return (prDraft[k] || []).map((i, n) => `<div class="pr-it">
      <input data-it="${k}" data-i="${n}" data-k="titulo" value="${esc(i.titulo || "")}" placeholder="Nome do serviço" aria-label="Nome do serviço">
      <input class="val" data-it="${k}" data-i="${n}" data-k="valor" value="${esc(i.valor ?? "")}" placeholder="R$ 0,00" inputmode="decimal" aria-label="Valor">
      <button type="button" class="x" data-itdel="${k}" data-i="${n}" aria-label="Remover item" title="Remover item">×</button>
      <textarea class="full" data-it="${k}" data-i="${n}" data-k="desc" rows="2" placeholder="Descrição do que está incluso" aria-label="Descrição">${esc(i.desc || "")}</textarea></div>`).join("");
  }
  function propForm(p){
    const f = (path, label, o={}) => {
      const v = path.split(".").reduce((a,k) => a == null ? a : a[k], p) ?? "";
      const id = "pr_" + path.replace(/\./g,"_");
      const inp = o.area ? `<textarea id="${id}" data-p="${path}" rows="${o.area}" placeholder="${esc(o.ph || "")}">${esc(v)}</textarea>`
        : o.options ? `<select id="${id}" data-p="${path}">${o.options.map(([x,l]) => `<option value="${esc(x)}"${String(v) === String(x) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`
        : `<input id="${id}" data-p="${path}" type="${o.type || "text"}" value="${esc(v)}" placeholder="${esc(o.ph || "")}"${o.type === "number" ? ' min="0"' : ""}>`;
      return `<div class="${o.full ? "full" : ""}"><label class="f" for="${id}">${esc(label)}</label>${inp}${o.hint ? `<div class="hint">${o.hint}</div>` : ""}</div>`;
    };
    const chk = (path, label) => { const v = path.split(".").reduce((a,k) => a == null ? a : a[k], p); return `<label style="display:flex;gap:8px;align-items:center;font-size:14px;cursor:pointer"><input type="checkbox" data-p="${path}"${v ? " checked" : ""} style="min-height:0;width:16px;height:16px"> ${esc(label)}</label>`; };
    return `<div class="pr-form">
      <div class="panel"><h3>${p.id ? "Ajustar proposta" : "Nova proposta"}</h3>
        <div class="fgrid">${f("cliente","Cliente")}${f("responsavel","Responsável")}${f("cnpj","CNPJ")}${f("telefone","Telefone")}${f("endereco","Endereço",{full:true})}${f("atendimento","Atendimento")}${f("data","Data",{type:"date"})}${f("validade","Validade (dias)",{type:"number"})}</div></div>
      <div class="panel"><h3>Objetivo</h3>${f("objetivo","Objetivo da proposta",{area:3, ph:"Ex.: Melhorar a presença digital, gerar autoridade e aumentar a conversão."})}</div>
      ${PR_GROUPS.map(([k,t]) => `<div class="panel"><h3>${t}</h3>${k === "opcionais" ? `<div class="hint">Aparecem na tabela, mas não entram no total.</div>` : ""}<div class="pr-items" id="items_${k}">${itemRows(k)}</div><div><button class="btn small" type="button" data-itadd="${k}">Adicionar item</button></div></div>`).join("")}
      <div class="panel"><h3>Investimento</h3>
        ${chk("mostrarValores","Mostrar o valor de cada item na tabela")}
        <div class="fgrid">
          ${f("feeFixo","Fee mensal fechado (opcional)",{ph:"Ex.: 3.200,00", hint:"Substitui a soma dos recorrentes. Use quando não quiser detalhar valores."})}
          ${f("desconto.pct","Desconto (%)",{ph:"Ex.: 15"})}
          ${f("desconto.regra","Como o desconto se aplica",{options:[["primeiros","Nos primeiros meses"],["combo","Contratando todos os serviços"],["sempre","Em todo o contrato"]]})}
          ${f("desconto.meses","Quantos meses com desconto",{type:"number"})}
        </div>
        ${chk("periodo.ativo","Valores referentes a um período fechado (ex.: campanha)")}
        <div class="fgrid">${f("periodo.inicio","Início do período",{type:"date"})}${f("periodo.fim","Fim do período",{type:"date"})}</div>
        <div class="pr-totals" id="prTotals"></div></div>
      <div class="panel"><h3>Condições</h3>
        <div class="fgrid">${f("prazoMinimo","Contrato mínimo (meses)",{type:"number", hint:"0 para não mostrar."})}</div>
        ${f("pagamento","Pagamento (uma condição por linha)",{area:3})}
        <div class="chips">${PR_PAG.map(t => `<button type="button" data-pragp="${esc(t)}">+ ${esc(t)}</button>`).join("")}</div>
        ${f("observacoes","Outras observações (uma por linha)",{area:2})}</div>
      <div class="panel"><h3>Não estão incluídos</h3>
        ${PR_EXCL.map((t,i) => `<label style="display:flex;gap:8px;align-items:flex-start;font-size:14px;cursor:pointer"><input type="checkbox" data-excl="${i}"${(p.exclusoes || []).includes(t) ? " checked" : ""} style="min-height:0;width:16px;height:16px;margin-top:3px"> ${esc(t)}</label>`).join("")}
        ${f("outrasExclusoes","Outros itens não incluídos (um por linha)",{area:2})}</div>
      <div class="panel"><h3>Assinatura e formato</h3>
        <div class="fgrid">${f("assinante.nome","Assinado por")}${f("assinante.tel","Telefone")}${f("assinante.email","E-mail",{type:"email"})}</div>
        ${chk("compacta","Versão compacta (tenta caber em uma página)")}</div>
      <div class="pr-bar"><button class="btn" type="button" data-prcancel>Cancelar</button><button class="btn primary" type="button" data-prgen>Gerar visualização</button></div>
    </div>`;
  }
  function prTotals(){
    const el = $("#prTotals"); if (!el || !prDraft) return;
    const c = prCalc(prDraft);
    const parts = [c.su ? `Únicos: <b>${brl(c.su)}</b>` : "", c.fee ? `${prDraft.periodo?.ativo ? "No período" : "Mensal"}: <b>${brl(c.fee)}</b>` : "", c.pct ? `Com desconto: <b>${brl(c.comDesc)}</b>` : ""].filter(Boolean);
    el.innerHTML = parts.length ? parts.map(x => `<span>${x}</span>`).join("") : "Adicione itens para ver os totais.";
  }
  function setDeep(o, path, v){ const ks = path.split("."); let t = o; ks.slice(0,-1).forEach(k => { if (typeof t[k] !== "object" || t[k] === null) t[k] = {}; t = t[k]; }); t[ks[ks.length-1]] = v; }

  document.addEventListener("input", e => {
    if (prMode !== "edit" || !prDraft || !e.target.closest("#prMain")) return;
    const t = e.target;
    if (t.dataset.p) setDeep(prDraft, t.dataset.p, t.type === "checkbox" ? t.checked : t.value);
    else if (t.dataset.it) prDraft[t.dataset.it][Number(t.dataset.i)][t.dataset.k] = t.value;
    else if (t.dataset.excl != null) { const s = PR_EXCL[Number(t.dataset.excl)]; const set = new Set(prDraft.exclusoes || []); t.checked ? set.add(s) : set.delete(s); prDraft.exclusoes = PR_EXCL.filter(x => set.has(x)); }
    prTotals();
  });
  document.addEventListener("change", e => { if (e.target.closest("#prMain") && e.target.type === "checkbox") e.target.dispatchEvent(new Event("input", {bubbles:true})); });
  $("#prQ").addEventListener("input", renderPropList);
  $("#prNew").addEventListener("click", () => { prDraft = blankProp(); prMode = "edit"; prSel = null; renderPropList(); renderPropMain(); });

  document.addEventListener("click", async e => {
    if (!e.target.closest("#tab-prop")) return;
    const s = e.target.closest("[data-prsel]");
    if (s) { if (prMode === "edit" && !confirmLeave()) return; prSel = s.dataset.prsel; prMode = "view"; prDraft = null; renderPropList(); renderPropMain(); return; }
    if (e.target.closest("[data-prnew]")) { $("#prNew").click(); return; }
    const add = e.target.closest("[data-itadd]");
    if (add) { const k = add.dataset.itadd; prDraft[k] = [...(prDraft[k] || []), {titulo:"", valor:"", desc:""}]; $("#items_" + k).innerHTML = itemRows(k); $("#items_" + k).querySelector(".pr-it:last-child input")?.focus(); prTotals(); return; }
    const del = e.target.closest("[data-itdel]");
    if (del) { const k = del.dataset.itdel; prDraft[k].splice(Number(del.dataset.i), 1); $("#items_" + k).innerHTML = itemRows(k); prTotals(); return; }
    const ap = e.target.closest("[data-pragp]");
    if (ap) { const ta = $("#pr_pagamento"); const v = ap.dataset.pragp; if (!ta.value.includes(v)) { ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + v; prDraft.pagamento = ta.value; } return; }
    if (e.target.closest("[data-prcancel]")) { prMode = prSel ? "view" : ""; prDraft = null; renderPropMain(); return; }
    if (e.target.closest("[data-prgen]")) { genProp(); return; }
    if (e.target.closest("[data-pradj]")) { const p = props.find(x => x.id === prSel); if (p) { prDraft = clone(p); prMode = "edit"; renderPropMain(); window.scrollTo({top: $("#prMain").offsetTop - 120}); } return; }
    if (e.target.closest("[data-prdup]")) { const p = props.find(x => x.id === prSel); if (p) { const d = clone(p); delete d.id; delete d.aprovadaEm; d.status = "rascunho"; d.cliente = d.cliente + " (cópia)"; d.data = todayIso(); prDraft = d; prMode = "edit"; prSel = null; renderPropList(); renderPropMain(); } return; }
    const pdfb = e.target.closest("[data-prpdf]");
    if (pdfb) {
      const p = props.find(x => x.id === prSel); if (!p || !db) return;
      pdfb.disabled = true; const lbl = pdfb.textContent; pdfb.textContent = "Gerando PDF…";
      try {
        if (p.status !== "aprovada") await db.collection("propostas").doc(p.id).update({status:"aprovada", aprovadaEm:new Date().toISOString()});
        await exportPropPdf(p);
      } catch(err) { toast(err?.code === "declined" ? "Download cancelado." : "Não deu para gerar o PDF. Tente de novo."); }
      finally { pdfb.disabled = false; pdfb.textContent = lbl; }
    }
  });
  function confirmLeave(){ return true; }
  async function genProp(){
    const p = prDraft; if (!p || !db) return;
    p.cliente = (p.cliente || "").trim();
    if (!p.cliente) { toast("Informe o nome do cliente."); $("#pr_cliente")?.focus(); return; }
    if (!(p.unicos || []).length && !(p.recorrentes || []).length && !parseBRL(p.feeFixo)) { toast("Adicione pelo menos um serviço."); return; }
    ["unicos","recorrentes","opcionais"].forEach(k => p[k] = (p[k] || []).filter(i => (i.titulo || "").trim() || (i.desc || "").trim() || parseBRL(i.valor)));
    const id = p.id || slug(p.cliente);
    const now = new Date().toISOString();
    const data = {...clone(p), status:"rascunho", criadoEm: p.criadoEm || now, atualizadoEm: now};
    delete data.id; delete data.aprovadaEm;
    try {
      await db.collection("propostas").doc(id).set(data);
      try { localStorage.setItem("prop-assin", JSON.stringify(p.assinante || PR_ASSIN)); } catch {}
      prSel = id; prMode = "view"; prDraft = null;
      props = [...props.filter(x => x.id !== id), {id, ...data}];
      renderPropList(); renderPropMain(); window.scrollTo({top: $("#prMain").offsetTop - 120});
      toast("Visualização gerada. Confira antes de exportar");
    } catch(err) { toast(friendly(err)); }
  }

