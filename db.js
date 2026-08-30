const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'deskflow.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Pure DeskFlow IMS Database Schema + Authentication + Conversation Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('CUSTOMER', 'AGENT', 'MANAGER')),
    password_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS assignment_rules (
    id TEXT PRIMARY KEY,
    rule_order INTEGER NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    target_agent_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    use_workload_balance INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(target_agent_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    service_area TEXT NOT NULL DEFAULT 'Software Services',
    service_type TEXT NOT NULL DEFAULT 'Application Failure',
    category TEXT DEFAULT 'SOFTWARE',
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
    info_requested TEXT,
    FOREIGN KEY(customer_id) REFERENCES users(id),
    FOREIGN KEY(agent_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS conversation_entries (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('CUSTOMER_MESSAGE', 'AGENT_REQUEST', 'CUSTOMER_REPLY')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS work_notes (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id),
    FOREIGN KEY(actor_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES tickets(id)
  );

  CREATE TABLE IF NOT EXISTS holidays (
    id TEXT PRIMARY KEY,
    holiday_date TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
  );
`);

// Safe column additions for existing sqlite file
try { db.exec('ALTER TABLE users ADD COLUMN username TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE tickets ADD COLUMN info_requested TEXT'); } catch (e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN service_area TEXT DEFAULT 'Software Services'"); } catch (e) {}
try { db.exec("ALTER TABLE tickets ADD COLUMN service_type TEXT DEFAULT 'Application Failure'"); } catch (e) {}
try { db.exec('ALTER TABLE assignment_rules ADD COLUMN use_workload_balance INTEGER NOT NULL DEFAULT 0'); } catch (e) {}

module.exports = db;
