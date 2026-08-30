# SMART Service Desk - Hackathon Transformation Map

This map documents the transformation strategy of mapping existing **DeskFlow** modules and code into the **SMART Service Desk** domain, preserving P0 engines while adapting visual and semantic elements.

---

| Current DeskFlow Component | SMART Target Representation | Change Type | Reason |
| :--- | :--- | :--- | :--- |
| **`db.js` (SQLite Database)** | Preserved SQLite storage with SMART schema & seed data | `ADAPT` | Add `ticket_type` (REQ/INC), `smart_area`, `project`, `study`, `ra`, `work_notes` table. |
| **`slaEngine.js`** | Business-hours SLA calculation engine (Mon-Fri 9-5) | `PRESERVE` | Proven business-hours logic with 4h response, 16h resolution, and at-risk escalation. |
| **`assignmentEngine.js`** | Rule-based auto-assignment engine | `ADAPT` | Map rule matching from generic `HARDWARE` to SMART Areas (`RA Access`, `Global Metadata`). |
| **`server.js`** | REST API server | `ADAPT` | Add endpoints for `work_notes`, `conversation`, `smart_context`, and SMART taxonomy endpoints. |
| **Header UI (Dark)** | Light SMART Header with SMART Logo & Title | `RESTYLE` | Convert to light theme with SMART Deep Blue (`#1e40af`) and compact subordinate Demo Time bar. |
| **Role Switcher** | Demo Auth Switcher ("View as: Customer / Support Engineer / Manager") | `RESTYLE` | Preserved demo auth capability, styled as enterprise role dropdown. |
| **Category Selection** | Operations Selector (`[ ACCESS ]` / `[ ISSUE ]`) | `RENAME` / `ADAPT` | Replace `HARDWARE`/`SOFTWARE` with frozen SMART taxonomy & cascading forms. |
| **Access Hierarchy Form** | Project $\rightarrow$ Study $\rightarrow$ RA Form | `ADAPT` | Implement cascading selection and mandatory validation (New Study needs Project, New RA needs Study). |
| **Global Metadata Form** | Environment $\rightarrow$ Disease $\rightarrow$ Therapeutic $\rightarrow$ Module $\rightarrow$ Version | `ADAPT` | Implement cascading metadata dropdowns for `Global Metadata Standards` issue tickets. |
| **Ticket Table** | SMART Ticket Queue (REQ/INC, SMART Area, SLA, Status) | `RESTYLE` | Convert table to light enterprise style with crisp badges and REQ/INC prefixes. |
| **Ticket Detail View** | IMS-Grade Operational Workspace | `ADAPT` | Multi-pane workspace: SMART Context, Description, Work Notes, Conversation, Activity Timeline, SLA. |
| **Manager Dashboard** | Compact Light SMART Metric Cards | `RESTYLE` | White background cards for Open, At-Risk, Overdue, Escalated metrics with restrained color indicators. |
| **Assignment Rules UI** | Support Routing Rules Manager | `RENAME` / `RESTYLE` | No-code assignment rule editor using SMART Area dropdowns. |
| **IMS Auth / Complex DB** | IMS Backend Modules & Production DB Connections | `REJECT` | Reject heavy IMS backend rewrites and external production database writes in 2-hour window. |
