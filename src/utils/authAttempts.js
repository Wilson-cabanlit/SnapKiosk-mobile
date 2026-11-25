const MAX_FAILURES = 5;
const WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;

function nextFailedAttempt(previous = {}, now = Date.now()) {
  const inWindow = previous.startedAt && now - previous.startedAt < WINDOW_MS;
  const failures = inWindow ? (previous.failures || 0) + 1 : 1;
  const startedAt = inWindow ? previous.startedAt : now;
  const lockedUntil = failures >= MAX_FAILURES ? now + LOCKOUT_MS : 0;
  return {failures, startedAt, lockedUntil};
}

module.exports = {MAX_FAILURES, WINDOW_MS, LOCKOUT_MS, nextFailedAttempt};
