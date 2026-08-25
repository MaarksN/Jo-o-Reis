/**
 * AtlasGR • Storage Manager
 * Centralized localStorage persistence for treatment sessions, Pomodoro data, voice notes, and Bitrix logs.
 */

const STORAGE_KEYS = {
  hook: 'atlas-extrator-bitrix-webhook',
  prog: 'atlas-mesa-joao-prog-v1',
  timer: 'atlas-mesa-joao-timer-v1',
  pomHistory: 'atlas-mesa-pomodoro-history-v1',
  voiceNotes: 'atlas-mesa-voice-notes-v1',
  bitrixLogs: 'atlas-mesa-bitrix-logs-v1',
  dataset: 'atlas-mesa-joao-data-v1',
  theme: 'atlas-mesa-joao-theme-v1',
  livecache: 'atlas-mesa-joao-livecache-v1',
  dailycheck: 'atlas-mesa-joao-dailycheck-v1',
  auth: 'atlas-mesa-auth-v1',
  settings: 'atlas-mesa-settings-v1'
};

class StorageManager {
  constructor() {
    this.keys = STORAGE_KEYS;
  }

  get(key, fallback = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (e) {
      console.warn(`[StorageManager] Error reading key ${key}:`, e);
      return fallback;
    }
  }

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`[StorageManager] Error saving key ${key}:`, e);
      return false;
    }
  }

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[StorageManager] Error removing key ${key}:`, e);
    }
  }

  // Treatment Progress & History
  loadProg() {
    const defaultProg = { done: {}, history: [] };
    const loaded = this.get(this.keys.prog, defaultProg);
    return {
      done: loaded?.done || {},
      history: Array.isArray(loaded?.history) ? loaded.history : []
    };
  }

  saveProg(prog) {
    this.set(this.keys.prog, prog);
  }

  // Pomodoro Timer State
  loadTimer() {
    const defaultTimer = {
      phase: 'idle',
      end: 0,
      duration: 25 * 60,
      paused: false,
      remainingWhenPaused: 0,
      focusCount: 0,
      cycleIndex: 0,
      currentLeadId: null,
      leadStartTime: null,
      settings: {
        focusMin: 25,
        shortBreakMin: 5,
        longBreakMin: 15,
        cyclesBeforeLongBreak: 4,
        strictLock: true,
        soundEnabled: true,
        autoStartBreaks: false
      }
    };
    const loaded = this.get(this.keys.timer, {});
    return Object.assign(defaultTimer, loaded, {
      settings: Object.assign(defaultTimer.settings, loaded?.settings || {})
    });
  }

  saveTimer(timer) {
    this.set(this.keys.timer, timer);
  }

  // Pomodoro History & Focus Logs
  loadPomodoroHistory() {
    return this.get(this.keys.pomHistory, []);
  }

  savePomodoroHistory(history) {
    this.set(this.keys.pomHistory, history);
  }

  logPomodoroSession(session) {
    const history = this.loadPomodoroHistory();
    history.push({
      id: 'pom_' + Date.now(),
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      type: session.type || 'focus',
      durationMinutes: session.durationMinutes || 25,
      leadsTreated: session.leadsTreated || [],
      cycleNumber: session.cycleNumber || 1
    });
    this.savePomodoroHistory(history);
  }

  // Voice Notes
  loadVoiceNotes() {
    return this.get(this.keys.voiceNotes, []);
  }

  saveVoiceNotes(notes) {
    this.set(this.keys.voiceNotes, notes);
  }

  addVoiceNote(note) {
    const notes = this.loadVoiceNotes();
    notes.unshift({
      id: 'voice_' + Date.now(),
      leadId: note.leadId || null,
      clientName: note.clientName || 'Geral',
      text: note.text,
      timestamp: new Date().toISOString(),
      durationSeconds: note.durationSeconds || null
    });
    // Keep max 100 notes
    this.saveVoiceNotes(notes.slice(0, 100));
  }

  // Bitrix Sync & API Logs
  loadBitrixLogs() {
    return this.get(this.keys.bitrixLogs, []);
  }

  saveBitrixLogs(logs) {
    this.set(this.keys.bitrixLogs, logs);
  }

  addBitrixLog(entry) {
    const logs = this.loadBitrixLogs();
    logs.unshift({
      id: 'bx_' + Date.now(),
      timestamp: new Date().toISOString(),
      method: entry.method,
      status: entry.status || 'OK',
      latency: entry.latency || 0,
      leadId: entry.leadId || null,
      details: entry.details || '',
      error: entry.error || null
    });
    this.saveBitrixLogs(logs.slice(0, 60));
  }

  // Full Backup Export & Import
  exportFullBackup(meta) {
    const backup = {
      exportDate: new Date().toISOString(),
      version: '1.0.0',
      meta: meta || {},
      progress: this.loadProg(),
      timer: this.loadTimer(),
      pomodoroHistory: this.loadPomodoroHistory(),
      voiceNotes: this.loadVoiceNotes(),
      bitrixLogs: this.loadBitrixLogs()
    };
    return backup;
  }

  importFullBackup(backupData) {
    if (!backupData || typeof backupData !== 'object') {
      throw new Error('Arquivo de backup inválido.');
    }

    if (backupData.progress) {
      const currentProg = this.loadProg();
      const mergedDone = Object.assign({}, currentProg.done, backupData.progress.done || {});
      const seen = new Set(currentProg.history.map(h => (h.LEAD_ID || '') + '|' + (h.at || '')));
      const mergedHistory = [...currentProg.history];

      (backupData.progress.history || []).forEach(h => {
        const k = (h.LEAD_ID || '') + '|' + (h.at || '');
        if (!seen.has(k)) {
          mergedHistory.push(h);
          seen.add(k);
        }
      });

      this.saveProg({ done: mergedDone, history: mergedHistory });
    }

    if (Array.isArray(backupData.pomodoroHistory)) {
      const currentPom = this.loadPomodoroHistory();
      const seenPom = new Set(currentPom.map(p => p.id || p.timestamp));
      const mergedPom = [...currentPom];
      backupData.pomodoroHistory.forEach(p => {
        const k = p.id || p.timestamp;
        if (!seenPom.has(k)) {
          mergedPom.push(p);
          seenPom.add(k);
        }
      });
      this.savePomodoroHistory(mergedPom);
    }

    if (Array.isArray(backupData.voiceNotes)) {
      const currentVoice = this.loadVoiceNotes();
      const seenVoice = new Set(currentVoice.map(v => v.id || v.timestamp));
      const mergedVoice = [...currentVoice];
      backupData.voiceNotes.forEach(v => {
        const k = v.id || v.timestamp;
        if (!seenVoice.has(k)) {
          mergedVoice.push(v);
          seenVoice.add(k);
        }
      });
      this.saveVoiceNotes(mergedVoice);
    }

    return true;
  }
}

window.storageManager = new StorageManager();
