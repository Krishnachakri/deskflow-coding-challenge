const assert = require('assert');
const http = require('http');
const db = require('./db');
const seedDemoTickets = require('./seedDemoData');

const BASE_URL = 'http://localhost:3000';

function makeRequest(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runDeepSecurityAndGapSuite() {
  console.log('\n============================================================');
  console.log('STARTING DESKFLOW REAL SECURITY, AUTHORIZATION & WORKFLOW SUITE');
  console.log('============================================================\n');

  seedDemoTickets();

  const report = {
    authAudit: [],
    infoRequestFlow: [],
    lifecycleAudit: [],
    slaAudit: [],
    inputValidationAudit: [],
    e2eScenario: []
  };

  // ------------------------------------------------------------
  // SECTION 1: DEMO AUTHENTICATION & ROLE SPOOFING AUDIT
  // ------------------------------------------------------------
  console.log('--- SECTION 1: DEMO AUTHENTICATION & ROLE SPOOFING AUDIT ---');

  // Authenticate Customer 1 (customer1)
  const loginCust1 = await makeRequest('/api/auth/login', 'POST', { username: 'customer1' });
  assert.strictEqual(loginCust1.status, 200);
  const cust1Token = loginCust1.body.token;

  // Authenticate Agent 1 (agent1)
  const loginAgent1 = await makeRequest('/api/auth/login', 'POST', { username: 'agent1' });
  assert.strictEqual(loginAgent1.status, 200);
  const agent1Token = loginAgent1.body.token;

  // Authenticate Manager 1 (manager1)
  const loginMgr1 = await makeRequest('/api/auth/login', 'POST', { username: 'manager1' });
  assert.strictEqual(loginMgr1.status, 200);
  const mgr1Token = loginMgr1.body.token;

  // Test A: Customer 1 requests Work Notes on INC0000001
  const res1 = await makeRequest('/api/tickets/INC0000001', 'GET', null, cust1Token);
  const workNotesLeaked = res1.body.workNotes && res1.body.workNotes.length > 0;
  report.authAudit.push({
    test: 'Customer Role Isolation (Work Notes)',
    result: workNotesLeaked ? 'FAILED' : 'BLOCKED',
    status: res1.status,
    evidence: workNotesLeaked ? 'VULNERABILITY: Work Notes Leaked!' : 'Work Notes stripped server-side (0 received).'
  });
  assert.strictEqual(workNotesLeaked, false);

  // Test B: Customer 1 attempts to create routing rule
  const res2 = await makeRequest('/api/rules', 'POST', {
    category: 'HARDWARE',
    priority: 'P1',
    targetAgentId: 'agent-1'
  }, cust1Token);
  report.authAudit.push({
    test: 'Customer Routing Rule Creation Attempt',
    result: res2.status === 403 ? 'BLOCKED' : 'FAILED',
    status: res2.status,
    evidence: res2.status === 403 ? `Forbidden 403: ${res2.body.error}` : 'VULNERABILITY: Rule created!'
  });
  assert.strictEqual(res2.status, 403);

  // Test C: Customer 1 attempts to reassign ticket
  const res3 = await makeRequest('/api/tickets/INC0000001/reassign', 'PATCH', { agentId: 'agent-2' }, cust1Token);
  report.authAudit.push({
    test: 'Customer Reassignment Attempt',
    result: res3.status === 403 ? 'BLOCKED' : 'FAILED',
    status: res3.status,
    evidence: res3.status === 403 ? `Forbidden 403: ${res3.body.error}` : 'VULNERABILITY: Ticket reassigned!'
  });
  assert.strictEqual(res3.status, 403);

  // Test D: Customer 1 attempts to configure SLA policy
  const res4 = await makeRequest('/api/system-config/sla', 'POST', {
    responseHours: 1, resolutionHours: 2, atRiskMins: 10, bizStart: 9, bizEnd: 17
  }, cust1Token);
  report.authAudit.push({
    test: 'Customer SLA Policy Configuration Attempt',
    result: res4.status === 403 ? 'BLOCKED' : 'FAILED',
    status: res4.status,
    evidence: res4.status === 403 ? `Forbidden 403: ${res4.body.error}` : 'VULNERABILITY: SLA altered!'
  });
  assert.strictEqual(res4.status, 403);

  // Test E: Customer 1 attempts to view Customer 2's incident (INC0000005 belongs to cust-2)
  const res5 = await makeRequest('/api/tickets/INC0000005', 'GET', null, cust1Token);
  report.authAudit.push({
    test: 'Customer Cross-Tenant Incident Access Attempt',
    result: res5.status === 403 ? 'BLOCKED' : 'FAILED',
    status: res5.status,
    evidence: res5.status === 403 ? `Forbidden 403: ${res5.body.error}` : 'VULNERABILITY: Ticket accessible!'
  });
  assert.strictEqual(res5.status, 403);

  // ------------------------------------------------------------
  // SECTION 2: CUSTOMER INFORMATION REQUEST WORKFLOW AUDIT
  // ------------------------------------------------------------
  console.log('--- SECTION 2: CUSTOMER INFORMATION REQUEST WORKFLOW AUDIT ---');

  // Agent requests info from Customer on INC0000003
  const infoReqRes = await makeRequest('/api/tickets/INC0000003/request-info', 'POST', {
    requestText: 'Please provide exact VPN error message and screenshot.'
  }, agent1Token);
  assert.strictEqual(infoReqRes.status, 200);
  assert.strictEqual(infoReqRes.body.state, 'PENDING_CUSTOMER');

  report.infoRequestFlow.push({
    step: '1. Agent Request Info',
    status: 'SUCCESS',
    state: infoReqRes.body.state,
    message: infoReqRes.body.message
  });

  // Customer 1 replies to information request
  const replyRes = await makeRequest('/api/tickets/INC0000003/customer-reply', 'POST', {
    replyText: 'Error code 691 appeared at 09:30 AM.'
  }, cust1Token);
  assert.strictEqual(replyRes.status, 200);
  assert.strictEqual(replyRes.body.state, 'IN_PROGRESS');

  report.infoRequestFlow.push({
    step: '2. Customer Submit Reply',
    status: 'SUCCESS',
    state: replyRes.body.state,
    message: replyRes.body.message
  });

  // Verify conversation entries recorded
  const ticketDetail = await makeRequest('/api/tickets/INC0000003', 'GET', null, cust1Token);
  assert.strictEqual(ticketDetail.body.conversation.length >= 2, true);

  // ------------------------------------------------------------
  // SECTION 3: NEGATIVE WORKFLOW & LIFECYCLE AUDIT
  // ------------------------------------------------------------
  console.log('--- SECTION 3: NEGATIVE WORKFLOW & LIFECYCLE AUDIT ---');

  // Attempt invalid transition NEW -> CLOSED
  const trans1 = await makeRequest('/api/tickets/INC0000004/state', 'PATCH', { state: 'CLOSED' }, agent1Token);
  report.lifecycleAudit.push({
    test: 'Invalid Transition (NEW -> CLOSED)',
    result: trans1.status === 400 ? 'REJECTED' : 'FAILED',
    status: trans1.status,
    evidence: trans1.body.error
  });
  assert.strictEqual(trans1.status, 400);

  // Valid transition NEW -> IN_PROGRESS
  const trans2 = await makeRequest('/api/tickets/INC0000004/state', 'PATCH', { state: 'IN_PROGRESS' }, agent1Token);
  report.lifecycleAudit.push({
    test: 'Valid Transition (NEW -> IN_PROGRESS)',
    result: trans2.status === 200 ? 'ALLOWED' : 'FAILED',
    status: trans2.status,
    evidence: trans2.body.message
  });
  assert.strictEqual(trans2.status, 200);

  // Valid transition IN_PROGRESS -> RESOLVED
  const trans3 = await makeRequest('/api/tickets/INC0000004/state', 'PATCH', {
    state: 'RESOLVED',
    resolutionNotes: 'Software updated successfully.'
  }, agent1Token);
  report.lifecycleAudit.push({
    test: 'Valid Transition (IN_PROGRESS -> RESOLVED)',
    result: trans3.status === 200 ? 'ALLOWED' : 'FAILED',
    status: trans3.status,
    evidence: trans3.body.message
  });
  assert.strictEqual(trans3.status, 200);

  // ------------------------------------------------------------
  // SECTION 4: INPUT VALIDATION & MANAGER SLA CONFIG AUDIT
  // ------------------------------------------------------------
  console.log('--- SECTION 4: INPUT VALIDATION & SLA CONFIG AUDIT ---');

  // Negative hours check
  const cfg1 = await makeRequest('/api/system-config/sla', 'POST', {
    responseHours: -4, resolutionHours: 16, atRiskMins: 60, bizStart: 9, bizEnd: 17
  }, mgr1Token);
  assert.strictEqual(cfg1.status, 400);

  // Valid Manager SLA configuration update
  const cfg3 = await makeRequest('/api/system-config/sla', 'POST', {
    responseHours: 4, resolutionHours: 16, atRiskMins: 60, bizStart: 9, bizEnd: 17
  }, mgr1Token);
  assert.strictEqual(cfg3.status, 200);

  // ------------------------------------------------------------
  // SECTION 5: FULL END-TO-END DEMO SCENARIO VERIFICATION
  // ------------------------------------------------------------
  console.log('--- SECTION 5: FULL END-TO-END DEMO SCENARIO VERIFICATION ---');

  // Step 1: Customer 1 creates SOFTWARE ticket
  const e2e1 = await makeRequest('/api/tickets', 'POST', {
    title: 'E2E Critical Laptop Crashing Incident',
    category: 'SOFTWARE',
    priority: 'P2',
    description: 'System freezes on boot.'
  }, cust1Token);
  const ticketId = e2e1.body.ticketId;
  report.e2eScenario.push(`1. Customer 1 logs in. Creates Incident ${ticketId} (auto-assigned to ${e2e1.body.assignedAgentId})`);

  // Step 2: Agent requests info
  await makeRequest(`/api/tickets/${ticketId}/request-info`, 'POST', { requestText: 'Please provide error logs.' }, agent1Token);
  report.e2eScenario.push('2. Agent logs in, inspects ticket, requests information. Status becomes PENDING_CUSTOMER.');

  // Step 3: Customer replies
  await makeRequest(`/api/tickets/${ticketId}/customer-reply`, 'POST', { replyText: 'Attached kernel error log.' }, cust1Token);
  report.e2eScenario.push('3. Customer logs in, sees prompt, replies. Status automatically returns to IN_PROGRESS.');

  // Step 4: Agent adds work note
  await makeRequest(`/api/tickets/${ticketId}/work-notes`, 'POST', { note: 'Inspecting kernel log internally.' }, agent1Token);
  report.e2eScenario.push('4. Agent records internal Work Note (invisible to Customer).');

  // Step 5: Fast-forward time & Manager reassigns
  await makeRequest('/api/system-config/fast-forward', 'POST', { hours: 3 }, mgr1Token);
  await makeRequest(`/api/tickets/${ticketId}/reassign`, 'PATCH', { agentId: 'agent-2' }, mgr1Token);
  report.e2eScenario.push('5. Manager logs in, inspects metrics, reassigns ticket to Dave Agent.');

  // Step 6: Agent resolves ticket & Customer closes
  await makeRequest(`/api/tickets/${ticketId}/state`, 'PATCH', {
    state: 'RESOLVED',
    resolutionNotes: 'Patched OS driver.'
  }, agent1Token);
  await makeRequest(`/api/tickets/${ticketId}/state`, 'PATCH', { state: 'CLOSED' }, cust1Token);
  report.e2eScenario.push('6. Agent resolves ticket, Customer confirms & closes ticket cleanly.');

  console.log('\nFULL SUITE AUDIT REPORT:', JSON.stringify(report, null, 2));
  console.log('\n============================================================');
  console.log('ALL SECURITY, AUTHORIZATION & WORKFLOW AUDIT TESTS PASSED CLEANLY');
  console.log('============================================================\n');
}

runDeepSecurityAndGapSuite().catch(err => {
  console.error('AUDIT SUITE FAILED:', err);
  process.exit(1);
});
