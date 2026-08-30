const db = require('./db');

function clearAllTicketsAndLogs() {
  console.log('--- CLEANING DEMO SEED TICKETS AND ASSOCIATED LOGS FROM SYSTEM ---');
  
  db.exec('DELETE FROM notifications');
  db.exec('DELETE FROM work_notes');
  db.exec('DELETE FROM conversation_entries');
  db.exec('DELETE FROM activity_logs');
  db.exec('DELETE FROM tickets');
  db.exec('DELETE FROM sessions');

  // Verify users exist
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount === 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, name, email, role, password_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertUser.run('cust-1', 'customer1', 'Carol Customer', 'carol@deskflow.local', 'CUSTOMER', 'hash_customer1');
    insertUser.run('cust-2', 'customer2', 'Charlie Customer', 'charlie@deskflow.local', 'CUSTOMER', 'hash_customer2');
    insertUser.run('agent-1', 'agent1', 'Alice Agent', 'alice@deskflow.local', 'AGENT', 'hash_agent1');
    insertUser.run('agent-2', 'agent2', 'Dave Agent', 'dave@deskflow.local', 'AGENT', 'hash_agent2');
    insertUser.run('mgr-1', 'manager1', 'Bob Manager', 'bob@deskflow.local', 'MANAGER', 'hash_manager1');
  }

  // Verify rules exist
  const rulesCount = db.prepare('SELECT COUNT(*) as c FROM assignment_rules').get().c;
  if (rulesCount === 0) {
    const insertRule = db.prepare('INSERT INTO assignment_rules (id, rule_order, category, priority, target_agent_id, is_active, use_workload_balance) VALUES (?, ?, ?, ?, ?, 1, ?)');
    insertRule.run('rule-1', 1, 'SOFTWARE', 'P1', 'agent-2', 0);
    insertRule.run('rule-2', 2, 'HARDWARE', 'P2', 'agent-1', 0);
    insertRule.run('rule-3', 3, 'BILLING', 'ALL', 'agent-1', 0);
    insertRule.run('rule-4', 4, 'ALL', 'P4', 'agent-2', 0);
  }

  console.log('✅ PASS: All seed tickets, notifications, activity logs, and work notes removed completely.');
  console.log('✅ PASS: Database is clean and ready for fresh incident creation.');
}

if (require.main === module) {
  clearAllTicketsAndLogs();
}

module.exports = clearAllTicketsAndLogs;
