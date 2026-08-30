/**
 * DeskFlow Business-Hours SLA Engine
 * Business Hours: Monday-Friday, 09:00 to 17:00 (8 hours/day = 480 minutes/day)
 * Response SLA: 4 working hours (240 working minutes)
 * Resolution SLA: 2 working days (16 working hours = 960 working minutes)
 */

const WORK_START_HOUR = 9;  // 09:00
const WORK_END_HOUR = 17;   // 17:00
const WORK_MINUTES_PER_DAY = (WORK_END_HOUR - WORK_START_HOUR) * 60; // 480 mins

/**
 * Checks if a date falls on a working day (Mon-Fri)
 */
function isWorkDay(date) {
  const day = date.getDay(); // 0 = Sun, 6 = Sat
  return day >= 1 && day <= 5;
}

/**
 * Adjusts a date forward to the nearest working time slot if outside working hours.
 */
function normalizeToWorkingTime(date) {
  const result = new Date(date);
  
  while (true) {
    const day = result.getDay();
    const hours = result.getHours();

    // Weekend check -> move to Monday 09:00
    if (day === 6) { // Saturday
      result.setDate(result.getDate() + 2);
      result.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }
    if (day === 0) { // Sunday
      result.setDate(result.getDate() + 1);
      result.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    // Before work start -> set to 09:00 same day
    if (hours < WORK_START_HOUR) {
      result.setHours(WORK_START_HOUR, 0, 0, 0);
      break;
    }

    // After work end -> set to 09:00 next day
    if (hours >= WORK_END_HOUR) {
      result.setDate(result.getDate() + 1);
      result.setHours(WORK_START_HOUR, 0, 0, 0);
      continue;
    }

    break;
  }
  
  return result;
}

/**
 * Adds business minutes to a starting Date object.
 */
function addBusinessMinutes(startDate, minutesToAdd) {
  let curr = normalizeToWorkingTime(new Date(startDate));
  let remainingMins = minutesToAdd;

  while (remainingMins > 0) {
    const currentEnd = new Date(curr);
    currentEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    const availableMinsInDay = Math.floor((currentEnd.getTime() - curr.getTime()) / 60000);

    if (remainingMins <= availableMinsInDay) {
      curr = new Date(curr.getTime() + remainingMins * 60000);
      remainingMins = 0;
    } else {
      remainingMins -= availableMinsInDay;
      // Advance to next morning 09:00
      curr.setDate(curr.getDate() + 1);
      curr.setHours(WORK_START_HOUR, 0, 0, 0);
      curr = normalizeToWorkingTime(curr);
    }
  }

  return curr;
}

/**
 * Calculates remaining working minutes between now and a future target date.
 */
function getRemainingBusinessMinutes(nowDate, dueDate) {
  const now = new Date(nowDate);
  const due = new Date(dueDate);

  if (now >= due) {
    return -Math.floor((now.getTime() - due.getTime()) / 60000); // negative remaining mins
  }

  let curr = normalizeToWorkingTime(now);
  let totalMins = 0;

  while (curr < due) {
    const dayEnd = new Date(curr);
    dayEnd.setHours(WORK_END_HOUR, 0, 0, 0);

    const endBoundary = due < dayEnd ? due : dayEnd;
    const minsInChunk = Math.floor((endBoundary.getTime() - curr.getTime()) / 60000);
    
    if (minsInChunk > 0) {
      totalMins += minsInChunk;
    }

    if (endBoundary >= due) {
      break;
    }

    // Move to next work day start
    curr.setDate(curr.getDate() + 1);
    curr.setHours(WORK_START_HOUR, 0, 0, 0);
    curr = normalizeToWorkingTime(curr);
  }

  return totalMins;
}

/**
 * Evaluates ticket SLA targets given current system/simulated time.
 */
function evaluateTicketSLA(ticket, currentTimeStr) {
  const now = new Date(currentTimeStr);
  const responseDue = new Date(ticket.response_due_at);
  const resolutionDue = new Date(ticket.resolution_due_at);

  let responseMinsRemaining = null;
  let resolutionMinsRemaining = null;

  // 1. Response SLA evaluation
  if (!ticket.responded_at) {
    responseMinsRemaining = getRemainingBusinessMinutes(now, responseDue);
  }

  // 2. Resolution SLA evaluation
  if (ticket.state !== 'RESOLVED' && ticket.state !== 'CLOSED') {
    resolutionMinsRemaining = getRemainingBusinessMinutes(now, resolutionDue);
  }

  // Determine SLA status
  let slaState = 'NORMAL';
  let isEscalated = ticket.is_escalated === 1;

  // Check if breached (Overdue)
  const isResponseOverdue = responseMinsRemaining !== null && responseMinsRemaining <= 0;
  const isResolutionOverdue = resolutionMinsRemaining !== null && resolutionMinsRemaining <= 0;

  if (isResponseOverdue || isResolutionOverdue) {
    slaState = 'OVERDUE';
  } else {
    // Check if At Risk (<= 60 working minutes remaining)
    const isResponseAtRisk = responseMinsRemaining !== null && responseMinsRemaining <= 60;
    const isResolutionAtRisk = resolutionMinsRemaining !== null && resolutionMinsRemaining <= 60;

    if (isResponseAtRisk || isResolutionAtRisk) {
      slaState = 'AT_RISK';
      isEscalated = true; // Auto-escalate on AT_RISK as per approved blueprint
    }
  }

  return {
    slaState,
    isEscalated,
    responseMinsRemaining,
    resolutionMinsRemaining
  };
}

module.exports = {
  addBusinessMinutes,
  getRemainingBusinessMinutes,
  evaluateTicketSLA,
  normalizeToWorkingTime
};
