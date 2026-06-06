// ═══════════════════════════════════════════════════
//  SERVICE WORKER  —  track-app/sw.js
//  Responsibilities:
//    1. Cache the app shell for instant offline load
//    2. Fire a daily 10pm notification via a recurring alarm
//       stored in IndexedDB / checked on SW activation
// ═══════════════════════════════════════════════════

const CACHE_NAME  = 'track-v1';
const APP_SHELL   = ['./index.html'];   // files to cache for offline use
const NOTIF_HOUR  = 22;                 // 22:00 = 10 PM local time
const NOTIF_TAG   = 'daily-log-nudge'; // collapses duplicate notifications

// ── INSTALL: cache app shell ────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: claim clients immediately ────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: serve from cache, fallback to network ───
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});

// ── NOTIFICATION CLICK: open / focus the app ───────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // If app is already open somewhere, focus it
        const existing = clients.find(c => c.url.includes('index.html') || c.url.endsWith('/track-app/'));
        if (existing) return existing.focus();
        // Otherwise open a new window
        return self.clients.openWindow('./index.html');
      })
  );
});

// ── ALARM MESSAGE: main page asks SW to schedule ───
//  The page sends { type: 'SCHEDULE_ALARM' } on load.
//  SW calculates ms until next 10pm and sets a setTimeout.
//  On each fire it reschedules itself for the next day.
// ───────────────────────────────────────────────────

let alarmTimeout = null;

function msUntilNext10pm() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(NOTIF_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // already past 10pm today
  return next - now;
}

function scheduleAlarm() {
  clearTimeout(alarmTimeout);
  const delay = msUntilNext10pm();

  alarmTimeout = setTimeout(() => {
    fireNotification();
    scheduleAlarm(); // reschedule for tomorrow
  }, delay);
}

function fireNotification() {
  self.registration.showNotification('Track', {
    body: 'Did you log today? Tap to record.',
    tag:  NOTIF_TAG,        // replaces any existing nudge notification
    icon: './icon-192.png', // optional — won't break if missing
    badge:'./icon-192.png',
    vibrate: [100, 50, 100],
    requireInteraction: false,
    silent: false
  });
}

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SCHEDULE_ALARM') {
    scheduleAlarm();
    // Confirm back to the page
    if (event.source) {
      event.source.postMessage({ type: 'ALARM_SCHEDULED', msUntil: msUntilNext10pm() });
    }
  }
});
