// 05 Políticas da empresa: Código de ética (todos os perfis).
// Publicar e ver a lista de leituras: só Mestre e gestão (conferido no servidor, rota /api/m?r=pol/...).
(function () {
  if (window.__qzPol) return; window.__qzPol = true;

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const data = iso => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
  const dataHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  async function api(r, body) {
    const res = await fetch("/api/m?r=pol/" + r, { method: body ? "POST" : "GET", credentials: "same-origin",
      headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(j.msg || (res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.")), { code: j.code, status: res.status });
    return j;
  }
  const lerArquivo = file => new Promise((ok, erro) => {
    if (!file) return ok(null);
    if (file.size > 3 * 1024 * 1024) return erro(new Error("O PDF passa de 3 MB."));
    const fr = new FileReader();
    fr.onload = () => ok({ nome: file.name, b64: String(fr.result).split(",")[1] || "" });
    fr.onerror = () => erro(new Error("Não deu para ler o arquivo."));
    fr.readAsDataURL(file);
  });

  if (!document.getElementById("qzPolCss")) {
    const st = document.createElement("style"); st.id = "qzPolCss";
    st.textContent = `
      .pol-h{display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}.pol-h h2{margin:0}.pol-h .sp{flex:1}
      .pol-sub{font-size:12.5px;color:var(--ink2)}
      .pol-card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:14px}
      .pol-card h3{margin:0 0 10px;font-size:16px;display:flex;gap:10px;align-items:center}
      .pol-doc{white-space:pre-wrap;line-height:1.6;max-height:60vh;overflow:auto;font-size:15px;padding-right:6px}
      .pol-pdf{width:100%;height:70vh;border:1px solid var(--line);border-radius:8px}
      .pol-st{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-radius:10px;margin-bottom:14px;font-size:15px}
      .pol-st.ok{background:#E6F6EC;color:#1B6B3A}.pol-st.pend{background:#FFF8E6;color:#6B4E00;border:1px solid #F2DDA4}
      .pol-tbl{width:100%;border-collapse:collapse;font-size:14px}
      .pol-tbl th{font-size:12.5px;color:var(--ink2);font-weight:600;text-align:left;padding:8px;border-bottom:1px solid var(--line)}
      .pol-tbl td{padding:8px;border-bottom:1px solid var(--line2)}
      .pol-tag{font-size:12px;padding:2px 8px;border-radius:20px;font-weight:600}.pol-tag.lido{background:#E6F6EC;color:#1B6B3A}.pol-tag.pendente{background:#FFF4DE;color:#8A5A00}
      .pol-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
      .pol-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink2)}.pol-grid .full{grid-column:1/-1}
      .pol-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}`;
    document.head.appendChild(st);
  }

  function etica(ctx) {
    const el = ctx.el; let d = null;
    const $ = s => el.querySelector(s);
    async function carregar() {
      try { d = await api("etica"); } catch (e) { el.innerHTML = `<div class="note warn">${esc(e.message)}</div>`; return; }
      const v = d.versao;
      let html = `<div class="pol-h"><div><h2>Código de ética</h2><div class="pol-sub">${v ? `Versão ${v.numero}, publicada em ${data(v.publicadoEm)} por ${esc(v.publicadoPor?.nome || "")}` : "Documento da Quinze para toda a equipe."}</div></div><span class="sp"></span>
        ${d.podePublicar ? `<button class="btn${v ? "" : " primary"}" type="button" id="pPub">${v ? "Publicar nova versão" : "Publicar o código de ética"}</button>` : ""}</div><div id="pPubBox"></div>`;
      if (!v) {
        html += `<div class="emptybig" style="padding:48px 20px;text-align:center"><p style="font-size:18px;margin:0 0 6px"><b>O código de ética será publicado em breve</b></p>
          <p class="pol-sub" style="margin:0">Quando a gestão publicar, ele aparece aqui para leitura.</p></div>`;
      } else {
        const ml = d.minhaLeitura;
        html += ml ? `<div class="pol-st ok">✓ Você leu a versão ${ml.versao} em ${data(ml.em)}.</div>`
          : `<div class="pol-st pend"><span><b>Leitura pendente.</b> Leia o documento abaixo e confirme no final.</span></div>`;
        const arq = `/api/m?r=pol/etica.arquivo&v=${v.numero}`;
        html += `<div class="pol-card"><h3>${esc(v.titulo)} <span class="pol-sub">v${v.numero}</span><span style="flex:1"></span>
          ${v.tipo === "pdf" ? `<a class="btn" href="${arq}" target="_blank" rel="noopener">Baixar PDF</a>` : `<button class="btn" type="button" id="pBaixarTxt">Baixar texto</button>`}</h3>
          ${v.tipo === "pdf" ? `<iframe class="pol-pdf" src="${arq}&ver=1" title="Código de ética"></iframe>` : `<div class="pol-doc">${esc(v.texto)}</div>`}
          ${ml ? "" : `<div class="pol-bar"><button class="btn primary" type="button" id="pCiente">Li e estou ciente</button><span class="pol-sub" id="pMsg">Fica registrado seu nome, perfil, data e hora e a versão lida. Não dá para desfazer.</span></div>`}</div>`;
        if (d.minhasLeituras.length > (ml ? 1 : 0)) html += `<p class="pol-sub">Suas leituras: ${d.minhasLeituras.map(l => `v${l.versao} em ${data(l.em)}`).join(" · ")}</p>`;
      }
      if (d.podePublicar && v) html += `<div class="pol-card" id="pLeit"><p class="pol-sub" style="margin:0">Carregando quem já leu…</p></div>`;
      el.innerHTML = html;
      if (d.podePublicar) $("#pPub").onclick = publicarForm;
      if ($("#pCiente")) $("#pCiente").onclick = async ev => {
        ev.target.disabled = true;
        try { await api("etica.ciente", { versao: v.numero }); ctx.toast("Leitura registrada"); carregar(); } catch (e) { $("#pMsg").textContent = e.message; ev.target.disabled = false; }
      };
      if ($("#pBaixarTxt")) $("#pBaixarTxt").onclick = () => {
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([v.texto], { type: "text/plain;charset=utf-8" }));
        a.download = `codigo-de-etica-v${v.numero}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      };
      if (d.podePublicar && v) leituras();
    }
    async function leituras() {
      try {
        const s = await api("etica.leituras");
        $("#pLeit").innerHTML = `<h3>Quem já leu a versão ${s.versao.numero} <span class="pol-sub">${s.lidos} de ${s.total}</span><span style="flex:1"></span>
          <a class="btn" href="/api/m?r=pol/etica.csv" target="_blank" rel="noopener">Exportar CSV</a></h3>
          <div style="overflow-x:auto"><table class="pol-tbl"><thead><tr><th>Nome</th><th>Perfil</th><th>Status</th><th>Data e hora</th></tr></thead><tbody>
          ${s.lista.map(x => `<tr><td><b>${esc(x.nome)}</b><div class="pol-sub">${esc(x.login)}</div></td><td>${esc(x.perfil)}</td><td><span class="pol-tag ${x.status}">${x.status === "lido" ? "Lido" : "Pendente"}</span></td><td>${dataHora(x.em)}</td></tr>`).join("")}</tbody></table></div>
          ${s.versoes.length > 1 ? `<p class="pol-sub">Histórico: ${s.versoes.map(x => `v${x.numero} (${data(x.publicadoEm)}, ${x.leituras} leitura${x.leituras === 1 ? "" : "s"})${x.arquivo ? ` <a href="/api/m?r=pol/etica.arquivo&v=${x.numero}" target="_blank" rel="noopener">PDF</a>` : ""}`).join(" · ")}</p>` : ""}`;
      } catch (e) { $("#pLeit").innerHTML = `<div class="note warn">${esc(e.message)}</div>`; }
    }
    function publicarForm() {
      if ($("#pPubBox").innerHTML) { $("#pPubBox").innerHTML = ""; return; }
      $("#pPubBox").innerHTML = `<div class="pol-card" style="border-color:var(--blue)"><h3>${d.versao ? `Publicar a versão ${d.versao.numero + 1}` : "Publicar a versão 1"}</h3>
        ${d.versao ? `<div class="note warn" style="margin-bottom:12px">Ao publicar uma nova versão, todos voltam a ficar com leitura pendente. As leituras das versões anteriores ficam no histórico.</div>` : ""}
        <div class="pol-grid"><label>Título<input id="uTit" value="Código de ética"></label><label>Arquivo PDF (até 3 MB)<input id="uArq" type="file" accept=".pdf,application/pdf"></label>
          <label class="full">ou cole o texto<textarea id="uTxt" rows="8" placeholder="Cole aqui o texto, se não for usar PDF"></textarea></label></div>
        <div class="pol-bar"><button class="btn primary" type="button" id="uOk">Publicar</button><button class="btn" type="button" id="uNo">Cancelar</button><span class="pol-sub" id="uMsg"></span></div></div>`;
      $("#uNo").onclick = () => { $("#pPubBox").innerHTML = ""; };
      $("#uOk").onclick = async ev => {
        ev.target.disabled = true; $("#uMsg").textContent = "Publicando…";
        try {
          const arquivo = await lerArquivo($("#uArq").files[0]);
          await api("etica.publicar", arquivo ? { titulo: $("#uTit").value, arquivo } : { titulo: $("#uTit").value, texto: $("#uTxt").value });
          ctx.toast("Código de ética publicado"); carregar();
        } catch (e) { $("#uMsg").textContent = e.message; ev.target.disabled = false; }
      };
    }
    return carregar;
  }

  let recarregar = null;
  QZ.modulo({ id: "etica", iniciar(ctx) { recarregar = etica(ctx); if (!ctx.el.hidden) recarregar(); }, aoMostrar() { if (recarregar) recarregar(); } });
})();
