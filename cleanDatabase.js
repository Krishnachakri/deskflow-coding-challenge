const db = require('./db');

function cleanDatabaseCompletely() {
  console.log('--- PURGING ALL SEED DATA AND INCIDENT LOGS FROM SYSTEM ---');

  db.prepare('DELETE FROM conversation_entries').run();
  db.prepare('DELETE FROM work_notes').run();
  db.prepare('DELETE FROM activity_logs').run();
  db.prepare('DELETE FROM notifications').run();
  db.prepare('DELETE FROM tickets').run();

  console.log('✅ PASS: All tickets, conversation threads, work notes, activity logs, and notifications removed completely.');
  console.log('✅ PASS: DeskFlow database is completely clean.');
}

cleanDatabaseCompletely();
