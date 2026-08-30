const express = require('express');
const path = require('path');
const db = require('./db');
const { addBusinessMinutes, evaluateTicketSLA } = require('./slaEngine');
const { findTargetAgent, getAgentWorkload } = require('./assignmentEngine');
const { searchIncidents } = require('./searchEngine');
const { sendNotification, getNotificationsForUser } = require('./notificationService');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to get current simulated time
function getSimulatedTime() {
  const config = db.prepare('SELECT value FROM system_config WHERE key = ?').get('simulated_time_offset_hours');
  const offsetHours = config ? parseFloat(config.value) : 0;
  const now = new Date();
  return {
    realTime: now.toISOString(),
    offsetHours: offsetHours,
    simulatedTime: new Date(now.getTime() + offsetHours * 60 * 60 * 1000).toISOString()
  };
}

// 1. Users API (Demo Auth Role Simulation)
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users').all();
  res.json(users);
});

// 2. System Time Simulation API
app.get('/api/system-config', (req, res) => {
  res.json(getSimulatedTime());
});

app.post('/api/system-config/fast-forward', (req, res) => {
  const { hours } = req.body;
  const currentConfig = db.prepare('SELECT value FROM system_config WHERE key = ?').get('simulated_time_offset_hours');
  const currentOffset = currentConfig ? parseFloat(currentConfig.value) : 0;
  const newOffset = currentOffset + (parseFloat(hours) || 0);

  db.prepare('UPDATE system_config SET value = ? WHERE key = ?').run(newOffset.toString(), 'simulated_time_offset_hours');
  res.json({ message: `Fast-forwarded time by ${hours} hour(s).`, ...getSimulatedTime() });
});

app.post('/api/system-config/reset-time', (req, res) => {
  db.prepare('UPDATE system_config SET value = ? WHERE key = ?').run('0', 'simulated_time_offset_hours');
  res.json({ message: 'Simulated time reset to real time.', ...getSimulatedTime() });
});

// 3. Phase 4 Search API
app.get('/api/search', (req, res) => {
  const { q, role, userId, category, priority, state, assignee } = req.query;
  const results = searchIncidents(q, role, userId, category, priority, state, assignee);
  res.json(results);
});

// 4. Phase 4 Notifications API
app.get('/api/notifications', (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required.' });
  const notifications = getNotificationsForUser(userId);
  res.json(notifications);
});

// 5. Phase 4 Agent Workload API
app.get('/api/workload', (req, res) => {
  const agents = db.prepare("SELECT id, name, email FROM users WHERE role = 'AGENT'").all();
  const workload = agents.map(agent => ({
    ...agent,
    activeWorkload: getAgentWorkload(agent.id)
  }));
  res.json(workload);
});

// 6. Phase 4 Holiday Calendar API
app.get('/api/holidays', (req, res) => {
  const holidays = db.prepare('SELECT * FROM holidays ORDER BY holiday_date ASC').all();
  res.json(holidays);
});

app.post('/api/holidays', (req, res) => {
  const { holidayDate, name } = req.body;
  if (!holidayDate || !name) return res.status(400).json({ error: 'holidayDate and name required.' });

  const id = `hol-${Date.now()}`;
  db.prepare('INSERT OR REPLACE INTO holidays (id, holiday_date, name, is_active) VALUES (?, ?, ?, 1)')
    .run(id, holidayDate, name);

  res.status(201).json({ message: 'Holiday added to business calendar.', id });
});

// 7. Tickets Queue API
app.get('/api/tickets', (req, res) => {
  const { role, userId, filter } = req.query;
  const { simulatedTime } = getSimulatedTime();

  let query = 'SELECT t.*, c.name as customer_name, a.name as agent_name FROM tickets t LEFT JOIN users c ON t.customer_id = c.id LEFT JOIN users a ON t.agent_id = a.id';
  const params = [];

  if (role === 'CUSTOMER' && userId) {
    query += ' WHERE t.customer_id = ?';
    params.push(userId);
  } else if (role === 'AGENT' && userId) {
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
      `).run(`act-esc-${Date.now()}`, ticket.id, 'mgr-1', 'Ticket automatically escalated due to At Risk SLA threshold', simulatedTime);

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
  if (filter === 'AT_RISK') {
    filteredTickets = evaluatedTickets.filter(t => t.sla_state === 'AT_RISK');
  } else if (filter === 'OVERDUE') {
    filteredTickets = evaluatedTickets.filter(t => t.sla_state === 'OVERDUE');
  } else if (filter === 'OPEN') {
    filteredTickets = evaluatedTickets.filter(t => t.state !== 'CLOSED');
  }

  res.json(filteredTickets);
});

// 8. Ticket Detail API (IMS Operational Workspace)
app.get('/api/tickets/:id', (req, res) => {
  const { role } = req.query;
  const ticket = db.prepare(`
    SELECT t.*, c.name as customer_name, a.name as agent_name 
    FROM tickets t 
    LEFT JOIN users c ON t.customer_id = c.id 
    LEFT JOIN users a ON t.agent_id = a.id 
    WHERE t.id = ?
  `).get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const { simulatedTime } = getSimulatedTime();
  const sla = evaluateTicketSLA(ticket, simulatedTime);
  const activities = db.prepare('SELECT a.*, u.name as actor_name FROM activity_logs a LEFT JOIN users u ON a.actor_id = u.id WHERE ticket_id = ? ORDER BY created_at ASC').all(ticket.id);

  // Internal Work notes (Hidden from Customer role)
  let workNotes = [];
  if (role === 'AGENT' || role === 'MANAGER') {
    workNotes = db.prepare('SELECT w.*, u.name as actor_name FROM work_notes w LEFT JOIN users u ON w.actor_id = u.id WHERE ticket_id = ? ORDER BY created_at ASC').all(ticket.id);
  }

  res.json({
    ...ticket,
    sla_state: sla.slaState,
    response_mins_remaining: sla.responseMinsRemaining,
    resolution_mins_remaining: sla.resolutionMinsRemaining,
    activities,
    workNotes
  });
});

// 9. Create Ticket API (INC000000x Prefix, Auto-Assigned, Business Hours SLA)
app.post('/api/tickets', (req, res) => {
  const { title, description, category, priority, customerId } = req.body;

  if (!title || !category || !priority || !customerId) {
    return res.status(400).json({ error: 'Title, category, priority, and customerId are required.' });
  }

  // Generate persistent sequential INC number
  const countRow = db.prepare('SELECT COUNT(*) as count FROM tickets').get();
  const num = (countRow.count || 0) + 1;
  const ticketId = `INC${String(num).padStart(7, '0')}`;

  const { simulatedTime } = getSimulatedTime();
  const createdDate = new Date(simulatedTime);

  // Auto-Assignment Engine calculation
  const assignedAgentId = findTargetAgent(category, priority);

  // Business Hours SLA calculation
  const responseDue = addBusinessMinutes(createdDate, 4 * 60).toISOString();
  const resolutionDue = addBusinessMinutes(createdDate, 16 * 60).toISOString();

  db.prepare(`
    INSERT INTO tickets (
      id, title, description, category, priority, state, customer_id, agent_id, 
      created_at, response_due_at, resolution_due_at, is_escalated
    ) VALUES (?, ?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, 0)
  `).run(
    ticketId, title, description || '', category, priority, customerId,
    assignedAgentId, createdDate.toISOString(), responseDue, resolutionDue
  );

  // Log creation activity
  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'CREATED', ?, ?)
  `).run(
    `act-${Date.now()}`, ticketId, customerId,
    `Incident ${ticketId} created and auto-assigned to ${assignedAgentId || 'Unassigned'}`,
    createdDate.toISOString()
  );

  // Dispatch Notification
  if (assignedAgentId) {
    sendNotification(ticketId, 'ASSIGNED', assignedAgentId, `New Incident ${ticketId} assigned to you.`, simulatedTime);
  }

  res.status(201).json({ ticketId, message: `Incident ${ticketId} created successfully.`, assignedAgentId });
});

// 10. Ticket State Update API
app.patch('/api/tickets/:id/state', (req, res) => {
  const { state, actorId, comment, resolutionNotes } = req.body;
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const { simulatedTime } = getSimulatedTime();
  let respondedAt = ticket.responded_at;
  let resolvedAt = ticket.resolved_at;
  let closedAt = ticket.closed_at;

  // Track first agent response
  if (!respondedAt && actorId && actorId.startsWith('agent')) {
    respondedAt = simulatedTime;
  }

  // Track resolution
  if (state === 'RESOLVED' && !resolvedAt) {
    resolvedAt = simulatedTime;
  }

  // Track closure
  if (state === 'CLOSED' && !closedAt) {
    closedAt = simulatedTime;
  }

  db.prepare('UPDATE tickets SET state = ?, responded_at = ?, resolved_at = ?, closed_at = ?, resolution_notes = COALESCE(?, resolution_notes) WHERE id = ?')
    .run(state, respondedAt, resolvedAt, closedAt, resolutionNotes || null, ticket.id);

  // Log activity
  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'STATE_CHANGE', ?, ?)
  `).run(
    `act-${Date.now()}`, ticket.id, actorId || 'system',
    `Status changed to ${state}. ${comment ? 'Comment: ' + comment : ''}`,
    simulatedTime
  );

  // Dispatch Notification
  sendNotification(ticket.id, state, ticket.customer_id, `Status of incident ${ticket.id} changed to ${state}.`, simulatedTime);

  res.json({ message: `Status updated to ${state}.` });
});

// 11. Add Internal Work Note API (Agent / Manager Only)
app.post('/api/tickets/:id/work-notes', (req, res) => {
  const { note, actorId } = req.body;
  if (!note || !actorId) return res.status(400).json({ error: 'Note and actorId required.' });

  const { simulatedTime } = getSimulatedTime();
  const noteId = `note-${Date.now()}`;

  db.prepare(`
    INSERT INTO work_notes (id, ticket_id, actor_id, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(noteId, req.params.id, actorId, note, simulatedTime);

  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'WORK_NOTE', ?, ?)
  `).run(`act-${Date.now()}`, req.params.id, actorId, `Added internal work note: "${note.substring(0, 40)}..."`, simulatedTime);

  res.status(201).json({ message: 'Work note recorded.' });
});

// 12. Reassign Ticket API (Manager Action)
app.patch('/api/tickets/:id/reassign', (req, res) => {
  const { agentId, actorId } = req.body;
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id);

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const { simulatedTime } = getSimulatedTime();
  const prevAgentId = ticket.agent_id || 'Unassigned';

  db.prepare('UPDATE tickets SET agent_id = ? WHERE id = ?').run(agentId, ticket.id);

  db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, 'REASSIGNED', ?, ?)
  `).run(`act-${Date.now()}`, ticket.id, actorId || 'mgr-1', `Ticket reassigned from ${prevAgentId} to ${agentId}`, simulatedTime);

  sendNotification(ticket.id, 'REASSIGNED', agentId, `Incident ${ticket.id} reassigned to you.`, simulatedTime);

  res.json({ message: 'Ticket reassigned successfully.' });
});

// 13. Assignment Rules API (Manager Admin)
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
  db.prepare('DELETE FROM assignment_rules WHERE id = ?').run(req.params.id);
  res.json({ message: 'Rule deleted.' });
});

// 14. Manager Dashboard Metrics API
app.get('/api/dashboard-metrics', (req, res) => {
  const { simulatedTime } = getSimulatedTime();
  const tickets = db.prepare('SELECT * FROM tickets').all();

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
