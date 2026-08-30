const assert = require('assert');
const db = require('./db');
const seedDemoTickets = require('./seedDemoData');
const { addBusinessMinutes, evaluateTicketSLA } = require('./slaEngine');
const { findTargetAgent } = require('./assignmentEngine');

console.log('--- STARTING DESKFLOW INCIDENT MANAGEMENT SERVICE DESK VERIFICATION ---');

// 1. Test Seed Data
seedDemoTickets();
const tickets = db.prepare('SELECT * FROM tickets').all();
assert(tickets.length >= 5, 'Should have seeded DeskFlow demo tickets.');
console.log('✅ PASS: Database seeded with demo tickets.');

// 2. Test Persistent INC Ticket Numbering
const ticket1 = db.prepare('SELECT * FROM tickets WHERE id = ?').get('INC0000001');
const ticket2 = db.prepare('SELECT * FROM tickets WHERE id = ?').get('INC0000002');

assert.strictEqual(ticket1.id, 'INC0000001', 'Ticket 1 should have ID INC0000001.');
assert.strictEqual(ticket2.id, 'INC0000002', 'Ticket 2 should have ID INC0000002.');
console.log('✅ PASS: INC000000x ticket numbering verified.');

// 3. Test Rule-Based Auto-Assignment
const softwareP1Agent = findTargetAgent('SOFTWARE', 'P1');
assert.strictEqual(softwareP1Agent, 'agent-2', 'SOFTWARE + P1 should match Rule #1 -> agent-2 (Dave).');

const hardwareP2Agent = findTargetAgent('HARDWARE', 'P2');
assert.strictEqual(hardwareP2Agent, 'agent-1', 'HARDWARE + P2 should match Rule #2 -> agent-1 (Alice).');
console.log('✅ PASS: Auto-assignment engine correctly routes tickets based on category and priority.');

// 4. Test SLA Business Hours Math (Friday 15:00 + 4 working hours -> Monday 11:00)
const fri3pm = new Date('2026-08-28T15:00:00.000');
const dueMon = addBusinessMinutes(fri3pm, 240); // +4 working hours
assert.strictEqual(dueMon.getDay(), 1, 'Due date should be Monday.');
assert.strictEqual(dueMon.getHours(), 11, 'Due time should be 11:00 AM on Monday.');
console.log('✅ PASS: SLA Engine correctly skips non-working weekend hours.');

// 5. Test SLA At-Risk, Overdue, and Escalation Evaluation
const now = new Date();
const sla1 = evaluateTicketSLA(ticket1, now.toISOString());
const sla2 = evaluateTicketSLA(ticket2, now.toISOString());

assert.strictEqual(sla1.slaState, 'AT_RISK', 'Ticket INC0000001 should be evaluated as AT_RISK.');
assert.strictEqual(sla1.isEscalated, true, 'Ticket INC0000001 should trigger auto-escalation.');

assert.strictEqual(sla2.slaState, 'OVERDUE', 'Ticket INC0000002 should be evaluated as OVERDUE.');
assert.strictEqual(sla2.isEscalated, true, 'Ticket INC0000002 should trigger auto-escalation.');
console.log('✅ PASS: SLA Evaluator correctly flags AT_RISK (with auto-escalation) and OVERDUE tickets.');

// 6. Test Internal Work Notes & Activity Audit Timeline
const workNotes = db.prepare('SELECT * FROM work_notes WHERE ticket_id = ?').all('INC0000001');
assert.strictEqual(workNotes.length, 1, 'Ticket INC0000001 should have 1 internal work note.');

const activities = db.prepare('SELECT * FROM activity_logs WHERE ticket_id = ?').all('INC0000001');
assert(activities.length >= 2, 'Ticket INC0000001 should have activity logs recorded.');
console.log('✅ PASS: Internal Work Notes & Activity Audit Timeline recorded cleanly.');

console.log('--- ALL DESKFLOW IMS VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
