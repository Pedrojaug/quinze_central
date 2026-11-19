// 02 Aprovação de peças: Envio, Fila de aprovação e Dashboard mensal.
// Tudo pela rota /api/m?r=pec/... (o servidor confere quem envia, quem decide e quem vê).
// Os arquivos vão do navegador direto para o armazenamento, com um token de envio gerado pelo servidor para cada arquivo.
  window.__qzPec = true;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const brHora = iso => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  const brDia = iso => (iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");
  const mesBr = m => (m ? ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][+m.slice(5, 7) - 1] + " de " + m.slice(0, 4) : "");
  const mb = n => (n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");

  const hojeSp = () => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  };
  const somarDiasIso = (iso, n) => {
    const [y, m, d] = String(iso).split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
    return dt.toISOString().slice(0, 10);
  };
  const diaSpDeIso = iso => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      if (isNaN(d)) return "";
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
    } catch { return ""; }
  };
  const intervaloPeriodo = tipo => {
    const h = hojeSp();
    if (tipo === "hoje") return { de: h, ate: h, rotulo: "Hoje (" + brDia(h + "T12:00:00Z") + ")" };
    if (tipo === "ontem") {
      const ont = somarDiasIso(h, -1);
      return { de: ont, ate: ont, rotulo: "Ontem (" + brDia(ont + "T12:00:00Z") + ")" };
    }
    if (tipo === "semana") {
      const [y, m, d] = h.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d, 12));
      const diaSem = dt.getUTCDay();
      const volta = diaSem === 0 ? 6 : diaSem - 1;
      const seg = somarDiasIso(h, -volta);
      return { de: seg, ate: h, rotulo: "Essa semana (" + brDia(seg + "T12:00:00Z") + " a " + brDia(h + "T12:00:00Z") + ")" };
    }
    if (tipo === "mes" || tipo === "este_mes") {
      const inicio = h.slice(0, 7) + "-01";
      return { de: inicio, ate: h, rotulo: "Esse mês (" + brDia(inicio + "T12:00:00Z") + " a " + brDia(h + "T12:00:00Z") + ")" };
    }
    return { de: null, ate: null, rotulo: "" };
  };
  const pecaBatePeriodo = (p, statusFiltro, de, ate) => {
    if (!de && !ate) return true;
    if (["aprovada", "reprovada", "alteracao_solicitada"].includes(statusFiltro)) {
      const ev = (p.historico || []).slice().reverse().find(h => h.tipo === statusFiltro);
      const dia = diaSpDeIso(ev?.em || p.decididoEm || p.atualizadoEm);
      if (!dia) return false;
      return (!de || dia >= de) && (!ate || dia <= ate);
    }
    if (statusFiltro === "pendente") {
      const ultV = p.versoes && p.versoes[p.versoes.length - 1];
      const dia = diaSpDeIso(ultV?.enviadaEm || p.atualizadoEm || p.criadoEm);
      if (!dia) return false;
      return (!de || dia >= de) && (!ate || dia <= ate);
    }
    const datas = [];
    if (p.decididoEm) datas.push(diaSpDeIso(p.decididoEm));
    if (p.criadoEm) datas.push(diaSpDeIso(p.criadoEm));
    if (p.atualizadoEm) datas.push(diaSpDeIso(p.atualizadoEm));
    for (const v of p.versoes || []) if (v.enviadaEm) datas.push(diaSpDeIso(v.enviadaEm));
    for (const h of p.historico || []) if (h.em) datas.push(diaSpDeIso(h.em));
    return datas.some(dia => (!de || dia >= de) && (!ate || dia <= ate));
  };
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
  const ACAO = { envio: "enviou", reenvio: "reenviou", edicao_aprovada: "editou material aprovado", edicao: "editou material", aprovada: "aprovou", reprovada: "reprovou", alteracao_solicitada: "pediu alteração", comentario: "comentou" };

  // Extrai o ID do arquivo em links do Google Drive (para incorporar player de vídeo / Reels)
  function extrairDriveFileId(urlBruta) {
    const s = String(urlBruta || "").trim();
    if (!s) return "";
    const m1 = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(s);
    if (m1) return m1[1];
    const m2 = /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
    if (m2) return m2[1];
    return "";
  }

  // Modal de confirmação com Senha Mestre para apagar peça ou fila
  function pedirSenhaMestre(titulo, descricao) {
    return new Promise(resolve => {
      let dlg = document.getElementById("qzDlgMestrePecas");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "qzDlgMestrePecas";
        dlg.style.cssText = "border:1px solid var(--line);border-radius:14px;padding:20px 22px;max-width:420px;width:92vw;box-shadow:0 18px 48px rgba(0,0,0,.18)";
        document.body.appendChild(dlg);
      }
      dlg.innerHTML = `<form method="dialog" style="margin:0">
        <h3 style="margin:0 0 6px;font-size:17px">${esc(titulo)}</h3>
        <p class="pc-sub" style="margin:0 0 12px">${esc(descricao)}</p>
        <label style="display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:var(--ink2)">
          Senha mestre
          <input type="password" id="qzInpMestrePecas" placeholder="Digite a senha mestre…" autocomplete="current-password" style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:8px">
        </label>
        <div class="pc-bar" style="justify-content:flex-end;margin-top:14px">
          <button class="btn" type="button" id="qzNoMestrePecas">Cancelar</button>
          <button class="btn primary" type="submit" id="qzOkMestrePecas" style="background:var(--danger);border-color:var(--danger)">Confirmar exclusão</button>
        </div>
      </form>`;
      const inp = dlg.querySelector("#qzInpMestrePecas");
      const fechar = val => { try { dlg.close(); } catch {} resolve(val); };
      dlg.querySelector("#qzNoMestrePecas").onclick = () => fechar(null);
      dlg.querySelector("form").onsubmit = ev => { ev.preventDefault(); fechar(inp.value.trim() || null); };
      dlg.oncancel = () => resolve(null);
      dlg.showModal();
      setTimeout(() => inp.focus(), 30);
    });
  }

  // Visualizador ampliado (Lightbox) para imagens (com navegação em carrossel), vídeos e players do Drive
  function abrirModalMidia({ tipo, url, titulo, linkExterno, labelExterno, galeria, indice }) {
    let dlg = document.getElementById("qzDlgMidiaPecas");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "qzDlgMidiaPecas";
      dlg.style.cssText = "border:1px solid var(--line);border-radius:14px;padding:0;max-width:960px;width:94vw;max-height:92vh;box-shadow:0 24px 60px rgba(0,0,0,.28);background:var(--card);overflow:hidden";
      document.body.appendChild(dlg);
      dlg.addEventListener("click", ev => { if (ev.target === dlg) dlg.close(); });
      dlg.addEventListener("close", () => {
        dlg.querySelectorAll("video,iframe").forEach(el => { if (el.tagName === "VIDEO") el.pause(); else el.src = "about:blank"; });
      });
    }
    const lista = Array.isArray(galeria) && galeria.length > 1 ? galeria : null;
    let idx = lista ? Math.max(0, Math.min(lista.length - 1, Number(indice) || 0)) : 0;

    const renderizar = () => {
      const atual = lista ? lista[idx] : { url, titulo, linkExterno, labelExterno };
      let corpo = "";
      if (tipo === "img") {
        corpo = `<div style="background:#0F172A;display:flex;align-items:center;justify-content:center;padding:12px;max-height:76vh;overflow:auto;position:relative">
          <img src="${esc(atual.url)}" alt="${esc(atual.titulo || "")}" style="max-width:100%;max-height:72vh;object-fit:contain;border-radius:6px;display:block">
        </div>`;
      } else if (tipo === "video") {
        corpo = `<div style="background:#000;padding:8px"><video controls autoplay src="${esc(atual.url)}" style="width:100%;max-height:74vh;display:block;border-radius:6px"></video></div>`;
      } else if (tipo === "drive") {
        corpo = `<div style="background:#000"><iframe src="${esc(atual.url)}" allow="autoplay; fullscreen" allowfullscreen style="width:100%;height:74vh;border:0;display:block"></iframe></div>`;
      }
      const navHtml = lista ? `<div style="display:flex;align-items:center;gap:4px">
        <button class="btn small" type="button" id="qzPrevMidiaPecas" title="Imagem anterior (←)">◀</button>
        <span style="font-size:12px;color:var(--ink2);font-weight:600;min-width:44px;text-align:center">${idx + 1} / ${lista.length}</span>
        <button class="btn small" type="button" id="qzNextMidiaPecas" title="Próxima imagem (→)">▶</button>
      </div>` : "";
      dlg.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);background:#FAFBFD;flex-wrap:wrap">
          <b style="font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:140px">${esc(atual.titulo || "Visualização do material")}</b>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            ${navHtml}
            ${atual.linkExterno ? `<a class="btn small" href="${esc(atual.linkExterno)}" target="_blank" rel="noopener" style="text-decoration:none">${esc(atual.labelExterno || "Abrir original ↗")}</a>` : ""}
            <button class="btn small" type="button" id="qzFecharMidiaPecas" aria-label="Fechar">✕ Fechar</button>
          </div>
        </div>
        ${corpo}`;
      dlg.querySelector("#qzFecharMidiaPecas").onclick = () => dlg.close();
      const prevBtn = dlg.querySelector("#qzPrevMidiaPecas");
      const nextBtn = dlg.querySelector("#qzNextMidiaPecas");
      if (prevBtn) prevBtn.onclick = () => { idx = (idx - 1 + lista.length) % lista.length; renderizar(); };
      if (nextBtn) nextBtn.onclick = () => { idx = (idx + 1) % lista.length; renderizar(); };
    };

    dlg._navMidia = lista ? (dir) => { idx = (idx + dir + lista.length) % lista.length; renderizar(); } : null;
    renderizar();
    if (!dlg.open) dlg.showModal();
  }

  if (!window.__qzPecMidiaListener) {
    window.__qzPecMidiaListener = true;
    document.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-midia-expandir]");
      if (!btn) return;
      ev.preventDefault();
      let galeria = null, indice = 0;
      if (btn.dataset.midiaTipo === "img") {
        const scope = btn.closest(".pc-thumbs-grid, .pc-media-pane");
        if (scope) {
          const vistos = new Set();
          const itens = [];
          scope.querySelectorAll('[data-midia-expandir][data-midia-tipo="img"]').forEach(el => {
            const u = el.dataset.midiaUrl;
            if (!u || vistos.has(u)) return;
            vistos.add(u);
            itens.push({ url: u, titulo: el.dataset.midiaTitulo, linkExterno: el.dataset.midiaExt, labelExterno: el.dataset.midiaExtLabel });
          });
          if (itens.length > 1) {
            galeria = itens;
            indice = Math.max(0, itens.findIndex(x => x.url === btn.dataset.midiaUrl));
          }
        }
      }
      abrirModalMidia({
        tipo: btn.dataset.midiaTipo,
        url: btn.dataset.midiaUrl,
        titulo: btn.dataset.midiaTitulo,
        linkExterno: btn.dataset.midiaExt,
        labelExterno: btn.dataset.midiaExtLabel,
        galeria,
        indice
      });
    });
    document.addEventListener("keydown", ev => {
      const dlg = document.getElementById("qzDlgMidiaPecas");
      if (!dlg || !dlg.open || !dlg._navMidia) return;
      if (ev.key === "ArrowLeft") { ev.preventDefault(); dlg._navMidia(-1); }
      else if (ev.key === "ArrowRight") { ev.preventDefault(); dlg._navMidia(1); }
    });
  }
