/**
 * DeskFlow Search Engine
 * Provides case-insensitive multi-field search over tickets, comments, work notes, and activity timeline.
 * Enforces role isolation (Customer receives only own tickets; Work Notes excluded from Customer search).
 */

const db = require('./db');

function searchIncidents(query, role, userId, categoryFilter, priorityFilter, stateFilter, assigneeFilter) {
  if (!query && !categoryFilter && !priorityFilter && !stateFilter && !assigneeFilter) {
    return [];
  }

  let sql = `
    SELECT DISTINCT t.*, c.name as customer_name, a.name as agent_name 
    FROM tickets t 
    LEFT JOIN users c ON t.customer_id = c.id 
    LEFT JOIN users a ON t.agent_id = a.id 
    LEFT JOIN activity_logs act ON act.ticket_id = t.id 
    LEFT JOIN work_notes wn ON wn.ticket_id = t.id 
    WHERE 1=1
  `;
  const params = [];

  // Role Security Isolation
  if (role === 'CUSTOMER') {
    sql += ' AND t.customer_id = ?';
    params.push(userId);
  } else if (role === 'AGENT') {
    sql += ' AND (t.agent_id = ? OR t.agent_id IS NULL)';
    params.push(userId);
  }

  // Full-text & Metadata matching
  if (query) {
    const term = `%${query.trim()}%`;
    if (role === 'CUSTOMER') {
      sql += ` AND (t.id LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR t.category LIKE ? OR act.content LIKE ?)`;
      params.push(term, term, term, term, term);
    } else {
      sql += ` AND (t.id LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR t.category LIKE ? OR c.name LIKE ? OR a.name LIKE ? OR act.content LIKE ? OR wn.note LIKE ?)`;
      params.push(term, term, term, term, term, term, term, term);
    }
  }

  // Optional faceted filters
  if (categoryFilter && categoryFilter !== 'ALL') {
    sql += ' AND t.category = ?';
    params.push(categoryFilter);
  }
  if (priorityFilter && priorityFilter !== 'ALL') {
    sql += ' AND t.priority = ?';
    params.push(priorityFilter);
  }
  if (stateFilter && stateFilter !== 'ALL') {
    sql += ' AND t.state = ?';
    params.push(stateFilter);
  }
  if (assigneeFilter && assigneeFilter !== 'ALL') {
    sql += ' AND t.agent_id = ?';
    params.push(assigneeFilter);
  }

  sql += ' ORDER BY t.created_at DESC';

  return db.prepare(sql).all(...params);
}

module.exports = {
  searchIncidents
};
