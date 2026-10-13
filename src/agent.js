// Builds the realtime-mode MIA config for Grok that gets POSTed to /mia.
//
// Grok runs as a MeetStream realtime agent: one speech-to-speech model hears the
// room and speaks back, so there is no `voice`, `transcriber`, or `wake_word`
// block. The shape follows the "Realtime - xAI Grok" example in the MeetStream
// API reference (POST /mia): provider "xai", the voice inside `model`, and the
// interruption settings under `agent`.

import { optional, optionalBoolean } from './env.js';

// Built-in Grok voices at the time of writing. xAI may add more, so an unknown
// name is a warning, not an error.
export const GROK_VOICES = ['Ara', 'Eve', 'Leo', 'Rex', 'Sal'];

const DEFAULT_SYSTEM_PROMPT =
  'You are Grok, built by xAI, taking part in a live video meeting as a participant through MeetStream. ' +
  'You hear everyone in the call and you answer out loud. Keep every reply to one or two short spoken ' +
  'sentences so it lands before the conversation moves on. Never read out markdown, lists, or code. ' +
  'If you are not sure, say so rather than guessing.';

const DEFAULT_FIRST_MESSAGE = "Hi everyone, I'm Grok. I'm in the call and listening.";

export function buildGrokAgentConfig() {
  const voice = optional('GROK_VOICE', 'Ara');
  const model = optional('GROK_MODEL');

  const modelBlock = {
    provider: 'xai',
    voice,
    system_prompt: optional('GROK_SYSTEM_PROMPT', DEFAULT_SYSTEM_PROMPT),
    first_message: optional('GROK_FIRST_MESSAGE', DEFAULT_FIRST_MESSAGE)
  };
  // MeetStream picks its default Grok voice model when this is left out.
  if (model) modelBlock.model = model;

  return {
    agent_name: optional('MIA_AGENT_NAME', 'Grok Meeting Demo'),
    mode: 'realtime',
    model: modelBlock,
    agent: {
      response_type: 'voice',
      tools: [],
      preemptive_generation: false,
      user_away_timeout: 15,
      // With interruptions on, talking over Grok stops it mid-sentence. Turn
      // them off for a recording in a noisy room so a cough cannot cut a take.
      enable_interruptions: optionalBoolean('GROK_ALLOW_INTERRUPTIONS', true),
      interruptions: { min_duration_seconds: 0.5, word_threshold: 0 },
      false_interruption_timeout: 2,
      resume_false_interruption: true
    },
    audio: { sample_rate: 24000, num_channels: 1 }
  };
}

/** Voice names that would likely be rejected, so they show up before the call, not during it. */
export function voiceWarning(config) {
  const voice = config.model?.voice;
  if (!voice || GROK_VOICES.includes(voice)) return null;
  const match = GROK_VOICES.find((name) => name.toLowerCase() === voice.toLowerCase());
  if (match) return `GROK_VOICE "${voice}" differs from the documented spelling "${match}".`;
  return `GROK_VOICE "${voice}" is not one of the known Grok voices (${GROK_VOICES.join(', ')}).`;
}

/** Reads back a saved config for display. The GET route returns PascalCase keys. */
export function describeAgent(agent = {}) {
  const model = agent.Model || agent.model || {};
  const inner = agent.Agent || agent.agent || {};
  return [
    `  mode           ${agent.Mode || agent.mode || 'unknown'}`,
    `  model          ${model.provider || '-'} ${model.model || '(MeetStream default)'}`,
    `  voice          ${model.voice || '-'}`,
    `  interruptions  ${inner.enable_interruptions === false ? 'off' : 'on'}`,
    `  responds as    ${inner.response_type || inner.response_modality || '-'}`
  ].join('\n');
}

/** Guard against reusing an agent that is not a realtime Grok agent. */
export function assertGrokAgent(agent = {}) {
  const mode = agent.Mode || agent.mode;
  const provider = (agent.Model || agent.model || {}).provider;
  if (mode && mode !== 'realtime') {
    throw new Error(
      `MEETSTREAM_AGENT_CONFIG_ID points at a "${mode}" agent. This demo expects a realtime Grok agent. ` +
        'Unset the id to create one.'
    );
  }
  if (provider && provider !== 'xai') {
    throw new Error(
      `MEETSTREAM_AGENT_CONFIG_ID points at a "${provider}" agent, not Grok. Unset the id to create a Grok agent.`
    );
  }
}
