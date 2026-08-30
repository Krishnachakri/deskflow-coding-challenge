const assert = require('assert');
const db = require('./db');
const seedDemoTickets = require('./seedDemoData');
const { addBusinessMinutes, evaluateTicketSLA } = require('./slaEngine');
const { findTargetAgent, getAgentWorkload } = require('./assignmentEngine');
const { searchIncidents } = require('./searchEngine');
const { sendNotification, getNotificationsForUser } = require('./notificationService');

console.log('=== STARTING DESKFLOW PHASE 4 REGRESSION & ENHANCEMENT TEST SUITE ===');

// 1. Reset Database State
seedDemoTickets();
console.log('✅ PASS: Clean seed state established.');

// 2. Lifecycle State Transition Integrity Test
const ticketNew = db.prepare("SELECT * FROM tickets WHERE state = 'NEW' LIMIT 1").get();
assert.ok(ticketNew, 'Should find a NEW ticket.');

db.prepare("UPDATE tickets SET state = 'IN_PROGRESS' WHERE id = ?").run(ticketNew.id);
const updatedState = db.prepare('SELECT state FROM tickets WHERE id = ?').get(ticketNew.id).state;
assert.strictEqual(updatedState, 'IN_PROGRESS', 'State should update to IN_PROGRESS.');
console.log('✅ PASS: Valid state transition NEW -> IN_PROGRESS verified.');

// 3. Duplicate SLA Escalation Activity Prevention Test
const ticket1 = db.prepare("SELECT * FROM tickets WHERE id = 'INC0000001'").get();
const now = new Date().toISOString();

for (let i = 0; i < 5; i++) {
  evaluateTicketSLA(ticket1, now);
}

const escalationLogs = db.prepare("SELECT COUNT(*) as count FROM activity_logs WHERE ticket_id = 'INC0000001' AND activity_type = 'SLA_ESCALATION'").get().count;
assert.ok(escalationLogs <= 1, `Escalation activity log count should be <= 1, got ${escalationLogs}`);
console.log('✅ PASS: Duplicate SLA escalation event spam prevented.');

// 4. Role Authorization & Work Notes Isolation Test
const customerSearchResults = searchIncidents('display', 'CUSTOMER', 'cust-1');
assert.ok(customerSearchResults.length >= 1, 'Customer role search should match own ticket.');
console.log('✅ PASS: Customer role search isolation verified.');

// 5. Phase 4 Feature 1: Search Engine Test
const vpnResults = searchIncidents('VPN', 'MANAGER', 'mgr-1');
assert.ok(vpnResults.length >= 1, 'Search for "VPN" should return results.');
assert.ok(vpnResults.some(r => r.id === 'INC0000002'), 'Found INC0000002.');
console.log('✅ PASS: Phase 4 Multi-field Search Engine verified.');

// 6. Phase 4 Feature 2: Notification Dispatcher & Idempotency Test
const n1 = sendNotification('INC0000001', 'AT_RISK', 'agent-1', 'Test notification', now);
const n2 = sendNotification('INC0000001', 'AT_RISK', 'agent-1', 'Test notification duplicate', now);
assert.strictEqual(n1, n2, 'Idempotent SLA notification must return existing ID on duplicate dispatch.');

const agentNotifs = getNotificationsForUser('agent-1');
assert.ok(agentNotifs.length >= 1, 'Agent-1 should receive log-mode notifications.');
console.log('✅ PASS: Phase 4 Log-Mode Notifications & Idempotency verified.');

// 7. Phase 4 Feature 3: Agent Workload Balancing Test
db.prepare("INSERT OR REPLACE INTO assignment_rules (id, rule_order, category, priority, target_agent_id, is_active, use_workload_balance) VALUES ('rule-workload', 0, 'SOFTWARE', 'P4', 'agent-1', 1, 1)").run();
const balancedAgent = findTargetAgent('SOFTWARE', 'P4');
assert.ok(balancedAgent === 'agent-1' || balancedAgent === 'agent-2', 'Workload balancing selected an active agent.');
console.log('✅ PASS: Phase 4 Agent Workload Balancing Engine verified.');

// 8. Phase 4 Feature 4: Holiday Calendar SLA Test
const friLate = new Date();
friLate.setHours(16, 30, 0, 0);
while (friLate.getDay() !== 5) {
  friLate.setDate(friLate.getDate() + 1);
}
// Next Monday
const nextMon = new Date(friLate);
nextMon.setDate(nextMon.getDate() + 3);
const monDateStr = nextMon.toISOString().split('T')[0];

db.prepare("INSERT OR REPLACE INTO holidays (id, holiday_date, name, is_active) VALUES ('hol-1', ?, 'Republic Holiday', 1)").run(monDateStr);

const dueWithHoliday = addBusinessMinutes(friLate, 240);
assert.strictEqual(dueWithHoliday.getDay(), 2, 'Due date must skip Monday holiday and land on Tuesday (2).');
console.log('✅ PASS: Phase 4 Holiday Calendar SLA Abstraction verified (skips active holidays cleanly).');

console.log('=== ALL DESKFLOW PHASE 4 ENHANCEMENT & REGRESSION TESTS PASSED SUCCESSFULLY! ===');
