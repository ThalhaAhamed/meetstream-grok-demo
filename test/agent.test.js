import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertGrokAgent, buildGrokAgentConfig, describeAgent, voiceWarning } from '../src/agent.js';

const VARS = ['GROK_VOICE', 'GROK_MODEL', 'GROK_FIRST_MESSAGE', 'GROK_SYSTEM_PROMPT', 'GROK_ALLOW_INTERRUPTIONS', 'MIA_AGENT_NAME'];

afterEach(() => {
  for (const name of VARS) delete process.env[name];
});

test('default config is a realtime xAI agent that speaks', () => {
  const config = buildGrokAgentConfig();
  assert.equal(config.mode, 'realtime');
  assert.equal(config.model.provider, 'xai');
  assert.equal(config.model.voice, 'Ara');
  assert.equal(config.agent.response_type, 'voice');
  assert.equal(config.agent.enable_interruptions, true);
  assert.deepEqual(config.audio, { sample_rate: 24000, num_channels: 1 });
  assert.ok(config.model.first_message);
  assert.ok(config.model.system_prompt);
});

test('realtime config carries no pipeline blocks', () => {
  const config = buildGrokAgentConfig();
  assert.equal(config.voice, undefined);
  assert.equal(config.transcriber, undefined);
  assert.equal(config.wake_word, undefined);
});

test('model id is sent only when set', () => {
  assert.equal('model' in buildGrokAgentConfig().model, false);
  process.env.GROK_MODEL = 'grok-voice-test';
  assert.equal(buildGrokAgentConfig().model.model, 'grok-voice-test');
});

test('env overrides reach the body', () => {
  process.env.GROK_VOICE = 'Rex';
  process.env.GROK_FIRST_MESSAGE = 'Hello.';
  process.env.GROK_ALLOW_INTERRUPTIONS = 'false';
  const config = buildGrokAgentConfig();
  assert.equal(config.model.voice, 'Rex');
  assert.equal(config.model.first_message, 'Hello.');
  assert.equal(config.agent.enable_interruptions, false);
});

test('voice warnings', () => {
  assert.equal(voiceWarning({ model: { voice: 'Eve' } }), null);
  assert.match(voiceWarning({ model: { voice: 'eve' } }), /documented spelling "Eve"/);
  assert.match(voiceWarning({ model: { voice: 'nova' } }), /not one of the known Grok voices/);
});

test('assertGrokAgent accepts a saved Grok agent in either casing', () => {
  assert.doesNotThrow(() => assertGrokAgent({ Mode: 'realtime', Model: { provider: 'xai' } }));
  assert.doesNotThrow(() => assertGrokAgent({ mode: 'realtime', model: { provider: 'xai' } }));
});

test('assertGrokAgent rejects pipeline and non-xAI agents', () => {
  assert.throws(() => assertGrokAgent({ Mode: 'pipeline', Model: { provider: 'openai' } }), /"pipeline" agent/);
  assert.throws(() => assertGrokAgent({ Mode: 'realtime', Model: { provider: 'openai' } }), /not Grok/);
});

test('describeAgent reads the PascalCase GET shape', () => {
  const text = describeAgent({ Mode: 'realtime', Model: { provider: 'xai', voice: 'Ara' }, Agent: { enable_interruptions: false } });
  assert.match(text, /realtime/);
  assert.match(text, /xai \(MeetStream default\)/);
  assert.match(text, /interruptions\s+off/);
});
