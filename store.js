// Banco da Central Quinze: sincroniza com /api (Neon) e oferece à página a mesma
// interface de dados usada na versão do Claude (collection/doc, set/update/delete, onSnapshot).
window.QZ_SITE = true;
(function () {
  const cache = new Map();          // caminho do documento -> dados
  const listeners = new Set();
  let seq = 0, ready = null, timer = null, failing = 0;

  const parentOf = p => p.split("/").slice(0, -1).join("/");
  const idOf = p => p.split("/").pop();
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const isObj = v => v && typeof v === "object" && !Array.isArray(v);
  function deepMerge(a, b) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
    return out;
  }
  function goLogin() { location.href = "/?next=" + encodeURIComponent(location.pathname + location.search + location.hash); }

  async function api(url, opt) {
    const r = await fetch(url, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...opt });
    if (r.status === 401) { goLogin(); throw { code: "unauthenticated" }; }
    if (!r.ok) {
      let b = {}; try { b = await r.json(); } catch { }
      if (b.code === "trocar_senha") { location.href = "/"; throw { code: "unauthenticated" }; }
      throw { code: b.code || (r.status === 404 ? "invalid_argument" : "unavailable"), status: r.status };
    }
    return r.json();
  }
  function apply(rows) {
    let changed = false;
    for (const d of rows) {
      if (d.deleted) { if (cache.delete(d.path)) changed = true; }
      else if (JSON.stringify(cache.get(d.path)) !== JSON.stringify(d.data)) { cache.set(d.path, d.data); changed = true; }
      seq = Math.max(seq, Number(d.seq) || 0);
    }
    return changed;
  }
  async function pull() {
    const r = await api("/api/sync?since=" + seq);
    const changed = apply(r.docs || []);
    seq = Math.max(seq, Number(r.seq) || 0);
    if (changed) notify();
  }
  function notify() { setTimeout(() => listeners.forEach(l => l.fire()), 0); }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { await pull(); failing = 0; }
      catch (e) { if (++failing === 3) listeners.forEach(l => l.err && l.err(e)); }
      schedule();
    }, document.hidden ? 20000 : 12000);
  }
  function start() { if (!ready) ready = pull().then(schedule); return ready; }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ready) { pull().catch(() => { }); schedule(); } });

  function docSnap(p) { const d = cache.get(p); return { id: idOf(p), exists: d !== undefined, data: () => clone(d) }; }
  function colSnap(p) {
    const docs = [];
    for (const [k, v] of cache) if (parentOf(k) === p) docs.push({ id: idOf(k), exists: true, data: () => clone(v) });
    docs.sort((a, b) => a.id.localeCompare(b.id));
    return { docs, size: docs.length, empty: !docs.length };
  }
  function listen(make, cb, err) {
    const l = {
      last: null, err,
      fire() {
        const s = make();
        const key = JSON.stringify(s.docs ? s.docs.map(d => [d.id, d.data()]) : [s.exists, s.data()]);
        if (key === l.last) return;
        l.last = key;
        try { cb(s); } catch (e) { console.error(e); }
      }
    };
    listeners.add(l);
    start().then(() => l.fire()).catch(e => err && err(e));
    return () => listeners.delete(l);
  }
  function docRef(p) {
    return {
      id: idOf(p), path: p,
      get: async () => { await start(); return docSnap(p); },
      async set(data) {
        const prev = cache.get(p);
        cache.set(p, clone(data)); notify();
        try { await api("/api/doc", { method: "PUT", body: JSON.stringify({ path: p, data }) }); }
        catch (e) { if (prev === undefined) cache.delete(p); else cache.set(p, prev); notify(); throw e; }
      },
      async update(data) {
        const prev = cache.get(p);
        if (prev === undefined) throw { code: "invalid_argument" };
        cache.set(p, deepMerge(prev, clone(data))); notify();
        try { const r = await api("/api/doc", { method: "PUT", body: JSON.stringify({ path: p, data, merge: true }) }); if (r && r.data) { cache.set(p, r.data); notify(); } }
        catch (e) { cache.set(p, prev); notify(); throw e; }
      },
      async delete() {
        const prev = cache.get(p);
        cache.delete(p); notify();
        try { await api("/api/doc?path=" + encodeURIComponent(p), { method: "DELETE" }); }
        catch (e) { if (prev !== undefined) cache.set(p, prev); notify(); throw e; }
      },
      onSnapshot: (cb, err) => listen(() => docSnap(p), cb, err),
      collection: name => colRef(p + "/" + name),
    };
  }
  function colRef(p) {
    return {
      path: p,
      doc: id => docRef(p + "/" + id),
      get: async () => { await start(); return colSnap(p); },
      onSnapshot: (cb, err) => listen(() => colSnap(p), cb, err),
    };
  }
  const db = { collection: colRef, doc: docRef };
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.csv$/i.test(filename) ? "text/csv;charset=utf-8" : "application/octet-stream" });
      const u = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = u;
      a.download = String(filename).normalize("NFD").replace(/[̀-ͯ]/g, "");
      a.rel = "noopener"; a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 15000);
    }
  };
  window.claude = {
    use: async name => {
      if (name === "db") { try { await start(); return db; } catch { return null; } }
      if (name === "downloads") return downloads;
      return null;
    }
  };
})();
