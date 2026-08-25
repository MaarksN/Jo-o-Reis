/**
 * AtlasGR • Voice Service & Dictation
 * Speech-to-text recognition for fast SDR notes and voice command execution.
 */

class VoiceService {
  constructor() {
    this.recognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = null;
    this.dictationRecognition = null;
    this.isListeningCommands = false;
    this.isDictating = false;
    this.autoRestartCommands = false;
  }

  isSupported() {
    return !!this.recognitionClass;
  }

  formatVoiceText(text) {
    if (!text) return '';
    let s = text.trim();
    // Replace punctuation verbal triggers
    s = s.replace(/\s+vírgula\b/gi, ',');
    s = s.replace(/\s+ponto final\b/gi, '.');
    s = s.replace(/\s+ponto e vírgula\b/gi, ';');
    s = s.replace(/\s+dois pontos\b/gi, ':');
    s = s.replace(/\s+ponto de interrogação\b/gi, '?');
    s = s.replace(/\s+ponto de exclamação\b/gi, '!');
    s = s.replace(/\s+(novo parágrafo|nova linha|parágrafo)\b/gi, '\n');
    
    // Capitalize first letter
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  normalizeCommand(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[áàâã]/g, 'a')
      .replace(/[éê]/g, 'e')
      .replace(/[íî]/g, 'i')
      .replace(/[óôõ]/g, 'o')
      .replace(/[úû]/g, 'u')
      .replace(/ç/g, 'c')
      .trim();
  }

  startDictation(targetElementId = 'note', leadInfo = null) {
    if (!this.isSupported()) {
      if (window.toast) window.toast('Ditado por voz não é suportado neste navegador. Utilize Google Chrome ou Edge.');
      return;
    }

    if (this.isDictating) {
      this.stopDictation();
      return;
    }

    try {
      this.dictationRecognition = new this.recognitionClass();
      this.dictationRecognition.lang = 'pt-BR';
      this.dictationRecognition.continuous = false;
      this.dictationRecognition.interimResults = true;

      const targetEl = document.getElementById(targetElementId);
      const dictationBtn = document.getElementById('dictateBtn') || document.getElementById('voiceNoteBtn');
      const originalBtnText = dictationBtn ? dictationBtn.innerHTML : '';

      if (dictationBtn) {
        dictationBtn.innerHTML = '🔴 Gravando... (fale agora)';
        dictationBtn.classList.add('recording-pulse');
      }

      this.isDictating = true;
      if (window.toast) window.toast('🎙️ Gravando... Fale o resultado do contato ou observação.');

      let finalTranscript = '';

      this.dictationRecognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        if (targetEl) {
          const formatted = this.formatVoiceText(finalTranscript + (interim ? ' ' + interim : ''));
          targetEl.value = formatted;
        }
      };

      this.dictationRecognition.onend = () => {
        this.isDictating = false;
        if (dictationBtn) {
          dictationBtn.innerHTML = originalBtnText || '🎤 Ditar observação por voz';
          dictationBtn.classList.remove('recording-pulse');
        }

        const finalText = targetEl ? targetEl.value.trim() : '';
        if (finalText && window.storageManager) {
          window.storageManager.addVoiceNote({
            leadId: leadInfo?.LEAD_ID || (window.current ? window.current()?.LEAD_ID : null),
            clientName: leadInfo?.CLIENTE || (window.current ? window.current()?.CLIENTE : 'Atendimento SDR'),
            text: finalText
          });
        }
        if (window.toast) window.toast('✅ Ditado concluído e anotado!');
      };

      this.dictationRecognition.onerror = (event) => {
        this.isDictating = false;
        if (dictationBtn) {
          dictationBtn.innerHTML = originalBtnText || '🎤 Ditar observação por voz';
          dictationBtn.classList.remove('recording-pulse');
        }
        if (event.error !== 'no-speech' && window.toast) {
          window.toast('Aviso no microfone: ' + event.error);
        }
      };

      this.dictationRecognition.start();
    } catch (e) {
      this.isDictating = false;
      if (window.toast) window.toast('Não foi possível iniciar o microfone: ' + e.message);
    }
  }

  stopDictation() {
    if (this.dictationRecognition && this.isDictating) {
      this.dictationRecognition.stop();
      this.isDictating = false;
    }
  }

  toggleVoiceCommands() {
    if (!this.isSupported()) {
      if (window.toast) window.toast('Comandos de voz requerem Google Chrome ou navegador compatível.');
      return;
    }

    if (this.isListeningCommands) {
      this.autoRestartCommands = false;
      this.recognition?.stop();
      this.isListeningCommands = false;
      this.updateVoiceButton();
      if (window.toast) window.toast('Comandos de voz desativados.');
      return;
    }

    try {
      this.recognition = new this.recognitionClass();
      this.recognition.lang = 'pt-BR';
      this.recognition.continuous = true;
      this.recognition.interimResults = false;

      this.recognition.onresult = (event) => {
        const last = event.results[event.results.length - 1];
        if (last && last.isFinal) {
          const raw = last[0].transcript;
          this.executeVoiceCommand(this.normalizeCommand(raw), raw);
        }
      };

      this.recognition.onend = () => {
        this.isListeningCommands = false;
        this.updateVoiceButton();
        if (this.autoRestartCommands) {
          try {
            this.recognition.start();
            this.isListeningCommands = true;
            this.updateVoiceButton();
          } catch (e) {}
        }
      };

      this.recognition.onerror = (event) => {
        if (event.error === 'not-allowed') {
          if (window.toast) window.toast('Permissão de microfone negada no navegador.');
          this.autoRestartCommands = false;
        }
      };

      this.recognition.start();
      this.isListeningCommands = true;
      this.autoRestartCommands = true;
      this.updateVoiceButton();
      if (window.toast) {
        window.toast('🎤 Comando de voz ATIVADO. Fale: "iniciar foco", "pausar foco", "sincronizar", "atualizar lead", "ditar", ou "limpar".');
      }
    } catch (e) {
      if (window.toast) window.toast('Erro ao ativar microfone: ' + e.message);
    }
  }

  executeVoiceCommand(cmd, rawText) {
    console.log('[VoiceService] Command detected:', cmd, `("${rawText}")`);

    if (cmd.includes('iniciar foco') || cmd.includes('comecar foco') || cmd === 'iniciar') {
      if (window.pomodoroEngine) window.pomodoroEngine.startFocus();
      if (window.toast) window.toast('Comando de voz: Iniciar Foco ⏱️');
    } else if (cmd.includes('pausar foco') || cmd === 'pausar') {
      if (window.pomodoroEngine) window.pomodoroEngine.pauseTimer();
      if (window.toast) window.toast('Comando de voz: Pausar Cronômetro ⏸');
    } else if (cmd.includes('retomar foco') || cmd.includes('continuar foco') || cmd === 'retomar' || cmd === 'continuar') {
      if (window.pomodoroEngine) window.pomodoroEngine.resumeTimer();
      if (window.toast) window.toast('Comando de voz: Retomar Foco ▶');
    } else if (cmd.includes('sincronizar') || cmd.includes('sync')) {
      if (typeof window.syncAll === 'function') window.syncAll();
      if (window.toast) window.toast('Comando de voz: Sincronizar Bitrix ↻');
    } else if (cmd.includes('atualizar lead') || cmd === 'atualizar') {
      if (typeof window.syncCurrent === 'function') window.syncCurrent(true);
      if (window.toast) window.toast('Comando de voz: Atualizar Lead Atual ↻');
    } else if (cmd.includes('ditar') || cmd.includes('anotar')) {
      this.startDictation('note');
    } else if (cmd.includes('limpar nota') || cmd.includes('limpar observacao')) {
      const el = document.getElementById('note');
      if (el) el.value = '';
      if (window.toast) window.toast('Comando de voz: Nota limpa.');
    } else if (cmd.includes('concluir local')) {
      if (typeof window.finishLocal === 'function') window.finishLocal();
    } else if (cmd.includes('desativar voz') || cmd.includes('parar voz') || cmd === 'parar') {
      this.toggleVoiceCommands();
    }
  }

  updateVoiceButton() {
    const btn = document.getElementById('voiceBtn');
    if (btn) {
      btn.textContent = this.isListeningCommands ? '🔴 Ouvindo Comandos (clique p/ parar)' : '🎤 Comando de voz';
      btn.style.borderColor = this.isListeningCommands ? 'var(--o)' : 'var(--line)';
      btn.style.color = this.isListeningCommands ? 'var(--o)' : 'var(--ink)';
    }
  }
}

window.voiceService = new VoiceService();
