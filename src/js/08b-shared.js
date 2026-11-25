  // ---------- Kit compartilhado para módulos (QZ.fmt, QZ.api, QZ.ui) ----------
  (function () {
    const QZ = (window.QZ = window.QZ || {});

    const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const br = iso => {
      const s = String(iso || "").slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
    };
    const brCurta = iso => {
      const s = String(iso || "").slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "";
    };
    const brHora = iso => {
      if (!iso) return "";
      const dt = new Date(iso);
      if (Number.isNaN(dt.getTime())) return "";
      return dt.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    };
    const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const mesBr = ym => {
      const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ""));
      return m && MESES_CURTOS[Number(m[2]) - 1] ? `${MESES_CURTOS[Number(m[2]) - 1]}/${m[1]}` : "";
    };
    const brl = v => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const hojeSP = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
    const somarDias = (iso, n) => {
      const base = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || "")) ? String(iso) : hojeSP();
      const dt = new Date(`${base}T12:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + (Number(n) || 0));
      return dt.toISOString().slice(0, 10);
    };
    async function copiar(texto) {
      const val = String(texto ?? "");
      try {
        if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(val); return true; }
      } catch {}
      if (typeof document === "undefined" || !document.body) return false;
      const ta = document.createElement("textarea");
      ta.value = val; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch {}
      ta.remove();
      return ok;
    }

    async function api(modulo, acao, body, opt = {}) {
      let url = `/api/m?r=${encodeURIComponent(modulo)}/${encodeURIComponent(acao)}`;
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
      const res = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: temBody ? { "content-type": "application/json" } : undefined,
        body: temBody ? JSON.stringify(body) : undefined,
        signal: opt.signal,
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 401) {
        if (window.QZ_SITE && window.location) {
          window.location.href = "/?next=" + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
        }
        throw Object.assign(new Error("Sessão expirada. Faça login novamente."), { code: "unauthenticated", status: 401, dados: j });
      }
      if (res.status === 403 && j.code === "trocar_senha") {
        if (window.QZ_SITE && window.location) window.location.href = "/";
        throw Object.assign(new Error(j.msg || "Troque sua senha antes de continuar."), { code: "trocar_senha", status: 403, dados: j });
      }
      if (!res.ok) {
        const msg = j.msg || j.erro || (res.status === 429 ? "Muitas requisições. Aguarde alguns segundos." : res.status === 403 ? "Sem permissão." : "Não deu para concluir. Tente de novo.");
        throw Object.assign(new Error(msg), { code: j.code || "erro", status: res.status, dados: j });
      }
      return j;
    }
    const criarApi = modulo => (acao, body, opt) => api(modulo, acao, body, opt);

    const TONS_BADGE = new Set(["neutro", "info", "ok", "warn", "danger"]);
    const carregando = (msg = "Carregando…") => `<div class="qz-state">${esc(msg)}</div>`;
    const vazio = (msg = "Nenhum registro encontrado.", detalhe = "") => `<div class="qz-empty"><b>${esc(msg)}</b>${detalhe ? `<div>${esc(detalhe)}</div>` : ""}</div>`;
    const erroBox = (msg = "Não foi possível carregar os dados.") => `<div class="note warn">${esc(msg)}</div>`;
    const badge = (texto, tom = "neutro") => `<span class="qz-badge qz-badge-${TONS_BADGE.has(tom) ? tom : "neutro"}">${esc(texto)}</span>`;
    function armarConfirmacao(btn, { rotulo = "Confirmar?", timeoutMs = 4000 } = {}) {
      if (!btn) return false;
      if (btn.dataset.qzArm === "1") {
        clearTimeout(btn._qzArmTimer);
        btn.dataset.qzArm = "";
        if (btn.dataset.qzOrig !== undefined) btn.textContent = btn.dataset.qzOrig;
        return true;
      }
      btn.dataset.qzOrig = btn.textContent;
      btn.dataset.qzArm = "1";
      btn.textContent = rotulo;
      clearTimeout(btn._qzArmTimer);
      btn._qzArmTimer = setTimeout(() => {
        btn.dataset.qzArm = "";
        if (btn.dataset.qzOrig !== undefined) btn.textContent = btn.dataset.qzOrig;
      }, timeoutMs);
      return false;
    }
    function renderPaginacao({ total = 0, limite = 50, offset = 0, exibidos = null, temMais = false } = {}) {
      if (total <= 0) return "";
      const mostrando = exibidos != null ? exibidos : Math.min(total, offset + limite);
      return `<div class="qz-pag"><span class="muted">Mostrando ${mostrando} de ${total}</span>${temMais ? `<button type="button" class="btn small" data-qz-mais>Carregar mais</button>` : ""}</div>`;
    }

    QZ.fmt = { esc, br, brCurta, brHora, mesBr, brl, hojeSP, somarDias, copiar };
    QZ.api = api;
    QZ.criarApi = criarApi;
    QZ.ui = { carregando, vazio, erroBox, badge, armarConfirmacao, renderPaginacao };
  })();
