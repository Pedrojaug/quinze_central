// Estilos exclusivos da página /suporte (suporte claro/escuro via variáveis da Central)
(function () {
  if (document.getElementById("qz-suporte-css")) return;
  const st = document.createElement("style");
  st.id = "qz-suporte-css";
  st.textContent = `
    .sup-wrap { max-width: 960px; padding-top: 22px; padding-bottom: 64px; }
    .sup-loading { padding: 36px 20px; text-align: center; color: var(--ink2); font-size: 14px; }
    .sup-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 18px; align-items: center; justify-content: space-between; }
    .sup-tabs-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .sup-tab { border: 1px solid var(--line); background: var(--card); color: var(--ink2); border-radius: 10px; padding: 9px 15px; font-weight: 600; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; transition: border-color .15s, background .15s, color .15s; }
    .sup-tab:hover { border-color: var(--blue); color: var(--ink); }
    .sup-tab[aria-selected="true"] { background: var(--blue); border-color: var(--blue); color: #fff; }
    .sup-tab-cnt { background: rgba(255,255,255,.2); border-radius: 999px; padding: 1px 7px; font-size: 12px; font-variant-numeric: tabular-nums; }
    .sup-tab:not([aria-selected="true"]) .sup-tab-cnt { background: var(--muted-bg); color: var(--ink); }

    .sup-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 22px; }
    .sup-card-head { margin-bottom: 18px; }
    .sup-card-head h2 { margin: 0 0 4px; font: 700 20px/1.2 var(--display); }
    .sup-card-head p { margin: 0; color: var(--ink2); font-size: 14px; }

    .sup-user-strip { display: flex; flex-wrap: wrap; gap: 10px 18px; padding: 12px 14px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line2); margin-bottom: 18px; font-size: 13.5px; }
    .sup-user-strip span { color: var(--ink2); }
    .sup-user-strip b { color: var(--ink); font-weight: 600; }

    .sup-field { margin-bottom: 18px; }
    .sup-label { display: block; font-size: 13.5px; font-weight: 600; margin-bottom: 7px; color: var(--ink); }
    .sup-hint { font-size: 12.5px; color: var(--ink2); margin-top: 5px; }

    .sup-tipo-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .sup-choice { position: relative; border: 1.5px solid var(--line); background: var(--surface); border-radius: 11px; padding: 12px 13px; cursor: pointer; text-align: left; transition: border-color .15s, background .15s, box-shadow .15s; }
    .sup-choice:hover { border-color: var(--blue); }
    .sup-choice.is-on { border-color: var(--blue); background: var(--blue-soft); box-shadow: 0 0 0 3px var(--blue-soft); }
    .sup-choice b { display: block; font-size: 14px; margin-bottom: 2px; color: var(--ink); }
    .sup-choice small { display: block; font-size: 12.5px; color: var(--ink2); line-height: 1.35; }

    .sup-urg-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .sup-choice.is-urg.is-on { border-color: var(--danger); background: var(--danger-soft); box-shadow: 0 0 0 3px var(--danger-soft); }

    .sup-select, .sup-textarea { width: 100%; border: 1px solid var(--line); border-radius: 10px; background: var(--input-bg); padding: 10px 12px; font-size: 14.5px; color: var(--ink); }
    .sup-select:focus, .sup-textarea:focus { border-color: var(--blue); outline: none; box-shadow: 0 0 0 3px var(--blue-soft); }
    .sup-textarea { min-height: 126px; resize: vertical; line-height: 1.5; }

    .sup-drop { border: 1.5px dashed var(--line-strong); border-radius: 12px; padding: 18px 16px; text-align: center; background: var(--surface); cursor: pointer; transition: border-color .15s, background .15s; }
    .sup-drop:hover, .sup-drop.is-over { border-color: var(--blue); background: var(--blue-soft); }
    .sup-drop b { display: block; font-size: 14px; margin-bottom: 3px; }
    .sup-drop span { font-size: 12.5px; color: var(--ink2); }

    .sup-thumbs { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
    .sup-thumb { position: relative; width: 96px; height: 76px; border-radius: 9px; overflow: hidden; border: 1px solid var(--line); background: var(--muted-bg); }
    .sup-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }
    .sup-thumb-rm { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border: 0; border-radius: 50%; background: rgba(15,23,42,.78); color: #fff; font-size: 13px; line-height: 1; cursor: pointer; display: grid; place-items: center; }
    .sup-thumb-rm:hover { background: var(--danger); }

    .sup-form-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line2); }
    .sup-err { background: var(--danger-soft); color: var(--danger); border: 1px solid var(--danger-bd); border-radius: 9px; padding: 10px 12px; font-size: 13.5px; margin-bottom: 14px; }

    .sup-filtros { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .sup-pill { border: 1px solid var(--line); background: var(--card); color: var(--ink2); border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .sup-pill[aria-pressed="true"] { background: var(--blue-soft); border-color: var(--blue-bd); color: var(--blue-dk); }

    .sup-lista { display: flex; flex-direction: column; gap: 12px; }
    .sup-ticket { background: var(--card); border: 1px solid var(--line); border-radius: 13px; padding: 16px 18px; }
    .sup-ticket.is-urg { border-left: 4px solid var(--danger); }
    .sup-ticket-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
    .sup-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .sup-id { font: 700 13.5px var(--display); color: var(--ink2); }
    .sup-b { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; }
    .sup-b-enviado { background: var(--amber-soft); color: var(--amber); border-color: var(--amber-bd); }
    .sup-b-em_desenvolvimento { background: var(--blue-soft); color: var(--blue-dk); border-color: var(--blue-bd); }
    .sup-b-finalizado { background: var(--green-soft); color: var(--green); border-color: var(--green-bd); }
    .sup-b-urg { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-bd); }
    .sup-b-reab { background: var(--purple-soft); color: var(--purple); border-color: var(--purple-bd); }
    .sup-b-meta { background: var(--surface); color: var(--ink2); border-color: var(--line); }

    .sup-desc { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 14.5px; line-height: 1.5; color: var(--ink); }
    .sup-resp { margin-top: 12px; padding: 11px 13px; border-radius: 10px; background: var(--green-soft); border: 1px solid var(--green-bd); font-size: 13.5px; }
    .sup-resp b { display: block; color: var(--green); font-size: 12.5px; margin-bottom: 3px; }
    .sup-resp div { white-space: pre-wrap; word-break: break-word; }

    .sup-hist { margin-top: 10px; padding: 9px 12px; border-radius: 9px; background: var(--surface); border: 1px solid var(--line2); font-size: 12.5px; color: var(--ink2); }
    .sup-hist div + div { margin-top: 4px; }

    .sup-ticket-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line2); font-size: 12.5px; color: var(--ink2); }

    .sup-stepper { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin: 12px 0 4px; }
    .sup-step { display: flex; align-items: center; gap: 6px; padding: 6px 9px; border-radius: 8px; border: 1px solid var(--line2); background: var(--surface); font-size: 12px; color: var(--ink2); }
    .sup-step-n { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font: 700 11px var(--display); background: var(--muted-bg); color: var(--ink2); flex-shrink: 0; }
    .sup-step.is-done { border-color: var(--green-bd); background: var(--green-soft); color: var(--green); }
    .sup-step.is-done .sup-step-n { background: var(--green); color: #fff; }
    .sup-step.is-now { border-color: var(--blue-bd); background: var(--blue-soft); color: var(--blue-dk); font-weight: 600; }
    .sup-step.is-now .sup-step-n { background: var(--blue); color: #fff; }

    dialog.sup-dlg { border: 1px solid var(--line); border-radius: 14px; background: var(--card); color: var(--ink); padding: 0; width: min(500px, calc(100vw - 24px)); box-shadow: 0 24px 60px rgba(15,23,42,.28); }
    dialog.sup-dlg::backdrop { background: rgba(15,23,42,.55); }
    .sup-dlg-body { padding: 20px; }
    .sup-dlg-body h3 { margin: 0 0 6px; font: 700 18px var(--display); }
    .sup-dlg-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px; border-top: 1px solid var(--line2); background: var(--surface); }

    .sup-lb { position: fixed; inset: 0; z-index: 90; background: rgba(8,12,24,.88); display: flex; align-items: center; justify-content: center; padding: 20px; }
    .sup-lb img { max-width: 94vw; max-height: 88vh; border-radius: 10px; box-shadow: 0 18px 48px rgba(0,0,0,.45); }
    .sup-lb-close { position: fixed; top: 16px; right: 16px; border: 0; border-radius: 999px; width: 40px; height: 40px; font-size: 20px; cursor: pointer; background: rgba(255,255,255,.16); color: #fff; }

    @media (max-width: 680px) {
      .sup-tipo-grid, .sup-urg-grid, .sup-stepper { grid-template-columns: 1fr; }
      .sup-card { padding: 16px; }
    }
  `;
  document.head.appendChild(st);
})();
