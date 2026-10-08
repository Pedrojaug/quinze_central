// 02 Aprovação de peças: Envio, Fila de aprovação e Dashboard mensal.
// Tudo pela rota /api/m?r=pec/... (o servidor confere quem envia, quem decide e quem vê).
// Os arquivos vão do navegador direto para o armazenamento, com um token de envio gerado pelo servidor para cada arquivo.
(function () {
  if (window.__qzPec) return; window.__qzPec = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const brDia = iso => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
  const mesBr = m => (m ? ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][+m.slice(5, 7) - 1] + " de " + m.slice(0, 4) : "");
  const mb = n => (n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
  async function api(r, body) {
    const res = await fetch("/api/m?r=pec/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || (res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.")), { code: j.code, status: res.status });
    return j;
  }
  let base = null;
  const carregarBase = async () => (base ||= await api("inicio"));
  const arqUrl = (p, v, a) => `/api/m?r=pec/peca.arquivo&id=${encodeURIComponent(p.id)}&v=${v.n}&i=${a.i}`;
  const ST = { pendente: "Pendente", aprovada: "Aprovada", reprovada: "Reprovada", alteracao_solicitada: "Alteração solicitada" };
  const ACAO = { envio: "enviou", reenvio: "reenviou", aprovada: "aprovou", reprovada: "reprovou", alteracao_solicitada: "pediu alteração" };

  if (!document.getElementById("qzPecCss")) {
    const st = document.createElement("style"); st.id = "qzPecCss";
    st.textContent = `
      .pc-h{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}.pc-h h2{margin:0}.pc-h .sp{flex:1}
      .pc-sub{font-size:12.5px;color:var(--ink2)}
      .pc-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
      .pc-card.form{border-color:var(--blue)}
      .pc-top{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}.pc-top .t{flex:1;min-width:200px}.pc-top b{font-size:15px}
      .pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .pc-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2)}.pc-grid .full{grid-column:1/-1}
      .pc-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
      .st{font-size:12px;padding:2px 9px;border-radius:20px;white-space:nowrap;font-weight:600}
      .st.pendente{background:#FFF4DE;color:#8A5A00}.st.aprovada{background:#E6F6EC;color:#1B6B3A}
      .st.reprovada{background:#FDE8E8;color:#A12020}.st.alteracao_solicitada{background:#E5EFFC;color:#1D4F91}
      .pc-drop{border:1.5px dashed var(--line);border-radius:10px;padding:16px;text-align:center;color:var(--ink2);font-size:13px;cursor:pointer;background:#FAFBFD}
      .pc-drop.on{border-color:var(--blue);background:var(--blue-soft)}
      .pc-fs{margin-top:8px;display:grid;gap:6px}
      .pc-f{display:grid;grid-template-columns:minmax(0,1fr) 120px 70px auto;gap:8px;align-items:center;font-size:13px}
      .pc-f .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pc-prog{height:6px;background:var(--line2);border-radius:4px;overflow:hidden}.pc-prog i{display:block;height:100%;background:var(--blue);width:0;transition:width .15s}
      .pc-f.ok .pc-prog i{background:var(--ok)}.pc-f.erro{color:var(--danger)}
      .pc-thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .pc-th{width:120px;height:96px;border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#F6F8FB;font-size:12px;color:var(--ink2);text-align:center;text-decoration:none}
      .pc-th img{width:100%;height:100%;object-fit:cover}
      .pc-th.exp{border-style:dashed;padding:6px}
      .pc-links{margin:6px 0 0;padding-left:18px;font-size:13px}
      .pc-ver{border-top:1px solid var(--line2);margin-top:10px;padding-top:10px}
      .pc-ver summary{cursor:pointer;font-size:13px;color:var(--ink2)}
      .pc-hist{margin:8px 0 0;padding:0;list-style:none;font-size:13px}
      .pc-hist li{padding:6px 0;border-top:1px solid var(--line2)}.pc-hist li:first-child{border-top:0}
      .pc-hist .c{display:block;margin-top:2px;white-space:pre-wrap;color:var(--ink)}
      .pc-dec{background:#FAFBFD;border:1px solid var(--line2);border-radius:10px;padding:10px 12px;margin-top:12px}
      .pc-dec textarea{width:100%;min-height:56px}
      .pc-filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px}
      .pc-filtros label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--ink2)}
      .pc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
      .pc-kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
      .pc-kpi b{display:block;font:700 26px/1 var(--display);font-variant-numeric:tabular-nums}.pc-kpi span{font-size:13px;color:var(--ink2)}
      .pc-kpi em{display:block;font-style:normal;font-size:12px;color:var(--ink2);margin-top:3px}
      .pc-tbl{width:100%;border-collapse:collapse;font-size:14px}
      .pc-tbl th{font-size:12.5px;color:var(--ink2);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line)}
      .pc-tbl td{padding:8px;border-bottom:1px solid var(--line2)}.pc-tbl .num{text-align:right;font-variant-numeric:tabular-nums}
      .pc-barras{display:grid;gap:8px}.pc-barras .l{display:grid;grid-template-columns:160px minmax(0,1fr) 40px;gap:10px;align-items:center;font-size:13px}
      .pc-barras .b{height:14px;background:var(--line2);border-radius:4px;overflow:hidden}.pc-barras .b i{display:block;height:100%;background:var(--blue)}
      .pc-barras .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pc-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:900px){.pc-2{grid-template-columns:1fr}}
      .pc-vazio{padding:18px;text-align:center;color:var(--ink2);font-size:14px}`;
    document.head.appendChild(st);
  }

  // ---------- Envio dos arquivos direto ao armazenamento ----------
  function enviarArquivo(file, onProg) {
    return new Promise(async (ok, erro) => {
      let t;
      try { t = await api("upload.token", { nome: file.name, tipo: file.type, tamanho: file.size }); } catch (e) { return erro(e); }
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", t.url, true);
      Object.entries(t.headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.setRequestHeader("x-content-type", t.tipo);
      xhr.setRequestHeader("x-content-length", String(file.size));
      xhr.setRequestHeader("x-api-blob-request-id", Math.random().toString(16).slice(2) + Date.now());
      xhr.setRequestHeader("x-api-blob-request-attempt", "0");
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProg(e.loaded / e.total); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? ok({ chave: t.chave, nome: file.name }) : erro(new Error("O armazenamento recusou o arquivo (" + xhr.status + ").")));
      xhr.onerror = () => erro(new Error("Falha de conexão no envio."));
      xhr.send(file);
    });
  }

  // Formulário de envio (nova peça ou nova versão). Devolve um controlador com o HTML montado no "alvo".
  function formEnvio(alvo, { titulo, peca, aoEnviar, aoCancelar }) {
    const nova = !peca;
    const arquivos = [];   // { file, chave, prog, erro, el }
    alvo.innerHTML = `<div class="pc-card form"><h3 style="margin:0 0 12px">${esc(titulo)}</h3><div class="pc-grid">
      ${nova ? `<label>Título da peça<input data-f="titulo" maxlength="160" placeholder="Ex.: Post Dia das Crianças"></label>
      <label>Cliente<select data-f="cliente"><option value="">Escolha</option>${base.clientes.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("")}</select></label>` : ""}
      <label class="full">Observação (opcional)<textarea data-f="obs" rows="2" placeholder="${nova ? "Contexto para quem vai aprovar" : "O que mudou nesta versão"}"></textarea></label>
      <div class="full"><div class="pc-sub" style="margin-bottom:4px">Arquivos (até ${base.maxArquivos}, JPG, PNG ou PDF, até ${base.maxMB} MB cada)</div>
        <div class="pc-drop" data-f="drop">Arraste os arquivos aqui ou <u>clique para escolher</u></div>
        <input type="file" data-f="file" multiple accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf" hidden>
        <div class="pc-fs" data-f="lista"></div></div>
      <label class="full">Links do Google Drive (um por linha, opcional)<textarea data-f="links" rows="2" placeholder="https://drive.google.com/..."></textarea></label></div>
      <div class="pc-bar"><button class="btn primary" type="button" data-f="ok">${nova ? "Enviar peça" : "Enviar nova versão"}</button><button class="btn" type="button" data-f="cancelar">Cancelar</button><span class="pc-sub" data-f="msg"></span></div>
      <p class="pc-sub" style="margin:8px 0 0">Os arquivos ficam disponíveis por ${base.retencaoDias} dias a partir do envio. Links do Drive não expiram.</p></div>`;
    const $ = s => alvo.querySelector(`[data-f="${s}"]`);
    const msg = t => { $("msg").textContent = t; };
    const pintar = a => {
      a.el.className = "pc-f" + (a.erro ? " erro" : a.chave ? " ok" : "");
      a.el.innerHTML = `<span class="n" title="${esc(a.file.name)}">${esc(a.file.name)}</span><span class="pc-prog"><i style="width:${Math.round(a.prog * 100)}%"></i></span>
        <span class="pc-sub">${a.erro ? "erro" : a.chave ? "enviado" : Math.round(a.prog * 100) + "%"}</span><button class="btn" type="button" style="padding:2px 8px;min-height:0" title="Remover">✕</button>`;
      a.el.querySelector("button").onclick = () => { arquivos.splice(arquivos.indexOf(a), 1); a.el.remove(); };
      if (a.erro) a.el.querySelector(".pc-sub").title = a.erro;
    };
    const adicionar = files => {
      for (const file of files) {
        if (arquivos.length >= base.maxArquivos) { msg(`No máximo ${base.maxArquivos} arquivos.`); break; }
        if (!/\.(jpe?g|png|pdf)$/i.test(file.name)) { msg(`"${file.name}": envie JPG, PNG ou PDF.`); continue; }
        if (file.size > base.maxMB * 1048576) { msg(`"${file.name}" passa de ${base.maxMB} MB.`); continue; }
        const a = { file, prog: 0, chave: null, erro: null, el: document.createElement("div") };
        arquivos.push(a); $("lista").appendChild(a.el); pintar(a);
        a.promessa = enviarArquivo(file, p => { a.prog = p; pintar(a); })
          .then(r => { a.chave = r.chave; a.prog = 1; pintar(a); }, e => { a.erro = e.message; pintar(a); });
      }
    };
    $("drop").onclick = () => $("file").click();
    $("file").onchange = () => { adicionar([...$("file").files]); $("file").value = ""; };
    $("drop").ondragover = e => { e.preventDefault(); $("drop").classList.add("on"); };
    $("drop").ondragleave = () => $("drop").classList.remove("on");
    $("drop").ondrop = e => { e.preventDefault(); $("drop").classList.remove("on"); adicionar([...e.dataTransfer.files]); };
    $("cancelar").onclick = () => { alvo.innerHTML = ""; aoCancelar && aoCancelar(); };
    $("ok").onclick = async () => {
      const b = $("ok");
      if (arquivos.some(a => !a.chave && !a.erro)) { msg("Aguarde o fim do envio dos arquivos…"); await Promise.all(arquivos.map(a => a.promessa)); }
      if (arquivos.some(a => a.erro)) return msg("Algum arquivo falhou. Remova-o ou envie de novo.");
      const corpo = { obs: $("obs").value, arquivos: arquivos.map(a => ({ chave: a.chave, nome: a.file.name })),
        links: $("links").value.split(/\s+/).map(s => s.trim()).filter(Boolean) };
      if (nova) Object.assign(corpo, { titulo: $("titulo").value, clienteId: $("cliente").value }); else corpo.id = peca.id;
      b.disabled = true; msg("Salvando…");
      try { const j = await api(nova ? "peca.enviar" : "peca.reenviar", corpo); alvo.innerHTML = ""; aoEnviar && aoEnviar(j.peca); }
      catch (e) { msg(e.message); b.disabled = false; }
    };
    alvo.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Cartão de uma peça (usado no Envio e na Fila) ----------
  function versaoHtml(p, v) {
    const thumbs = v.arquivos.map(a => a.expirado
      ? `<div class="pc-th exp" title="${esc(a.nome)}">arquivo expirado</div>`
      : a.tipo === "application/pdf"
        ? `<a class="pc-th" href="${arqUrl(p, v, a)}" target="_blank" rel="noopener" title="${esc(a.nome)}">PDF<br>${esc(a.nome.slice(0, 28))}</a>`
        : `<a class="pc-th" href="${arqUrl(p, v, a)}" target="_blank" rel="noopener" title="${esc(a.nome)}"><img loading="lazy" src="${arqUrl(p, v, a)}" alt="${esc(a.nome)}"></a>`).join("");
    const links = v.links.length ? `<ul class="pc-links">${v.links.map(l => `<li><a href="${esc(l)}" target="_blank" rel="noopener">${esc(l.length > 70 ? l.slice(0, 70) + "…" : l)}</a></li>`).join("")}</ul>` : "";
    const exp = v.arquivos.length && !v.arquivos.every(a => a.expirado) ? ` · arquivos até ${brDia(v.expiraEm)}` : "";
    return `<div class="pc-sub">Versão ${v.n} · enviada em ${brHora(v.enviadaEm)}${exp}</div>${v.obs ? `<div style="font-size:13px;margin-top:4px">${esc(v.obs)}</div>` : ""}
      ${thumbs ? `<div class="pc-thumbs">${thumbs}</div>` : ""}${links}`;
  }
  function cartao(p, extra) {
    const atual = p.versoes[p.versoes.length - 1], anteriores = p.versoes.slice(0, -1).reverse();
    const hist = p.historico.filter(h => h.tipo !== "envio" || h.comentario).map(h => `<li><b>${esc(h.por?.nome || "")}</b> ${ACAO[h.tipo] || esc(h.tipo)} a versão ${h.versao} · <span class="pc-sub">${brHora(h.em)}</span>${h.comentario ? `<span class="c">${esc(h.comentario)}</span>` : ""}</li>`).join("");
    return `<div class="pc-card" data-id="${esc(p.id)}"><div class="pc-top"><div class="t"><b>${esc(p.titulo)}</b>
        <div class="pc-sub">${esc(p.clienteNome)} · enviada por ${esc(p.remetente?.nome || "")}${p.versao > 1 ? ` · <b>v${p.versao}</b> (reenviada)` : ""}</div></div>
        <span class="st ${p.status}">${ST[p.status]}</span></div>
      <div style="margin-top:8px">${versaoHtml(p, atual)}</div>
      ${anteriores.length ? `<details class="pc-ver"><summary>Versões anteriores (${anteriores.length})</summary>${anteriores.map(v => `<div style="margin-top:8px">${versaoHtml(p, v)}</div>`).join("")}</details>` : ""}
      ${hist ? `<div class="pc-ver"><div class="pc-sub">Comentários e decisões</div><ul class="pc-hist">${hist}</ul></div>` : ""}
      ${extra || ""}</div>`;
  }

  // ======================================================================
  // ENVIO (remetente: vê e reenvia só as suas)
  // ======================================================================
  function envio(ctx) {
    const el = ctx.el;
    el.innerHTML = `<div class="pc-h"><div><h2>Envio de peças</h2><div class="pc-sub">Envie a peça para a fila de aprovação. Você vê aqui só as peças que enviou.</div></div><span class="sp"></span>
      <button class="btn primary" type="button" data-x="nova">Nova peça</button></div>
      <div data-box="form"></div>
      <div class="pc-filtros"><label>Status<select data-x="st"><option value="">Todas</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label></div>
      <div data-box="lista"><div class="pc-vazio">Carregando…</div></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`);
    let lista = [];
    async function carregar() {
      try { await carregarBase(); lista = (await api("pecas")).pecas.filter(p => p.minha); } catch (e) { box("lista").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      render();
    }
    function render() {
      const f = el.querySelector('[data-x="st"]').value;
      const l = lista.filter(p => !f || p.status === f);
      box("lista").innerHTML = l.length ? l.map(p => cartao(p, ["reprovada", "alteracao_solicitada"].includes(p.status)
        ? `<div class="pc-bar"><button class="btn primary" type="button" data-x="reenviar">Enviar nova versão (v${p.versao + 1})</button></div><div data-box="re-${esc(p.id)}"></div>` : "")).join("")
        : `<div class="pc-card pc-vazio">${lista.length ? "Nenhuma peça com esse status." : "Você ainda não enviou peças (ou as enviadas já passaram de " + (base?.retencaoDias || 7) + " dias)."}</div>`;
    }
    el.addEventListener("click", async ev => {
      const x = ev.target.dataset.x;
      if (x === "nova" || x === "reenviar") { try { await carregarBase(); } catch (e) { ctx.toast(e.message); return; } }
      if (x === "nova") formEnvio(box("form"), { titulo: "Nova peça", aoEnviar: () => { ctx.toast("Peça enviada para a fila"); carregar(); } });
      if (x === "reenviar") {
        const id = ev.target.closest("[data-id]").dataset.id, p = lista.find(q => q.id === id);
        formEnvio(el.querySelector(`[data-box="re-${CSS.escape(id)}"]`), { titulo: `Nova versão de "${p.titulo}"`, peca: p, aoEnviar: () => { ctx.toast(`Versão ${p.versao + 1} enviada`); carregar(); } });
      }
    });
    el.addEventListener("change", ev => { if (ev.target.dataset.x === "st") render(); });
    return carregar;
  }

  // ======================================================================
  // FILA DE APROVAÇÃO (coordenador, mestre e gestão decidem)
  // ======================================================================
  function fila(ctx) {
    const el = ctx.el;
    el.innerHTML = `<div class="pc-h"><div><h2>Fila de aprovação</h2><div class="pc-sub" data-box="sub"></div></div></div>
      <div class="pc-filtros"><label>Status<select data-x="st"><option value="pendente">Pendentes (inclui reenviadas)</option><option value="">Todas</option>
        <option value="aprovada">Aprovadas</option><option value="alteracao_solicitada">Alteração solicitada</option><option value="reprovada">Reprovadas</option></select></label>
        <label>Cliente<select data-x="cli"><option value="">Todos</option></select></label><label>Remetente<select data-x="rem"><option value="">Todos</option></select></label></div>
      <div data-box="lista"><div class="pc-vazio">Carregando…</div></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), fv = n => el.querySelector(`[data-x="${n}"]`).value;
    let lista = [];
    const opcoes = (sel, pares) => { const v = sel.value; sel.innerHTML = sel.options[0].outerHTML + pares.map(([k, n]) => `<option value="${esc(k)}">${esc(n)}</option>`).join(""); sel.value = pares.some(([k]) => k === v) ? v : ""; };
    async function carregar() {
      try { await carregarBase(); lista = (await api("pecas")).pecas; } catch (e) { box("lista").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      box("sub").textContent = base.podeDecidir ? "Aprove, reprove ou peça alteração. Reprovar e pedir alteração exigem comentário." : "Acompanhamento das peças.";
      const uniq = f => [...new Map(lista.map(f)).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
      opcoes(el.querySelector('[data-x="cli"]'), uniq(p => [p.clienteId, p.clienteNome]));
      opcoes(el.querySelector('[data-x="rem"]'), uniq(p => [p.remetente.login, p.remetente.nome]));
      render();
    }
    function render() {
      const l = lista.filter(p => (!fv("st") || p.status === fv("st")) && (!fv("cli") || p.clienteId === fv("cli")) && (!fv("rem") || p.remetente.login === fv("rem")))
        .sort((a, b) => fv("st") === "pendente" ? a.atualizadoEm.localeCompare(b.atualizadoEm) : b.atualizadoEm.localeCompare(a.atualizadoEm));
      box("lista").innerHTML = l.length ? l.map(p => cartao(p, base.podeDecidir && p.status === "pendente" && !p.minha ? `<div class="pc-dec">
          <textarea data-c="com" placeholder="Comentário (obrigatório para reprovar ou pedir alteração)"></textarea>
          <div class="pc-bar" style="margin-top:8px"><button class="btn primary" type="button" data-d="aprovada">Aprovar</button>
          <button class="btn" type="button" data-d="alteracao_solicitada">Pedir alteração</button><button class="btn" type="button" data-d="reprovada" style="color:var(--danger)">Reprovar</button>
          <span class="pc-sub" data-c="msg"></span></div></div>` : "")).join("")
        : `<div class="pc-card pc-vazio">${lista.length ? "Nada com esses filtros." : "Nenhuma peça na fila."}</div>`;
    }
    el.addEventListener("click", async ev => {
      const d = ev.target.dataset.d; if (!d) return;
      const card = ev.target.closest("[data-id]"), com = card.querySelector('[data-c="com"]').value.trim(), msg = card.querySelector('[data-c="msg"]');
      if (d !== "aprovada" && !com) { msg.textContent = "Escreva o comentário."; card.querySelector('[data-c="com"]').focus(); return; }
      card.querySelectorAll("[data-d]").forEach(b => { b.disabled = true; });
      try { await api("peca.decidir", { id: card.dataset.id, decisao: d, comentario: com }); ctx.toast(ST[d]); carregar(); }
      catch (e) { msg.textContent = e.message; card.querySelectorAll("[data-d]").forEach(b => { b.disabled = false; }); }
    });
    el.addEventListener("change", ev => { if (ev.target.dataset.x) render(); });
    return carregar;
  }

  // ======================================================================
  // DASHBOARD MENSAL (contadores permanentes, independentes da retenção dos arquivos)
  // ======================================================================
  function dash(ctx) {
    const el = ctx.el;
    el.innerHTML = `<div class="pc-h"><div><h2>Dashboard mensal</h2><div class="pc-sub">Contagens do mês, gravadas a cada envio e decisão. Não zeram quando os arquivos expiram.</div></div><span class="sp"></span>
      <label class="pc-sub">Mês <select data-x="mes"></select></label></div>
      <div class="pc-kpis" data-box="kpis"></div>
      <div class="pc-2"><div class="pc-card"><h3 style="margin:0 0 10px;font-size:15px">Peças enviadas por usuário</h3><div data-box="barras"></div></div>
        <div class="pc-card"><h3 style="margin:0 0 10px;font-size:15px">Decisões por aprovador</h3><div data-box="dec"></div></div></div>
      <div class="pc-card"><h3 style="margin:0 0 10px;font-size:15px">Envios por usuário</h3><div data-box="env"></div></div>
      <div data-box="limpeza"></div>`;
    const box = n => el.querySelector(`[data-box="${n}"]`), sel = el.querySelector('[data-x="mes"]');
    async function carregar() {
      let d;
      try { await carregarBase(); d = await api("dashboard" + (sel.value ? "&mes=" + sel.value : "")); } catch (e) { box("kpis").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      sel.innerHTML = d.meses.map(m => `<option value="${m}"${m === d.mes ? " selected" : ""}>${mesBr(m)}</option>`).join("");
      const t = d.totais;
      box("kpis").innerHTML = [[t.pecas, "Peças enviadas"], [t.versoes, "Versões enviadas"], [t.aprovada, "Aprovadas"], [t.alteracao_solicitada, "Alteração solicitada"], [t.reprovada, "Reprovadas"],
        [t.taxaPrimeira == null ? "—" : t.taxaPrimeira.toLocaleString("pt-BR") + "%", "Aprovação na 1ª versão", t.primeiraDecididas ? `${t.primeiraAprovadas} de ${t.primeiraDecididas} peças decididas na 1ª versão` : "nenhuma decisão na 1ª versão"]]
        .map(([v, r, e]) => `<div class="pc-kpi"><b>${v}</b><span>${r}</span>${e ? `<em>${e}</em>` : ""}</div>`).join("");
      const max = Math.max(1, ...d.enviadas.map(u => u.pecas));
      box("barras").innerHTML = d.enviadas.length ? `<div class="pc-barras">${d.enviadas.map(u => `<div class="l"><span class="nm" title="${esc(u.nome)}">${esc(u.nome)}</span><span class="b"><i style="width:${u.pecas / max * 100}%"></i></span><b class="num">${u.pecas}</b></div>`).join("")}</div>` : `<div class="pc-vazio">Sem envios no mês.</div>`;
      box("dec").innerHTML = d.decisoes.length ? `<table class="pc-tbl"><thead><tr><th>Quem decidiu</th><th class="num">Aprovadas</th><th class="num">Alteração</th><th class="num">Reprovadas</th><th class="num">Total</th></tr></thead><tbody>
        ${d.decisoes.map(c => `<tr><td>${esc(c.nome)}</td><td class="num">${c.aprovada}</td><td class="num">${c.alteracao_solicitada}</td><td class="num">${c.reprovada}</td><td class="num"><b>${c.total}</b></td></tr>`).join("")}</tbody></table>` : `<div class="pc-vazio">Sem decisões no mês.</div>`;
      box("env").innerHTML = d.enviadas.length ? `<table class="pc-tbl"><thead><tr><th>Usuário</th><th class="num">Peças novas</th><th class="num">Versões enviadas</th></tr></thead><tbody>
        ${d.enviadas.map(u => `<tr><td>${esc(u.nome)}</td><td class="num">${u.pecas}</td><td class="num">${u.versoes}</td></tr>`).join("")}
        <tr><td><b>Total</b></td><td class="num"><b>${t.pecas}</b></td><td class="num"><b>${t.versoes}</b></td></tr></tbody></table>` : `<div class="pc-vazio">Sem envios no mês.</div>`;
      box("limpeza").innerHTML = base.veTodas ? `<p class="pc-sub">Arquivos com mais de ${base.retencaoDias} dias são apagados automaticamente todo dia. <button class="btn" type="button" data-x="limpar" style="padding:2px 10px;min-height:0">Rodar a limpeza agora</button> <span data-box="lmsg"></span></p>` : "";
    }
    sel.addEventListener("change", carregar);
    el.addEventListener("click", async ev => {
      if (ev.target.dataset.x !== "limpar") return;
      ev.target.disabled = true;
      try { const r = await api("limpeza.executar", {}); box("lmsg").textContent = `${r.arquivosApagados + r.orfaosApagados} arquivo(s) apagado(s), ${r.pecasRemovidas} peça(s) saíram da fila.`; }
      catch (e) { box("lmsg").textContent = e.message; }
      ev.target.disabled = false;
    });
    return carregar;
  }

  const MONTAR = { envio, fila, pecasdash: dash };
  Object.entries(MONTAR).forEach(([id, montar]) => {
    let recarregar = null;
    // Cada perfil recebe só algumas destas abas: as que não existem para o usuário não são montadas.
    QZ.modulo({ id, iniciar(ctx) { if (!ctx.el) return; recarregar = montar(ctx); if (!ctx.el.hidden) recarregar(); }, aoMostrar() { if (recarregar) recarregar(); } });
  });
})();
