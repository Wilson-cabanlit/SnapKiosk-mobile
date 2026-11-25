const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const SESSION_KEY = 'snapkiosk.sessions.v1';
const FLOW = ['consent', 'layout', 'capture', 'review', 'compose', 'print', 'delivery', 'complete', 'cancelled'];

function createSession({templateId, templateSnapshot = null, eventName, consentAt = new Date().toISOString()}) {
  const now = new Date().toISOString();
  return {
    id: `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now, updatedAt: now, completedAt: null, status: 'consent',
    consentAt, templateId, templateSnapshot: templateSnapshot ? JSON.parse(JSON.stringify(templateSnapshot)) : null, eventName: eventName || '', photos: [],
    printJobs: [], uploadStatus: 'not-configured', downloadUrl: null,
  };
}

function validateSession(session) {
  if (!session || typeof session.id !== 'string' || !session.id) throw new Error('Session needs a local identifier.');
  if (!FLOW.includes(session.status)) throw new Error(`Unknown session status: ${session.status}`);
  if (!Array.isArray(session.photos) || !Array.isArray(session.printJobs)) throw new Error('Session photo and print records must be lists.');
  if (session.downloadUrl && session.uploadStatus !== 'available') throw new Error('A download link cannot be stored until delivery is available.');
  return session;
}

async function listSessions() {
  const saved = await AsyncStorage.getItem(SESSION_KEY);
  const sessions = saved ? JSON.parse(saved) : [];
  if (!Array.isArray(sessions)) throw new Error('Local session data is invalid.');
  return sessions.map(validateSession).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function writeSessions(sessions) {
  sessions.forEach(validateSession);
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
  return sessions;
}

async function upsertSession(session) {
  const valid = validateSession({...session, updatedAt: new Date().toISOString()});
  const sessions = await listSessions();
  const index = sessions.findIndex(item => item.id === valid.id);
  if (index < 0) sessions.unshift(valid);
  else sessions[index] = valid;
  await writeSessions(sessions);
  return valid;
}

async function removeSession(id) {
  const sessions = (await listSessions()).filter(session => session.id !== id);
  await writeSessions(sessions);
}

function transitionSession(session, nextStatus) {
  if (nextStatus === 'cancelled' && session.status !== 'complete') {
    return {...session, status: 'cancelled', updatedAt: new Date().toISOString()};
  }
  if (nextStatus === 'complete' && session.status !== 'cancelled' && session.status !== 'complete') {
    const now = new Date().toISOString();
    return {...session, status: 'complete', updatedAt: now, completedAt: now};
  }
  const currentIndex = FLOW.indexOf(session.status);
  const nextIndex = FLOW.indexOf(nextStatus);
  if (nextIndex !== currentIndex + 1 || nextStatus === 'cancelled') throw new Error(`Cannot move session from ${session.status} to ${nextStatus}.`);
  const now = new Date().toISOString();
  return {...session, status: nextStatus, updatedAt: now, completedAt: nextStatus === 'complete' ? now : session.completedAt};
}

module.exports = {FLOW, SESSION_KEY, createSession, listSessions, removeSession, transitionSession, upsertSession, validateSession, writeSessions};
