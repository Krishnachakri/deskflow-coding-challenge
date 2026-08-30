/**
 * DeskFlow Rule-Based Auto-Assignment & Workload Balancing Engine
 * Evaluates category/priority rules and optionally balances workload across active agents.
 */

const db = require('./db');

/**
 * Calculates active open ticket workload count for an agent.
 */
function getAgentWorkload(agentId) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM tickets 
    WHERE agent_id = ? AND state NOT IN ('RESOLVED', 'CLOSED')
  `).get(agentId);
  return row ? row.count : 0;
}

/**
 * Finds target agent ID based on active routing rules and workload balancing settings.
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
      // Workload Balancing Mode: If enabled, select among active agents with lowest workload
      if (rule.use_workload_balance === 1) {
        const agents = db.prepare("SELECT id FROM users WHERE role = 'AGENT'").all();
        if (agents.length > 0) {
          let lowestAgent = agents[0].id;
          let minWorkload = getAgentWorkload(lowestAgent);

          for (let i = 1; i < agents.length; i++) {
            const load = getAgentWorkload(agents[i].id);
            if (load < minWorkload) {
              minWorkload = load;
              lowestAgent = agents[i].id;
            }
          }
          return lowestAgent;
        }
      }

      return rule.target_agent_id;
    }
  }

  return 'agent-1'; // Default fallback to Alice Agent
}

module.exports = {
  findTargetAgent,
  getAgentWorkload
};
