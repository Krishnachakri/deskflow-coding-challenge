# DeskFlow — Incident Management Service Desk

> DeskFlow routes every incident and keeps the 4-hour response / 2-working-day resolution promise visible.

DeskFlow is an enterprise-grade Incident Management Service Desk designed to automate ticket routing, monitor business-hours Service Level Agreements (SLAs), and auto-escalate tickets at risk of breach.

---

## 🌟 Key Features

1. **Incident Taxonomy & Sequential Numbering**:
   - Sequential ticket IDs (`INC0000001`, `INC0000002`).
   - Categories: `HARDWARE`, `SOFTWARE`, `BILLING`, `OTHER`.
   - Priorities: `P1 - Critical`, `P2 - High`, `P3 - Medium`, `P4 - Low`.

2. **5-State Ticket Lifecycle**:
   - `NEW` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `PENDING_CUSTOMER` $\rightarrow$ `RESOLVED` $\rightarrow$ `CLOSED`.
   - Allowed Reopen: `RESOLVED` $\rightarrow$ `IN_PROGRESS`.

3. **Business-Hours SLA Engine**:
   - Working hours: Monday–Friday `09:00` to `17:00` (8 hours/day).
   - Response SLA target: **4 working hours**.
   - Resolution SLA target: **2 working days (16 working hours)**.
   - Non-working hours and weekends are automatically skipped.

4. **Automatic Escalation**:
   - Tickets with $\le 60$ minutes remaining on their SLA clock automatically transition to `AT_RISK` and set `AUTO-ESCALATED`.

5. **No-Code Rule-Based Auto-Assignment**:
   - Configurable rules evaluate category and priority on creation to route incidents to support agents (`assignmentEngine.js`).
   - Dynamic no-code administration interface for Managers without server restarts.

6. **IMS Operational Workspace**:
   - Detailed multi-pane view featuring Description, Internal Work Notes (hidden from Customer role), Customer Conversation, and Activity Audit Timeline.

7. **Role-Based Experience**:
   - **Customer**: Submit incidents, view own ticket status, close resolved issues.
   - **Agent**: Manage assigned queue, record internal Work Notes, communicate with customers, resolve issues.
   - **Manager**: Global macro dashboard metrics (Open, At Risk, Overdue, Escalated), ticket reassignment, routing rule administration.

8. **Demo Time Simulator**:
   - Header control bar (`+1h`, `+4h`, `+2d`, `Reset`) to fast-forward time deterministically for SLA testing.

---

## 🛠️ Architecture & Tech Stack

- **Backend**: Node.js, Express.js REST API server (`server.js`).
- **Database**: SQLite with `better-sqlite3` (`db.js`).
- **Frontend**: HTML5, Vanilla JavaScript (`public/app.js`), Light Premium Enterprise CSS (`public/style.css`).

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

Run the automated test suites:
```bash
# Run core and deep QA attack test suites
npm test
```

---

## 📄 License
ISC License.
