/**
 * DeskFlow Business-Hours SLA Engine & Holiday Calendar Abstraction
 * - Working Hours: Monday-Friday 09:00 to 17:00 (8 hours/day = 480 working mins/day)
 * - Response SLA: 4 working hours (240 working mins)
 * - Resolution SLA: 2 working days (16 working hours = 960 working mins)
 * - Skips weekends and configured active holidays cleanly
 */

const db = require('./db');

function isWorkingDay(date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Weekend

  // Check active holidays table
  const isoDateStr = date.toISOString().split('T')[0];
  const holiday = db.prepare('SELECT id FROM holidays WHERE holiday_date = ? AND is_active = 1').get(isoDateStr);
  if (holiday) return false;

  return true;
}

function isWorkingTime(date) {
  if (!isWorkingDay(date)) return false;
  const hours = date.getHours();
  return hours >= 9 && hours < 17;
}

function addBusinessMinutes(startDate, minutesToAdd) {
  let curr = new Date(startDate);
  let remainingMins = minutesToAdd;

  while (remainingMins > 0) {
    if (!isWorkingDay(curr)) {
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 0, 0, 0);
      continue;
    }

    const hours = curr.getHours();
    const mins = curr.getMinutes();

    if (hours < 9) {
      curr.setHours(9, 0, 0, 0);
      continue;
    }

    if (hours >= 17) {
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 0, 0, 0);
      continue;
    }

    const minsUntilClose = (17 - hours) * 60 - mins;

    if (remainingMins <= minsUntilClose) {
      curr.setMinutes(curr.getMinutes() + remainingMins);
      remainingMins = 0;
    } else {
      remainingMins -= minsUntilClose;
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 0, 0, 0);
    }
  }

  return curr;
}

function calculateBusinessMinutesBetween(startDate, endDate) {
  let curr = new Date(startDate);
  const end = new Date(endDate);
  if (curr >= end) return 0;

  let totalMins = 0;

  while (curr < end) {
    if (!isWorkingDay(curr)) {
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 0, 0, 0);
      continue;
    }

    const hours = curr.getHours();
    if (hours < 9) {
      curr.setHours(9, 0, 0, 0);
      continue;
    }
    if (hours >= 17) {
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 0, 0, 0);
      continue;
    }

    const minsUntilClose = (17 - hours) * 60 - curr.getMinutes();
    const minsUntilEnd = Math.floor((end.getTime() - curr.getTime()) / (1000 * 60));

    if (minsUntilEnd <= minsUntilClose) {
      totalMins += minsUntilEnd;
      break;
    } else {
      totalMins += minsUntilClose;
      curr.setDate(curr.getDate() + 1);
      curr.setHours(9, 0, 0, 0);
    }
  }

  return totalMins;
}

function evaluateTicketSLA(ticket, currentSimulatedTimeISO) {
  const now = new Date(currentSimulatedTimeISO || new Date().toISOString());

  // Response SLA Evaluation
  let responseMinsRemaining = null;
  if (!ticket.responded_at) {
    const responseDue = new Date(ticket.response_due_at);
    if (now >= responseDue) {
      responseMinsRemaining = -calculateBusinessMinutesBetween(responseDue, now);
    } else {
      responseMinsRemaining = calculateBusinessMinutesBetween(now, responseDue);
    }
  }

  // Resolution SLA Evaluation
  let resolutionMinsRemaining = null;
  if (!ticket.resolved_at && !ticket.closed_at) {
    const resolutionDue = new Date(ticket.resolution_due_at);
    if (now >= resolutionDue) {
      resolutionMinsRemaining = -calculateBusinessMinutesBetween(resolutionDue, now);
    } else {
      resolutionMinsRemaining = calculateBusinessMinutesBetween(now, resolutionDue);
    }
  }

  let slaState = 'NORMAL';
  if ((responseMinsRemaining !== null && responseMinsRemaining <= 0) || (resolutionMinsRemaining !== null && resolutionMinsRemaining <= 0)) {
    slaState = 'OVERDUE';
  } else if ((responseMinsRemaining !== null && responseMinsRemaining <= 60) || (resolutionMinsRemaining !== null && resolutionMinsRemaining <= 60)) {
    slaState = 'AT_RISK';
  }

  const isEscalated = ticket.is_escalated === 1 || slaState === 'AT_RISK' || slaState === 'OVERDUE';

  return {
    slaState,
    isEscalated,
    responseMinsRemaining,
    resolutionMinsRemaining
  };
}

module.exports = {
  isWorkingDay,
  isWorkingTime,
  addBusinessMinutes,
  calculateBusinessMinutesBetween,
  evaluateTicketSLA
};
