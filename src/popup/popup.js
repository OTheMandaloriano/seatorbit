/**
 * ============================================================================
 * SeatOrbit - Sistema de Gerenciamento e Rotação de Contas ChatGPT
 * Desenvolvido por: @OTheMandaloriano
 * GitHub: https://github.com/OTheMandaloriano
 * Todos os direitos reservados.
 * ============================================================================
 */

(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const send = (msg, timeoutMs = 1500) =>
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

  // Helper Shadcn UI Spinner Component
  function renderSpinner(size = 'size-4', dataIcon = '') {
    const iconAttr = dataIcon ? ` data-icon="${dataIcon}"` : '';
    return `<svg class="spinner ${size} animate-spin"${iconAttr} role="status" aria-label="Carregando" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
  }

  const sev = (pct) => (pct >= 85 ? 'crit' : pct >= 60 ? 'warn' : 'ok');

  function cleanPlanName(plan) {
    if (!plan) return 'Free';
    let str = String(plan).trim();
    str = str.replace(/chatgpt[\s\-_]*/gi, '').trim();
    if (!str) return 'Plus';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

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

  function formatResetDetails(resetAt) {
    if (!resetAt) return null;
    const d = new Date(resetAt);
    if (isNaN(d.getTime())) return null;

    const now = Date.now();
    const diff = resetAt - now;
    const isPast = diff <= 0;

    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const dateStr = `${day} de ${month}`;

    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    let targetStr = '';
    if (isToday) {
      targetStr = `hoje às ${timeStr}`;
    } else if (isTomorrow) {
      targetStr = `amanhã às ${timeStr}`;
    } else {
      targetStr = `${dateStr} às ${timeStr}`;
    }

    let countdownStr = '';
    if (isPast) {
      countdownStr = 'livre agora';
    } else {
      const totalMin = Math.floor(diff / 60000);
      const rh = Math.floor(totalMin / 60);
      const rm = totalMin % 60;
      if (rh >= 24) {
        const rd = Math.floor(rh / 24);
        const remH = rh % 24;
        countdownStr = `em ${rd}d${remH ? ' ' + remH + 'h' : ''}`;
      } else if (rh > 0) {
        countdownStr = `em ${rh}h ${rm}m`;
      } else {
        countdownStr = `em ${rm}m`;
      }
    }

    const nearMins = Number(DB?.audio?.nearResetMins) || 30;

    return {
      targetStr,
      countdownStr,
      full: `Reinicia ${targetStr} (${countdownStr})`,
      timeStr,
      dateStr,
      diff,
      isPast,
      isNearReset: !isPast && diff <= nearMins * 60 * 1000,
    };
  }

  function timeAgo(ts) {
    if (!ts) return 'recente';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 15) return 'agora';
    if (s < 60) return `${s}s atrás`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m atrás`;
    const h = Math.floor(m / 60);
    return `${h}h atrás`;
  }

  const ICONS = {
    shield: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    switch: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 17h16"/><path d="m16 21 4-4-4-4"/><path d="M20 7H4"/><path d="m8 3-4 4 4 4"/></svg>',
    trash: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
    up: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m18 15-6-6-6 6"/></svg>',
    down: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>',
    star: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    userX: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>',
    chatgpt: '<svg class="icon-chatgpt" viewBox="0 0 256 260" fill="currentColor"><path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z"/></svg>',
    flame: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  };

  const TOAST_ICONS = {
    ok: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    warn: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="13"/><circle cx="12" cy="18" r="1.1" fill="currentColor"/></svg>',
    crit: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1.1" fill="currentColor"/></svg>',
  };

  let DB = null;
  let currentLogFilter = 'all';

  async function syncState() {
    // 1. Carregamento ultrarrápido pelo storage local da extensão (<2ms)
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      try {
        const stored = await chrome.storage.local.get([
          'seatorbit.v7',
          'seatpilot.v7',
          'sr.v6',
          'admin_rotator_db',
          'chatgpt_rotator_db',
        ]);
        const localDb =
          stored['seatorbit.v7'] ||
          stored['seatpilot.v7'] ||
          stored['sr.v6'] ||
          stored.admin_rotator_db ||
          stored.chatgpt_rotator_db;
        if (localDb && typeof localDb === 'object') {
          DB = localDb;
        }
      } catch (e) {
        // ignora
      }
    }

    // 2. Consulta o service worker via mensagem (com timeout rápido de segurança)
    const res = await send({ type: 'GET_DB' }, 800);
    if (res?.db) {
      DB = res.db;
    }

    // 3. Fallback: se DB ainda for nulo, inicializa modelo padrão vazio para renderizar imediatamente
    if (!DB) {
      DB = {
        owner: null,
        connections: {},
        queue: [],
        automations: { running: false, autoRemove: true, autoInvite: true, cycleMs: 180000 },
        log: [],
      };
    }
  }

  // Listener reativo imediato para mudanças no storage local (ex: remoção ou adição de contas)
  if (typeof chrome !== 'undefined' && chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes['seatorbit.v7'] || changes['seatpilot.v7'] || changes['sr.v6'])) {
        const nextDb =
          changes['seatorbit.v7']?.newValue ||
          changes['seatpilot.v7']?.newValue ||
          changes['sr.v6']?.newValue;
        if (nextDb && typeof nextDb === 'object') {
          DB = nextDb;
          renderAll();
        }
      }
    });
  }

  function setTab(tabId) {
    $$('.nav-btn').forEach((btn) => {
      const isSelected = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isSelected);
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    $$('.panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `panel-${tabId}`);
    });
  }

  window.setTab = setTab;

  // Notificacoes Sonner / Dynamic Island Toast (Compacto, Centralizado no Topo)
  function showToast(kind, title, body = '') {
    const stack = $('#toast-stack');
    if (!stack) return;

    // Remove qualquer toast existente para evitar acumulo
    stack.querySelectorAll('.toast').forEach((t) => t.remove());

    // Sanitização e limites de segurança (nunca passar do limite permitido nem quebrar layout)
    let cleanTitle = String(title || '').trim();
    let cleanBody = String(body || '').trim();

    if (cleanTitle.length > 52) {
      cleanTitle = cleanTitle.slice(0, 49).replace(/\s+\S*$/, '') + '...';
    }
    if (cleanBody.length > 120) {
      cleanBody = cleanBody.slice(0, 116).replace(/\s+\S*$/, '') + '...';
    }

    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.innerHTML = `
      <div class="toast-badge ${kind}">
        ${TOAST_ICONS[kind] || TOAST_ICONS.ok}
      </div>
      <div class="toast-text">
        <span class="toast-title">${esc(cleanTitle)}</span>
        ${cleanBody ? `<span class="toast-body">${esc(cleanBody)}</span>` : ''}
      </div>
    `;

    // Fechar ao clicar
    el.addEventListener('click', () => {
      el.classList.add('dismissing');
      setTimeout(() => el.remove(), 160);
    });

    stack.appendChild(el);
    setTimeout(() => {
      if (!el.isConnected) return;
      el.classList.add('dismissing');
      setTimeout(() => el.remove(), 180);
    }, 4000);
  }

  window.showToast = showToast;

  // Toast com Barra de Expiração & Notificação de Reset Próximo
  function showNearResetToast({ conn, title, body, durationSec = 10, onAction }) {
    const stack = $('#toast-stack');
    if (!stack) return;

    const el = document.createElement('div');
    el.className = 'toast toast-near-reset';
    el.setAttribute('role', 'alert');

    let remaining = durationSec;

    el.innerHTML = `
      <div class="toast-content-wrap">
        <div class="toast-badge warn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <div class="toast-text">
          <div class="toast-top-row">
            <span class="toast-title">${esc(title)}</span>
            <span class="toast-countdown-tag font-mono">${remaining}s</span>
          </div>
          <span class="toast-body">${esc(body)}</span>
        </div>
      </div>
      <div class="toast-progress-track">
        <div class="toast-progress-bar" style="animation-duration: ${durationSec}s;"></div>
      </div>
    `;

    const countdownTag = el.querySelector('.toast-countdown-tag');

    const timer = setInterval(() => {
      remaining -= 1;
      if (countdownTag) {
        countdownTag.textContent = `${Math.max(0, remaining)}s`;
      }
      if (remaining <= 0) {
        dismiss();
      }
    }, 1000);

    function dismiss() {
      clearInterval(timer);
      if (!el.isConnected) return;
      el.classList.add('dismissing');
      setTimeout(() => el.remove(), 180);
    }

    el.addEventListener('click', (e) => {
      dismiss();
      if (typeof onAction === 'function') {
        onAction();
      }
    });

    stack.appendChild(el);
  }

  window.showNearResetToast = showNearResetToast;

  // Shadcn AlertDialog (Substituto moderno do confirm)
  function showShadcnDialog({ title, desc, confirmText = 'Confirmar', cancelText = 'Cancelar', isDestructive = false, icon = null }) {
    return new Promise((resolve) => {
      const backdrop = $('#shadcn-dialog-backdrop');
      const titleEl = $('#shadcn-dialog-title');
      const descEl = $('#shadcn-dialog-desc');
      const btnConfirm = $('#shadcn-dialog-confirm');
      const btnCancel = $('#shadcn-dialog-cancel');
      const iconSlot = $('#shadcn-dialog-icon');

      if (!backdrop || !titleEl || !descEl || !btnConfirm || !btnCancel) {
        return resolve(window.confirm(`${title}\n\n${desc}`));
      }

      titleEl.textContent = title;
      descEl.textContent = desc;

      const confirmIconSvg = isDestructive
        ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>'
        : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';

      btnConfirm.innerHTML = `${confirmIconSvg}<span>${esc(confirmText)}</span>`;
      btnCancel.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg><span>${esc(cancelText)}</span>`;

      btnConfirm.className = isDestructive ? 'btn btn-danger' : 'btn btn-primary';
      if (iconSlot) {
        iconSlot.className = isDestructive ? 'dialog-icon-box' : 'dialog-icon-box info';
        if (icon) {
          iconSlot.innerHTML = icon;
        } else {
          iconSlot.innerHTML = isDestructive
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="22" y2="13"/><line x1="22" y1="8" x2="17" y2="13"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
        }
      }

      backdrop.hidden = false;

      const cleanup = (val) => {
        backdrop.hidden = true;
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onBackdropClick);
        document.removeEventListener('keydown', onKeyDown);
        resolve(val);
      };

      const onConfirm = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onBackdropClick = (e) => {
        if (e.target === backdrop) cleanup(false);
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') cleanup(false);
      };

      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onBackdropClick);
      document.addEventListener('keydown', onKeyDown);
      btnConfirm.focus();
    });
  }

  // Helpers de Workspace e Proprietário
  function isWorkspacePlan(planType) {
    const p = (planType || '').toLowerCase();
    return p.includes('business') || p.includes('team') || p.includes('enterprise');
  }

  function isBusinessOwner(conn) {
    if (!conn) return false;
    const isBiz = isWorkspacePlan(conn.planType);
    const isOwnerOrAdmin = conn.isOwner === true || conn.isAdmin === true || conn.role === 'owner' || conn.role === 'admin';
    return isBiz && isOwnerOrAdmin;
  }

  // Controlador do Modal de Conectar Conta
  let modalAsOwner = false;
  let isDraggingQueue = false;

  function openAddAccountModal(asOwner = false) {
    modalAsOwner = asOwner;
    const backdrop = $('#add-account-dialog-backdrop');
    const titleEl = $('#add-modal-title');
    const subtitleEl = $('#add-modal-subtitle');
    const boxOptions = $('#box-add-options');
    const boxToken = $('#box-add-token');
    const tokenInput = $('#input-account-token');

    if (!backdrop) return;
    if (titleEl) {
      titleEl.textContent = 'Conectar Conta do ChatGPT';
    }
    if (subtitleEl) {
      subtitleEl.textContent = 'Escolha como deseja sincronizar sua conta ao SeatOrbit:';
    }

    if (boxOptions) boxOptions.hidden = false;
    if (boxToken) boxToken.hidden = true;
    if (tokenInput) tokenInput.value = '';
    hideModalNotice();

    backdrop.hidden = false;
  }

  function closeAddAccountModal() {
    const backdrop = $('#add-account-dialog-backdrop');
    if (backdrop) backdrop.hidden = true;
    hideModalNotice();
  }

  function showModalNotice(kind, title, descHtml) {
    const banner = $('#add-modal-banner');
    const titleEl = $('#notice-title');
    const descEl = $('#notice-desc');
    if (!banner || !titleEl || !descEl) return;

    banner.className = `modal-notice-banner ${kind}`;
    titleEl.textContent = title;
    descEl.innerHTML = descHtml;
    banner.hidden = false;
  }

  function hideModalNotice() {
    const banner = $('#add-modal-banner');
    if (banner) banner.hidden = true;
  }

  // Shadcn Tooltip Engine com Grupo de Atraso (Delay-Group)
  function initShadcnTooltips() {
    const tooltipEl = $('#shadcn-global-tooltip');
    if (!tooltipEl) return;

    let showTimer = null;
    let isGroupActive = false;
    let groupCooldownTimer = null;

    const showTooltip = (target) => {
      const text = target.getAttribute('data-tooltip');
      if (!text) return;

      tooltipEl.textContent = text;
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
        top = rect.top + (rect.height - ttRect.height) / 2;
        left = rect.left - ttRect.width - 8;
      } else if (side === 'bottom') {
        top = rect.bottom + 6;
        left = rect.left + (rect.width - ttRect.width) / 2;
      } else {
        // top padrão
        top = rect.top - ttRect.height - 6;
        left = rect.left + (rect.width - ttRect.width) / 2;
      }

      const maxW = Math.min(window.innerWidth, document.body.clientWidth || 560);
      const maxH = Math.min(window.innerHeight, document.body.clientHeight || 600);

      if (left < 10) left = 10;
      if (left + ttRect.width > maxW - 10) {
        left = maxW - ttRect.width - 10;
      }
      if (top < 8) top = rect.bottom + 6;
      if (top + ttRect.height > maxH - 8) {
        top = Math.max(8, rect.top - ttRect.height - 6);
      }

      tooltipEl.style.top = `${Math.round(top)}px`;
      tooltipEl.style.left = `${Math.round(left)}px`;
      tooltipEl.style.visibility = 'visible';
    };

    window.showTooltipFor = (targetOrSelector) => {
      const target = typeof targetOrSelector === 'string' ? $(targetOrSelector) : targetOrSelector;
      if (target) showTooltip(target);
    };

    window.hideTooltip = () => {
      tooltipEl.hidden = true;
      tooltipEl.style.visibility = 'hidden';
    };

    const hideTooltip = window.hideTooltip;

    ['pointerover', 'mouseover', 'focusin'].forEach((evt) => {
      document.addEventListener(evt, (e) => {
        const trigger = e.target.closest('[data-tooltip]');
        if (!trigger) return;

        clearTimeout(showTimer);
        clearTimeout(groupCooldownTimer);

        const delay = isGroupActive ? 0 : 40;
        showTimer = setTimeout(() => {
          showTooltip(trigger);
          isGroupActive = true;
        }, delay);
      });
    });

    ['pointerout', 'mouseout', 'focusout'].forEach((evt) => {
      document.addEventListener(evt, (e) => {
        const trigger = e.target.closest('[data-tooltip]');
        if (!trigger) return;
        if (e.relatedTarget && (trigger === e.relatedTarget || trigger.contains(e.relatedTarget))) return;

        clearTimeout(showTimer);
        hideTooltip();

        groupCooldownTimer = setTimeout(() => {
          isGroupActive = false;
        }, 300);
      });
    });

    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-tooltip]');
      if (trigger) {
        clearTimeout(showTimer);
        showTooltip(trigger);
      } else {
        hideTooltip();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideTooltip();
    });
  }

  // Shadcn Custom Select Primitivo
  function initShadcnSelects() {
    $$('.shadcn-select-wrapper').forEach((wrapper) => {
      const selectId = wrapper.dataset.forSelect;
      const nativeSelect = document.getElementById(selectId);
      const trigger = wrapper.querySelector('.shadcn-select-trigger');
      const valueSpan = wrapper.querySelector('.shadcn-select-value');
      const popover = wrapper.querySelector('.shadcn-select-popover');
      if (!nativeSelect || !trigger || !popover || !valueSpan) return;

      const closePopover = () => {
        popover.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      };

      const openPopover = () => {
        $$('.shadcn-select-popover').forEach((p) => (p.hidden = true));
        $$('.shadcn-select-trigger').forEach((t) => t.setAttribute('aria-expanded', 'false'));

        // Posicionamento inteligente: abre para cima se estiver próximo da base do viewport
        const triggerRect = trigger.getBoundingClientRect();
        const viewport = trigger.closest('.main-viewport') || document.body;
        const viewportRect = viewport.getBoundingClientRect();
        const spaceBelow = Math.min(window.innerHeight - triggerRect.bottom, viewportRect.bottom - triggerRect.bottom);

        if (spaceBelow < 140) {
          popover.style.top = 'auto';
          popover.style.bottom = 'calc(100% + 4px)';
        } else {
          popover.style.top = 'calc(100% + 4px)';
          popover.style.bottom = 'auto';
        }

        popover.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (popover.hidden) openPopover();
        else closePopover();
      });

      popover.addEventListener('click', (e) => {
        const item = e.target.closest('.shadcn-select-item');
        if (!item) return;

        const val = item.dataset.value;
        nativeSelect.value = val;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));

        valueSpan.textContent = item.querySelector('span')?.textContent || val;

        popover.querySelectorAll('.shadcn-select-item').forEach((it) => {
          it.classList.remove('selected');
          it.querySelector('.check-icon')?.remove();
        });
        item.classList.add('selected');

        const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        checkSvg.setAttribute('class', 'check-icon');
        checkSvg.setAttribute('width', '12');
        checkSvg.setAttribute('height', '12');
        checkSvg.setAttribute('viewBox', '0 0 24 24');
        checkSvg.setAttribute('fill', 'none');
        checkSvg.setAttribute('stroke', 'currentColor');
        checkSvg.setAttribute('stroke-width', '2.5');
        checkSvg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
        item.appendChild(checkSvg);

        closePopover();
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.shadcn-select-wrapper')) {
        $$('.shadcn-select-popover').forEach((p) => (p.hidden = true));
        $$('.shadcn-select-trigger').forEach((t) => t.setAttribute('aria-expanded', 'false'));
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.shadcn-select-popover').forEach((p) => (p.hidden = true));
        $$('.shadcn-select-trigger').forEach((t) => t.setAttribute('aria-expanded', 'false'));
      }
    });
  }

  function updateShadcnSelectValue(selectId, value) {
    const wrapper = document.querySelector(`.shadcn-select-wrapper[data-for-select="${selectId}"]`);
    if (!wrapper) return;
    const nativeSelect = document.getElementById(selectId);
    const valueSpan = wrapper.querySelector('.shadcn-select-value');
    const popover = wrapper.querySelector('.shadcn-select-popover');
    if (!valueSpan || !popover) return;

    if (nativeSelect) nativeSelect.value = value;

    popover.querySelectorAll('.shadcn-select-item').forEach((item) => {
      item.classList.remove('selected');
      item.querySelector('.check-icon')?.remove();
      if (item.dataset.value === String(value)) {
        item.classList.add('selected');
        valueSpan.textContent = item.querySelector('span')?.textContent || value;
        const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        checkSvg.setAttribute('class', 'check-icon');
        checkSvg.setAttribute('width', '12');
        checkSvg.setAttribute('height', '12');
        checkSvg.setAttribute('viewBox', '0 0 24 24');
        checkSvg.setAttribute('fill', 'none');
        checkSvg.setAttribute('stroke', 'currentColor');
        checkSvg.setAttribute('stroke-width', '2.5');
        checkSvg.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
        item.appendChild(checkSvg);
      }
    });
  }

  // Renderiza status da conta em uso no navegador
  function renderOwner() {
    const container = $('#owner-bento-tile');
    if (!container) return;

    const conns = Object.values(DB?.connections || {});
    const activeConn = conns.find((c) => c.isActive)
      || conns.find((c) => DB?.owner?.email && c.email?.toLowerCase() === DB.owner.email.toLowerCase())
      || (DB?.owner?.email ? { ...DB.owner, key: 'owner' } : null)
      || conns[0]
      || null;

    if (activeConn) {
      const o = activeConn;
      const avatarHtml = o.userImage
        ? `<img src="${esc(o.userImage)}" class="owner-avatar-img" alt="${esc(o.userName || o.email)}">`
        : `<div class="owner-avatar-fallback">${esc((o.userName || o.email).charAt(0).toUpperCase())}</div>`;

      const g = Math.round(gaugeMax(o));
      const s = sev(g);
      const isExhausted = o.quota?.exhausted === true || g >= 100;
      const quotaText = isExhausted ? '100% (No limite)' : `${g}% consumido`;

      container.innerHTML = `
        <div class="owner-card-verified">
          <div class="owner-avatar-wrap">
            ${avatarHtml}
            <div class="owner-shield-badge" data-tooltip="Conta ativa no navegador">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
          </div>
          <div class="owner-details">
            <div class="owner-top-row">
              <span class="owner-name">${esc(o.userName || o.email)}</span>
              <span class="fleet-pct-badge text-${s}" data-tooltip="Consumo da cota da conta em uso">${quotaText}</span>
            </div>
            <div class="owner-email">${esc(o.email)}</div>
            <div class="owner-meta-row">
              <span class="owner-meta-item">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
                <span>${esc(o.workspaceName || 'Workspace')}</span>
              </span>
              <span class="badge badge-secondary">
                ${ICONS.chatgpt}
                <span>${esc(cleanPlanName(o.planType || 'Team'))}</span>
              </span>
              <span class="badge badge-active">Em uso</span>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" id="btn-change-owner" data-tooltip="Alternar ou gerenciar contas">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/></svg>
            <span>Trocar</span>
          </button>
        </div>
      `;

      $('#btn-change-owner')?.addEventListener('click', () => {
        setTab('accounts');
      });
    } else {
      container.innerHTML = `
        <div class="owner-setup-cta">
          <div class="setup-icon-box">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </div>
          <div class="setup-content">
            <div class="setup-title">Conectar Conta</div>
            <div class="setup-desc">Conecte suas contas do ChatGPT para monitorar cotas, alternar sessões e gerenciar a rotação.</div>
          </div>
          <button class="btn btn-primary" id="btn-cta-owner-login" data-tooltip="Conectar conta do ChatGPT">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            <span>Conectar Conta</span>
          </button>
        </div>
      `;

      $('#btn-cta-owner-login')?.addEventListener('click', () => {
        openAddAccountModal(false);
      });
    }
  }

  // Renderiza metricas
  function renderMetrics() {
    const conns = Object.values(DB?.connections || {});
    const total = conns.length;
    const exhausted = conns.filter((c) => c.quota?.exhausted || gaugeMax(c) >= 100).length;
    const free = conns.filter((c) => !c.quota?.exhausted && gaugeMax(c) < 100).length;

    const totalEl = $('#val-total-accounts');
    const freeEl = $('#val-free-accounts');
    const exhEl = $('#val-exhausted-accounts');
    const resetEl = $('#val-next-reset');

    const subTotal = $('#sub-total-accounts');
    const subFree = $('#sub-free-accounts');
    const subExh = $('#sub-exhausted-accounts');
    const subReset = $('#sub-next-reset');
    const labelReset = $('#lbl-next-reset');

    if (totalEl) totalEl.textContent = total;
    if (freeEl) freeEl.textContent = free;
    if (exhEl) exhEl.textContent = exhausted;

    if (subTotal) {
      subTotal.textContent = total === 0 ? 'Nenhuma cadastrada' : 'Monitoradas no workspace';
    }
    if (subFree) {
      if (total === 0) {
        subFree.textContent = 'Aguardando conexão';
      } else if (free === 0) {
        subFree.textContent = 'Todas no limite temporário';
      } else {
        subFree.textContent = 'Limite liberado para envio';
      }
    }
    if (subExh) {
      if (total === 0) {
        subExh.textContent = 'Nenhuma cadastrada';
      } else if (exhausted === 0) {
        subExh.textContent = 'Nenhuma bloqueada';
      } else {
        subExh.textContent = `${exhausted} em renovação`;
      }
    }

    const now = Date.now();
    const activeConn = conns.find((c) => c.isActive)
      || conns.find((c) => DB?.owner?.email && c.email?.toLowerCase() === DB.owner.email.toLowerCase())
      || conns[0]
      || null;

    // 1. Contas que estão no limite temporário (bloqueadas)
    const blockedAccounts = [];
    conns.forEach((c) => {
      const isExh = c.quota?.exhausted === true || gaugeMax(c) >= 100;
      if (isExh) {
        let minReset = null;
        c.quota?.windows?.forEach((win) => {
          if (win.resetAt && win.resetAt > now) {
            if (!minReset || win.resetAt < minReset) minReset = win.resetAt;
          }
        });
        blockedAccounts.push({
          conn: c,
          resetAt: minReset,
          name: c.userName ? c.userName.split(' ')[0] : c.email.split('@')[0],
        });
      }
    });
    blockedAccounts.sort((a, b) => (a.resetAt || Infinity) - (b.resetAt || Infinity));

    // 2. Próximo reset agendado para a conta ativa em uso
    let activeResetAt = null;
    if (activeConn?.quota?.windows) {
      activeConn.quota.windows.forEach((win) => {
        if (win.resetAt && win.resetAt > now) {
          if (!activeResetAt || win.resetAt < activeResetAt) {
            activeResetAt = win.resetAt;
          }
        }
      });
    }
    const activeName = activeConn ? (activeConn.userName ? activeConn.userName.split(' ')[0] : activeConn.email.split('@')[0]) : 'Ativa';

    const resetCard = $('#card-metric-next-reset');
    if (resetCard) {
      resetCard.setAttribute('data-tooltip', 'Tempo estimado para próxima liberação de limite');
    }

    if (resetEl) {
      if (total === 0) {
        if (labelReset) labelReset.textContent = 'Próxima Liberação';
        resetEl.textContent = 'Sem espera';
        if (subReset) subReset.textContent = 'Nenhuma conta conectada';
      } else if (blockedAccounts.length > 0) {
        // Situação A: Existem contas bloqueadas no limite
        if (labelReset) labelReset.textContent = 'Próxima Liberação';
        const targetBlocked = blockedAccounts.find((b) => b.resetAt) || blockedAccounts[0];
        if (targetBlocked && targetBlocked.resetAt) {
          const info = formatResetDetails(targetBlocked.resetAt);
          resetEl.textContent = info ? info.targetStr : 'Em breve';
          if (subReset) {
            if (blockedAccounts.length === 1) {
              subReset.textContent = `Desbloqueio de ${targetBlocked.name} • ${info.countdownStr}`;
            } else {
              subReset.textContent = `${targetBlocked.name} (+${blockedAccounts.length - 1} bloqueadas) • ${info.countdownStr}`;
            }
          }
        } else {
          resetEl.textContent = 'Em breve';
          if (subReset) subReset.textContent = `${blockedAccounts.length} conta${blockedAccounts.length === 1 ? '' : 's'} no limite`;
        }
      } else {
        // Situação B: Nenhuma conta bloqueada - tempo refere-se à cota da conta em uso
        if (labelReset) labelReset.textContent = 'Reset de Cota';

        if (activeResetAt) {
          const info = formatResetDetails(activeResetAt);
          resetEl.textContent = info ? info.targetStr : 'Em breve';
          if (subReset) {
            subReset.textContent = `Conta em uso (${activeName}) • ${info.countdownStr}`;
          }
        } else {
          let closestFleet = null;
          conns.forEach((c) => {
            c.quota?.windows?.forEach((win) => {
              if (win.resetAt && win.resetAt > now) {
                if (!closestFleet || win.resetAt < closestFleet.resetAt) {
                  closestFleet = {
                    conn: c,
                    resetAt: win.resetAt,
                    name: c.userName ? c.userName.split(' ')[0] : c.email.split('@')[0],
                  };
                }
              }
            });
          });

          if (closestFleet) {
            const info = formatResetDetails(closestFleet.resetAt);
            resetEl.textContent = info ? info.targetStr : 'Sem espera';
            if (subReset) {
              subReset.textContent = `Frota (${closestFleet.name}) • ${info.countdownStr}`;
            }
          } else {
            resetEl.textContent = 'Sem espera';
            if (subReset) subReset.textContent = 'Todas as cotas livres';
          }
        }
      }
    }

    renderSmartRecommendation(conns);

    const fleetList = $('#overview-fleet-list');
    if (!fleetList) return;

    if (!conns.length) {
      fleetList.innerHTML = `<div class="empty-message">Nenhuma conta conectada.</div>`;
      return;
    }

    fleetList.innerHTML = conns
      .slice(0, 4)
      .map((c) => {
        const g = Math.round(gaugeMax(c));
        const s = sev(g);
        const isOwner = c.email === DB?.owner?.email;

        return `
          <div class="fleet-item">
            <div class="fleet-item-info">
              <span class="fleet-email">${esc(c.email)}</span>
            </div>
            <div class="fleet-gauge-box">
              <span class="fleet-pct-badge text-${s}">${g}%</span>
              <button class="btn-icon" data-switch-acc="${esc(c.key)}" data-tooltip="Usar esta conta" aria-label="Usar">
                ${ICONS.switch}
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Notificação Dinâmica de Limite Próximo de Reiniciar (Substitui o banner estático)
  const _notifiedNearResetAccounts = new Set();

  function triggerNearResetToast(conn, info) {
    const email = conn.email || 'Conta';
    const usedPct = Math.round(gaugeMax(conn));
    const freePct = Math.max(0, 100 - usedPct);

    showNearResetToast({
      conn,
      title: 'Limite prestes a renovar',
      body: `${email} tem ${freePct}% livre antes do reset ${info.countdownStr}. Toque para alternar.`,
      durationSec: 10,
      onAction: () => {
        setTab('accounts');
        setTimeout(() => {
          const card = document.querySelector(`.account-card[data-key="${conn.key}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('highlight-pulse');
            setTimeout(() => card.classList.remove('highlight-pulse'), 2000);
          }
        }, 120);
      }
    });
  }

  function renderSmartRecommendation(conns) {
    const slot = $('#smart-rec-slot');
    if (slot) slot.innerHTML = ''; // Remove qualquer banner estático

    if (!conns || !conns.length) return;

    let delay = 0;
    conns.forEach((c) => {
      if (c.isActive) return;
      c.quota?.windows?.forEach((w) => {
        if (!w.resetAt) return;
        const info = formatResetDetails(w.resetAt);
        if (info && info.isNearReset) {
          const accountKey = c.key || c.email;
          const cycleKey = `${accountKey}_${Math.floor(info.diff / 60000)}`;
          if (!_notifiedNearResetAccounts.has(cycleKey)) {
            _notifiedNearResetAccounts.add(cycleKey);
            setTimeout(() => {
              triggerNearResetToast(c, info);
            }, delay);
            delay += 600;
          }
        }
      });
    });
  }

  // Renderiza lista detalhada de contas
  function renderAccounts() {
    const conns = Object.values(DB?.connections || {});
    const feed = $('#accounts-feed');
    const empty = $('#accounts-empty-state');
    const banner = $('#login-active-banner');

    if (banner) {
      banner.hidden = !DB?._loginPending;
    }

    const sub = $('#accounts-count-sub');
    if (sub) {
      sub.textContent = conns.length === 0
        ? 'Nenhuma conta cadastrada'
        : `${conns.length} conta${conns.length === 1 ? '' : 's'} conectada${conns.length === 1 ? '' : 's'}`;
    }

    if (!conns.length) {
      if (feed) feed.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;

    conns.sort((a, b) => {
      const ao = a.email === DB?.owner?.email ? 1 : 0;
      const bo = b.email === DB?.owner?.email ? 1 : 0;
      if (ao !== bo) return bo - ao;
      return gaugeMax(b) - gaugeMax(a);
    });

    feed.innerHTML = conns
      .map((c) => {
        const isOwner = c.email === DB?.owner?.email;
        const g = Math.round(gaugeMax(c));
        const s = sev(g);
        const q = c.quota;
        const isExhausted = q?.exhausted === true;

        const avatarHtml = c.userImage
          ? `<img src="${esc(c.userImage)}" alt="">`
          : c.email.slice(0, 1).toUpperCase();

        let windowsHtml = '';
        const allWindows = [...(q?.windows || [])];
        if (q?.extraCaps?.length) {
          q.extraCaps.forEach((ec) => {
            allWindows.push({
              label: ec.title || ec.id,
              usedPercent: ec.usedPercent,
              resetAt: ec.resetAt,
              isExtra: true,
            });
          });
        }

        let nearResetInfo = null;
        if (!c.isActive) {
          allWindows.forEach((win) => {
            if (!win.resetAt) return;
            const inf = formatResetDetails(win.resetAt);
            if (inf && inf.isNearReset) {
              if (!nearResetInfo || inf.diff < nearResetInfo.diff) {
                nearResetInfo = inf;
              }
            }
          });
        }

        if (allWindows.length) {
          windowsHtml = `
            <div class="quota-windows-grid">
              ${allWindows
                .map((w) => {
                  const ws = sev(w.usedPercent);
                  const isZero = Math.round(w.usedPercent) === 0;
                  const resetInfo = formatResetDetails(w.resetAt);
                  let resetStr = '';
                  let isNear = false;

                  if (resetInfo) {
                    isNear = resetInfo.isNearReset;
                    resetStr = `${resetInfo.full}`;
                  } else if (isZero) {
                    resetStr = '100% disponível • Inicia no 1º envio';
                  } else {
                    resetStr = 'Limite em uso • Aguardando reset';
                  }

                  return `
                    <div class="quota-window-item">
                      <div class="qw-header">
                        <span class="qw-label">${esc(w.label)}</span>
                        <span class="qw-pct text-${ws}">${Math.round(w.usedPercent)}%</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill ${ws}" style="width: ${Math.min(100, w.usedPercent)}%"></div>
                      </div>
                      <div class="qw-reset-time ${isZero && !isNear ? 'text-success' : ''} ${isNear ? 'near-reset' : ''}">
                        ${isNear ? `<span class="qw-near-indicator" title="Reset próximo!">${ICONS.flame}</span>` : ''}
                        <span>${esc(resetStr)}</span>
                      </div>
                    </div>
                  `;
                })
                .join('')}
            </div>
          `;
        } else {
          windowsHtml = `<div class="empty-message">${renderSpinner('size-3.5', 'inline-start')} <span>Consultando limites em segundo plano...</span></div>`;
        }

        return `
          <div class="account-card ${isExhausted ? 'exhausted' : ''} ${nearResetInfo ? 'near-reset' : ''}" data-key="${esc(c.key)}">
            <div class="account-card-head">
              <div class="acc-avatar">${avatarHtml}</div>
              <div class="acc-title-col">
                <div class="acc-email">${esc(c.email)}</div>
                <div class="acc-chips-row">
                  ${c.isActive ? '<span class="badge badge-active">Em uso</span>' : ''}
                  <span class="badge badge-secondary">${ICONS.chatgpt} <span>${esc(cleanPlanName(c.planType || 'Plus'))}</span></span>
                  ${c.lastError ? `<span class="badge ${c.lastError.includes('401') ? 'badge-warning' : 'badge-destructive'}">${esc(c.lastError.includes('401') ? 'Renovando sessão' : c.lastError)}</span>` : ''}
                </div>
              </div>
              <div class="acc-actions">
                ${!isOwner && isWorkspacePlan(c.planType) && (c.isOwner || c.isAdmin) ? `<button class="btn btn-ghost btn-sm" data-set-owner-email="${esc(c.email)}" data-tooltip="Definir esta conta Business como proprietária principal">${ICONS.star} <span>Tornar Principal</span></button>` : ''}
                <button class="btn btn-secondary btn-sm" data-switch-acc="${esc(c.key)}" data-tooltip="Usar esta conta">
                  ${ICONS.switch} <span>Usar</span>
                </button>
                <button class="btn-icon" data-del-acc="${esc(c.key)}" data-tooltip="Remover conta" aria-label="Remover">
                  ${ICONS.trash}
                </button>
              </div>
            </div>

            ${windowsHtml}

            <div class="acc-footer-toolbar font-mono">
              <span>Sincronizado ${timeAgo(c.lastPolled)}</span>
              <span class="text-${s}">Uso máximo: ${g}%</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // Renderiza painel de rotação
  function renderRotation() {
    const btnStart = $('#btn-start-autopilot');
    const btnStop = $('#btn-stop-autopilot');
    const engineDot = $('#engine-status-pill');

    const isRunning = DB?.automations?.running === true;

    if (btnStart && btnStop) {
      btnStart.hidden = isRunning;
      btnStop.hidden = !isRunning;
    }

    if (engineDot) {
      engineDot.classList.toggle('running', isRunning);
    }

    if ($('#toggle-auto-remove')) $('#toggle-auto-remove').checked = DB?.automations?.autoRemove !== false;
    if ($('#toggle-auto-invite')) $('#toggle-auto-invite').checked = DB?.automations?.autoInvite !== false;

    const cycleSec = String(Math.round((DB?.automations?.cycleMs || 180000) / 1000));
    updateShadcnSelectValue('select-cycle-time', cycleSec);

    const queueList = $('#queue-items-container') || $('#queue-list');
    const queueEmpty = $('#queue-empty-msg');
    const queue = DB?.queue || [];
    const badge = $('#queue-count-badge');
    if (badge) {
      if (queue.length === 0) {
        badge.hidden = true;
      } else {
        badge.hidden = false;
        badge.className = 'queue-status-chip active';
        badge.innerHTML = `
          <svg class="size-3" data-icon="inline-start" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>${queue.length} na fila</span>
        `;
      }
    }

    if (!queueList) return;

    if (isDraggingQueue) {
      // Impede que o timer ou eventos sobrescrevam o DOM enquanto o usuário está arrastando
      return;
    }

    const uniqueQueue = Array.from(new Set(queue));
    if (!uniqueQueue.length) {
      queueList.innerHTML = '';
      if (queueEmpty) queueEmpty.hidden = false;
      return;
    }

    if (queueEmpty) queueEmpty.hidden = true;

    queueList.innerHTML = uniqueQueue
      .map((key, idx) => {
        const c = DB?.connections?.[key];
        const email = c?.email || key.split('__')[0];
        const g = c ? Math.round(gaugeMax(c)) : 0;
        const s = sev(g);

        const isFirst = idx === 0;
        const isLast = idx === uniqueQueue.length - 1;

        return `
          <div class="queue-row" draggable="true" data-key="${esc(key)}" data-index="${idx}">
            <div class="queue-left">
              <span class="queue-drag-handle" data-tooltip="Arrastar para reordenar" title="Arrastar para reordenar" aria-label="Arrastar prioridade">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
                  <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                  <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
                </svg>
              </span>
              <span class="queue-rank font-mono">${String(idx + 1).padStart(2, '0')}</span>
              <div class="queue-user-box">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span class="queue-email">${esc(email)}</span>
              </div>
            </div>
            <div class="queue-right" style="display:flex;align-items:center;gap:8px;">
              <span class="fleet-pct-badge text-${s}">${g}%</span>
              <div class="queue-reorder-btns">
                <button class="btn-icon" style="width:24px;height:24px;" data-up="${esc(key)}" data-tooltip="${isFirst ? 'Primeira da fila' : 'Mover para cima na prioridade'}" ${isFirst ? 'disabled aria-disabled="true"' : ''}>
                  ${ICONS.up}
                </button>
                <button class="btn-icon" style="width:24px;height:24px;" data-down="${esc(key)}" data-tooltip="${isLast ? 'Última da fila' : 'Mover para baixo na prioridade'}" ${isLast ? 'disabled aria-disabled="true"' : ''}>
                  ${ICONS.down}
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  const LOG_META = {
    ok: {
      label: 'Sucesso',
      chipClass: 'badge-success',
      icon: '<svg class="size-3" data-icon="inline-start" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg>',
    },
    warn: {
      label: 'Alerta',
      chipClass: 'badge-warning',
      icon: '<svg class="size-3" data-icon="inline-start" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r="0.8" fill="currentColor"/></svg>',
    },
    error: {
      label: 'Erro',
      chipClass: 'badge-destructive',
      icon: '<svg class="size-3" data-icon="inline-start" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    },
    crit: {
      label: 'Erro',
      chipClass: 'badge-destructive',
      icon: '<svg class="size-3" data-icon="inline-start" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    },
    info: {
      label: 'Info',
      chipClass: 'badge-secondary',
      icon: '<svg class="size-3" data-icon="inline-start" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1.1" fill="currentColor"/></svg>',
    },
  };

  const EMPTY_FILTER_DESCRIPTIONS = {
    all: 'Os eventos de sincronização e troca de contas aparecerão aqui.',
    ok: 'Nenhum evento com status de sucesso registrado até o momento.',
    warn: 'Nenhum alerta de limite ou atenção pendente.',
    error: 'Nenhum erro registrado. Todas as conexões operando normalmente.',
  };

  // Renderiza logs do console com icones e titulos estruturados
  function renderLogs() {
    const feed = $('#terminal-feed');
    if (!feed) return;

    let logs = DB?.log || [];
    if (currentLogFilter !== 'all') {
      logs = logs.filter((l) => l.level === currentLogFilter || (currentLogFilter === 'error' && l.level === 'crit'));
    }

    if (!logs.length) {
      const desc = EMPTY_FILTER_DESCRIPTIONS[currentLogFilter] || 'Nenhum registro encontrado.';
      feed.innerHTML = `
        <div class="terminal-empty-state">
          <div class="terminal-empty-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          </div>
          <div class="terminal-empty-title">Nenhum evento registrado</div>
          <p class="terminal-empty-desc">${desc}</p>
        </div>
      `;
      return;
    }

    feed.innerHTML = logs
      .slice(0, 150)
      .map((l) => {
        const d = new Date(l.ts);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const meta = LOG_META[l.level] || LOG_META.info;

        return `
          <div class="log-entry">
            <span class="log-time">${timeStr}</span>
            <span class="badge ${meta.chipClass}">
              ${meta.icon}
              <span>${meta.label}</span>
            </span>
            <span class="log-msg">${esc(l.msg)}</span>
          </div>
        `;
      })
      .join('');
  }

  // Sintetizador de áudio local de alta fidelidade e biblioteca de sons (Até 5 slots)
  let _localAudioCtx = null;
  let _currentPreviewAudio = null;
  let _currentWebAudioMasterGain = null;
  let _currentActiveOscillators = [];
  let _currentlyPlayingSlotId = null;
  let _targetSlotToReplace = null;

  function formatAudioFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function stopCurrentPreviewSound() {
    if (_currentPreviewAudio) {
      try {
        _currentPreviewAudio.pause();
        _currentPreviewAudio.currentTime = 0;
        _currentPreviewAudio.onended = null;
        _currentPreviewAudio.onerror = null;
      } catch {}
      _currentPreviewAudio = null;
    }
    if (_currentWebAudioMasterGain && _localAudioCtx) {
      try {
        _currentWebAudioMasterGain.gain.setValueAtTime(0, _localAudioCtx.currentTime);
        _currentWebAudioMasterGain.disconnect();
      } catch {}
      _currentWebAudioMasterGain = null;
    }
    if (_currentActiveOscillators && _currentActiveOscillators.length) {
      _currentActiveOscillators.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {}
      });
      _currentActiveOscillators = [];
    }
    _currentlyPlayingSlotId = null;
    updatePlayingStatesInLibrary();
  }

  function getLocalAudioContext() {
    if (!_localAudioCtx) {
      _localAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_localAudioCtx.state === 'suspended') {
      _localAudioCtx.resume();
    }
    return _localAudioCtx;
  }

  function playLocalSound(preset = 'chime', volume = 0.75, customBase64 = null, slotId = null) {
    stopCurrentPreviewSound();
    const safeVolume = Math.max(0, Math.min(1, Number(volume) || 0));
    if (safeVolume <= 0) return; // Volume 0% é totalmente silencioso

    // 1. Áudio Personalizado Base64
    let base64ToPlay = customBase64;
    let resolvedSlotId = slotId;

    if (!base64ToPlay && (preset.startsWith('custom_') || preset === 'custom')) {
      const audId = preset.replace('custom_', '');
      const item = (DB?.audio?.customAudios || []).find((a) => a.id === audId || a.id === preset || a.id === slotId);
      base64ToPlay = item?.base64 || (preset === 'custom' ? DB?.audio?.customBase64 : null);
      if (item) resolvedSlotId = item.id;
    }

    if (base64ToPlay) {
      try {
        const a = new Audio(base64ToPlay);
        a.volume = safeVolume;
        _currentPreviewAudio = a;
        _currentlyPlayingSlotId = resolvedSlotId || 'custom';
        updatePlayingStatesInLibrary();
        a.onended = () => {
          stopCurrentPreviewSound();
        };
        a.onerror = () => {
          stopCurrentPreviewSound();
        };
        a.play().catch(() => {
          stopCurrentPreviewSound();
        });
      } catch {
        stopCurrentPreviewSound();
      }
      return;
    }

    if (preset.startsWith('custom_') || preset === 'custom') {
      return;
    }

    // 2. Síntese Web Audio dos Presets Nativos
    try {
      const ctx = getLocalAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const now = ctx.currentTime;
      const master = ctx.createGain();
      master.gain.setValueAtTime(safeVolume * 0.85, now);
      master.connect(ctx.destination);
      _currentWebAudioMasterGain = master;

      // Pack 2: Sons de Reset Próximo / Oportunidade
      if (preset === 'pulse') {
        const osc = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(800, now);
        filt.frequency.exponentialRampToValueAtTime(3200, now + 0.15);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.7, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(filt); filt.connect(g); g.connect(master);
        osc.start(now); osc.stop(now + 0.45);
        _currentActiveOscillators.push(osc);
      } else if (preset === 'cyber') {
        [440, 659.25, 880, 1318.5].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          const t = now + i * 0.055;
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, t);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.35, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
          osc.connect(g); g.connect(master);
          osc.start(t); osc.stop(t + 0.35);
          _currentActiveOscillators.push(osc);
        });
      } else if (preset === 'radar') {
        [0, 0.12].forEach((offset) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          const t = now + offset;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1480, t);
          osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.55, t + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
          osc.connect(g); g.connect(master);
          osc.start(t); osc.stop(t + 0.1);
          _currentActiveOscillators.push(osc);
        });
      } else if (preset === 'flame') {
        const tones = [
          { freq: 587.33, start: 0, dur: 0.12, type: 'triangle' },
          { freq: 987.77, start: 0.13, dur: 0.28, type: 'sine' },
        ];
        tones.forEach((tone) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          const t = now + tone.start;
          osc.type = tone.type;
          osc.frequency.setValueAtTime(tone.freq, t);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.5, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
          osc.connect(g); g.connect(master);
          osc.start(t); osc.stop(t + tone.dur + 0.05);
          _currentActiveOscillators.push(osc);
        });
      }
      // Pack 1: Sons de Recuperação de Limite
      else if (preset === 'bell') {
        [
          { freq: 880, gain: 0.55, decay: 1.1 },
          { freq: 1760, gain: 0.28, decay: 0.85 },
          { freq: 2640, gain: 0.15, decay: 0.6 },
          { freq: 3520, gain: 0.08, decay: 0.4 },
        ].forEach((p) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(p.freq, now);
          g.gain.setValueAtTime(p.gain, now);
          g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
          osc.connect(g); g.connect(master);
          osc.start(now); osc.stop(now + p.decay);
          _currentActiveOscillators.push(osc);
        });
      } else if (preset === 'harmony') {
        [698.46, 880, 1046.5, 1318.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          const t = now + i * 0.04;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.3, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
          osc.connect(g); g.connect(master);
          osc.start(t); osc.stop(t + 0.75);
          _currentActiveOscillators.push(osc);
        });
      } else if (preset === 'zen') {
        [523.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = idx === 0 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(freq, now);
          g.gain.setValueAtTime(0, now);
          g.gain.linearRampToValueAtTime(0.35 / (idx + 1), now + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
          osc.connect(g); g.connect(master);
          osc.start(now); osc.stop(now + 1.15);
          _currentActiveOscillators.push(osc);
        });
      } else {
        // 'chime' (default de recuperação)
        [1046.5, 1318.5, 1567.98].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          const t = now + idx * 0.08;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.5, t + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
          osc.connect(g); g.connect(master);
          osc.start(t); osc.stop(t + 0.85);
          _currentActiveOscillators.push(osc);
        });
      }
    } catch (e) {
      console.warn('[SeatOrbit] Erro na síntese local de áudio:', e);
    }
  }

  function updatePlayingStatesInLibrary() {
    const list = $('#custom-audios-list');
    if (!list) return;
    list.querySelectorAll('.custom-audio-row').forEach((row) => {
      const audioId = row.dataset.audioId;
      const isThisPlaying = (_currentlyPlayingSlotId === audioId);
      row.classList.toggle('is-playing', isThisPlaying);

      const btnPreview = row.querySelector('.btn-preview-audio');
      if (btnPreview) {
        btnPreview.classList.toggle('preview-playing', isThisPlaying);
        btnPreview.setAttribute('data-tooltip', isThisPlaying ? 'Pausar áudio' : 'Ouvir este áudio');
        btnPreview.innerHTML = isThisPlaying
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"/></svg>';
      }
    });
  }

  function renderCustomAudioLibrary() {
    const audios = DB?.audio?.customAudios || [];
    const emptyBox = $('#custom-audios-empty');
    const listEl = $('#custom-audios-list');
    if (!listEl) return;

    if (audios.length === 0) {
      if (emptyBox) emptyBox.hidden = false;
      listEl.innerHTML = '';
      return;
    }

    if (emptyBox) emptyBox.hidden = true;
    listEl.innerHTML = audios
      .map((a, idx) => {
        const isPlaying = (_currentlyPlayingSlotId === a.id);
        const trackNum = String(idx + 1).padStart(2, '0');
        return `
          <div class="custom-audio-row ${isPlaying ? 'is-playing' : ''}" data-audio-id="${a.id}">
            <div class="custom-audio-info">
              <div class="audio-track-lead">
                <span class="audio-track-index font-mono">${trackNum}</span>
                <div class="audio-track-visual">
                  <svg class="audio-track-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                  <div class="audio-equalizer" aria-label="Reproduzindo">
                    <span class="eq-bar eq-bar-1"></span>
                    <span class="eq-bar eq-bar-2"></span>
                    <span class="eq-bar eq-bar-3"></span>
                  </div>
                </div>
              </div>
              <div class="audio-name-box">
                <span class="audio-filename" title="${esc(a.name)}">${esc(a.name)}</span>
                <span class="audio-filesize font-mono">${esc(a.sizeStr || '')}</span>
              </div>
            </div>
            <div class="custom-audio-actions">
              <button class="btn-audio-action btn-preview-audio ${isPlaying ? 'preview-playing' : ''}" data-audio-id="${a.id}" data-tooltip="${isPlaying ? 'Pausar áudio' : 'Ouvir este áudio'}" type="button">
                ${isPlaying
                  ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>'
                  : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 19 12 6 20 6 4"/></svg>'}
              </button>
              <button class="btn-audio-action btn-replace-single" data-audio-id="${a.id}" data-tooltip="Substituir arquivo" type="button">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              </button>
              <button class="btn-audio-action btn-del-audio" data-audio-id="${a.id}" data-tooltip="Excluir áudio" type="button">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        `;
      })
      .join('');
  }

  const PACK1_PRESETS = [
    { value: 'chime', label: 'Sino Harmônico (Chime)' },
    { value: 'bell', label: 'Bell Cristalino (Bell)' },
    { value: 'harmony', label: 'Harmonia Suave (Harmony)' },
    { value: 'zen', label: 'Notificação Zen (Zen)' },
  ];

  const PACK2_PRESETS = [
    { value: 'pulse', label: 'Pulso Digital (Pulse)' },
    { value: 'cyber', label: 'Cyber Sintético (Cyber)' },
    { value: 'radar', label: 'Radar Tático (Radar)' },
    { value: 'flame', label: 'Chama Ativa (Flame)' },
  ];

  function rebuildDropdown(selectId, presetsList, currentValue) {
    const wrapper = document.querySelector(`.shadcn-select-wrapper[data-for-select="${selectId}"]`);
    if (!wrapper) return;
    const nativeSelect = document.getElementById(selectId);
    const popover = wrapper.querySelector('.shadcn-select-popover');
    if (!nativeSelect || !popover) return;

    const customAudios = DB?.audio?.customAudios || [];
    const options = [
      ...presetsList,
      ...customAudios.map((a) => ({ value: 'custom_' + a.id, label: '🎵 ' + a.name })),
    ];

    let activeVal = currentValue;
    if (!options.some((o) => o.value === activeVal)) {
      activeVal = presetsList[0].value;
      if (selectId === 'select-audio-preset') {
        if (!DB.audio) DB.audio = {};
        DB.audio.preset = activeVal;
      } else {
        if (!DB.audio) DB.audio = {};
        DB.audio.nearPreset = activeVal;
      }
    }

    nativeSelect.innerHTML = options.map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join('');
    nativeSelect.value = activeVal;

    popover.innerHTML = options
      .map((o) => {
        const isSel = o.value === activeVal;
        return `
          <div class="shadcn-select-item ${isSel ? 'selected' : ''}" data-value="${o.value}">
            <span>${esc(o.label)}</span>
            ${isSel ? '<svg class="check-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
          </div>
        `;
      })
      .join('');

    const valSpan = wrapper.querySelector('.shadcn-select-value');
    const matched = options.find((o) => o.value === activeVal);
    if (valSpan && matched) {
      valSpan.textContent = matched.label;
    }
  }

  function openReplaceAudioModal() {
    const audios = DB?.audio?.customAudios || [];
    const modal = $('#replace-audio-dialog-backdrop');
    const listEl = $('#replace-audio-slots-list');
    if (!modal || !listEl) return;

    listEl.innerHTML = audios
      .map((a, idx) => {
        const trackNum = String(idx + 1).padStart(2, '0');
        return `
        <div class="replace-audio-row" data-audio-id="${a.id}">
          <div class="replace-audio-row-left">
            <span class="audio-track-index font-mono">${trackNum}</span>
            <div class="audio-name-box">
              <span class="audio-filename" title="${esc(a.name)}">${esc(a.name)}</span>
              <span class="audio-filesize font-mono">${esc(a.sizeStr || '')}</span>
            </div>
          </div>
          <div class="replace-audio-actions">
            <button class="btn btn-primary btn-sm btn-substitute-slot" data-audio-id="${a.id}" type="button">
              <span>Substituir</span>
            </button>
            <button class="btn btn-secondary btn-sm btn-delete-slot text-danger" data-audio-id="${a.id}" type="button">
              <span>Excluir</span>
            </button>
          </div>
        </div>
      `;
      })
      .join('');

    modal.hidden = false;
  }

  function closeReplaceAudioModal() {
    const modal = $('#replace-audio-dialog-backdrop');
    if (modal) modal.hidden = true;
    _targetSlotToReplace = null;
  }

  // Renderiza configurações e áudio
  function renderSettings() {
    const audio = DB?.audio || {};
    const toggleEnabled = $('#toggle-audio-enabled');
    const sliderVol = $('#slider-volume');
    const labelVol = $('#label-volume-val');

    if (toggleEnabled) toggleEnabled.checked = audio.enabled !== false;

    const toggleNearReset = $('#toggle-audio-near-reset');
    const isNearEnabled = audio.nearResetAlert !== false;
    if (toggleNearReset) toggleNearReset.checked = isNearEnabled;

    const boxNearSettings = $('#box-near-reset-settings');
    if (boxNearSettings) boxNearSettings.hidden = !isNearEnabled;

    const nearMins = String(audio.nearResetMins || 30);
    updateShadcnSelectValue('select-near-reset-mins', nearMins);

    rebuildDropdown('select-audio-preset', PACK1_PRESETS, audio.preset || 'chime');
    rebuildDropdown('select-near-audio-preset', PACK2_PRESETS, audio.nearPreset || 'pulse');

    renderCustomAudioLibrary();

    const volPct = typeof audio.volume === 'number'
      ? Math.round(audio.volume * 100)
      : (sliderVol ? Number(sliderVol.value) : 75);

    if (sliderVol && document.activeElement !== sliderVol) {
      sliderVol.value = volPct;
    }
    if (labelVol) {
      labelVol.textContent = `${volPct}%`;
    }
  }

  // Shadcn Skeleton Loading System: Exibe placeholders durante carregamento
  function renderSkeletons() {
    // 1. Owner Card Skeleton
    const ownerSlot = $('#owner-bento-tile');
    if (ownerSlot) {
      ownerSlot.innerHTML = `
        <div class="owner-skeleton-wrap">
          <div class="skeleton skeleton-avatar" style="width: 36px; height: 36px;"></div>
          <div class="owner-skeleton-info">
            <div class="skeleton skeleton-text" style="width: 140px; height: 13px;"></div>
            <div class="skeleton skeleton-text" style="width: 220px; height: 10px;"></div>
          </div>
          <div class="skeleton" style="width: 110px; height: 30px; border-radius: 6px;"></div>
        </div>
      `;
    }

    // 2. Metrics Grid Skeletons
    const totalEl = $('#val-total-accounts');
    const freeEl = $('#val-free-accounts');
    const exhEl = $('#val-exhausted-accounts');
    const resetEl = $('#val-next-reset');

    const subTotal = $('#sub-total-accounts');
    const subFree = $('#sub-free-accounts');
    const subExh = $('#sub-exhausted-accounts');
    const subReset = $('#sub-next-reset');

    if (totalEl) totalEl.innerHTML = `<span class="skeleton" style="width: 28px; height: 22px;"></span>`;
    if (freeEl) freeEl.innerHTML = `<span class="skeleton" style="width: 28px; height: 22px;"></span>`;
    if (exhEl) exhEl.innerHTML = `<span class="skeleton" style="width: 28px; height: 22px;"></span>`;
    if (resetEl) resetEl.innerHTML = `<span class="skeleton" style="width: 76px; height: 18px;"></span>`;

    if (subTotal) subTotal.innerHTML = `<span class="skeleton skeleton-text" style="width: 80px; height: 10px;"></span>`;
    if (subFree) subFree.innerHTML = `<span class="skeleton skeleton-text" style="width: 90px; height: 10px;"></span>`;
    if (subExh) subExh.innerHTML = `<span class="skeleton skeleton-text" style="width: 85px; height: 10px;"></span>`;
    if (subReset) subReset.innerHTML = `<span class="skeleton skeleton-text" style="width: 95px; height: 10px;"></span>`;

    // 3. Fleet list Skeleton
    const fleetList = $('#overview-fleet-list');
    if (fleetList) {
      fleetList.innerHTML = `
        <div class="fleet-skeleton-row">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="skeleton skeleton-avatar" style="width: 18px; height: 18px;"></div>
            <div class="skeleton skeleton-text" style="width: 130px; height: 11px;"></div>
          </div>
          <div class="skeleton" style="width: 32px; height: 16px; border-radius: 4px;"></div>
        </div>
        <div class="fleet-skeleton-row">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="skeleton skeleton-avatar" style="width: 18px; height: 18px;"></div>
            <div class="skeleton skeleton-text" style="width: 160px; height: 11px;"></div>
          </div>
          <div class="skeleton" style="width: 32px; height: 16px; border-radius: 4px;"></div>
        </div>
      `;
    }

    // 4. Accounts Feed Skeleton
    const accountsFeed = $('#accounts-feed');
    if (accountsFeed) {
      accountsFeed.innerHTML = `
        <div class="account-skeleton-card">
          <div class="account-skeleton-head">
            <div class="skeleton skeleton-avatar" style="width: 32px; height: 32px;"></div>
            <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
              <div class="skeleton skeleton-text" style="width: 140px; height: 13px;"></div>
              <div class="skeleton skeleton-text" style="width: 80px; height: 10px;"></div>
            </div>
            <div class="skeleton" style="width: 60px; height: 26px; border-radius: 6px;"></div>
          </div>
          <div class="skeleton" style="width: 100%; height: 32px; border-radius: 6px;"></div>
        </div>
      `;
    }

    // 5. Automação Queue Skeleton
    const queueList = $('#queue-items-container');
    if (queueList) {
      queueList.innerHTML = `
        <div class="queue-skeleton-row">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="skeleton" style="width: 20px; height: 14px; border-radius: 4px;"></div>
            <div class="skeleton skeleton-avatar" style="width: 18px; height: 18px;"></div>
            <div class="skeleton skeleton-text" style="width: 140px; height: 11px;"></div>
          </div>
          <div class="skeleton" style="width: 58px; height: 20px; border-radius: 4px;"></div>
        </div>
        <div class="queue-skeleton-row">
          <div style="display:flex;align-items:center;gap:10px;">
            <div class="skeleton" style="width: 20px; height: 14px; border-radius: 4px;"></div>
            <div class="skeleton skeleton-avatar" style="width: 18px; height: 18px;"></div>
            <div class="skeleton skeleton-text" style="width: 170px; height: 11px;"></div>
          </div>
          <div class="skeleton" style="width: 58px; height: 20px; border-radius: 4px;"></div>
        </div>
      `;
    }

    // 6. Terminal Feed Skeleton
    const terminalFeed = $('#terminal-feed');
    if (terminalFeed) {
      terminalFeed.innerHTML = `
        <div class="log-skeleton-row">
          <div class="skeleton skeleton-text" style="width: 52px; height: 11px;"></div>
          <div class="skeleton" style="width: 64px; height: 18px; border-radius: 4px;"></div>
          <div class="skeleton skeleton-text" style="flex:1; height: 11px;"></div>
        </div>
        <div class="log-skeleton-row">
          <div class="skeleton skeleton-text" style="width: 52px; height: 11px;"></div>
          <div class="skeleton" style="width: 56px; height: 18px; border-radius: 4px;"></div>
          <div class="skeleton skeleton-text" style="width: 70%; height: 11px;"></div>
        </div>
        <div class="log-skeleton-row">
          <div class="skeleton skeleton-text" style="width: 52px; height: 11px;"></div>
          <div class="skeleton" style="width: 68px; height: 18px; border-radius: 4px;"></div>
          <div class="skeleton skeleton-text" style="width: 80%; height: 11px;"></div>
        </div>
      `;
    }

    // 7. Rules Card Skeleton (se em demo_skeleton)
    const rulesGroup = $('.rules-card .settings-group');
    if (rulesGroup && window.location.href.includes('demo_skeleton=1')) {
      rulesGroup.innerHTML = `
        <div class="rules-skeleton-row">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div class="skeleton skeleton-text" style="width: 140px; height: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 200px; height: 10px;"></div>
          </div>
          <div class="skeleton" style="width: 36px; height: 20px; border-radius: 9999px;"></div>
        </div>
        <div class="rules-skeleton-row">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div class="skeleton skeleton-text" style="width: 130px; height: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 180px; height: 10px;"></div>
          </div>
          <div class="skeleton" style="width: 36px; height: 20px; border-radius: 9999px;"></div>
        </div>
      `;
    }

    // 8. Settings Audio Card Skeleton (se em demo_skeleton)
    const settingsGroup = $('#panel-settings .settings-group');
    if (settingsGroup && window.location.href.includes('demo_skeleton=1')) {
      settingsGroup.innerHTML = `
        <div class="rules-skeleton-row">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div class="skeleton skeleton-text" style="width: 120px; height: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 220px; height: 10px;"></div>
          </div>
          <div class="skeleton" style="width: 130px; height: 32px; border-radius: 6px;"></div>
        </div>
        <div class="rules-skeleton-row">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div class="skeleton skeleton-text" style="width: 110px; height: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 40px; height: 10px;"></div>
          </div>
          <div class="skeleton" style="width: 140px; height: 16px; border-radius: 9999px;"></div>
        </div>
      `;
    }
  }

  function renderAll() {
    renderOwner();
    renderMetrics();
    renderAccounts();
    renderRotation();
    renderLogs();
    renderSettings();
  }

  function bindEvents() {
    $('.sidebar-nav')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (btn?.dataset.tab) setTab(btn.dataset.tab);
    });

    $('#link-goto-accounts')?.addEventListener('click', () => setTab('accounts'));

    $('#btn-sync-all')?.addEventListener('click', async () => {
      const btn = $('#btn-sync-all');
      btn.disabled = true;
      btn.classList.add('is-syncing');
      try {
        await send({ type: 'POLL' });
        await syncState();
        renderAll();
        const conns = Object.values(DB?.connections || {});
        if (conns.length === 0) {
          showToast('info', 'Workspace sem contas', 'Conecte sua primeira conta do ChatGPT');
        } else {
          const exhausted = conns.filter((c) => c.quota?.exhausted || gaugeMax(c) >= 100).length;
          if (exhausted > 0) {
            showToast('warn', 'Limites sincronizados', `${exhausted} conta${exhausted > 1 ? 's' : ''} temporariamente em espera`);
          } else {
            showToast('ok', 'Limites sincronizados', `${conns.length} conta${conns.length > 1 ? 's' : ''} prontas para envio`);
          }
        }
      } catch {
        showToast('crit', 'Falha na sincronização', 'Não foi possível atualizar limites no momento');
      } finally {
        btn.classList.remove('is-syncing');
        btn.disabled = false;
      }
    });

    // Abrir Modal de Conectar Conta
    $('#btn-open-add-modal')?.addEventListener('click', () => openAddAccountModal(false));
    $('#btn-empty-add')?.addEventListener('click', () => openAddAccountModal(false));

    // Fechar Modal e Aviso
    $('#btn-close-add-modal')?.addEventListener('click', closeAddAccountModal);
    $('#btn-close-notice')?.addEventListener('click', hideModalNotice);
    $('#add-account-dialog-backdrop')?.addEventListener('click', (e) => {
      if (e.target === $('#add-account-dialog-backdrop')) closeAddAccountModal();
    });

    // Cancelar espera de login guiado
    $('#btn-cancel-pending-login')?.addEventListener('click', async () => {
      const banner = $('#login-active-banner');
      if (banner) banner.hidden = true;
      await send({ type: 'CANCEL_LOGIN' });
      await syncState();
      renderAll();
      showToast('info', 'Login cancelado', 'Aguardando ação do usuário');
    });

    // Opção 1: Captura Instantânea da Aba Ativa
    $('#btn-opt-capture-tab')?.addEventListener('click', async () => {
      hideModalNotice();
      const btn = $('#btn-opt-capture-tab');
      const origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${renderSpinner('size-4')}<span>Detectando aba ativa do ChatGPT...</span>`;
      try {
        const res = await send({ type: 'CAPTURE_ACTIVE_TAB', asOwner: modalAsOwner });
        if (res?.ok) {
          closeAddAccountModal();
          await syncState();
          renderAll();
          showToast('ok', 'Conta conectada com sucesso', `Acesso validado para ${res.email.split('@')[0]}`);
        } else {
          const title = res?.title || 'Guia sem login ativo';
          const errorMsg = res?.error || 'Você não está logado no ChatGPT nesta janela do navegador.';
          showModalNotice('crit', title, `${esc(errorMsg)}<br>Abra o <strong>chatgpt.com</strong> e entre na sua conta, ou clique em <strong>Login Guiado</strong> logo abaixo.`);
          showToast('warn', title, errorMsg);
        }
      } catch (err) {
        showModalNotice('crit', 'Erro na captura', err.message || 'Falha de comunicação');
        showToast('crit', 'Erro na captura', err.message || 'Falha ao se comunicar com a aba');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    });

    // Opção 2: Login Guiado em Nova Aba
    $('#btn-opt-guided-login')?.addEventListener('click', async () => {
      closeAddAccountModal();
      const type = modalAsOwner ? 'LOGIN_OWNER' : 'ADD_ACCOUNT';
      const res = await send({ type });
      if (res?.error) {
        showToast('crit', 'Falha ao abrir guia', res.error);
      } else {
        showToast('info', 'Guia de login aberta', 'Faça login no ChatGPT para concluir a conexão');
      }
      await syncState();
      renderAll();
    });

    // Opção 3: Inserir Token Manualmente
    $('#btn-opt-toggle-token')?.addEventListener('click', () => {
      hideModalNotice();
      $('#box-add-options').hidden = true;
      $('#box-add-token').hidden = false;
      const titleEl = $('#add-modal-title');
      const subtitleEl = $('#add-modal-subtitle');
      if (titleEl) {
        titleEl.textContent = modalAsOwner
          ? 'Conectar Conta Principal via Token'
          : 'Conectar via Token de Sessão';
      }
      if (subtitleEl) {
        subtitleEl.textContent = 'Siga o tutorial abaixo para obter e colar seu token com segurança:';
      }
      $('#input-account-token')?.focus();
    });

    $('#btn-cancel-token')?.addEventListener('click', () => {
      hideModalNotice();
      $('#box-add-token').hidden = true;
      $('#box-add-options').hidden = false;
      const titleEl = $('#add-modal-title');
      const subtitleEl = $('#add-modal-subtitle');
      if (titleEl) {
        titleEl.textContent = 'Conectar Conta do ChatGPT';
      }
      if (subtitleEl) {
        subtitleEl.textContent = 'Escolha como deseja sincronizar sua conta ao SeatOrbit:';
      }
    });

    $('#btn-submit-token')?.addEventListener('click', async () => {
      hideModalNotice();
      const raw = ($('#input-account-token')?.value || '').trim();
      if (!raw) {
        showModalNotice('crit', 'Token em branco', 'Por favor, cole seu Access Token (JWT) ou cookie de sessão.');
        showToast('warn', 'Token não informado', 'Insira o token para prosseguir');
        return;
      }
      const btn = $('#btn-submit-token');
      const origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${renderSpinner('size-3')}<span>Conectando...</span>`;
      try {
        const res = await send({ type: 'ADD_ACCOUNT_BY_TOKEN', token: raw, asOwner: modalAsOwner });
        if (res?.ok) {
          closeAddAccountModal();
          await syncState();
          renderAll();
          showToast('ok', 'Conta adicionada via token', `Sessão vinculada para ${res.email.split('@')[0]}`);
        } else {
          showModalNotice('crit', 'Token inválido', res?.error || 'Não foi possível autenticar com este token. Verifique e tente novamente.');
          showToast('crit', 'Token inválido', res?.error || 'Token expirado ou rejeitado pela OpenAI');
        }
      } catch (err) {
        showModalNotice('crit', 'Erro ao salvar conta', err.message || 'Falha de comunicação');
        showToast('crit', 'Erro ao salvar conta', err.message || 'Não foi possível persistir as credenciais');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    });

    // Eventos no feed de contas
    $('#accounts-feed')?.addEventListener('click', async (e) => {
      // Definir conta como Owner
      const ownerBtn = e.target.closest('[data-set-owner-email]');
      if (ownerBtn) {
        const email = ownerBtn.dataset.setOwnerEmail;
        ownerBtn.disabled = true;
        const r = await send({ type: 'SET_AS_OWNER', email });
        ownerBtn.disabled = false;
        if (r?.ok) {
          await syncState();
          renderAll();
          showToast('ok', 'Conta principal definida', `Definida como padrão: ${email.split('@')[0]}`);
        } else {
          showToast('crit', 'Operação não permitida', r?.error || 'Não foi possível definir a conta principal');
        }
        return;
      }

      // Alternar sessão no ChatGPT
      const swBtn = e.target.closest('[data-switch-acc]');
      if (swBtn) {
        const key = swBtn.dataset.switchAcc;
        const email = key.split('__')[0];
        const conn = DB?.connections?.[key];
        if (conn?.isActive) {
          showToast('info', 'Conta já em uso', 'Esta conta já está conectada no navegador');
          return;
        }
        const origHtml = swBtn.innerHTML;
        swBtn.disabled = true;
        swBtn.innerHTML = `${renderSpinner('size-3', 'inline-start')}<span>Conectando...</span>`;
        try {
          const r = await send({ type: 'SWITCH_ACCOUNT', key });
          if (r?.ok) {
            await syncState();
            renderAll();
            showToast('ok', 'Conta alternada', `Sessão do ChatGPT atualizada para ${email.split('@')[0]}`);
          } else {
            showToast('crit', 'Falha ao trocar conta', r?.error || 'Não foi possível alternar a sessão');
          }
        } finally {
          swBtn.disabled = false;
          swBtn.innerHTML = origHtml;
        }
        return;
      }

      // Remover conta com Shadcn AlertDialog
      const delBtn = e.target.closest('[data-del-acc]');
      if (delBtn) {
        const key = delBtn.dataset.delAcc;
        const email = key.split('__')[0];
        const ok = await showShadcnDialog({
          title: 'Remover Conta',
          desc: `Deseja remover ${email}? Esta conta não será mais utilizada para troca automática.`,
          confirmText: 'Remover',
          isDestructive: true,
          icon: ICONS.userX,
        });
        if (!ok) return;

        await send({ type: 'REMOVE_CONNECTION', key });
        await syncState();
        renderAll();
        showToast('ok', 'Conta removida', `Acesso de ${email.split('@')[0]} excluído do workspace`);
      }
    });

    // Alternar conta pela lista resumida
    $('#overview-fleet-list')?.addEventListener('click', async (e) => {
      const swBtn = e.target.closest('[data-switch-acc]');
      if (swBtn) {
        const key = swBtn.dataset.switchAcc;
        const email = key.split('__')[0];
        const conn = DB?.connections?.[key];
        if (conn?.isActive) {
          showToast('info', 'Conta já em uso', 'Esta conta já está conectada no navegador');
          return;
        }
        const r = await send({ type: 'SWITCH_ACCOUNT', key });
        if (r?.ok) {
          await syncState();
          renderAll();
          showToast('ok', 'Conta alternada', `Sessão do ChatGPT atualizada para ${email.split('@')[0]}`);
        } else {
          showToast('crit', 'Falha ao trocar conta', r?.error || 'Não foi possível alternar a sessão');
        }
      }
    });

    // Ação do Card de Recomendação Estratégica Inteligente
    $('#smart-rec-slot')?.addEventListener('click', async (e) => {
      const swBtn = e.target.closest('[data-switch-acc]');
      if (swBtn) {
        const key = swBtn.dataset.switchAcc;
        const email = key.split('__')[0];
        const conn = DB?.connections?.[key];
        if (conn?.isActive) {
          showToast('info', 'Conta já em uso', 'Esta conta já está conectada no navegador');
          return;
        }
        const origHtml = swBtn.innerHTML;
        swBtn.disabled = true;
        swBtn.innerHTML = `${renderSpinner('size-3', 'inline-start')}<span>Conectando...</span>`;
        try {
          const r = await send({ type: 'SWITCH_ACCOUNT', key });
          if (r?.ok) {
            await syncState();
            renderAll();
            showToast('ok', 'Conta alternada', `ChatGPT conectado como ${email.split('@')[0]} para aproveitar reset`);
          } else {
            showToast('crit', 'Falha ao trocar conta', r?.error || 'Não foi possível alternar a sessão');
          }
        } finally {
          swBtn.disabled = false;
          swBtn.innerHTML = origHtml;
        }
      }
    });

    // Controles de rotação
    $('#btn-start-autopilot')?.addEventListener('click', async () => {
      const conns = Object.values(DB?.connections || {});
      if (conns.length === 0) {
        showToast('warn', 'Nenhuma conta cadastrada', 'Conecte uma conta para gerenciar rotação');
        return;
      }
      if (conns.length === 1 && (DB?.queue || []).length === 0) {
        showToast('warn', 'Requer ao menos 2 contas', 'Adicione mais contas para habilitar a troca contínua');
        return;
      }
      await send({ type: 'SET_AUTOMATION', patch: { running: true } });
      await syncState();
      renderAll();
      showToast('ok', 'Automação ativada', 'Alternância automática em execução');
    });

    $('#btn-stop-autopilot')?.addEventListener('click', async () => {
      await send({ type: 'SET_AUTOMATION', patch: { running: false } });
      await syncState();
      renderAll();
      showToast('warn', 'Automação pausada', 'A troca automática foi interrompida');
    });

    $('#btn-run-once')?.addEventListener('click', async () => {
      const conns = Object.values(DB?.connections || {});
      if (conns.length === 0) {
        showToast('warn', 'Nenhuma conta cadastrada', 'Conecte uma conta para alternar');
        return;
      }
      if (conns.length === 1 && (DB?.queue || []).length === 0) {
        showToast('warn', 'Requer ao menos 2 contas', 'Adicione mais contas para alternar o fluxo');
        return;
      }

      const btn = $('#btn-run-once');
      const origHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `${renderSpinner('size-3.5', 'inline-start')}<span>Trocando...</span>`;
      try {
        const res = await send({ type: 'RUN_CYCLE', manual: true });
        await syncState();
        renderAll();
        if (res?.switched) {
          const userPart = res.email ? res.email.split('@')[0] : '';
          showToast('ok', 'Conta alternada', `ChatGPT conectado como ${userPart}`);
        } else if (res?.error) {
          showToast('warn', 'Aviso de rotação', res.error);
        } else if (res?.message) {
          showToast('info', 'Status da rotação', res.message);
        } else {
          showToast('info', 'Limites verificados', 'Todas as contas estão em conformidade');
        }
      } catch {
        showToast('crit', 'Falha ao trocar conta', 'Não foi possível alternar a sessão no momento');
      } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    });

    // Reordenação da fila (Botões subir/descer e Drag & Drop suave e leve)
    const queueContainer = $('#queue-items-container') || $('#queue-list');
    if (queueContainer) {
      queueContainer.addEventListener('click', async (e) => {
        const up = e.target.closest('[data-up]');
        const down = e.target.closest('[data-down]');
        if (!up && !down) return;
        const btn = up || down;
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
        const key = up ? up.dataset.up : down.dataset.down;
        const dir = up ? 'up' : 'down';
        await send({ type: 'QUEUE_REORDER', key, dir });
        await syncState();
        renderAll();
      });

      let draggedRow = null;
      let startOrder = [];

      queueContainer.addEventListener('dragstart', (e) => {
        const row = e.target.closest('.queue-row');
        if (!row || e.target.closest('button') || e.target.closest('.queue-reorder-btns')) {
          e.preventDefault();
          return;
        }

        isDraggingQueue = true;
        draggedRow = row;
        startOrder = Array.from(queueContainer.querySelectorAll('.queue-row')).map((r) => r.dataset.key);

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', row.dataset.key || '');

        // Aplica classe no próximo ciclo para preservar a imagem ghost nativa do navegador
        requestAnimationFrame(() => {
          if (draggedRow && isDraggingQueue) draggedRow.classList.add('is-dragging');
        });
      });

      queueContainer.addEventListener('dragover', (e) => {
        if (!draggedRow || !isDraggingQueue) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const targetRow = e.target.closest('.queue-row');
        if (!targetRow || targetRow === draggedRow) return;

        const rect = targetRow.getBoundingClientRect();
        const isAfter = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;

        if (isAfter) {
          queueContainer.insertBefore(draggedRow, targetRow.nextSibling);
        } else {
          queueContainer.insertBefore(draggedRow, targetRow);
        }

        // Atualização em tempo real das posições e estados dos botões
        const currentRows = queueContainer.querySelectorAll('.queue-row');
        currentRows.forEach((r, idx) => {
          const rankEl = r.querySelector('.queue-rank');
          if (rankEl) rankEl.textContent = `#${idx + 1}`;

          const upBtn = r.querySelector('[data-up]');
          const downBtn = r.querySelector('[data-down]');
          if (upBtn) upBtn.disabled = idx === 0;
          if (downBtn) downBtn.disabled = idx === currentRows.length - 1;
        });
      });

      const finishDrag = async () => {
        if (!isDraggingQueue && !draggedRow) return;
        isDraggingQueue = false;

        if (draggedRow) {
          draggedRow.classList.remove('is-dragging');
          draggedRow = null;
        }

        queueContainer.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));

        const currentRows = Array.from(queueContainer.querySelectorAll('.queue-row'));
        const newOrder = Array.from(new Set(currentRows.map((r) => r.dataset.key).filter(Boolean)));

        const changed =
          newOrder.length === startOrder.length &&
          newOrder.some((k, idx) => k !== startOrder[idx]);

        if (changed) {
          if (DB && Array.isArray(DB.queue)) {
            DB.queue = newOrder;
          }
          await send({ type: 'QUEUE_SET_ORDER', queue: newOrder });
          await syncState();
          renderAll();
          showToast('ok', 'Fila reorganizada', 'Nova ordem de prioridade definida');
        } else {
          renderRotation();
        }
      };

      queueContainer.addEventListener('dragend', finishDrag);
      window.addEventListener('dragend', finishDrag);
      queueContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        finishDrag();
      });
    }

    // Navegação direta para Contas pelo CTA da fila vazia
    $('#btn-queue-goto-accounts')?.addEventListener('click', () => {
      setTab('accounts');
    });

    // Políticas de automação
    $('#toggle-auto-remove')?.addEventListener('change', (e) =>
      send({ type: 'SET_AUTOMATION', patch: { autoRemove: e.target.checked } })
    );

    $('#toggle-auto-invite')?.addEventListener('change', (e) =>
      send({ type: 'SET_AUTOMATION', patch: { autoInvite: e.target.checked } })
    );

    $('#select-cycle-time')?.addEventListener('change', (e) =>
      send({ type: 'SET_AUTOMATION', patch: { cycleMs: Number(e.target.value) * 1000 } })
    );

    // Filtros de logs
    $('.terminal-filters')?.addEventListener('click', (e) => {
      const pill = e.target.closest('.filter-pill');
      if (!pill) return;
      $$('.filter-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentLogFilter = pill.dataset.filter;
      renderLogs();
    });

    $('#btn-clear-logs')?.addEventListener('click', async () => {
      const logsCount = (DB?.log || []).length;
      if (logsCount === 0) {
        showToast('info', 'Histórico já está vazio');
        return;
      }
      await send({ type: 'CLEAR_LOG' });
      await syncState();
      renderLogs();
      showToast('ok', 'Logs limpos');
    });

    // Configurações de áudio
    $('#toggle-audio-enabled')?.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      if (!DB) DB = {};
      if (!DB.audio) DB.audio = {};
      DB.audio.enabled = enabled;
      await send({ type: 'SET_AUDIO_CONFIG', config: { enabled } });
    });

    $('#toggle-audio-near-reset')?.addEventListener('change', async (e) => {
      const nearResetAlert = e.target.checked;
      if (!DB) DB = {};
      if (!DB.audio) DB.audio = {};
      DB.audio.nearResetAlert = nearResetAlert;
      const boxNear = $('#box-near-reset-settings');
      if (boxNear) boxNear.hidden = !nearResetAlert;
      await send({ type: 'SET_AUDIO_CONFIG', config: { nearResetAlert } });
      renderMetrics();
      renderAccounts();
      showToast('ok', nearResetAlert ? 'Alerta de reset ativado' : 'Alerta de reset pausado');
    });

    $('#select-near-reset-mins')?.addEventListener('change', async (e) => {
      const mins = Number(e.target.value) || 30;
      if (!DB) DB = {};
      if (!DB.audio) DB.audio = {};
      DB.audio.nearResetMins = mins;
      await send({ type: 'SET_AUDIO_CONFIG', config: { nearResetMins: mins } });
      renderMetrics();
      renderAccounts();
      showToast('ok', 'Antecedência definida', `Avisará ${mins} min antes da renovação`);
    });

    $('#select-near-audio-preset')?.addEventListener('change', async (e) => {
      const nearPreset = e.target.value;
      if (!DB) DB = {};
      if (!DB.audio) DB.audio = {};
      DB.audio.nearPreset = nearPreset;

      const sliderEl = document.getElementById('slider-volume');
      const sliderVal = sliderEl ? Number(sliderEl.value) : 75;
      const volume = Math.max(0, Math.min(1, sliderVal / 100));

      playLocalSound(nearPreset, volume);
      await send({ type: 'SET_AUDIO_CONFIG', config: { nearPreset } });
    });

    const handleVolumeInput = (e) => {
      const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
      const volume = val / 100;
      const label = $('#label-volume-val');
      if (label) label.textContent = `${val}%`;

      if (!DB) DB = {};
      if (!DB.audio) DB.audio = {};
      DB.audio.volume = volume;

      send({ type: 'SET_AUDIO_CONFIG', config: { volume } });
    };

    $('#slider-volume')?.addEventListener('input', handleVolumeInput);
    $('#slider-volume')?.addEventListener('change', handleVolumeInput);

    $('#select-audio-preset')?.addEventListener('change', async (e) => {
      const preset = e.target.value;
      if (!DB) DB = {};
      if (!DB.audio) DB.audio = {};
      DB.audio.preset = preset;

      const sliderEl = document.getElementById('slider-volume');
      const sliderVal = sliderEl ? Number(sliderEl.value) : 75;
      const volume = Math.max(0, Math.min(1, sliderVal / 100));

      playLocalSound(preset, volume);
      await send({ type: 'SET_AUDIO_CONFIG', config: { preset } });
    });

    // Testar sons configurados (Garante reprodução individual sem sobreposição)
    $('#btn-test-sound')?.addEventListener('click', () => {
      const preset = DB?.audio?.preset || 'chime';
      const sliderEl = document.getElementById('slider-volume');
      const sliderVal = sliderEl ? Number(sliderEl.value) : 75;
      const volume = Math.max(0, Math.min(1, sliderVal / 100));

      playLocalSound(preset, volume);
      showToast('ok', 'Alerta de recuperação reproduzido');
    });

    $('#btn-test-near-sound')?.addEventListener('click', () => {
      const nearPreset = DB?.audio?.nearPreset || 'pulse';
      const sliderEl = document.getElementById('slider-volume');
      const sliderVal = sliderEl ? Number(sliderEl.value) : 75;
      const volume = Math.max(0, Math.min(1, sliderVal / 100));

      playLocalSound(nearPreset, volume);
      showToast('ok', 'Alerta de reset próximo reproduzido');
    });

    // Biblioteca de Áudios Personalizados (Até 5 slots)
    $('#btn-add-audio-slot')?.addEventListener('click', () => {
      const audios = DB?.audio?.customAudios || [];
      if (audios.length < 5) {
        _targetSlotToReplace = null;
        const input = $('#input-upload-audio-slot');
        if (input) {
          input.value = '';
          input.click();
        }
      } else {
        openReplaceAudioModal();
      }
    });

    $('#input-upload-audio-slot')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        showToast('crit', 'Arquivo muito grande', 'O áudio deve ter no máximo 5 MB.');
        return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const base64 = evt.target.result;
        if (!DB) DB = {};
        if (!DB.audio) DB.audio = {};
        if (!Array.isArray(DB.audio.customAudios)) DB.audio.customAudios = [];

        const sizeStr = formatAudioFileSize(file.size);
        const sliderEl = document.getElementById('slider-volume');
        const sliderVal = sliderEl ? Number(sliderEl.value) : 75;
        const volume = Math.max(0, Math.min(1, sliderVal / 100));

        if (_targetSlotToReplace) {
          const idx = DB.audio.customAudios.findIndex((a) => a.id === _targetSlotToReplace);
          if (idx !== -1) {
            DB.audio.customAudios[idx] = {
              id: _targetSlotToReplace,
              name: file.name,
              sizeStr,
              base64,
              createdAt: Date.now(),
            };
            showToast('ok', 'Áudio substituído', `Slot #${idx + 1} atualizado`);
          }
        } else {
          if (DB.audio.customAudios.length >= 5) {
            openReplaceAudioModal();
            return;
          }
          const newId = 'cust_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          DB.audio.customAudios.push({
            id: newId,
            name: file.name,
            sizeStr,
            base64,
            createdAt: Date.now(),
          });
          showToast('ok', 'Áudio salvo', 'Áudio adicionado com sucesso à biblioteca');
        }

        _targetSlotToReplace = null;
        closeReplaceAudioModal();
        await send({ type: 'SET_AUDIO_CONFIG', config: { customAudios: DB.audio.customAudios } });
        renderSettings();
        playLocalSound('custom', volume, base64);
      };
      reader.readAsDataURL(file);
    });

    // Ações na lista de áudios da biblioteca
    $('#custom-audios-list')?.addEventListener('click', async (e) => {
      const btnPreview = e.target.closest('.btn-preview-audio');
      const btnReplace = e.target.closest('.btn-replace-single');
      const btnDel = e.target.closest('.btn-del-audio');
      const row = e.target.closest('.custom-audio-row');
      if (!row) return;

      const audioId = row.dataset.audioId;
      const audios = DB?.audio?.customAudios || [];
      const targetAudio = audios.find((a) => a.id === audioId);

      if (btnPreview) {
        if (_currentlyPlayingSlotId === audioId) {
          stopCurrentPreviewSound();
        } else if (targetAudio?.base64) {
          const sliderEl = document.getElementById('slider-volume');
          const sliderVal = sliderEl ? Number(sliderEl.value) : 75;
          const volume = Math.max(0, Math.min(1, sliderVal / 100));
          playLocalSound('custom', volume, targetAudio.base64, audioId);
        }
        return;
      }

      if (btnReplace) {
        _targetSlotToReplace = audioId;
        const input = $('#input-upload-audio-slot');
        if (input) {
          input.value = '';
          input.click();
        }
        return;
      }

      if (btnDel) {
        if (_currentlyPlayingSlotId === audioId) {
          stopCurrentPreviewSound();
        }
        DB.audio.customAudios = audios.filter((a) => a.id !== audioId);

        if (DB.audio.preset === 'custom_' + audioId || DB.audio.preset === 'custom') {
          DB.audio.preset = 'chime';
        }
        if (DB.audio.nearPreset === 'custom_' + audioId || DB.audio.nearPreset === 'custom') {
          DB.audio.nearPreset = 'pulse';
        }

        await send({
          type: 'SET_AUDIO_CONFIG',
          config: {
            customAudios: DB.audio.customAudios,
            preset: DB.audio.preset,
            nearPreset: DB.audio.nearPreset,
          },
        });
        renderSettings();
        showToast('info', 'Áudio removido', 'Slot liberado na biblioteca');
        return;
      }
    });

    // Ações no Modal de Substituição / Limite de Áudios
    $('#btn-close-replace-dialog')?.addEventListener('click', closeReplaceAudioModal);
    $('#btn-cancel-replace-dialog')?.addEventListener('click', closeReplaceAudioModal);

    $('#replace-audio-slots-list')?.addEventListener('click', async (e) => {
      const btnSub = e.target.closest('.btn-substitute-slot');
      const btnDel = e.target.closest('.btn-delete-slot');
      const row = e.target.closest('.replace-audio-row');
      if (!row) return;

      const audioId = row.dataset.audioId;
      const audios = DB?.audio?.customAudios || [];

      if (btnSub) {
        _targetSlotToReplace = audioId;
        closeReplaceAudioModal();
        const input = $('#input-upload-audio-slot');
        if (input) {
          input.value = '';
          input.click();
        }
        return;
      }

      if (btnDel) {
        if (_currentlyPlayingSlotId === audioId) {
          stopCurrentPreviewSound();
        }
        DB.audio.customAudios = audios.filter((a) => a.id !== audioId);

        if (DB.audio.preset === 'custom_' + audioId || DB.audio.preset === 'custom') {
          DB.audio.preset = 'chime';
        }
        if (DB.audio.nearPreset === 'custom_' + audioId || DB.audio.nearPreset === 'custom') {
          DB.audio.nearPreset = 'pulse';
        }

        await send({
          type: 'SET_AUDIO_CONFIG',
          config: {
            customAudios: DB.audio.customAudios,
            preset: DB.audio.preset,
            nearPreset: DB.audio.nearPreset,
          },
        });

        if (DB.audio.customAudios.length < 5) {
          closeReplaceAudioModal();
        } else {
          openReplaceAudioModal();
        }
        renderSettings();
        showToast('info', 'Áudio removido', 'Slot liberado na biblioteca');
        return;
      }
    });

    // Backup e restauração
    $('#btn-export-backup')?.addEventListener('click', async () => {
      const r = await send({ type: 'EXPORT_DATA' });
      if (r?.ok) showToast('ok', 'Backup exportado', r.filename || 'Arquivo salvo com sucesso');
      else showToast('crit', 'Falha ao exportar backup');
    });

    $('#input-import-backup')?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      const r = await send({ type: 'IMPORT_DATA', jsonText: text });
      if (r?.ok) {
        const count = r.count || 0;
        showToast('ok', 'Backup importado', `${count} conta${count === 1 ? '' : 's'}`);
        await send({ type: 'POLL' });
        await syncState();
        renderAll();
      } else {
        showToast('crit', r?.error || 'Arquivo de backup inválido');
      }
      e.target.value = '';
    });

    // Redefinir dados com Shadcn AlertDialog
    $('#btn-factory-reset')?.addEventListener('click', async () => {
      const ok = await showShadcnDialog({
        title: 'Redefinir Dados',
        desc: 'Deseja apagar todas as conexões, histórico, áudios personalizados e preferências locais do SeatOrbit? Esta ação não pode ser desfeita.',
        confirmText: 'Apagar Tudo',
        isDestructive: true,
        icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
      });
      if (!ok) return;

      stopCurrentPreviewSound();
      await send({ type: 'RESET' });
      await syncState();
      renderAll();
      showToast('warn', 'Dados redefinidos', 'Conexões, histórico e áudios apagados');
    });
  }

  if (typeof chrome !== 'undefined' && chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'TOAST_SHOW') {
        showToast(msg.kind || 'ok', msg.title || '', msg.body || '');
      }
    });
  }

  const bootstrap = async () => {
    bindEvents();
    initShadcnTooltips();
    initShadcnSelects();

    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab) {
      setTab(initialTab);
    }

    // 1. Hidratação instantânea síncrona/ultrarrápida a partir do storage (<2ms)
    let hasLocalCache = false;
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      try {
        const stored = await chrome.storage.local.get([
          'seatorbit.v7',
          'seatpilot.v7',
          'sr.v6',
          'admin_rotator_db',
          'chatgpt_rotator_db',
        ]);
        const localDb =
          stored['seatorbit.v7'] ||
          stored['seatpilot.v7'] ||
          stored['sr.v6'] ||
          stored.admin_rotator_db ||
          stored.chatgpt_rotator_db;
        if (localDb && typeof localDb === 'object') {
          DB = localDb;
          hasLocalCache = true;
          renderAll();
        }
      } catch {}
    }

    // 2. Modo demonstrativo explícito
    if (window.location.href.includes('demo_skeleton=1')) {
      renderSkeletons();
      return;
    }

    // 3. Se não houver cache em disco, exibe skeleton temporário enquanto o service worker responde
    if (!hasLocalCache) {
      renderSkeletons();
    }

    await syncState();
    renderAll();

    // Watchdog de segurança: garante que qualquer skeleton remanescente seja substituído pelo UI real
    setTimeout(() => {
      if (!DB) {
        DB = { owner: null, connections: {}, queue: [], automations: { running: false }, log: [] };
      }
      renderAll();
    }, 200);

    setInterval(async () => {
      if (isDraggingQueue) return;
      await syncState();
      renderAll();
    }, 3500);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

/**
 * ============================================================================
 * Fim do arquivo - SeatOrbit
 * Desenvolvido por: @OTheMandaloriano (https://github.com/OTheMandaloriano)
 * ============================================================================
 */

