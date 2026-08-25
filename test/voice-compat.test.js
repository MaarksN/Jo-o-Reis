import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/voice-service.js', import.meta.url), 'utf8');

function boot() {
  class FakeRecognition {
    constructor() {
      FakeRecognition.last = this;
    }
    start() {}
    stop() {}
  }

  const note = { value: '' };
  const stored = [];
  const window = {
    SpeechRecognition: FakeRecognition,
    storageManager: {
      addVoiceNote(item) {
        stored.push(item);
      }
    },
    toast: () => {}
  };
  const document = {
    getElementById(id) {
      return id === 'note' ? note : null;
    }
  };
  const context = { window, document, console, String };
  vm.runInNewContext(source, context, { filename: 'voice-service.js' });
  return { service: window.voiceService, FakeRecognition, note, stored };
}

function finalEvent(text) {
  const result = [{ transcript: text }];
  result.isFinal = true;
  return { resultIndex: 0, results: [result] };
}

test('legacy callback contract returns final text and lead metadata', () => {
  const { service, FakeRecognition, stored } = boot();
  let received = '';

  service.startDictation((text) => { received = text; }, '19814', 'Cliente Exemplo');
  const recognition = FakeRecognition.last;
  recognition.onresult(finalEvent('cliente pediu retorno ponto final'));
  recognition.onend();

  assert.equal(received, 'Cliente pediu retorno.');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].leadId, '19814');
  assert.equal(stored[0].clientName, 'Cliente Exemplo');
  assert.equal(stored[0].text, 'Cliente pediu retorno.');
});

test('direct target contract still writes into the note field', () => {
  const { service, FakeRecognition, note, stored } = boot();

  service.startDictation('note', { LEAD_ID: '20212', CLIENTE: 'Contato Direto' });
  const recognition = FakeRecognition.last;
  recognition.onresult(finalEvent('reunião agendada'));
  recognition.onend();

  assert.equal(note.value, 'Reunião agendada');
  assert.equal(stored.length, 1);
  assert.equal(stored[0].leadId, '20212');
});
