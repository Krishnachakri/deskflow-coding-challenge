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
      id, title, description, service_area, service_type, category, priority, state, customer_id, agent_id, 
      created_at, response_due_at, resolution_due_at, responded_at, resolved_at, closed_at, is_escalated, resolution_notes, info_requested
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activity_logs (id, ticket_id, actor_id, activity_type, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertWorkNote = db.prepare(`
    INSERT INTO work_notes (id, ticket_id, actor_id, note, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // 1. INC0000001 (Hardware & Devices - P2 - AT_RISK & Escalated)
  const ticket1Created = new Date(now.getTime() - (3 * 60 * 60 * 1000 + 15 * 60 * 1000));
  const ticket1ResponseDue = addBusinessMinutes(now, 45).toISOString();
  const ticket1ResolutionDue = addBusinessMinutes(now, 12 * 60).toISOString();

  insertTicket.run(
    'INC0000001', 'Laptop display screen flickering randomly', 'Display goes black every few minutes when connected to external monitor.',
    'Hardware & Devices', 'Hardware Repair/Replacement', 'HARDWARE', 'P2', 'IN_PROGRESS', 'cust-1', 'agent-1',
    ticket1Created.toISOString(), ticket1ResponseDue, ticket1ResolutionDue, null, null, null, 1, null, null
  );

  insertActivity.run('act-001a', 'INC0000001', 'cust-1', 'CREATED', 'Incident INC0000001 raised by Carol Customer', ticket1Created.toISOString());
  insertActivity.run('act-001b', 'INC0000001', 'mgr-1', 'ASSIGNED', 'Automatically assigned to Alice Agent via Rule #2 (HARDWARE P2)', ticket1Created.toISOString());
  insertWorkNote.run('note-001', 'INC0000001', 'agent-1', 'Checked display cable hardware and graphics driver version. Pending physical display replacement.', ticket1Created.toISOString());

  // 2. INC0000002 (Software Services - P1 - OVERDUE)
  const ticket2Created = new Date(now.getTime() - (6 * 60 * 60 * 1000));
  const ticket2ResponseDue = new Date(now.getTime() - (2 * 60 * 60 * 1000)).toISOString();
  const ticket2ResolutionDue = addBusinessMinutes(now, 8 * 60).toISOString();

  insertTicket.run(
    'INC0000002', 'VPN authentication failing for remote users', 'Unable to connect to internal corporate portal after security patch.',
    'Software Services', 'Application Failure', 'SOFTWARE', 'P1', 'IN_PROGRESS', 'cust-1', 'agent-2',
    ticket2Created.toISOString(), ticket2ResponseDue, ticket2ResolutionDue, null, null, null, 1, null, null
  );

  insertActivity.run('act-002a', 'INC0000002', 'cust-1', 'CREATED', 'Incident INC0000002 raised by Carol Customer', ticket2Created.toISOString());
  insertActivity.run('act-002b', 'INC0000002', 'mgr-1', 'ASSIGNED', 'Automatically assigned to Dave Agent via Rule #1 (SOFTWARE P1)', ticket2Created.toISOString());
  insertWorkNote.run('note-002', 'INC0000002', 'agent-2', 'Investigating radius server certificate validation error. Response SLA breached by 2 hours.', ticket2Created.toISOString());

  // 3. INC0000003 (Software Services - P3 - IN_PROGRESS)
  const ticket3Created = new Date(now.getTime() - (45 * 60 * 1000));
  const ticket3ResponseDue = addBusinessMinutes(now, 195).toISOString();
  const ticket3ResolutionDue = addBusinessMinutes(now, 15 * 60).toISOString();

  insertTicket.run(
    'INC0000003', 'SSO Login Session Expiration Error', 'Users are logged out every 5 minutes unexpectedly.',
    'Software Services', 'Account Access & Permissions', 'SOFTWARE', 'P3', 'IN_PROGRESS', 'cust-1', 'agent-1',
    ticket3Created.toISOString(), ticket3ResponseDue, ticket3ResolutionDue, new Date(now.getTime() - (15 * 60 * 1000)).toISOString(), null, null, 0, null, null
  );

  insertActivity.run('act-003a', 'INC0000003', 'cust-1', 'CREATED', 'Incident INC0000003 raised by Carol Customer', ticket3Created.toISOString());

  // 4. INC0000004 (Billing & Subscriptions - P2 - PENDING_CUSTOMER)
  const ticket4Created = new Date(now.getTime() - (2 * 60 * 60 * 1000));
  const ticket4ResponseDue = addBusinessMinutes(now, 120).toISOString();
  const ticket4ResolutionDue = addBusinessMinutes(now, 14 * 60).toISOString();

  insertTicket.run(
    'INC0000004', 'Discrepancy in monthly compliance billing invoice', 'Invoice #9021 contains incorrect user seat count.',
    'Billing & Subscriptions', 'Invoice & Payment Discrepancy', 'BILLING', 'P2', 'PENDING_CUSTOMER', 'cust-1', 'agent-1',
    ticket4Created.toISOString(), ticket4ResponseDue, ticket4ResolutionDue, new Date(now.getTime() - (1 * 60 * 60 * 1000)).toISOString(), null, null, 0, null, 'Please send the PO number and transaction receipt.'
  );

  insertActivity.run('act-004a', 'INC0000004', 'cust-1', 'CREATED', 'Incident INC0000004 raised by Carol Customer', ticket4Created.toISOString());

  // 5. INC0000005 (Infrastructure & Network - P3 - RESOLVED)
  const ticket5Created = new Date(now.getTime() - (5 * 60 * 60 * 1000));
  const ticket5ResponseDue = addBusinessMinutes(now, 0).toISOString();
  const ticket5ResolutionDue = addBusinessMinutes(now, 10 * 60).toISOString();

  insertTicket.run(
    'INC0000005', 'Secondary DNS Failover Latency Spike', 'Intermittent timeout on regional DNS resolution.',
    'Infrastructure & Network', 'System Configuration', 'HARDWARE', 'P3', 'RESOLVED', 'cust-2', 'agent-2',
    ticket5Created.toISOString(), ticket5ResponseDue, ticket5ResolutionDue, new Date(now.getTime() - (4 * 60 * 60 * 1000)).toISOString(), new Date(now.getTime() - (30 * 60 * 1000)).toISOString(), null, 0, 'Flushed DNS cache and updated BGP routing policy to secondary node.', null
  );

  insertActivity.run('act-005a', 'INC0000005', 'cust-2', 'CREATED', 'Incident INC0000005 raised by Charlie Customer', ticket5Created.toISOString());

  // 6. INC0000006 (Software Services - P4 - CLOSED)
  const ticket6Created = new Date(now.getTime() - (24 * 60 * 60 * 1000));
  const ticket6ResponseDue = addBusinessMinutes(now, 0).toISOString();
  const ticket6ResolutionDue = addBusinessMinutes(now, 0).toISOString();

  insertTicket.run(
    'INC0000006', 'Request for analytics export permission', 'Need CSV dump access for Q3 compliance report.',
    'Software Services', 'Application Failure', 'SOFTWARE', 'P4', 'CLOSED', 'cust-1', 'agent-1',
    ticket6Created.toISOString(), ticket6ResponseDue, ticket6ResolutionDue, new Date(now.getTime() - (20 * 60 * 60 * 1000)).toISOString(), new Date(now.getTime() - (10 * 60 * 60 * 1000)).toISOString(), new Date(now.getTime() - (5 * 60 * 60 * 1000)).toISOString(), 0, 'Granted read-only analytics role in security console.', null
  );

  insertActivity.run('act-006a', 'INC0000006', 'cust-1', 'CREATED', 'Incident INC0000006 raised by Carol Customer', ticket6Created.toISOString());

  // 7. INC0000007 (Hardware & Devices - P4 - NEW)
  const ticket7Created = new Date(now.getTime() - (10 * 60 * 1000));
  const ticket7ResponseDue = addBusinessMinutes(now, 230).toISOString();
  const ticket7ResolutionDue = addBusinessMinutes(now, 15.9 * 60).toISOString();

  insertTicket.run(
    'INC0000007', 'Request for dual monitor DisplayPort cable', 'Workstation setup requires replacement 4K DP cable.',
    'Hardware & Devices', 'Hardware Repair/Replacement', 'HARDWARE', 'P4', 'NEW', 'cust-2', 'agent-2',
    ticket7Created.toISOString(), ticket7ResponseDue, ticket7ResolutionDue, null, null, null, 0, null, null
  );

  insertActivity.run('act-007a', 'INC0000007', 'cust-2', 'CREATED', 'Incident INC0000007 raised by Charlie Customer', ticket7Created.toISOString());

  console.log('Seeded DeskFlow demo tickets cleanly covering all tabs (At Risk, Overdue, In Progress, Pending, Resolved, Closed, New).');
}

if (require.main === module) {
  seedDemoTickets(true);
}

module.exports = seedDemoTickets;
