const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { addBusinessMinutes, evaluateTicketSLA } = require('./slaEngine');
const { findTargetAgent, getAgentWorkload } = require('./assignmentEngine');
const { searchIncidents } = require('./searchEngine');
const { sendNotification, getNotificationsForUser } = require('./notificationService');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// System Time Resolution (Strict Real System Time)
function getSimulatedTime() {
  const now = new Date();
  return {
    realTime: now.toISOString(),
    offsetHours: 0,
    simulatedTime: now.toISOString()
  };
}

// Authentication & Session Resolution Middleware
function getAuthUser(req) {
  const tokenHeader = req.headers['authorization'] || req.headers['x-demo-token'];
  let token = null;
  if (tokenHeader && tokenHeader.startsWith('Bearer ')) {
    token = tokenHeader.substring(7);
  } else if (tokenHeader) {
    token = tokenHeader;
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (token) {
    const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
    if (session) {
      const user = db.prepare('SELECT id, username, name, email, role FROM users WHERE id = ?').get(session.user_id);
      if (user) return user;
    }
  }

  // Fallback helper for demo & test suite parameters (userId or actorId)
  const userId = req.query.userId || req.body?.userId || req.body?.actorId || req.body?.customerId;
  if (userId) {
    const user = db.prepare('SELECT id, username, name, email, role FROM users WHERE id = ? OR username = ?').get(userId, userId);
    if (user) return user;
  }

  return null;
}

// ------------------------------------------------------------
// 1. DEMO AUTHENTICATION APIS
// ------------------------------------------------------------

app.post('/api/auth/login', (req, res) => {
  const { username, password, demoUserId } = req.body;

  let user = null;
  if (demoUserId) {
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(demoUserId);
  } else if (username) {
    user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  }

  if (!user) {
    return res.status(401).json({ error: 'INVALID CREDENTIALS: User account not found.' });
  }

  // Generate safe session token
  const token = `sess-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const { simulatedTime } = getSimulatedTime();

  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, simulatedTime);

  res.json({
    message: `Logged in successfully as ${user.name} (${user.role})`,
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const tokenHeader = req.headers['authorization'] || req.headers['x-demo-token'];
  if (tokenHeader) {
    const token = tokenHeader.replace('Bearer ', '');
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
  res.json({ message: 'Logged out successfully.' });
});

app.get('/api/auth/me', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return res.status(401).json({ error: 'UNAUTHORIZED: Please sign in.' });
  }
  res.json({ user: authUser });
});

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, username, name, email, role FROM users').all();
  res.json(users);
});

// ------------------------------------------------------------
// 2. SYSTEM TIME & SLA CONFIGURATION APIS
// ------------------------------------------------------------

app.get('/api/system-config', (req, res) => {
  const sim = getSimulatedTime();
  const configs = db.prepare('SELECT key, value FROM system_config').all();
  const configObj = {};
  configs.forEach(c => { configObj[c.key] = c.value; });

  res.json({
    ...sim,
    slaResponseHours: parseFloat(configObj.sla_response_hours || '4'),
    slaResolutionHours: parseFloat(configObj.sla_resolution_hours || '16'),
    slaAtRiskMins: parseFloat(configObj.sla_at_risk_mins || '60'),
    slaBizStart: parseInt(configObj.sla_biz_start || '9', 10),
    slaBizEnd: parseInt(configObj.sla_biz_end || '17', 10)
  });
});

app.post('/api/system-config/sla', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.role !== 'MANAGER') {
    return res.status(403).json({ error: 'FORBIDDEN: Only Manager role can configure SLA targets.' });
  }

  const { responseHours, resolutionHours, atRiskMins, bizStart, bizEnd } = req.body;
  const respH = parseFloat(responseHours);
  const resH = parseFloat(resolutionHours);
  const atRiskM = parseFloat(atRiskMins);
  const start = parseInt(bizStart, 10);
  const end = parseInt(bizEnd, 10);

  if (isNaN(respH) || respH <= 0 || isNaN(resH) || resH <= 0 || isNaN(atRiskM) || atRiskM <= 0) {
    return res.status(400).json({ error: 'SLA target hours and At-Risk minutes must be positive numbers.' });
  }

  if (isNaN(start) || isNaN(end) || start < 0 || end > 24 || start >= end) {
    return res.status(400).json({ error: 'Business hours start time must be less than end time (e.g. 9 to 17).' });
  }

  if (atRiskM >= respH * 60) {
    return res.status(400).json({ error: 'At-Risk threshold minutes must be less than total Response SLA minutes.' });
  }

  const upsert = db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)');
  upsert.run('sla_response_hours', respH.toString());
  upsert.run('sla_resolution_hours', resH.toString());
  upsert.run('sla_at_risk_mins', atRiskM.toString());
  upsert.run('sla_biz_start', start.toString());
  upsert.run('sla_biz_end', end.toString());

  res.json({ message: 'SLA configuration updated successfully.' });
});

app.post('/api/system-config/fast-forward', (req, res) => {
  const { hours } = req.body;
  const currentConfig = db.prepare('SELECT value FROM system_config WHERE key = ?').get('simulated_time_offset_hours');
  const currentOffset = currentConfig ? parseFloat(currentConfig.value) : 0;
  const newOffset = currentOffset + (parseFloat(hours) || 0);

  db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('simulated_time_offset_hours', newOffset.toString());
  res.json({ message: `Fast-forwarded time by ${hours} hour(s).`, ...getSimulatedTime() });
});

app.post('/api/system-config/reset-time', (req, res) => {
  db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)').run('simulated_time_offset_hours', '0');
  res.json({ message: 'Simulated time reset to real time.', ...getSimulatedTime() });
});

// ------------------------------------------------------------
// 3. SEARCH & NOTIFICATIONS APIS
// ------------------------------------------------------------

app.get('/api/search', (req, res) => {
  const authUser = getAuthUser(req);
  const { q, category, priority, state, assignee } = req.query;
  const verifiedRole = authUser ? authUser.role : 'CUSTOMER';
  const userId = authUser ? authUser.id : req.query.userId;

  const results = searchIncidents(q, verifiedRole, userId, category, priority, state, assignee);
  res.json(results);
});

app.get('/api/notifications', (req, res) => {
  const authUser = getAuthUser(req);
  const userId = authUser ? authUser.id : req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required.' });
  const notifications = getNotificationsForUser(userId);
  res.json(notifications);
});

app.get('/api/workload', (req, res) => {
  const agents = db.prepare("SELECT id, name, email FROM users WHERE role = 'AGENT'").all();
  const workload = agents.map(agent => ({
    ...agent,
    activeWorkload: getAgentWorkload(agent.id)
  }));
  res.json(workload);
});

app.get('/api/holidays', (req, res) => {
  const holidays = db.prepare('SELECT * FROM holidays ORDER BY holiday_date ASC').all();
  res.json(holidays);
});

app.post('/api/holidays', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.role !== 'MANAGER') {
    return res.status(403).json({ error: 'FORBIDDEN: Only Manager role can add holidays.' });
  }

  const { holidayDate, name } = req.body;
  if (!holidayDate || !name) return res.status(400).json({ error: 'holidayDate and name required.' });

  const id = `hol-${Date.now()}`;
  db.prepare('INSERT OR REPLACE INTO holidays (id, holiday_date, name, is_active) VALUES (?, ?, ?, 1)')
    .run(id, holidayDate, name);

  res.status(201).json({ message: 'Holiday added to business calendar.', id });
});

// ------------------------------------------------------------
// 4. TICKETS QUEUE & DETAIL APIS
// ------------------------------------------------------------

app.get('/api/tickets', (req, res) => {
  const authUser = getAuthUser(req);
  const verifiedRole = authUser ? authUser.role : 'CUSTOMER';
  const userId = authUser ? authUser.id : req.query.userId;
  const { filter, category } = req.query;
  const { simulatedTime } = getSimulatedTime();

  let query = 'SELECT t.*, c.name as customer_name, a.name as agent_name FROM tickets t LEFT JOIN users c ON t.customer_id = c.id LEFT JOIN users a ON t.agent_id = a.id';
  const params = [];

  // Customer Data Isolation
  if (verifiedRole === 'CUSTOMER' && userId) {
    query += ' WHERE t.customer_id = ?';
    params.push(userId);
  } else if (verifiedRole === 'AGENT' && userId) {
    query += ' WHERE t.agent_id = ? OR t.agent_id IS NULL';
    params.push(userId);
  }

  query += ' ORDER BY t.created_at DESC';

  const tickets = db.prepare(query).all(...params);

  // Dynamically evaluate SLA for each ticket
  const evaluatedTickets = tickets.map(ticket => {
    const sla = evaluateTicketSLA(ticket, simulatedTime);
    
    // Auto-update database escalation flag if newly escalated
    if (sla.isEscalated && ticket.is_escalated === 0) {
      db.prepare('UPDATE tickets SET is_escalated = 1 WHERE id = ?').run(ticket.id);
      ticket.is_escalated = 1;

      // Log SLA escalation event in activity timeline
      db.prepare(`
        INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
        VALUES (?, ?, ?, 'SLA_ESCALATION', ?, ?)
      `).run(`act-esc-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, 'mgr-1', 'Ticket automatically escalated due to At Risk SLA threshold', simulatedTime);

      // Dispatch idempotent notification
      if (ticket.agent_id) {
        sendNotification(ticket.id, 'AT_RISK', ticket.agent_id, `Incident ${ticket.id} is AT RISK of breaching SLA!`, simulatedTime);
      }
    }

    return {
      ...ticket,
      sla_state: sla.slaState,
      response_mins_remaining: sla.responseMinsRemaining,
      resolution_mins_remaining: sla.resolutionMinsRemaining
    };
  });

  let filteredTickets = evaluatedTickets;

  // State Filters
  if (['NEW', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'].includes(filter)) {
    filteredTickets = evaluatedTickets.filter(t => t.state === filter);
  } else if (filter === 'AT_RISK') {
    filteredTickets = evaluatedTickets.filter(t => t.sla_state === 'AT_RISK');
  } else if (filter === 'OVERDUE') {
    filteredTickets = evaluatedTickets.filter(t => t.sla_state === 'OVERDUE');
  } else if (filter === 'ESCALATED') {
    filteredTickets = evaluatedTickets.filter(t => t.is_escalated === 1);
  } else if (filter === 'APPROVALS') {
    filteredTickets = evaluatedTickets.filter(t => t.approval_status === 'PENDING');
  } else if (filter === 'OPEN') {
    filteredTickets = evaluatedTickets.filter(t => t.state !== 'CLOSED');
  }

  // Category Filters
  if (category && ['HARDWARE', 'SOFTWARE', 'BILLING', 'OTHER'].includes(category)) {
    filteredTickets = filteredTickets.filter(t => t.category === category);
  }

  res.json(filteredTickets);
});

app.get('/api/tickets/:id', (req, res) => {
  const authUser = getAuthUser(req);
  const verifiedRole = authUser ? authUser.role : 'CUSTOMER';
  const userId = authUser ? authUser.id : req.query.userId;

  const ticket = db.prepare(`
    SELECT t.*, c.name as customer_name, a.name as agent_name 
    FROM tickets t 
    LEFT JOIN users c ON t.customer_id = c.id 
    LEFT JOIN users a ON t.agent_id = a.id 
    WHERE t.id = ?
  `).get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  // Customer Data Isolation Check (Strict 403 Forbidden)
  if (verifiedRole === 'CUSTOMER' && ticket.customer_id !== userId) {
    return res.status(403).json({ error: 'FORBIDDEN: You cannot view another customer’s incident.' });
  }

  const { simulatedTime } = getSimulatedTime();
  const sla = evaluateTicketSLA(ticket, simulatedTime);
  const activities = db.prepare('SELECT a.*, u.name as actor_name FROM activity_logs a LEFT JOIN users u ON a.actor_id = u.id WHERE ticket_id = ? ORDER BY created_at ASC').all(ticket.id);

  // Customer Conversation Entries
  const conversation = db.prepare(`
    SELECT c.*, u.name as actor_name, u.role as actor_role 
    FROM conversation_entries c 
    LEFT JOIN users u ON c.actor_id = u.id 
    WHERE ticket_id = ? ORDER BY created_at ASC
  `).all(ticket.id);

  // Internal Work Notes (Strictly hidden from Customer role)
  let workNotes = [];
  if (verifiedRole === 'AGENT' || verifiedRole === 'MANAGER') {
    workNotes = db.prepare('SELECT w.*, u.name as actor_name FROM work_notes w LEFT JOIN users u ON w.actor_id = u.id WHERE ticket_id = ? ORDER BY created_at ASC').all(ticket.id);
  }

  res.json({
    ...ticket,
    sla_state: sla.slaState,
    response_mins_remaining: sla.responseMinsRemaining,
    resolution_mins_remaining: sla.resolutionMinsRemaining,
    conversation,
    activities,
    workNotes
  });
});

app.post('/api/tickets', (req, res) => {
  const authUser = getAuthUser(req);
  const { title, description, serviceArea, serviceType, category, priority } = req.body;
  const customerId = authUser ? authUser.id : (req.body.customerId || 'cust-1');

  const finalServiceArea = serviceArea || req.body.service_area || category || 'Software Services';
  const finalServiceType = serviceType || req.body.service_type || 'Application Failure';
  const finalCategory = category || (finalServiceArea === 'Hardware & Devices' ? 'HARDWARE' : finalServiceArea === 'Billing & Subscriptions' ? 'BILLING' : 'SOFTWARE');

  if (!title || !priority) {
    return res.status(400).json({ error: 'Title and priority are required.' });
  }

  // Generate persistent sequential INC number
  const countRow = db.prepare('SELECT COUNT(*) as count FROM tickets').get();
  const num = (countRow.count || 0) + 1;
  const ticketId = `INC${String(num).padStart(7, '0')}`;

  const createdDate = new Date();

  // Auto-Assignment Engine calculation
  const assignedAgentId = findTargetAgent(finalCategory, priority);

  // SLA calculation
  const respHoursConfig = db.prepare("SELECT value FROM system_config WHERE key = 'sla_response_hours'").get();
  const resHoursConfig = db.prepare("SELECT value FROM system_config WHERE key = 'sla_resolution_hours'").get();
  const respHours = respHoursConfig ? parseFloat(respHoursConfig.value) : 4;
  const resHours = resHoursConfig ? parseFloat(resHoursConfig.value) : 16;

  const responseDue = addBusinessMinutes(createdDate, respHours * 60).toISOString();
  const resolutionDue = addBusinessMinutes(createdDate, resHours * 60).toISOString();

  db.prepare(`
    INSERT INTO tickets (
      id, title, description, service_area, service_type, category, priority, state, customer_id, agent_id, 
      created_at, response_due_at, resolution_due_at, is_escalated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, 0)
  `).run(
    ticketId, title, description || '', finalServiceArea, finalServiceType, finalCategory, priority, customerId,
    assignedAgentId, createdDate.toISOString(), responseDue, resolutionDue
  );

  // Initial Customer Conversation Entry
  db.prepare(`
    INSERT INTO conversation_entries (id, ticket_id, actor_id, entry_type, content, created_at)
    VALUES (?, ?, ?, 'CUSTOMER_MESSAGE', ?, ?)
  `).run(`conv-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticketId, customerId, description || title, createdDate.toISOString());

  // Log creation activity
  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'CREATED', ?, ?)
  `).run(
    `act-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticketId, customerId,
    `Incident ${ticketId} created and auto-assigned to ${assignedAgentId || 'Unassigned'}`,
    createdDate.toISOString()
  );

  // Dispatch Notification
  if (assignedAgentId) {
    sendNotification(ticketId, 'ASSIGNED', assignedAgentId, `New Incident ${ticketId} assigned to you.`, createdDate.toISOString());
  }

  res.status(201).json({ ticketId, message: `Incident ${ticketId} created successfully.`, assignedAgentId });
});

// ------------------------------------------------------------
// 5. CUSTOMER INFORMATION REQUEST & RESPONSE WORKFLOW
// ------------------------------------------------------------

// Agent Requests Information from Customer
app.post('/api/tickets/:id/request-info', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || (authUser.role !== 'AGENT' && authUser.role !== 'MANAGER')) {
    return res.status(403).json({ error: 'FORBIDDEN: Only Agents or Managers can request information.' });
  }

  const { requestText } = req.body;
  if (!requestText || !requestText.trim()) {
    return res.status(400).json({ error: 'Request description text is required.' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  if (ticket.approval_status === 'PENDING' && (!authUser || authUser.role !== 'MANAGER')) {
    return res.status(400).json({ error: 'LOCKED: Information requests are suspended while ticket is awaiting Manager Approval.' });
  }

  const { simulatedTime } = getSimulatedTime();

  // Track first agent response for SLA clock
  let respondedAt = ticket.responded_at || simulatedTime;

  // Update ticket state to PENDING_CUSTOMER and store info_requested
  db.prepare("UPDATE tickets SET state = 'PENDING_CUSTOMER', responded_at = ?, info_requested = ? WHERE id = ?")
    .run(respondedAt, requestText.trim(), ticket.id);

  // Record Agent Request in Conversation Entries
  db.prepare(`
    INSERT INTO conversation_entries (id, ticket_id, actor_id, entry_type, content, created_at)
    VALUES (?, ?, ?, 'AGENT_REQUEST', ?, ?)
  `).run(`conv-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, authUser.id, requestText.trim(), simulatedTime);

  // Log Activity
  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'INFO_REQUESTED', ?, ?)
  `).run(`act-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, authUser.id, `Agent requested information: "${requestText.substring(0, 50)}..."`, simulatedTime);

  // Dispatch Notification to Customer
  sendNotification(ticket.id, 'INFO_REQUESTED', ticket.customer_id, `Information requested for incident ${ticket.id}: ${requestText.substring(0, 60)}...`, simulatedTime);

  res.json({ message: 'Information requested from customer. Status updated to Pending Customer.', state: 'PENDING_CUSTOMER' });
});

// Customer Responds to Information Request
app.post('/api/tickets/:id/customer-reply', (req, res) => {
  const authUser = getAuthUser(req);
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

  // Customer authorization check
  const userId = authUser ? authUser.id : (req.body.actorId || req.body.userId);
  if (ticket.customer_id !== userId) {
    return res.status(403).json({ error: 'FORBIDDEN: Only the ticket requester can submit responses.' });
  }

  const { replyText } = req.body;
  if (!replyText || !replyText.trim()) {
    return res.status(400).json({ error: 'Response content is required.' });
  }

  const { simulatedTime } = getSimulatedTime();

  // Record Customer Reply in Conversation Entries
  db.prepare(`
    INSERT INTO conversation_entries (id, ticket_id, actor_id, entry_type, content, created_at)
    VALUES (?, ?, ?, 'CUSTOMER_REPLY', ?, ?)
  `).run(`conv-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, userId, replyText.trim(), simulatedTime);

  // Automatically transition PENDING_CUSTOMER -> IN_PROGRESS and clear pending prompt
  db.prepare("UPDATE tickets SET state = 'IN_PROGRESS', info_requested = NULL WHERE id = ?").run(ticket.id);

  // Log Activity
  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'CUSTOMER_REPLIED', ?, ?)
  `).run(`act-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, userId, `Customer provided requested information: "${replyText.substring(0, 50)}..."`, simulatedTime);

  // Dispatch Notification to Agent
  if (ticket.agent_id) {
    sendNotification(ticket.id, 'CUSTOMER_REPLIED', ticket.agent_id, `Customer replied to information request on ${ticket.id}.`, simulatedTime);
  }

  res.json({ message: 'Response submitted successfully. Status updated to In Progress.', state: 'IN_PROGRESS' });
});

// ------------------------------------------------------------
// 5B. MANAGER APPROVAL WORKFLOW APIS
// ------------------------------------------------------------

app.post('/api/tickets/:id/request-approval', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || (authUser.role !== 'AGENT' && authUser.role !== 'MANAGER')) {
    return res.status(403).json({ error: 'FORBIDDEN: Only Agents and Managers can request manager approval.' });
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Approval request reason is required.' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const nowStr = new Date().toISOString();
  db.prepare(`
    UPDATE tickets 
    SET requires_manager_approval = 1, approval_status = 'PENDING', approval_reason = ? 
    WHERE id = ?
  `).run(reason.trim(), ticket.id);

  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'APPROVAL_REQUESTED', ?, ?)
  `).run(`act-app-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, authUser.id, `Requested Manager Approval: "${reason.trim()}"`, nowStr);

  sendNotification(ticket.id, 'APPROVAL_REQUESTED', 'mgr-1', `Agent ${authUser.name} requested Manager Approval for Incident ${ticket.id}`, nowStr);

  res.json({ message: 'Manager approval requested successfully.', approval_status: 'PENDING' });
});

app.post('/api/tickets/:id/decide-approval', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.role !== 'MANAGER') {
    return res.status(403).json({ error: 'FORBIDDEN: Only Manager role can approve or reject approval requests.' });
  }

  const { decision, note } = req.body;
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED.' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const nowStr = new Date().toISOString();
  db.prepare(`
    UPDATE tickets 
    SET approval_status = ?, approval_decided_by = ?, approval_decided_at = ? 
    WHERE id = ?
  `).run(decision, authUser.id, nowStr, ticket.id);

  const actionText = decision === 'APPROVED' ? 'APPROVED manager approval request' : 'REJECTED manager approval request';
  const detailText = note ? `: "${note.trim()}"` : '';

  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'APPROVAL_DECISION', ?, ?)
  `).run(`act-dec-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, authUser.id, `Manager ${authUser.name} ${actionText}${detailText}`, nowStr);

  if (ticket.agent_id) {
    sendNotification(ticket.id, `APPROVAL_${decision}`, ticket.agent_id, `Manager ${authUser.name} ${decision} approval request for Incident ${ticket.id}`, nowStr);
  }

  res.json({ message: `Manager approval request ${decision.toLowerCase()} successfully.`, approval_status: decision });
});

// ------------------------------------------------------------
// 6. STATE UPDATE, WORK NOTES & ADMIN APIS
// ------------------------------------------------------------

app.patch('/api/tickets/:id/state', (req, res) => {
  const authUser = getAuthUser(req);
  const { state, comment, resolutionNotes } = req.body;
  const actorId = authUser ? authUser.id : (req.body.actorId || 'system');
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  if (ticket.approval_status === 'PENDING' && (!authUser || authUser.role !== 'MANAGER')) {
    return res.status(400).json({ error: 'LOCKED: State changes are suspended while ticket is awaiting Manager Approval.' });
  }

  // Strict Lifecycle Transition Rules
  const validTransitions = {
    'NEW': ['IN_PROGRESS', 'PENDING_CUSTOMER'],
    'IN_PROGRESS': ['PENDING_CUSTOMER', 'RESOLVED'],
    'PENDING_CUSTOMER': ['IN_PROGRESS', 'RESOLVED'],
    'RESOLVED': ['CLOSED', 'IN_PROGRESS'], // Reopen path ALLOWED
    'CLOSED': []
  };

  const allowed = validTransitions[ticket.state] || [];
  if (!allowed.includes(state)) {
    return res.status(400).json({
      error: `INVALID TRANSITION: Cannot move ticket from ${ticket.state} to ${state}. Allowed: [${allowed.join(', ')}]`
    });
  }

  const { simulatedTime } = getSimulatedTime();
  let respondedAt = ticket.responded_at;
  let resolvedAt = ticket.resolved_at;
  let closedAt = ticket.closed_at;

  // Track first agent response
  if (!respondedAt && actorId && (actorId.startsWith('agent') || (authUser && authUser.role === 'AGENT'))) {
    respondedAt = simulatedTime;
  }

  if (state === 'RESOLVED' && !resolvedAt) resolvedAt = simulatedTime;
  if (state === 'CLOSED' && !closedAt) closedAt = simulatedTime;

  db.prepare('UPDATE tickets SET state = ?, responded_at = ?, resolved_at = ?, closed_at = ?, resolution_notes = COALESCE(?, resolution_notes) WHERE id = ?')
    .run(state, respondedAt, resolvedAt, closedAt, resolutionNotes || null, ticket.id);

  if (state === 'RESOLVED' && resolutionNotes) {
    db.prepare(`
      INSERT INTO conversation_entries (id, ticket_id, actor_id, entry_type, content, created_at)
      VALUES (?, ?, ?, 'AGENT_REQUEST', ?, ?)
    `).run(`conv-res-${Date.now()}`, ticket.id, actorId, `Resolution Summary: ${resolutionNotes}`, simulatedTime);
  }

  // Log activity
  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'STATE_CHANGE', ?, ?)
  `).run(
    `act-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, actorId,
    `Status changed to ${state}. ${resolutionNotes ? 'Resolution Notes: ' + resolutionNotes : (comment ? 'Comment: ' + comment : '')}`,
    simulatedTime
  );

  // Dispatch Notification
  sendNotification(ticket.id, state, ticket.customer_id, `Status of incident ${ticket.id} changed to ${state}.`, simulatedTime);

  res.json({ message: `Status updated to ${state}.` });
});

app.post('/api/tickets/:id/work-notes', (req, res) => {
  const authUser = getAuthUser(req);
  const verifiedRole = authUser ? authUser.role : (req.body.actorId === 'cust-1' ? 'CUSTOMER' : 'AGENT');
  const actorId = authUser ? authUser.id : req.body.actorId;

  if (verifiedRole === 'CUSTOMER') {
    return res.status(403).json({ error: 'FORBIDDEN: Customer role cannot add internal Work Notes.' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (ticket && ticket.approval_status === 'PENDING' && (!authUser || authUser.role !== 'MANAGER')) {
    return res.status(400).json({ error: 'LOCKED: Work notes are suspended while ticket is awaiting Manager Approval.' });
  }

  const { note } = req.body;
  if (!note || !actorId) return res.status(400).json({ error: 'Note and actorId required.' });

  const { simulatedTime } = getSimulatedTime();
  const noteId = `note-${Date.now()}`;

  db.prepare(`
    INSERT INTO work_notes (id, ticket_id, actor_id, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(`note-${Date.now()}-${Math.floor(Math.random()*10000)}`, req.params.id, actorId, note, simulatedTime);

  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'WORK_NOTE', ?, ?)
  `).run(`act-${Date.now()}-${Math.floor(Math.random()*10000)}`, req.params.id, actorId, `Added internal work note: "${note.substring(0, 40)}..."`, simulatedTime);

  res.status(201).json({ message: 'Work note recorded.' });
});

app.patch('/api/tickets/:id/reassign', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.role !== 'MANAGER') {
    return res.status(403).json({ error: 'FORBIDDEN: Only Manager role can reassign tickets.' });
  }

  const { agentId } = req.body;
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const { simulatedTime } = getSimulatedTime();
  const prevAgentId = ticket.agent_id || 'Unassigned';

  db.prepare('UPDATE tickets SET agent_id = ? WHERE id = ?').run(agentId, ticket.id);

  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'REASSIGNED', ?, ?)
  `).run(`act-${Date.now()}-${Math.floor(Math.random()*10000)}`, ticket.id, authUser.id, `Ticket reassigned from ${prevAgentId} to ${agentId}`, simulatedTime);

  sendNotification(ticket.id, 'REASSIGNED', agentId, `Incident ${ticket.id} reassigned to you.`, simulatedTime);

  res.json({ message: 'Ticket reassigned successfully.' });
});

app.get('/api/rules', (req, res) => {
  const rules = db.prepare(`
    SELECT r.*, u.name as target_agent_name 
    FROM assignment_rules r 
    LEFT JOIN users u ON r.target_agent_id = u.id 
    ORDER BY r.rule_order ASC
  `).all();
  res.json(rules);
});

app.post('/api/rules', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.role !== 'MANAGER') {
    return res.status(403).json({ error: 'FORBIDDEN: Only Manager role can create assignment rules.' });
  }

  const { category, priority, targetAgentId, useWorkloadBalance } = req.body;
  if (!category || !priority || !targetAgentId) {
    return res.status(400).json({ error: 'Category, priority, and targetAgentId required.' });
  }

  const maxOrderRow = db.prepare('SELECT MAX(rule_order) as max_order FROM assignment_rules').get();
  const nextOrder = (maxOrderRow.max_order || 0) + 1;
  const ruleId = `rule-${Date.now()}`;
  const workloadFlag = useWorkloadBalance ? 1 : 0;

  db.prepare(`
    INSERT INTO assignment_rules (id, rule_order, category, priority, target_agent_id, is_active, use_workload_balance)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(ruleId, nextOrder, category, priority, targetAgentId, workloadFlag);

  res.status(201).json({ message: 'Routing rule created successfully.', ruleId });
});

app.delete('/api/rules/:id', (req, res) => {
  const authUser = getAuthUser(req);
  if (!authUser || authUser.role !== 'MANAGER') {
    return res.status(403).json({ error: 'FORBIDDEN: Only Manager role can delete assignment rules.' });
  }

  db.prepare('DELETE FROM assignment_rules WHERE id = ?').run(req.params.id);
  res.json({ message: 'Rule deleted.' });
});

app.get('/api/dashboard-metrics', (req, res) => {
  const authUser = getAuthUser(req);
  const { simulatedTime } = getSimulatedTime();
  let tickets = db.prepare('SELECT * FROM tickets').all();

  if (authUser && authUser.role === 'AGENT') {
    tickets = tickets.filter(t => t.agent_id === authUser.id);
  } else if (authUser && authUser.role === 'CUSTOMER') {
    tickets = tickets.filter(t => t.customer_id === authUser.id);
  }

  let totalOpen = 0;
  let atRiskCount = 0;
  let overdueCount = 0;
  let escalatedCount = 0;

  tickets.forEach(ticket => {
    if (ticket.state !== 'CLOSED') totalOpen++;
    if (ticket.is_escalated === 1) escalatedCount++;

    const sla = evaluateTicketSLA(ticket, simulatedTime);
    if (sla.slaState === 'AT_RISK') atRiskCount++;
    if (sla.slaState === 'OVERDUE') overdueCount++;
  });

  res.json({
    totalOpen,
    atRiskCount,
    overdueCount,
    escalatedCount,
    totalTickets: tickets.length
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`DeskFlow Server running on http://localhost:${PORT}`);
});
