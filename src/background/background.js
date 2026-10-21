/**
 * ============================================================================
 * SeatOrbit - Sistema de Gerenciamento e Rotação de Contas ChatGPT
 * Desenvolvido por: @OTheMandaloriano
 * GitHub: https://github.com/OTheMandaloriano
 * Todos os direitos reservados.
 * ============================================================================
 * Engine principal do SeatOrbit:
 * - Persistência silenciosa de sessão (cookies chunked NextAuth e Proactive Refresh)
 * - Detecção automática e flexível de Workspace (Business, Team, Enterprise ou Pessoal)
 * - Síntese de áudio com Web Audio API e suporte a áudio personalizado
 * - Ciclo de rotação autônomo com auto-remove e auto-invite
 * - Troca rápida de conta ativa no navegador em 1 clique
 */

const STORE = 'seatorbit.v7';
const LEGACY_STORES = ['seatpilot.v7', 'sr.v6'];

// Estado da extensão
let DB = {
  owner: null, // { email, accountId, workspaceName, planType, userName, userImage, verified: true }
  connections: {},
  queue: [],
  automations: {
    running: false,
    autoRemove: true,
    autoInvite: true,
    cycleMs: 180000,
    proactiveKeepAlive: true,
  },
  audio: {
    enabled: true,
    preset: 'chime', // Pack 1 (Recuperação): 'chime', 'bell', 'harmony', 'zen' ou custom_<id>
    nearResetAlert: true,
    nearResetMins: 30,
    nearPreset: 'pulse', // Pack 2 (Reset Próximo): 'pulse', 'cyber', 'radar', 'flame' ou custom_<id>
    customAudios: [], // até 5 áudios salvos: [{ id, name, sizeStr, base64, createdAt }]
    volume: 0.75,
  },
  log: [],
  _loginPending: false,
  _loginType: null, // 'owner' ou 'member'
  _loginPendingDesde: null,
  meta: { createdAt: Date.now(), version: '7.2.0', name: 'SeatOrbit' },
};

let _loginTabId = null;
let _loginPollerInterval = null;
let _captureDebounce = null;
let _refreshLock = false;

// Helpers de Workspace e Papel de Proprietário
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

// Reconciliação automática da conta proprietária do workspace
function reconcileBusinessOwner() {
  if (!DB.connections) return;
  const allConns = Object.values(DB.connections);

  // Verifica se o DB.owner atual é legítimo (Business + Owner)
  const currentOwnerIsBiz = isBusinessOwner(DB.owner);

  if (!currentOwnerIsBiz) {
    // Busca a conta Business com privilégios de proprietário entre as conexões
    const bizConn = allConns.find(c => isBusinessOwner(c)) || allConns.find(c => isWorkspacePlan(c.planType));
    if (bizConn) {
      const oldOwner = DB.owner;
      DB.owner = {
        email: bizConn.email,
        accountId: bizConn.accountId || 'personal',
        workspaceName: bizConn.workspaceName || 'Workspace de ' + bizConn.email.split('@')[0],
        planType: bizConn.planType || 'Business',
        userName: bizConn.userName || bizConn.email,
        userImage: bizConn.userImage || null,
        verified: true,
        isOwner: true,
        connectedAt: Date.now(),
      };

      if (oldOwner?.email && oldOwner.email !== bizConn.email) {
        const oldKey = Object.keys(DB.connections).find(k => k.startsWith(oldOwner.email + '__'));
        if (oldKey && !DB.queue.includes(oldKey)) {
          DB.queue.push(oldKey);
        }
      }

      DB.queue = (DB.queue || []).filter(k => !k.startsWith(bizConn.email + '__'));
      lg(`Reconciliação automática: Conta Proprietária Business corrigida para ${bizConn.email}`, 'ok');
    } else if (DB.owner && !isWorkspacePlan(DB.owner.planType)) {
      // Se não há conta business, desmarca DB.owner para não exibir conta Plus como proprietária
      const nonBizOwner = DB.owner;
      const k = Object.keys(DB.connections).find(k => k.startsWith(nonBizOwner.email + '__'));
      if (k && !DB.queue.includes(k)) {
        DB.queue.push(k);
      }
      DB.owner = null;
      lg('Aviso: Nenhuma conta conectada possui plano Business/Team. O SeatOrbit requer uma conta Proprietária com plano corporativo.', 'warn');
    }
  }
}

// Persistência
async function load() {
  const r = await chrome.storage.local.get([STORE, ...LEGACY_STORES]);
  if (r[STORE]) {
    DB = { ...DB, ...r[STORE] };
  } else {
    for (const legacy of LEGACY_STORES) {
      if (r[legacy]) {
        DB = { ...DB, ...r[legacy] };
        if (DB.ownerEmail && !DB.owner) {
          DB.owner = {
            email: DB.ownerEmail,
            accountId: DB.ownerAccountId || 'personal',
            workspaceName: 'Workspace Principal',
            planType: 'Business',
            verified: true,
          };
        }
        break;
      }
    }
    DB.meta = { createdAt: Date.now(), version: '7.2.0', name: 'SeatOrbit' };
    await save();
  }
  reconcileBusinessOwner();
  const conns = Object.values(DB.connections || {});
  if (conns.length && !conns.some((c) => c.isActive)) {
    const defaultActive = conns.find((c) => DB.owner && c.email?.toLowerCase() === DB.owner.email?.toLowerCase()) || conns[0];
    if (defaultActive) defaultActive.isActive = true;
  }
  await idbMirrorRead().catch(() => {});
}

async function save() {
  DB.meta.updatedAt = Date.now();
  await chrome.storage.local.set({ [STORE]: DB });
  await idbMirrorWrite().catch(() => {});
  try {
    if (typeof chrome !== 'undefined' && chrome?.tabs?.query) {
      chrome.tabs.query({}, (tabs) => {
        for (const t of tabs || []) {
          if (t.id) {
            chrome.tabs.sendMessage(t.id, { type: 'DB_UPDATED', db: DB }).catch(() => {});
          }
        }
      });
    }
  } catch {}
}

function lg(msg, level = 'info') {
  DB.log.unshift({ ts: Date.now(), msg, level });
  if (DB.log.length > 500) DB.log.length = 500;
  save();
  updateBadge();
}

// Espelhamento no IndexedDB
const IDB_NAME = 'seatorbit_db';
const IDB_STORE = 'state';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function idbMirrorWrite() {
  try {
    const idb = await idbOpen();
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ key: 'db', value: DB, updatedAt: Date.now() });
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch {}
}

async function idbMirrorRead() {
  try {
    const idb = await idbOpen();
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get('db');
    return new Promise((res) => {
      req.onsuccess = () => {
        if (req.result?.value) {
          const saved = req.result.value;
          if (saved && saved.meta && (!DB.meta || (saved.meta.updatedAt || 0) > (DB.meta.updatedAt || 0))) {
            DB = { ...DB, ...saved };
          }
        }
        res();
      };
      req.onerror = () => res();
    });
  } catch {}
}

// Cookies NextAuth e sessão do ChatGPT
const NEXT_AUTH_COOKIE_PREFIXES = [
  '__Secure-next-auth.session-token',
  '__Secure-next-auth.callback-url',
  '__Host-next-auth.csrf-token',
  '__Secure-next-auth.state',
  '__Secure-next-auth.pkce.code_verifier',
  '_cfuvid',
  'cf_clearance',
  'oai-did',
  'oai-nav-state',
];

function isAuthCookie(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  if (n.includes('next-auth')) return true;
  if (n.includes('session-token')) return true;
  if (n.includes('csrf')) return true;
  return NEXT_AUTH_COOKIE_PREFIXES.some(prefix => name === prefix || name.startsWith(prefix + '.') || name.startsWith(prefix));
}

function parseJwt(token) {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (base64.length % 4)) % 4;
    const json = atob(base64 + '='.repeat(padding));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function getBrowserAuthCookies() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
    return cookies.filter(c => isAuthCookie(c.name));
  } catch (err) {
    console.warn('[SeatOrbit] Erro ao obter cookies:', err);
    return [];
  }
}

async function clearBrowserAuthCookies() {
  try {
    const domains = ['chatgpt.com', 'openai.com', 'auth.openai.com'];
    for (const domain of domains) {
      const cookies = await chrome.cookies.getAll({ domain }).catch(() => []);
      for (const c of cookies) {
        if (isAuthCookie(c.name)) {
          const protocol = c.secure ? 'https:' : 'http:';
          const cleanDomain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
          const url = `${protocol}//${cleanDomain}${c.path}`;
          await chrome.cookies.remove({
            url,
            name: c.name,
            storeId: c.storeId,
          }).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('[SeatOrbit] Erro ao limpar cookies:', err);
  }
}

async function setAuthCookies(cookiesList) {
  if (!Array.isArray(cookiesList)) return;
  for (const c of cookiesList) {
    if (!c || !c.name || !c.value) continue;
    const cookieDetails = {
      url: 'https://chatgpt.com/',
      name: c.name,
      value: c.value,
      path: c.path || '/',
      secure: c.secure !== false,
      httpOnly: c.httpOnly !== false,
      sameSite: (c.sameSite && ['lax', 'strict', 'no_restriction'].includes(c.sameSite)) ? c.sameSite : 'lax',
    };

    // RFC 6265bis: Cookies __Host- NÃO podem ter atributo domain definido
    if (!c.name.startsWith('__Host-')) {
      if (c.domain && c.domain.startsWith('.')) {
        cookieDetails.domain = c.domain;
      }
    }

    if (c.expirationDate && c.expirationDate > Date.now() / 1000) {
      cookieDetails.expirationDate = c.expirationDate;
    } else {
      cookieDetails.expirationDate = Math.floor(Date.now() / 1000) + 86400 * 30;
    }
    await chrome.cookies.set(cookieDetails).catch((err) => {
      console.warn(`[SeatOrbit] Falha ao definir cookie ${c.name}:`, err);
    });
  }
}

// Verificação de expiração do JWT accessToken
function isTokenExpired(token, thresholdSeconds = 120) {
  if (!token) return true;
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return false;
  return (payload.exp - thresholdSeconds) <= Math.floor(Date.now() / 1000);
}

// Mutex assíncrono para operações de sessão (evita colisão de cookies entre abas)
let _sessionLockPromise = Promise.resolve();
function withSessionLock(fn) {
  const next = _sessionLockPromise.then(fn, fn);
  _sessionLockPromise = next.catch(() => {});
  return next;
}

// Renovação de sessão em segundo plano para contas inativas (sem derrubar a conta ativa)
async function refreshInactiveAccountSession(conn) {
  if (!conn || !conn.sessionCookies?.length) return false;

  return await withSessionLock(async () => {
    // 1. Salva os cookies da conta atualmente ativa no navegador
    const activeCookies = await getBrowserAuthCookies();
    const activeConn = Object.values(DB.connections).find((c) => c.isActive);
    if (activeConn && activeCookies.length) {
      activeConn.sessionCookies = activeCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate,
      }));
    }

    try {
      // 2. Limpa cookies de auth temporariamente e injeta os da conta inativa
      await clearBrowserAuthCookies();
      await setAuthCookies(conn.sessionCookies);

      // 3. Faz requisição à API de sessão para renovar o accessToken
      const res = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Sessão rejeitada pela OpenAI (HTTP ' + res.status + ')');
      }
      const session = await res.json();
      if (!session?.accessToken) {
        throw new Error('Resposta de sessão sem accessToken');
      }

      // 4. Captura cookies atualizados (NextAuth pode ter rolado o session-token)
      const freshCookies = await getBrowserAuthCookies();
      conn.accessToken = session.accessToken;
      if (freshCookies.length) {
        conn.sessionCookies = freshCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          expirationDate: c.expirationDate,
        }));
      }
      conn.lastRefresh = Date.now();
      conn.lastError = null;
      await save();
      return true;
    } catch (err) {
      console.warn(`[SeatOrbit] Renovação de sessão em segundo plano para ${conn.email}:`, err.message);
      return false;
    } finally {
      // 5. Restaura imediatamente os cookies da conta ativa original
      await clearBrowserAuthCookies();
      if (activeConn?.sessionCookies?.length) {
        await setAuthCookies(activeConn.sessionCookies);
      } else if (activeCookies.length) {
        await setAuthCookies(activeCookies);
      }
    }
  });
}

// Proactive Keep-Alive: Executado periodicamente para renovar tokens antes que expirem
async function runProactiveKeepAlive() {
  lg('Executando Proactive Keep-Alive para manter sessões ativas...');
  const conns = Object.values(DB.connections || {});
  if (!conns.length) return;

  for (const conn of conns) {
    try {
      const expiredOrClose = isTokenExpired(conn.accessToken, 900); // Faltando menos de 15 minutos
      if (expiredOrClose) {
        if (conn.isActive) {
          const r = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
          if (r.ok) {
            const sess = await r.json();
            if (sess?.accessToken) {
              conn.accessToken = sess.accessToken;
              conn.lastRefresh = Date.now();
              const freshCookies = await getBrowserAuthCookies();
              if (freshCookies.length) {
                conn.sessionCookies = freshCookies.map((c) => ({
                  name: c.name,
                  value: c.value,
                  domain: c.domain,
                  path: c.path,
                  secure: c.secure,
                  httpOnly: c.httpOnly,
                  sameSite: c.sameSite,
                  expirationDate: c.expirationDate,
                }));
              }
              conn.lastError = null;
              lg(`Keep-Alive: sessão ativa renovada para ${conn.email}`, 'ok');
            }
          }
        } else {
          const ok = await refreshInactiveAccountSession(conn);
          if (ok) {
            lg(`Keep-Alive: sessão em segundo plano renovada para ${conn.email}`, 'ok');
          }
        }
      }
    } catch (err) {
      console.warn(`[SeatOrbit] Keep-Alive falhou para ${conn.email}:`, err);
    }
  }

  await save();
}

// Controle do Poller de Login
function stopLoginPoller() {
  if (_loginPollerInterval) {
    clearInterval(_loginPollerInterval);
    _loginPollerInterval = null;
  }
}

// Listeners de cookies e abas
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (changeInfo.removed) return;
  const c = changeInfo.cookie;
  if ((c.domain === 'chatgpt.com' || c.domain === '.chatgpt.com') && isAuthCookie(c.name)) {
    if (_loginTabId != null) {
      clearTimeout(_captureDebounce);
      _captureDebounce = setTimeout(() => {
        attemptCapture(_loginTabId, DB._loginType || 'member');
      }, 1000);
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (tabId !== _loginTabId || info.status !== 'complete') return;
  if (tab.url && tab.url.startsWith('https://chatgpt.com/') && !tab.url.includes('/auth/')) {
    clearTimeout(_captureDebounce);
    _captureDebounce = setTimeout(() => {
      attemptCapture(tabId, DB._loginType || 'member');
    }, 800);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === _loginTabId) {
    stopLoginPoller();
    _loginTabId = null;
    const wasPending = DB._loginPending;
    DB._loginPending = false;
    DB._loginType = null;
    DB._loginPendingDesde = null;
    await save();

    // Se o login foi abortado e não há sessão ativa no navegador, restaura a conta principal
    if (wasPending) {
      const remainingCookies = await getBrowserAuthCookies();
      if (!remainingCookies.length) {
        const owner = getOwnerConn() || Object.values(DB.connections)[0];
        if (owner?.sessionCookies?.length) {
          await setAuthCookies(owner.sessionCookies);
        }
      }
    }
  }
});

// Watchdog de login pendente (limite máximo de 3 minutos)
setInterval(async () => {
  if (DB._loginPending && _loginTabId == null) {
    const pendenteDesde = DB._loginPendingDesde || Date.now();
    if (Date.now() - pendenteDesde > 180000) {
      stopLoginPoller();
      DB._loginPending = false;
      DB._loginType = null;
      DB._loginPendingDesde = null;
      await save();
      lg('Login pendente cancelado por tempo limite (3 min)', 'warn');
    }
  }
}, 10000);

// Gravação unificada de conta capturada
async function saveAccountRecord({ sessionData, accountsCheck, initialUsage, authCookies, loginType, closeTabId = null }) {
  if (!sessionData?.accessToken || !sessionData?.user?.email) {
    return false;
  }

  const email = sessionData.user.email.toLowerCase();
  const accessToken = sessionData.accessToken;

  // Processa cookies de autenticação
  const sessionCookies = (authCookies || []).map(c => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    sameSite: c.sameSite,
    expirationDate: c.expirationDate,
  }));

  const primaryTokenCookie = (authCookies || []).find(c => c.name === '__Secure-next-auth.session-token');
  const sessionTokenValue = primaryTokenCookie
    ? primaryTokenCookie.value
    : (authCookies || []).filter(c => c.name.startsWith('__Secure-next-auth.session-token')).map(c => c.value).join('');

  // Detecção de Workspace e Plano real
  let accountId = null;
  let planType = 'Personal';
  let isAdmin = false;
  let isOwner = false;
  let workspaceName = null;

  if (accountsCheck?.accounts) {
    const allEntries = Object.values(accountsCheck.accounts);
    // Prioridade 1: Buscar conta de workspace (Business, Team, Enterprise)
    const wsEntry = allEntries.find((entry) => {
      const a = entry?.account;
      if (!a) return false;
      const p = (a.plan_type || '').toLowerCase();
      return a.structure === 'workspace' || a.is_workspace === true || ['business', 'team', 'enterprise'].some(t => p.includes(t));
    });

    if (wsEntry?.account) {
      const a = wsEntry.account;
      const id = a.account_id || a.id;
      accountId = (id && id !== 'personal' && id !== 'default') ? id : null;
      planType = a.plan_type ? (a.plan_type.charAt(0).toUpperCase() + a.plan_type.slice(1).toLowerCase()) : 'Business';
      workspaceName = a.name || null;
      const role = (a.role || a.account_user_role || '').toLowerCase();
      isOwner = role === 'owner' || a.is_owner === true || a.is_most_granular_admin === true;
      isAdmin = isOwner || role === 'admin';
    } else {
      // Prioridade 2: Conta pessoal
      const pEntry = allEntries.find((entry) => entry?.account) || allEntries[0];
      if (pEntry?.account) {
        const a = pEntry.account;
        planType = a.plan_type ? (a.plan_type.charAt(0).toUpperCase() + a.plan_type.slice(1).toLowerCase()) : 'Personal';
        workspaceName = a.name || null;
        const role = (a.role || a.account_user_role || '').toLowerCase();
        isOwner = role === 'owner' || a.is_owner === true;
        isAdmin = isOwner || role === 'admin';
      }
    }
  }

  if (!workspaceName) {
    workspaceName = sessionData.user?.name ? `Workspace de ${sessionData.user.name}` : 'Workspace Principal';
  }

  const initialQuota = initialUsage ? normalizeUsage(initialUsage) : null;
  // CRÍTICO: Não sobrescreve plano de workspace com cota individual de endpoint (que pode retornar 'plus')
  if (initialQuota?.plan && !isWorkspacePlan(planType)) {
    planType = initialQuota.plan;
  }

  const connKey = email + '__' + (accountId || 'personal');

  // Ao registrar ou atualizar sessão viva, desativa status isActive das demais
  for (const c of Object.values(DB.connections)) {
    c.isActive = false;
  }

  const existing = DB.connections[connKey];
  DB.connections[connKey] = {
    key: connKey,
    email,
    accessToken,
    accountId,
    planType,
    isAdmin,
    isOwner,
    workspaceName,
    userId: sessionData.user.id || existing?.userId || null,
    userName: sessionData.user.name || existing?.userName || email,
    userImage: sessionData.user.image || sessionData.user.picture || existing?.userImage || null,
    sessionToken: sessionTokenValue || existing?.sessionToken || connKey,
    sessionCookies: sessionCookies.length ? sessionCookies : (existing?.sessionCookies || []),
    capturedAt: existing?.capturedAt || Date.now(),
    lastRefresh: Date.now(),
    isActive: true,
    quota: initialQuota || existing?.quota || null,
    lastPolled: initialQuota ? Date.now() : (existing?.lastPolled || null),
    lastError: null,
  };

  const thisIsBizOwner = isBusinessOwner({ planType, isOwner, isAdmin });

  // Regra estrita de Proprietário do Workspace:
  // Apenas contas que possuem Plano Business (ou Team/Enterprise) e são Proprietárias podem ser DB.owner!
  if (thisIsBizOwner) {
    const currentOwnerIsBiz = isBusinessOwner(DB.owner);
    if (!DB.owner || !currentOwnerIsBiz || loginType === 'owner') {
      const prevOwner = DB.owner;
      DB.owner = {
        email,
        accountId: accountId || 'personal',
        workspaceName: workspaceName || `Workspace de ${sessionData.user.name || email.split('@')[0]}`,
        planType,
        userName: sessionData.user.name || email,
        userImage: sessionData.user.image || sessionData.user.picture || null,
        verified: true,
        isOwner: true,
        connectedAt: Date.now(),
      };

      // Se havia um proprietário anterior que não era Business, move ele para a fila como membro
      if (prevOwner?.email && prevOwner.email !== email) {
        const prevKey = Object.keys(DB.connections).find(k => k.startsWith(prevOwner.email + '__'));
        if (prevKey && !DB.queue.includes(prevKey)) {
          DB.queue.push(prevKey);
        }
      }

      DB.queue = (DB.queue || []).filter(k => !k.startsWith(email + '__'));
      lg(`Conta Proprietária do Business configurada: ${email} (${workspaceName}) [Plano: ${planType}]`, 'ok');
    } else {
      if (!DB.queue) DB.queue = [];
      if (email !== DB.owner?.email && !DB.queue.includes(connKey)) {
        DB.queue.push(connKey);
      }
      lg(`Conta conectada: ${email} [Plano: ${planType}]`, 'ok');
    }
  } else {
    // Conta NÃO é Proprietária de Plano Business (ex: Plus ou Free)
    // NUNCA pode ser definida como DB.owner!
    if (!DB.queue) DB.queue = [];
    if (!DB.queue.includes(connKey) && email !== DB.owner?.email) {
      DB.queue.push(connKey);
    }
    lg(`Conta conectada com sucesso: ${email} [Plano: ${planType}]`, 'ok');
    if (!DB.owner) {
      lg(`Dica: A conta ${email} foi registrada na fila. Para ativar o gerenciamento do workspace Business, conecte uma conta com plano Business/Team proprietária do workspace.`, 'info');
    }
  }

  stopLoginPoller();
  _loginTabId = null;
  DB._loginPending = false;
  DB._loginType = null;
  DB._loginPendingDesde = null;
  await save();
  updateBadge();

  if (closeTabId != null) {
    try { await chrome.tabs.remove(closeTabId); } catch {}
  }

  // Notifica popup e abas abertas
  try {
    chrome.runtime.sendMessage({
      type: 'ACCOUNT_ADDED',
      email,
      planType,
      workspaceName,
      key: connKey,
    }).catch(() => {});
  } catch {}

  return true;
}

// Tentativa de inspeção da aba de login
async function attemptCapture(tabId, loginType = 'member') {
  try {
    let sessionData = null;
    let accountsCheck = null;
    let initialUsage = null;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          let s = null, a = null, u = null;
          try {
            const r1 = await fetch('/api/auth/session', { credentials: 'include' });
            if (r1.ok) s = await r1.json();
          } catch {}

          if (s?.accessToken) {
            const headers = { Accept: 'application/json', Authorization: 'Bearer ' + s.accessToken };
            try {
              const r2 = await fetch('/backend-api/accounts/check/v4-2023-04-27', { credentials: 'include', headers });
              if (r2.ok) a = await r2.json();
            } catch {}

            try {
              const r3 = await fetch('/backend-api/wham/usage', { credentials: 'include', headers });
              if (r3.ok) u = await r3.json();
            } catch {}
          }
          return { session: s, accountsCheck: a, usage: u };
        },
      });

      const res = results?.[0]?.result;
      sessionData = res?.session;
      accountsCheck = res?.accountsCheck;
      initialUsage = res?.usage;
    } catch {}

    if (!sessionData?.accessToken || !sessionData?.user?.email) {
      return false;
    }

    const cookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
    const authCookies = cookies.filter(c => isAuthCookie(c.name));

    return await saveAccountRecord({
      sessionData,
      accountsCheck,
      initialUsage,
      authCookies,
      loginType,
      closeTabId: tabId,
    });
  } catch (err) {
    console.warn('[SeatOrbit] Erro em attemptCapture:', err);
    return false;
  }
}

// Início de login guiado
async function startLogin(type = 'member') {
  if (_loginTabId != null) {
    try {
      await chrome.tabs.update(_loginTabId, { active: true });
      return { ok: true, status: 'already_open', message: 'Guia de login já aberta.' };
    } catch {
      _loginTabId = null;
    }
  }

  stopLoginPoller();

  // Backup seguro dos cookies ativos no registro da conta atual no DB
  const currentCookies = await getBrowserAuthCookies();
  if (currentCookies.length) {
    const activeConn = Object.values(DB.connections).find(c => c.isActive);
    if (activeConn) {
      activeConn.sessionCookies = currentCookies.map((ck) => ({
        name: ck.name,
        value: ck.value,
        domain: ck.domain,
        path: ck.path,
        secure: ck.secure,
        httpOnly: ck.httpOnly,
        sameSite: ck.sameSite,
        expirationDate: ck.expirationDate,
      }));
    }
    await save();
  }

  // Sempre limpa cookies de autenticação do navegador (após salvá-los no DB acima)
  // para que o ChatGPT apresente a tela de login, permitindo conectar qualquer nova conta
  await clearBrowserAuthCookies();

  const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/auth/login', active: true });
  _loginTabId = tab.id;
  DB._loginPending = true;
  DB._loginType = type;
  DB._loginPendingDesde = Date.now();
  await save();

  // Inicia Poller Inteligente de Detecção de Sessão (roda a cada 1.5s por até 3 minutos)
  const startTime = Date.now();
  _loginPollerInterval = setInterval(async () => {
    if (Date.now() - startTime > 180000) {
      stopLoginPoller();
      DB._loginPending = false;
      DB._loginType = null;
      DB._loginPendingDesde = null;
      await save();
      lg('Login cancelado por tempo limite (3 min)', 'warn');
      return;
    }

    if (_loginTabId == null) {
      stopLoginPoller();
      return;
    }

    try {
      const currentTab = await chrome.tabs.get(_loginTabId).catch(() => null);
      if (!currentTab) {
        stopLoginPoller();
        _loginTabId = null;
        DB._loginPending = false;
        await save();
        return;
      }

      if (!currentTab.url || !currentTab.url.startsWith('https://chatgpt.com/') || currentTab.url.includes('/auth/')) {
        return;
      }

      const success = await attemptCapture(_loginTabId, DB._loginType || type);
      if (success) {
        stopLoginPoller();
      }
    } catch {}
  }, 1500);

  return { ok: true, status: 'login_opened', type };
}

// Captura instantânea da aba ativa aberta no ChatGPT (1-clique)
async function captureActiveTab(asOwner = false) {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
    if (!tabs || tabs.length === 0) {
      return {
        ok: false,
        title: 'Nenhuma guia aberta',
        error: 'Abra o site chatgpt.com e faça login, ou use a opção Login Guiado.',
      };
    }

    const activeTab = tabs.find(t => t.active) || tabs[0];
    const tabId = activeTab.id;

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        let s = null, a = null, u = null;
        try {
          const r1 = await fetch('/api/auth/session', { credentials: 'include' });
          if (r1.ok) s = await r1.json();
        } catch {}

        if (s?.accessToken) {
          const headers = { Accept: 'application/json', Authorization: 'Bearer ' + s.accessToken };
          try {
            const r2 = await fetch('/backend-api/accounts/check/v4-2023-04-27', { credentials: 'include', headers });
            if (r2.ok) a = await r2.json();
          } catch {}

          try {
            const r3 = await fetch('/backend-api/wham/usage', { credentials: 'include', headers });
            if (r3.ok) u = await r3.json();
          } catch {}
        }
        return { session: s, accountsCheck: a, usage: u };
      },
    });

    const res = results?.[0]?.result;
    if (!res?.session?.accessToken || !res?.session?.user?.email) {
      return {
        ok: false,
        title: 'Guia sem login ativo',
        error: 'Você não está logado no ChatGPT nesta janela. Entre na conta ou use o Login Guiado.',
      };
    }

    const cookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
    const authCookies = cookies.filter(c => isAuthCookie(c.name));

    const saved = await saveAccountRecord({
      sessionData: res.session,
      accountsCheck: res.accountsCheck,
      initialUsage: res.usage,
      authCookies,
      loginType: (asOwner || !DB.owner) ? 'owner' : 'member',
      closeTabId: null, // Não fecha a aba ativa do usuário
    });

    if (saved) {
      return {
        ok: true,
        email: res.session.user.email,
        planType: res.usage?.plan_type || 'Personal',
        db: DB,
      };
    }
    return { ok: false, error: 'Falha ao registrar conta.' };
  } catch (err) {
    return { ok: false, error: 'Erro ao capturar aba ativa: ' + err.message };
  }
}

// Adição de conta por Session Token ou Access Token diretamente (Estilo XRouter)
async function addAccountByToken(rawToken, asOwner = false) {
  const token = (rawToken || '').trim();
  if (!token) return { ok: false, error: 'Token não informado.' };

  try {
    let accessToken = null;
    let sessionToken = null;

    if (token.split('.').length === 3) {
      accessToken = token;
    } else {
      sessionToken = token;
    }

    let sessionData = null;
    let accountsCheck = null;
    let initialUsage = null;

    if (accessToken) {
      const headers = { Accept: 'application/json', Authorization: 'Bearer ' + accessToken };
      try {
        accountsCheck = await fetch('https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27', { headers }).then(r => r.ok ? r.json() : null);
      } catch {}
      try {
        initialUsage = await fetch('https://chatgpt.com/backend-api/wham/usage', { headers }).then(r => r.ok ? r.json() : null);
      } catch {}

      const jwtPayload = parseJwt(accessToken);
      const email = jwtPayload?.email || jwtPayload?.['https://api.openai.com/profile']?.email || jwtPayload?.sub;
      if (!email) {
        return { ok: false, error: 'Token inválido ou expirado. Não foi possível extrair a identidade.' };
      }

      sessionData = {
        accessToken,
        user: {
          email,
          name: jwtPayload?.name || email.split('@')[0],
          image: jwtPayload?.picture || null,
        },
      };
    } else if (sessionToken) {
      const tempCookie = {
        name: '__Secure-next-auth.session-token',
        value: sessionToken,
        domain: 'chatgpt.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
      };
      await setAuthCookies([tempCookie]);
      const r = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
      if (!r.ok) {
        return { ok: false, error: 'Token de sessão inválido ou expirado no ChatGPT.' };
      }
      sessionData = await r.json();
      if (!sessionData?.accessToken || !sessionData?.user?.email) {
        return { ok: false, error: 'Não foi possível validar uma sessão com este token.' };
      }
      accessToken = sessionData.accessToken;
      const headers = { Accept: 'application/json', Authorization: 'Bearer ' + accessToken };
      try {
        accountsCheck = await fetch('https://chatgpt.com/backend-api/accounts/check/v4-2023-04-27', { headers }).then(res => res.ok ? res.json() : null);
      } catch {}
      try {
        initialUsage = await fetch('https://chatgpt.com/backend-api/wham/usage', { headers }).then(res => res.ok ? res.json() : null);
      } catch {}
    }

    const cookies = await chrome.cookies.getAll({ domain: 'chatgpt.com' });
    const authCookies = cookies.filter(c => isAuthCookie(c.name));

    const saved = await saveAccountRecord({
      sessionData,
      accountsCheck,
      initialUsage,
      authCookies,
      loginType: (asOwner || !DB.owner) ? 'owner' : 'member',
      closeTabId: null,
    });

    if (saved) {
      return {
        ok: true,
        email: sessionData.user.email,
        planType: initialUsage?.plan_type || 'Personal',
        db: DB,
      };
    }
    return { ok: false, error: 'Falha ao salvar conta via token.' };
  } catch (err) {
    return { ok: false, error: 'Erro ao validar token: ' + err.message };
  }
}

// Alternar conta ativa no navegador
async function switchAccount(key) {
  const conn = DB.connections[key];
  if (!conn) return { ok: false, error: 'Conta não encontrada' };

  return await withSessionLock(async () => {
    try {
      // 1. Salva os cookies da conta que estava ativa anteriormente
      const currentCookies = await getBrowserAuthCookies();
      const prevActive = Object.values(DB.connections).find(c => c.isActive && c.key !== key);
      if (prevActive && currentCookies.length) {
        prevActive.sessionCookies = currentCookies.map(c => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          sameSite: c.sameSite,
          expirationDate: c.expirationDate,
        }));
      }

      // 2. Marca a nova conta como ativa
      for (const c of Object.values(DB.connections)) {
        c.isActive = (c.key === key);
      }

      // 3. Limpa cookies de autenticação do navegador e injeta os da nova conta
      await clearBrowserAuthCookies();
      if (conn.sessionCookies && conn.sessionCookies.length) {
        await setAuthCookies(conn.sessionCookies);
      } else if (conn.sessionToken) {
        await setAuthCookies([{
          name: '__Secure-next-auth.session-token',
          value: conn.sessionToken,
          domain: 'chatgpt.com',
          path: '/',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
        }]);
      }

      // 4. Renova imediatamente a sessão do ChatGPT com os novos cookies injetados
      try {
        const r = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
        if (r.ok) {
          const sess = await r.json();
          if (sess?.accessToken) {
            conn.accessToken = sess.accessToken;
            conn.lastRefresh = Date.now();
            conn.lastError = null;
            const fresh = await getBrowserAuthCookies();
            if (fresh.length) {
              conn.sessionCookies = fresh.map(c => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                secure: c.secure,
                httpOnly: c.httpOnly,
                sameSite: c.sameSite,
                expirationDate: c.expirationDate,
              }));
            }
          }
        }
      } catch {}

      // 5. Recarrega as abas abertas do ChatGPT para aplicar a nova sessão
      const tabs = await chrome.tabs.query({ url: 'https://chatgpt.com/*' });
      for (const tab of tabs) {
        chrome.tabs.reload(tab.id).catch(() => {});
      }

      conn.lastRefresh = Date.now();
      await save();
      updateBadge();

      // 6. Atualiza os limites da conta recém-ativada em segundo plano
      pollSingle(key).catch(() => {});

      lg('Sessão ativada no navegador: ' + conn.email, 'ok');
      return { ok: true, email: conn.email };
    } catch (e) {
      lg('Falha ao ativar sessão de ' + conn.email + ': ' + e.message, 'error');
      return { ok: false, error: e.message };
    }
  });
}

// Requisições com token
async function apiFetch(url, token, accountId) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (accountId && accountId !== 'personal' && accountId !== 'default') {
    headers['ChatGPT-Account-Id'] = accountId;
  }
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const e = new Error('HTTP ' + r.status);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Normalização de limites
function normalizeUsage(raw) {
  const rl = raw?.rate_limit || {};
  const windows = [];

  const pushW = (w, slot) => {
    if (!w) return;
    const secs = w.limit_window_seconds ?? null;
    const used = Math.max(0, Number(w.used_percent) || 0);
    let resetAt = w.reset_at ? w.reset_at * 1000 : null;
    if (!resetAt && w.reset_after_seconds) resetAt = Date.now() + w.reset_after_seconds * 1000;

    let label = 'Janela Curta (5h)';
    if (secs === 18000) label = 'Janela Curta (5h)';
    else if (secs === 604800) label = 'Limite Semanal (7d)';
    else if (secs != null) {
      if (secs >= 86400) label = `Janela ${Math.round(secs / 86400)}d`;
      else if (secs >= 3600) label = `Janela ${Math.round(secs / 3600)}h`;
      else if (secs > 0) label = `Janela ${Math.round(secs / 60)}m`;
    }

    windows.push({
      id: slot,
      label,
      durationSecs: secs,
      usedPercent: used,
      resetAt,
      exhausted: used >= 100,
      isPrimary: slot === 'primary',
    });
  };

  pushW(rl.primary_window, 'primary');
  pushW(rl.secondary_window, 'secondary');

  const extraCaps = (raw?.additional_rate_limits || [])
    .filter((c) => c?.primary_window)
    .map((c) => {
      const used = Math.max(0, Number(c.primary_window.used_percent) || 0);
      let resetAt = c.primary_window.reset_at ? c.primary_window.reset_at * 1000 : null;
      if (!resetAt && c.primary_window.reset_after_seconds) {
        resetAt = Date.now() + c.primary_window.reset_after_seconds * 1000;
      }
      return {
        id: c.id,
        title: c.title || c.id,
        usedPercent: used,
        resetAt,
        exhausted: used >= 100,
      };
    });

  return {
    plan: raw?.plan_type || null,
    allowed: rl.allowed !== false,
    limitReached: !!rl.limit_reached,
    exhausted: rl.allowed === false || rl.limit_reached || windows.some((w) => w.exhausted),
    windows,
    extraCaps,
    resetCredits: raw?.rate_limit_reset_credits?.available_count ?? null,
    credit: raw?.credits || null,
    fetchedAt: Date.now(),
  };
}

async function pollSingle(key) {
  const conn = DB.connections[key];
  if (!conn) return null;

  const wasExhausted = conn.quota?.exhausted === true;

  try {
    // 1. Se o token estiver expirado ou perto de expirar (120s), renova antes de consultar a API
    if (!conn.accessToken || isTokenExpired(conn.accessToken, 120)) {
      if (conn.isActive) {
        try {
          const r = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
          if (r.ok) {
            const sess = await r.json();
            if (sess?.accessToken) {
              conn.accessToken = sess.accessToken;
              conn.lastRefresh = Date.now();
              const freshCookies = await getBrowserAuthCookies();
              if (freshCookies.length) {
                conn.sessionCookies = freshCookies.map((c) => ({
                  name: c.name,
                  value: c.value,
                  domain: c.domain,
                  path: c.path,
                  secure: c.secure,
                  httpOnly: c.httpOnly,
                  sameSite: c.sameSite,
                  expirationDate: c.expirationDate,
                }));
              }
            }
          }
        } catch {}
      } else {
        await refreshInactiveAccountSession(conn);
      }
    }

    let data = null;
    if (conn.accessToken) {
      try {
        data = await apiFetch('https://chatgpt.com/backend-api/wham/usage', conn.accessToken, conn.accountId);
      } catch (e) {
        if (e.status === 401) {
          // Token foi rejeitado: tenta renovação forçada
          let refreshed = false;
          if (conn.isActive) {
            try {
              const r = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
              if (r.ok) {
                const sess = await r.json();
                if (sess?.accessToken) {
                  conn.accessToken = sess.accessToken;
                  conn.lastRefresh = Date.now();
                  refreshed = true;
                }
              }
            } catch {}
          } else {
            refreshed = await refreshInactiveAccountSession(conn);
          }

          if (refreshed && conn.accessToken) {
            data = await apiFetch('https://chatgpt.com/backend-api/wham/usage', conn.accessToken, conn.accountId);
          } else {
            // Em contas inativas, preserva a última cota válida sem marcar erro destrutivo na UI
            if (!conn.isActive && conn.quota) {
              conn.lastPolled = Date.now();
              return conn.quota;
            }
            throw e;
          }
        } else {
          throw e;
        }
      }
    }

    if (!data) return null;

    const q = normalizeUsage(data);
    conn.quota = q;
    if (q.plan && !isWorkspacePlan(conn.planType)) {
      conn.planType = q.plan;
      if (DB.owner?.email === conn.email) {
        DB.owner.planType = q.plan;
      }
    }
    conn.lastPolled = Date.now();
    conn.lastError = null;
    await save();
    updateBadge();

    if (wasExhausted && !q.exhausted) {
      lg('Limite recuperado: ' + conn.email + ' pronto para uso.', 'ok');
      if (DB.audio?.enabled !== false) {
        triggerSoundAlert('recovered');
      }
      chrome.notifications.create('recovered_' + conn.email, {
        type: 'basic',
        iconUrl: 'assets/icons/icon-48.png',
        title: 'SeatOrbit: Limite Recuperado',
        message: `${conn.email} recuperou o limite e está livre para uso.`,
      }).catch(() => {});

      try {
        chrome.runtime.sendMessage({
          type: 'TOAST_SHOW',
          kind: 'ok',
          title: 'Limite recuperado',
          body: conn.email.split('@')[0],
        }).catch(() => {});
      } catch {}
    }

    // Alerta de oportunidade de uso estratégico (reset próximo conforme configuração)
    if (DB.audio?.nearResetAlert !== false && q?.windows?.length) {
      const nearResetMins = Number(DB.audio?.nearResetMins) || 30;
      const thresholdMs = nearResetMins * 60 * 1000;
      const nearWin = q.windows.find(
        (w) => w.resetAt && (w.resetAt - Date.now()) > 0 && (w.resetAt - Date.now()) <= thresholdMs
      );
      if (nearWin && conn._lastNearAlertResetAt !== nearWin.resetAt) {
        conn._lastNearAlertResetAt = nearWin.resetAt;
        const minsLeft = Math.max(1, Math.round((nearWin.resetAt - Date.now()) / 60000));
        lg(
          `🔥 Oportunidade de Uso: A conta ${conn.email} reinicia em ${minsLeft}m. Ótimo momento para queimar a cota antes do reset!`,
          'ok'
        );
        if (DB.audio?.enabled !== false) {
          triggerSoundAlert('near_reset');
        }
        chrome.notifications
          .create('near_reset_' + conn.email, {
            type: 'basic',
            iconUrl: 'assets/icons/icon-48.png',
            title: 'SeatOrbit: Oportunidade de Uso',
            message: `A conta ${conn.email} reinicia em ${minsLeft}m. Aproveite para queimar as mensagens restantes!`,
          })
          .catch(() => {});
      }
    }

    return q;
  } catch (e) {
    if (e.status === 401 && !conn.isActive) {
      // Conta inativa com 401 temporário: não exibe badge destrutivo se ela tem cookies
      if (conn.sessionCookies?.length) {
        conn.lastError = null;
      } else {
        conn.lastError = 'Sessão requer reconexão';
      }
    } else {
      conn.lastError = e.message || 'Falha ao sincronizar limite';
    }
    conn.lastPolled = Date.now();
    await save();
  }
}

async function pollAll() {
  for (const key of Object.keys(DB.connections)) {
    await pollSingle(key);
  }
  updateBadge();
}

// Operações no Workspace
function getOwnerConn() {
  if (!DB.owner?.email) return null;
  return Object.values(DB.connections).find((c) => c.email === DB.owner.email && c.isActive) || null;
}

async function listMembers() {
  const o = getOwnerConn();
  if (!o || !o.accountId || o.accountId === 'personal' || o.accountId === 'default') {
    return null;
  }

  const doFetch = async (token) => {
    const j = await apiFetch('https://chatgpt.com/backend-api/accounts/' + o.accountId + '/users?offset=0&limit=100', token, o.accountId);
    return {
      accountId: o.accountId,
      members: (j?.items || []).map((u) => ({
        userId: u.id,
        email: (u.email || '').toLowerCase(),
        role: u.role,
      })),
    };
  };

  try {
    return await doFetch(o.accessToken);
  } catch (e) {
    if (e.status === 401 && o.isActive) {
      try {
        const r = await fetch('https://chatgpt.com/api/auth/session', { credentials: 'include' });
        if (r.ok) {
          const s = await r.json();
          if (s?.accessToken) {
            o.accessToken = s.accessToken;
            await save();
            return await doFetch(s.accessToken);
          }
        }
      } catch {}
    }
    throw e;
  }
}

async function removeUser(accountId, userId, token) {
  await fetch('https://chatgpt.com/backend-api/accounts/' + accountId + '/users/' + userId, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token, 'ChatGPT-Account-Id': accountId },
  });
}

async function inviteUser(accountId, email, token) {
  const r = await fetch('https://chatgpt.com/backend-api/accounts/' + accountId + '/invites', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'ChatGPT-Account-Id': accountId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_addresses: [email],
      role: 'standard-user',
      seat_type: 'usage_based',
      resend_emails: true,
    }),
  });
  const j = await r.json();
  return {
    sent: (j?.account_invites || []).map((i) => (i.email_address || '').toLowerCase()),
    errors: (j?.errored_emails || []).map((e) => ({ email: e.email_address, error: e.error })),
  };
}

// Ciclo de rotação
async function runCycle(forceManualSwitch = false) {
  lg('Iniciando ciclo de rotação');
  await pollAll();

  const allConns = Object.values(DB.connections).filter((c) => c && c.email);
  if (allConns.length === 0) {
    lg('Rotação interrompida: nenhuma conta cadastrada.', 'warn');
    return { ok: false, code: 'NO_ACCOUNTS', error: 'Nenhuma conta cadastrada' };
  }

  if (allConns.length === 1 && (DB.queue || []).length === 0) {
    lg('Rotação requer ao menos 2 contas para alternar.', 'warn');
    return { ok: false, code: 'SINGLE_ACCOUNT', error: 'Requer ao menos 2 contas' };
  }

  const o = getOwnerConn();

  // 1. Identifica a conta atualmente ativa no navegador
  const currentActive = allConns.find((c) => c.isActive) || allConns[0];

  // 2. Fila prioritária: DB.queue, depois outras contas cadastradas
  const queueKeys = (DB.queue || []).filter((k) => k !== currentActive?.key);
  const otherKeys = allConns.map((c) => c.key).filter((k) => k !== currentActive?.key);
  const candidateKeys = Array.from(new Set([...queueKeys, ...otherKeys]));

  if (candidateKeys.length === 0) {
    lg('Nenhuma outra conta configurada na fila.', 'warn');
    return { ok: false, code: 'EMPTY_QUEUE', error: 'Nenhuma conta na fila' };
  }

  // 3. Procura próxima conta com limite livre (<100% de uso)
  const availableKey = candidateKeys.find((key) => {
    const c = DB.connections[key];
    return c && (!c.quota || (!c.quota.exhausted && gaugeMax(c) < 100));
  });

  if (!availableKey) {
    lg('Todas as outras contas da fila estão esgotadas no momento.', 'warn');
    return { ok: false, code: 'ALL_EXHAUSTED', error: 'Todas as contas esgotadas' };
  }

  const nextConn = DB.connections[availableKey];

  // 4. Se for acionamento manual (Trocar Conta) OU se a conta atual estiver esgotada, executa a troca real
  const isCurrentExhausted = currentActive?.quota?.exhausted === true || gaugeMax(currentActive) >= 100;
  const shouldSwitch = forceManualSwitch || isCurrentExhausted;

  let switched = false;
  if (shouldSwitch && nextConn) {
    const swRes = await switchAccount(availableKey);
    if (swRes?.ok) {
      switched = true;
      allConns.forEach((c) => { c.isActive = (c.key === availableKey); });
      await save();
      lg('Rotação realizada: ' + nextConn.email + ' ativada no navegador.', 'ok');
    }
  }

  // 5. Se houver integração remota de workspace (Business/Enterprise com API de membros)
  let ws = null;
  if (o) {
    try {
      ws = await listMembers();
    } catch (e) {
      lg('Aviso ao consultar membros do workspace: ' + e.message, 'warn');
    }
  }

  if (ws && o) {
    if (DB.automations.autoRemove) {
      const outsiders = ws.members.filter((m) => m.email !== DB.owner.email);
      for (const m of outsiders) {
        const conn = Object.values(DB.connections).find(c => c.email === m.email);
        if (conn?.quota?.exhausted || gaugeMax(conn) >= 100) {
          try {
            await removeUser(ws.accountId, m.userId, o.accessToken);
            lg('Vaga liberada: ' + m.email + ' atingiu o limite.', 'ok');
          } catch (e) {
            lg('Falha ao remover ' + m.email + ': ' + e.message, 'error');
          }
        }
      }
    }

    if (DB.automations.autoInvite && nextConn) {
      let fresh;
      try { fresh = await listMembers(); } catch { fresh = ws; }
      const nonOwner = fresh?.members?.filter((m) => m.email !== DB.owner.email) || [];
      if (nonOwner.length === 0) {
        try {
          const r = await inviteUser(ws.accountId, nextConn.email, o.accessToken);
          if (r.sent.length) {
            lg('Vaga preenchida: convite enviado para ' + nextConn.email, 'ok');
          }
        } catch (e) {
          lg('Aviso ao convidar membro: ' + e.message, 'warn');
        }
      }
    }
  }

  if (switched) {
    lg('Ciclo de rotação concluído com troca de conta.');
    return {
      ok: true,
      switched: true,
      code: 'SWITCHED',
      email: nextConn.email,
      message: 'Conta trocada',
    };
  }

  lg('Ciclo de rotação concluído.');
  return {
    ok: true,
    switched: false,
    code: 'CHECKED',
    message: 'Limites verificados. Conta atual dentro do limite.',
  };
}

// Badge da extensão: reflete sempre a conta ativa em uso no navegador
function updateBadge() {
  const conns = Object.values(DB.connections || {});
  const active = conns.find((c) => c.isActive)
    || conns.find((c) => DB.owner && c.email?.toLowerCase() === DB.owner.email?.toLowerCase())
    || conns[0]
    || null;

  if (!active) {
    chrome.action.setBadgeText({ text: '' });
    if (chrome.action?.setTitle) {
      chrome.action.setTitle({ title: 'SeatOrbit: Nenhuma conta conectada' });
    }
    return;
  }

  const g = gaugeMax(active);
  const pct = Math.round(g);
  const isExh = active.quota?.exhausted === true || g >= 100;

  let text = pct + '%';
  let color = pct >= 85 ? '#f43f5e' : pct >= 50 ? '#f59e0b' : '#10b981';

  if (isExh) {
    text = '100%';
    color = '#f43f5e';
  }

  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeTextColor({ color: '#fff' });

  if (chrome.action?.setTitle) {
    const shortName = active.userName ? active.userName.split(' ')[0] : active.email.split('@')[0];
    chrome.action.setTitle({
      title: `SeatOrbit: ${shortName} (${active.email})\nCota em uso: ${isExh ? 'Limite atingido (100%)' : `${pct}% consumido`}`,
    });
  }
}

function gaugeMax(conn) {
  const w = conn?.quota?.windows;
  if (!w?.length) return 0;
  return Math.max(...w.map((x) => x.usedPercent ?? 0));
}

// Alertas sonoros via Offscreen Document
let _creatingOffscreen = null;
async function ensureOffscreenDocument() {
  if (chrome.offscreen?.hasDocument) {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (hasDoc) return true;
  } else if (chrome.runtime?.getContexts) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }).catch(() => []);
    if (contexts && contexts.length > 0) return true;
  }

  if (_creatingOffscreen) {
    await _creatingOffscreen;
    return true;
  }

  _creatingOffscreen = chrome.offscreen.createDocument({
    url: 'src/offscreen/offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Reproduzir alertas sonoros do SeatOrbit',
  });

  try {
    await _creatingOffscreen;
  } catch (err) {
    if (!err?.message?.includes('Only a single offscreen document')) {
      console.warn('[SeatOrbit] Erro ao criar offscreen doc:', err);
    }
  } finally {
    _creatingOffscreen = null;
  }
  return true;
}

async function triggerSoundAlert(reason = 'recovered') {
  if (DB.audio?.enabled === false) return;
  try {
    await ensureOffscreenDocument();
    await new Promise(r => setTimeout(r, 100));
    const volume = typeof DB.audio?.volume === 'number'
      ? Math.max(0, Math.min(1, DB.audio.volume))
      : 0.75;

    let preset = (reason === 'near_reset')
      ? (DB.audio?.nearPreset || 'pulse')
      : (DB.audio?.preset || 'chime');

    let customBase64 = null;
    if (preset.startsWith('custom_') || preset === 'custom') {
      const audId = preset.replace('custom_', '');
      const item = (DB.audio?.customAudios || []).find(a => a.id === audId || a.id === preset);
      customBase64 = item?.base64 || (reason === 'near_reset' ? DB.audio?.customNearBase64 : DB.audio?.customBase64) || null;
    }

    chrome.runtime.sendMessage({
      type: '_PLAY_SOUND',
      reason,
      preset,
      customBase64,
      volume,
    }).catch(() => {});
  } catch (e) {
    console.warn('[SeatOrbit] Falha ao disparar som:', e);
  }
}

// Definir conta conectada como Owner (Apenas permitido se for Proprietário com plano Business/Team)
async function setAsOwner(email) {
  const emailLower = (email || '').trim().toLowerCase();
  const conn = Object.values(DB.connections).find((c) => c.email === emailLower);
  if (!conn) return { ok: false, error: 'Conta não encontrada' };

  if (!isBusinessOwner(conn)) {
    return {
      ok: false,
      error: `A conta ${conn.email} possui plano ${conn.planType || 'Personal'}. Apenas contas com plano Business ou Team e função de Proprietário podem ser a Conta Principal do Workspace.`
    };
  }

  const prevOwner = DB.owner;
  DB.owner = {
    email: conn.email,
    accountId: conn.accountId || 'personal',
    workspaceName: conn.workspaceName || 'Workspace de ' + conn.email.split('@')[0],
    planType: conn.planType || 'Business',
    userName: conn.userName || conn.email,
    userImage: conn.userImage || null,
    verified: true,
    isOwner: true,
    connectedAt: Date.now(),
  };

  if (prevOwner?.email && prevOwner.email !== emailLower) {
    const prevKey = Object.keys(DB.connections).find(k => k.startsWith(prevOwner.email + '__'));
    if (prevKey && !DB.queue.includes(prevKey)) {
      DB.queue.push(prevKey);
    }
  }

  DB.queue = DB.queue.filter((k) => !k.startsWith(emailLower + '__'));
  await save();
  lg('Proprietário do Workspace atualizado para ' + emailLower, 'ok');
  return { ok: true, owner: DB.owner };
}

// Mensagens
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  (async () => {
    await load();
    switch (msg.type) {
      case 'LOGIN_OWNER':
        respond(await startLogin('owner')); return;
      case 'ADD_ACCOUNT':
        respond(await startLogin('member')); return;
      case 'CAPTURE_ACTIVE_TAB':
        respond(await captureActiveTab(msg.asOwner === true)); return;
      case 'ADD_ACCOUNT_BY_TOKEN':
        respond(await addAccountByToken(msg.token, msg.asOwner === true)); return;
      case 'SAVE_CAPTURED_ACCOUNT':
        respond(await saveAccountRecord(msg.payload || {})); return;
      case 'GET_DB':
        if (DB._loginPending) {
          if (_loginTabId != null) {
            const tab = await chrome.tabs.get(_loginTabId).catch(() => null);
            if (!tab) {
              stopLoginPoller();
              _loginTabId = null;
              DB._loginPending = false;
              DB._loginType = null;
              DB._loginPendingDesde = null;
              await save();
            }
          } else if (!DB._loginPendingDesde || (Date.now() - DB._loginPendingDesde > 60000)) {
            stopLoginPoller();
            _loginTabId = null;
            DB._loginPending = false;
            DB._loginType = null;
            DB._loginPendingDesde = null;
            await save();
          }
        }
        respond({ db: DB }); return;
      case 'CANCEL_LOGIN':
        stopLoginPoller();
        _loginTabId = null;
        DB._loginPending = false;
        DB._loginType = null;
        DB._loginPendingDesde = null;
        await save();
        respond({ ok: true, db: DB }); return;
      case 'SWITCH_ACCOUNT':
        respond(await switchAccount(msg.key)); return;
      case 'SET_AS_OWNER':
        respond(await setAsOwner(msg.email)); return;
      case 'DISCONNECT_OWNER':
        DB.owner = null;
        await save();
        lg('Proprietário desconectado', 'info');
        respond({ ok: true }); return;
      case 'SET_AUDIO_CONFIG':
        DB.audio = { ...DB.audio, ...(msg.config || {}) };
        await save();
        respond({ ok: true, audio: DB.audio }); return;
      case 'TEST_SOUND':
        await triggerSoundAlert('test');
        respond({ ok: true }); return;
      case 'QUEUE_REORDER': {
        const i = DB.queue.indexOf(msg.key);
        const j = msg.dir === 'up' ? i - 1 : i + 1;
        if (i >= 0 && j >= 0 && j < DB.queue.length) {
          [DB.queue[i], DB.queue[j]] = [DB.queue[j], DB.queue[i]];
        }
        await save(); respond({ ok: true }); return;
      }
      case 'QUEUE_SET_ORDER': {
        if (Array.isArray(msg.queue)) {
          const validKeys = new Set(DB.queue);
          const newQueue = msg.queue.filter(k => validKeys.has(k) && DB.connections[k]);
          for (const k of DB.queue) {
            if (!newQueue.includes(k) && DB.connections[k]) newQueue.push(k);
          }
          DB.queue = newQueue;
          await save();
        }
        respond({ ok: true, queue: DB.queue }); return;
      }
      case 'REMOVE_CONNECTION':
        delete DB.connections[msg.key];
        DB.queue = DB.queue.filter((k) => k !== msg.key);
        if (DB.owner?.email === msg.key.split('__')[0]) {
          DB.owner = null;
        }
        await save(); updateBadge(); respond({ ok: true }); return;
      case 'POLL':
        await pollAll(); respond({ ok: true, db: DB }); return;
      case 'RUN_CYCLE': {
        const res = await runCycle(msg.manual === true || msg.force === true);
        respond({
          ok: res?.ok ?? true,
          switched: res?.switched ?? false,
          code: res?.code,
          email: res?.email,
          error: res?.error,
          message: res?.message,
          db: DB,
        });
        return;
      }
      case 'SET_AUTOMATION':
        Object.assign(DB.automations, msg.patch || {});
        await save(); respond({ ok: true }); return;
      case 'CLEAR_LOG':
        DB.log = []; await save(); respond({ ok: true }); return;
      case 'EXPORT_DATA': {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const yyyy = now.getFullYear();
        const mm = pad(now.getMonth() + 1);
        const dd = pad(now.getDate());
        const hh = pad(now.getHours());
        const min = pad(now.getMinutes());
        const filename = `seatorbit-backup_${yyyy}-${mm}-${dd}_${hh}h${min}.json`;

        const payload = {
          version: '7.2.0',
          app: 'SeatOrbit',
          exportedAt: now.toISOString(),
          owner: DB.owner,
          connections: DB.connections,
          queue: DB.queue,
          automations: DB.automations,
          audio: DB.audio,
        };
        const json = JSON.stringify(payload, null, 2);
        const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        try {
          await chrome.downloads.download({ url, filename, saveAs: true });
          lg('Backup exportado com sucesso: ' + filename, 'ok');
          respond({ ok: true, filename });
        } catch {
          respond({ ok: false, error: 'Falha no download' });
        }
        return;
      }
      case 'IMPORT_DATA': {
        try {
          const data = JSON.parse(msg.jsonText);
          if (!data.connections || typeof data.connections !== 'object') {
            respond({ ok: false, error: 'Formato inválido' });
            return;
          }
          let added = 0;
          for (const k of Object.keys(data.connections)) {
            DB.connections[k] = data.connections[k];
            added++;
          }
          if (Array.isArray(data.queue)) {
            for (const k of data.queue) {
              if (DB.connections[k] && !DB.queue.includes(k)) DB.queue.push(k);
            }
          }
          if (data.owner) DB.owner = data.owner;
          if (data.automations) DB.automations = { ...DB.automations, ...data.automations };
          if (data.audio) DB.audio = { ...DB.audio, ...data.audio };
          await save();
          lg('Importado: ' + added + ' conta(s)', 'ok');
          respond({ ok: true, count: added });
        } catch (e) {
          respond({ ok: false, error: 'JSON inválido' });
        }
        return;
      }
      case 'RESET':
        DB = {
          owner: null,
          connections: {},
          queue: [],
          automations: {
            running: false,
            autoRemove: true,
            autoInvite: true,
            cycleMs: 180000,
            proactiveKeepAlive: true,
          },
          audio: {
            enabled: true,
            preset: 'chime',
            nearResetAlert: true,
            nearResetMins: 30,
            nearPreset: 'pulse',
            customAudios: [],
            volume: 0.75,
          },
          log: [],
          _loginPending: false,
          _loginType: null,
          _loginPendingDesde: null,
          meta: { createdAt: Date.now(), version: '7.2.0', name: 'SeatOrbit' },
        };
        _loginTabId = null;
        await save();
        updateBadge();
        respond({ ok: true }); return;
      case 'TOAST_SHOW':
        respond({ ok: true }); return;
      case 'TAB_USAGE_UPDATE': {
        const raw = msg.usage;
        if (raw) {
          const q = normalizeUsage(raw);
          const userEmail = (raw.email || '').toLowerCase();
          const target = Object.values(DB.connections).find((c) =>
            (userEmail && c.email.toLowerCase() === userEmail) || c.isActive
          );
          if (target) {
            target.quota = q;
            if (q.plan) {
              target.planType = q.plan;
              if (DB.owner?.email === target.email) {
                DB.owner.planType = q.plan;
              }
            }
            target.lastPolled = Date.now();
            target.lastError = null;
            await save();
            updateBadge();
          }
        }
        respond({ ok: true }); return;
      }
      default:
        respond({ ok: false });
    }
  })();
  return true;
});

// Alarmes periódicos
chrome.alarms.create('poll', { periodInMinutes: 2 });
chrome.alarms.create('cycle', { periodInMinutes: 3 });
chrome.alarms.create('keepAlive', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  await load();
  if (alarm.name === 'poll') await pollAll();
  if (alarm.name === 'cycle' && DB.automations.running) await runCycle();
  if (alarm.name === 'keepAlive' && DB.automations.proactiveKeepAlive !== false) {
    await runProactiveKeepAlive();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await load();
  updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await load();
  updateBadge();
});

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('recovered_')) {
    chrome.action.openPopup().catch(() => {});
  }
});

/**
 * ============================================================================
 * Fim do arquivo - SeatOrbit Background Service Worker
 * Desenvolvido por: @OTheMandaloriano (https://github.com/OTheMandaloriano)
 * ============================================================================
 */
