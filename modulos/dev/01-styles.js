// Estilos da Esteira Dev em Master-Detail Split Workspace (/dev)
(function () {
  if (document.getElementById("qz-dev-css")) return;
  const st = document.createElement("style");
  st.id = "qz-dev-css";
  st.textContent = `
    .dev-wrap { max-width: 1380px; padding-top: 16px; padding-bottom: 36px; }
    .dev-loading { padding: 40px 20px; text-align: center; color: var(--ink2); font-size: 14px; }
    .dev-denied { max-width: 520px; margin: 40px auto; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 28px; text-align: center; }
    .dev-denied h2 { margin: 0 0 8px; font: 700 22px var(--display); }

    /* Barra superior da Esteira (3 etapas + Todos) */
    .dev-rail { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items: stretch; margin-bottom: 10px; }
    .dev-rail-btn { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 11px 14px; border: 1px solid var(--line); border-radius: 11px; background: var(--card); color: var(--ink); cursor: pointer; text-align: left; transition: border-color .15s, background .15s, box-shadow .15s; }
    .dev-rail-btn:hover { border-color: var(--line-strong); background: var(--surface-hover); }
    .dev-rail-btn[aria-selected="true"] { border-color: var(--blue); box-shadow: 0 0 0 2px var(--blue-soft); background: var(--card); }
    .dev-rail-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .dev-rail-num { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font: 700 12px var(--display); flex-shrink: 0; background: var(--muted-bg); color: var(--ink2); }
    .dev-rail-btn[data-stage="enviado"] .dev-rail-num { background: var(--amber-soft); color: var(--amber); border: 1px solid var(--amber-bd); }
    .dev-rail-btn[data-stage="em_desenvolvimento"] .dev-rail-num { background: var(--blue-soft); color: var(--blue-dk); border: 1px solid var(--blue-bd); }
    .dev-rail-btn[data-stage="finalizado"] .dev-rail-num { background: var(--green-soft); color: var(--green); border: 1px solid var(--green-bd); }
    .dev-rail-title { font: 700 14px/1.2 var(--display); color: var(--ink); display: flex; align-items: center; gap: 6px; }
    .dev-rail-sub { font-size: 12px; color: var(--ink2); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dev-rail-cnt { font: 700 16px var(--display); font-variant-numeric: tabular-nums; padding: 2px 9px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line2); color: var(--ink); flex-shrink: 0; }
    .dev-rail-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--danger); flex-shrink: 0; }
    .dev-rail-tools { display: flex; gap: 6px; align-items: stretch; }
    .dev-rail-all { padding: 0 14px; border: 1px solid var(--line); border-radius: 11px; background: var(--card); color: var(--ink2); font-weight: 600; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
    .dev-rail-all[aria-selected="true"] { border-color: var(--blue); background: var(--blue-soft); color: var(--blue-dk); }

    /* Sub-barra compacta de filtros */
    .dev-subbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; background: var(--card); border: 1px solid var(--line); border-radius: 11px; padding: 8px 12px; margin-bottom: 12px; }
    .dev-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; flex: 1; min-width: 0; }
    .dev-in, .dev-sel { border: 1px solid var(--line); border-radius: 8px; background: var(--input-bg); color: var(--ink); padding: 5px 10px; font-size: 13px; min-height: 32px; }
    .dev-in { min-width: 210px; flex: 1; max-width: 340px; }
    .dev-chk { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; cursor: pointer; user-select: none; padding: 4px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); min-height: 32px; }
    .dev-chk.is-on { border-color: var(--danger-bd); background: var(--danger-soft); color: var(--danger); }
    .dev-actions { display: flex; gap: 6px; align-items: center; }

    /* Master-Detail Split Workspace */
    .dev-split { display: grid; grid-template-columns: minmax(320px, 42%) minmax(0, 1fr); gap: 12px; align-items: stretch; height: calc(100vh - 235px); min-height: 520px; }
    .dev-master { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow-y: auto; display: flex; flex-direction: column; }
    .dev-master-head { position: sticky; top: 0; z-index: 2; background: var(--surface); border-bottom: 1px solid var(--line2); padding: 9px 14px; display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--ink2); }
    .dev-group-lbl { padding: 6px 14px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--ink2); background: var(--surface); border-bottom: 1px solid var(--line2); }

    .dev-row { position: relative; padding: 12px 14px; border-bottom: 1px solid var(--line2); cursor: pointer; transition: background .12s; outline: none; }
    .dev-row:hover { background: var(--surface-hover); }
    .dev-row.is-sel { background: var(--blue-soft); }
    .dev-row.is-sel::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3.5px; background: var(--blue); }
    .dev-row.is-urg:not(.is-sel)::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--danger); }
    .dev-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
    .dev-row-left { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .dev-id { font: 700 12.5px var(--display); color: var(--ink2); }
    .dev-time { font-size: 11.5px; color: var(--ink2); white-space: nowrap; }
    .dev-row-meta { font-size: 12.5px; color: var(--ink2); margin-bottom: 4px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .dev-row-meta b { color: var(--ink); font-weight: 600; }
    .dev-row-desc { font-size: 13.5px; line-height: 1.4; color: var(--ink); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .dev-row-foot { display: flex; align-items: center; gap: 8px; margin-top: 5px; font-size: 11.5px; color: var(--ink2); }

    .dev-tag { display: inline-flex; align-items: center; gap: 3px; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap; border: 1px solid transparent; }
    .dev-tag-urg { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-bd); }
    .dev-tag-reab { background: var(--purple-soft); color: var(--purple); border-color: var(--purple-bd); }
    .dev-tag-norm { background: var(--surface); color: var(--ink2); border-color: var(--line); }
    .dev-tag-enviado { background: var(--amber-soft); color: var(--amber); border-color: var(--amber-bd); }
    .dev-tag-em_desenvolvimento { background: var(--blue-soft); color: var(--blue-dk); border-color: var(--blue-bd); }
    .dev-tag-finalizado { background: var(--green-soft); color: var(--green); border-color: var(--green-bd); }

    /* Painel Direito (Leitura + Ação da Etapa) */
    .dev-detail { background: var(--card); border: 1px solid var(--line); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; }
    .dev-detail-empty { margin: auto; text-align: center; padding: 36px 24px; max-width: 380px; }
    .dev-detail-empty h3 { margin: 0 0 6px; font: 700 18px var(--display); }
    .dev-detail-empty p { margin: 0 0 16px; color: var(--ink2); font-size: 13.5px; }

    .dev-detail-head { padding: 13px 18px; border-bottom: 1px solid var(--line2); background: var(--surface); display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .dev-detail-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .dev-detail-title h2 { margin: 0; font: 700 18px var(--display); }
    .dev-detail-acts { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .dev-back-btn { display: none; }

    .dev-stepper { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 10px 18px; border-bottom: 1px solid var(--line2); background: var(--card); }
    .dev-step { display: flex; align-items: center; gap: 7px; padding: 6px 9px; border-radius: 8px; border: 1px solid var(--line2); background: var(--surface); font-size: 12px; color: var(--ink2); }
    .dev-step-n { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font: 700 11px var(--display); background: var(--muted-bg); color: var(--ink2); flex-shrink: 0; }
    .dev-step.is-done { border-color: var(--green-bd); background: var(--green-soft); color: var(--green); }
    .dev-step.is-done .dev-step-n { background: var(--green); color: #fff; }
    .dev-step.is-now { border-color: var(--blue-bd); background: var(--blue-soft); color: var(--blue-dk); font-weight: 600; }
    .dev-step.is-now .dev-step-n { background: var(--blue); color: #fff; }

    .dev-detail-body { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
    .dev-reab-banner { background: var(--purple-soft); border: 1px solid var(--purple-bd); border-radius: 10px; padding: 11px 13px; color: var(--purple); font-size: 13px; }
    .dev-reab-banner b { display: block; margin-bottom: 4px; }
    .dev-req-strip { display: flex; flex-wrap: wrap; gap: 8px 16px; padding: 10px 12px; border-radius: 9px; background: var(--surface); border: 1px solid var(--line2); font-size: 12.5px; color: var(--ink2); }
    .dev-req-strip b { color: var(--ink); }
    .dev-desc { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 14.5px; line-height: 1.6; color: var(--ink); }

    .dev-thumbs { display: flex; gap: 8px; flex-wrap: wrap; }
    .dev-thumb { width: 112px; height: 84px; border-radius: 9px; overflow: hidden; border: 1px solid var(--line); background: var(--muted-bg); cursor: zoom-in; }
    .dev-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .dev-tech { background: var(--surface); border: 1px solid var(--line2); border-radius: 9px; padding: 9px 12px; font-size: 12.5px; color: var(--ink2); }
    .dev-tech summary { cursor: pointer; font-weight: 600; color: var(--ink); }
    .dev-tech-grid { display: grid; gap: 4px; margin-top: 8px; word-break: break-word; }

    /* Rodapé fixo de ação da etapa */
    .dev-composer { position: relative; z-index: 1; border-top: 2px solid var(--blue-bd); background: var(--surface-2); padding: 18px 22px 20px; box-shadow: 0 -6px 18px rgba(15,23,42,.06); }
    :root[data-theme="dark"] .dev-composer { box-shadow: 0 -8px 22px rgba(0,0,0,.24); }
    .dev-composer-finalizado { border-top-color: var(--green-bd); }
    .dev-composer-title { font: 700 15px/1.25 var(--display); color: var(--ink); margin: 0 0 4px; }
    .dev-composer-hint { margin: 0 0 14px; font-size: 13.5px; line-height: 1.45; color: var(--ink2); }
    .dev-composer-cta { min-height: 44px; padding: 10px 22px; font-size: 14.5px; font-weight: 700; border-radius: 10px; }
    .dev-ta { width: 100%; border: 1px solid var(--line); border-radius: 9px; background: var(--input-bg); color: var(--ink); padding: 11px 13px; font-size: 14px; min-height: 108px; resize: vertical; line-height: 1.45; }
    .dev-ta:focus { border-color: var(--blue); outline: none; box-shadow: 0 0 0 3px var(--blue-soft); }
    .dev-err { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-bd); border-radius: 8px; padding: 8px 10px; font-size: 12.5px; margin-bottom: 10px; }
    .dev-composer-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    .dev-sol-box { background: var(--green-soft); border: 1px solid var(--green-bd); border-radius: 10px; padding: 13px 15px; font-size: 14px; }
    .dev-sol-box b { display: block; color: var(--green); font-size: 12.5px; margin-bottom: 4px; }
    .dev-sol-box div { white-space: pre-wrap; word-break: break-word; }

    .dev-lb { position: fixed; inset: 0; z-index: 95; background: rgba(8,12,24,.9); display: flex; align-items: center; justify-content: center; padding: 20px; }
    .dev-lb img { max-width: 94vw; max-height: 88vh; border-radius: 10px; }
    .dev-lb-close { position: fixed; top: 16px; right: 16px; border: 0; border-radius: 999px; width: 40px; height: 40px; font-size: 20px; cursor: pointer; background: rgba(255,255,255,.16); color: #fff; }

    @media (max-width: 920px) {
      .dev-rail { grid-template-columns: 1fr; }
      .dev-split { grid-template-columns: 1fr; height: auto; min-height: 0; }
      .dev-master { max-height: 68vh; }
      .dev-split:not(.is-mobile-detail) .dev-detail { display: none; }
      .dev-split.is-mobile-detail .dev-master { display: none; }
      .dev-back-btn { display: inline-flex; }
      .dev-stepper { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; }
    }
  `;
  document.head.appendChild(st);
})();
