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
      .cs-card h3{margin:0 0 10px;font-size:16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .cs-card.lock{opacity:.55}.cs-card.lock *{pointer-events:none}
      .cs-n{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;font-size:13px}
      .cs-card.ok .cs-n{background:#1B8A4B}
      .cs-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
      .cs-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2)}.cs-grid .full{grid-column:1/-1}
      .cs-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      .cs-q{display:grid;grid-template-columns:145px minmax(0,1fr) auto;gap:8px;align-items:start;padding:8px 0;border-bottom:1px solid var(--line2)}
      .cs-q textarea{min-height:38px}.cs-q .op{grid-column:2/3}
      .st{font-size:12px;padding:2px 8px;border-radius:20px;white-space:nowrap;font-weight:600;background:var(--line2);display:inline-block}
      .st.perguntas_em_aprovacao,.st.em_andamento,.st.media,.st.neutro{background:#FFF4DE;color:#8A5A00}
      .st.aprovada,.st.formulario_gerado{background:#E5EFFC;color:#1D4F91}
      .st.enviada,.st.resolvida,.st.baixa,.st.promotor{background:#E6F6EC;color:#1B6B3A}
      .st.aberta,.st.alta,.st.detrator{background:#FDE8E8;color:#A12020}
      .cs-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:10px;margin-bottom:14px}
      .cs-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
      .cs-kpi b{display:block;font:700 26px/1 var(--display);font-variant-numeric:tabular-nums}.cs-kpi span{font-size:13px;color:var(--ink2)}
      .cs-tbl{width:100%;border-collapse:collapse;font-size:14px}
      .cs-tbl th{font-size:12.5px;color:var(--ink2);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line)}
      .cs-tbl td{padding:8px;border-bottom:1px solid var(--line2);vertical-align:top}.cs-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
      .cs-tbl .acts{text-align:right;white-space:nowrap}.cs-tbl .acts .btn{padding:4px 9px;font-size:13px;min-height:0;margin-left:4px}
      .cs-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
      .cs-msg{width:100%;min-height:170px;font:inherit;white-space:pre-wrap}
      .cs-pontos{margin:0;padding-left:20px}.cs-pontos li{margin-bottom:8px}
      .cs-chart svg{width:100%;height:220px;display:block}
      .cs-fbar{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:12px;align-items:end}
      .cs-fbar label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink2);font-weight:600}
      .cs-pgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}
      .cs-pbox{border:1px solid var(--line2);border-radius:8px;padding:12px;background:#FAFBFD}
      .cs-pbox h4{margin:0 0 8px;font-size:13.5px;line-height:1.35;color:var(--ink)}
      .cs-bar-bg{height:8px;background:#E6E9EE;border-radius:99px;overflow:hidden;margin:6px 0}
      .cs-bar-fg{height:100%;background:var(--blue);border-radius:99px}
      .cs-opt-row{display:flex;align-items:center;gap:8px;font-size:12.5px;margin-top:5px}
      .cs-opt-row .lbl{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .cs-opt-row .track{width:90px;height:6px;background:#E6E9EE;border-radius:99px;overflow:hidden}
      .cs-opt-row .fill{height:100%;background:#1F6FEB;border-radius:99px}
      .cs-resp-item{border:1px solid var(--line2);border-radius:8px;padding:12px 14px;margin-bottom:10px;background:#fff}
      .cs-resp-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
      .cs-resp-qa{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--line2);font-size:13px}
      .cs-resp-qa div{background:#F8FAFC;padding:6px 8px;border-radius:6px;border:1px solid var(--line2)}
      .cs-resp-qa small{display:block;color:var(--ink2);font-size:11.5px;margin-bottom:2px}`;
    document.head.appendChild(st);
  }

  // ======================================================================
  // NPS PESQUISA
  // ======================================================================
  const ST_P = { rascunho: "Rascunho", perguntas_em_aprovacao: "Perguntas em aprovação", aprovada: "Aprovada", formulario_gerado: "Formulário pronto", enviada: "Enviada" };
  const TIPOS_Q = { nps: "NPS / Nota (0 a 10)", escala: "Escala (1 a 5)", multipla: "Múltipla escolha", aberta: "Aberta / Texto" };

  function nps(ctx) {
    const el = ctx.el; let base = null, sel = null, novo = false, vincularForm = false;
    el.innerHTML = `<div class="cs-h"><div><h2>NPS Pesquisa</h2><div class="cs-sub">Gerencie a pesquisa oficial do Google Forms ou crie/vincule novas pesquisas de satisfação.</div></div><span class="sp"></span>
      <button class="btn" type="button" id="nVincular">🔗 Vincular Google Forms</button>
      <button class="btn primary" type="button" id="nNova">Nova pesquisa</button></div>
      <div class="cs-lay"><div class="cs-list" id="nLista"></div><div id="nEd"></div></div>`;
    const $ = s => el.querySelector(s);
    const etapa = s => base.status.indexOf(s);
    async function carregar(manter) {
      try { base = await api("inicio"); } catch (e) { $("#nEd").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      if (!manter) sel = (sel && base.pesquisas.find(p => p.id === sel.id)) || base.pesquisas[0] || null;
      else if (sel) sel = base.pesquisas.find(p => p.id === sel.id) || sel;
      lista(); editor();
    }
    function lista() {
      $("#nLista").innerHTML = base.pesquisas.length ? base.pesquisas.map(p => `<button type="button" class="cs-it${!novo && !vincularForm && sel && sel.id === p.id ? " on" : ""}" data-id="${esc(p.id)}">
        <b>${esc(p.titulo || p.clienteNome || "Pesquisa Geral")}</b>
        <span class="cs-sub">${esc(p.clienteNome || "Todos os clientes")} · ${mesBr(p.mes)}</span>
        <div style="margin-top:4px"><span class="st ${p.status}">${ST_P[p.status] || p.status}</span>${p.perguntas?.length ? ` <span class="cs-sub">(${p.perguntas.length} perg.)</span>` : ""}</div></button>`).join("")
        : `<div class="empty" style="padding:14px">Nenhuma pesquisa ainda.</div>`;
    }
    function passo(n, titulo, feito, travado, corpo) {
      return `<div class="cs-card${feito ? " ok" : ""}${travado ? " lock" : ""}"><h3><span class="cs-n">${feito ? "✓" : n}</span>${titulo}</h3>${corpo}</div>`;
    }
    function editor() {
      if (vincularForm) {
        const cli = base.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
        $("#nEd").innerHTML = `<div class="cs-card" style="border-color:var(--blue)">
          <h3>🔗 Vincular formulário do Google Forms (atual ou futuro)</h3>
          <p class="cs-sub" style="margin-top:0">Cole o link público do Google Forms (<code>docs.google.com/forms/.../viewform</code> ou <code>forms.gle/...</code>). O sistema lê automaticamente o título, todas as perguntas, escalas e opções para usar nas análises e mensagens de WhatsApp.</p>
          <div class="cs-grid">
            <label class="full">Link do formulário no Google Forms *<input id="vfLink" placeholder="https://docs.google.com/forms/d/e/.../viewform"></label>
            <label class="full">Link da Planilha de Respostas no Google Sheets (opcional — permite sincronizar respostas com 1 clique)<input id="vfPlan" placeholder="https://docs.google.com/spreadsheets/d/.../edit"></label>
            <label>Título (opcional — lido do Forms se vazio)<input id="vfTit" placeholder="Ex.: NPS Quinze — 2º Trimestre"></label>
            <label>Mês de referência<input id="vfMes" type="month" value="${mesAtual()}"></label>
            <label>Escopo / Cliente<select id="vfCli"><option value="">Todos os clientes (Pesquisa Geral)</option>${cli}</select></label>
          </div>
          <div class="cs-bar">
            <button class="btn primary" type="button" data-a="importar_form">Importar formulário e perguntas</button>
            <button class="btn" type="button" data-a="cancelar_vf">Cancelar</button>
            <span class="cs-sub" id="mVf"></span>
          </div>
        </div>`;
        return;
      }
      if (!sel && !novo) { $("#nEd").innerHTML = `<div class="cs-card"><p class="cs-sub" style="margin:0">Escolha uma pesquisa na lista ao lado, clique em “🔗 Vincular Google Forms” ou em “Nova pesquisa”.</p></div>`; return; }
      const p = sel || { status: "rascunho", mes: mesAtual(), perguntas: [] };
      const e = etapa(p.status);
      const cli = base.clientes.map(c => `<option value="${esc(c.id)}"${c.id === p.clienteId ? " selected" : ""}>${esc(c.nome)}</option>`).join("");
      const bloq1 = e > etapa("perguntas_em_aprovacao");
      let html = passo(1, "Identificação, tom de voz e objetivo", !!p.id, false, `<div class="cs-grid">
        <label class="full">Título da pesquisa<input id="pTit" placeholder="Ex.: NPS Quinze — Pesquisa de Satisfação" value="${esc(p.titulo || "")}"${bloq1 ? " disabled" : ""}></label>
        <label>Cliente / Escopo<select id="pCli"${bloq1 ? " disabled" : ""}><option value="">Todos os clientes (Pesquisa Geral)</option>${cli}</select></label>
        <label>Mês de referência<input id="pMes" type="month" value="${esc(p.mes || "")}"${bloq1 ? " disabled" : ""}></label>
        <label class="full">Tom de voz da pesquisa<textarea id="pTom" rows="2" placeholder="Ex.: próximo, leve e direto"${bloq1 ? " disabled" : ""}>${esc(p.tom || "")}</textarea></label>
        <label class="full">O que o levantamento do mês quer descobrir (pode colar texto)<textarea id="pObj" rows="3"${bloq1 ? " disabled" : ""}>${esc(p.objetivo || "")}</textarea></label></div>
        ${bloq1 ? `<div class="cs-bar"><span class="cs-sub">Pesquisa configurada e aprovada.</span><span style="flex:1"></span>${p.id && p.id !== "form_nps_quinze_oficial" ? `<button class="btn" type="button" data-a="excluir">Excluir pesquisa</button>` : ""}<span class="cs-sub" id="m1"></span></div>` : `<div class="cs-bar"><button class="btn primary" type="button" data-a="salvar">${p.id ? "Salvar alterações" : "Salvar e seguir"}</button>
        ${p.id && p.id !== "form_nps_quinze_oficial" ? `<span style="flex:1"></span><button class="btn" type="button" data-a="excluir">Excluir pesquisa</button>` : ""}<span class="cs-sub" id="m1"></span></div>`}`);
      if (p.id) {
        html += passo(2, "Briefing e estrutura de perguntas", e >= etapa("perguntas_em_aprovacao"), bloq1, `
          ${p.briefing ? `<label class="cs-sub" style="display:block">Briefing${p.origemPerguntas === "ia" ? " (gerado por IA)" : ""}<textarea id="pBrief" rows="3" style="width:100%"${bloq1 ? " disabled" : ""}>${esc(p.briefing)}</textarea></label>` : `<p class="cs-sub" style="margin-top:0">A IA monta um briefing curto e propõe até ${base.maxPerguntas} perguntas (a NPS de 0 a 10 é obrigatória), ou você pode usar o modelo padrão da Quinze.</p>`}
          ${bloq1 ? "" : `${base.ia ? "" : `<div class="note warn">A IA ainda não está ligada (falta a chave OPENAI_API_KEY na Vercel). Use as perguntas-modelo ou vincule um Google Forms.</div>`}
          <div class="cs-bar"><button class="btn primary" type="button" data-a="ia"${base.ia ? "" : " disabled"}>${p.briefing ? "Gerar de novo com IA" : "Gerar briefing com IA"}</button>
          <button class="btn" type="button" data-a="modelo">Usar perguntas-modelo da Quinze</button><span class="cs-sub" id="m2"></span></div>`}`);
        html += passo(3, `Perguntas da pesquisa (${(p.perguntas || []).length})`, e >= etapa("aprovada"), e < etapa("perguntas_em_aprovacao"), e < etapa("perguntas_em_aprovacao") ? `<p class="cs-sub">Gere o briefing ou carregue o modelo primeiro.</p>` : `
          <div id="pQs">${(p.perguntas || []).map((q, i) => `<div class="cs-q" data-i="${i}" data-escmax="${esc(q.escalaMax || "")}">
            <select data-k="tipo"${bloq1 ? " disabled" : ""}>${Object.entries(TIPOS_Q).map(([k, v]) => `<option value="${k}"${k === q.tipo ? " selected" : ""}>${v}</option>`).join("")}</select>
            <textarea data-k="texto" rows="1"${bloq1 ? " disabled" : ""}>${esc(q.texto)}</textarea>
            ${bloq1 ? "<span></span>" : `<button class="btn" type="button" data-a="rmq" title="Remover">✕</button>`}
            ${q.tipo === "multipla" ? `<input class="op" data-k="opcoes" placeholder="Opções separadas por ;" value="${esc((q.opcoes || []).join("; "))}"${bloq1 ? " disabled" : ""}>` : ""}</div>`).join("")}</div>
          ${bloq1 ? `<p class="cs-sub">Perguntas aprovadas${p.aprovadoPor?.nome ? ` por ${esc(p.aprovadoPor.nome)}` : ""}${p.aprovadoEm ? ` em ${brHora(p.aprovadoEm)}` : ""}.</p>` : `<div class="cs-bar"><button class="btn" type="button" data-a="addq"${(p.perguntas || []).length >= base.maxPerguntas ? " disabled" : ""}>+ Pergunta</button>
          <button class="btn" type="button" data-a="salvarq">Salvar alterações</button><button class="btn primary" type="button" data-a="aprovar">Aprovar perguntas</button><span class="cs-sub" id="m3"></span></div>`}`);
        html += passo(4, "Formulário Google Forms e Planilha de Respostas", e >= etapa("formulario_gerado"), e < etapa("aprovada"), e < etapa("aprovada") ? `<p class="cs-sub">Aprove as perguntas para seguir.</p>` : `
          ${p.formularioUrl ? `<div class="cs-bar" style="margin-top:0;margin-bottom:10px">
            <a class="btn primary" href="${esc(p.formularioUrl)}" target="_blank" rel="noopener">Abrir formulário (link de resposta) ↗</a>
            ${p.formularioEdicao ? `<a class="btn" href="${esc(p.formularioEdicao)}" target="_blank" rel="noopener">Editar no Google Forms</a>` : ""}
            <button class="btn" type="button" data-a="reler_form" title="Reler perguntas diretamente do link do Google Forms">🔄 Atualizar estrutura do Forms</button>
          </div>` : `<div class="cs-bar" style="margin-top:0"><button class="btn primary" type="button" data-a="form"${base.google ? "" : " disabled"}>Gerar formulário automaticamente</button>${base.google ? `<span class="cs-sub">Cria no Google Forms com as perguntas aprovadas.</span>` : `<span class="cs-sub">Ou cole abaixo o link de um formulário já criado no Google Forms:</span>`}<span class="cs-sub" id="m4f"></span></div>`}
          ${p.avisoForm ? `<div class="note warn" style="margin-top:10px">${esc(p.avisoForm)}</div>` : ""}
          <div class="cs-grid" style="margin-top:10px">
            <label class="full">Link público do formulário (Google Forms)<input id="pLink" placeholder="https://docs.google.com/forms/d/e/.../viewform" value="${esc(p.formularioUrl || "")}"></label>
            <label class="full">Link da Planilha de Respostas (Google Sheets vinculado ao Forms — opcional, permite sincronização direta)<input id="pPlan" placeholder="https://docs.google.com/spreadsheets/d/.../edit" value="${esc(p.planilhaUrl || "")}"></label>
          </div>
          <div class="cs-bar"><button class="btn" type="button" data-a="link">Salvar links do formulário / planilha</button><span class="cs-sub" id="m4"></span></div>
          <p class="cs-sub" style="margin:8px 0 0">${p.respostasSincronizadasEm ? `${p.respostasNoForm || 0} resposta(s) sincronizada(s) · última leitura em ${brHora(p.respostasSincronizadasEm)}.` : "Você também pode sincronizar ou importar respostas pela aba “NPS Média”."}</p>`);
        html += passo(5, "Mensagem de WhatsApp (com link personalizado por cliente)", p.status === "enviada", e < etapa("formulario_gerado"), e < etapa("formulario_gerado") ? `<p class="cs-sub">Salve o link do formulário para gerar a mensagem.</p>` : `
          <div class="cs-grid"><label>Cliente para envio (pré-preenche Nome da Empresa e Atendimento no link do Forms)<select id="pMsgCli"><option value="">Geral / Sem personalizar</option>${base.clientes.map(c => `<option value="${esc(c.nome)}"${c.id === p.clienteId ? " selected" : ""}>${esc(c.nome)}${c.atendimento ? ` (${esc(c.atendimento)})` : ""}</option>`).join("")}</select></label></div>
          <textarea class="cs-msg" id="pMsg" style="margin-top:10px"></textarea>
          <div class="cs-bar"><button class="btn primary" type="button" data-a="copiar">Copiar mensagem</button>${p.status === "enviada" ? `<span class="cs-sub">Marcada como enviada em ${brHora(p.enviadaEm)}.</span>` : `<span class="cs-sub">Ao copiar, a pesquisa é marcada como enviada.</span>`}</div>`);
      }
      $("#nEd").innerHTML = html;
      if (p.id && e >= etapa("formulario_gerado")) mensagem();
      const mc = $("#pMsgCli"); if (mc) mc.onchange = mensagem;
    }
    async function mensagem() {
      try { const j = await api("pesquisa.mensagem", { id: sel.id, hora: new Date().getHours(), clienteNome: $("#pMsgCli")?.value || "" }); $("#pMsg").value = j.mensagem; } catch (e) { $("#pMsg").value = e.message; }
    }
    const lerPerguntas = () => [...el.querySelectorAll(".cs-q")].map(r => ({
      tipo: r.querySelector('[data-k="tipo"]').value,
      texto: r.querySelector('[data-k="texto"]').value,
      escalaMax: r.dataset.escmax ? Number(r.dataset.escmax) : undefined,
      opcoes: (r.querySelector('[data-k="opcoes"]')?.value || "").split(";").map(s => s.trim()).filter(Boolean)
    }));
    const msg = (id, t) => { const m = $("#" + id); if (m) m.textContent = t; };
    let armado = false;
    el.addEventListener("click", async ev => {
      const it = ev.target.closest(".cs-it");
      if (it) { sel = base.pesquisas.find(p => p.id === it.dataset.id); novo = false; vincularForm = false; armado = false; lista(); editor(); return; }
      const a = ev.target.dataset.a; if (!a) return;
      const b = ev.target;
      try {
        if (a === "cancelar_vf") { vincularForm = false; lista(); editor(); return; }
        if (a === "importar_form") {
          b.disabled = true; msg("mVf", "Lendo perguntas do Google Forms…");
          const j = await api("pesquisa.importar_form", {
            link: $("#vfLink").value,
            planilhaUrl: $("#vfPlan").value,
            titulo: $("#vfTit").value,
            mes: $("#vfMes").value,
            clienteId: $("#vfCli").value
          });
          sel = j.pesquisa; vincularForm = false; novo = false;
          ctx.toast(`Formulário vinculado (${j.perguntasDetectadas || sel.perguntas?.length || 0} perguntas detectadas)`);
          return carregar(true);
        }
        if (a === "reler_form") {
          b.disabled = true; msg("m4", "Relendo estrutura do Google Forms…");
          const j = await api("pesquisa.importar_form", {
            id: sel.id,
            link: $("#pLink")?.value || sel.formularioUrl,
            planilhaUrl: $("#pPlan")?.value || sel.planilhaUrl,
            titulo: sel.titulo,
            mes: sel.mes,
            clienteId: sel.clienteId
          });
          sel = j.pesquisa; ctx.toast("Estrutura do formulário atualizada");
          return carregar(true);
        }
        if (a === "salvar") {
          msg("m1", "Salvando…");
          const j = await api("pesquisa.salvar", { id: sel?.id, titulo: $("#pTit")?.value, clienteId: $("#pCli").value, mes: $("#pMes").value, tom: $("#pTom").value, objetivo: $("#pObj").value });
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
        if (a === "link") {
          msg("m4", "Salvando e inspecionando link…");
          const j = await api("pesquisa.link", { id: sel.id, link: $("#pLink").value, planilhaUrl: $("#pPlan")?.value || "" });
          sel = j.pesquisa; ctx.toast("Links salvos"); return carregar(true);
        }
        if (a === "copiar") {
          try { await navigator.clipboard.writeText($("#pMsg").value); } catch { $("#pMsg").select(); document.execCommand && document.execCommand("copy"); }
          ctx.toast("Mensagem copiada");
          if (sel.status !== "enviada") { const j = await api("pesquisa.enviada", { id: sel.id }); sel = j.pesquisa; return carregar(true); }
        }
      } catch (e) {
        b.disabled = false;
        const alvo = { salvar: "m1", excluir: "m1", ia: "m2", modelo: "m2", salvarq: "m3", aprovar: "m3", link: "m4", form: "m4f", importar_form: "mVf", reler_form: "m4" }[a];
        if (alvo && $("#" + alvo)) msg(alvo, e.message); else ctx.toast(e.message);
        if (a === "aprovar") carregar(true);
      }
    });
    $("#nNova").onclick = () => { sel = null; novo = true; vincularForm = false; lista(); editor(); };
    $("#nVincular").onclick = () => { vincularForm = true; novo = false; lista(); editor(); };
    return () => carregar();
  }

  // ======================================================================
  // NPS MÉDIA E RESULTADOS DAS PESQUISAS
  // ======================================================================
  const PERFIL_LBL = { promotor: "Promotor (9–10)", neutro: "Neutro (7–8)", detrator: "Detrator (0–6)" };
  const perfilNota = n => (n >= 9 ? "promotor" : n >= 7 ? "neutro" : "detrator");

  function npsMedia(ctx) {
    const el = ctx.el; let dados = null, painelAberto = null; // 'importar' | 'manual' | null
    const ano = new Date().getFullYear();
    el.innerHTML = `<div class="cs-h"><div><h2>NPS Média e Resultados</h2><div class="cs-sub">Consolidação das respostas do Google Forms e pesquisas futuras · NPS = % promotores (9–10) − % detratores (0–6).</div></div><span class="sp"></span>
      <button class="btn" type="button" id="mSync">🔄 Sincronizar Forms / Planilha</button>
      <button class="btn" type="button" id="mBtnImp">📥 Importar respostas (Planilha / CSV)</button>
      <button class="btn primary" type="button" id="mBtnMan">➕ Registrar resposta</button></div>
      <div id="mSyncMsg" class="cs-sub" style="margin:-6px 0 10px"></div>
      <div id="mPainel"></div>
      <div class="cs-fbar">
        <label>Pesquisa / Formulário<select id="mPesq"><option value="">Todas as pesquisas</option></select></label>
        <label>Cliente<select id="mCli"><option value="">Todos os clientes</option></select></label>
        <label>Atendimento<select id="mAtend"><option value="">Todo o time</option></select></label>
        <label>Classificação NPS<select id="mPerf"><option value="">Todas (Promotores, Neutros e Detratores)</option><option value="promotor">Promotores (9 a 10)</option><option value="neutro">Neutros (7 a 8)</option><option value="detrator">Detratores (0 a 6)</option></select></label>
        <label>De<input type="month" id="mDe" value="${ano}-01"></label>
        <label>Até<input type="month" id="mAte" value="${mesAtual()}"></label>
        <div><button class="btn" type="button" id="mLimpar" style="width:100%">Limpar filtros</button></div>
      </div>
      <div id="mAviso"></div>
      <div class="cs-kpis" id="mKpis"></div>
      <div class="cs-card" id="mCardPerg"><h3>📊 Resultados por pergunta do formulário <span class="cs-sub" id="mPergSub" style="font-weight:400"></span></h3><div id="mPergBox"></div></div>
      <div class="cs-card"><h3>🏢 Desempenho por cliente <span class="cs-sub" style="font-weight:400">(clique em “Filtrar” para isolar um cliente)</span></h3>
        <div class="cs-wrap" style="border:0"><table class="cs-tbl"><thead><tr><th>Cliente</th><th>Atendimento</th><th class="num">Respostas</th><th class="num">Nota Serviços</th><th class="num">Média NPS</th><th class="num">Score NPS</th><th class="num">Prom.</th><th class="num">Neut.</th><th class="num">Detr.</th><th>Última resp.</th><th></th></tr></thead><tbody id="mCliRows"></tbody></table></div></div>
      <div class="cs-card cs-chart"><h3>📈 Evolução mensal</h3><div id="mChart"></div></div>
      <div class="cs-card"><h3>💡 Pontos de melhoria e síntese <span class="sp" style="flex:1"></span><button class="btn" type="button" id="mRel">Gerar relatório com IA</button></h3><div id="mRelBox"></div></div>
      <div class="cs-card"><h3>🗂️ Respostas individuais dos clientes <span class="cs-sub" id="mRespCount" style="font-weight:400"></span></h3><div id="mRespList"></div></div>`;

    const $ = s => el.querySelector(s);
    const filtro = () => ({
      de: $("#mDe").value,
      ate: $("#mAte").value,
      cliente: $("#mCli").value,
      pesquisa: $("#mPesq").value,
      atendimento: $("#mAtend").value,
      perfil: $("#mPerf").value
    });

    function popularSelect(selEl, opcoes, valorAtual, padraoTxt) {
      const v = valorAtual ?? selEl.value;
      selEl.innerHTML = `<option value="">${padraoTxt}</option>` + opcoes.map(([k, l]) => `<option value="${esc(k)}"${k === v ? " selected" : ""}>${esc(l)}</option>`).join("");
    }

    async function carregar() {
      const f = filtro();
      try { dados = await api("respostas&" + new URLSearchParams(f)); } catch (e) { $("#mAviso").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      popularSelect($("#mPesq"), (dados.pesquisas || []).map(p => [p.id, `${p.titulo || "Pesquisa"} (${mesBr(p.mes)})`]), f.pesquisa, "Todas as pesquisas");
      popularSelect($("#mCli"), (dados.clientes || []).map(c => [c.id, `${c.nome}${c.respostas ? ` (${c.respostas})` : ""}`]), f.cliente, "Todos os clientes");
      popularSelect($("#mAtend"), (dados.atendimentos || []).map(a => [a, a]), f.atendimento, "Todo o time");
      $("#mAviso").innerHTML = "";

      const t = dados.total;
      $("#mKpis").innerHTML = `
        <div class="cs-kpi"><b>${t.n}</b><span>Respostas</span></div>
        <div class="cs-kpi"><b>${num1(t.nps)}</b><span>Score NPS (−100 a 100)</span></div>
        <div class="cs-kpi"><b>${num1(t.media)}</b><span>Média Recomendação (0–10)</span></div>
        <div class="cs-kpi"><b>${num1(t.mediaServicos)}</b><span>Nota Serviços (0–10)</span></div>
        <div class="cs-kpi"><b style="color:#1B6B3A">${t.promotores}</b><span>Promotores (9–10)</span></div>
        <div class="cs-kpi"><b style="color:#8A5A00">${t.neutros}</b><span>Neutros (7–8)</span></div>
        <div class="cs-kpi"><b style="color:#A12020">${t.detratores}</b><span>Detratores (0–6)</span></div>`;

      renderPerguntas(dados.porPergunta || []);
      renderPorCliente(dados.porCliente || [], f.cliente);
      grafico(dados.porMes || []);
      renderRelatorio(dados);
      renderRespostasIndividuais(dados.listaRespostas || []);
      if (painelAberto) renderPainel();
    }

    function renderPerguntas(lista) {
      $("#mPergSub").textContent = lista.length ? `(${lista.reduce((s, q) => Math.max(s, q.n || 0), 0)} resposta(s) analisada(s))` : "";
      if (!lista.length) {
        $("#mPergBox").innerHTML = `<p class="cs-sub" style="margin:0">Ainda não há respostas suficientes neste filtro para consolidar por pergunta.</p>`;
        return;
      }
      $("#mPergBox").innerHTML = `<div class="cs-pgrid">${lista.map(q => {
        if (q.tipo === "escala" || q.tipo === "nps") {
          const max = q.escalaMax || 5;
          const pct = q.media != null ? Math.max(0, Math.min(100, (q.media / max) * 100)) : 0;
          const cor = pct >= 80 ? "#1B8A4B" : pct >= 60 ? "#1F6FEB" : pct >= 40 ? "#E0A100" : "#C93B3B";
          return `<div class="cs-pbox">
            <h4>${esc(q.pergunta)}</h4>
            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:13px">
              <span>Média: <b style="font-size:16px">${num1(q.media)}</b> <span class="cs-sub">/ ${max}</span></span>
              <span class="cs-sub">${q.n} resp.</span>
            </div>
            <div class="cs-bar-bg"><div class="cs-bar-fg" style="width:${pct.toFixed(1)}%;background:${cor}"></div></div>
          </div>`;
        }
        return `<div class="cs-pbox">
          <h4>${esc(q.pergunta)}</h4>
          ${(q.opcoes || []).map(o => `<div class="cs-opt-row" title="${esc(o.valor)}: ${o.count} (${o.pct}%)">
              <span class="lbl">${esc(o.valor)}</span>
              <div class="track"><div class="fill" style="width:${o.pct}%"></div></div>
              <b style="min-width:52px;text-align:right">${o.count} <span class="cs-sub">(${o.pct}%)</span></b>
            </div>`).join("")}
        </div>`;
      }).join("")}</div>`;
    }

    function renderPorCliente(lista, cliFiltro) {
      $("#mCliRows").innerHTML = lista.length ? lista.map(c => {
        const cid = c.clienteId || c.chave;
        const stCls = c.nps >= 50 ? "promotor" : c.nps >= 0 ? "neutro" : "detrator";
        const ativo = cliFiltro && (cliFiltro === cid || cliFiltro === c.nome);
        return `<tr style="${ativo ? "background:var(--blue-soft)" : ""}">
          <td><b>${esc(c.nome)}</b></td>
          <td>${esc(c.atendimento || "—")}</td>
          <td class="num">${c.n}</td>
          <td class="num">${num1(c.mediaServicos)}</td>
          <td class="num">${num1(c.media)}</td>
          <td class="num"><span class="st ${stCls}">${num1(c.nps)}</span></td>
          <td class="num">${c.promotores}</td>
          <td class="num">${c.neutros}</td>
          <td class="num">${c.detratores}</td>
          <td>${br(c.ultimaEm) || "—"}</td>
          <td class="acts"><button class="btn" type="button" data-fcli="${esc(cid)}">${ativo ? "Mostrar todos" : "Filtrar"}</button></td>
        </tr>`;
      }).join("") : `<tr><td colspan="11" class="empty">Sem respostas no período ou com os filtros selecionados. Use “📥 Importar respostas” ou “➕ Registrar resposta” acima.</td></tr>`;
    }

    function renderRelatorio(dados) {
      const r = dados.relatorio;
      $("#mRel").textContent = r ? "Gerar de novo com IA" : "Gerar relatório com IA";
      $("#mRel").disabled = !dados.ia;
      const abertasHtml = dados.abertas?.length ? `<div style="margin-top:10px"><b style="font-size:13px">Comentários e sugestões abertas (${dados.abertas.length}):</b><ul style="margin:6px 0 0;padding-left:18px;font-size:13.5px">${dados.abertas.slice(0, 15).map(a => `<li style="margin-bottom:4px"><b>${esc(a.cliente || "Cliente")}</b>${a.atendimento ? ` (${esc(a.atendimento)})` : ""}: ${esc(a.valor)}</li>`).join("")}</ul></div>` : "";
      $("#mRelBox").innerHTML = (dados.ia ? "" : `<div class="note warn" style="margin-bottom:8px">A IA ainda não está ligada (falta a chave OPENAI_API_KEY na Vercel). Abaixo estão os comentários abertos recebidos.</div>`)
        + (r ? `<ol class="cs-pontos">${r.pontos.map(p => `<li><b>${esc(p.titulo)}</b><br><span class="cs-sub" style="font-size:14px">${esc(p.detalhe)}</span></li>`).join("")}</ol>
          <p class="cs-sub">Gerado em ${brHora(r.geradoEm)} por ${esc(r.geradoPor?.nome || "")}, a partir de ${r.respostasAnalisadas} respostas.</p>`
          : `<p class="cs-sub" style="margin:0">${dados.abertas.length ? `${dados.abertas.length} comentário(s) aberto(s) no período.` : "Sem comentários abertos no período."}</p>`)
        + abertasHtml;
    }

    function renderRespostasIndividuais(lista) {
      $("#mRespCount").textContent = lista.length ? `(${lista.length} exibida${lista.length > 1 ? "s" : ""})` : "";
      if (!lista.length) {
        $("#mRespList").innerHTML = `<p class="cs-sub" style="margin:0">Nenhuma resposta encontrada para os filtros selecionados.</p>`;
        return;
      }
      $("#mRespList").innerHTML = lista.map(r => {
        const pCls = perfilNota(r.nota);
        const det = (r.respostas || []).filter(d => d.valor && !/nome da sua empresa/i.test(d.pergunta));
        return `<div class="cs-resp-item" data-rid="${esc(r.id)}">
          <div class="cs-resp-head">
            <div>
              <b style="font-size:15px">${esc(r.clienteNome)}</b>
              ${r.atendimento ? `<span class="st" style="margin-left:6px">Atend.: ${esc(r.atendimento)}</span>` : ""}
              <span class="st ${pCls}" style="margin-left:6px">NPS: ${r.nota != null ? r.nota : "—"} · ${PERFIL_LBL[pCls] || ""}</span>
              ${r.notaServicos != null ? `<span class="st" style="margin-left:6px">Serviços: ${r.notaServicos}/10</span>` : ""}
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <span class="cs-sub">${brHora(r.recebidaEm) || mesBr(r.mes)} · ${esc(r.pesquisaTitulo || "")}</span>
              ${r.clienteId ? `<button class="btn" type="button" data-fcli="${esc(r.clienteId)}" style="padding:3px 8px;font-size:12px">Filtrar cliente</button>` : ""}
              <button class="btn" type="button" data-delresp="${esc(r.id)}" title="Excluir resposta" style="padding:3px 8px;font-size:12px">✕</button>
            </div>
          </div>
          ${r.comentario ? `<div style="margin-top:8px;font-size:13.5px;background:#FFFDF5;border-left:3px solid #E0A100;padding:6px 10px;border-radius:4px"><b>Sugestão / Comentário:</b> ${esc(r.comentario)}</div>` : ""}
          ${det.length ? `<details style="margin-top:8px"><summary class="cs-sub" style="cursor:pointer;font-weight:600;color:var(--blue)">Ver todas as respostas do formulário (${det.length} itens)</summary>
            <div class="cs-resp-qa">${det.map(d => `<div><small>${esc(d.pergunta)}</small><b>${esc(d.valor)}</b></div>`).join("")}</div>
          </details>` : ""}
        </div>`;
      }).join("");
    }

    function renderPainel() {
      if (!painelAberto || !dados) { $("#mPainel").innerHTML = ""; return; }
      const pesqOpts = (dados.pesquisas || []).map(p => `<option value="${esc(p.id)}">${esc(p.titulo || "Pesquisa")} (${mesBr(p.mes)})</option>`).join("");
      if (painelAberto === "importar") {
        $("#mPainel").innerHTML = `<div class="cs-card" style="border-color:var(--blue)">
          <h3>📥 Importar respostas do Google Forms (Planilha Google Sheets ou CSV)</h3>
          <p class="cs-sub" style="margin-top:0">No Google Forms, clique em <b>Respostas → Ver no Planilhas</b> (ou <b>Fazer o download das respostas .csv</b>). Você pode colar o link da planilha pública, enviar o arquivo <code>.csv</code> ou simplesmente copiar e colar as linhas da planilha abaixo. O sistema identifica o cliente automaticamente pelo nome da empresa!</p>
          <div class="cs-grid">
            <label>Pesquisa de destino<select id="impPesq">${pesqOpts}</select></label>
            <label>Enviar arquivo .CSV / .TSV do Google Forms<input type="file" id="impFile" accept=".csv,.tsv,.txt"></label>
            <label class="full">Ou Link da Planilha do Google Sheets (compartilhada para leitura)<input id="impUrl" placeholder="https://docs.google.com/spreadsheets/d/.../edit"></label>
            <label class="full">Ou cole aqui o conteúdo copiado da Planilha / CSV (com a linha de cabeçalho)<textarea id="impCsv" rows="5" placeholder="Carimbo de data/hora\tQual o nome da sua empresa?\tQuem é o profissional da Quinze que atende sua conta? ..."></textarea></label>
          </div>
          <div class="cs-bar">
            <button class="btn primary" type="button" id="impOk">Importar respostas agora</button>
            <button class="btn" type="button" id="impCancel">Fechar</button>
            <span class="cs-sub" id="impMsg"></span>
          </div>
        </div>`;
        const fInput = $("#impFile");
        if (fInput) fInput.onchange = ev => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => { $("#impCsv").value = String(reader.result || ""); $("#impMsg").textContent = `Arquivo "${f.name}" carregado. Clique em "Importar respostas agora".`; };
          reader.readAsText(f, "utf-8");
        };
        $("#impCancel").onclick = () => { painelAberto = null; renderPainel(); };
        $("#impOk").onclick = async () => {
          $("#impOk").disabled = true; $("#impMsg").textContent = "Importando e vinculando clientes…";
          try {
            const j = await api("respostas.importar", {
              pesquisaId: $("#impPesq").value,
              planilhaUrl: $("#impUrl").value,
              texto: $("#impCsv").value
            });
            ctx.toast(`${j.novas} nova(s) resposta(s) importada(s) (de ${j.lidas} lida(s))`);
            painelAberto = null; renderPainel(); carregar();
          } catch (e) {
            $("#impOk").disabled = false; $("#impMsg").textContent = e.message;
          }
        };
        return;
      }

      if (painelAberto === "manual") {
        const pId = $("#mPesq").value || dados.pesquisas?.[0]?.id || "form_nps_quinze_oficial";
        const pesq = (dados.pesquisas || []).find(x => x.id === pId) || dados.pesquisas?.[0] || { id: "form_nps_quinze_oficial", perguntas: [] };
        const cliOpts = (dados.clientes || []).map(c => `<option value="${esc(c.id)}" data-nome="${esc(c.nome)}">${esc(c.nome)}</option>`).join("");
        const qs = (pesq.perguntas || []).filter(q => !/nome da sua empresa|profissional.*atende/i.test(q.texto));
        $("#mPainel").innerHTML = `<div class="cs-card" style="border-color:var(--blue)">
          <h3>➕ Registrar resposta de pesquisa manualmente</h3>
          <div class="cs-grid">
            <label>Pesquisa / Formulário<select id="manPesq">${(dados.pesquisas || []).map(p => `<option value="${esc(p.id)}"${p.id === pesq.id ? " selected" : ""}>${esc(p.titulo || "Pesquisa")}</option>`).join("")}</select></label>
            <label>Cliente da Carteira<select id="manCli"><option value="">Outro / Digitar manualmente</option>${cliOpts}</select></label>
            <label>Nome da Empresa *<input id="manNome" placeholder="Ex.: Clínica Exemplo"></label>
            <label>Atendimento responsável<input id="manAtend" placeholder="Ex.: LAÍS, EDUARDO, MARCOS..."></label>
            <label>Data da resposta<input type="date" id="manData" value="${new Date().toISOString().slice(0, 10)}"></label>
            ${qs.map((q, idx) => {
              if (q.tipo === "nps") return `<label>${esc(q.texto)} (0 a 10) *<input type="number" min="0" max="10" id="manNps" data-mq="${idx}" data-mtxt="${esc(q.texto)}" value="10"></label>`;
              if (q.tipo === "escala") return `<label>${esc(q.texto)} (até ${q.escalaMax || 5})<select data-mq="${idx}" data-mtxt="${esc(q.texto)}" data-esc="${q.escalaMax || 5}">${Array.from({ length: (q.escalaMax || 5) + (q.escalaMax === 10 ? 1 : 0) }, (_, i) => (q.escalaMax === 10 ? i : i + 1)).reverse().map(n => `<option value="${n}">${n}</option>`).join("")}</select></label>`;
              if (q.tipo === "multipla") return `<label>${esc(q.texto)}<select data-mq="${idx}" data-mtxt="${esc(q.texto)}">${(q.opcoes || []).map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select></label>`;
              return `<label class="full">${esc(q.texto)}<textarea rows="2" data-mq="${idx}" data-mtxt="${esc(q.texto)}"></textarea></label>`;
            }).join("")}
            ${!qs.some(q => q.tipo === "nps") ? `<label>Nota NPS Recomendação (0 a 10) *<input type="number" min="0" max="10" id="manNps" value="10"></label>` : ""}
          </div>
          <div class="cs-bar">
            <button class="btn primary" type="button" id="manOk">Salvar resposta</button>
            <button class="btn" type="button" id="manCancel">Cancelar</button>
            <span class="cs-sub" id="manMsg"></span>
          </div>
        </div>`;
        $("#manPesq").onchange = () => { $("#mPesq").value = $("#manPesq").value; renderPainel(); };
        $("#manCli").onchange = () => {
          const opt = $("#manCli").selectedOptions?.[0];
          if (opt && opt.value) $("#manNome").value = opt.dataset.nome || "";
        };
        $("#manCancel").onclick = () => { painelAberto = null; renderPainel(); };
        $("#manOk").onclick = async () => {
          $("#manOk").disabled = true; $("#manMsg").textContent = "Salvando…";
          const respostas = [];
          const atendVal = $("#manAtend").value.trim();
          if (atendVal) respostas.push({ pergunta: "Quem é o profissional da Quinze que atende sua conta?", valor: atendVal });
          el.querySelectorAll("[data-mq]").forEach(inp => {
            if (inp.id === "manNps") return;
            const val = String(inp.value || "").trim();
            if (val) respostas.push({ pergunta: inp.dataset.mtxt, valor: val });
          });
          try {
            await api("resposta.registrar", {
              pesquisaId: $("#manPesq").value,
              clienteId: $("#manCli").value,
              clienteNome: $("#manNome").value,
              atendimento: atendVal,
              data: $("#manData").value,
              nota: Number($("#manNps")?.value ?? 10),
              respostas
            });
            ctx.toast("Resposta registrada com sucesso");
            painelAberto = null; renderPainel(); carregar();
          } catch (e) {
            $("#manOk").disabled = false; $("#manMsg").textContent = e.message;
          }
        };
      }
    }

    function grafico(meses) {
      if (!meses.length) { $("#mChart").innerHTML = `<p class="cs-sub">Sem dados no período.</p>`; return; }
      const W = 640, H = 220, L = 40, R = 14, T = 14, B = 34;
      const x = i => L + (meses.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (meses.length - 1));
      const y = v => T + (100 - v) / 200 * (H - T - B);
      const yM = v => T + (10 - v) / 10 * (H - T - B);
      const grade = [-100, -50, 0, 50, 100].map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E6E9EE"/><text x="${L - 6}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="#6B7280">${v}</text>`).join("");
      const linha = (fn, k, cor) => `<polyline fill="none" stroke="${cor}" stroke-width="2.5" points="${meses.map((m, i) => `${x(i)},${fn(m[k] ?? 0)}`).join(" ")}"/>` + meses.map((m, i) => `<circle cx="${x(i)}" cy="${fn(m[k] ?? 0)}" r="4" fill="${cor}"><title>${mesBr(m.chave)}: ${k === "nps" ? "NPS " + num1(m.nps) : "média " + num1(m.media)} (${m.n} resp.)</title></circle>`).join("");
      $("#mChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="NPS por mês">${grade}${linha(y, "nps", "#1F6FEB")}${linha(yM, "media", "#E0A100")}
        ${meses.map((m, i) => `<text x="${x(i)}" y="${H - 12}" font-size="11" text-anchor="middle" fill="#6B7280">${mesBr(m.chave)}</text>`).join("")}</svg>
        <div class="cs-sub"><span style="color:#1F6FEB">●</span> NPS (escala −100 a 100) &nbsp; <span style="color:#E0A100">●</span> Nota média (escala 0 a 10)</div>`;
    }

    ["#mDe", "#mAte", "#mCli", "#mPesq", "#mAtend", "#mPerf"].forEach(s => $(s).addEventListener("change", carregar));
    $("#mLimpar").onclick = () => {
      $("#mPesq").value = ""; $("#mCli").value = ""; $("#mAtend").value = ""; $("#mPerf").value = "";
      $("#mDe").value = `${ano}-01`; $("#mAte").value = mesAtual();
      carregar();
    };
    $("#mSync").onclick = async () => {
      $("#mSync").disabled = true; $("#mSyncMsg").textContent = "Sincronizando respostas dos formulários e planilhas vinculadas…";
      try {
        const j = await api("forms.sync", {});
        $("#mSyncMsg").textContent = `${j.novas} resposta(s) nova(s) lida(s) de ${j.formularios} pesquisa(s)${j.erros?.length ? ` · avisos: ${j.erros.join("; ")}` : " · caso o Forms ainda não tenha planilha pública vinculada, use “📥 Importar respostas”."}`;
      } catch (e) { $("#mSyncMsg").textContent = e.message; }
      $("#mSync").disabled = false; carregar();
    };
    $("#mBtnImp").onclick = () => { painelAberto = painelAberto === "importar" ? null : "importar"; renderPainel(); };
    $("#mBtnMan").onclick = () => { painelAberto = painelAberto === "manual" ? null : "manual"; renderPainel(); };
    $("#mRel").onclick = async () => {
      $("#mRel").disabled = true; $("#mRelBox").insertAdjacentHTML("afterbegin", `<p class="cs-sub" id="mRelEsp">A IA está lendo as respostas…</p>`);
      try { await api("relatorio.gerar", filtro()); ctx.toast("Relatório gerado"); } catch (e) { ctx.toast(e.message); }
      carregar();
    };
    el.addEventListener("click", async ev => {
      const fc = ev.target.closest("[data-fcli]");
      if (fc) {
        const cid = fc.dataset.fcli;
        $("#mCli").value = $("#mCli").value === cid ? "" : cid;
        carregar();
        return;
      }
      const del = ev.target.closest("[data-delresp]");
      if (del) {
        if (!del.dataset.armado) { del.dataset.armado = "1"; del.textContent = "Confirmar?"; return; }
        try { await api("resposta.excluir", { id: del.dataset.delresp }); ctx.toast("Resposta excluída"); carregar(); } catch (e) { ctx.toast(e.message); }
      }
    });
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
