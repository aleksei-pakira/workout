const SELECTED_CLIENT_KEY = 'coach_selected_client_id';

export function getSelectedClientId() {
  try {
    return sessionStorage.getItem(SELECTED_CLIENT_KEY) || null;
  } catch {
    return null;
  }
}

export function setSelectedClientId(clientId) {
  try {
    if (clientId) sessionStorage.setItem(SELECTED_CLIENT_KEY, clientId);
    else sessionStorage.removeItem(SELECTED_CLIENT_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSelectedClientId() {
  setSelectedClientId(null);
}

export function hasSeenCoachJoinNotice() {
  try {
    return sessionStorage.getItem('coach_join_notice_seen') === '1';
  } catch {
    return false;
  }
}

export function markCoachJoinNoticeSeen() {
  try {
    sessionStorage.setItem('coach_join_notice_seen', '1');
  } catch {
    /* ignore */
  }
}
