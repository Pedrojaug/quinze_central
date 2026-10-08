// 03 Administrativo: Contratos, Assinatura de documentos, Pessoal e Férias (só mestre e gestão).
// Os dados não passam pela sincronização: tudo vem e vai pela rota /api/m?r=adm/..., que confere a permissão.
// Um arquivo só para as quatro abas (o carregador chama este script uma vez por aba; o guarda evita duplicar).
(function () {
  if (window.__qzAdm) return; window.__qzAdm = true;

  // ---------- Ajudas ----------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const br = iso => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
  const brHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const brl = v => (v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const pct = v => (v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%");
  const kb = n => (n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  async function api(r, body) {
    const res = await fetch("/api/m?r=adm/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || MSG[j.code] || "Não deu para concluir. Tente de novo."), { code: j.code, status: res.status, dados: j });
    return j;
  }
  const MSG = { sem_acesso: "Sem permissão.", arquivo_grande: "O arquivo passa de 3 MB.", tipo_invalido: "Tipo de arquivo não aceito (use PDF, Word, imagem).",
    pdf_invalido: "O arquivo não parece ser um PDF válido.", sem_arquivo: "Anexe o arquivo.", arquivo_vazio: "O arquivo está vazio." };
  const lerArquivo = file => new Promise((ok, erro) => {
    if (!file) return ok(null);
    if (file.size > 3 * 1024 * 1024) return erro(new Error(MSG.arquivo_grande));
    const fr = new FileReader();
    fr.onload = () => ok({ nome: file.name, b64: String(fr.result).split(",")[1] || "" });
    fr.onerror = () => erro(new Error("Não deu para ler o arquivo."));
    fr.readAsDataURL(file);
  });
  const link = (r, texto) => `<a class="btn" href="/api/m?r=adm/${r}" target="_blank" rel="noopener">${texto}</a>`;
  const vazio = (n, txt) => `<tr><td colspan="${n}" class="empty">${txt}</td></tr>`;
  const erroEl = (el, e) => { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; };

  if (!document.getElementById("qzAdmCss")) {
    const st = document.createElement("style"); st.id = "qzAdmCss";
    st.textContent = `
      .adm-h{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}
      .adm-h h2{margin:0}.adm-h .sp{flex:1}
      .adm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
      .adm-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
      .adm-kpi b{display:block;font:700 26px/1 var(--display);font-variant-numeric:tabular-nums}
      .adm-kpi span{font-size:13px;color:var(--ink2)}
      .adm-kpi.warn b{color:var(--warn)}.adm-kpi.bad b{color:var(--danger)}
      .adm-tbl{width:100%;border-collapse:collapse;font-size:14px}
      .adm-tbl th{font-size:12.5px;color:var(--ink2);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line);white-space:nowrap}
      .adm-tbl td{padding:8px;border-bottom:1px solid var(--line2);vertical-align:top}
      .adm-tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .adm-tbl .acts{white-space:nowrap;text-align:right}.adm-tbl .acts .btn{padding:4px 9px;font-size:13px;min-height:0;margin-left:4px}
      .adm-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
      .st{font-size:12px;padding:2px 8px;border-radius:20px;white-space:nowrap;font-weight:600}
      .st.vigente,.st.assinado,.st.enviado{background:#E6F6EC;color:#1B6B3A}
      .st.vencendo,.st.pendente{background:#FFF4DE;color:#8A5A00}
      .st.vencido,.st.erro{background:#FDE8E8;color:#A12020}
      .st.pendente_renovacao{background:#FCE9D9;color:#97440B}
      .st.renovado_automaticamente{background:#E5EFFC;color:#1D4F91}
      .adm-form{background:var(--card);border:1px solid var(--blue);border-radius:10px;padding:16px 18px;margin-bottom:16px}
      .adm-form h3{margin:0 0 12px}
      .adm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
      .adm-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2)}
      .adm-grid label.ck{flex-direction:row;align-items:center;gap:8px;color:var(--ink)}
      .adm-grid .full{grid-column:1/-1}
      .adm-bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}
      .adm-hist{font-size:13px;color:var(--ink2);margin:10px 0 0;padding-left:18px}
      .adm-cal{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px;margin-top:14px}
      .adm-mes{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
      .adm-mes h4{margin:0 0 8px;font-size:14px;text-transform:capitalize}
      .adm-dias{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:12px;text-align:center}
      .adm-dias span{padding:4px 0;border-radius:4px}.adm-dias .h{color:var(--ink2);font-weight:600}
      .adm-dias .f{background:var(--blue);color:#fff;font-weight:600}
      .adm-sub{font-size:12.5px;color:var(--ink2)}`;
    document.head.appendChild(st);
  }

  // ======================================================================
  // CONTRATOS
  // ======================================================================
  const ST_C = { vigente: "Vigente", vencendo: "Vencendo", vencido: "Vencido", pendente_renovacao: "Pendente de renovação", renovado_automaticamente: "Renovado automaticamente", sem_datas: "Sem datas" };
  function contratos(ctx) {
    const el = ctx.el;
    let dados = null, filtro = "", busca = "";
    el.innerHTML = `
      <div class="adm-h"><div><h2>Contratos</h2><div class="adm-sub">Contratos em controle, status, renovações e reajuste pelo IGP-M.</div></div><span class="sp"></span>
        <button class="btn" type="button" data-a="importar" title="Cria os contratos a partir dos onboardings que já têm contrato anexado, sem duplicar">Importar contratos dos onboardings existentes</button>
        <button class="btn primary" type="button" data-a="novo">Novo contrato</button></div><div id="cImp"></div>
      <div id="cKpis" class="adm-kpis"></div><div id="cProx"></div><div id="cForm"></div>
      <div class="adm-h"><select id="cFiltro"><option value="">Todos os status</option><option value="__conferir">A conferir (veio do onboarding)</option>${Object.entries(ST_C).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
        <input id="cBusca" placeholder="Buscar contraparte" style="min-width:220px"></div>
      <div class="adm-wrap"><table class="adm-tbl"><thead><tr><th>Contraparte</th><th>Tipo</th><th class="num">Valor mensal</th><th>Início</th><th>Data final</th><th>Renov. autom.</th><th>Status</th><th></th></tr></thead><tbody id="cRows"><tr><td colspan="8" class="empty">Carregando…</td></tr></tbody></table></div>`;
    const $ = s => el.querySelector(s);
    async function carregar() {
      try { dados = await api("contratos"); } catch (e) { return erroEl($("#cRows").parentNode.parentNode, e); }
      render();
    }
    function render() {
      const a = dados.alertas;
      $("#cKpis").innerHTML = `<div class="adm-kpi"><b>${dados.contratos.length}</b><span>Contratos em controle</span></div>
        <div class="adm-kpi warn"><b>${a.vencendo}</b><span>Vencendo (até 60 dias)</span></div>
        <div class="adm-kpi bad"><b>${a.pendentes}</b><span>Pendentes de renovação</span></div>
        <div class="adm-kpi bad"><b>${a.vencidos}</b><span>Vencidos</span></div>`;
      $("#cProx").innerHTML = a.proximos.length ? `<div class="note" style="margin-bottom:14px"><b>Próximos vencimentos:</b> ${a.proximos.map(p => `${esc(p.contraparte)} em ${br(p.proximoVencimento)}`).join(" · ")}</div>` : "";
      const aConferir = c => c.origem === "onboarding" && !c.conferido;
      const lista = dados.contratos.filter(c => (!filtro || (filtro === "__conferir" ? aConferir(c) : c.status === filtro)) && (!busca || (c.contraparte || "").toLowerCase().includes(busca)));
      $("#cRows").innerHTML = lista.length ? lista.map(c => `<tr data-id="${esc(c.id)}">
        <td><b>${esc(c.contraparte)}</b>${aConferir(c) ? ` <span class="st pendente_renovacao" title="Revise, complete e confirme">Veio do onboarding, conferir</span>` : ""}${c.obs ? `<div class="adm-sub">${esc(c.obs.slice(0, 90))}</div>` : ""}</td><td>${esc(c.tipo)}</td>
        <td class="num">${brl(c.valorMensal)}${c.ultimoReajuste ? `<div class="adm-sub">reaj. ${br(c.ultimoReajuste)}</div>` : ""}</td>
        <td>${br(c.inicio)}</td><td>${br(c.dataFinal)}${c.status === "renovado_automaticamente" ? `<div class="adm-sub">próx. ${br(c.proximoVencimento)}</div>` : c.dias != null && c.dias >= 0 && c.dias <= 60 ? `<div class="adm-sub">faltam ${c.dias} dias</div>` : ""}</td>
        <td>${c.renovacaoAutomatica ? "Sim" : "Não"}${c.naoRenovar ? `<div class="adm-sub">não renovar</div>` : ""}</td>
        <td><span class="st ${c.status}">${ST_C[c.status] || c.status}</span></td>
        <td class="acts">${aConferir(c) ? `<button class="btn" data-a="conferir">Confirmar conferência</button>` : ""}${c.arquivo ? link(`contrato.arquivo&id=${encodeURIComponent(c.id)}`, "Arquivo") : ""}${c.linkContrato ? `<a class="btn" href="${esc(c.linkContrato)}" target="_blank" rel="noopener">Drive</a>` : ""}<button class="btn" data-a="reaj">Reajuste</button><button class="btn" data-a="editar">Editar</button></td></tr>`).join("")
        : vazio(8, dados.contratos.length ? "Nenhum contrato com esse filtro." : "Nenhum contrato em controle. Clique em “Novo contrato” e anexe o arquivo.");
    }
    function form(c) {
      c = c || {};
      const opts = dados.clientes.map(x => `<option value="${esc(x.nome)}" data-id="${esc(x.id)}">`).join("");
      $("#cForm").innerHTML = `<div class="adm-form"><h3>${c.id ? "Editar contrato" : "Novo contrato"}</h3>
        <div class="adm-grid">
          <label class="full">Cliente ou contraparte (da Carteira ou texto livre)<input id="fCp" list="fCli" value="${esc(c.contraparte || "")}" required><datalist id="fCli">${opts}</datalist></label>
          <label>Tipo<select id="fTipo">${dados.tipos.map(t => `<option${t === c.tipo ? " selected" : ""}>${t}</option>`).join("")}</select></label>
          <label>Valor mensal (R$)<input id="fValor" type="number" step="0.01" min="0" value="${c.valorMensal ?? ""}"></label>
          <label>Data de início<input id="fIni" type="date" value="${c.inicio || ""}"></label>
          <label>Prazo (meses)<input id="fPrazo" type="number" min="1" max="600" value="${c.prazoMeses || 12}"></label>
          <label>Data final (calculada, pode editar)<input id="fFim" type="date" value="${c.dataFinal || ""}"></label>
          <label>Último reajuste<input id="fReaj" type="date" value="${c.ultimoReajuste || ""}"></label>
          <label class="ck"><input id="fAuto" type="checkbox"${c.renovacaoAutomatica ? " checked" : ""}> Renovação automática</label>
          <label class="full">Observações<textarea id="fObs" rows="2">${esc(c.obs || "")}</textarea></label>
          <label class="full">Arquivo do contrato ${c.arquivo ? `(atual: ${esc(c.arquivo.nome)}; envie outro só para trocar)` : "(obrigatório, até 3 MB)"}<input id="fArq" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"></label>
        </div>
        ${c.id ? `<div class="adm-bar"><b style="font-size:13px">Renovação:</b>
          <button class="btn" type="button" data-r="renovar">Registrar renovação (+${c.prazoMeses} meses)</button>
          ${c.naoRenovar ? `<button class="btn" type="button" data-r="desfazer">Desfazer “não renovar”</button>` : `<button class="btn" type="button" data-r="nao_renovar">Marcar “não renovar”</button>`}</div>` : ""}
        ${(c.historico || []).length ? `<ul class="adm-hist">${c.historico.slice().reverse().map(h => `<li>${brHora(h.em)} · ${esc(h.por?.nome || "")}: ${
          h.tipo === "reajuste" ? `reajuste de ${pct(h.percentual)} (${h.fonte === "igpm" ? "IGP-M" : "manual"}${h.periodo ? ", " + esc(h.periodo) : ""}): ${brl(h.valorAnterior)} → ${brl(h.valorNovo)}, vigente desde ${br(h.data)}`
          : h.tipo === "renovacao" ? `renovação: data final ${br(h.de)} → ${br(h.ate)}` : h.tipo === "nao_renovar" ? "marcado para não renovar" : "decisão de não renovar desfeita"}</li>`).join("")}</ul>` : ""}
        <div class="adm-bar"><button class="btn primary" type="button" data-f="salvar">Salvar</button><button class="btn" type="button" data-f="cancelar">Cancelar</button>
          ${c.id ? `<span style="flex:1"></span><button class="btn" type="button" data-f="excluir" style="color:var(--danger)">Excluir</button>` : ""}<span id="fMsg" class="adm-sub"></span></div></div>`;
      const calc = () => { const i = $("#fIni").value, p = parseInt($("#fPrazo").value, 10); if (i && p > 0) { const [y, m, d] = i.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1 + p, 1)); const ult = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(); x.setUTCDate(Math.min(d, ult)); x.setUTCDate(x.getUTCDate() - 1); $("#fFim").value = x.toISOString().slice(0, 10); } };
      $("#fIni").addEventListener("change", calc); $("#fPrazo").addEventListener("input", calc);
      let armado = false;
      $("#cForm").onclick = async ev => {
        const f = ev.target.dataset.f, r = ev.target.dataset.r;
        if (f === "cancelar") { $("#cForm").innerHTML = ""; return; }
        if (r) {
          try { await api("contrato.renovar", { id: c.id, acao: r }); ctx.toast(r === "renovar" ? "Renovação registrada" : "Decisão registrada"); $("#cForm").innerHTML = ""; carregar(); } catch (e) { $("#fMsg").textContent = e.message; }
          return;
        }
        if (f === "excluir") {
          if (!armado) { armado = true; ev.target.textContent = "Clique de novo para excluir"; return; }
          try { await api("contrato.excluir", { id: c.id }); ctx.toast("Contrato excluído"); $("#cForm").innerHTML = ""; carregar(); } catch (e) { $("#fMsg").textContent = e.message; }
          return;
        }
        if (f !== "salvar") return;
        ev.target.disabled = true; $("#fMsg").textContent = "Salvando…";
        try {
          const cp = $("#fCp").value.trim();
          const cli = dados.clientes.find(x => x.nome === cp);
          await api("contrato.salvar", { id: c.id, contraparte: cp, clienteId: cli ? cli.id : "", tipo: $("#fTipo").value, valorMensal: $("#fValor").value,
            inicio: $("#fIni").value, prazoMeses: $("#fPrazo").value, dataFinal: $("#fFim").value, ultimoReajuste: $("#fReaj").value,
            renovacaoAutomatica: $("#fAuto").checked, obs: $("#fObs").value, arquivo: await lerArquivo($("#fArq").files[0]) });
          ctx.toast("Contrato salvo"); $("#cForm").innerHTML = ""; carregar();
        } catch (e) { $("#fMsg").textContent = e.message; ev.target.disabled = false; }
      };
      $("#cForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    async function reajuste(c) {
      const desde = (c.ultimoReajuste || c.inicio || "").slice(0, 7);
      $("#cForm").innerHTML = `<div class="adm-form"><h3>Reajuste pelo IGP-M: ${esc(c.contraparte)}</h3><div id="rCorpo" class="adm-sub">Buscando a série oficial do IGP-M no Banco Central…</div></div>`;
      let j = null;
      try { j = await api("igpm&desde=" + desde); } catch { j = null; }
      const sug = j ? j.acumulado : null;
      $("#rCorpo").outerHTML = `<div>
        ${j ? `<p style="margin:0 0 10px">IGP-M acumulado de <b>${j.de.split("-").reverse().join("/")}</b> a <b>${j.ate.split("-").reverse().join("/")}</b> (${j.meses.length} meses, variações compostas): <b>${pct(sug)}</b>.
          <span class="adm-sub">Fonte: ${esc(j.fonte)}.</span></p>
          <details style="margin-bottom:10px"><summary class="adm-sub">Ver os meses</summary><div class="adm-sub">${j.meses.map(m => `${m.mes.split("-").reverse().join("/")}: ${pct(m.valor)}`).join(" · ")}</div></details>`
        : `<div class="note warn" style="margin-bottom:10px">Não deu para buscar o IGP-M no Banco Central agora. Digite o percentual manualmente.</div>`}
        <div class="adm-grid"><label>Percentual a aplicar (%)<input id="rPct" type="number" step="0.0001" value="${sug ?? ""}"></label>
          <label>Valor atual<input value="${brl(c.valorMensal)}" disabled></label><label>Novo valor<input id="rNovo" disabled></label>
          <label>Vigente a partir de<input id="rData" type="date" value="${new Date().toISOString().slice(0, 10)}"></label></div>
        <div class="adm-bar"><button class="btn primary" type="button" id="rOk">Confirmar reajuste</button><button class="btn" type="button" id="rCancel">Cancelar</button><span id="rMsg" class="adm-sub"></span></div></div>`;
      const atual = () => { const p = parseFloat($("#rPct").value); $("#rNovo").value = Number.isFinite(p) ? brl(Math.round(c.valorMensal * (1 + p / 100) * 100) / 100) : ""; };
      $("#rPct").addEventListener("input", atual); atual();
      $("#rCancel").onclick = () => { $("#cForm").innerHTML = ""; };
      $("#rOk").onclick = async () => {
        const p = parseFloat($("#rPct").value);
        if (!Number.isFinite(p)) { $("#rMsg").textContent = "Informe o percentual."; return; }
        try {
          await api("contrato.reajustar", { id: c.id, percentual: p, data: $("#rData").value, sugerido: sug,
            fonte: j && Math.abs(p - sug) < 1e-9 ? "igpm" : "manual", periodo: j ? `${j.de} a ${j.ate}` : "" });
          ctx.toast("Reajuste registrado"); $("#cForm").innerHTML = ""; carregar();
        } catch (e) { $("#rMsg").textContent = e.message; }
      };
    }
    el.addEventListener("click", ev => {
      const a = ev.target.dataset.a; if (!a || !dados) return;
      const c = dados.contratos.find(x => x.id === ev.target.closest("tr")?.dataset.id);
      if (a === "novo") form(null); else if (a === "editar" && c) form(c); else if (a === "reaj" && c) reajuste(c);
      else if (a === "conferir" && c) api("contrato.conferir", { id: c.id }).then(() => { ctx.toast("Contrato conferido"); carregar(); }).catch(e => { ctx.toast(e.message); if (e.code === "campos") form(c); });
      else if (a === "importar") { ev.target.disabled = true; api("contratos.importar", {}).then(r => { $("#cImp").innerHTML = `<div class="note" style="margin-bottom:12px">Importação: ${r.criados} contrato(s) criado(s) a conferir, ${r.existentes} já existiam, ${r.semContrato} onboarding(s) sem contrato anexado.</div>`; carregar(); }).catch(e => ctx.toast(e.message)).finally(() => { ev.target.disabled = false; }); }
    });
    $("#cFiltro").addEventListener("change", e => { filtro = e.target.value; render(); });
    $("#cBusca").addEventListener("input", e => { busca = e.target.value.trim().toLowerCase(); render(); });
    return carregar;
  }

  // ======================================================================
  // ASSINATURA DE DOCUMENTOS
  // ======================================================================
  const ST_A = { pendente: "Aguardando assinatura", vencido: "Vencido sem assinatura", assinado: "Assinado" };
  const DRIVE = { pendente: "Drive: aguardando envio", enviado: "Drive: enviado", erro: "Drive: erro no envio" };
  const driveCel = (a, g) => {
    if (!a.assinado) return "";
    if (a.drive_status === "enviado") return `<div class="adm-sub">Drive: enviado${a.drive_nome && a.drive_nome !== a.assinadoArquivo?.nome ? ` como ${esc(a.drive_nome)}` : ""}</div><a class="btn" href="${esc(a.drive_link)}" target="_blank" rel="noopener" style="margin-top:4px">Abrir no Drive</a>`;
    if (a.drive_status === "erro") return `<div class="adm-sub" style="color:var(--danger)">Drive: erro · ${esc(a.drive_erro || "")}</div><button class="btn" data-a="drive" style="margin-top:4px">Tentar de novo</button>`;
    return `<div class="adm-sub">${g.configurado ? "Drive: ainda não enviado" : "Drive: aguardando a integração com o Google"}</div>${g.configurado ? `<button class="btn" data-a="drive" style="margin-top:4px">Enviar ao Drive</button>` : ""}`;
  };
  function assinaturas(ctx) {
    const el = ctx.el; let dados = null;
    el.innerHTML = `
      <div class="adm-h"><div><h2>Assinatura de documentos</h2><div class="adm-sub">Baixe o original, assine fora do sistema e suba o assinado de volta.</div></div><span class="sp"></span>
        <button class="btn primary" type="button" id="aNovo">Novo documento</button></div>
      <div id="aAlerta"></div><div id="aDrive"></div><div id="aForm"></div><input type="file" id="aUp" hidden accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">
      <div class="adm-wrap"><table class="adm-tbl"><thead><tr><th>Documento</th><th>Prazo</th><th>Status</th><th>Original</th><th>Assinado</th><th></th></tr></thead><tbody id="aRows"><tr><td colspan="6" class="empty">Carregando…</td></tr></tbody></table></div>`;
    const $ = s => el.querySelector(s);
    let alvo = null;
    async function carregar() {
      try { dados = await api("assinaturas"); } catch (e) { return erroEl($("#aRows").parentNode.parentNode, e); }
      const v = dados.alertas.vencidos;
      const g = dados.google || {};
      $("#aDrive").innerHTML = g.configurado && g.driveParaEnviar ? `<div class="note" style="margin-bottom:14px">${g.driveParaEnviar} documento(s) assinado(s) ainda não estão no Drive. <button class="btn" type="button" id="aLote">Enviar todos ao Drive</button></div>` : "";
      $("#aAlerta").innerHTML = v ? `<div class="note warn" style="margin-bottom:14px"><b>${v} documento${v > 1 ? "s" : ""} com prazo vencido sem assinatura:</b> ${dados.assinaturas.filter(a => a.status === "vencido").map(a => esc(a.titulo) + " (prazo " + br(a.prazo) + ")").join(" · ")}</div>` : "";
      $("#aRows").innerHTML = dados.assinaturas.length ? dados.assinaturas.map(a => `<tr data-id="${esc(a.id)}">
        <td><b>${esc(a.titulo)}</b><div class="adm-sub">enviado por ${esc(a.original?.por?.nome || "")} em ${brHora(a.original?.em)}</div>${a.obs ? `<div class="adm-sub">${esc(a.obs)}</div>` : ""}</td>
        <td>${br(a.prazo)}</td><td><span class="st ${a.status}">${ST_A[a.status]}</span>${driveCel(a, dados.google || {})}</td>
        <td>${link(`assinatura.arquivo&id=${encodeURIComponent(a.id)}`, "Baixar")}</td>
        <td>${a.assinadoArquivo ? `${link(`assinatura.arquivo&qual=assinado&id=${encodeURIComponent(a.id)}`, "Baixar")}<div class="adm-sub">${esc(a.assinadoArquivo.nome)}<br>por ${esc(a.assinadoPor?.nome || "")} em ${brHora(a.assinadoEm)}</div>` : "—"}</td>
        <td class="acts"><button class="btn" data-a="up">${a.assinado ? "Trocar assinado" : "Subir assinado"}</button><button class="btn" data-a="del">Excluir</button></td></tr>`).join("")
        : vazio(6, "Nenhum documento para assinar.");
    }
    $("#aNovo").onclick = () => {
      $("#aForm").innerHTML = `<div class="adm-form"><h3>Novo documento a assinar</h3><div class="adm-grid">
        <label class="full">Título<input id="nTit"></label><label>Prazo para assinatura<input id="nPrazo" type="date"></label>
        <label>Arquivo original (até 3 MB)<input id="nArq" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"></label>
        <label class="full">Observação<input id="nObs"></label></div>
        <div class="adm-bar"><button class="btn primary" id="nOk" type="button">Salvar</button><button class="btn" id="nNo" type="button">Cancelar</button><span id="nMsg" class="adm-sub"></span></div></div>`;
      $("#nNo").onclick = () => { $("#aForm").innerHTML = ""; };
      $("#nOk").onclick = async () => {
        $("#nMsg").textContent = "Enviando…";
        try { await api("assinatura.salvar", { titulo: $("#nTit").value, prazo: $("#nPrazo").value, obs: $("#nObs").value, arquivo: await lerArquivo($("#nArq").files[0]) });
          ctx.toast("Documento cadastrado"); $("#aForm").innerHTML = ""; carregar(); } catch (e) { $("#nMsg").textContent = e.message; }
      };
    };
    let armado = null;
    el.addEventListener("click", async ev => {
      if (ev.target.id === "aLote") {
        ev.target.disabled = true; ev.target.textContent = "Enviando…";
        try { const r = await api("assinatura.drive_lote", {}); ctx.toast(`${r.enviados} enviado(s) ao Drive${r.erros ? `, ${r.erros} com erro` : ""}`); } catch (e) { ctx.toast(e.message); }
        return carregar();
      }
      const a = ev.target.dataset.a, id = ev.target.closest("tr")?.dataset.id; if (!a || !id) return;
      if (a === "drive") {
        ev.target.disabled = true; ev.target.textContent = "Enviando…";
        try { await api("assinatura.drive", { id }); ctx.toast("Enviado ao Drive"); } catch (e) { ctx.toast(e.message); }
        return carregar();
      }
      if (a === "up") { alvo = id; $("#aUp").value = ""; $("#aUp").click(); }
      if (a === "del") {
        if (armado !== id) { armado = id; ev.target.textContent = "Confirmar"; return; }
        try { await api("assinatura.excluir", { id }); ctx.toast("Excluído"); carregar(); } catch (e) { ctx.toast(e.message); }
      }
    });
    $("#aUp").addEventListener("change", async () => {
      const f = $("#aUp").files[0]; if (!f || !alvo) return;
      try { const r = await api("assinatura.assinado", { id: alvo, arquivo: await lerArquivo(f) }); ctx.toast("Assinado registrado: " + r.assinatura.assinadoArquivo.nome + (r.assinatura.drive_status === "enviado" ? " · enviado ao Drive" : r.assinatura.drive_status === "erro" ? " · erro no envio ao Drive" : "")); carregar(); }
      catch (e) { ctx.toast(e.message); }
    });
    return carregar;
  }

  // ======================================================================
  // PESSOAL
  // ======================================================================
  function pessoal(ctx) {
    const el = ctx.el; let dados = null; let ano = new Date().getFullYear();
    el.innerHTML = `
      <div class="adm-h"><div><h2>Pessoal</h2><div class="adm-sub">Dados sensíveis: toda consulta e alteração fica registrada no log de auditoria.</div></div><span class="sp"></span>
        <label class="adm-sub">Ano do 13º <select id="pAno">${[0, 1, 2].map(i => `<option>${ano + 1 - i}</option>`).join("")}</select></label>
        <button class="btn" type="button" id="pAud">Log de auditoria</button><button class="btn primary" type="button" id="pNovo">Nova pessoa</button></div>
      <div id="pKpis" class="adm-kpis"></div><div id="pForm"></div><div id="pAudBox"></div>
      <div class="adm-wrap"><table class="adm-tbl"><thead><tr><th>Nome</th><th>Contrato</th><th>Cargo</th><th>Entrada</th><th>Saída</th><th class="num">Salário</th><th class="num">Meses no ano</th><th class="num">13º proporcional</th><th class="num">1ª parcela (até 30/11)</th><th class="num">2ª parcela (até 20/12)</th><th></th></tr></thead><tbody id="pRows"><tr><td colspan="11" class="empty">Carregando…</td></tr></tbody></table></div>`;
    const $ = s => el.querySelector(s);
    $("#pAno").value = String(ano);
    async function carregar() {
      try { dados = await api("pessoal&ano=" + ano); } catch (e) { return erroEl($("#pRows").parentNode.parentNode, e); }
      const t = dados.totais;
      $("#pKpis").innerHTML = `<div class="adm-kpi"><b>${dados.pessoas.filter(p => !p.saida || p.saida >= new Date().toISOString().slice(0, 10)).length}</b><span>Pessoas ativas</span></div>
        <div class="adm-kpi"><b>${t.pessoasClt}</b><span>CLT com 13º em ${dados.ano}</span></div>
        <div class="adm-kpi"><b style="font-size:20px">${brl(t.decimo)}</b><span>Previsão do 13º da equipe</span></div>
        <div class="adm-kpi"><b style="font-size:20px">${brl(t.parcela1)}</b><span>1ª parcela (até 30/11)</span></div>
        <div class="adm-kpi"><b style="font-size:20px">${brl(t.parcela2)}</b><span>2ª parcela (até 20/12)</span></div>`;
      $("#pRows").innerHTML = dados.pessoas.length ? dados.pessoas.map(p => `<tr data-id="${esc(p.id)}">
        <td><b>${esc(p.nome)}</b></td><td>${p.tipo}</td><td>${esc(p.cargo)}</td><td>${br(p.entrada)}</td><td>${br(p.saida) || "—"}</td>
        <td class="num">${p.tipo === "CLT" ? brl(p.salario) : "—"}</td>
        ${p.decimo.aplica ? `<td class="num">${p.decimo.meses}</td><td class="num"><b>${brl(p.decimo.valor)}</b></td><td class="num">${brl(p.decimo.parcela1)}</td><td class="num">${brl(p.decimo.parcela2)}</td>`
          : `<td colspan="4" class="adm-sub" style="text-align:center">13º não se aplica (PJ)</td>`}
        <td class="acts"><button class="btn" data-a="ed">Editar</button></td></tr>`).join("") : vazio(11, "Nenhuma pessoa cadastrada.");
    }
    function form(p) {
      p = p || { tipo: "CLT" };
      $("#pForm").innerHTML = `<div class="adm-form"><h3>${p.id ? "Editar pessoa" : "Nova pessoa"}</h3><div class="adm-grid">
        <label>Nome<input id="eNome" value="${esc(p.nome || "")}"></label><label>Data de entrada<input id="eEnt" type="date" value="${p.entrada || ""}"></label>
        <label>Tipo de contrato<select id="eTipo"><option${p.tipo === "CLT" ? " selected" : ""}>CLT</option><option${p.tipo === "PJ" ? " selected" : ""}>PJ</option></select></label>
        <label>Cargo<input id="eCargo" value="${esc(p.cargo || "")}"></label>
        <label id="eSalL">Salário (CLT)<input id="eSal" type="number" step="0.01" min="0" value="${p.salario ?? ""}"></label>
        <label>Data de saída (opcional)<input id="eSai" type="date" value="${p.saida || ""}"></label></div>
        <div class="adm-bar"><button class="btn primary" id="eOk" type="button">Salvar</button><button class="btn" id="eNo" type="button">Cancelar</button>
        ${p.id ? `<span style="flex:1"></span><button class="btn" id="eDel" type="button" style="color:var(--danger)">Excluir</button>` : ""}<span id="eMsg" class="adm-sub"></span></div></div>`;
      const tipo = () => { $("#eSalL").hidden = $("#eTipo").value !== "CLT"; };
      $("#eTipo").addEventListener("change", tipo); tipo();
      $("#eNo").onclick = () => { $("#pForm").innerHTML = ""; };
      $("#eOk").onclick = async () => {
        try { await api("pessoa.salvar", { id: p.id, nome: $("#eNome").value, entrada: $("#eEnt").value, tipo: $("#eTipo").value, cargo: $("#eCargo").value, salario: $("#eSal").value, saida: $("#eSai").value });
          ctx.toast("Salvo"); $("#pForm").innerHTML = ""; carregar(); } catch (e) { $("#eMsg").textContent = e.message; }
      };
      let armado = false;
      if (p.id) $("#eDel").onclick = async ev => {
        if (!armado) { armado = true; ev.target.textContent = "Clique de novo para excluir"; return; }
        try { await api("pessoa.excluir", { id: p.id }); ctx.toast("Excluído"); $("#pForm").innerHTML = ""; carregar(); } catch (e) { $("#eMsg").textContent = e.message; }
      };
    }
    $("#pNovo").onclick = () => form(null);
    $("#pAno").onchange = e => { ano = Number(e.target.value); carregar(); };
    $("#pAud").onclick = async () => {
      if ($("#pAudBox").innerHTML) { $("#pAudBox").innerHTML = ""; return; }
      try {
        const j = await api("auditoria");
        const NOMES = { "pessoal.consultar": "consultou", "pessoal.criar": "cadastrou", "pessoal.alterar": "alterou", "pessoal.excluir": "excluiu" };
        $("#pAudBox").innerHTML = `<div class="adm-form" style="border-color:var(--line)"><h3>Log de auditoria (últimos 200)</h3><div style="max-height:300px;overflow:auto"><table class="adm-tbl"><thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação</th><th>Detalhe</th></tr></thead><tbody>
          ${j.registros.map(r => `<tr><td>${brHora(r.at)}</td><td>${esc(r.login)}</td><td>${NOMES[r.acao] || esc(r.acao)}</td><td class="adm-sub">${esc(r.detalhe?.nome || "")}${r.detalhe?.campos ? " · " + esc(r.detalhe.campos.join(", ")) : ""}${r.detalhe?.ano ? "ano " + r.detalhe.ano : ""}</td></tr>`).join("")}</tbody></table></div></div>`;
      } catch (e) { ctx.toast(e.message); }
    };
    el.addEventListener("click", ev => { if (ev.target.dataset.a === "ed") form(dados.pessoas.find(p => p.id === ev.target.closest("tr").dataset.id)); });
    return carregar;
  }

  // ======================================================================
  // FÉRIAS
  // ======================================================================
  function ferias(ctx) {
    const el = ctx.el; let dados = null;
    el.innerHTML = `
      <div class="adm-h"><div><h2>Férias</h2><div class="adm-sub">Só CLT. A lista mostra apenas as férias de hoje em diante.</div></div><span class="sp"></span>
        <button class="btn" type="button" id="fIcs">Exportar calendário (.ics)</button><button class="btn primary" type="button" id="fNovo">Lançar férias</button></div>
      <div id="fIcsBox"></div><div id="fForm"></div>
      <div class="adm-wrap"><table class="adm-tbl"><thead><tr><th>Pessoa</th><th>Início</th><th>Fim</th><th class="num">Dias</th><th>Observação</th><th></th></tr></thead><tbody id="fRows"><tr><td colspan="6" class="empty">Carregando…</td></tr></tbody></table></div>
      <div id="fCal" class="adm-cal"></div>`;
    const $ = s => el.querySelector(s);
    const dias = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5) + 1;
    async function carregar() {
      try { dados = await api("ferias"); } catch (e) { return erroEl($("#fRows").parentNode.parentNode, e); }
      $("#fRows").innerHTML = dados.ferias.length ? dados.ferias.map(f => `<tr data-id="${esc(f.id)}"><td><b>${esc(f.nome)}</b></td><td>${br(f.inicio)}</td><td>${br(f.fim)}</td>
        <td class="num">${dias(f.inicio, f.fim)}</td><td>${esc(f.obs)}</td><td class="acts"><button class="btn" data-a="del">Excluir</button></td></tr>`).join("") : vazio(6, "Nenhuma férias programada daqui para frente.");
      calendario();
    }
    function calendario() {
      const hoje = new Date(dados.hoje + "T12:00:00Z");
      const marcados = new Map();
      dados.ferias.forEach(f => { for (let d = new Date(f.inicio + "T12:00:00Z"); d <= new Date(f.fim + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) { const k = d.toISOString().slice(0, 10); marcados.set(k, [...(marcados.get(k) || []), f.nome]); } });
      const ultimo = dados.ferias.reduce((m, f) => (f.fim > m ? f.fim : m), dados.hoje);
      const nMeses = Math.min(12, Math.max(3, (Number(ultimo.slice(0, 4)) - hoje.getUTCFullYear()) * 12 + Number(ultimo.slice(5, 7)) - hoje.getUTCMonth()));
      let html = "";
      for (let i = 0; i < nMeses; i++) {
        const m = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + i, 1, 12));
        const nome = m.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
        const total = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
        let cel = ["D", "S", "T", "Q", "Q", "S", "S"].map(x => `<span class="h">${x}</span>`).join("") + "<span></span>".repeat(m.getUTCDay());
        for (let d = 1; d <= total; d++) { const k = `${m.toISOString().slice(0, 8)}${String(d).padStart(2, "0")}`; const q = marcados.get(k); cel += `<span${q ? ` class="f" title="${esc(q.join(", "))}"` : ""}>${d}</span>`; }
        html += `<div class="adm-mes"><h4>${nome}</h4><div class="adm-dias">${cel}</div></div>`;
      }
      $("#fCal").innerHTML = html;
    }
    $("#fNovo").onclick = () => {
      if (!dados) return;
      $("#fForm").innerHTML = `<div class="adm-form"><h3>Lançar férias</h3>${dados.pessoas.length ? "" : `<div class="note warn">Cadastre pessoas CLT na aba Pessoal primeiro.</div>`}<div class="adm-grid">
        <label>Pessoa (CLT)<select id="vP"><option value="">Escolha</option>${dados.pessoas.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("")}</select></label>
        <label>Início<input id="vI" type="date"></label><label>Fim<input id="vF" type="date"></label><label class="full">Observação<input id="vO"></label></div>
        <div class="adm-bar"><button class="btn primary" id="vOk" type="button">Salvar</button><button class="btn" id="vNo" type="button">Cancelar</button><span id="vMsg" class="adm-sub"></span></div></div>`;
      $("#vNo").onclick = () => { $("#fForm").innerHTML = ""; };
      $("#vOk").onclick = async () => {
        try { await api("ferias.salvar", { pessoaId: $("#vP").value, inicio: $("#vI").value, fim: $("#vF").value, obs: $("#vO").value });
          ctx.toast("Férias lançadas"); $("#fForm").innerHTML = ""; carregar(); } catch (e) { $("#vMsg").textContent = e.message; }
      };
    };
    let armado = null;
    el.addEventListener("click", async ev => {
      if (ev.target.dataset.a !== "del") return;
      const id = ev.target.closest("tr").dataset.id;
      if (armado !== id) { armado = id; ev.target.textContent = "Confirmar"; return; }
      try { await api("ferias.excluir", { id }); ctx.toast("Excluído"); carregar(); } catch (e) { ctx.toast(e.message); }
    });
    async function mostrarIcs(novo) {
      try {
        const j = novo ? await api("ics.link", { novo: true }) : await api("ics.link");
        const pessoas = dados ? dados.pessoas : [];
        $("#fIcsBox").innerHTML = `<div class="adm-form"><h3>Calendário das férias (.ics)</h3>
          <p class="adm-sub" style="margin-top:0">Link secreto: quem tiver o link vê as férias programadas. Para o Google Agenda: Outras agendas → “+” → “Do URL” e cole o link. Para baixar o arquivo, use “Baixar .ics”.</p>
          <div class="adm-grid"><label>Quem<select id="iP"><option value="">Todas as próximas férias</option>${pessoas.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join("")}</select></label>
          <label class="full">Link<input id="iUrl" readonly></label></div>
          <div class="adm-bar"><button class="btn primary" id="iCopy" type="button">Copiar link</button><a class="btn" id="iBaixar" target="_blank" rel="noopener">Baixar .ics</a>
          <span style="flex:1"></span><button class="btn" id="iNovo" type="button">Gerar novo link (o antigo para de funcionar)</button><button class="btn" id="iFechar" type="button">Fechar</button></div></div>`;
        const atual = () => { const u = j.base + ($("#iP").value ? "&p=" + encodeURIComponent($("#iP").value) : ""); $("#iUrl").value = u; $("#iBaixar").href = u; };
        $("#iP").onchange = atual; atual();
        $("#iCopy").onclick = async () => { try { await navigator.clipboard.writeText($("#iUrl").value); ctx.toast("Link copiado"); } catch { $("#iUrl").select(); } };
        $("#iNovo").onclick = () => mostrarIcs(true);
        $("#iFechar").onclick = () => { $("#fIcsBox").innerHTML = ""; };
      } catch (e) { ctx.toast(e.message); }
    }
    $("#fIcs").onclick = () => mostrarIcs(false);
    return carregar;
  }

  // ---------- Registro das quatro abas ----------
  const MONTAR = { contratos, assinaturas, pessoal, ferias };
  Object.entries(MONTAR).forEach(([id, montar]) => {
    let recarregar = null;
    // Os dados só são buscados quando a aba está aberta (assim a auditoria de Pessoal registra só consultas de verdade).
    QZ.modulo({ id, iniciar(ctx) { recarregar = montar(ctx); if (!ctx.el.hidden) recarregar(); }, aoMostrar() { if (recarregar) recarregar(); } });
  });
})();
