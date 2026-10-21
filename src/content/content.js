/**
 * ============================================================================
 * SeatOrbit - Quick HUD Flutuante no ChatGPT
 * Desenvolvido por: @OTheMandaloriano
 * GitHub: https://github.com/OTheMandaloriano
 * Todos os direitos reservados.
 * ============================================================================
 */

(() => {
  'use strict';

  let DB = null;
  let activeEmail = null;
  let isExpanded = false;

  const send = (msg, timeoutMs = 2500) =>
    new Promise((resolve) => {
      let done = false;
      const t = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, timeoutMs);

      try {
        if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) {
          clearTimeout(t);
          return resolve(null);
        }
        chrome.runtime.sendMessage(msg, (res) => {
          if (!done) {
            done = true;
            clearTimeout(t);
            resolve(chrome.runtime.lastError ? null : res);
          }
        });
      } catch {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(null);
        }
      }
    });

  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );

  const CHATGPT_SVG_PATH = 'M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z';
  const CHATGPT_ICON_SVG = `<svg class="icon-chatgpt" viewBox="0 0 256 260" fill="currentColor"><path d="${CHATGPT_SVG_PATH}"/></svg>`;

  function gaugeMax(conn) {
    const w = conn?.quota?.windows;
    if (!w?.length) return 0;
    return Math.max(...w.map((x) => x.usedPercent ?? 0));
  }

  function untilReset(resetAt) {
    if (!resetAt) return '';
    const diff = resetAt - Date.now();
    if (diff <= 0) return 'Livre agora';
    const m = Math.floor(diff / 60000);
    if (m < 60) return `em ${m}m`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h >= 24) {
      const d = Math.floor(h / 24);
      const rh = h % 24;
      return `em ${d}d${rh ? ' ' + rh + 'h' : ''}`;
    }
    return `em ${h}h ${rm ? rm + 'm' : ''}`;
  }

  // Gera o card compacto de cotas (Diário e Semanal) exibido ao passar o mouse
  function buildQuotaHoverHtml(conn) {
    if (!conn) return '';

    const email = conn.email || 'Conta ativa';
    const plan = (conn.planType || conn.quota?.plan || 'Plus').replace(/chatgpt[\s\-_]*/gi, '').trim() || 'Plus';
    const windows = conn.quota?.windows || [];

    // 1. Janela Diária / Curta (5h ou primary)
    const daily = windows.find((w) => w.durationSecs === 18000 || w.id === 'primary' || w.isPrimary || /curt|5h|diár|mensag/i.test(w.label)) || windows[0] || null;

    // 2. Janela Semanal / Longa (7d ou secondary)
    const weekly = windows.find((w) => w.durationSecs === 604800 || w.id === 'secondary' || /seman|7d|long/i.test(w.label)) || (windows.length > 1 ? windows[1] : null);

    const isExh = conn.quota?.exhausted === true || gaugeMax(conn) >= 100;

    // Valores do Limite Diário (5h)
    const dailyPct = daily ? Math.min(100, Math.round(daily.usedPercent ?? 0)) : (isExh ? 100 : 0);
    const dailySev = dailyPct >= 85 ? 'crit' : dailyPct >= 50 ? 'warn' : 'ok';
    const isDailyZero = dailyPct === 0;
    const dailyReset = isExh && dailyPct >= 100
      ? (daily?.resetAt ? `Esgotado • Renova ${untilReset(daily.resetAt)}` : 'Limite atingido')
      : (!isDailyZero && daily?.resetAt
          ? `Renova ${untilReset(daily.resetAt)}`
          : '100% disponível');

    // Valores do Limite Semanal (7d)
    const weeklyPct = weekly ? Math.min(100, Math.round(weekly.usedPercent ?? 0)) : 0;
    const weeklySev = weeklyPct >= 85 ? 'crit' : weeklyPct >= 50 ? 'warn' : 'ok';
    const isWeeklyZero = weeklyPct === 0;
    const weeklyReset = (!isWeeklyZero && weekly?.resetAt)
      ? `Renova ${untilReset(weekly.resetAt)}`
      : '100% disponível';

    return `
      <div class="so-quota-hovercard">
        <div class="so-qh-head">
          <div class="so-qh-user">
            <svg class="so-qh-avatar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span class="so-qh-email">${esc(email)}</span>
          </div>
          <span class="so-qh-plan-chip">${CHATGPT_ICON_SVG}<span>${esc(plan)}</span></span>
        </div>

        <div class="so-qh-bars">
          <!-- Barra 1: Limite Diário (5h) -->
          <div class="so-qh-item">
            <div class="so-qh-row">
              <span class="so-qh-label">Limite Diário (5h)</span>
              <span class="so-qh-val ${dailySev}">${dailyPct}%</span>
            </div>
            <div class="so-qh-track">
              <div class="so-qh-bar ${dailySev}" style="width: ${dailyPct}%;"></div>
            </div>
            <div class="so-qh-sub ${isDailyZero ? 'available' : ''}">${dailyReset}</div>
          </div>

          <!-- Barra 2: Limite Semanal (7d) -->
          <div class="so-qh-item">
            <div class="so-qh-row">
              <span class="so-qh-label">Limite Semanal (7d)</span>
              <span class="so-qh-val ${weeklySev}">${weeklyPct}%</span>
            </div>
            <div class="so-qh-track">
              <div class="so-qh-bar ${weeklySev}" style="width: ${weeklyPct}%;"></div>
            </div>
            <div class="so-qh-sub ${isWeeklyZero ? 'available' : ''}">${weeklyReset}</div>
          </div>
        </div>
      </div>
    `;
  }

  async function syncState() {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(['seatorbit.v7', 'seatpilot.v7', 'sr.v6', 'admin_rotator_db', 'chatgpt_rotator_db']);
        const localDb = stored['seatorbit.v7'] || stored['seatpilot.v7'] || stored['sr.v6'] || stored.admin_rotator_db || stored.chatgpt_rotator_db;
        if (localDb && typeof localDb === 'object') {
          DB = localDb;
          renderHud();
        }
      } catch {}
    }

    const res = await send({ type: 'GET_DB' }, 800);
    if (res?.db) {
      DB = res.db;
      renderHud();
    }
  }

  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes['seatorbit.v7'] || changes['seatpilot.v7'] || changes['sr.v6'])) {
        const nextDb = changes['seatorbit.v7']?.newValue || changes['seatpilot.v7']?.newValue || changes['sr.v6']?.newValue;
        if (nextDb && typeof nextDb === 'object') {
          DB = nextDb;
          renderHud();
        }
      }
    });
  }

  async function probeSession() {
    try {
      const r = await fetch('/api/auth/session', { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      const email = j?.user?.email?.toLowerCase() || null;
      if (email && email !== activeEmail) {
        activeEmail = email;
        send({ type: 'IDENTITY_CHANGED', email }).catch(() => {});
        renderHud();
      }
    } catch {}
  }

  async function probeUsage() {
    try {
      const r = await fetch('/backend-api/wham/usage', { credentials: 'include' });
      if (!r.ok) return;
      const usage = await r.json();
      if (usage && usage.rate_limit) {
        send({ type: 'TAB_USAGE_UPDATE', usage }).catch(() => {});
        await syncState();
      }
    } catch {}
  }

  // Montagem da interface Shadow DOM isolada
  let shadowRoot = null;
  let hudContainer = null;
  let activeTargetConn = null;

  function initHud() {
    if (document.getElementById('seatorbit-hud-host')) return;

    const host = document.createElement('div');
    host.id = 'seatorbit-hud-host';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    shadowRoot = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      :host {
        all: initial;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        color: #d0d6e0;
      }

      .so-hud-wrapper {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        pointer-events: auto;
      }

      /* ── Precision Command Dock (Gatilho HUD Flutuante) ── */
      .so-dock {
        display: inline-flex;
        align-items: center;
        height: 32px;
        background: rgba(15, 16, 17, 0.95);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid #23252a;
        border-radius: 9999px;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.04);
        padding: 0 8px 0 10px;
        user-select: none;
        transition: border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
      }

      .so-dock:hover {
        background: #161718;
        border-color: #383b3f;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.65);
      }

      .so-dock.expanded {
        border-color: #383b3f;
        background: #161718;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.75);
      }

      /* Trigger principal (Clica para expandir) */
      .so-dock-trigger {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        padding-right: 5px;
        height: 100%;
        outline: none;
        background: transparent;
        border: none;
        color: inherit;
      }

      .so-dock-trigger:active {
        transform: scale(0.97);
        transition: transform 100ms ease-out;
      }

      .so-dock-logo-wrap {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        color: #ffffff;
        flex-shrink: 0;
        transition: transform 140ms ease, opacity 140ms ease;
      }

      .so-dock-logo-wrap .icon-chatgpt {
        width: 18px;
        height: 18px;
        color: #ffffff;
      }

      .so-dock:hover .so-dock-logo-wrap {
        transform: scale(1.08);
      }

      /* Container de Limites Duplos (Diário e Semanal) */
      .so-dock-metrics {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .so-dock-limit-chip {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 1.5px;
      }

      .so-dock-limit-row {
        display: inline-flex;
        align-items: baseline;
        gap: 3px;
        line-height: 1;
      }

      .so-limit-lbl {
        font-size: 8.5px;
        font-weight: 700;
        color: #8a8f98;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        line-height: 1;
      }

      .so-limit-val {
        font-size: 11px;
        font-weight: 600;
        line-height: 1;
        font-family: 'JetBrains Mono', monospace;
        font-feature-settings: "tnum" 1;
      }

      .so-limit-val.ok {
        color: #4ade80;
      }
      .so-limit-val.warn {
        color: #fbbf24;
      }
      .so-limit-val.crit {
        color: #f87171;
      }

      /* Micro Barra de Progresso Embutida no Pill */
      .so-limit-bar-bg {
        display: block;
        width: 26px;
        height: 2px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 2px;
        overflow: hidden;
      }

      .so-limit-bar-fill {
        display: block;
        height: 100%;
        border-radius: 2px;
        transition: width 300ms ease;
      }

      .so-limit-bar-fill.ok {
        background: #4ade80;
      }
      .so-limit-bar-fill.warn {
        background: #fbbf24;
      }
      .so-limit-bar-fill.crit {
        background: #f87171;
      }

      /* Separador entre Diário e Semanal */
      .so-dock-limit-sep {
        width: 1px;
        height: 14px;
        background: rgba(255, 255, 255, 0.12);
        margin: 0 1px;
        flex-shrink: 0;
      }

      /* Métrica de Cota Compacta */
      .so-dock-badge {
        font-size: 11.5px;
        font-weight: 600;
        line-height: 1;
        color: #8a8f98;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      }

      .so-dock-badge.ok {
        color: #4ade80;
        font-family: 'JetBrains Mono', monospace;
        font-feature-settings: "tnum" 1;
      }
      .so-dock-badge.warn {
        color: #fbbf24;
        font-family: 'JetBrains Mono', monospace;
        font-feature-settings: "tnum" 1;
      }
      .so-dock-badge.crit {
        color: #f87171;
        font-family: 'JetBrains Mono', monospace;
        font-feature-settings: "tnum" 1;
      }

      /* Divisor Hairline */
      .so-dock-sep {
        width: 1px;
        height: 14px;
        background: #26282d;
        margin: 0 3px;
        flex-shrink: 0;
      }

      /* Botões de Ação Rápida */
      .so-dock-actions {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      .so-dock-btn {
        background: transparent;
        border: none;
        color: #8a8f98;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        transition: background 120ms ease, color 120ms ease, transform 100ms ease;
        padding: 0;
      }

      .so-dock-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #ffffff;
      }

      .so-dock-btn:active {
        transform: scale(0.9);
      }

      .so-dock-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }

      .so-dock-btn.is-syncing svg {
        animation: soRefreshSpin 0.75s linear infinite;
      }

      @keyframes soRefreshSpin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      .so-dock-btn-chevron svg {
        transition: transform 140ms ease;
      }

      .so-dock.expanded .so-dock-btn-chevron svg {
        transform: rotate(180deg);
      }

      /* Modo Zero State do Dock (Super Minimalista: [ ⑯ Conectar ]) */
      .so-dock.is-zero {
        padding: 0 10px 0 8px;
        cursor: pointer;
        gap: 6px;
      }

      .so-dock.is-zero:active {
        transform: scale(0.97);
      }

      .so-dock-label-connect {
        font-size: 11px;
        font-weight: 550;
        color: #e5e5e6;
        letter-spacing: -0.01em;
        white-space: nowrap;
      }

      .so-dock.is-zero:hover .so-dock-label-connect {
        color: #ffffff;
      }

      /* ── Popover Flutuante HUD ── */
      .so-popover {
        position: absolute;
        bottom: 44px;
        right: 0;
        width: 320px;
        background: #0f1011;
        border: 1px solid #23252a;
        border-radius: 12px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform-origin: bottom right;
        animation: soPopoverEnter 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      @keyframes soPopoverEnter {
        from {
          opacity: 0;
          transform: translateY(8px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      [hidden] {
        display: none !important;
      }

      /* Header do Popover */
      .so-popover-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 12px;
        background: #161718;
        border-bottom: 1px solid #23252a;
      }

      .so-header-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .so-header-logo {
        color: #e4f222;
        display: flex;
        align-items: center;
      }

      .so-title {
        font-size: 12px;
        font-weight: 600;
        color: #ffffff;
      }

      .so-header-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .so-status-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: transparent;
        border: none;
        padding: 0;
        color: #f4f4f5;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        transition: opacity 140ms ease;
      }

      .so-status-toggle:hover {
        opacity: 0.85;
      }

      .so-dot {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 8px;
        height: 8px;
        flex-shrink: 0;
      }

      .so-dot::after {
        content: '';
        position: relative;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        z-index: 1;
      }

      .so-dot::before {
        content: '';
        position: absolute;
        inset: -1px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.75;
        display: none;
      }

      .so-dot.dot-ok {
        color: #22c55e;
      }
      .so-dot.dot-ok::before {
        display: block;
        animation: soStatusPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .so-dot.dot-ok::after {
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.65);
      }

      .so-dot.dot-warn {
        color: #f59e0b;
      }
      .so-dot.dot-warn::before {
        display: block;
        animation: soStatusPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .so-dot.dot-warn::after {
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.65);
      }

      .so-dot.dot-crit {
        color: #ef4444;
      }
      .so-dot.dot-crit::before {
        display: block;
        animation: soStatusPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .so-dot.dot-crit::after {
        box-shadow: 0 0 6px rgba(239, 68, 68, 0.65);
      }

      .so-dot.dot-idle {
        color: #71717a;
      }
      .so-dot.dot-idle::before {
        display: block;
        animation: soStatusPing 2.4s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .so-dot.dot-idle::after {
        box-shadow: 0 0 4px rgba(113, 113, 122, 0.4);
      }

      @keyframes soStatusPing {
        0% {
          transform: scale(0.95);
          opacity: 0.8;
        }
        70%, 100% {
          transform: scale(2.4);
          opacity: 0;
        }
      }

      /* ── Shadcn UI Tooltip Component (Floating HUD) ── */
      .so-tooltip {
        position: fixed;
        z-index: 2147483647;
        background: #09090b;
        color: #f4f4f5;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 6px;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
        line-height: 1.3;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.75);
        animation: soTooltipIn 120ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      @keyframes soTooltipIn {
        from {
          opacity: 0;
          transform: scale(0.96);
        }
        to {
          opacity: 1;
          transform: scale(1);
        }
      }

      .so-tooltip.is-rich {
        background: transparent !important;
        border: none !important;
        padding: 0 !important;
        box-shadow: none !important;
        white-space: normal !important;
        border-radius: 0 !important;
      }

      /* ── Card Flutuante de Cotas ao Passar o Mouse (Midnight Precision) ── */
      .so-quota-hovercard {
        background: #0d0e10;
        border: 1px solid #23252a;
        border-radius: 8px;
        padding: 10px 12px;
        width: 240px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05);
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        backdrop-filter: blur(12px);
      }

      .so-qh-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .so-qh-user {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        flex: 1;
      }

      .so-qh-avatar-icon {
        width: 13px;
        height: 13px;
        color: #8a8f98;
        flex-shrink: 0;
      }

      .so-qh-email {
        font-size: 11px;
        font-weight: 500;
        color: #ffffff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .so-qh-plan-chip {
        font-size: 9.5px;
        font-weight: 500;
        color: #8a8f98;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 4px;
        padding: 1px 6px;
        flex-shrink: 0;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 3.5px;
      }

      .so-qh-plan-chip .icon-chatgpt {
        width: 12px;
        height: 12px;
        color: #ffffff;
        flex-shrink: 0;
      }

      .so-qh-bars {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .so-qh-item {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .so-qh-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10.5px;
      }

      .so-qh-label {
        color: #8a8f98;
        font-weight: 450;
      }

      .so-qh-val {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-weight: 600;
        font-feature-settings: "tnum" 1;
        font-size: 11px;
      }

      .so-qh-val.ok { color: #27a644; }
      .so-qh-val.warn { color: #f59e0b; }
      .so-qh-val.crit { color: #eb5757; }

      .so-qh-track {
        height: 4px;
        border-radius: 9999px;
        background: #18191c;
        border: 1px solid rgba(255, 255, 255, 0.06);
        overflow: hidden;
      }

      .so-qh-bar {
        height: 100%;
        border-radius: 9999px;
        transition: width 200ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .so-qh-bar.ok { background: #27a644; }
      .so-qh-bar.warn { background: #f59e0b; }
      .so-qh-bar.crit { background: #eb5757; }

      .so-qh-sub {
        font-size: 9.5px;
        color: #62666d;
        display: flex;
        align-items: center;
        justify-content: flex-end;
      }

      .so-qh-sub.available {
        color: #27a644;
      }

      .so-btn-close {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e4e4e7;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        transition: all 140ms cubic-bezier(0.16, 1, 0.3, 1);
      }

      .so-btn-close:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.22);
        transform: scale(1.06);
      }

      .so-btn-close:active {
        transform: scale(0.94);
        background: rgba(255, 255, 255, 0.12);
      }

      .so-btn.is-syncing svg {
        animation: soRefreshSpin 0.75s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }

      @keyframes soRefreshSpin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      /* Card da Conta em Uso */
      .so-active-account-card {
        padding: 12px;
        border-bottom: 1px solid #23252a;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: #0f1011;
      }

      .so-section-caption {
        font-size: 11px;
        font-weight: 500;
        color: #8a8f98;
        letter-spacing: -0.01em;
      }

      .so-account-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .so-account-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #161718;
        border: 1px solid #23252a;
        color: #ffffff;
        font-size: 12px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .so-account-avatar img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
      }

      .so-account-details {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .so-account-email {
        font-size: 12px;
        font-weight: 500;
        color: #ffffff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .so-account-tags {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .so-tag {
        font-size: 9px;
        font-weight: 500;
        padding: 0 5px;
        border-radius: 3px;
        text-transform: uppercase;
        background: rgba(255, 255, 255, 0.05);
        color: #8a8f98;
        border: 1px solid #23252a;
      }

      .so-tag.owner {
        color: #e4f222;
        background: rgba(228, 242, 34, 0.1);
        border-color: rgba(228, 242, 34, 0.25);
      }

      .so-quota-badge {
        font-size: 14px;
        font-weight: 600;
        font-family: 'JetBrains Mono', monospace;
        font-feature-settings: "tnum" 1;
        color: #27a644;
      }

      .so-quota-badge.warn { color: #f59e0b; }
      .so-quota-badge.crit { color: #eb5757; }

      /* Barra de Progresso */
      .so-progress-box {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 2px;
      }

      .so-progress-labels {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 10px;
        color: #62666d;
      }

      .so-progress-track {
        height: 4px;
        border-radius: 9999px;
        background: #161718;
        border: 1px solid #23252a;
        overflow: hidden;
      }

      .so-progress-bar {
        height: 100%;
        border-radius: 9999px;
        background: #27a644;
        transition: width 200ms ease;
      }

      .so-progress-bar.warn { background: #f59e0b; }
      .so-progress-bar.crit { background: #eb5757; }

      /* Próxima na Fila */
      .so-next-in-line {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.015);
        border-bottom: 1px solid #23252a;
      }

      .so-next-icon {
        color: #8a8f98;
        display: flex;
        align-items: center;
      }

      .so-next-info {
        display: flex;
        flex-direction: column;
        gap: 1px;
        min-width: 0;
      }

      .so-next-title {
        font-size: 10px;
        color: #62666d;
      }

      .so-next-email {
        font-size: 11px;
        font-weight: 500;
        color: #d0d6e0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Lista de Contas para Troca Rápida */
      .so-accounts-section {
        padding: 8px 12px;
        border-bottom: 1px solid #23252a;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .so-section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        font-weight: 500;
        color: #8a8f98;
      }

      .so-section-count {
        font-size: 10px;
        color: #62666d;
        font-family: 'JetBrains Mono', monospace;
      }

      .so-accounts-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 120px;
        overflow-y: auto;
      }

      .so-account-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 5px 8px;
        border-radius: 6px;
        background: #161718;
        border: 1px solid #23252a;
        gap: 8px;
      }

      .so-account-item.active {
        border-color: rgba(228, 242, 34, 0.35);
        background: rgba(228, 242, 34, 0.04);
      }

      .so-item-email {
        font-size: 11px;
        color: #d0d6e0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      .so-item-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .so-item-pct {
        font-size: 11px;
        font-family: 'JetBrains Mono', monospace;
        font-feature-settings: "tnum" 1;
        color: #27a644;
      }

      .so-btn-switch {
        background: transparent;
        border: 1px solid #383b3f;
        color: #d0d6e0;
        font-size: 10px;
        padding: 2px 7px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 120ms ease, color 120ms ease;
      }

      .so-btn-switch:hover {
        background: #23252a;
        color: #ffffff;
      }

      .so-item-badge-active {
        font-size: 10px;
        color: #e4f222;
        font-weight: 500;
      }

      /* ── Estado Zero (Sem contas) ── */
      .so-empty-card {
        padding: 22px 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        background: #0f1011;
      }

      .so-empty-icon-wrap {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: rgba(228, 242, 34, 0.08);
        border: 1px solid rgba(228, 242, 34, 0.22);
        color: #e4f222;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .so-empty-title {
        font-size: 13px;
        font-weight: 600;
        color: #ffffff;
        letter-spacing: -0.01em;
      }

      .so-empty-desc {
        font-size: 11px;
        line-height: 1.5;
        color: #8a8f98;
        max-width: 250px;
      }

      .so-empty-detected {
        font-size: 10px;
        color: #d0d6e0;
        background: #161718;
        border: 1px solid #23252a;
        padding: 6px 10px;
        border-radius: 6px;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 6px;
        text-align: left;
      }

      .so-empty-cta {
        margin-top: 4px;
        width: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 32px;
        border-radius: 6px;
        background: #e4f222;
        color: #08090a;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: opacity 120ms ease, transform 100ms ease;
      }

      .so-empty-cta:hover {
        opacity: 0.92;
      }

      .so-empty-cta:active {
        transform: scale(0.98);
      }

      /* Footer de Ações */
      .so-footer-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 12px;
        background: #161718;
      }

      .so-btn {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 500;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        border: none;
        user-select: none;
        transition: transform 100ms ease, opacity 120ms ease;
      }

      .so-btn:active {
        transform: scale(0.97);
      }

      .so-btn-primary {
        background: #e4f222;
        color: #08090a;
      }

      .so-btn-primary:hover {
        opacity: 0.95;
      }

      .so-btn-secondary {
        background: #23252a;
        color: #d0d6e0;
        border: 1px solid #383b3f;
        flex: 0 0 auto;
        padding: 0 10px;
      }

      .so-btn-secondary:hover {
        background: #2d3036;
        color: #ffffff;
      }

      .so-toast-inline {
        padding: 6px 12px;
        font-size: 11px;
        text-align: center;
        background: rgba(39, 166, 68, 0.15);
        color: #27a644;
        border-bottom: 1px solid rgba(39, 166, 68, 0.25);
      }

      /* ── Shadcn UI Badge Component ── */
      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        border: 1px solid transparent;
        font-size: 10px;
        font-weight: 500;
        line-height: 1;
        padding: 2px 6px;
        gap: 4px;
        white-space: nowrap;
        user-select: none;
      }
      .badge-default { background: #ffffff; color: #08090a; font-weight: 600; }
      .badge-secondary { background: rgba(255, 255, 255, 0.08); color: #d0d6e0; border-color: rgba(255, 255, 255, 0.08); }
      .badge-outline { background: transparent; color: #8a8f98; border-color: #23252a; }
      .badge-destructive { background: rgba(235, 87, 87, 0.15); color: #f87171; border-color: rgba(235, 87, 87, 0.32); }
      .badge-success { background: rgba(39, 166, 68, 0.15); color: #4ade80; border-color: rgba(39, 166, 68, 0.32); }
      .badge-warning { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border-color: rgba(245, 158, 11, 0.32); }
      .badge-accent { background: rgba(228, 242, 34, 0.12); color: #e4f222; border-color: rgba(228, 242, 34, 0.3); }

      /* ── Shadcn UI Spinner Component ── */
      .spinner {
        display: inline-block;
        flex-shrink: 0;
        vertical-align: middle;
      }
      .animate-spin {
        animation: so-spinner-spin 0.75s linear infinite;
      }
      @keyframes so-spinner-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .size-3 { width: 12px; height: 12px; }
      .size-3\\.5 { width: 14px; height: 14px; }
      .size-4 { width: 16px; height: 16px; }
      [data-icon="inline-start"] { margin-inline-end: 4px; flex-shrink: 0; }
      [data-icon="inline-end"] { margin-inline-start: 4px; flex-shrink: 0; }
    `;

    shadowRoot.appendChild(style);

    hudContainer = document.createElement('div');
    hudContainer.className = 'so-hud-wrapper';
    hudContainer.innerHTML = `
      <!-- Popover Menu Flutuante -->
      <div class="so-popover" id="so-popover" hidden>
        <div class="so-toast-inline" id="so-toast" hidden></div>

        <div class="so-popover-header">
          <div class="so-header-left">
            <div class="so-header-logo">
              ${CHATGPT_ICON_SVG}
            </div>
            <span class="so-title">SeatOrbit</span>
          </div>
          <div class="so-header-right">
            <button class="so-btn-close" id="so-btn-close" data-tooltip="Fechar" data-tooltip-side="left">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Conteúdo Dinâmico do Popover (2-Mode System) -->
        <div class="so-popover-body" id="so-popover-body"></div>
      </div>

      <!-- Tooltip Shadcn Flutuante Global do HUD -->
      <div class="so-tooltip" id="so-tooltip" role="tooltip" hidden></div>

      <!-- Precision Micro-Dock Flutuante -->
      <div class="so-dock is-zero" id="so-dock" role="button" tabindex="0">
        <div class="so-dock-logo-wrap" title="ChatGPT">
          ${CHATGPT_ICON_SVG}
        </div>
        <span class="so-dock-label-connect">Conectar</span>
      </div>
    `;

    shadowRoot.appendChild(hudContainer);
    document.documentElement.appendChild(host);

    bindHudEvents();
  }

  function showHudToast(text) {
    if (!shadowRoot) return;
    const toast = shadowRoot.getElementById('so-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.hidden = false;
    setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }

  function togglePopover(expand) {
    isExpanded = typeof expand === 'boolean' ? expand : !isExpanded;
    if (!shadowRoot) return;
    const tooltipEl = shadowRoot.getElementById('so-tooltip');
    if (tooltipEl) {
      tooltipEl.hidden = true;
      tooltipEl.style.visibility = 'hidden';
      tooltipEl.classList.remove('is-rich');
    }
    const popover = shadowRoot.getElementById('so-popover');
    const dock = shadowRoot.getElementById('so-dock');
    if (popover && dock) {
      popover.hidden = !isExpanded;
      dock.classList.toggle('expanded', isExpanded);
      const trigger = shadowRoot.getElementById('so-dock-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      if (isExpanded) {
        syncState();
      }
    }
  }

  function bindHudEvents() {
    if (!shadowRoot) return;

    initHudTooltips();

    const dock = shadowRoot.getElementById('so-dock');
    if (dock) {
      dock.addEventListener('click', async (e) => {
        // Modo Zero: clique no dock abre o painel explicativo
        if (dock.classList.contains('is-zero') || e.target.closest('.so-dock.is-zero')) {
          e.stopPropagation();
          togglePopover();
          return;
        }

        // 1. Alternar / Expandir Popover ao clicar na identidade ou chevron
        if (e.target.closest('#so-dock-trigger') || e.target.closest('#so-dock-btn-chevron')) {
          e.stopPropagation();
          togglePopover();
          return;
        }

        // 2. Troca Rápida de Conta Direto no Dock
        const btnSwitch = e.target.closest('#so-dock-btn-switch');
        if (btnSwitch) {
          e.stopPropagation();
          const conns = Object.values(DB?.connections || {});
          if (conns.length === 0) {
            showHudToast('Nenhuma conta cadastrada');
            return;
          }
          if (conns.length < 2) {
            showHudToast('Requer ao menos 2 contas');
            return;
          }
          btnSwitch.disabled = true;
          showHudToast('Alternando conta...');
          try {
            const res = await send({ type: 'RUN_CYCLE', manual: true });
            await syncState();
            await probeSession();
            if (res?.switched) {
              const userPart = res.email ? res.email.split('@')[0] : '';
              showHudToast(`✓ Conta trocada: ${userPart}`);
              setTimeout(() => window.location.reload(), 800);
            } else if (res?.error) {
              showHudToast(`✕ ${res.error}`);
            } else if (res?.message) {
              showHudToast(res.message);
            } else {
              showHudToast('✓ Limites verificados');
            }
          } catch {
            showHudToast('✕ Falha ao trocar conta');
          } finally {
            btnSwitch.disabled = false;
          }
          return;
        }

        // 3. Sincronização Rápida de Limites Direto no Dock
        const btnSync = e.target.closest('#so-dock-btn-sync');
        if (btnSync) {
          e.stopPropagation();
          const conns = Object.values(DB?.connections || {});
          if (conns.length === 0) {
            showHudToast('Nenhuma conta cadastrada');
            return;
          }
          btnSync.disabled = true;
          btnSync.classList.add('is-syncing');
          showHudToast('Sincronizando limites...');
          try {
            await send({ type: 'POLL' });
            await syncState();
            showHudToast('✓ Limites atualizados');
          } catch {
            showHudToast('✕ Erro ao atualizar limites');
          } finally {
            btnSync.classList.remove('is-syncing');
            btnSync.disabled = false;
          }
          return;
        }

        // 4. Conectar Conta Direto no Dock (Estado Zero)
        const btnConnect = e.target.closest('#so-dock-btn-connect');
        if (btnConnect) {
          e.stopPropagation();
          showHudToast('Conectando conta ativa...');
          const res = await send({ type: 'CAPTURE_ACTIVE_TAB', asOwner: !DB?.owner });
          if (res?.ok) {
            showHudToast('Conta conectada: ' + res.email.split('@')[0]);
            await syncState();
            renderDock();
            renderPopover();
          } else {
            showHudToast('Abrindo login no ChatGPT...');
            await send({ type: DB?.owner ? 'ADD_ACCOUNT' : 'LOGIN_OWNER' });
          }
          return;
        }
      });
    }

    shadowRoot.getElementById('so-btn-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePopover(false);
    });

    function renderSpinner(size = 'size-4', dataIcon = '') {
      const iconAttr = dataIcon ? ` data-icon="${dataIcon}"` : '';
      return `<svg class="spinner ${size} animate-spin"${iconAttr} role="status" aria-label="Carregando" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
    }

    // Delegação unificada de eventos dinâmicos no popover
    const popover = shadowRoot.getElementById('so-popover');
    if (popover) {
      popover.addEventListener('click', async (e) => {
        // 1. CTA Conectar Conta (Estado Zero)
        const emptyCta = e.target.closest('#so-btn-empty-connect');
        if (emptyCta) {
          e.stopPropagation();
          showHudToast('Conectando conta ativa...');
          const res = await send({ type: 'CAPTURE_ACTIVE_TAB', asOwner: !DB?.owner });
          if (res?.ok) {
            showHudToast('Conta conectada: ' + res.email.split('@')[0]);
            await syncState();
            renderDock();
            renderPopover();
          } else {
            showHudToast('Abrindo login no ChatGPT...');
            await send({ type: DB?.owner ? 'ADD_ACCOUNT' : 'LOGIN_OWNER' });
          }
          return;
        }

        // 2. Trocar conta agora
        const btnSwitch = e.target.closest('#so-btn-quick-switch');
        if (btnSwitch) {
          e.stopPropagation();
          const conns = Object.values(DB?.connections || {});
          if (conns.length === 0) {
            showHudToast('Nenhuma conta cadastrada');
            return;
          }
          if (conns.length < 2) {
            showHudToast('Requer ao menos 2 contas');
            return;
          }
          const origHtml = btnSwitch.innerHTML;
          btnSwitch.disabled = true;
          btnSwitch.innerHTML = `${renderSpinner('size-3', 'inline-start')}<span>Trocando...</span>`;
          showHudToast('Trocando conta...');
          try {
            const res = await send({ type: 'RUN_CYCLE', manual: true });
            await syncState();
            await probeSession();
            if (res?.switched) {
              const userPart = res.email ? res.email.split('@')[0] : '';
              showHudToast(`✓ Conta trocada: ${userPart}`);
              setTimeout(() => window.location.reload(), 1000);
            } else if (res?.error) {
              showHudToast(`✕ ${res.error}`);
            } else if (res?.message) {
              showHudToast(res.message);
            } else {
              showHudToast('✓ Limites verificados');
            }
          } catch {
            showHudToast('✕ Falha ao trocar conta');
          } finally {
            btnSwitch.disabled = false;
            btnSwitch.innerHTML = origHtml;
          }
          return;
        }

        // 3. Atualizar limites
        const btnSync = e.target.closest('#so-btn-quick-sync');
        if (btnSync) {
          e.stopPropagation();
          const conns = Object.values(DB?.connections || {});
          if (conns.length === 0) {
            showHudToast('Nenhuma conta cadastrada');
            return;
          }
          btnSync.disabled = true;
          btnSync.classList.add('is-syncing');
          try {
            await send({ type: 'POLL' });
            await syncState();
            showHudToast('✓ Limites atualizados');
          } catch {
            showHudToast('✕ Erro ao atualizar limites');
          } finally {
            btnSync.classList.remove('is-syncing');
            btnSync.disabled = false;
          }
          return;
        }

        // 4. Troca manual de conta na lista
        const btnItemSwitch = e.target.closest('[data-switch-key]');
        if (btnItemSwitch) {
          e.stopPropagation();
          const key = btnItemSwitch.dataset.switchKey;
          const email = key.split('__')[0];
          if (activeEmail && activeEmail.toLowerCase() === email.toLowerCase()) {
            showHudToast('Conta já em uso');
            return;
          }
          btnItemSwitch.disabled = true;
          btnItemSwitch.innerHTML = renderSpinner('size-3');
          showHudToast('Trocando conta...');
          const r = await send({ type: 'SWITCH_ACCOUNT', key });
          if (r?.ok) {
            showHudToast(`✓ Ativa: ${email.split('@')[0]}`);
            setTimeout(() => window.location.reload(), 800);
          } else {
            showHudToast('✕ Falha ao trocar conta');
            btnItemSwitch.disabled = false;
            btnItemSwitch.textContent = 'Usar';
          }
          return;
        }
      });
    }

    // Fechar ao clicar fora
    document.addEventListener('click', (e) => {
      if (isExpanded && !e.composedPath().includes(hudContainer)) {
        togglePopover(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isExpanded) {
        togglePopover(false);
      }
    });
  }

  function initHudTooltips() {
    if (!shadowRoot) return;
    const tooltipEl = shadowRoot.getElementById('so-tooltip');
    if (!tooltipEl) return;

    let showTimer = null;

    const showTooltip = (target) => {
      if (isExpanded) return;

      const isQuotaCard = target.id === 'so-dock-trigger' || target.getAttribute('data-tooltip-type') === 'quota';
      const richHtml = isQuotaCard
        ? buildQuotaHoverHtml(activeTargetConn)
        : target.getAttribute('data-tooltip-html');
      const text = target.getAttribute('data-tooltip');

      if (!richHtml && !text) return;

      if (richHtml) {
        tooltipEl.classList.add('is-rich');
        tooltipEl.innerHTML = richHtml;
      } else {
        tooltipEl.classList.remove('is-rich');
        tooltipEl.textContent = text;
      }

      tooltipEl.style.top = '0px';
      tooltipEl.style.left = '0px';
      tooltipEl.hidden = false;
      tooltipEl.style.visibility = 'hidden';

      const rect = target.getBoundingClientRect();
      const side = target.getAttribute('data-tooltip-side') || 'top';
      const ttRect = tooltipEl.getBoundingClientRect();

      let top = 0;
      let left = 0;

      if (side === 'right') {
        top = rect.top + (rect.height - ttRect.height) / 2;
        left = rect.right + 8;
      } else if (side === 'left') {
        top = isQuotaCard
          ? rect.bottom - ttRect.height
          : rect.top + (rect.height - ttRect.height) / 2;
        left = rect.left - ttRect.width - 8;
      } else if (side === 'bottom') {
        top = rect.bottom + 6;
        left = rect.left + (rect.width - ttRect.width) / 2;
      } else {
        top = rect.top - ttRect.height - 6;
        left = rect.left + (rect.width - ttRect.width) / 2;
      }

      if (left < 10) left = 10;
      if (left + ttRect.width > window.innerWidth - 10) {
        left = window.innerWidth - ttRect.width - 10;
      }
      if (top < 10) top = 10;
      if (top + ttRect.height > window.innerHeight - 10) {
        top = window.innerHeight - ttRect.height - 10;
      }

      tooltipEl.style.top = `${Math.round(top)}px`;
      tooltipEl.style.left = `${Math.round(left)}px`;
      tooltipEl.style.visibility = 'visible';
    };

    const hideTooltip = () => {
      clearTimeout(showTimer);
      tooltipEl.hidden = true;
      tooltipEl.style.visibility = 'hidden';
      tooltipEl.classList.remove('is-rich');
    };

    const findTrigger = (path) =>
      path.find(
        (el) =>
          el?.getAttribute &&
          (el.getAttribute('data-tooltip') ||
            el.getAttribute('data-tooltip-html') ||
            el.getAttribute('data-tooltip-type'))
      );

    shadowRoot.addEventListener('mouseover', (e) => {
      const trigger = findTrigger(e.composedPath());
      if (!trigger) return;
      if (e.relatedTarget && (trigger === e.relatedTarget || trigger.contains(e.relatedTarget))) return;

      clearTimeout(showTimer);
      showTimer = setTimeout(() => showTooltip(trigger), 30);
    });

    shadowRoot.addEventListener('mouseout', (e) => {
      const trigger = findTrigger(e.composedPath());
      if (!trigger) return;
      if (e.relatedTarget && (trigger === e.relatedTarget || trigger.contains(e.relatedTarget))) return;

      hideTooltip();
    });

    shadowRoot.addEventListener('focusin', (e) => {
      const trigger = findTrigger(e.composedPath());
      if (trigger) showTooltip(trigger);
    });

    shadowRoot.addEventListener('focusout', () => {
      hideTooltip();
    });

    shadowRoot.addEventListener('click', () => {
      hideTooltip();
    });
  }

  function renderHud() {
    if (!shadowRoot) return;

    const conns = Object.values(DB?.connections || {});
    const isAutoRunning = DB?.automations?.running === true;

    // Identifica se a conta ativa na aba do ChatGPT está cadastrada no SeatOrbit
    const activeConn = conns.find((c) => activeEmail && c.email?.toLowerCase() === activeEmail?.toLowerCase())
      || conns.find((c) => c.isActive)
      || conns.find((c) => DB?.owner?.email && c.email?.toLowerCase() === DB.owner.email.toLowerCase())
      || conns[0]
      || null;

    const currentConn = conns.find((c) => activeEmail && c.email?.toLowerCase() === activeEmail?.toLowerCase()) || null;
    const isEnrolled = !!currentConn;
    const targetConn = currentConn || activeConn;
    activeTargetConn = targetConn;
    const hasAnyAccounts = conns.length > 0;

    const gauge = targetConn ? Math.round(gaugeMax(targetConn)) : 0;
    const isExhausted = targetConn?.quota?.exhausted === true || gauge >= 100;
    const gaugeSev = gauge >= 85 ? 'crit' : gauge >= 50 ? 'warn' : 'ok';
    const isOwner = targetConn && DB?.owner?.email && targetConn.email.toLowerCase() === DB.owner.email.toLowerCase();

    // Extrai limites Diário (5h) e Semanal (7d) para exibição criativa no dock
    const windows = targetConn?.quota?.windows || [];
    const daily = windows.find((w) => w.durationSecs === 18000 || w.id === 'primary' || w.isPrimary || /curt|5h|diár|mensag/i.test(w.label)) || windows[0] || null;
    const weekly = windows.find((w) => w.durationSecs === 604800 || w.id === 'secondary' || /seman|7d/i.test(w.label)) || (windows.length > 1 && windows[1] !== daily ? windows[1] : null);

    const dailyPct = daily ? Math.min(100, Math.round(daily.usedPercent ?? 0)) : 0;
    const dailySev = dailyPct >= 85 ? 'crit' : dailyPct >= 50 ? 'warn' : 'ok';

    const weeklyPct = weekly ? Math.min(100, Math.round(weekly.usedPercent ?? 0)) : 0;
    const weeklySev = weeklyPct >= 85 ? 'crit' : weeklyPct >= 50 ? 'warn' : 'ok';

    // 1. Atualiza o Precision Micro-Dock (Super Compacto e Minimalista)
    const dockEl = shadowRoot.getElementById('so-dock');
    if (dockEl) {
      if (!hasAnyAccounts) {
        // Modo Zero: Micro-Pílula [ ⑯ Conectar ]
        dockEl.className = 'so-dock is-zero' + (isExpanded ? ' expanded' : '');
        dockEl.setAttribute('data-tooltip', 'SeatOrbit: Conectar conta do ChatGPT');
        dockEl.setAttribute('data-tooltip-side', 'left');
        dockEl.setAttribute('role', 'button');
        dockEl.setAttribute('tabindex', '0');
        dockEl.innerHTML = `
          <div class="so-dock-logo-wrap" title="ChatGPT">
            ${CHATGPT_ICON_SVG}
          </div>
          <span class="so-dock-label-connect">Conectar</span>
        `;
      } else {
        // Modo Ativo: Micro-Dock Criativo com Limite Duplo [ ⚪ Dia 0% │ Sem 14% │ ⇄ ▾ ]
        dockEl.className = 'so-dock' + (isExpanded ? ' expanded' : '');
        dockEl.removeAttribute('data-tooltip');
        dockEl.removeAttribute('role');
        dockEl.removeAttribute('tabindex');

        const canSwitch = conns.length > 1;

        dockEl.innerHTML = `
          <div class="so-dock-trigger" id="so-dock-trigger" role="button" tabindex="0" data-tooltip-type="quota" data-tooltip-side="left">
            <div class="so-dock-logo-wrap" title="ChatGPT">
              ${CHATGPT_ICON_SVG}
            </div>
            ${targetConn ? `
              <div class="so-dock-metrics">
                <div class="so-dock-limit-chip" title="Limite Diário (5h): ${dailyPct}% consumido">
                  <div class="so-dock-limit-row">
                    <span class="so-limit-lbl">Dia</span>
                    <span class="so-limit-val ${dailySev}">${dailyPct}%</span>
                  </div>
                  <span class="so-limit-bar-bg"><span class="so-limit-bar-fill ${dailySev}" style="width: ${dailyPct}%;"></span></span>
                </div>
                <span class="so-dock-limit-sep"></span>
                <div class="so-dock-limit-chip" title="Limite Semanal (7d): ${weeklyPct}% consumido">
                  <div class="so-dock-limit-row">
                    <span class="so-limit-lbl">Sem</span>
                    <span class="so-limit-val ${weeklySev}">${weeklyPct}%</span>
                  </div>
                  <span class="so-limit-bar-bg"><span class="so-limit-bar-fill ${weeklySev}" style="width: ${weeklyPct}%;"></span></span>
                </div>
              </div>
            ` : `
              <span class="so-dock-badge">${conns.length} ${conns.length === 1 ? 'Conta' : 'Contas'}</span>
            `}
          </div>
          <span class="so-dock-sep"></span>
          <div class="so-dock-actions" id="so-dock-actions">
            <button class="so-dock-btn" id="so-dock-btn-switch" data-tooltip="${canSwitch ? 'Troca rápida: Alternar conta' : 'Adicione outra conta para rotacionar'}" data-tooltip-side="top" aria-label="Trocar conta">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m16 3 4 4-4 4"/>
                <path d="M20 7H4"/>
                <path d="m8 21-4-4 4-4"/>
                <path d="M4 17h16"/>
              </svg>
            </button>
            <button class="so-dock-btn so-dock-btn-chevron" id="so-dock-btn-chevron" data-tooltip="Painel completo" data-tooltip-side="top" aria-label="Painel">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </div>
        `;
      }
    }

    // 3. Renderiza o Corpo do Popover (2-Mode System)
    const bodyEl = shadowRoot.getElementById('so-popover-body');
    if (!bodyEl) return;

    if (!hasAnyAccounts) {
      // ── MODO 1: ESTADO ZERO (Clean Onboarding) ──
      bodyEl.innerHTML = `
        <div class="so-empty-card">
          <div class="so-empty-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <path d="M12 8v8"/>
              <path d="M8 12h8"/>
            </svg>
          </div>
          <div class="so-empty-title">Nenhuma conta vinculada</div>
          <div class="so-empty-desc">
            Vincule sua primeira conta do ChatGPT para monitorar limites e gerenciar rotação automática com precisão.
          </div>
          ${activeEmail ? `
            <div class="so-empty-detected">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; color:#e4f222;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">Detectada: <strong>${esc(activeEmail)}</strong></span>
            </div>
          ` : ''}
          <button class="so-empty-cta" id="so-btn-empty-connect">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            <span>Conectar Conta</span>
          </button>
        </div>
      `;
    } else {
      // ── MODO 2: DASHBOARD OPERACIONAL ──
      const firstWindow = currentConn?.quota?.windows?.[0];
      const resetText = isEnrolled
        ? (firstWindow?.resetAt && gauge > 0 ? `Renova ${untilReset(firstWindow.resetAt)}` : (isExhausted ? 'Limite atingido' : 'Sem espera ativa'))
        : 'Adicione esta conta pelo painel';

      const avatarHtml = currentConn?.userImage
        ? `<img src="${esc(currentConn.userImage)}" alt="">`
        : (currentConn?.email || activeEmail
          ? (currentConn?.email || activeEmail).charAt(0).toUpperCase()
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`);

      const emailDisplay = isEnrolled
        ? currentConn.email
        : (activeEmail ? activeEmail : 'Sessão desconectada');

      const planClean = (currentConn?.planType || currentConn?.quota?.plan || 'Plus').replace(/chatgpt[\s\-_]*/gi, '').trim() || 'Plus';
      const planDisplay = isEnrolled
        ? planClean.toUpperCase()
        : 'NÃO VINCULADA';

      const gaugeDisplay = isEnrolled
        ? `<div class="so-quota-badge ${gaugeSev}">${gauge}%</div>`
        : `<span class="badge badge-warning" style="font-size:10px;">Pendente</span>`;

      // Próxima da Fila
      const queue = DB?.queue || [];
      const nextKey = queue.find((k) => k !== currentConn?.key);
      let nextLineHtml = '';
      if (nextKey) {
        const nextConn = DB?.connections?.[nextKey];
        const nextEmail = nextConn?.email || nextKey.split('__')[0];
        const nextG = nextConn ? Math.round(gaugeMax(nextConn)) : 0;
        nextLineHtml = `${esc(nextEmail)} (${nextG}% limite usado)`;
      } else {
        nextLineHtml = conns.length > 1
          ? 'Nenhuma outra conta configurada na fila'
          : 'Cadastre mais contas para revezamento';
      }

      // Lista de Contas
      const accountsListHtml = conns
        .map((c) => {
          const isCurrent = currentConn && c.email?.toLowerCase() === currentConn.email.toLowerCase();
          const g = Math.round(gaugeMax(c));
          const s = g >= 85 ? 'crit' : g >= 50 ? 'warn' : 'ok';
          const sColor = s === 'crit' ? '#eb5757' : s === 'warn' ? '#f59e0b' : '#27a644';

          return `
            <div class="so-account-item ${isCurrent ? 'active' : ''}">
              <span class="so-item-email">${esc(c.email)}</span>
              <div class="so-item-right">
                <span class="so-item-pct" style="color: ${sColor}">${g}%</span>
                ${isCurrent
                  ? '<span class="so-item-badge-active">Ativa</span>'
                  : `<button class="so-btn-switch" data-switch-key="${esc(c.key)}">Usar</button>`
                }
              </div>
            </div>
          `;
        })
        .join('');

      bodyEl.innerHTML = `
        <!-- Conta Ativa em Uso -->
        <div class="so-active-account-card">
          <div class="so-section-caption">Conta em uso no navegador</div>
          <div class="so-account-row">
            <div class="so-account-avatar">${avatarHtml}</div>
            <div class="so-account-details">
              <div class="so-account-email">${esc(emailDisplay)}</div>
              <div class="so-account-tags">
                <span class="badge ${isEnrolled ? 'badge-outline' : 'badge-warning'}">${CHATGPT_ICON_SVG}<span>${esc(planDisplay)}</span></span>
              </div>
            </div>
            ${gaugeDisplay}
          </div>
          <div class="so-progress-box">
            <div class="so-progress-labels">
              <span>${esc(firstWindow?.label || 'Monitoramento de Limites')}</span>
              <span>${esc(resetText)}</span>
            </div>
            <div class="so-progress-track">
              <div class="so-progress-bar ${gaugeSev}" style="width: ${isEnrolled ? Math.min(100, gauge) : 0}%"></div>
            </div>
          </div>
        </div>

        <!-- Próxima Conta na Fila -->
        <div class="so-next-in-line">
          <div class="so-next-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </div>
          <div class="so-next-info">
            <span class="so-next-title">Próxima conta na fila</span>
            <span class="so-next-email">${nextLineHtml}</span>
          </div>
        </div>

        <!-- Lista de Contas do Workspace -->
        <div class="so-accounts-section">
          <div class="so-section-header">
            <span>Contas do Workspace</span>
            <span class="so-section-count">${conns.length} conta${conns.length === 1 ? '' : 's'}</span>
          </div>
          <div class="so-accounts-list">
            ${accountsListHtml}
          </div>
        </div>

        <!-- Ações do Footer -->
        <div class="so-footer-actions">
          <button class="so-btn so-btn-primary" id="so-btn-quick-switch"
            style="${conns.length < 2 ? 'opacity: 0.45; filter: grayscale(1);' : 'opacity: 1; filter: none;'}"
            data-tooltip="${conns.length < 2 ? 'Requer ao menos 2 contas' : 'Trocar conta ativa'}"
            data-tooltip-side="top">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17h16"/><path d="m16 21 4-4-4-4"/><path d="M20 7H4"/><path d="m8 3-4 4 4 4"/></svg>
            <span>Trocar Conta</span>
          </button>
          <button class="so-btn so-btn-secondary" id="so-btn-quick-sync" data-tooltip="Atualizar limites" data-tooltip-side="top">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
            <span>Atualizar</span>
          </button>
        </div>
      `;
    }
  }

  // Monitoramento de identidade e inicialização
  setInterval(probeSession, 10000);
  setTimeout(probeSession, 1200);
  setInterval(probeUsage, 45000);
  setTimeout(probeUsage, 2500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initHud();
      Promise.all([syncState(), probeSession()]);
    });
  } else {
    initHud();
    Promise.all([syncState(), probeSession()]);
  }

  // Listener para sincronização automática quando background enviar mensagens
  if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'DB_UPDATED') {
        if (msg.db && typeof msg.db === 'object') {
          DB = msg.db;
          renderHud();
        } else {
          syncState();
        }
      } else if (msg?.type === 'STATE_CHANGED' || msg?.type === 'TOAST_SHOW') {
        syncState();
      }
    });
  }
})();

/**
 * ============================================================================
 * Fim do arquivo - SeatOrbit Content Script (Quick HUD)
 * Desenvolvido por: @OTheMandaloriano (https://github.com/OTheMandaloriano)
 * ============================================================================
 */
