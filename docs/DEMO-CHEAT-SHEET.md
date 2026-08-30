# DeskFlow — Demonstration Cheat Sheet & Judge Q&A Guide

## ⏱️ 60-Second Elevator Pitch
> *"DeskFlow is a lightweight Incident Management Service Desk built around one operational promise: respond within four working hours and resolve within two working days. When a customer raises an incident, the backend creates the incident, automatically routes it using configurable rules, and starts a business-hours SLA clock. As the SLA approaches its threshold, the system marks the ticket At Risk and automatically escalates it; if the deadline passes, it becomes Overdue. Customers, agents, and managers have tailored views, and managers can monitor open, at-risk, and overdue work and change routing rules without code changes."*

---

## 🏛️ System Architecture in 30 Seconds

```text
Browser UI (HTML5 / Vanilla JS / Light Enterprise CSS)
   │
   ▼ REST API (Express.js - server.js)
   │
   ├── Ticket Lifecycle & Work Notes
   ├── Assignment Engine (assignmentEngine.js - Rules & Workload Balancing)
   ├── SLA Engine (slaEngine.js - Business Hours 9-5 & Holiday Calendar)
   ├── Search Engine (searchEngine.js - Role-Isolated Multi-Field Search)
   └── Notification Service (notificationService.js - Idempotent Log-Mode)
   │
   ▼ SQLite Database (db.js - WAL Mode)
```

---

## 🎬 5-Minute Demonstration Script

1. **Customer Incident Creation (0:00–1:00)**:
   - Switch role to `Carol Customer`.
   - Submit `SOFTWARE` P2 incident: *"Unable to access financial reporting portal"*.
   - Point out sequential ID (`INC0000006`), auto-assignment to `Alice Agent`, and active 4h Response SLA clock.

2. **Agent Investigation & Work Notes (1:00–2:00)**:
   - Switch role to `Alice Agent`.
   - Open `INC0000001` in IMS Workspace.
   - Add internal Work Note (*"Inspected driver and cable; ordering replacement"*). Switch to Customer view to prove Work Notes are strictly hidden.
   - Click **Start Work / Respond** $\rightarrow$ status updates to `In Progress`, Response SLA displays `✅ Responded`.

3. **SLA Simulation & Auto-Escalation (2:00–3:00)**:
   - Click **`+4h`** in Demo Time simulator bar.
   - Show `INC0000001` dynamically transitioning to **`AT RISK`** ($\le$ 60m remaining) and displaying **`AUTO-ESCALATED`**.
   - Click **`+4h`** again $\rightarrow$ transitions to **`OVERDUE`**.

4. **Manager Dashboard & Routing Rules (3:00–4:00)**:
   - Switch role to `Bob Manager`.
   - Show Macro Dashboard metrics (Open, At Risk, Overdue, Escalated) and Agent Workload Balancing panel.
   - Reassign overdue ticket `INC0000002` to `Dave Agent`.
   - Add a new routing rule (`BILLING` P4 $\rightarrow$ `Dave Agent`).
   - Create matching ticket as Customer $\rightarrow$ routes instantly without server restart.

5. **Search & Log Notifications (4:00–5:00)**:
   - Search `"VPN"` in header search bar $\rightarrow$ instant match `INC0000002`.
   - Click **Notifications** bell $\rightarrow$ show log-mode audit trail of assignment and escalation events.

---

## 🧠 Likely Judge Questions & Winning Answers

### Q1: Why use business hours instead of calendar elapsed time?
> **Answer**: Support team SLA commitments reflect actual working capacity. Burning SLA minutes at 2 AM on a Sunday would trigger false breaches. DeskFlow's SLA clock runs strictly Monday–Friday 09:00–17:00 and skips holidays.

### Q2: How do you prevent SLA evaluation from firing duplicate escalation events?
> **Answer**: Escalation is enforced as a single-occurrence flag (`is_escalated = 1`) and the Notification Service uses idempotency keys based on `(ticket_id, event_type, recipient_id)`. Subsequent evaluations return existing records.

### Q3: Why are Work Notes hidden from Customer role?
> **Answer**: Work Notes contain internal technical investigation details and vendor updates meant for support personnel. Customer communication takes place in the dedicated conversation and status channel.

### Q4: How does no-code auto-assignment work?
> **Answer**: Routing rules are stored as ordered data rows in SQLite. On ticket creation, `findTargetAgent()` evaluates rules top-to-bottom. The first matching active rule assigns the ticket immediately without code changes or restarts.

### Q5: How would you scale DeskFlow beyond SQLite for production?
> **Answer**: SQLite handles in-process challenge needs cleanly. For enterprise production, we would swap the persistence layer to PostgreSQL, use Redis for queue-based async notifications, and plug in an OAuth2/OIDC identity provider for real authentication.
