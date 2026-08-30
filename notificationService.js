/**
 * DeskFlow Notification Service
 * In-memory / log-mode event notification dispatcher.
 * Enforces idempotency so SLA evaluations don't produce duplicate notification entries.
 */

const db = require('./db');

function sendNotification(ticketId, eventType, recipientId, message, timestamp) {
  if (!ticketId || !eventType || !recipientId) return null;

  const now = timestamp || new Date().toISOString();

  // Idempotency check for SLA-triggered events
  if (['AT_RISK', 'AUTO_ESCALATED', 'OVERDUE'].includes(eventType)) {
    const existing = db.prepare(`
      SELECT id FROM notifications 
      WHERE ticket_id = ? AND event_type = ? AND recipient_id = ?
    `).get(ticketId, eventType, recipientId);

    if (existing) {
      return existing.id; // Already dispatched once
    }
  }

  const notificationId = `notif-${Date.now()}-${Math.floor(Math.random()*1000)}`;

  db.prepare(`
    INSERT INTO notifications (id, ticket_id, event_type, recipient_id, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(notificationId, ticketId, eventType, recipientId, message, now);

  console.log(`[NOTIFICATION DISPATCHED] Event: ${eventType} | Recipient: ${recipientId} | Ticket: ${ticketId}`);
  return notificationId;
}

function getNotificationsForUser(userId) {
  return db.prepare(`
    SELECT n.*, t.title as ticket_title 
    FROM notifications n 
    LEFT JOIN tickets t ON n.ticket_id = t.id 
    WHERE n.recipient_id = ? 
    ORDER BY n.created_at DESC
  `).all(userId);
}

module.exports = {
  sendNotification,
  getNotificationsForUser
};
