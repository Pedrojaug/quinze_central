// Utilitários compartilhados da tela /suporte
const SUP = (window.__QZ_SUP = window.__QZ_SUP || {});

SUP.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c]));

SUP.brHora = iso => {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

SUP.toast = msg => {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = String(msg || "");
  el.classList.add("show");
  clearTimeout(SUP._toastT);
  SUP._toastT = setTimeout(() => el.classList.remove("show"), 3200);
};

SUP.api = async (acao, body, opt = {}) => {
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
  if (r.status === 403 && j.code === "trocar_senha") {
    location.href = "/";
    throw new Error("Troque sua senha antes de continuar.");
  }
  if (!r.ok) {
    throw new Error(j.msg || j.erro || "Não foi possível concluir. Tente novamente.");
  }
  return j;
};

SUP.arquivoParaBase64 = file => new Promise((resolve, reject) => {
  const rd = new FileReader();
  rd.onerror = () => reject(new Error("Não foi possível ler a imagem."));
  rd.onload = () => resolve(String(rd.result || ""));
  rd.readAsDataURL(file);
});

SUP.comprimirPrint = async file => {
  if (!file || !/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
    throw new Error("Use apenas imagens PNG, JPG ou WebP.");
  }
  if (file.size <= 1.4 * 1024 * 1024) {
    const b64 = await SUP.arquivoParaBase64(file);
    return { nome: file.name || "print.png", base64: b64, preview: b64 };
  }
  const srcUrl = await SUP.arquivoParaBase64(file);
  const img = await new Promise((resolve, reject) => {
    const im = new Image();
    im.onerror = () => reject(new Error("Imagem inválida."));
    im.onload = () => resolve(im);
    im.src = srcUrl;
  });
  const maxLado = 1920;
  const escala = Math.min(1, maxLado / Math.max(img.width || 1, img.height || 1));
  const w = Math.max(1, Math.round(img.width * escala));
  const h = Math.max(1, Math.round(img.height * escala));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  cv.getContext("2d").drawImage(img, 0, 0, w, h);
  let out = cv.toDataURL("image/webp", 0.86);
  let ext = "webp";
  if (!/^data:image\/webp/.test(out)) {
    out = cv.toDataURL("image/jpeg", 0.86);
    ext = "jpg";
  }
  const baseNome = String(file.name || "print").replace(/\.[a-z0-9]{1,5}$/i, "");
  return { nome: `${baseNome}.${ext}`, base64: out, preview: out };
};

SUP.abrirLightbox = url => {
  if (!url) return;
  const old = document.getElementById("supLightbox");
  if (old) old.remove();
  const wrap = document.createElement("div");
  wrap.id = "supLightbox";
  wrap.className = "sup-lb";
  wrap.innerHTML = `<button type="button" class="sup-lb-close" aria-label="Fechar imagem">×</button><img src="${SUP.esc(url)}" alt="Print ampliado">`;
  const fechar = () => wrap.remove();
  wrap.addEventListener("click", ev => {
    if (ev.target === wrap || ev.target.closest(".sup-lb-close")) fechar();
  });
  document.addEventListener("keydown", function onKey(ev) {
    if (ev.key === "Escape") {
      fechar();
      document.removeEventListener("keydown", onKey);
    }
  });
  document.body.appendChild(wrap);
};
