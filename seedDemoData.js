const db = require('./db');
const { addBusinessMinutes } = require('./slaEngine');

function seedDemoTickets(force = false) {
  const ticketCount = db.prepare('SELECT COUNT(*) as c FROM tickets').get().c;
  if (!force && ticketCount > 0) {
    return; // Preserve existing user tickets in database
  }

  const now = new Date();
  
  // Clean existing tables in correct order for foreign key constraints and isolated test state
  db.exec('DELETE FROM holidays');
  db.exec('DELETE FROM notifications');
  db.exec('DELETE FROM work_notes');
  db.exec('DELETE FROM conversation_entries');
  db.exec('DELETE FROM activity_logs');
  db.exec('DELETE FROM tickets');
  db.exec('DELETE FROM assignment_rules');
  db.exec('DELETE FROM sessions');
  db.exec('DELETE FROM users');

  // Seed Pre-defined Demo Users with Hashed Credentials
  const insertUser = db.prepare(`
    INSERT INTO users (id, username, name, email, role, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertUser.run('cust-1', 'customer1', 'Carol Customer', 'carol@deskflow.local', 'CUSTOMER', 'hash_customer1');
  insertUser.run('cust-2', 'customer2', 'Charlie Customer', 'charlie@deskflow.local', 'CUSTOMER', 'hash_customer2');
  insertUser.run('agent-1', 'agent1', 'Alice Agent', 'alice@deskflow.local', 'AGENT', 'hash_agent1');
  insertUser.run('agent-2', 'agent2', 'Dave Agent', 'dave@deskflow.local', 'AGENT', 'hash_agent2');
  insertUser.run('mgr-1', 'manager1', 'Bob Manager', 'bob@deskflow.local', 'MANAGER', 'hash_manager1');

  // Re-seed default assignment rules if table is empty
  const rulesCount = db.prepare('SELECT COUNT(*) as c FROM assignment_rules').get().c;
  if (rulesCount === 0) {
    const insertRule = db.prepare('INSERT INTO assignment_rules (id, rule_order, category, priority, target_agent_id, is_active, use_workload_balance) VALUES (?, ?, ?, ?, ?, 1, ?)');
    insertRule.run('rule-1', 1, 'SOFTWARE', 'P1', 'agent-2', 0);
    insertRule.run('rule-2', 2, 'HARDWARE', 'P2', 'agent-1', 0);
    insertRule.run('rule-3', 3, 'BILLING', 'ALL', 'agent-1', 0);
    insertRule.run('rule-4', 4, 'ALL', 'P4', 'agent-2', 0);
  }

  const insertTicket = db.prepare(`
    INSERT INTO tickets (
      id, title, description, category, priority, state, customer_id, agent_id, 
      created_at, response_due_at, resolution_due_at, responded_at, resolved_at, closed_at, is_escalated, resolution_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertWorkNote = db.prepare(`
    INSERT INTO work_notes (id, ticket_id, actor_id, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // 1. INC0000001 (HARDWARE - P2 - AT_RISK & Escalated)
  const ticket1Created = new Date(now.getTime() - (3 * 60 * 60 * 1000 + 45 * 60 * 1000));
  const ticket1ResponseDue = addBusinessMinutes(now, 15).toISOString();
  const ticket1ResolutionDue = addBusinessMinutes(now, 12 * 60).toISOString();

  insertTicket.run(
    'INC0000001', 'Laptop screen flickering randomly', 'Display goes black every few minutes when connected to external monitor.',
    'HARDWARE', 'P2', 'IN_PROGRESS', 'cust-1', 'agent-1',
    ticket1Created.toISOString(), ticket1ResponseDue, ticket1ResolutionDue, null, null, null, 1, null
  );

  insertActivity.run('act-001a', 'INC0000001', 'cust-1', 'CREATED', 'Incident INC0000001 raised by Carol Customer', ticket1Created.toISOString());
  insertActivity.run('act-001b', 'INC0000001', 'mgr-1', 'ASSIGNED', 'Automatically assigned to Alice Agent via Rule #2 (HARDWARE P2)', ticket1Created.toISOString());
  insertWorkNote.run('note-001', 'INC0000001', 'agent-1', 'Checked display cable hardware and graphics driver version. Pending physical display replacement.', ticket1Created.toISOString());

  // 2. INC0000002 (SOFTWARE - P1 - OVERDUE)
  const ticket2Created = new Date(now.getTime() - (6 * 60 * 60 * 1000));
  const ticket2ResponseDue = new Date(now.getTime() - (2 * 60 * 60 * 1000)).toISOString();
  const ticket2ResolutionDue = addBusinessMinutes(now, 8 * 60).toISOString();

  insertTicket.run(
    'INC0000002', 'VPN authentication failing for remote users', 'Unable to connect to internal corporate portal after security patch.',
    'SOFTWARE', 'P1', 'IN_PROGRESS', 'cust-1', 'agent-2',
    ticket2Created.toISOString(), ticket2ResponseDue, ticket2ResolutionDue, null, null, null, 1, null
  );

  insertActivity.run('act-002a', 'INC0000002', 'cust-1', 'CREATED', 'Incident INC0000002 raised by Carol Customer', ticket2Created.toISOString());
  insertActivity.run('act-002b', 'INC0000002', 'mgr-1', 'ASSIGNED', 'Automatically assigned to Dave Agent via Rule #1 (SOFTWARE P1)', ticket2Created.toISOString());
  insertWorkNote.run('note-002', 'INC0000002', 'agent-2', 'Investigating radius server certificate validation error. Response SLA breached by 2 hours.', ticket2Created.toISOString());

  // 3. INC0000003 (BILLING - P3 - NORMAL)
  const ticket3Created = new Date(now.getTime() - (30 * 60 * 1000));
  const ticket3ResponseDue = addBusinessMinutes(now, 210).toISOString();
  const ticket3ResolutionDue = addBusinessMinutes(now, 15 * 60).toISOString();

  insertTicket.run(
    'INC0000003', 'Request for updated monthly billing invoice', 'Need PDF invoice for tax compliance department.',
    'BILLING', 'P3', 'NEW', 'cust-1', 'agent-1',
    ticket3Created.toISOString(), ticket3ResponseDue, ticket3ResolutionDue, null, null, null, 0, null
  );

  insertActivity.run('act-003a', 'INC0000003', 'cust-1', 'CREATED', 'Incident INC0000003 raised by Carol Customer', ticket3Created.toISOString());

  // 4. INC0000004 (SOFTWARE - P2 - NORMAL)
  const ticket4Created = new Date(now.getTime() - (15 * 60 * 1000));
  const ticket4ResponseDue = addBusinessMinutes(now, 225).toISOString();
  const ticket4ResolutionDue = addBusinessMinutes(now, 15.5 * 60).toISOString();

  insertTicket.run(
    'INC0000004', 'Reporting portal dashboard loading slow', 'Dashboard initial query load takes >15 seconds.',
    'SOFTWARE', 'P2', 'NEW', 'cust-1', 'agent-1',
    ticket4Created.toISOString(), ticket4ResponseDue, ticket4ResolutionDue, null, null, null, 0, null
  );

  insertActivity.run('act-004a', 'INC0000004', 'cust-1', 'CREATED', 'Incident INC0000004 raised by Carol Customer', ticket4Created.toISOString());

  // 5. INC0000005 (OTHER - P4 - NORMAL) - Belongs to Charlie Customer (cust-2)
  const ticket5Created = new Date(now.getTime() - (20 * 60 * 1000));
  const ticket5ResponseDue = addBusinessMinutes(now, 220).toISOString();
  const ticket5ResolutionDue = addBusinessMinutes(now, 15.8 * 60).toISOString();

  insertTicket.run(
    'INC0000005', 'Request for additional monitor cable', 'Need DisplayPort cable for workstation setup.',
    'OTHER', 'P4', 'NEW', 'cust-2', 'agent-2',
    ticket5Created.toISOString(), ticket5ResponseDue, ticket5ResolutionDue, null, null, null, 0, null
  );

  insertActivity.run('act-005a', 'INC0000005', 'cust-2', 'CREATED', 'Incident INC0000005 raised by Charlie Customer', ticket5Created.toISOString());

  console.log('Seeded DeskFlow demo tickets: INC0000001 (At Risk), INC0000002 (Overdue), INC0000003 (Normal), INC0000004 (Normal), INC0000005 (Normal for cust-2).');
}

if (require.main === module) {
  seedDemoTickets(true);
}

module.exports = seedDemoTickets;
