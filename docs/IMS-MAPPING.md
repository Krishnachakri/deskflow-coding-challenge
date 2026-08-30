# DeskFlow — Incident Management Service Desk Architecture Mapping

This document details the architecture and domain model for **DeskFlow**, a pure Incident Management Service Desk.

---

## 1. Domain Entities & Responsibilities

| Component | Responsibility | Schema / Key Fields |
| :--- | :--- | :--- |
| **`db.js`** | SQLite storage with pure IMS tables | `tickets` (`INC000000x`, title, description, category, priority, state, customer_id, agent_id, SLA dates), `work_notes`, `activity_logs`, `users`, `assignment_rules`, `system_config`. |
| **`slaEngine.js`** | Business-hours SLA calculation | Mon–Fri 09:00–17:00 working windows. 4h response, 16h resolution. $\le$ 60m at-risk auto-escalation. |
| **`assignmentEngine.js`** | Rule-based auto-assignment | Evaluates category (`HARDWARE`, `SOFTWARE`, `BILLING`, `OTHER`) and priority (`P1`–`P4`) against ordered active rules. |
| **`server.js`** | Monolithic REST API server | Ticket CRUD, auto-numbering (`INC000000x`), Work Notes recording, Activity Timeline logging, Manager metrics, Rule editing. |
| **`public/index.html`** | Light Premium Enterprise UI | Header with Role Switcher & Subordinate Demo Time bar, Dashboard, Create Incident form, Queue table, IMS Workspace Modal. |
| **`public/style.css`** | Enterprise Light Theme | White background, DeskFlow Deep Blue (`#1e40af`), slate typography, crisp subtle cards & status badges. |
| **`public/app.js`** | Frontend interaction logic | Handles role switching, ticket queue rendering, state transitions, Work Notes submission, and time simulator API calls. |
