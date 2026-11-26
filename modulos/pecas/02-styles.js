  if (!document.getElementById("qzPecCss")) {
    const st = document.createElement("style"); st.id = "qzPecCss";
    st.textContent = `
      .pc-h{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px}.pc-h h2{margin:0}.pc-h .sp{flex:1}
      .pc-sub{font-size:12.5px;color:var(--ink2)}
      .pc-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:12px}
      .pc-card.form{border-color:var(--blue);padding:18px 20px}
      .pc-top{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}.pc-top .t{flex:1;min-width:200px}.pc-top b{font-size:15px}
      .pc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
      .pc-grid label{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--ink2)}.pc-grid .full{grid-column:1/-1}
      .pc-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px}
      .pc-cli{display:inline-block;background:var(--blue-soft);color:var(--blue-dk);font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px;border:1px solid rgba(6,96,255,0.18)}
      .pc-req{color:var(--danger);font-weight:700;margin-left:2px}
      .st{font-size:12px;padding:2px 9px;border-radius:20px;white-space:nowrap;font-weight:600}
      .st.pendente{background:var(--amber-soft);color:var(--amber)}.st.aprovada{background:var(--green-soft);color:var(--green)}
      .st.reprovada{background:var(--danger-soft);color:var(--danger)}.st.alteracao_solicitada{background:var(--blue-soft);color:var(--blue-dk)}
      .pc-drop{border:2px dashed var(--blue-bd);border-radius:14px;padding:34px 24px;min-height:145px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;color:var(--ink2);font-size:14px;cursor:pointer;background:var(--blue-soft);transition:all .15s ease}
      .pc-drop:hover,.pc-drop.on{border-color:var(--blue);background:var(--blue-soft);box-shadow:0 6px 18px rgba(6,96,255,0.12)}
      .pc-drop .ico{font-size:32px;line-height:1;margin-bottom:2px}
      .pc-drop .cta{font-size:15.5px;font-weight:600;color:var(--ink)}
      .pc-drop .cta u{color:var(--blue)}
      .pc-drop .hint{font-size:12.5px;color:var(--ink2)}
      .pc-reels-box{margin-top:10px;padding:12px 14px;border:1px solid var(--blue-bd);border-radius:10px;background:var(--surface)}
      .pc-reels-box b{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink);margin-bottom:4px}
      .pc-step{display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px}
      .pc-step b{font-size:14px;font-weight:600;color:var(--ink)}
      .pc-opc{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:14px 16px;margin-top:4px}
      .pc-opc-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--line2)}
      .pc-opc-h b{font-size:13.5px;color:var(--ink)}
      .pc-badge-opc{font-size:11.5px;font-weight:600;color:var(--ink2);background:var(--muted-bg);padding:2px 9px;border-radius:99px}
      .pc-fs{margin-top:10px;display:grid;gap:6px}
      .pc-f{display:grid;grid-template-columns:minmax(0,1fr) auto 120px minmax(70px,auto) auto;gap:8px;align-items:center;font-size:13px;padding:6px 10px;border:1px solid var(--line2);border-radius:8px;background:var(--input-bg)}
      .pc-f .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
      .pc-prog{height:6px;background:var(--line2);border-radius:4px;overflow:hidden}.pc-prog i{display:block;height:100%;background:var(--blue);width:0;transition:width .15s}
      .pc-f.ok .pc-prog i{background:var(--ok)}.pc-f.erro{border-color:var(--danger-bd);background:var(--danger-soft);color:var(--danger)}
      .pc-f-err{grid-column:1/-1;font-size:12px;color:var(--danger);line-height:1.35;padding-top:2px}
      .pc-f-act{display:flex;gap:4px;align-items:center}
      .pc-split{display:grid;grid-template-columns:minmax(360px,450px) minmax(0,1fr);gap:18px;align-items:start;margin-top:12px}
      @media(max-width:880px){.pc-split{grid-template-columns:1fr}}
      .pc-media-pane{background:var(--surface-2);border:1px solid var(--line2);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:10px}
      .pc-info-pane{min-width:0;display:flex;flex-direction:column}
      .pc-obs-box{background:var(--surface-2);border-left:3px solid var(--blue);padding:8px 12px;border-radius:0 8px 8px 0;font-size:13.5px;margin-top:6px;white-space:pre-wrap;color:var(--ink)}
      .pc-preview-single{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--card)}
      .pc-preview-single img{width:100%;max-height:360px;object-fit:contain;display:block;background:var(--muted-bg);cursor:zoom-in}
      .pc-preview-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;background:var(--surface);border-top:1px solid var(--line2);font-size:12px}
      .pc-preview-foot .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink2);font-weight:500}
      .pc-thumbs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:8px}
      .pc-th-card{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--card);display:flex;flex-direction:column}
      .pc-th-card .pv{height:165px;display:flex;align-items:center;justify-content:center;background:var(--muted-bg);overflow:hidden;cursor:zoom-in;text-decoration:none;color:var(--ink2);font-size:12px;text-align:center;padding:4px}
      .pc-th-card .pv img{width:100%;height:100%;object-fit:contain}
      .pc-th-card .ft{display:flex;justify-content:space-between;align-items:center;gap:4px;padding:5px 8px;border-top:1px solid var(--line2);font-size:11.5px;background:var(--surface)}
      .pc-th-card .ft span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink2)}
      .pc-thumbs{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;align-items:flex-start}
      .pc-th{width:120px;height:96px;border:1px solid var(--line);border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:var(--surface-2);font-size:12px;color:var(--ink2);text-align:center;text-decoration:none}
      .pc-th img{width:100%;height:100%;object-fit:contain}
      .pc-th.exp{border-style:dashed;padding:6px;width:auto;min-width:120px;height:auto;min-height:48px}
      .pc-reel-wrap{display:flex;flex-direction:column;gap:10px}
      .pc-thumbs-grid .pc-reel-card{grid-column:1/-1}
      .pc-reel-card{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#0F172A;width:100%;min-width:0}
      .pc-reel-frame{position:relative;width:100%;background:#000}
      .pc-reel-card iframe,.pc-reel-card video{width:100%;height:420px;border:0;display:block;background:#000}
      .pc-ver .pc-reel-card{max-width:460px}
      .pc-ver .pc-reel-card iframe,.pc-ver .pc-reel-card video{height:360px}
      .pc-reel-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 10px;background:var(--surface);border-top:1px solid var(--line);font-size:12px;flex-wrap:wrap}
      .pc-reel-actions{display:flex;align-items:center;gap:10px;flex-shrink:0}
      .pc-btn-link{background:none;border:0;padding:0;color:var(--blue);font-weight:600;font-size:12px;cursor:pointer;text-decoration:none}
      .pc-btn-link:hover{text-decoration:underline}
      .pc-btn-expand{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;border:1px solid var(--blue-bd);background:var(--blue-soft);color:var(--blue-dk);font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;transition:background .15s,border-color .15s}
      .pc-btn-expand:hover{background:var(--blue-soft);border-color:var(--blue)}
      .pc-expand-fab{position:absolute;top:10px;left:10px;z-index:2;display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:8px;border:1px solid rgba(255,255,255,0.28);background:rgba(15,23,42,0.82);color:#fff;font-size:12px;font-weight:600;cursor:pointer;backdrop-filter:blur(4px);box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:background .15s}
      .pc-expand-fab:hover{background:rgba(6,96,255,0.92);border-color:rgba(255,255,255,0.5)}
      .pc-lightbox-stage{background:#0F172A;display:flex;align-items:center;justify-content:center;padding:12px;max-height:83vh;min-height:240px;overflow:auto;position:relative}
      .pc-lightbox-stage img{max-width:100%;max-height:80vh;object-fit:contain;border-radius:6px;display:block;cursor:zoom-in;user-select:none}
      .pc-lightbox-stage.zoomed{display:block;text-align:center}
      .pc-lightbox-stage.zoomed img{max-width:none;max-height:none;margin:0 auto;cursor:zoom-out}
      .pc-links{margin:6px 0 0;padding-left:18px;font-size:13px}
      .pc-ver{border-top:1px solid var(--line2);margin-top:10px;padding-top:10px}
      .pc-ver summary{cursor:pointer;font-size:13px;color:var(--ink2)}
      .pc-hist{margin:8px 0 0;padding:0;list-style:none;font-size:13px}
      .pc-hist li{padding:6px 0;border-top:1px solid var(--line2)}.pc-hist li:first-child{border-top:0}
      .pc-hist .c{display:block;margin-top:2px;white-space:pre-wrap;color:var(--ink)}
      .pc-dec{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-top:12px}
      .pc-dec-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px}
      .pc-dec-head b{font-size:13.5px;color:var(--ink)}
      .pc-dec textarea{width:100%;min-height:66px;border-radius:8px}
      .pc-stamps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}
      @media(max-width:560px){.pc-stamps{grid-template-columns:1fr}}
      .pc-stamp{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:94px;padding:14px 10px;border-radius:11px;border:2.5px solid currentColor;cursor:pointer;text-align:center;font-family:var(--display);transition:transform .12s ease,box-shadow .12s ease,background-color .15s ease,color .15s ease,border-color .15s ease;user-select:none}
      .pc-stamp>*{pointer-events:none}
      .pc-stamp-ico{width:26px;height:26px;display:flex;align-items:center;justify-content:center}
      .pc-stamp-ico svg{width:24px;height:24px;display:block}
      .pc-stamp-lbl{font-size:15px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;line-height:1.15}
      .pc-stamp-sub{font-family:var(--body);font-size:11.5px;font-weight:600;opacity:.82;line-height:1.2}
      .pc-stamp:hover:not(:disabled){transform:translateY(-2px)}
      .pc-stamp:active:not(:disabled){transform:translateY(2px) scale(.985)}
      .pc-stamp:disabled{opacity:.55;cursor:wait;transform:none}
      .pc-stamp.aprovar{background:var(--green-soft);color:var(--green);border-color:var(--green);box-shadow:0 4px 0 rgba(22,163,74,.32)}
      .pc-stamp.aprovar:hover:not(:disabled){background:#16A34A;color:#FFFFFF;border-color:#15803D;box-shadow:0 6px 18px rgba(22,163,74,.35),0 3px 0 #166534}
      .pc-stamp.aprovar:active:not(:disabled){box-shadow:0 1px 0 #166534}
      .pc-stamp.alterar{background:var(--amber-soft);color:var(--amber);border-color:var(--amber-bd);box-shadow:0 4px 0 rgba(217,119,6,.32)}
      .pc-stamp.alterar:hover:not(:disabled){background:#D97706;color:#FFFFFF;border-color:#B45309;box-shadow:0 6px 18px rgba(217,119,6,.35),0 3px 0 #92400E}
      .pc-stamp.alterar:active:not(:disabled){box-shadow:0 1px 0 #92400E}
      .pc-stamp.reprovar{background:var(--danger-soft);color:var(--danger);border-color:var(--danger);box-shadow:0 4px 0 rgba(220,38,38,.32)}
      .pc-stamp.reprovar:hover:not(:disabled){background:#DC2626;color:#FFFFFF;border-color:#B91C1C;box-shadow:0 6px 18px rgba(220,38,38,.35),0 3px 0 #991B1B}
      .pc-stamp.reprovar:active:not(:disabled){box-shadow:0 1px 0 #991B1B}
      .pc-dec-msg{margin-top:8px;font-size:12.5px;font-weight:600;color:var(--danger);min-height:0}
      .pc-dec-msg:empty{display:none}
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
      .pc-vazio{padding:18px;text-align:center;color:var(--ink2);font-size:14px}
      /* Horários de pico */
      .pc-pico-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;background:var(--blue-soft);color:var(--blue);font-size:13px;font-weight:600}
      .pc-pico-badge.destaque{background:var(--warn-soft);color:var(--warn);border:1px solid var(--warn-bd)}
      .pc-histog-wrap{overflow-x:auto;padding:6px 0 4px}
      .pc-histog{display:flex;align-items:flex-end;gap:5px;height:150px;min-width:620px;padding:16px 4px 0;border-bottom:2px solid var(--line)}
      .pc-col-h{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;position:relative;cursor:pointer}
      .pc-col-h:hover .pc-col-bar{filter:brightness(1.15)}
      .pc-col-num{font-size:11px;font-weight:700;color:var(--ink2);margin-bottom:3px;line-height:1}
      .pc-col-h.pico .pc-col-num{color:var(--warn);font-size:12px}
      .pc-col-bar{width:100%;max-width:26px;min-width:8px;background:var(--blue);border-radius:4px 4px 0 0;transition:height .25s ease,background-color .2s ease}
      .pc-col-bar.zerada{background:var(--line2);height:3px !important;opacity:.45}
      .pc-col-h.pico .pc-col-bar{background:linear-gradient(180deg,#f97316 0%,#ea580c 100%);box-shadow:0 2px 6px rgba(234,88,12,.28)}
      .pc-col-rotulo{margin-top:6px;font-size:10.5px;color:var(--ink2);font-variant-numeric:tabular-nums;text-align:center}
      .pc-col-h.pico .pc-col-rotulo{color:var(--warn);font-weight:700}
      .pc-turnos-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:10px}
      .pc-turno-card{background:var(--card);border:1px solid var(--line2);border-radius:8px;padding:7px 10px;font-size:12px}
      .pc-turno-card b{display:block;font-size:15px;color:var(--ink);margin-top:2px}
      .pc-turno-card span{color:var(--ink2)}
      /* Tags e seletores de tipo de peça (Online vs Offline) */
      .pc-tag-online{display:inline-flex;align-items:center;gap:4px;background:var(--blue-soft);color:var(--blue-dk);font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:6px;border:1px solid var(--blue-bd);letter-spacing:0.2px}
      .pc-tag-offline{display:inline-flex;align-items:center;gap:4px;background:var(--purple-soft);color:var(--purple);font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:6px;border:1px solid var(--purple-bd);letter-spacing:0.2px}
      .pc-tipo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
      .pc-tipo-card{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border:2px solid var(--line);border-radius:10px;background:var(--input-bg);cursor:pointer;transition:all .15s ease}
      .pc-tipo-card input{accent-color:var(--blue);margin-top:3px;cursor:pointer}
      .pc-tipo-card b{display:block;font-size:13.5px;color:var(--ink)}
      .pc-tipo-card .pc-sub{font-size:11.5px;margin-top:2px}
      .pc-tipo-card.ativo.online{border-color:var(--blue);background:var(--blue-soft);box-shadow:0 0 0 1px var(--blue)}
      .pc-tipo-card.ativo.offline{border-color:var(--purple);background:var(--purple-soft);box-shadow:0 0 0 1px var(--purple)}
      .pc-tipo-card.ativo.offline input{accent-color:var(--purple)}
      /* Modo Offline no Dashboard */
      .modo-offline .pc-barras .b i{background:var(--purple) !important}
      .modo-offline .pc-col-bar:not(.zerada):not(.pico){background:var(--purple) !important}
      .modo-offline .pc-pico-badge:not(.destaque){background:var(--purple-soft) !important;color:var(--purple) !important;border-color:var(--purple-bd) !important}
      /* Badge de notificação na aba Fila de aprovação */
      .pc-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;margin-left:7px;border-radius:999px;background:#EF4444;color:#FFFFFF;font-size:11.5px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;box-shadow:0 2px 5px rgba(239,68,68,0.35);vertical-align:middle}
      .pc-tab-badge[hidden]{display:none !important}
      /* Menções (@) e Notificações */
      .pc-tag-mencao{display:inline-flex;align-items:center;gap:2px;padding:2px 8px;border-radius:6px;background:var(--blue-soft);color:var(--blue-dk);font-weight:700;font-size:12.5px;border:1px solid var(--blue-bd)}
      .pc-tag-mencao.eu{background:var(--amber-soft);color:var(--amber);border-color:var(--amber-bd);box-shadow:0 1px 3px rgba(245,158,11,0.2)}
      .pc-card.mencionado-nao-lido{border-color:var(--amber-bd);box-shadow:0 0 0 2px rgba(245,158,11,0.22)}
      .pc-card-mencao-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:var(--amber-soft);border:1px solid var(--amber-bd);color:var(--amber);padding:7px 12px;border-radius:8px;margin-bottom:10px;font-size:12.5px}
      .pc-notif-panel{background:var(--amber-soft);border:1px solid var(--amber-bd);border-radius:12px;padding:12px 16px;margin-bottom:14px;box-shadow:0 4px 14px rgba(245,158,11,0.12)}
      .pc-notif-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px}
      .pc-notif-head b{font-size:14px;color:var(--amber);display:flex;align-items:center;gap:6px}
      .pc-notif-list{display:flex;flex-direction:column;gap:8px}
      .pc-notif-item{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--card);border:1px solid var(--amber-bd);border-radius:8px;padding:10px 14px;font-size:13px}
      .pc-ac-pop{position:fixed;z-index:999;background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 32px rgba(15,23,42,0.18);max-height:310px;overflow-y:auto;min-width:280px;padding:6px}
      .pc-ac-item{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;border:0;background:none;padding:8px 10px;border-radius:8px;font-size:13.5px;cursor:pointer;color:var(--ink)}
      .pc-ac-item:hover,.pc-ac-item.on{background:var(--blue-soft);color:var(--blue-dk)}
      .pc-ac-item small{font-size:11.5px;color:var(--ink2);font-weight:600}
      /* Avatares ampliados nos comentários, cabeçalho do card e chips */
      .pc-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-family:var(--display);font-weight:700;color:#fff;overflow:hidden;flex-shrink:0;user-select:none;vertical-align:middle;box-shadow:0 2px 6px rgba(15,23,42,0.18);border:2px solid var(--card)}
      .pc-av img{width:100%;height:100%;object-fit:cover;display:block}
      .pc-av.xs{width:34px;height:34px;font-size:13px}
      .pc-av.sm{width:38px;height:38px;font-size:14.5px}
      .pc-av.md{width:52px;height:52px;font-size:18px}
      .pc-hist li{padding:11px 0}
      .pc-hist-item{display:flex;align-items:flex-start;gap:14px}
      .pc-hist-body{flex:1;min-width:0;line-height:1.5;padding-top:3px}
      /* Progresso em relação à carteira no Dashboard */
      .pc-meta-card{background:var(--card);border:1px solid var(--blue-bd);border-radius:12px;padding:14px 16px;margin-bottom:14px}
      .modo-offline .pc-meta-card{background:var(--card);border-color:var(--purple-bd)}
      .pc-meta-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:12px}
      .pc-meta-hero{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:3px}
      .pc-meta-hero-row{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .pc-meta-hero b{font:700 28px/1 var(--display);font-variant-numeric:tabular-nums;color:var(--blue)}
      .modo-offline .pc-meta-hero b{color:var(--purple)}
      .pc-meta-hero.ok b{color:var(--green)}
      .pc-meta-hero-frac{font-size:13px;font-weight:600;color:var(--ink2);font-variant-numeric:tabular-nums}
      .pc-meta-status{font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px}
      .pc-meta-status.ok{background:var(--green-soft);color:var(--green)}
      .pc-meta-status.pend{background:var(--amber-soft);color:var(--amber)}
      .pc-meta-track{display:flex;height:14px;background:var(--line2);border-radius:999px;overflow:hidden;margin-bottom:12px}
      .pc-meta-seg{height:100%;transition:width .25s ease;min-width:0}
      .pc-meta-seg.online{background:linear-gradient(90deg,#0660FF 0%,#3B82F6 100%)}
      .pc-meta-seg.offline{background:linear-gradient(90deg,#7E22CE 0%,#A855F7 100%)}
      .pc-meta-seg.online+.pc-meta-seg.offline{box-shadow:inset 2px 0 0 rgba(255,255,255,0.7)}
      .pc-meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:8px}
      .pc-meta-item{background:var(--surface);border:1px solid var(--line2);border-left:3px solid var(--line);border-radius:8px;padding:8px 11px}
      .pc-meta-item.online{border-left-color:var(--blue)}
      .pc-meta-item.offline{border-left-color:var(--purple)}
      .pc-meta-item.aprov{border-left-color:var(--green)}
      .pc-meta-item.rest{border-left-color:var(--line-strong)}
      .pc-meta-item.rest.ok{border-left-color:var(--green);background:var(--green-soft)}
      .pc-meta-item-lbl{font-size:11.5px;font-weight:600;color:var(--ink2);display:flex;align-items:center;gap:5px}
      .pc-meta-item-val{display:flex;align-items:baseline;gap:6px;margin-top:3px;flex-wrap:wrap}
      .pc-meta-item-val strong{font:700 17px/1.1 var(--display);color:var(--ink);font-variant-numeric:tabular-nums}
      .pc-meta-item-val small{font-size:11.5px;color:var(--ink2);font-weight:500}
      .pc-meta-item-sub{font-size:11.5px;color:var(--ink2);margin-top:2px;line-height:1.35}
      .pc-pct-pill{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
      .pc-pct-pill.ok{background:var(--green-soft);color:var(--green)}
      .pc-pct-pill.mid{background:var(--blue-soft);color:var(--blue-dk)}
      .pc-pct-pill.low{background:var(--amber-soft);color:var(--amber)}
      .pc-pct-pill.zero{background:var(--muted-bg);color:var(--ink2)}
      .pc-tbl tfoot td{font-weight:700;border-top:2px solid var(--line);border-bottom:0;background:var(--surface)}`;
    document.head.appendChild(st);
  }
