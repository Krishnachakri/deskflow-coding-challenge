# DeskFlow — Pre-Seeded Local Demo Credentials

> **Notice**: These credentials are strictly for **DEMO AND TESTING PURPOSES ONLY** on local development builds.

---

## 1. Demo User Accounts

| Role | Name | Username | Email | Demo Password | Pre-seeded User ID |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Customer 1** | Carol Customer | `customer1` | `carol@deskflow.local` | `password123` | `cust-1` |
| **Customer 2** | Charlie Customer | `customer2` | `charlie@deskflow.local` | `password123` | `cust-2` |
| **Agent 1** | Alice Agent | `agent1` | `alice@deskflow.local` | `password123` | `agent-1` |
| **Agent 2** | Dave Agent | `agent2` | `dave@deskflow.local` | `password123` | `agent-2` |
| **Manager** | Bob Manager | `manager1` | `bob@deskflow.local` | `password123` | `mgr-1` |

---

## 2. Authentication Architecture

- **Server-Side Verification**: Passwords are saved as hashes (`password_hash`) in the local SQLite `users` table.
- **Session Tokens**: Logging in generates a server-side session record in the `sessions` table (`sess-timestamp-random`).
- **Authorization Enforcement**: Every API request evaluates user identity via `Authorization: Bearer <token>` or session lookup. The server **never trusts client-passed role parameters** (`?role=MANAGER`).
- **Quick Demo Sign-In**: Clicking any of the 4 Quick Demo Login buttons on the sign-in screen authenticates as that specific demo account via server API.
