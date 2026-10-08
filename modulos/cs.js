// 04 CS / Sucesso do Cliente: NPS Pesquisa, NPS Média e Reclamações (todos os perfis).
// Tudo pela rota /api/m?r=cs/... (a IA roda no servidor; a chave nunca chega aqui).
(function () {
  if (window.__qzCs) return; window.__qzCs = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const br = iso => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
  const brHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const mesBr = m => { if (!m) return ""; const [y, mm] = m.split("-"); return ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+mm - 1] + "/" + y; };
  const num1 = v => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
  const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  async function api(r, body) {
    const res = await fetch("/api/m?r=cs/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || (res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.")), { code: j.code, status: res.status });
    return j;
  }

  if (!document.getElementById("qzCsCss")) {
    const st = document.createElement("style"); st.id = "qzCsCss";
    st.textContent = `
      .cs-h{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}.cs-h h2{margin:0}.cs-h .sp{flex:1}
      .cs-sub{font-size:12.5px;color:var(--ink2)}
      .cs-lay{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start}
      @media(max-width:860px){.cs-lay{grid-template-columns:1fr}}
      .cs-list{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden}
      .cs-it{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line2);background:none;padding:10px 12px;cursor:pointer;font:inherit}
      .cs-it:hover{background:#F6F8FB}.cs-it.on{background:var(--blue-soft)}.cs-it b{display:block;font-size:14px}
      .cs-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:14px}
      .cs-card h3{margin:0 0 10px;font-size:16px;display:flex;gap:8px;align-items:center}
      .cs-card.lock{opacity:.55}.cs-card.lock *{pointer-events:none}
      .cs-n{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;font-size:13px}
      .cs-card.ok .cs-n{background:#1B8A4B}
      .cs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
      .cs-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2)}.cs-grid .full{grid-column:1/-1}
      .cs-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      .cs-q{display:grid;grid-template-columns:130px minmax(0,1fr) auto;gap:8px;align-items:start;padding:8px 0;border-bottom:1px solid var(--line2)}
      .cs-q textarea{min-height:38px}.cs-q .op{grid-column:2/3}
      .st{font-size:12px;padding:2px 8px;border-radius:20px;white-space:nowrap;font-weight:600;background:var(--line2)}
      .st.perguntas_em_aprovacao,.st.em_andamento,.st.media{background:#FFF4DE;color:#8A5A00}
      .st.aprovada,.st.formulario_gerado{background:#E5EFFC;color:#1D4F91}
      .st.enviada,.st.resolvida,.st.baixa{background:#E6F6EC;color:#1B6B3A}
      .st.aberta,.st.alta{background:#FDE8E8;color:#A12020}
      .cs-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px}
      .cs-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
      .cs-kpi b{display:block;font:700 26px/1 var(--display);font-variant-numeric:tabular-nums}.cs-kpi span{font-size:13px;color:var(--ink2)}
      .cs-tbl{width:100%;border-collapse:collapse;font-size:14px}
      .cs-tbl th{font-size:12.5px;color:var(--ink2);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line)}
      .cs-tbl td{padding:8px;border-bottom:1px solid var(--line2);vertical-align:top}.cs-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
      .cs-tbl .acts{text-align:right;white-space:nowrap}.cs-tbl .acts .btn{padding:4px 9px;font-size:13px;min-height:0;margin-left:4px}
      .cs-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
      .cs-msg{width:100%;min-height:170px;font:inherit;white-space:pre-wrap}
      .cs-pontos{margin:0;padding-left:20px}.cs-pontos li{margin-bottom:8px}
      .cs-chart svg{width:100%;height:220px;display:block}`;
    document.head.appendChild(st);
  }

  // ======================================================================
  // NPS PESQUISA
  // ======================================================================
  const ST_P = { rascunho: "Rascunho", perguntas_em_aprovacao: "Perguntas em aprovação", aprovada: "Aprovada", formulario_gerado: "Formulário pronto", enviada: "Enviada" };
  const TIPOS_Q = { nps: "NPS (0 a 10)", aberta: "Aberta", multipla: "Múltipla escolha" };
  function nps(ctx) {
    const el = ctx.el; let base = null, sel = null, novo = false;
    el.innerHTML = `<div class="cs-h"><div><h2>NPS Pesquisa</h2><div class="cs-sub">Do tom e objetivo até a mensagem de WhatsApp, uma pesquisa por cliente e mês.</div></div><span class="sp"></span>
      <button class="btn primary" type="button" id="nNova">Nova pesquisa</button></div>
      <div class="cs-lay"><div class="cs-list" id="nLista"></div><div id="nEd"></div></div>`;
    const $ = s => el.querySelector(s);
    const etapa = s => base.status.indexOf(s);
    async function carregar(manter) {
      try { base = await api("inicio"); } catch (e) { $("#nEd").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if (!manter) sel = sel && base.pesquisas.find(p => p.id === sel.id) || null;
      lista(); editor();
    }
    function lista() {
      $("#nLista").innerHTML = base.pesquisas.length ? base.pesquisas.map(p => `<button type="button" class="cs-it${sel && sel.id === p.id ? " on" : ""}" data-id="${esc(p.id)}">
        <b>${esc(p.clienteNome)}</b><span class="cs-sub">${mesBr(p.mes)}</span> <span class="st ${p.status}">${ST_P[p.status]}</span></button>`).join("")
        : `<div class="empty" style="padding:14px">Nenhuma pesquisa ainda.</div>`;
    }
    function passo(n, titulo, feito, travado, corpo) {
      return `<div class="cs-card${feito ? " ok" : ""}${travado ? " lock" : ""}"><h3><span class="cs-n">${feito ? "✓" : n}</span>${titulo}</h3>${corpo}</div>`;
    }
    function editor() {
      if (!sel && !novo) { $("#nEd").innerHTML = `<div class="cs-card"><p class="cs-sub" style="margin:0">Escolha uma pesquisa na lista ou clique em “Nova pesquisa”.</p></div>`; return; }
      const p = sel || { status: "rascunho", mes: mesAtual(), perguntas: [] };
      const e = etapa(p.status);
      const cli = base.clientes.map(c => `<option value="${esc(c.id)}"${c.id === p.clienteId ? " selected" : ""}>${esc(c.nome)}</option>`).join("");
      const bloq1 = e > etapa("perguntas_em_aprovacao");
      let html = passo(1, "Tom de voz e objetivo", !!p.id, false, `<div class="cs-grid">
        <label>Cliente (Carteira)<select id="pCli"${bloq1 ? " disabled" : ""}><option value="">Escolha</option>${cli}</select></label>
        <label>Mês de referência<input id="pMes" type="month" value="${esc(p.mes || "")}"${bloq1 ? " disabled" : ""}></label>
        <label class="full">Tom de voz da pesquisa<textarea id="pTom" rows="2" placeholder="Ex.: próximo, leve e direto"${bloq1 ? " disabled" : ""}>${esc(p.tom || "")}</textarea></label>
        <label class="full">O que o levantamento do mês quer descobrir (pode colar texto)<textarea id="pObj" rows="4"${bloq1 ? " disabled" : ""}>${esc(p.objetivo || "")}</textarea></label></div>
        ${bloq1 ? `<p class="cs-sub">Perguntas aprovadas: tom e objetivo ficam travados.</p>` : `<div class="cs-bar"><button class="btn primary" type="button" data-a="salvar">${p.id ? "Salvar alterações" : "Salvar e seguir"}</button>
        ${p.id ? `<span style="flex:1"></span><button class="btn" type="button" data-a="excluir">Excluir pesquisa</button>` : ""}<span class="cs-sub" id="m1"></span></div>`}`);
      if (p.id) {
        html += passo(2, "Briefing e proposta de perguntas", e >= etapa("perguntas_em_aprovacao"), bloq1, `
          ${p.briefing ? `<label class="cs-sub" style="display:block">Briefing${p.origemPerguntas === "ia" ? " (gerado por IA)" : ""}<textarea id="pBrief" rows="5" style="width:100%">${esc(p.briefing)}</textarea></label>` : `<p class="cs-sub" style="margin-top:0">A IA monta um briefing curto e propõe até ${base.maxPerguntas} perguntas (a NPS de 0 a 10 é obrigatória).</p>`}
          ${base.ia ? "" : `<div class="note warn">A IA ainda não está ligada (falta a chave ANTHROPIC_API_KEY na Vercel). Use as perguntas-modelo e edite.</div>`}
          <div class="cs-bar"><button class="btn primary" type="button" data-a="ia"${base.ia ? "" : " disabled"}>${p.briefing ? "Gerar de novo com IA" : "Gerar briefing com IA"}</button>
          <button class="btn" type="button" data-a="modelo">Usar perguntas-modelo</button><span class="cs-sub" id="m2"></span></div>`);
        html += passo(3, "Aprovação das perguntas", e >= etapa("aprovada"), e < etapa("perguntas_em_aprovacao"), e < etapa("perguntas_em_aprovacao") ? `<p class="cs-sub">Gere o briefing primeiro.</p>` : `
          <div id="pQs">${(p.perguntas || []).map((q, i) => `<div class="cs-q" data-i="${i}">
            <select data-k="tipo"${bloq1 ? " disabled" : ""}>${Object.entries(TIPOS_Q).map(([k, v]) => `<option value="${k}"${k === q.tipo ? " selected" : ""}>${v}</option>`).join("")}</select>
            <textarea data-k="texto" rows="1"${bloq1 ? " disabled" : ""}>${esc(q.texto)}</textarea>
            ${bloq1 ? "<span></span>" : `<button class="btn" type="button" data-a="rmq" title="Remover">✕</button>`}
            ${q.tipo === "multipla" ? `<input class="op" data-k="opcoes" placeholder="Opções separadas por ;" value="${esc((q.opcoes || []).join("; "))}"${bloq1 ? " disabled" : ""}>` : ""}</div>`).join("")}</div>
          ${bloq1 ? `<p class="cs-sub">Aprovadas por ${esc(p.aprovadoPor?.nome || "")} em ${brHora(p.aprovadoEm)}.</p>` : `<div class="cs-bar"><button class="btn" type="button" data-a="addq"${(p.perguntas || []).length >= base.maxPerguntas ? " disabled" : ""}>+ Pergunta</button>
          <button class="btn" type="button" data-a="salvarq">Salvar alterações</button><button class="btn primary" type="button" data-a="aprovar">Aprovar perguntas</button><span class="cs-sub" id="m3"></span></div>`}`);
        html += passo(4, "Formulário", e >= etapa("formulario_gerado"), e < etapa("aprovada"), e < etapa("aprovada") ? `<p class="cs-sub">Aprove as perguntas para seguir.</p>` : p.formId ? `
          <p style="margin:0 0 8px">Formulário criado no Google Forms${p.formularioGeradoEm ? ` em ${brHora(p.formularioGeradoEm)}` : ""}.</p>
          <div class="cs-bar" style="margin-top:0"><a class="btn primary" href="${esc(p.formularioUrl)}" target="_blank" rel="noopener">Abrir o formulário (link de resposta)</a><a class="btn" href="${esc(p.formularioEdicao)}" target="_blank" rel="noopener">Editar no Google Forms</a></div>
          ${p.avisoForm ? `<div class="note warn" style="margin-top:10px">${esc(p.avisoForm)}</div>` : ""}
          <p class="cs-sub">${p.respostasSincronizadasEm ? `${p.respostasNoForm || 0} resposta(s) no formulário · atualizado em ${brHora(p.respostasSincronizadasEm)}` : "As respostas aparecem no NPS Média (atualização automática diária ou pelo botão “Atualizar respostas”)."}</p>` : `
          <div class="cs-bar" style="margin-top:0"><button class="btn primary" type="button" data-a="form"${base.google ? "" : " disabled"}>Gerar formulário</button>${base.google ? `<span class="cs-sub">Cria no Google Forms com as perguntas aprovadas (NPS de 0 a 10 obrigatória).</span>` : `<span class="cs-sub">disponível após a integração do Google</span>`}<span class="cs-sub" id="m4f"></span></div>
          <details style="margin-top:12px"${!base.google || p.formularioUrl ? " open" : ""}><summary class="cs-sub">Já criei o formulário: colar o link</summary>
          <div class="cs-grid" style="margin-top:8px"><label class="full">Link do formulário<input id="pLink" placeholder="https://forms.gle/..." value="${esc(p.formularioUrl || "")}"></label></div>
          <div class="cs-bar"><button class="btn" type="button" data-a="link">Salvar link</button><span class="cs-sub" id="m4"></span></div></details>`);
        html += passo(5, "Mensagem de WhatsApp", p.status === "enviada", e < etapa("formulario_gerado"), e < etapa("formulario_gerado") ? `<p class="cs-sub">Cole o link do formulário para gerar a mensagem.</p>` : `
          <div class="cs-grid"><label>Cliente<select id="pMsgCli">${base.clientes.map(c => `<option value="${esc(c.nome)}"${c.id === p.clienteId ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}</select></label></div>
          <textarea class="cs-msg" id="pMsg" style="margin-top:10px"></textarea>
          <div class="cs-bar"><button class="btn primary" type="button" data-a="copiar">Copiar</button>${p.status === "enviada" ? `<span class="cs-sub">Marcada como enviada em ${brHora(p.enviadaEm)}.</span>` : `<span class="cs-sub">Ao copiar, a pesquisa é marcada como enviada.</span>`}</div>`);
      }
      $("#nEd").innerHTML = html;
      if (p.id && e >= etapa("formulario_gerado")) mensagem();
      const mc = $("#pMsgCli"); if (mc) mc.onchange = mensagem;
    }
    async function mensagem() {
      try { const j = await api("pesquisa.mensagem", { id: sel.id, hora: new Date().getHours(), clienteNome: $("#pMsgCli").value }); $("#pMsg").value = j.mensagem; } catch (e) { $("#pMsg").value = e.message; }
    }
    const lerPerguntas = () => [...el.querySelectorAll(".cs-q")].map(r => ({ tipo: r.querySelector('[data-k="tipo"]').value, texto: r.querySelector('[data-k="texto"]').value,
      opcoes: (r.querySelector('[data-k="opcoes"]')?.value || "").split(";").map(s => s.trim()).filter(Boolean) }));
    const msg = (id, t) => { const m = $("#" + id); if (m) m.textContent = t; };
    let armado = false;
    el.addEventListener("click", async ev => {
      const it = ev.target.closest(".cs-it");
      if (it) { sel = base.pesquisas.find(p => p.id === it.dataset.id); novo = false; armado = false; lista(); editor(); return; }
      const a = ev.target.dataset.a; if (!a) return;
      const b = ev.target;
      try {
        if (a === "salvar") {
          msg("m1", "Salvando…");
          const j = await api("pesquisa.salvar", { id: sel?.id, clienteId: $("#pCli").value, mes: $("#pMes").value, tom: $("#pTom").value, objetivo: $("#pObj").value });
          sel = j.pesquisa; novo = false; ctx.toast("Pesquisa salva"); return carregar(true);
        }
        if (a === "excluir") {
          if (!armado) { armado = true; b.textContent = "Clique de novo para excluir"; return; }
          await api("pesquisa.excluir", { id: sel.id }); sel = null; armado = false; ctx.toast("Pesquisa excluída"); return carregar();
        }
        if (a === "ia" || a === "modelo") {
          b.disabled = true; msg("m2", a === "ia" ? "A IA está montando o briefing… (pode levar alguns segundos)" : "");
          const j = await api("pesquisa.briefing", { id: sel.id, modelo: a === "modelo" });
          sel = j.pesquisa; return carregar(true);
        }
        if (a === "addq") { const qs = lerPerguntas(); qs.push({ tipo: "aberta", texto: "Nova pergunta" }); sel.perguntas = qs; return editor(); }
        if (a === "rmq") { const qs = lerPerguntas(); qs.splice(+b.closest(".cs-q").dataset.i, 1); sel.perguntas = qs; return editor(); }
        if (a === "salvarq" || a === "aprovar") {
          const j = await api("pesquisa.perguntas", { id: sel.id, perguntas: lerPerguntas(), briefing: $("#pBrief") ? $("#pBrief").value : undefined });
          sel = j.pesquisa;
          if (a === "salvarq") { ctx.toast(j.aviso ? "Salvo. Atenção: " + j.aviso : "Perguntas salvas"); return carregar(true); }
          const k = await api("pesquisa.aprovar", { id: sel.id }); sel = k.pesquisa; ctx.toast("Perguntas aprovadas"); return carregar(true);
        }
        if (a === "form") { b.disabled = true; msg("m4f", "Criando o formulário no Google…"); const j = await api("pesquisa.formulario", { id: sel.id }); sel = j.pesquisa; ctx.toast("Formulário criado no Google Forms"); return carregar(true); }
        if (a === "link") { const j = await api("pesquisa.link", { id: sel.id, link: $("#pLink").value }); sel = j.pesquisa; ctx.toast("Link salvo"); return carregar(true); }
        if (a === "copiar") {
          try { await navigator.clipboard.writeText($("#pMsg").value); } catch { $("#pMsg").select(); document.execCommand && document.execCommand("copy"); }
          ctx.toast("Mensagem copiada");
          if (sel.status !== "enviada") { const j = await api("pesquisa.enviada", { id: sel.id }); sel = j.pesquisa; return carregar(true); }
        }
      } catch (e) {
        b.disabled = false;
        const alvo = { salvar: "m1", excluir: "m1", ia: "m2", modelo: "m2", salvarq: "m3", aprovar: "m3", link: "m4", form: "m4f" }[a];
        if (alvo && $("#" + alvo)) msg(alvo, e.message); else ctx.toast(e.message);
        if (a === "aprovar") carregar(true);
      }
    });
    $("#nNova").onclick = () => { sel = null; novo = true; lista(); editor(); };
    return () => carregar();
  }

  // ======================================================================
  // NPS MÉDIA
  // ======================================================================
  function npsMedia(ctx) {
    const el = ctx.el; let dados = null;
    const ano = new Date().getFullYear();
    el.innerHTML = `<div class="cs-h"><div><h2>NPS Média</h2><div class="cs-sub">NPS = % promotores (notas 9 e 10) − % detratores (notas 0 a 6).</div></div><span class="sp"></span>
      <label class="cs-sub">De <input type="month" id="mDe" value="${ano}-01"></label><label class="cs-sub">Até <input type="month" id="mAte" value="${mesAtual()}"></label>
      <label class="cs-sub">Cliente <select id="mCli"><option value="">Todos</option></select></label></div>
      <div class="cs-bar" id="mSyncBar" hidden style="margin:-4px 0 12px"><button class="btn" type="button" id="mSync">Atualizar respostas do Google Forms</button><span class="cs-sub" id="mSyncMsg"></span></div>
      <div id="mAviso"></div><div class="cs-kpis" id="mKpis"></div>
      <div class="cs-card cs-chart"><h3>Evolução mensal</h3><div id="mChart"></div></div>
      <div class="cs-card"><h3>Pontos de melhoria <span class="sp" style="flex:1"></span><button class="btn" type="button" id="mRel">Gerar relatório</button></h3><div id="mRelBox"></div></div>
      <div class="cs-card"><h3>Por cliente</h3><div class="cs-wrap" style="border:0"><table class="cs-tbl"><thead><tr><th>Cliente</th><th class="num">Respostas</th><th class="num">Média</th><th class="num">NPS</th><th class="num">Promotores</th><th class="num">Neutros</th><th class="num">Detratores</th></tr></thead><tbody id="mCliRows"></tbody></table></div></div>`;
    const $ = s => el.querySelector(s);
    const filtro = () => ({ de: $("#mDe").value, ate: $("#mAte").value, cliente: $("#mCli").value });
    async function carregar() {
      const f = filtro();
      try { dados = await api("respostas&" + new URLSearchParams(f)); } catch (e) { $("#mAviso").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if ($("#mCli").options.length <= 1) $("#mCli").insertAdjacentHTML("beforeend", dados.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join(""));
      $("#mSyncBar").hidden = !dados.google;
      $("#mAviso").innerHTML = "";
      const t = dados.total;
      $("#mKpis").innerHTML = `<div class="cs-kpi"><b>${t.n}</b><span>Respostas</span></div><div class="cs-kpi"><b>${num1(t.media)}</b><span>Nota média</span></div>
        <div class="cs-kpi"><b>${num1(t.nps)}</b><span>NPS</span></div><div class="cs-kpi"><b>${t.promotores}</b><span>Promotores (9–10)</span></div>
        <div class="cs-kpi"><b>${t.neutros}</b><span>Neutros (7–8)</span></div><div class="cs-kpi"><b>${t.detratores}</b><span>Detratores (0–6)</span></div>`;
      $("#mCliRows").innerHTML = dados.porCliente.length ? dados.porCliente.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${c.n}</td><td class="num">${num1(c.media)}</td><td class="num"><b>${num1(c.nps)}</b></td><td class="num">${c.promotores}</td><td class="num">${c.neutros}</td><td class="num">${c.detratores}</td></tr>`).join("")
        : `<tr><td colspan="7" class="empty">Sem respostas no período.</td></tr>`;
      grafico(dados.porMes);
      const r = dados.relatorio;
      $("#mRel").textContent = r ? "Gerar de novo" : "Gerar relatório";
      $("#mRel").disabled = !dados.ia;
      $("#mRelBox").innerHTML = (dados.ia ? "" : `<div class="note warn">A IA ainda não está ligada (falta a chave ANTHROPIC_API_KEY na Vercel).</div>`)
        + (r ? `<ol class="cs-pontos">${r.pontos.map(p => `<li><b>${esc(p.titulo)}</b><br><span class="cs-sub" style="font-size:14px">${esc(p.detalhe)}</span></li>`).join("")}</ol>
          <p class="cs-sub">Gerado em ${brHora(r.geradoEm)} por ${esc(r.geradoPor?.nome || "")}, a partir de ${r.respostasAnalisadas} respostas abertas.</p>`
          : `<p class="cs-sub" style="margin:0">${dados.abertas.length ? `${dados.abertas.length} respostas abertas no período. Clique em “Gerar relatório”.` : "Sem respostas abertas no período."}</p>`);
    }
    function grafico(meses) {
      if (!meses.length) { $("#mChart").innerHTML = `<p class="cs-sub">Sem dados no período.</p>`; return; }
      const W = 640, H = 220, L = 40, R = 14, T = 14, B = 34;
      const x = i => L + (meses.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (meses.length - 1));
      const y = v => T + (100 - v) / 200 * (H - T - B);
      const yM = v => T + (10 - v) / 10 * (H - T - B);
      const grade = [-100, -50, 0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E6E9EE"/><text x="${L - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#6B7280">${v}</text>`).join("");
      const linha = (fn, k, cor) => `<polyline fill="none" stroke="${cor}" stroke-width="2.5" points="${meses.map((m, i) => `${x(i)},${fn(m[k])}`).join(" ")}"/>` + meses.map((m, i) => `<circle cx="${x(i)}" cy="${fn(m[k])}" r="4" fill="${cor}"><title>${mesBr(m.chave)}: ${k === "nps" ? "NPS " + num1(m.nps) : "média " + num1(m.media)} (${m.n} resp.)</title></circle>`).join("");
      $("#mChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="NPS por mês">${grade}${linha(y, "nps", "#1F6FEB")}${linha(yM, "media", "#E0A100")}
        ${meses.map((m, i) => `<text x="${x(i)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#6B7280">${mesBr(m.chave)}</text>`).join("")}</svg>
        <div class="cs-sub"><span style="color:#1F6FEB">●</span> NPS (escala −100 a 100) &nbsp; <span style="color:#E0A100">●</span> Nota média (escala 0 a 10)</div>`;
    }
    ["#mDe", "#mAte", "#mCli"].forEach(s => $(s).addEventListener("change", carregar));
    $("#mSync").onclick = async () => {
      $("#mSync").disabled = true; $("#mSyncMsg").textContent = "Lendo as respostas…";
      try { const j = await api("forms.sync", {}); $("#mSyncMsg").textContent = `${j.novas} resposta(s) nova(s) de ${j.formularios} formulário(s)${j.erros.length ? ` · erros: ${j.erros.join("; ")}` : ""}`; } catch (e) { $("#mSyncMsg").textContent = e.message; }
      $("#mSync").disabled = false; carregar();
    };
    $("#mRel").onclick = async () => {
      $("#mRel").disabled = true; $("#mRelBox").insertAdjacentHTML("afterbegin", `<p class="cs-sub" id="mRelEsp">A IA está lendo as respostas…</p>`);
      try { await api("relatorio.gerar", filtro()); ctx.toast("Relatório gerado"); } catch (e) { ctx.toast(e.message); }
      carregar();
    };
    return carregar;
  }

  // ======================================================================
  // RECLAMAÇÕES
  // ======================================================================
  const GRAV = { baixa: "Baixa", media: "Média", alta: "Alta" };
  const ST_R = { aberta: "Aberta", em_andamento: "Em andamento", resolvida: "Resolvida" };
  function reclamacoes(ctx) {
    const el = ctx.el; let dados = null;
    el.innerHTML = `<div class="cs-h"><div><h2>Reclamações</h2><div class="cs-sub">Registros pontuais da rotina, fora da pesquisa. Editam: quem registrou, o Mestre e a gestão.</div></div><span class="sp"></span>
      <button class="btn primary" type="button" id="rNova">Registrar reclamação</button></div>
      <div id="rForm"></div>
      <div class="cs-h"><select id="fCli"><option value="">Todos os clientes</option></select><select id="fGrav"><option value="">Toda gravidade</option>${Object.entries(GRAV).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <select id="fSt"><option value="">Todos os status</option>${Object.entries(ST_R).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <label class="cs-sub">De <input type="date" id="fDe"></label><label class="cs-sub">Até <input type="date" id="fAte"></label></div>
      <div class="cs-wrap"><table class="cs-tbl"><thead><tr><th>Data</th><th>Cliente</th><th>Canal</th><th>Gravidade</th><th>Descrição</th><th>Responsável</th><th>Status</th><th></th></tr></thead><tbody id="rRows"><tr><td colspan="8" class="empty">Carregando…</td></tr></tbody></table></div>`;
    const $ = s => el.querySelector(s);
    async function carregar() {
      try { dados = await api("reclamacoes"); } catch (e) { $("#rRows").innerHTML = `<tr><td colspan="8" class="empty">${esc(e.message)}</td></tr>`; return; }
      if ($("#fCli").options.length <= 1) $("#fCli").insertAdjacentHTML("beforeend", dados.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join(""));
      render();
    }
    function render() {
      const f = { cli: $("#fCli").value, g: $("#fGrav").value, s: $("#fSt").value, de: $("#fDe").value, ate: $("#fAte").value };
      const l = dados.reclamacoes.filter(r => (!f.cli || r.clienteId === f.cli) && (!f.g || r.gravidade === f.g) && (!f.s || r.status === f.s) && (!f.de || r.data >= f.de) && (!f.ate || r.data <= f.ate));
      $("#rRows").innerHTML = l.length ? l.map(r => `<tr data-id="${esc(r.id)}"><td>${br(r.data)}</td><td><b>${esc(r.clienteNome)}</b></td><td>${esc(r.canal)}</td><td><span class="st ${r.gravidade}">${GRAV[r.gravidade]}</span></td>
        <td>${esc(r.descricao)}${r.resolucao ? `<div class="cs-sub">Resolução${r.dataResolucao ? " (" + br(r.dataResolucao) + ")" : ""}: ${esc(r.resolucao)}</div>` : ""}<div class="cs-sub">registrada por ${esc(r.criadoPor?.nome || "")}</div></td>
        <td>${esc(r.responsavel?.nome || "—")}</td><td><span class="st ${r.status}">${ST_R[r.status]}</span></td>
        <td class="acts">${r.podeEditar ? `<button class="btn" data-a="ed">Editar</button>` : ""}</td></tr>`).join("") : `<tr><td colspan="8" class="empty">Nenhuma reclamação ${dados.reclamacoes.length ? "com esses filtros" : "registrada"}.</td></tr>`;
    }
    function historico(cid, atual) {
      const h = dados.reclamacoes.filter(r => r.clienteId === cid && r.id !== atual);
      $("#rHist").innerHTML = !cid ? "" : h.length ? `<div class="note" style="margin-top:10px"><b>Histórico deste cliente (${h.length}):</b><ul style="margin:6px 0 0;padding-left:18px">${h.map(r => `<li>${br(r.data)} · ${GRAV[r.gravidade]} · ${ST_R[r.status]}: ${esc(r.descricao.slice(0, 120))}</li>`).join("")}</ul></div>` : `<p class="cs-sub">Nenhuma reclamação anterior deste cliente.</p>`;
    }
    function form(r) {
      r = r || { data: dados.hoje, status: "aberta", gravidade: "media", canal: "WhatsApp" };
      const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
      $("#rForm").innerHTML = `<div class="cs-card" style="border-color:var(--blue)"><h3>${r.id ? "Editar reclamação" : "Registrar reclamação"}</h3><div class="cs-grid">
        <label>Cliente (Carteira)${sel("eCli", [["", "Escolha"], ...dados.clientes.map(c => [c.id, c.nome]), ...(r.clienteId && !dados.clientes.some(c => c.id === r.clienteId) ? [[r.clienteId, r.clienteNome]] : [])], r.clienteId || "")}</label>
        <label>Data<input type="date" id="eData" value="${r.data || ""}"></label>
        <label>Canal${sel("eCanal", dados.canais.map(c => [c, c]), r.canal)}</label>
        <label>Gravidade${sel("eGrav", Object.entries(GRAV), r.gravidade)}</label>
        <label>Responsável${sel("eResp", [["", "—"], ...dados.usuarios.map(u => [u.login, u.nome])], r.responsavel?.login || "")}</label>
        <label>Status${sel("eSt", Object.entries(ST_R), r.status)}</label>
        <label class="full">Descrição<textarea id="eDesc" rows="3">${esc(r.descricao || "")}</textarea></label>
        <label class="full" id="eResL">Resolução (obrigatória ao marcar como resolvida)<textarea id="eRes" rows="2">${esc(r.resolucao || "")}</textarea></label>
        <label id="eDrL">Data de resolução<input type="date" id="eDr" value="${r.dataResolucao || ""}"></label></div>
        <div id="rHist"></div>
        <div class="cs-bar"><button class="btn primary" type="button" id="eOk">Salvar</button><button class="btn" type="button" id="eNo">Cancelar</button>
        ${r.id ? `<span style="flex:1"></span><button class="btn" type="button" id="eDel">Excluir</button>` : ""}<span class="cs-sub" id="eMsg"></span></div></div>`;
      const st = () => { $("#eDrL").hidden = $("#eSt").value !== "resolvida"; };
      $("#eSt").onchange = st; st();
      $("#eCli").onchange = () => historico($("#eCli").value, r.id); historico(r.clienteId, r.id);
      $("#eNo").onclick = () => { $("#rForm").innerHTML = ""; };
      $("#eOk").onclick = async () => {
        try { await api("reclamacao.salvar", { id: r.id, clienteId: $("#eCli").value, data: $("#eData").value, canal: $("#eCanal").value, gravidade: $("#eGrav").value,
            responsavel: $("#eResp").value, status: $("#eSt").value, descricao: $("#eDesc").value, resolucao: $("#eRes").value, dataResolucao: $("#eDr").value });
          ctx.toast("Reclamação salva"); $("#rForm").innerHTML = ""; carregar(); } catch (e) { $("#eMsg").textContent = e.message; }
      };
      let armado = false;
      if (r.id) $("#eDel").onclick = async ev => {
        if (!armado) { armado = true; ev.target.textContent = "Clique de novo para excluir"; return; }
        try { await api("reclamacao.excluir", { id: r.id }); ctx.toast("Excluída"); $("#rForm").innerHTML = ""; carregar(); } catch (e) { $("#eMsg").textContent = e.message; }
      };
    }
    $("#rNova").onclick = () => dados && form(null);
    ["#fCli", "#fGrav", "#fSt", "#fDe", "#fAte"].forEach(s => $(s).addEventListener("change", () => dados && render()));
    el.addEventListener("click", ev => { if (ev.target.dataset.a === "ed") form(dados.reclamacoes.find(r => r.id === ev.target.closest("tr").dataset.id)); });
    return carregar;
  }

  const MONTAR = { nps, npsmedia: npsMedia, reclamacoes };
  Object.entries(MONTAR).forEach(([id, montar]) => {
    let recarregar = null;
    QZ.modulo({ id, iniciar(ctx) { recarregar = montar(ctx); if (!ctx.el.hidden) recarregar(); }, aoMostrar() { if (recarregar) recarregar(); } });
  });
})();
