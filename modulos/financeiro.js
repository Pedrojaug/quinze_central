// 06 Financeiro: Contas a receber, Contas a pagar, Fluxo de caixa e Dashboard financeiro (só mestre e gestão).
// Tudo pela rota /api/m?r=fin/... (o servidor confere a permissão; os dados não passam pela sincronização).
(function () {
  if (window.__qzFin) return; window.__qzFin = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const br = iso => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
  const brHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const mesBr = m => (m ? ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][+m.slice(5, 7) - 1] + "/" + m.slice(0, 4) : "");
  const pct = v => (v == null ? "—" : (v > 0 ? "+" : "") + v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%");
  const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  async function api(r, body) {
    const res = await fetch("/api/m?r=fin/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || (res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.")), { code: j.code, status: res.status });
    return j;
  }

  if (!document.getElementById("qzFinCss")) {
    const st = document.createElement("style"); st.id = "qzFinCss";
    st.textContent = `
      .fin-h{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}.fin-h h2{margin:0}.fin-h .sp{flex:1}
      .fin-sub{font-size:12.5px;color:var(--ink2)}
      .fin-nota{background:#EEF4FF;border:1px solid #CFE0FF;color:#1D4F91;border-radius:8px;padding:8px 12px;font-size:13px;margin-bottom:14px}
      .fin-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px}
      .fin-filtros label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink2)}
      .fin-filtros input,.fin-filtros select{min-height:34px;padding:4px 8px;font-size:13px}
      .fin-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px}
      .fin-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
      .fin-kpi b{display:block;font:700 22px/1.1 var(--display);font-variant-numeric:tabular-nums}.fin-kpi span{font-size:12.5px;color:var(--ink2)}
      .fin-kpi em{display:block;font-style:normal;font-size:12px;color:var(--ink2);margin-top:3px}
      .fin-kpi.pos b{color:#1B6B3A}.fin-kpi.neg b{color:#A12020}
      .fin-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:14px}
      .fin-tbl{width:100%;border-collapse:collapse;font-size:13.5px}
      .fin-tbl th{font-size:12px;color:var(--ink2);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line);white-space:nowrap}
      .fin-tbl td{padding:7px 8px;border-bottom:1px solid var(--line2);vertical-align:top}
      .fin-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .fin-tbl tfoot td{font-weight:700;background:#FAFBFD}
      .fin-tbl .acts{white-space:nowrap;text-align:right}.fin-tbl .acts .btn{padding:3px 8px;font-size:12.5px;min-height:0;margin-left:3px}
      .fin-tbl tr.cancelado td{color:#9AA3AE;text-decoration:line-through}.fin-tbl tr.prev td{color:#5A6B85;font-style:italic}
      .st{font-size:12px;padding:2px 8px;border-radius:20px;white-space:nowrap;font-weight:600}
      .st.aberto{background:#E5EFFC;color:#1D4F91}.st.pago{background:#E6F6EC;color:#1B6B3A}.st.atrasado{background:#FDE8E8;color:#A12020}.st.cancelado{background:#EEF0F3;color:#6B7280}
      .fin-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-bottom:14px}
      .fin-card h3{margin:0 0 10px;font-size:15px;display:flex;align-items:center;gap:8px}
      .fin-form{background:var(--card);border:1px solid var(--blue);border-radius:10px;padding:14px 16px;margin-bottom:14px}
      .fin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
      .fin-grid label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--ink2)}.fin-grid .full{grid-column:1/-1}
      .fin-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      .fin-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media(max-width:900px){.fin-2{grid-template-columns:1fr}}
      .fin-barra{height:8px;background:var(--blue);border-radius:4px}
      .fin-chart svg{width:100%;height:240px;display:block}`;
    document.head.appendChild(st);
  }
  const STATUS = { aberto: "Aberto", pago: "Pago", atrasado: "Atrasado", cancelado: "Cancelado" };

  // ======================================================================
  // CONTAS A RECEBER / A PAGAR
  // ======================================================================
  function lancamentos(ctx, tipo) {
    const el = ctx.el, receber = tipo === "receber";
    const quemRot = receber ? "Cliente" : "Fornecedor";
    let d = null;
    el.innerHTML = `<div class="fin-h"><div><h2>${receber ? "Contas a receber" : "Contas a pagar"}</h2><div class="fin-sub">Lançamentos manuais. "Atrasado" = em aberto com vencimento antes de hoje.</div></div><span class="sp"></span>
      <button class="btn" type="button" data-x="log">Log</button><button class="btn" type="button" data-x="cat">Categorias</button><button class="btn primary" type="button" data-x="novo">Novo lançamento</button></div>
      <div data-box="form"></div><div data-box="extra"></div>
      <div class="fin-filtros">
        <label>Vencimento de<input type="date" data-f="de"></label><label>até<input type="date" data-f="ate"></label>
        <label>Competência de<input type="month" data-f="compDe"></label><label>até<input type="month" data-f="compAte"></label>
        <label>Status<select data-f="status"><option value="">Todos</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <label>${quemRot}<select data-f="quem"><option value="">Todos</option></select></label>
        <label>Categoria<select data-f="categoria"><option value="">Todas</option></select></label>
        <button class="btn" type="button" data-x="limpar">Limpar</button></div>
      <div class="fin-wrap"><table class="fin-tbl"><thead><tr><th>Vencimento</th><th>Competência</th><th>Descrição</th><th>${quemRot}</th><th>Categoria</th><th class="num">Valor</th><th>Status</th><th></th></tr></thead>
        <tbody data-box="rows"><tr><td colspan="8" class="empty">Carregando…</td></tr></tbody><tfoot data-box="foot"></tfoot></table></div>`;
    const $ = s => el.querySelector(s), box = n => el.querySelector(`[data-box="${n}"]`), fv = n => el.querySelector(`[data-f="${n}"]`).value;
    const quemDe = l => (receber ? l.clienteNome : l.fornecedor) || "";
    async function carregar() {
      try { d = await api("lancamentos&tipo=" + tipo); } catch (e) { box("rows").innerHTML = `<tr><td colspan="8" class="empty">${esc(e.message)}</td></tr>`; return; }
      const opcoes = (sel, lista) => { const v = sel.value; sel.innerHTML = sel.options[0].outerHTML + lista.map(x => `<option>${esc(x)}</option>`).join(""); sel.value = lista.includes(v) ? v : ""; };
      opcoes(el.querySelector('[data-f="quem"]'), [...new Set(d.lancamentos.map(quemDe).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")));
      opcoes(el.querySelector('[data-f="categoria"]'), [...new Set([...d.categorias, ...d.lancamentos.map(l => l.categoria)])]);
      render();
    }
    function render() {
      const f = { de: fv("de"), ate: fv("ate"), compDe: fv("compDe"), compAte: fv("compAte"), status: fv("status"), quem: fv("quem"), categoria: fv("categoria") };
      const l = d.lancamentos.filter(x => (!f.de || x.vencimento >= f.de) && (!f.ate || x.vencimento <= f.ate) && (!f.compDe || x.competencia >= f.compDe) && (!f.compAte || x.competencia <= f.compAte)
        && (!f.status || x.statusEfetivo === f.status) && (!f.quem || quemDe(x) === f.quem) && (!f.categoria || x.categoria === f.categoria));
      box("rows").innerHTML = l.length ? l.map(x => `<tr data-id="${esc(x.id)}" class="${x.statusEfetivo}">
        <td>${br(x.vencimento)}</td><td>${mesBr(x.competencia)}</td><td><b>${esc(x.descricao)}</b>${x.obs ? `<div class="fin-sub">${esc(x.obs)}</div>` : ""}${x.forma ? `<div class="fin-sub">${esc(x.forma)}</div>` : ""}</td>
        <td>${esc(quemDe(x))}</td><td>${esc(x.categoria)}</td><td class="num">${brl(x.valor)}</td>
        <td><span class="st ${x.statusEfetivo}">${STATUS[x.statusEfetivo]}</span>${x.status === "pago" ? `<div class="fin-sub">em ${br(x.dataPagamento)}</div>` : ""}</td>
        <td class="acts">${x.status === "aberto" ? `<button class="btn" data-a="pagar">Pagar</button>` : ""}${x.status !== "aberto" ? `<button class="btn" data-a="reabrir">Reabrir</button>` : ""}<button class="btn" data-a="editar">Editar</button>${x.status !== "cancelado" ? `<button class="btn" data-a="cancelar">Cancelar</button>` : ""}<button class="btn" data-a="excluir">Excluir</button></td></tr>`).join("")
        : `<tr><td colspan="8" class="empty">${d.lancamentos.length ? "Nenhum lançamento com esses filtros." : "Nenhum lançamento ainda."}</td></tr>`;
      const soma = s => l.filter(x => x.statusEfetivo === s).reduce((t, x) => t + x.valor, 0);
      box("foot").innerHTML = `<tr><td colspan="8"><span style="margin-right:18px">Em aberto: ${brl(soma("aberto"))}</span><span style="margin-right:18px;color:#A12020">Atrasado: ${brl(soma("atrasado"))}</span><span style="margin-right:18px;color:#1B6B3A">Pago: ${brl(soma("pago"))}</span><span class="fin-sub">${l.length} lançamento(s)</span></td></tr>`;
    }
    function form(x) {
      x = x || { vencimento: hoje(), competencia: hoje().slice(0, 7) };
      const novo = !x.id;
      box("form").innerHTML = `<div class="fin-form"><h3 style="margin:0 0 10px">${novo ? "Novo lançamento" : "Editar lançamento"}</h3><div class="fin-grid">
        <label class="full">Descrição<input data-c="descricao" value="${esc(x.descricao || "")}"></label>
        ${receber ? `<label>Cliente (Carteira)<select data-c="clienteId"><option value="">Escolha</option>${d.clientes.map(c => `<option value="${esc(c.id)}"${c.id === x.clienteId ? " selected" : ""}>${esc(c.nome)}</option>`).join("")}${x.clienteId && !d.clientes.some(c => c.id === x.clienteId) ? `<option value="${esc(x.clienteId)}" selected>${esc(x.clienteNome)}</option>` : ""}</select></label>`
          : `<label>Fornecedor<input data-c="fornecedor" list="finForn" value="${esc(x.fornecedor || "")}"><datalist id="finForn">${d.fornecedores.map(f => `<option value="${esc(f)}">`).join("")}</datalist></label>`}
        <label>Categoria<select data-c="categoria">${[...new Set([...d.categorias, ...(x.categoria ? [x.categoria] : [])])].map(c => `<option${c === x.categoria ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label>Valor (R$)<input data-c="valor" type="number" step="0.01" min="0.01" value="${x.valor ?? ""}"></label>
        <label>Vencimento<input data-c="vencimento" type="date" value="${x.vencimento || ""}"></label>
        <label>Competência<input data-c="competencia" type="month" value="${x.competencia || ""}"></label>
        <label>Forma de pagamento<select data-c="forma"><option value="">—</option>${d.formas.map(f => `<option${f === x.forma ? " selected" : ""}>${f}</option>`).join("")}</select></label>
        ${novo ? `<label>Repetir por (meses)<input data-c="repetir" type="number" min="1" max="60" value="1"></label>` : ""}
        <label class="full">Observação<input data-c="obs" value="${esc(x.obs || "")}"></label></div>
        ${novo ? `<p class="fin-sub" style="margin:8px 0 0">Com "repetir por N meses", são criados N lançamentos mensais, avançando competência e vencimento.</p>` : ""}
        <div class="fin-bar"><button class="btn primary" type="button" data-x="salvar">Salvar</button><button class="btn" type="button" data-x="fechar">Cancelar</button><span class="fin-sub" data-box="msg"></span></div></div>`;
      box("form").dataset.id = x.id || "";
      box("form").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    async function salvarForm() {
      const v = k => (box("form").querySelector(`[data-c="${k}"]`) || {}).value;
      const corpo = { id: box("form").dataset.id || undefined, tipo, descricao: v("descricao"), categoria: v("categoria"), valor: v("valor"), vencimento: v("vencimento"),
        competencia: v("competencia"), forma: v("forma"), obs: v("obs"), repetir: v("repetir"), clienteId: v("clienteId"), fornecedor: v("fornecedor") };
      try { const j = await api("lancamento.salvar", corpo); ctx.toast(j.lancamentos.length > 1 ? `${j.lancamentos.length} lançamentos criados` : "Lançamento salvo"); box("form").innerHTML = ""; carregar(); }
      catch (e) { box("msg").textContent = e.message; }
    }
    let armado = null;
    el.addEventListener("click", async ev => {
      const x = ev.target.dataset.x, a = ev.target.dataset.a;
      if (x === "novo") return d && form(null);
      if (x === "fechar") { box("form").innerHTML = ""; return; }
      if (x === "salvar") return salvarForm();
      if (x === "limpar") { el.querySelectorAll("[data-f]").forEach(i => { i.value = ""; }); return render(); }
      if (x === "cat") {
        if (box("extra").innerHTML) { box("extra").innerHTML = ""; return; }
        box("extra").innerHTML = `<div class="fin-form"><h3 style="margin:0 0 10px">Categorias de ${receber ? "receitas" : "despesas"}</h3><p class="fin-sub" style="margin-top:0">Uma por linha.</p>
          <textarea data-c="cats" rows="6" style="width:100%">${esc(d.categorias.join("\n"))}</textarea><div class="fin-bar"><button class="btn primary" type="button" data-x="salvarcat">Salvar categorias</button></div></div>`;
        return;
      }
      if (x === "salvarcat") {
        try { await api("categorias", { tipo, lista: box("extra").querySelector('[data-c="cats"]').value.split("\n") }); ctx.toast("Categorias salvas"); box("extra").innerHTML = ""; carregar(); } catch (e) { ctx.toast(e.message); }
        return;
      }
      if (x === "log") {
        if (box("extra").innerHTML) { box("extra").innerHTML = ""; return; }
        try {
          const j = await api("auditoria");
          const N = { "lancamento.criar": "criou", "lancamento.alterar": "alterou", "lancamento.excluir": "excluiu", "lancamento.pagar": "marcou como pago", "lancamento.cancelar": "cancelou", "lancamento.reabrir": "reabriu", "config.categorias": "alterou categorias", "config.saldo_inicial": "alterou o saldo inicial", "relatorio.pdf": "exportou PDF" };
          box("extra").innerHTML = `<div class="fin-card"><h3>Log do Financeiro (últimos 200)</h3><div style="max-height:280px;overflow:auto"><table class="fin-tbl"><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
            ${j.registros.map(r => `<tr><td>${brHora(r.at)}</td><td>${esc(r.login)}</td><td>${N[r.acao] || esc(r.acao)}</td><td class="fin-sub">${esc(r.detalhe?.tipo || r.alvo || "")}${r.detalhe?.descricao ? " · " + esc(r.detalhe.descricao) : ""}${r.detalhe?.campos ? " · " + esc(r.detalhe.campos.join(", ")) : ""}</td></tr>`).join("")}</tbody></table></div></div>`;
        } catch (e) { ctx.toast(e.message); }
        return;
      }
      const tr = ev.target.closest("tr"); const id = tr?.dataset.id; if (!a || !id) return;
      const item = d.lancamentos.find(l => l.id === id);
      try {
        if (a === "editar") return form(item);
        if (a === "pagar") { ev.target.parentNode.innerHTML = `<input type="date" value="${hoje()}" style="min-height:28px;font-size:12.5px"> <button class="btn primary" data-a="confpag">Confirmar</button>`; return; }
        if (a === "confpag") { await api("lancamento.pagar", { id, dataPagamento: ev.target.parentNode.querySelector("input").value }); ctx.toast("Marcado como pago"); return carregar(); }
        if (a === "reabrir") { await api("lancamento.reabrir", { id }); ctx.toast("Reaberto"); return carregar(); }
        if (a === "cancelar" || a === "excluir") {
          if (armado !== id + a) { armado = id + a; ev.target.textContent = "Confirmar"; return; }
          await api("lancamento." + a, { id }); ctx.toast(a === "excluir" ? "Excluído" : "Cancelado"); return carregar();
        }
      } catch (e) { ctx.toast(e.message); }
    });
    el.addEventListener("change", ev => { if (ev.target.dataset.f && d) render(); });
    el.addEventListener("input", ev => { if (ev.target.dataset.f && ev.target.type !== "date" && ev.target.type !== "month" && d) render(); });
    return carregar;
  }

  // ======================================================================
  // GRÁFICO (SVG simples): barras de entradas/saídas e linhas de saldo
  // ======================================================================
  function grafico(itens) {
    if (!itens.length) return `<p class="fin-sub">Sem movimento no período.</p>`;
    const W = 760, H = 240, L = 70, R = 12, T = 12, B = 30;
    const vals = itens.flatMap(i => [i.ent, i.sai, i.saldo, i.prev, i.pe || 0, i.ps || 0].filter(v => v != null));
    const max = Math.max(1, ...vals.map(Math.abs)), min = Math.min(0, ...vals);
    const top = max, base = min < 0 ? min : 0;
    const y = v => T + (top - v) / (top - base) * (H - T - B);
    const passo = (W - L - R) / itens.length, bw = Math.max(3, Math.min(18, passo / 4));
    const x = i => L + passo * i + passo / 2;
    let s = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = base + (top - base) * f; return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#E6E9EE"/><text x="${L - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#6B7280">${Math.round(v).toLocaleString("pt-BR")}</text>`; }).join("");
    itens.forEach((i, k) => {
      const z = y(0);
      if (i.ent) s += `<rect x="${x(k) - bw - 1}" y="${y(i.ent)}" width="${bw}" height="${z - y(i.ent)}" fill="#2E9E5B"><title>Entradas ${brl(i.ent)}</title></rect>`;
      if (i.sai) s += `<rect x="${x(k) + 1}" y="${y(i.sai)}" width="${bw}" height="${z - y(i.sai)}" fill="#D64545"><title>Saídas ${brl(i.sai)}</title></rect>`;
      if (i.pe) s += `<rect x="${x(k) - bw - 1}" y="${y(i.pe)}" width="${bw}" height="${z - y(i.pe)}" fill="none" stroke="#2E9E5B" stroke-dasharray="3 2"><title>Entradas previstas ${brl(i.pe)}</title></rect>`;
      if (i.ps) s += `<rect x="${x(k) + 1}" y="${y(i.ps)}" width="${bw}" height="${z - y(i.ps)}" fill="none" stroke="#D64545" stroke-dasharray="3 2"><title>Saídas previstas ${brl(i.ps)}</title></rect>`;
      if (itens.length <= 24 || k % Math.ceil(itens.length / 24) === 0) s += `<text x="${x(k)}" y="${H - 10}" font-size="10" text-anchor="middle" fill="#6B7280">${esc(i.rot)}</text>`;
    });
    const linha = (k, cor, tr) => { const p = itens.map((i, n) => (i[k] == null ? null : `${x(n)},${y(i[k])}`)).filter(Boolean); return p.length ? `<polyline fill="none" stroke="${cor}" stroke-width="2.5"${tr ? ` stroke-dasharray="6 4"` : ""} points="${p.join(" ")}"/>` : ""; };
    s += linha("prev", "#7AA7FF", true) + linha("saldo", "#0660FF", false);
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico">${s}</svg>`;
  }

  // ======================================================================
  // FLUXO DE CAIXA
  // ======================================================================
  function fluxo(ctx) {
    const el = ctx.el; let d = null;
    const h = hoje(), ini = h.slice(0, 7) + "-01";
    const mais = (iso, m) => { const [a, b] = iso.split("-").map(Number); const t = new Date(Date.UTC(a, b - 1 + m + 1, 0)); return t.toISOString().slice(0, 10); };
    el.innerHTML = `<div class="fin-h"><div><h2>Fluxo de caixa</h2></div><span class="sp"></span><button class="btn" type="button" data-x="saldo">Saldo inicial</button><a class="btn primary" data-x="pdf" target="_blank" rel="noopener">Exportar PDF</a></div>
      <div class="fin-nota"><b>Regime de caixa:</b> o realizado usa a <b>data de pagamento</b>; a previsão usa o <b>vencimento</b> dos lançamentos em aberto (os atrasados entram como previstos para hoje). O Dashboard usa a competência.</div>
      <div data-box="saldo"></div>
      <div class="fin-filtros"><label>De<input type="date" data-f="de" value="${ini}"></label><label>Até<input type="date" data-f="ate" value="${mais(ini, 2)}"></label>
        <label>Agrupar<select data-f="agrupar"><option value="mes">Por mês</option><option value="dia">Por dia</option></select></label>
        <label>Competência de<input type="month" data-f="compDe"></label><label>até<input type="month" data-f="compAte"></label></div>
      <div class="fin-kpis" data-box="kpis"></div>
      <div class="fin-card fin-chart"><h3>Saldo e movimento</h3><div data-box="graf"></div>
        <div class="fin-sub"><span style="color:#2E9E5B">■</span> entradas <span style="color:#D64545">■</span> saídas (contorno tracejado = previsto) · <span style="color:#0660FF">━</span> saldo realizado <span style="color:#7AA7FF">╍</span> saldo previsto</div></div>
      <div class="fin-wrap"><table class="fin-tbl"><thead><tr><th>Período</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo realizado</th><th class="num">Prev. entradas</th><th class="num">Prev. saídas</th><th class="num">Saldo previsto</th></tr></thead><tbody data-box="rows"></tbody><tfoot data-box="foot"></tfoot></table></div>
      <div class="fin-2"><div class="fin-card"><h3>Realizado (pagos)</h3><div data-box="real"></div></div><div class="fin-card"><h3>Previsão (em aberto)</h3><div data-box="prev"></div></div></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), fv = n => el.querySelector(`[data-f="${n}"]`).value;
    const params = () => new URLSearchParams({ de: fv("de"), ate: fv("ate"), agrupar: fv("agrupar"), compDe: fv("compDe"), compAte: fv("compAte") });
    async function carregar() {
      try { d = await api("fluxo&" + params()); } catch (e) { box("kpis").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      el.querySelector('[data-x="pdf"]').href = "/api/m?r=fin/pdf&qual=fluxo&" + params();
      const t = d.totais, rot = k => (d.filtro.agrupar === "dia" ? br(k) : mesBr(k));
      box("kpis").innerHTML = `<div class="fin-kpi"><b>${brl(t.saldoInicialPeriodo)}</b><span>Saldo no início do período</span></div>
        <div class="fin-kpi pos"><b>${brl(t.entradas)}</b><span>Entradas realizadas</span></div><div class="fin-kpi neg"><b>${brl(t.saidas)}</b><span>Saídas realizadas</span></div>
        <div class="fin-kpi"><b>${brl(t.saldoFinal)}</b><span>Saldo final realizado</span></div>
        <div class="fin-kpi"><b>${brl(t.saldoFinalPrevisto)}</b><span>Saldo final previsto</span><em>+${brl(t.prevEntradas)} / −${brl(t.prevSaidas)} em aberto</em></div>`;
      const atual = d.filtro.agrupar === "dia" ? d.hoje : d.hoje.slice(0, 7);
      box("graf").innerHTML = grafico(d.buckets.map(b => ({ rot: rot(b.chave), ent: b.entradas, sai: b.saidas, pe: b.prevEntradas, ps: b.prevSaidas, saldo: b.chave <= atual ? b.saldo : null, prev: b.saldoPrevisto })));
      box("rows").innerHTML = d.buckets.length ? d.buckets.map(b => `<tr><td>${rot(b.chave)}</td><td class="num">${brl(b.entradas)}</td><td class="num">${brl(b.saidas)}</td><td class="num"><b>${brl(b.saldo)}</b></td>
        <td class="num">${brl(b.prevEntradas)}</td><td class="num">${brl(b.prevSaidas)}</td><td class="num">${brl(b.saldoPrevisto)}</td></tr>`).join("") : `<tr><td colspan="7" class="empty">Sem movimento no período.</td></tr>`;
      box("foot").innerHTML = `<tr><td>Total</td><td class="num">${brl(t.entradas)}</td><td class="num">${brl(t.saidas)}</td><td class="num">${brl(t.saldoFinal)}</td><td class="num">${brl(t.prevEntradas)}</td><td class="num">${brl(t.prevSaidas)}</td><td class="num">${brl(t.saldoFinalPrevisto)}</td></tr>`;
      const lista = (l, prev) => l.length ? `<table class="fin-tbl"><tbody>${l.map(x => `<tr class="${prev ? "prev" : ""}"><td>${br(x.data)}</td><td>${esc(x.descricao)}${x.atrasado ? ' <span class="st atrasado">Atrasado</span>' : ""}<div class="fin-sub">${esc(x.quem)} · ${esc(x.categoria)}</div></td><td class="num" style="color:${x.tipo === "receber" ? "#1B6B3A" : "#A12020"}">${x.tipo === "receber" ? "" : "−"}${brl(x.valor)}</td></tr>`).join("")}</tbody></table>` : `<p class="fin-sub">Nada no período.</p>`;
      box("real").innerHTML = lista(d.realizados, false); box("prev").innerHTML = lista(d.previstos, true);
    }
    el.addEventListener("change", ev => { if (ev.target.dataset.f) carregar(); });
    el.addEventListener("click", async ev => {
      if (ev.target.dataset.x === "saldo") {
        if (box("saldo").innerHTML) { box("saldo").innerHTML = ""; return; }
        box("saldo").innerHTML = `<div class="fin-form"><div class="fin-grid"><label>Saldo inicial (R$)<input data-c="v" type="number" step="0.01" value="${d ? d.saldoInicial : 0}"></label>
          <label>A partir de (data)<input data-c="dt" type="date" value="${d ? d.saldoInicialData : ""}"></label></div><p class="fin-sub" style="margin:8px 0 0">Pagamentos antes dessa data não entram no saldo (deixe em branco para contar todos).</p>
          <div class="fin-bar"><button class="btn primary" type="button" data-x="salvarsaldo">Salvar</button></div></div>`;
      }
      if (ev.target.dataset.x === "salvarsaldo") {
        try { await api("saldo.inicial", { saldoInicial: box("saldo").querySelector('[data-c="v"]').value, data: box("saldo").querySelector('[data-c="dt"]').value }); ctx.toast("Saldo inicial salvo"); box("saldo").innerHTML = ""; carregar(); } catch (e) { ctx.toast(e.message); }
      }
    });
    return carregar;
  }

  // ======================================================================
  // DASHBOARD (competência)
  // ======================================================================
  function dash(ctx) {
    const el = ctx.el; let d = null;
    const ano = new Date().getFullYear(), mes = new Date().getMonth() + 1;
    el.innerHTML = `<div class="fin-h"><div><h2>Dashboard financeiro</h2></div><span class="sp"></span><a class="btn primary" data-x="pdf" target="_blank" rel="noopener">Exportar PDF</a></div>
      <div class="fin-nota"><b>Regime de competência:</b> receitas e despesas contam no <b>mês de competência</b> (o Fluxo de caixa usa a data de pagamento). Cancelados não entram.</div>
      <div class="fin-filtros"><label>Período<select data-f="periodo"><option value="mes">Mês</option><option value="trimestre">Trimestre</option><option value="semestre">Semestre</option><option value="ano">Ano</option><option value="personalizado">Competência personalizada</option></select></label>
        <label data-p="ano">Ano<input type="number" data-f="ano" value="${ano}" min="2000" max="2100" style="width:90px"></label>
        <label data-p="n">Qual<select data-f="n"></select></label>
        <label data-p="comp" hidden>Competência de<input type="month" data-f="compDe" value="${ano}-01"></label><label data-p="comp" hidden>até<input type="month" data-f="compAte" value="${ano}-12"></label></div>
      <div class="fin-kpis" data-box="kpis"></div>
      <div class="fin-card fin-chart"><h3>Receitas e despesas por mês</h3><div data-box="graf"></div><div class="fin-sub"><span style="color:#2E9E5B">■</span> receitas <span style="color:#D64545">■</span> despesas · <span style="color:#0660FF">━</span> resultado</div></div>
      <div class="fin-wrap"><table class="fin-tbl"><thead><tr><th>Mês (competência)</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Resultado</th></tr></thead><tbody data-box="meses"></tbody><tfoot data-box="mfoot"></tfoot></table></div>
      <div class="fin-2"><div class="fin-card"><h3>Despesas por categoria</h3><div data-box="cat"></div></div><div class="fin-card"><h3>Receita por cliente (top 5)</h3><div data-box="cli"></div></div></div>
      <div class="fin-card"><h3>Lançamentos do período</h3><div data-box="lanc"></div></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), fv = n => el.querySelector(`[data-f="${n}"]`).value;
    function opcoesN() {
      const p = fv("periodo"), sel = el.querySelector('[data-f="n"]');
      el.querySelector('[data-p="n"]').hidden = p === "ano" || p === "personalizado"; el.querySelector('[data-p="ano"]').hidden = p === "personalizado";
      el.querySelectorAll('[data-p="comp"]').forEach(x => { x.hidden = p !== "personalizado"; });
      const ops = p === "mes" ? ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] : p === "trimestre" ? ["1º trimestre", "2º trimestre", "3º trimestre", "4º trimestre"] : p === "semestre" ? ["1º semestre", "2º semestre"] : [];
      const atual = p === "mes" ? mes : p === "trimestre" ? Math.ceil(mes / 3) : Math.ceil(mes / 6);
      sel.innerHTML = ops.map((o, i) => `<option value="${i + 1}"${i + 1 === atual ? " selected" : ""}>${o}</option>`).join("");
    }
    const params = () => new URLSearchParams({ periodo: fv("periodo"), ano: fv("ano"), n: fv("n") || "1", compDe: fv("compDe"), compAte: fv("compAte") });
    async function carregar() {
      try { d = await api("dashboard&" + params()); } catch (e) { box("kpis").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      el.querySelector('[data-x="pdf"]').href = "/api/m?r=fin/pdf&qual=dashboard&" + params();
      const t = d.totais, a = d.anteriorTotais, v = d.variacao, p = d.periodo;
      box("kpis").innerHTML = `<div class="fin-kpi"><span>${esc(p.label)} · competência ${mesBr(p.de)} a ${mesBr(p.ate)}</span><b style="font-size:15px;margin-top:4px">comparado com ${esc(p.anterior.label)}</b></div>
        <div class="fin-kpi pos"><b>${brl(t.receitas)}</b><span>Receitas</span><em>anterior ${brl(a.receitas)} · ${pct(v.receitas)}</em></div>
        <div class="fin-kpi neg"><b>${brl(t.despesas)}</b><span>Despesas</span><em>anterior ${brl(a.despesas)} · ${pct(v.despesas)}</em></div>
        <div class="fin-kpi ${t.resultado < 0 ? "neg" : ""}"><b>${brl(t.resultado)}</b><span>Resultado</span><em>anterior ${brl(a.resultado)} · ${pct(v.resultado)}</em></div>
        <div class="fin-kpi neg"><b>${brl(d.inadimplencia.valor)}</b><span>Inadimplência (em atraso)</span><em>${d.inadimplencia.quantidade} lançamento(s)</em></div>`;
      box("graf").innerHTML = grafico(d.meses.map(m => ({ rot: mesBr(m.mes), ent: m.receitas, sai: m.despesas, saldo: m.resultado })));
      box("meses").innerHTML = d.meses.map(m => `<tr><td>${mesBr(m.mes)}</td><td class="num">${brl(m.receitas)}</td><td class="num">${brl(m.despesas)}</td><td class="num"><b>${brl(m.resultado)}</b></td></tr>`).join("");
      box("mfoot").innerHTML = `<tr><td>Total</td><td class="num">${brl(t.receitas)}</td><td class="num">${brl(t.despesas)}</td><td class="num">${brl(t.resultado)}</td></tr>`;
      const barras = (l, tot) => l.length ? `<table class="fin-tbl"><tbody>${l.map(c => `<tr><td style="width:40%">${esc(c.nome)}</td><td><div class="fin-barra" style="width:${tot ? Math.max(2, c.valor / tot * 100) : 0}%"></div></td><td class="num">${brl(c.valor)}</td></tr>`).join("")}</tbody></table>` : `<p class="fin-sub">Nada no período.</p>`;
      box("cat").innerHTML = barras(d.despesasPorCategoria, t.despesas);
      box("cli").innerHTML = barras(d.receitaPorCliente, t.receitas);
      box("lanc").innerHTML = d.lancamentos.length ? `<div style="overflow-x:auto"><table class="fin-tbl"><thead><tr><th>Comp.</th><th>Venc.</th><th>Descrição</th><th>Cliente / fornecedor</th><th>Categoria</th><th>Status</th><th class="num">Valor</th></tr></thead><tbody>
        ${d.lancamentos.map(l => `<tr><td>${mesBr(l.competencia)}</td><td>${br(l.vencimento)}</td><td>${esc(l.descricao)}</td><td>${esc(l.quem)}</td><td>${esc(l.categoria)}</td><td><span class="st ${l.status}">${STATUS[l.status]}</span></td>
          <td class="num" style="color:${l.tipo === "receber" ? "#1B6B3A" : "#A12020"}">${l.tipo === "receber" ? "" : "−"}${brl(l.valor)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="fin-sub">Nenhum lançamento nessa competência.</p>`;
    }
    el.addEventListener("change", ev => { if (ev.target.dataset.f === "periodo") opcoesN(); if (ev.target.dataset.f) carregar(); });
    opcoesN();
    return carregar;
  }

  const MONTAR = { receber: c => lancamentos(c, "receber"), pagar: c => lancamentos(c, "pagar"), fluxo, findash: dash };
  Object.entries(MONTAR).forEach(([id, montar]) => {
    let recarregar = null;
    QZ.modulo({ id, iniciar(ctx) { recarregar = montar(ctx); if (!ctx.el.hidden) recarregar(); }, aoMostrar() { if (recarregar) recarregar(); } });
  });
})();
