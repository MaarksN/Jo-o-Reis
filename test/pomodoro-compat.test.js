import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/pomodoro-engine.js', import.meta.url), 'utf8');

function boot({ NotificationApi } = {}) {
  const document = {
    getElementById() {
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const window = {
    storageManager: null,
    Notification: NotificationApi,
    toast: () => {}
  };
  const context = {
    window,
    document,
    console,
    Date,
    Math,
    String,
    Object,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout,
    clearTimeout
  };
  vm.runInNewContext(source, context, { filename: 'pomodoro-engine.js' });
  return window.pomodoroEngine;
}

test('exposes compatibility methods expected by the monolithic HTML', () => {
  const engine = boot();
  assert.equal(typeof engine.startLeadTimer, 'function');
  assert.equal(typeof engine.applyTimerLock, 'function');
  assert.equal(typeof engine.pause, 'function');
});

test('compatibility aliases delegate to canonical methods', () => {
  const engine = boot();
  let leadId = null;
  let lockCalls = 0;
  let pauseCalls = 0;

  engine.trackLeadStart = (id) => { leadId = id; };
  engine.applyLocks = () => { lockCalls += 1; return 'locked'; };
  engine.pauseTimer = () => { pauseCalls += 1; return 'paused'; };

  engine.startLeadTimer('19814');
  assert.equal(leadId, '19814');
  assert.equal(engine.applyTimerLock(), 'locked');
  assert.equal(lockCalls, 1);
  assert.equal(engine.pause(), 'paused');
  assert.equal(pauseCalls, 1);
});

test('lead duration preserves old and new property names', () => {
  const engine = boot();
  engine.activeLeadStartTime = Date.now() - 61_000;
  const duration = engine.getLeadDuration();

  assert.equal(duration.durationSeconds, duration.seconds);
  assert.equal(duration.formattedDuration, duration.formatted);
  assert.match(duration.formattedDuration, /^1m /);
});

test('browser notification is emitted only when permission is granted', () => {
  const emitted = [];
  class NotificationApi {
    static permission = 'granted';
    constructor(title, options) {
      emitted.push({ title, options });
    }
  }

  const engine = boot({ NotificationApi });
  assert.equal(engine.notifyBrowser('Foco concluído', 'Hora do descanso.'), true);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].title, 'Foco concluído');

  NotificationApi.permission = 'denied';
  assert.equal(engine.notifyBrowser('Não deve aparecer', 'x'), false);
  assert.equal(emitted.length, 1);
});
