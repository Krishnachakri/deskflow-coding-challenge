# DeskFlow — Official Submission Summary

This document provides the concise submission documentation required for the DeskFlow Incident Management Service Desk challenge.

---

## 1. 🚀 Running App
- **Status**: Fully operational and running locally.
- **URL**: `http://localhost:3000`
- **Server Command**: `npm start`
- **Port**: `3000` (Node.js Express + SQLite server process).

---

## 2. 💻 Code Repository
- **Git Repository**: [https://github.com/Krishnachakri/deskflow-coding-challenge.git](https://github.com/Krishnachakri/deskflow-coding-challenge.git)
- **Primary Branch**: `main`
- **Verification Status**: 18/18 Automated Tests Passing (`npm test`).

---

## 3. 📋 Project Summary (README Core)

### What We Built
DeskFlow is an enterprise-grade Incident Management Service Desk (ITSM/IMS) engineered to automate ticket creation, no-code routing, business-hours SLA evaluation (4-hour response / 2-working-day resolution), auto-escalation, role-based workflows, search, and real-time manager visibility.

### What Works (100% Verified)
1. **Mandatory Core Scope (7/7 Pass)**:
   - **Ticket Lifecycle & Sequential ID**: `INC0000001` numbering with 5-state transition engine (`NEW` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `PENDING_CUSTOMER` $\rightarrow$ `RESOLVED` $\rightarrow$ `CLOSED`).
   - **No-Code Auto-Assignment Rules**: Dynamic priority/category routing engine configurable via Manager GUI without server restarts (`assignmentEngine.js`).
   - **Business-Hours SLA Engine**: Calculates 4h response and 2-working-day (16h) resolution deadlines strictly during Mon–Fri 09:00–17:00 business hours (`slaEngine.js`).
   - **Automatic Escalation**: Auto-detects tickets within 60m of SLA breach, flags them `AT_RISK`, sets `is_escalated = 1`, logs activity, and dispatches notifications.
   - **3 Differentiated Role Views**: Isolated views for Customer (own tickets + resolution clarity), Agent (assigned queue + internal work notes), and Manager (global dashboard + rules + SLA config).
   - **Manager Visibility**: Real-time KPI cards tracking Open, At Risk, Overdue, and Escalated incidents with one-click filter capabilities.
   - **Information Request Workflow**: Allows agents to request details from customers (`PENDING_CUSTOMER`), enabling customer replies that return status to `IN_PROGRESS`.

2. **Optional Enhancements (4/5 Pass)**:
   - **Multi-Field Search**: Real-time keyword search across Title, Description, Category, Priority, State, and Ticket ID (`searchEngine.js`).
   - **Idempotent Notifications**: Event-driven log notification system for assignments, SLA warnings, information requests, and status changes (`notificationService.js`).
   - **Agent Workload Balancing**: Dynamic round-robin workload distribution targeting agents with lowest active ticket counts.
   - **Holiday-Aware SLA Calendar**: Full business-calendar abstraction that skips active company holidays cleanly during SLA calculation.

### What Was Left Out (And Why)
- **Duplicate Ticket Merging**: **Deferred by Design**. Merging tickets destructively mutates independent lifecycle timestamps, SLA clocks, and legal audit histories. To maintain enterprise ITSM compliance and audit traceability, ticket merging was deliberately excluded from the certified scope.

### How to Run It
```bash
# 1. Clone repository
git clone https://github.com/Krishnachakri/deskflow-coding-challenge.git
cd deskflow-coding-challenge

# 2. Install dependencies
npm install

# 3. Seed clean demo data & start server
npm start

# 4. Access UI in browser
http://localhost:3000
```

---

## 4. 📝 Short Tech Note

> **Technical Architecture & Rationale**:  
> DeskFlow is built using a lightweight, zero-dependency Node.js and Express.js REST API backend paired with SQLite (`better-sqlite3`) for persistent single-file database storage, and a responsive Vanilla HTML5/CSS3/JavaScript single-page application frontend. We chose SQLite because its ACID-compliant synchronous operations and file-based execution guarantee instant, zero-latency SLA evaluation and transactional integrity without external database dependencies. The backend is structured modularly into decoupled single-responsibility engines—`server.js` (REST routes & auth), `slaEngine.js` (business-hours SLA calculation & holiday abstraction), `assignmentEngine.js` (rule matching & workload balancing), `searchEngine.js` (multi-field indexing), and `notificationService.js` (idempotent notification logs). The frontend uses native DOM manipulation and CSS design tokens inspired by modern ShiftAI aesthetics, providing instant live SLA clock rendering and role-scoped view state management without heavyweight web framework overhead.
