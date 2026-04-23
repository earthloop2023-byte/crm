type SessionTimeoutListener = () => void;

const listeners = new Set<SessionTimeoutListener>();
let notified = false;
let suppressed = false;

export function notifySessionExpired() {
  if (suppressed) return;
  if (notified) return;
  notified = true;
  listeners.forEach((listener) => listener());
}

export function subscribeSessionExpired(listener: SessionTimeoutListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function suppressSessionExpiredNotification() {
  suppressed = true;
}

export function resetSessionExpiredNotification() {
  notified = false;
  suppressed = false;
}
