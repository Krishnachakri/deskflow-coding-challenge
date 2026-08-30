let currentUser = null;
let authToken = localStorage.getItem('deskflow_token');
let activeTicketId = null;
let liveSlaTimer = null;
let activeTicketsCache = [];

let currentTheme = localStorage.getItem('deskflow_theme') || 'light';

// Initialize application on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  if (authToken) {
    const valid = await checkSession();
    if (!valid) {
      showLoginModal();
      return;
    }
  } else {
    showLoginModal();
    return;
  }

  await initApp();
});

function initTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeButtonUI();
}

function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  localStorage.setItem('deskflow_theme', currentTheme);
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeButtonUI();
}

function updateThemeButtonUI() {
  const iconEl = document.getElementById('themeIcon');
  if (iconEl) {
    if (currentTheme === 'dark') {
      iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    } else {
      iconEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
    }
  }
}

function toggleSidebarSection(containerId, arrowId) {
  const container = document.getElementById(containerId);
  const arrow = document.getElementById(arrowId);
  if (container) {
    container.classList.toggle('collapsed');
    if (arrow) {
      arrow.innerText = container.classList.contains('collapsed') ? '▸' : '▾';
    }
  }
}

async function checkSession() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      currentUser = data.user;
      return true;
    }
  } catch (e) {}
  authToken = null;
  localStorage.removeItem('deskflow_token');
  return false;
}

function showLoginModal() {
  document.getElementById('loginModal').classList.remove('hidden');
}

function hideLoginModal() {
  document.getElementById('loginModal').classList.add('hidden');
}

async function quickLogin(demoUserId) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ demoUserId })
  });
  if (res.ok) {
    const data = await res.json();
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('deskflow_token', authToken);
    hideLoginModal();
    await initApp();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });

  const data = await res.json();
  if (res.ok) {
    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('deskflow_token', authToken);
    hideLoginModal();
    await initApp();
  } else {
    alert(data.error || 'Login failed.');
  }
}

async function handleLogout() {
  if (authToken) {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
  }
  authToken = null;
  currentUser = null;
  localStorage.removeItem('deskflow_token');
  showLoginModal();
}

// Main App Initialization
async function initApp() {
  const notifEl = document.getElementById('notifDropdown');
  if (notifEl) notifEl.classList.add('hidden');

  updateUserProfileDisplay();
  await updateSimTime();
  startContinuousSlaClock();

  if (currentUser.role === 'CUSTOMER' || currentUser.role === 'AGENT') {
    navigateSidebar('queue', 'ALL');
  } else {
    navigateSidebar('dashboard');
  }

  await refreshAll();
}

function updateUserProfileDisplay() {
  document.getElementById('sbUserName').innerText = currentUser.name;
  document.getElementById('sbUserRole').innerText = currentUser.role;

  const isManager = currentUser.role === 'MANAGER';
  const isCustomer = currentUser.role === 'CUSTOMER';

  document.getElementById('sbManagerSection').classList.toggle('hidden', !isManager);
  document.getElementById('sbDashboard').classList.toggle('hidden', isCustomer);
  document.getElementById('workloadSection').classList.toggle('hidden', !isManager);
}

// Sidebar Navigation Handler
function navigateSidebar(tabName, filterVal) {
  closeModal();
  document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('active'));

  const isCustomer = currentUser.role === 'CUSTOMER';
  const isManager = currentUser.role === 'MANAGER';

  document.getElementById('managerDashboardSection').classList.toggle('hidden', tabName !== 'dashboard' || isCustomer);
  document.getElementById('workloadSection').classList.toggle('hidden', tabName !== 'dashboard' || !isManager);
  document.getElementById('createTicketSection').classList.toggle('hidden', tabName !== 'create');
  document.getElementById('ticketQueueSection').classList.toggle('hidden', tabName !== 'queue' && tabName !== 'dashboard');
  document.getElementById('rulesSection').classList.toggle('hidden', tabName !== 'rules' || !isManager);
  document.getElementById('slaConfigSection').classList.toggle('hidden', tabName !== 'sLaconfig' || !isManager);

  // Set active button
  if (tabName === 'dashboard') {
    const sbDash = document.getElementById('sbDashboard');
    if (sbDash && !isCustomer) sbDash.classList.add('active');
  }
  if (tabName === 'create') document.getElementById('sbCreate').classList.add('active');
  if (tabName === 'rules') document.getElementById('sbRules').classList.add('active');
  if (tabName === 'sLaconfig') document.getElementById('sbSlaConfig').classList.add('active');

  if (tabName === 'queue' || tabName === 'dashboard') {
    const filterSelect = document.getElementById('ticketFilterSelect');
    if (filterVal) {
      filterSelect.value = filterVal;
    }
    const btnIdMap = {
      'ALL': 'sbIncAll',
      'NEW': 'sbIncNew',
      'IN_PROGRESS': 'sbIncInProgress',
      'PENDING_CUSTOMER': 'sbIncPending',
      'RESOLVED': 'sbIncResolved',
      'CLOSED': 'sbIncClosed',
      'AT_RISK': 'sbIncAtRisk',
      'OVERDUE': 'sbIncOverdue',
      'ESCALATED': 'sbIncEscalated',
      'APPROVALS': 'sbIncApprovals'
    };
    const activeBtnId = btnIdMap[filterSelect.value];
    if (activeBtnId && tabName === 'queue') {
      const btn = document.getElementById(activeBtnId);
      if (btn) btn.classList.add('active');
    }
    loadTickets();
  }

  document.getElementById('mainHeaderTitle').innerText = isCustomer
    ? 'Customer Incident Portal'
    : isManager
    ? 'Manager Operations Console'
    : `Agent Support Workspace (${currentUser.name})`;
}

function navigateCategory(category) {
  navigateSidebar('queue');
  loadTicketsByCategory(category);
}

// Actionable Dashboard Card Click Filter
function filterQueueByMetric(filterType) {
  navigateSidebar('queue', filterType);
}

// Global Data Refresh
async function refreshAll() {
  await loadHolidays();
  await updateSimTime();
  if (currentUser && currentUser.role !== 'CUSTOMER') {
    await loadMetrics();
  }
  if (currentUser && currentUser.role === 'MANAGER') {
    await loadRules();
    await loadWorkload();
    await loadSlaConfig();
  }
  await loadNotifications();
  await loadTickets();
}

// Time Simulation Functions
async function updateSimTime() {
  const el = document.getElementById('simTimeDisplay');
  if (!el) return;
  try {
    const res = await fetch('/api/system-config');
    const config = await res.json();
    const dateObj = new Date(config.simulatedTime);
    el.innerText = `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (+${config.offsetHours}h)`;
  } catch (e) {}
}

async function fastForwardTime(hours) {
  await fetch('/api/system-config/fast-forward', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ hours })
  });
  await refreshAll();
}

async function resetTime() {
  await fetch('/api/system-config/reset-time', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  await refreshAll();
}

// Manager SLA Configuration
async function loadSlaConfig() {
  const res = await fetch('/api/system-config');
  const config = await res.json();
  document.getElementById('slaResponseHours').value = config.slaResponseHours || 4;
  document.getElementById('slaResolutionHours').value = config.slaResolutionHours || 16;
  document.getElementById('slaAtRiskMins').value = config.slaAtRiskMins || 60;
  document.getElementById('slaBizStart').value = config.slaBizStart || 9;
  document.getElementById('slaBizEnd').value = config.slaBizEnd || 17;
}

async function handleSaveSlaConfig(event) {
  event.preventDefault();
  const responseHours = document.getElementById('slaResponseHours').value;
  const resolutionHours = document.getElementById('slaResolutionHours').value;
  const atRiskMins = document.getElementById('slaAtRiskMins').value;
  const bizStart = document.getElementById('slaBizStart').value;
  const bizEnd = document.getElementById('slaBizEnd').value;

  const res = await fetch('/api/system-config/sla', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ responseHours, resolutionHours, atRiskMins, bizStart, bizEnd })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to update SLA configuration.');
    return;
  }

  alert('SLA Policy Configuration updated successfully!');
  await refreshAll();
}

let activeHolidaysCache = [];
let modalSlaTimer = null;

async function loadHolidays() {
  try {
    const res = await fetch('/api/holidays');
    if (res.ok) {
      activeHolidaysCache = await res.json();
    }
  } catch (e) {}
}

function isCurrentBrowserWorkingTime() {
  const now = new Date();
  const day = now.getDay();
  if (day === 0 || day === 6) return false; // Weekend (Sat/Sun)

  const hours = now.getHours();
  if (hours < 9 || hours >= 17) return false; // Off business hours (09:00-17:00)

  const dateStr = now.toISOString().split('T')[0];
  if (activeHolidaysCache.some(h => h.holiday_date === dateStr && (h.is_active === 1 || h.is_active === true))) {
    return false; // Active company holiday
  }

  return true;
}

// Minute-Only SLA Display Formatting (No Seconds Displayed)
function formatSlaMinutes(mins) {
  if (mins === null || mins === undefined || isNaN(mins)) return '--';

  if (mins <= 0) {
    const overdueMins = Math.abs(Math.floor(mins));
    return overdueMins === 0 ? 'Overdue' : `Overdue · ${overdueMins}m`;
  }

  const totalMins = Math.floor(mins);
  const hours = Math.floor(totalMins / 60);
  const remainingMins = totalMins % 60;

  if (hours >= 8) {
    const days = Math.floor(hours / 8);
    const remHours = hours % 8;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d ${remainingMins > 0 ? remainingMins + 'm' : ''}`.trim();
  }

  if (hours > 0) {
    return `${hours}h ${remainingMins < 10 ? '0' : ''}${remainingMins}m`;
  }

  return `${remainingMins}m`;
}

function startContinuousSlaClock() {
  if (liveSlaTimer) clearInterval(liveSlaTimer);
  liveSlaTimer = setInterval(() => {
    tickTableSlaClocks();
  }, 1000);
}

function tickTableSlaClocks() {
  const isWorking = isCurrentBrowserWorkingTime();
  document.querySelectorAll('.live-sla-clock').forEach(el => {
    let mins = parseFloat(el.getAttribute('data-mins-remaining'));
    if (isNaN(mins)) return;

    const isResponded = el.getAttribute('data-responded') === 'true';
    if (!isResponded && isWorking) {
      mins -= (1 / 60);
      el.setAttribute('data-mins-remaining', mins.toString());
    }

    const text = formatSlaMinutes(mins);
    const expected = (mins <= 60 && mins > 0) ? `⚠ At Risk · ${text}` : (mins <= 0 ? `🚨 ${text}` : `⏱️ ${text}`);
    if (el.innerText !== expected) {
      el.innerText = expected;
    }
  });
}

function updateVisibleSlaClocks() {
  tickTableSlaClocks();
}

function renderModalSlaGraphics(ticket) {
  if (modalSlaTimer) {
    clearInterval(modalSlaTimer);
    modalSlaTimer = null;
  }

  let responseMins = ticket.response_mins_remaining;
  let resolutionMins = ticket.resolution_mins_remaining;
  const isResponded = !!ticket.responded_at;
  const isResolved = !!ticket.resolved_at || !!ticket.closed_at;

  function updateModalUI() {
    // 1. Response SLA Clock & Progress Bar
    const respLabelEl = document.getElementById('responseSlaLabel');
    const respBarEl = document.getElementById('responseSlaBar');
    const clockSpan = document.getElementById('modalResponseClock');

    if (respLabelEl && respBarEl) {
      if (isResponded) {
        respLabelEl.innerHTML = `<span style="color:var(--status-normal);">✓ Responded</span>`;
        respBarEl.style.width = '100%';
        respBarEl.style.background = 'var(--status-normal)';
        if (clockSpan) clockSpan.innerHTML = '✓ Responded';
      } else if (responseMins !== null) {
        const text = formatSlaMinutes(responseMins);
        let barColor = 'var(--brand-green)';
        let statusHtml = `${text} remaining`;

        if (responseMins <= 0) {
          barColor = 'var(--status-overdue)';
          statusHtml = `<span style="color:var(--status-overdue);">🚨 ${text}</span>`;
        } else if (responseMins <= 60) {
          barColor = 'var(--status-atrisk)';
          statusHtml = `<span style="color:var(--status-atrisk);">⚠ At Risk · ${text} remaining</span>`;
        }

        respLabelEl.innerHTML = statusHtml;
        if (clockSpan) clockSpan.innerHTML = statusHtml;

        const elapsedMins = 240 - Math.max(0, responseMins);
        const percent = Math.min(100, Math.max(0, Math.round((elapsedMins / 240) * 100)));
        respBarEl.style.width = `${responseMins <= 0 ? 100 : percent}%`;
        respBarEl.style.background = barColor;
        respBarEl.setAttribute('aria-valuenow', percent);
      } else {
        respLabelEl.innerText = '--';
        respBarEl.style.width = '0%';
        if (clockSpan) clockSpan.innerText = '--';
      }
    }

    // 2. Resolution SLA Clock & Progress Bar
    const resLabelEl = document.getElementById('resolutionSlaLabel');
    const resBarEl = document.getElementById('resolutionSlaBar');

    if (resLabelEl && resBarEl) {
      if (isResolved) {
        resLabelEl.innerHTML = `<span style="color:var(--status-normal);">✓ Resolved</span>`;
        resBarEl.style.width = '100%';
        resBarEl.style.background = 'var(--status-normal)';
      } else if (resolutionMins !== null) {
        const text = formatSlaMinutes(resolutionMins);
        let barColor = '#2563eb';
        let statusHtml = `${text} remaining`;

        if (resolutionMins <= 0) {
          barColor = 'var(--status-overdue)';
          statusHtml = `<span style="color:var(--status-overdue);">🚨 ${text}</span>`;
        } else if (resolutionMins <= 60) {
          barColor = 'var(--status-atrisk)';
          statusHtml = `<span style="color:var(--status-atrisk);">⚠ At Risk · ${text} remaining</span>`;
        }

        resLabelEl.innerHTML = statusHtml;

        const elapsedMins = 960 - Math.max(0, resolutionMins);
        const percent = Math.min(100, Math.max(0, Math.round((elapsedMins / 960) * 100)));
        resBarEl.style.width = `${resolutionMins <= 0 ? 100 : percent}%`;
        resBarEl.style.background = barColor;
        resBarEl.setAttribute('aria-valuenow', percent);
      } else {
        resLabelEl.innerText = '--';
        resBarEl.style.width = '0%';
      }
    }
  }

  updateModalUI();

  modalSlaTimer = setInterval(() => {
    const isWorking = isCurrentBrowserWorkingTime();
    if (isWorking) {
      if (!isResponded && responseMins !== null && responseMins > 0) {
        responseMins -= (1 / 60);
      }
      if (!isResolved && resolutionMins !== null && resolutionMins > 0) {
        resolutionMins -= (1 / 60);
      }
    }
    updateModalUI();
  }, 1000);
}

// Load Manager Dashboard Metrics
async function loadMetrics() {
  const res = await fetch('/api/dashboard-metrics', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const metrics = await res.json();
  document.getElementById('metricTotalOpen').innerText = metrics.totalOpen;
  document.getElementById('metricAtRisk').innerText = metrics.atRiskCount;
  document.getElementById('metricOverdue').innerText = metrics.overdueCount;
  document.getElementById('metricEscalated').innerText = metrics.escalatedCount;
}

// Load Agent Workload Balancing (Manager View)
async function loadWorkload() {
  const res = await fetch('/api/workload', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const agents = await res.json();
  const container = document.getElementById('workloadGrid');
  container.innerHTML = agents.map(a => `
    <div style="background:#fff; border:1px solid var(--border-subtle); padding:10px 16px; border-radius:6px; flex:1;">
      <strong style="color:var(--deskflow-blue);">${a.name}:</strong>
      <span style="font-weight:bold; font-size:1.1rem; margin-left:8px;">${a.activeWorkload}</span> open tickets
    </div>
  `).join('');
}

// Load Log-Mode Notifications
async function loadNotifications() {
  if (!currentUser) return;
  const res = await fetch('/api/notifications', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const notifs = await res.json();
  
  document.getElementById('notifBadgeCount').innerText = notifs.length;
  const list = document.getElementById('notifList');
  list.innerHTML = notifs.length === 0
    ? '<p style="color:var(--text-muted); padding:8px;">No notifications.</p>'
    : notifs.map(n => `
        <div style="border-bottom:1px solid var(--border-subtle); padding:6px 0;">
          <strong>[${n.event_type}]</strong> ${n.message}
          <div style="font-size:0.7rem; color:var(--text-muted);">${new Date(n.created_at).toLocaleTimeString()}</div>
        </div>
      `).join('');
}

function toggleNotificationPanel() {
  document.getElementById('notifDropdown').classList.toggle('hidden');
}

// Search Feature Integration (Located Beside Filters Control)
function handleSearchKeyup(event) {
  if (event.key === 'Enter') triggerSearch();
}

async function triggerSearch() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) {
    await loadTickets();
    return;
  }

  navigateSidebar('queue');
  const url = `/api/search?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const tickets = await res.json();

  renderTicketsList(tickets, `Search Results for "${q}"`);
}

// Map Backend States to Clean Enterprise UI Labels
function getUIStateLabel(state) {
  switch(state) {
    case 'NEW': return 'New';
    case 'IN_PROGRESS': return 'In Progress';
    case 'PENDING_CUSTOMER': return 'Pending Customer';
    case 'RESOLVED': return 'Resolved';
    case 'CLOSED': return 'Closed';
    default: return state;
  }
}

// Load Incidents Queue Table
async function loadTickets() {
  const res = await fetch('/api/tickets?filter=ALL', {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const allTickets = await res.json();
  activeTicketsCache = allTickets;

  // Sidebar counts ALWAYS reflect the complete unfiltered set of tickets for the user
  updateSidebarCounts(allTickets);

  // Filter for current table view
  const filter = document.getElementById('ticketFilterSelect').value;
  let filteredTickets = allTickets;

  if (['NEW', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'].includes(filter)) {
    filteredTickets = allTickets.filter(t => t.state === filter);
  } else if (filter === 'AT_RISK') {
    filteredTickets = allTickets.filter(t => t.sla_state === 'AT_RISK');
  } else if (filter === 'OVERDUE') {
    filteredTickets = allTickets.filter(t => t.sla_state === 'OVERDUE');
  } else if (filter === 'ESCALATED') {
    filteredTickets = allTickets.filter(t => t.is_escalated === 1);
  }

  renderTicketsList(filteredTickets);
}

async function loadTicketsByCategory(category) {
  const url = `/api/tickets?category=${category}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const tickets = await res.json();
  renderTicketsList(tickets, `Category: ${category}`);
}

function updateSidebarCounts(tickets) {
  document.getElementById('cntAll').innerText = tickets.length;
  document.getElementById('cntNew').innerText = tickets.filter(t => t.state === 'NEW').length;
  document.getElementById('cntInProgress').innerText = tickets.filter(t => t.state === 'IN_PROGRESS').length;
  document.getElementById('cntPending').innerText = tickets.filter(t => t.state === 'PENDING_CUSTOMER').length;
  document.getElementById('cntResolved').innerText = tickets.filter(t => t.state === 'RESOLVED').length;
  document.getElementById('cntClosed').innerText = tickets.filter(t => t.state === 'CLOSED').length;
  document.getElementById('cntAtRisk').innerText = tickets.filter(t => t.sla_state === 'AT_RISK').length;
  document.getElementById('cntOverdue').innerText = tickets.filter(t => t.sla_state === 'OVERDUE').length;
  document.getElementById('cntEscalated').innerText = tickets.filter(t => t.is_escalated === 1).length;
  const cntApp = document.getElementById('cntApprovals');
  if (cntApp) cntApp.innerText = tickets.filter(t => t.approval_status === 'PENDING').length;
}

function renderTicketsList(tickets, customTitle) {
  if (customTitle) {
    document.getElementById('queuePanelTitle').innerText = customTitle;
  }

  const tbody = document.getElementById('ticketsTableBody');
  tbody.innerHTML = '';

  if (!tickets || tickets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:var(--text-muted);">No incidents found in queue.</td></tr>';
    return;
  }

  tickets.forEach(ticket => {
    const tr = document.createElement('tr');
    
    // SLA Status Badge
    let slaBadge = `<span class="badge badge-normal">NORMAL</span>`;
    if (ticket.sla_state === 'AT_RISK') {
      slaBadge = `<span class="badge badge-atrisk">AT RISK</span>`;
    } else if (ticket.sla_state === 'OVERDUE') {
      slaBadge = `<span class="badge badge-overdue">OVERDUE</span>`;
    }

    if (ticket.is_escalated) {
      slaBadge += ` <span class="badge badge-escalated">AUTO-ESCALATED</span>`;
    }

    // Response Clock Display
    let clockText = '--';
    if (ticket.responded_at) {
      clockText = '<span style="color:var(--status-normal); font-weight:600;">✓ Responded</span>';
    } else if (ticket.response_mins_remaining !== null) {
      const text = formatSlaMinutes(ticket.response_mins_remaining);
      if (ticket.response_mins_remaining <= 0) {
        clockText = `<span style="color:var(--status-overdue); font-weight:bold;">🚨 ${text}</span>`;
      } else if (ticket.response_mins_remaining <= 60) {
        clockText = `<span class="live-sla-clock" data-mins-remaining="${ticket.response_mins_remaining}" data-responded="${!!ticket.responded_at}" style="color:var(--status-atrisk); font-weight:bold;">⚠ At Risk · ${text}</span>`;
      } else {
        clockText = `<span class="live-sla-clock" data-mins-remaining="${ticket.response_mins_remaining}" data-responded="${!!ticket.responded_at}">⏱️ ${text}</span>`;
      }
    }

    const assigneeName = ticket.agent_name || '<em>Unassigned</em>';
    const actions = `<button onclick="inspectTicket('${ticket.id}')" class="btn-demo-action" style="background:var(--deskflow-blue); color:#fff;">Inspect</button>`;
    const serviceAreaType = `${ticket.service_area || ticket.category || 'Software Services'}<br><span style="font-size:0.75rem; color:var(--text-muted);">${ticket.service_type || 'General Service'}</span>`;

    tr.innerHTML = `
      <td><span class="badge badge-inc">${ticket.id}</span></td>
      <td>${ticket.title}</td>
      <td>${serviceAreaType}</td>
      <td><strong>${ticket.priority}</strong></td>
      <td><span class="badge badge-state">${getUIStateLabel(ticket.state)}</span></td>
      <td>${assigneeName}</td>
      <td>${clockText}</td>
      <td>${actions}</td>
    `;
    tbody.appendChild(tr);
  });

  updateVisibleSlaClocks();
}

function updateServiceTypes() {
  const areaSelect = document.getElementById('ticketServiceArea');
  const typeSelect = document.getElementById('ticketServiceType');
  if (!areaSelect || !typeSelect) return;

  const area = areaSelect.value;
  const optionsMap = {
    'Software Services': ['Application Failure', 'Account Access & Permissions', 'Software License Request', 'Bug & Error Investigation'],
    'Hardware & Devices': ['Hardware Repair/Replacement', 'Workstation Setup', 'Peripherals & Accessories', 'Mobile Device Provisioning'],
    'Billing & Subscriptions': ['Invoice & Payment Discrepancy', 'Subscription Upgrade/Downgrade', 'Tax Compliance Report', 'Refund Request'],
    'Infrastructure & Network': ['System Configuration', 'VPN & Remote Access', 'DNS & Firewall Rules', 'Cloud Server Outage']
  };

  const types = optionsMap[area] || ['General Inquiry'];
  typeSelect.innerHTML = types.map(t => `<option value="${t}">${t}</option>`).join('');
}

// Submit Create Ticket Form
async function handleCreateTicket(event) {
  event.preventDefault();
  const title = document.getElementById('ticketTitle').value;
  const serviceAreaSelect = document.getElementById('ticketServiceArea');
  const serviceTypeSelect = document.getElementById('ticketServiceType');
  const serviceArea = serviceAreaSelect ? serviceAreaSelect.value : 'Software Services';
  const serviceType = serviceTypeSelect ? serviceTypeSelect.value : 'Application Failure';
  const priority = document.getElementById('ticketPriority').value;
  const description = document.getElementById('ticketDescription').value;

  const res = await fetch('/api/tickets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ title, serviceArea, serviceType, priority, description })
  });

  if (res.ok) {
    document.getElementById('createTicketForm').reset();
    navigateSidebar('queue', 'ALL');
    await refreshAll();
  }
}

// Inspect Ticket Detail Workspace
async function inspectTicket(ticketId) {
  activeTicketId = ticketId;
  const res = await fetch(`/api/tickets/${ticketId}`, {
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  const ticket = await res.json();

  if (res.status === 403) {
    alert(ticket.error || 'FORBIDDEN: Access denied.');
    return;
  }

  document.getElementById('modalTicketId').innerText = ticket.id;
  document.getElementById('modalTicketTitle').innerText = ticket.title;
  document.getElementById('modalCategoryPriority').innerHTML = `
    <strong>Service Area:</strong> ${ticket.service_area || ticket.category || 'Software Services'}<br>
    <strong>Service Type:</strong> ${ticket.service_type || 'General Service'}<br>
    <strong>Priority Target:</strong> ${ticket.priority}
  `;
  document.getElementById('modalStatusBadge').innerText = getUIStateLabel(ticket.state);
  document.getElementById('modalAssigneeName').innerText = ticket.agent_name || 'Unassigned';

  // SLA Status Badge
  let slaBadge = `<span class="badge badge-normal">NORMAL</span>`;
  if (ticket.sla_state === 'AT_RISK') slaBadge = `<span class="badge badge-atrisk">AT RISK</span>`;
  if (ticket.sla_state === 'OVERDUE') slaBadge = `<span class="badge badge-overdue">OVERDUE</span>`;
  if (ticket.is_escalated) slaBadge += ` <span class="badge badge-escalated">AUTO-ESCALATED</span>`;
  document.getElementById('modalSlaBadge').innerHTML = slaBadge;

  // Render Graphical SLA Timeline & Live Clocks
  renderModalSlaGraphics(ticket);

  // Render Customer Conversation Thread
  const conversationList = document.getElementById('conversationThreadList');
  let convHtml = `
    <div class="conversation-bubble bubble-customer">
      <div class="bubble-meta">${ticket.customer_name || 'Customer'} (Requester) • Initial Description</div>
      <div>${ticket.description}</div>
    </div>
  `;

  if (ticket.conversation && ticket.conversation.length > 0) {
    ticket.conversation.forEach(c => {
      if (c.entry_type === 'AGENT_REQUEST') {
        convHtml += `
          <div class="conversation-bubble bubble-agent-req">
            <div class="bubble-meta">⚠️ ${c.actor_name || 'Agent'} • Information Requested</div>
            <div><strong>Requested:</strong> ${c.content}</div>
          </div>
        `;
      } else if (c.entry_type === 'CUSTOMER_REPLY') {
        convHtml += `
          <div class="conversation-bubble bubble-customer">
            <div class="bubble-meta">${c.actor_name || 'Customer'} • Response</div>
            <div>${c.content}</div>
          </div>
        `;
      } else if (c.entry_type === 'RESOLVED_SUMMARY') {
        convHtml += `
          <div class="conversation-bubble" style="background:var(--brand-green-bg); border:1px solid rgba(39, 143, 90, 0.3); border-left:4px solid var(--brand-green);">
            <div class="bubble-meta" style="color:var(--brand-green);">✅ ${c.actor_name || 'Support Agent'} • Resolution Summary</div>
            <div>${c.content}</div>
          </div>
        `;
      }
    });
  }
  conversationList.innerHTML = convHtml;

  // Render Prominent Information Requested Card for Customer
  const isCustomer = currentUser.role === 'CUSTOMER';
  const infoCard = document.getElementById('infoRequestCardCustomer');

  if (isCustomer && ticket.state === 'PENDING_CUSTOMER' && ticket.info_requested) {
    infoCard.classList.remove('hidden');
    document.getElementById('infoRequestPromptText').innerText = `"${ticket.info_requested}"`;
  } else {
    infoCard.classList.add('hidden');
  }

  // Render Prominent Resolution Notes Card (Visible to Customer & Agent)
  const resCard = document.getElementById('resolutionNotesCard');
  if (ticket.resolution_notes) {
    resCard.classList.remove('hidden');
    document.getElementById('resolutionNotesText').innerText = `"${ticket.resolution_notes}"`;
  } else {
    resCard.classList.add('hidden');
  }

  // Render Internal Work Notes (Strictly Hidden from Customer role)
  const workNotesPanel = document.getElementById('workNotesContainer');
  workNotesPanel.classList.toggle('hidden', isCustomer);

  if (!isCustomer) {
    const workNotesList = document.getElementById('workNotesList');
    workNotesList.innerHTML = (!ticket.workNotes || ticket.workNotes.length === 0)
      ? '<p style="font-size:0.8rem; color:var(--text-muted);">No internal work notes recorded yet.</p>'
      : ticket.workNotes.map(n => `
          <div class="work-note-item">
            <strong>${n.actor_name || 'Agent'}:</strong> ${n.note}
            <div style="font-size:0.72rem; color:var(--text-muted); text-align:right;">${new Date(n.created_at).toLocaleTimeString()}</div>
          </div>
        `).join('');
  }

  // Render Activity Audit Timeline
  const activityList = document.getElementById('activityTimelineList');
  activityList.innerHTML = ticket.activities.map(a => `
    <div class="timeline-item">
      <strong style="color:var(--deskflow-blue);">${new Date(a.created_at).toLocaleTimeString()}</strong> - ${a.actor_name || 'System'}: ${a.content}
    </div>
  `).join('');

  // Manager Reassignment Selector
  const isManager = currentUser.role === 'MANAGER';
  document.getElementById('managerReassignBox').classList.toggle('hidden', !isManager);

  // Manager Approval Banner & Controls
  const appBannerBox = document.getElementById('approvalBannerBox');
  const appStatusBadge = document.getElementById('modalApprovalStatusBadge');
  const appReasonText = document.getElementById('modalApprovalReasonText');
  const mgrAppControls = document.getElementById('managerApprovalControls');

  if (ticket.approval_status && ticket.approval_status !== 'NONE') {
    appBannerBox.classList.remove('hidden');
    appReasonText.innerText = ticket.approval_reason ? `Reason: "${ticket.approval_reason}"` : '';

    if (ticket.approval_status === 'PENDING') {
      appStatusBadge.innerText = 'PENDING MANAGER APPROVAL';
      appStatusBadge.style.background = '#8b5cf6';
      mgrAppControls.classList.toggle('hidden', !isManager);
    } else if (ticket.approval_status === 'APPROVED') {
      appStatusBadge.innerText = '✅ APPROVED BY MANAGER';
      appStatusBadge.style.background = '#059669';
      mgrAppControls.classList.add('hidden');
    } else if (ticket.approval_status === 'REJECTED') {
      appStatusBadge.innerText = '❌ APPROVAL REJECTED';
      appStatusBadge.style.background = '#dc2626';
      mgrAppControls.classList.add('hidden');
    }
  } else {
    appBannerBox.classList.add('hidden');
    mgrAppControls.classList.add('hidden');
  }

  // Action Buttons Matrix
  const actionsDiv = document.getElementById('modalActionButtons');
  actionsDiv.innerHTML = '';

  if (currentUser.role === 'AGENT' || currentUser.role === 'MANAGER') {
    if (ticket.state === 'NEW' || ticket.state === 'PENDING_CUSTOMER') {
      actionsDiv.innerHTML += `<button onclick="submitStateChange('IN_PROGRESS')" class="btn-primary" style="background:var(--deskflow-blue);">Start Work / Respond</button>`;
    }
    if (ticket.state === 'NEW' || ticket.state === 'IN_PROGRESS' || ticket.state === 'PENDING_CUSTOMER') {
      actionsDiv.innerHTML += `<button onclick="openRequestInfoModal()" class="btn-primary" style="background:#d97706;">💬 Request Information</button>`;
      if (ticket.approval_status !== 'PENDING') {
        actionsDiv.innerHTML += `<button onclick="openRequestApprovalModal()" class="btn-primary" style="background:#7c3aed;">🛡️ Request Manager Approval</button>`;
      }
    }
    if (ticket.state === 'IN_PROGRESS' || ticket.state === 'PENDING_CUSTOMER') {
      actionsDiv.innerHTML += `<button onclick="openResolveModal()" class="btn-primary" style="background:var(--status-normal);">Mark Resolved</button>`;
    }
  } else if (currentUser.role === 'CUSTOMER' && ticket.state === 'RESOLVED') {
    actionsDiv.innerHTML += `<button onclick="submitStateChange('CLOSED')" class="btn-primary" style="background:var(--status-normal);">Confirm & Close</button>`;
  }

  document.getElementById('ticketModal').classList.remove('hidden');
}

function closeModal() {
  if (modalSlaTimer) {
    clearInterval(modalSlaTimer);
    modalSlaTimer = null;
  }
  document.getElementById('ticketModal').classList.add('hidden');
}

// Request Information Workflow Modals
function openRequestInfoModal() {
  document.getElementById('requestInfoModal').classList.remove('hidden');
}

function closeRequestInfoModal() {
  document.getElementById('requestInfoModal').classList.add('hidden');
}

async function submitRequestInfo() {
  const requestText = document.getElementById('requestInfoInput').value.trim();
  if (!requestText) {
    alert('Please enter the information request details.');
    return;
  }

  const res = await fetch(`/api/tickets/${activeTicketId}/request-info`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ requestText })
  });

  if (res.ok) {
    document.getElementById('requestInfoInput').value = '';
    closeRequestInfoModal();
    await inspectTicket(activeTicketId);
    await refreshAll();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to request information.');
  }
}

async function submitCustomerReply() {
  const replyText = document.getElementById('customerReplyInput').value.trim();
  if (!replyText) {
    alert('Please enter your response details.');
    return;
  }

  const res = await fetch(`/api/tickets/${activeTicketId}/customer-reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ replyText })
  });

  if (res.ok) {
    document.getElementById('customerReplyInput').value = '';
    await inspectTicket(activeTicketId);
    await refreshAll();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to submit response.');
  }
}

// Submit Work Note (Internal Agent/Manager Only)
async function submitWorkNote() {
  const noteInput = document.getElementById('newWorkNoteInput');
  const note = noteInput.value.trim();
  if (!note) return;

  const res = await fetch(`/api/tickets/${activeTicketId}/work-notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ note })
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Action forbidden.');
    return;
  }

  noteInput.value = '';
  await inspectTicket(activeTicketId);
}

function openResolveModal() {
  document.getElementById('resolutionNoteInput').value = '';
  document.getElementById('resolveTicketModal').classList.remove('hidden');
}

function closeResolveModal() {
  document.getElementById('resolveTicketModal').classList.add('hidden');
}

async function submitResolveWithNotes() {
  const resolutionNotes = document.getElementById('resolutionNoteInput').value.trim();
  if (!resolutionNotes) {
    alert('Please enter resolution notes explaining how the issue was resolved.');
    return;
  }
  closeResolveModal();
  await submitStateChange('RESOLVED', resolutionNotes);
}

// Submit State Change
async function submitStateChange(state, customResolutionNotes) {
  let resolutionNotes = customResolutionNotes || null;
  if (state === 'RESOLVED' && !resolutionNotes) {
    openResolveModal();
    return;
  }

  const res = await fetch(`/api/tickets/${activeTicketId}/state`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ state, resolutionNotes })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'State transition rejected.');
    return;
  }

  await inspectTicket(activeTicketId);
  await refreshAll();
}

// Submit Reassignment (Manager Only)
async function submitReassign(agentId) {
  const res = await fetch(`/api/tickets/${activeTicketId}/reassign`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ agentId })
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Reassignment forbidden.');
    return;
  }

  await inspectTicket(activeTicketId);
  await refreshAll();
}

// Support Routing Rules Admin (Manager)
async function loadRules() {
  const res = await fetch('/api/rules');
  const rules = await res.json();
  const tbody = document.getElementById('rulesTableBody');
  tbody.innerHTML = '';

  rules.forEach(rule => {
    const tr = document.createElement('tr');
    const modeLabel = rule.use_workload_balance ? '<span class="badge badge-inc">WORKLOAD BALANCED</span>' : '<span class="badge badge-state">STATIC TARGET</span>';
    tr.innerHTML = `
      <td>#${rule.rule_order}</td>
      <td><strong>${rule.category}</strong></td>
      <td><strong>${rule.priority}</strong></td>
      <td>${rule.target_agent_name}</td>
      <td>${modeLabel}</td>
      <td><span class="badge badge-normal">ACTIVE</span></td>
      <td><button onclick="handleDeleteRule('${rule.id}')" class="btn-demo-action" style="background:#fee2e2; color:#dc2626;">Delete</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function handleAddRule(event) {
  event.preventDefault();
  const category = document.getElementById('ruleCategory').value;
  const priority = document.getElementById('rulePriority').value;
  const targetAgentId = document.getElementById('ruleTargetAgent').value;
  const useWorkloadBalance = document.getElementById('ruleWorkloadBalance').checked;

  const res = await fetch('/api/rules', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ category, priority, targetAgentId, useWorkloadBalance })
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Action forbidden.');
    return;
  }

  await loadRules();
}

async function handleDeleteRule(ruleId) {
  const res = await fetch(`/api/rules/${ruleId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${authToken}` }
  });
  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Action forbidden.');
    return;
  }
  await loadRules();
}

// Manager Approval Workflow Modal Handlers
function openRequestApprovalModal() {
  const input = document.getElementById('approvalReasonInput');
  if (input) input.value = '';
  document.getElementById('requestApprovalModal').classList.remove('hidden');
}

function closeRequestApprovalModal() {
  document.getElementById('requestApprovalModal').classList.add('hidden');
}

async function submitRequestApproval() {
  const reason = document.getElementById('approvalReasonInput').value;
  if (!reason || !reason.trim()) {
    alert('Please enter a reason for requesting Manager Approval.');
    return;
  }

  const res = await fetch(`/api/tickets/${activeTicketId}/request-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ reason })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to request manager approval.');
    return;
  }

  closeRequestApprovalModal();
  alert('Manager approval requested successfully!');
  await inspectTicket(activeTicketId);
  await refreshAll();
}

async function submitApprovalDecision(decision) {
  const noteInput = document.getElementById('approvalDecisionNote');
  const note = noteInput ? noteInput.value : '';
  const res = await fetch(`/api/tickets/${activeTicketId}/decide-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ decision, note })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error || 'Failed to submit approval decision.');
    return;
  }

  alert(`Manager approval request ${decision.toLowerCase()} successfully!`);
  await inspectTicket(activeTicketId);
  await refreshAll();
}
