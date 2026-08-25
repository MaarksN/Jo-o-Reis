/**
 * AtlasGR • Integrated Pomodoro Engine
 * Manages focus cycles, break intervals, audio/browser notifications, lead treatment duration tracking,
 * and state persistence across reloads.
 */

class PomodoroEngine {
  constructor() {
    this.audioCtx = null;
    this.timerInterval = null;
    this.state = this.loadState();
    this.activeLeadStartTime = null;
    this.activeLeadId = null;
  }

  loadState() {
    if (window.storageManager) {
      return window.storageManager.loadTimer();
    }
    return {
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
  }

  saveState() {
    if (window.storageManager) {
      window.storageManager.saveTimer(this.state);
    }
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  requestBrowserNotifications() {
    const NotificationApi = window.Notification;
    if (!NotificationApi || NotificationApi.permission !== 'default') return;
    try {
      const result = NotificationApi.requestPermission();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (e) {
      console.warn('[Pomodoro] Browser notification permission error:', e);
    }
  }

  notifyBrowser(title, body) {
    const NotificationApi = window.Notification;
    if (!NotificationApi || NotificationApi.permission !== 'granted') return false;
    try {
      new NotificationApi(title, {
        body,
        tag: 'atlasgr-pomodoro',
        renotify: true
      });
      return true;
    } catch (e) {
      console.warn('[Pomodoro] Browser notification error:', e);
      return false;
    }
  }

  playChime(type = 'focus_end') {
    if (!this.state.settings.soundEnabled) return;
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      if (type === 'focus_end') {
        [587.33, 880, 1174.66].forEach((freq, i) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.12);
          gain.gain.setValueAtTime(0, now + i * 0.12);
          gain.gain.linearRampToValueAtTime(0.3, now + i * 0.12 + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.8);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + i * 0.12);
          osc.stop(now + i * 0.12 + 0.85);
        });
      } else if (type === 'break_end') {
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.1);
          gain.gain.setValueAtTime(0, now + i * 0.1);
          gain.gain.linearRampToValueAtTime(0.25, now + i * 0.1 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.6);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + i * 0.1);
          osc.stop(now + i * 0.1 + 0.65);
        });
      } else if (type === 'tick_start') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      }
    } catch (e) {
      console.warn('[Pomodoro] Sound playback error:', e);
    }
  }

  startFocus(customMin = null) {
    this.requestBrowserNotifications();
    this.initAudio();
    this.playChime('tick_start');
    const min = customMin || this.state.settings.focusMin || 25;
    const duration = min * 60;

    this.state.phase = 'focus';
    this.state.duration = duration;
    this.state.end = Date.now() + duration * 1000;
    this.state.paused = false;
    this.state.remainingWhenPaused = 0;
    this.state.focusCount = (this.state.focusCount || 0) + 1;
    this.state.cycleIndex = ((this.state.cycleIndex || 0) % (this.state.settings.cyclesBeforeLongBreak || 4)) + 1;

    this.trackLeadStart(this.state.currentLeadId);

    this.saveState();
    this.render();
    if (window.toast) {
      window.toast(`Bloco de foco iniciado (${min} min). Concentração total no próximo Lead!`);
    }
  }

  startBreak() {
    this.playChime('focus_end');
    const isLongBreak = (this.state.cycleIndex >= (this.state.settings.cyclesBeforeLongBreak || 4));
    const min = isLongBreak ? (this.state.settings.longBreakMin || 15) : (this.state.settings.shortBreakMin || 5);
    const duration = min * 60;

    if (window.storageManager) {
      window.storageManager.logPomodoroSession({
        type: 'focus',
        durationMinutes: this.state.settings.focusMin || 25,
        cycleNumber: this.state.cycleIndex
      });
    }

    this.state.phase = isLongBreak ? 'long_break' : 'break';
    this.state.duration = duration;
    this.state.end = Date.now() + duration * 1000;
    this.state.paused = false;
    this.state.remainingWhenPaused = 0;

    this.saveState();
    this.render();
    this.notifyBrowser(
      'AtlasGR • Foco concluído',
      isLongBreak ? `Hora do descanso longo de ${min} minutos.` : `Hora do descanso de ${min} minutos.`
    );
    if (window.toast) {
      window.toast(isLongBreak ? `Descanso Longo iniciado (${min} min) ☕` : `Descanso de ${min} min iniciado 💧`);
    }
  }

  endBreak() {
    this.playChime('break_end');
    this.state.phase = 'idle';
    this.state.end = 0;
    this.state.paused = false;
    this.state.remainingWhenPaused = 0;
    this.activeLeadStartTime = null;

    this.saveState();
    this.render();
    this.notifyBrowser('AtlasGR • Descanso concluído', 'A mesa está pronta para o próximo bloco de foco.');
    if (typeof window.render === 'function') {
      window.render();
    }
    if (window.toast) {
      window.toast('Descanso concluído! Pronto para o próximo bloco de foco.');
    }
  }

  pauseTimer() {
    if (this.state.paused || this.state.phase === 'idle') return;
    const remaining = Math.max(0, Math.ceil((this.state.end - Date.now()) / 1000));
    this.state.paused = true;
    this.state.remainingWhenPaused = remaining;
    this.saveState();
    this.render();
    if (window.toast) window.toast('Cronômetro pausado.');
  }

  // Compatibility alias used by the legacy HTML wrapper.
  pause() {
    return this.pauseTimer();
  }

  resumeTimer() {
    if (!this.state.paused) return;
    this.initAudio();
    this.playChime('tick_start');
    const remaining = this.state.remainingWhenPaused || (this.state.settings.focusMin * 60);
    this.state.paused = false;
    this.state.end = Date.now() + remaining * 1000;
    this.state.remainingWhenPaused = 0;
    this.saveState();
    this.render();
    if (window.toast) window.toast('Cronômetro retomado.');
  }

  resetTimer() {
    this.state.phase = 'idle';
    this.state.end = 0;
    this.state.paused = false;
    this.state.remainingWhenPaused = 0;
    this.activeLeadStartTime = null;
    this.saveState();
    this.render();
    if (window.toast) window.toast('Cronômetro reiniciado.');
  }

  skipBreak() {
    if (this.state.phase === 'break' || this.state.phase === 'long_break') {
      this.endBreak();
    }
  }

  updateSettings(newSettings) {
    this.state.settings = Object.assign(this.state.settings, newSettings);
    this.saveState();
    this.render();
    if (window.toast) window.toast('Configurações do Pomodoro salvas.');
  }

  trackLeadStart(leadId = null) {
    this.activeLeadStartTime = Date.now();
    this.activeLeadId = leadId;
    this.state.currentLeadId = leadId;
    this.state.leadStartTime = this.activeLeadStartTime;
    this.saveState();
  }

  // Compatibility alias used by boot() and by lead transitions in the HTML.
  startLeadTimer(leadId = null) {
    this.trackLeadStart(leadId);
  }

  getLeadDuration() {
    const start = this.activeLeadStartTime || this.state.leadStartTime || Date.now();
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - start) / 1000));
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    const formatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    return {
      seconds: elapsedSeconds,
      formatted,
      durationSeconds: elapsedSeconds,
      formattedDuration: formatted
    };
  }

  canTreat() {
    if (!this.state.settings.strictLock) {
      return true;
    }
    return this.state.phase === 'focus' && !this.state.paused && (this.state.end > Date.now());
  }

  getRemaining() {
    if (this.state.paused) {
      return this.state.remainingWhenPaused || 0;
    }
    if (!this.state.end || this.state.phase === 'idle') {
      return (this.state.settings.focusMin || 25) * 60;
    }
    return Math.max(0, Math.ceil((this.state.end - Date.now()) / 1000));
  }

  startTicker() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.state.phase === 'idle' || this.state.paused) return;

      const rem = this.getRemaining();
      if (this.state.phase === 'focus' && rem <= 0) {
        this.startBreak();
        return;
      }
      if ((this.state.phase === 'break' || this.state.phase === 'long_break') && rem <= 0) {
        this.endBreak();
        return;
      }
      this.updateDisplay(rem);
    }, 1000);
  }

  updateDisplay(remSeconds) {
    const total = this.state.duration || (25 * 60);
    const rem = typeof remSeconds === 'number' ? remSeconds : this.getRemaining();
    const mm = String(Math.floor(rem / 60)).padStart(2, '0');
    const ss = String(rem % 60).padStart(2, '0');
    const pct = total > 0 ? ((total - rem) / total * 100).toFixed(1) + '%' : '0%';

    const timerEl = document.getElementById('timer');
    const ringEl = document.getElementById('ring');
    const phaseEl = document.getElementById('phase');
    const pTitleEl = document.getElementById('pTitle');
    const pBtnEl = document.getElementById('pBtn');
    const overlayEl = document.getElementById('overlay');
    const breakTimerEl = document.getElementById('breakTimer');
    const cycleDotsEl = document.getElementById('pomCycles');

    if (timerEl) timerEl.textContent = `${mm}:${ss}`;
    if (ringEl) ringEl.style.setProperty('--p', pct);

    const currentCycle = this.state.cycleIndex || 1;
    const maxCycles = this.state.settings.cyclesBeforeLongBreak || 4;
    let dots = '';
    for (let i = 1; i <= maxCycles; i++) {
      dots += i <= currentCycle ? '● ' : '○ ';
    }
    if (cycleDotsEl) {
      cycleDotsEl.innerHTML = `<span title="Ciclos completados na rodada">Ciclo ${currentCycle}/${maxCycles} [ ${dots.trim()} ]</span>`;
    }

    if (phaseEl) {
      if (this.state.paused) {
        phaseEl.textContent = 'Pausado ⏸';
        phaseEl.style.color = 'var(--muted)';
      } else if (this.state.phase === 'focus') {
        phaseEl.textContent = `Foco ${this.state.settings.focusMin}m 🔥`;
        phaseEl.style.color = 'var(--o)';
      } else if (this.state.phase === 'long_break') {
        phaseEl.textContent = 'Descanso Longo ☕';
        phaseEl.style.color = 'var(--blue)';
      } else if (this.state.phase === 'break') {
        phaseEl.textContent = 'Descanso 💧';
        phaseEl.style.color = 'var(--green)';
      } else {
        phaseEl.textContent = 'Aguardando';
        phaseEl.style.color = 'var(--muted)';
      }
    }

    if (pTitleEl) {
      if (this.state.paused) {
        pTitleEl.textContent = 'Sessão de foco pausada';
      } else if (this.state.phase === 'focus') {
        pTitleEl.textContent = 'Trate Leads em sequência';
      } else if (this.state.phase === 'break' || this.state.phase === 'long_break') {
        pTitleEl.textContent = 'Mesa bloqueada para descanso';
      } else {
        pTitleEl.textContent = 'Inicie o bloco de foco';
      }
    }

    if (pBtnEl) {
      if (this.state.phase === 'idle') {
        pBtnEl.textContent = `Iniciar ${this.state.settings.focusMin} min`;
        pBtnEl.onclick = () => this.startFocus();
      } else if (this.state.paused) {
        pBtnEl.textContent = 'Retomar ▶';
        pBtnEl.onclick = () => this.resumeTimer();
      } else {
        pBtnEl.textContent = 'Pausar ⏸';
        pBtnEl.onclick = () => this.pauseTimer();
      }
    }

    const isBreak = this.state.phase === 'break' || this.state.phase === 'long_break';
    if (overlayEl) {
      overlayEl.classList.toggle('show', isBreak);
    }
    if (breakTimerEl) {
      breakTimerEl.textContent = `${mm}:${ss}`;
    }

    this.applyLocks();
  }

  applyLocks() {
    const allowed = this.canTreat();
    document.querySelectorAll('.treatment').forEach(b => {
      b.disabled = !allowed;
    });
  }

  // Compatibility alias used by renderCurrent()/applyTimerLock() in the HTML.
  applyTimerLock() {
    return this.applyLocks();
  }

  render() {
    this.updateDisplay();
    this.startTicker();
  }
}

window.pomodoroEngine = new PomodoroEngine();
