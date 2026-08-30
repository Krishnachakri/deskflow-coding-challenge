/**
 * DeskFlow Rule-Based Auto-Assignment Engine
 * Evaluates ticket category and priority against admin-configured routing rules.
 */

const db = require('./db');

/**
 * Finds matching target agent ID based on active routing rules.
 */
function findTargetAgent(category, priority) {
  const rules = db.prepare(`
    SELECT * FROM assignment_rules 
    WHERE is_active = 1 
    ORDER BY rule_order ASC
  `).all();

  for (const rule of rules) {
    const categoryMatches = rule.category === 'ALL' || rule.category === category;
    const priorityMatches = rule.priority === 'ALL' || rule.priority === priority;

    if (categoryMatches && priorityMatches) {
      return rule.target_agent_id;
    }
  }

  return 'agent-1'; // Default fallback to Alice Agent
}

module.exports = {
  findTargetAgent
};
