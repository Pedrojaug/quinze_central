// Helpers compartilhados do Painel Dev (/dev)
const DEV = (window.__QZ_DEV = window.__QZ_DEV || {});

DEV.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

DEV.brHora = iso => {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

DEV.tempoRelativo = iso => {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return DEV.brHora(iso).slice(0, 10);
};

DEV.toast = msg => {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = String(msg || "");
  el.classList.add("show");
  clearTimeout(DEV._toastT);
  DEV._toastT = setTimeout(() => el.classList.remove("show"), 3200);
};

DEV.armarConfirmacao = (btn, { rotulo = "Confirmar exclusão?", timeoutMs = 4000 } = {}) => {
  if (!btn) return false;
  if (btn.dataset.devArm === "1") {
    clearTimeout(btn._devArmT);
    btn.dataset.devArm = "";
    if (btn.dataset.devOrig !== undefined) btn.textContent = btn.dataset.devOrig;
    return true;
  }
  btn.dataset.devOrig = btn.textContent;
  btn.dataset.devArm = "1";
  btn.textContent = rotulo;
  clearTimeout(btn._devArmT);
  btn._devArmT = setTimeout(() => {
    btn.dataset.devArm = "";
    if (btn.dataset.devOrig !== undefined) btn.textContent = btn.dataset.devOrig;
  }, timeoutMs);
  return false;
};

DEV.api = async (acao, body, opt = {}) => {
  let url = `/api/m?r=sup/${encodeURIComponent(acao)}`;
  if (opt.query && typeof opt.query === "object") {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opt.query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
    const extra = qs.toString();
    if (extra) url += `&${extra}`;
  }
  const temBody = body !== undefined;
  const method = opt.method || (temBody ? "POST" : "GET");
  const r = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: temBody ? { "content-type": "application/json" } : undefined,
    body: temBody ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) {
    location.href = "/?next=" + encodeURIComponent(location.pathname + location.search);
    throw new Error("Sessão expirada.");
  }
  if (!r.ok) {
    throw new Error(j.msg || j.erro || "Erro na requisição.");
  }
  return j;
};

DEV.abrirLightbox = url => {
  if (!url) return;
  const old = document.getElementById("devLightbox");
  if (old) old.remove();
  const wrap = document.createElement("div");
  wrap.id = "devLightbox";
  wrap.className = "dev-lb";
  wrap.innerHTML = `<button type="button" class="dev-lb-close" aria-label="Fechar imagem">×</button><img src="${DEV.esc(url)}" alt="Print ampliado">`;
  const fechar = () => wrap.remove();
  wrap.addEventListener("click", ev => {
    if (ev.target === wrap || ev.target.closest(".dev-lb-close")) fechar();
  });
  document.addEventListener("keydown", function onKey(ev) {
    if (ev.key === "Escape") {
      fechar();
      document.removeEventListener("keydown", onKey);
    }
  });
  document.body.appendChild(wrap);
};

DEV.exportarCsv = chamados => {
  const cel = v => {
    let s = String(v ?? "").replace(/\r?\n/g, " ");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const cab = ["ID", "Status", "Urgente", "Reaberturas", "Tipo", "Área", "Solicitante", "Login", "Função", "Descrição", "Mensagem de resolução", "Criado em", "Finalizado em"];
  const linhas = [cab.map(cel).join(";")];
  for (const r of chamados || []) {
    linhas.push([
      `#${r.id}`, r.status_rotulo, r.urgente ? "Sim" : "Não", r.reaberturas_count || 0,
      r.tipo_rotulo, r.area_rotulo, r.usuario_nome, r.usuario_login, r.usuario_funcao,
      r.descricao, r.resposta_usuario, r.criado_em, r.finalizado_em || "",
    ].map(cel).join(";"));
  }
  const blob = new Blob([`\uFEFF${linhas.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `suporte-central-quinze-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};
