let currentUser = null;
let usersList = [];
let activeTicketId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  await fetchUsers();
  await updateSimTime();
  onRoleChange();
});

// Fetch Users for Demo Auth Role Switcher
async function fetchUsers() {
  const res = await fetch('/api/users');
  usersList = await res.json();
  const select = document.getElementById('userRoleSelect');
  currentUser = usersList.find(u => u.id === select.value);
}

// Handle Demo Role Change
async function onRoleChange() {
  const selectedId = document.getElementById('userRoleSelect').value;
  currentUser = usersList.find(u => u.id === selectedId);

  const isCustomer = currentUser.role === 'CUSTOMER';
  const isManager = currentUser.role === 'MANAGER';

  // Toggle Tab Visibility based on Role
  document.getElementById('tabDashboard').classList.toggle('hidden', isCustomer);
  document.getElementById('tabRules').classList.toggle('hidden', !isManager);

  // Set default view tab
  if (isCustomer) {
    switchNavTab('create');
  } else {
    switchNavTab('dashboard');
  }

  await refreshAll();
}

// Navigation Tab Switcher
function switchNavTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  
  const isCustomer = currentUser ? currentUser.role === 'CUSTOMER' : false;
  const isManager = currentUser ? currentUser.role === 'MANAGER' : false;

  document.getElementById('managerDashboardSection').classList.toggle('hidden', tabName !== 'dashboard' || isCustomer);
  document.getElementById('createTicketSection').classList.toggle('hidden', tabName !== 'create');
  document.getElementById('ticketQueueSection').classList.toggle('hidden', tabName !== 'queue' && tabName !== 'dashboard');
  document.getElementById('rulesSection').classList.toggle('hidden', tabName !== 'rules' || !isManager);

  if (tabName === 'dashboard') document.getElementById('tabDashboard').classList.add('active');
  if (tabName === 'create') document.getElementById('tabCreate').classList.add('active');
  if (tabName === 'queue') document.getElementById('tabQueue').classList.add('active');
  if (tabName === 'rules') document.getElementById('tabRules').classList.add('active');

  document.getElementById('queuePanelTitle').innerText = isCustomer
    ? 'My Raised Incidents'
    : isManager
    ? 'All System Incidents (Manager View)'
    : `Assigned Incidents Queue (${currentUser ? currentUser.name : ''})`;
}

// Global Refresh
async function refreshAll() {
  await updateSimTime();
  if (currentUser.role === 'MANAGER') {
    await loadMetrics();
    await loadRules();
  }
  await loadTickets();
}

// Time Simulation Functions
async function updateSimTime() {
  const res = await fetch('/api/system-config');
  const config = await res.json();
  const dateObj = new Date(config.simulatedTime);
  document.getElementById('simTimeDisplay').innerText = 
    `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (+${config.offsetHours}h)`;
}

async function fastForwardTime(hours) {
  await fetch('/api/system-config/fast-forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hours })
  });
  await refreshAll();
}

async function resetTime() {
  await fetch('/api/system-config/reset-time', { method: 'POST' });
  await refreshAll();
}

// Load Manager Dashboard Metrics
async function loadMetrics() {
  const res = await fetch('/api/dashboard-metrics');
  const metrics = await res.json();
  document.getElementById('metricTotalOpen').innerText = metrics.totalOpen;
  document.getElementById('metricAtRisk').innerText = metrics.atRiskCount;
  document.getElementById('metricOverdue').innerText = metrics.overdueCount;
  document.getElementById('metricEscalated').innerText = metrics.escalatedCount;
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
  const filter = document.getElementById('ticketFilterSelect').value;
  const url = `/api/tickets?role=${currentUser.role}&userId=${currentUser.id}&filter=${filter}`;
  const res = await fetch(url);
  const tickets = await res.json();

  const tbody = document.getElementById('ticketsTableBody');
  tbody.innerHTML = '';

  if (tickets.length === 0) {
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
      clockText = '<span style="color:var(--status-normal); font-weight:600;">✅ Responded</span>';
    } else if (ticket.response_mins_remaining !== null) {
      if (ticket.response_mins_remaining <= 0) {
        clockText = `<span style="color:var(--status-overdue); font-weight:bold;">Breached (${Math.abs(ticket.response_mins_remaining)}m ago)</span>`;
      } else {
        clockText = `⏱️ ${ticket.response_mins_remaining}m remaining`;
      }
    }

    // Assignee Cell
    const assigneeName = ticket.agent_name || '<em>Unassigned</em>';

    // Actions
    const actions = `<button onclick="inspectTicket('${ticket.id}')" class="btn-demo-action" style="background:var(--deskflow-blue); color:#fff;">Inspect</button>`;

    tr.innerHTML = `
      <td><span class="badge badge-inc">${ticket.id}</span></td>
      <td>${ticket.title}</td>
      <td>${ticket.category}</td>
      <td><strong>${ticket.priority}</strong></td>
      <td><span class="badge badge-state">${getUIStateLabel(ticket.state)}</span></td>
      <td>${assigneeName}</td>
      <td>${clockText}</td>
      <td>${actions}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Submit Create Ticket Form
async function handleCreateTicket(event) {
  event.preventDefault();
  const title = document.getElementById('ticketTitle').value;
  const category = document.getElementById('ticketCategory').value;
  const priority = document.getElementById('ticketPriority').value;
  const description = document.getElementById('ticketDescription').value;

  const res = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title, category, priority, description,
      customerId: currentUser.id
    })
  });

  if (res.ok) {
    document.getElementById('createTicketForm').reset();
    switchNavTab('queue');
    await refreshAll();
  }
}

// Inspect Ticket Detail (IMS Operational Workspace)
async function inspectTicket(ticketId) {
  activeTicketId = ticketId;
  const res = await fetch(`/api/tickets/${ticketId}?role=${currentUser.role}`);
  const ticket = await res.json();

  document.getElementById('modalTicketId').innerText = ticket.id;
  document.getElementById('modalTicketTitle').innerText = ticket.title;
  document.getElementById('modalDescription').innerText = ticket.description || 'No detailed description provided.';
  document.getElementById('modalCategoryPriority').innerText = `${ticket.category} / ${ticket.priority}`;
  document.getElementById('modalStatusBadge').innerText = getUIStateLabel(ticket.state);
  document.getElementById('modalAssigneeName').innerText = ticket.agent_name || 'Unassigned';

  // SLA Status Badge
  let slaBadge = `<span class="badge badge-normal">NORMAL</span>`;
  if (ticket.sla_state === 'AT_RISK') slaBadge = `<span class="badge badge-atrisk">AT RISK</span>`;
  if (ticket.sla_state === 'OVERDUE') slaBadge = `<span class="badge badge-overdue">OVERDUE</span>`;
  if (ticket.is_escalated) slaBadge += ` <span class="badge badge-escalated">AUTO-ESCALATED</span>`;
  document.getElementById('modalSlaBadge').innerHTML = slaBadge;

  document.getElementById('modalResponseClock').innerHTML = ticket.responded_at
    ? '✅ Responded'
    : ticket.response_mins_remaining !== null
    ? `${ticket.response_mins_remaining}m remaining`
    : '--';

  // Render Internal Work Notes (Hidden from Customer role)
  const workNotesPanel = document.getElementById('workNotesContainer');
  const isCustomer = currentUser.role === 'CUSTOMER';
  workNotesPanel.classList.toggle('hidden', isCustomer);

  if (!isCustomer) {
    const workNotesList = document.getElementById('workNotesList');
    workNotesList.innerHTML = ticket.workNotes.length === 0
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

  // Action Buttons
  const actionsDiv = document.getElementById('modalActionButtons');
  actionsDiv.innerHTML = '';

  if (currentUser.role === 'AGENT' || currentUser.role === 'MANAGER') {
    if (ticket.state === 'NEW' || ticket.state === 'PENDING_CUSTOMER') {
      actionsDiv.innerHTML += `<button onclick="submitStateChange('IN_PROGRESS')" class="btn-primary" style="background:var(--deskflow-blue);">Start Work / Respond</button>`;
      actionsDiv.innerHTML += `<button onclick="submitStateChange('PENDING_CUSTOMER')" class="btn-primary" style="background:#d97706;">Request Info</button>`;
    }
    if (ticket.state === 'IN_PROGRESS') {
      actionsDiv.innerHTML += `<button onclick="submitStateChange('RESOLVED')" class="btn-primary" style="background:var(--status-normal);">Mark Resolved</button>`;
    }
  } else if (currentUser.role === 'CUSTOMER' && ticket.state === 'RESOLVED') {
    actionsDiv.innerHTML += `<button onclick="submitStateChange('CLOSED')" class="btn-primary" style="background:var(--status-normal);">Confirm & Close</button>`;
  }

  document.getElementById('ticketModal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('ticketModal').classList.add('hidden');
}

// Submit Work Note (Internal Agent/Manager)
async function submitWorkNote() {
  const noteInput = document.getElementById('newWorkNoteInput');
  const note = noteInput.value.trim();
  if (!note) return;

  await fetch(`/api/tickets/${activeTicketId}/work-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, actorId: currentUser.id })
  });

  noteInput.value = '';
  await inspectTicket(activeTicketId);
}

// Submit State Change
async function submitStateChange(state) {
  let resolutionNotes = null;
  if (state === 'RESOLVED') {
    resolutionNotes = prompt('Enter Resolution Notes (required to resolve):', 'Issue verified and resolved successfully.');
    if (!resolutionNotes) return; // Cancelled
  }

  await fetch(`/api/tickets/${activeTicketId}/state`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, actorId: currentUser.id, resolutionNotes })
  });
  await inspectTicket(activeTicketId);
  await refreshAll();
}

// Submit Reassignment (Manager)
async function submitReassign(agentId) {
  await fetch(`/api/tickets/${activeTicketId}/reassign`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId, actorId: currentUser.id })
  });
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
    tr.innerHTML = `
      <td>#${rule.rule_order}</td>
      <td><strong>${rule.category}</strong></td>
      <td><strong>${rule.priority}</strong></td>
      <td>${rule.target_agent_name}</td>
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

  await fetch('/api/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, priority, targetAgentId })
  });

  await loadRules();
}

async function handleDeleteRule(ruleId) {
  await fetch(`/api/rules/${ruleId}`, { method: 'DELETE' });
  await loadRules();
}
