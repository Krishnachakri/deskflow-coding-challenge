# DeskFlow — Incident Management Service Desk

> DeskFlow routes every incident and keeps the 4-hour response / 2-working-day resolution promise visible.

DeskFlow is an enterprise-grade Incident Management Service Desk designed to automate ticket routing, monitor business-hours Service Level Agreements (SLAs), and auto-escalate tickets at risk of breach.

---

## 📄 Challenge Submission Summary

### 1. 🚀 Running App
- **Local URL**: `http://localhost:3000`
- **Start Command**: `npm start` (Runs Node.js Express API + SQLite DB server).

### 2. 💻 Code Repository
- **GitHub Repository**: [https://github.com/Krishnachakri/deskflow-coding-challenge.git](https://github.com/Krishnachakri/deskflow-coding-challenge.git)
- **Branch**: `main`

### 3. 📝 Short Tech Note

> **Technical Architecture & Rationale**:  
> DeskFlow is built using a lightweight, zero-dependency Node.js and Express.js REST API backend paired with SQLite (`better-sqlite3`) for persistent single-file database storage, and a responsive Vanilla HTML5/CSS3/JavaScript single-page application frontend. We chose SQLite because its ACID-compliant synchronous operations and file-based execution guarantee instant, zero-latency SLA evaluation and transactional integrity without external database dependencies. The backend is structured modularly into decoupled single-responsibility engines—`server.js` (REST routes & auth), `slaEngine.js` (business-hours SLA calculation & holiday abstraction), `assignmentEngine.js` (rule matching & workload balancing), `searchEngine.js` (multi-field indexing), and `notificationService.js` (idempotent notification logs). The frontend uses native DOM manipulation and CSS design tokens inspired by modern ShiftAI aesthetics, providing instant live SLA clock rendering and role-scoped view state management without heavyweight web framework overhead.

---

## 🌟 What Was Built & What Works

1. **Mandatory Core Scope (7/7 Pass)**:
   - **Sequential Incident IDs**: Persistent sequential IDs (`INC0000001`, `INC0000002`).
   - **5-State Ticket Lifecycle**: `NEW` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `PENDING_CUSTOMER` $\rightarrow$ `RESOLVED` $\rightarrow$ `CLOSED` (Allowed reopen: `RESOLVED` $\rightarrow$ `IN_PROGRESS`).
   - **No-Code Auto-Assignment Engine**: Category/priority rules configured dynamically via Manager GUI without server restarts (`assignmentEngine.js`).
   - **Business-Hours SLA Engine**: 4-hour response & 2-working-day (16h) resolution targets evaluated strictly during Mon–Fri 09:00–17:00 business hours (`slaEngine.js`).
   - **Automatic Escalation**: Tickets within 60 minutes of SLA breach automatically transition to `AT_RISK` with `AUTO-ESCALATED` badge and activity logs.
   - **3 Differentiated Role Views**: Isolated, secure perspectives for Customer, Agent, and Manager roles.
   - **Manager Visibility**: Real-time KPI cards tracking Open, At Risk, Overdue, and Escalated incidents with instant queue filter triggers.

2. **Optional Enhancements (4/5 Pass)**:
   - **Multi-Field Search**: Keyword search across Title, Description, Category, Priority, State, and Incident ID (`searchEngine.js`).
   - **Idempotent Notifications**: Event-driven notification logging for assignments, SLA warnings, and state updates (`notificationService.js`).
   - **Agent Workload Balancing**: Dynamic round-robin workload distribution targeting agents with lowest active ticket counts.
   - **Holiday-Aware SLA Calendar**: Business calendar abstraction skipping company holidays during SLA calculation.

### What Was Left Out (And Why)
- **Duplicate Ticket Merging**: **Deferred by Design**. Merging tickets destructively mutates independent lifecycle timestamps, SLA clocks, and legal audit histories. To maintain enterprise ITSM compliance and audit traceability, ticket merging was deliberately excluded.

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+)

### Installation
```bash
# Clone the repository
git clone https://github.com/Krishnachakri/deskflow-coding-challenge.git
cd deskflow-coding-challenge

# Install dependencies
npm install
```

### Running the Application
```bash
# Start the DeskFlow server
npm start
```
Open your browser and navigate to **`http://localhost:3000`**.

---

## 🧪 Testing

Run all automated verification and security audit suites:
```bash
npm test
```

---

## 📄 Full Documentation

For the complete 37-section technical guide and certification matrix, see:
- [docs/DESKFLOW-COMPLETE-KNOWLEDGE-GUIDE.md](docs/DESKFLOW-COMPLETE-KNOWLEDGE-GUIDE.md)
- [docs/HACKATHON-SUBMISSION-SUMMARY.md](docs/HACKATHON-SUBMISSION-SUMMARY.md)
