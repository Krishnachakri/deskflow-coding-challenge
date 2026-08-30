const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'deskflow.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Pure DeskFlow IMS Database Schema
db.exec(`
  DROP TABLE IF EXISTS work_notes;
  DROP TABLE IF EXISTS activity_logs;
  DROP TABLE IF EXISTS tickets;
  DROP TABLE IF EXISTS assignment_rules;
  DROP TABLE IF EXISTS users;
  DROP TABLE IF EXISTS system_config;

  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'AGENT', 'MANAGER'))
  );

  CREATE TABLE assignment_rules (
    id TEXT PRIMARY KEY,
    rule_order INTEGER NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    target_agent_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(target_agent_id) REFERENCES users(id)
  );

  CREATE TABLE tickets (
    id TEXT PRIMARY KEY, -- INC0000001 format
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('HARDWARE', 'SOFTWARE', 'BILLING', 'OTHER')),
    priority TEXT NOT NULL CHECK(priority IN ('P1', 'P2', 'P3', 'P4')),
    state TEXT NOT NULL CHECK(state IN ('NEW', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED')),
    customer_id TEXT NOT NULL,
    agent_id TEXT,
    created_at TEXT NOT NULL,
    response_due_at TEXT NOT NULL,
    resolution_due_at TEXT NOT NULL,
    responded_at TEXT,
    resolved_at TEXT,
    closed_at TEXT,
    is_escalated INTEGER NOT NULL DEFAULT 0,
    resolution_notes TEXT,
    FOREIGN KEY(customer_id) REFERENCES users(id),
    FOREIGN KEY(agent_id) REFERENCES users(id)
  );

  CREATE TABLE work_notes (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  );

  CREATE TABLE activity_logs (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  );

  CREATE TABLE system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

function seedDatabase() {
  // Seed Users
  const insertUser = db.prepare('INSERT OR REPLACE INTO users (id, name, email, role) VALUES (?, ?, ?, ?)');
  insertUser.run('cust-1', 'Carol Customer', 'carol@example.com', 'CUSTOMER');
  insertUser.run('agent-1', 'Alice Agent', 'alice@deskflow.com', 'AGENT');
  insertUser.run('agent-2', 'Dave Agent', 'dave@deskflow.com', 'AGENT');
  insertUser.run('mgr-1', 'Bob Manager', 'bob@deskflow.com', 'MANAGER');

  // Seed Assignment Rules
  const insertRule = db.prepare('INSERT OR REPLACE INTO assignment_rules (id, rule_order, category, priority, target_agent_id, is_active) VALUES (?, ?, ?, ?, ?, ?)');
  insertRule.run('rule-1', 1, 'SOFTWARE', 'P1', 'agent-2', 1);
  insertRule.run('rule-2', 2, 'HARDWARE', 'P2', 'agent-1', 1);
  insertRule.run('rule-3', 3, 'BILLING', 'P3', 'agent-1', 1);
  insertRule.run('rule-4', 4, 'ALL', 'ALL', 'agent-1', 1);

  // Initialize System Config
  const insertConfig = db.prepare('INSERT OR REPLACE INTO system_config (key, value) VALUES (?, ?)');
  insertConfig.run('simulated_time_offset_hours', '0');
}

seedDatabase();

module.exports = db;
