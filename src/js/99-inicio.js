  // ---------- Conexão ----------
  renderAll();
  openTabFromHash();
  loadMe();
  (async () => {
    try { db = window.claude && typeof claude.use==="function" ? await claude.use("db") : null; } catch { db = null; }
    if (!db) { $("#offline").hidden=false; $("#syncTxt").textContent="Sem conexão"; ["#btnNewMonth","#btnNew"].forEach(s=>$(s).disabled=true); return; }
    $("#syncDot").classList.add("on"); $("#syncTxt").textContent="Sincronizado";
    db.collection("producao").onSnapshot(s => { prodYears = s.docs.map(d=>d.id).filter(id=>/^\d{4}$/.test(id)).sort(); renderProd(); }, ()=>{});
    selectProdYear(prodYear);
    db.collection("propostas").onSnapshot(s => { props = s.docs.map(d => ({id:d.id, ...d.data()})); renderPropList(); if (prMode === "view") renderPropMain(); }, ()=>{});
    db.collection("agenda").onSnapshot(s => { agEvents = s.docs.map(d => ({id:d.id, ...d.data()})); renderAgLegend(); if (agCal) agCal.getEventSourceById("manual")?.refetch(); }, ()=>{});
    db.doc("config/agenda").onSnapshot(s => { agFeeds = s.exists ? (s.data().feeds || {}) : {}; renderAgLegend(); agSources(); }, ()=>{});
    db.collection("onboarding").onSnapshot(s => { obs = s.docs.map(d => ({id:d.id, ...d.data()})); obsLoaded = true; renderOnb(); }, ()=>{});
    QZ_db(db);
    db.doc("config/geral").onSnapshot(s => { if (s.exists) { cfg = {...cfg, ...s.data()}; renderAll(); } }, ()=>{});
    let first = true;
    db.collection("meses").onSnapshot(s => {
      const prevList = months.join();
      months = s.docs.map(d=>d.id).filter(id=>/^\d{4}-\d{2}$/.test(id)).sort();
      if (first) {
        first = false;
        let saved = ""; try { saved = localStorage.getItem("carteira-mes") || ""; } catch {}
        const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
        const pick = months.includes(saved) ? saved : (months.includes(today) ? today : months[months.length-1]);
        selectMonth(pick || null);
      } else if (!months.includes(cur)) {
        selectMonth(months[months.length-1] || null);
      } else if (prevList !== months.join()) {
        selectMonth(cur); // mês anterior pode ter mudado
      }
    }, onLost);
  })();
