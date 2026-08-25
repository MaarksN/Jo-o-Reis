#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sanitizeLegacyHtml } from '../lib/sanitize-legacy-html.js';

const input = resolve(process.argv[2] || 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html');
const output = resolve(process.argv[3] || `${input}.sanitized`);

const source = readFileSync(input, 'utf8');
const sanitized = sanitizeLegacyHtml(source);
writeFileSync(output, sanitized, 'utf8');

console.log(`Sanitized HTML written to: ${output}`);
console.log(`Input bytes: ${Buffer.byteLength(source, 'utf8')}`);
console.log(`Output bytes: ${Buffer.byteLength(sanitized, 'utf8')}`);
