// Grok in a live meeting, through MeetStream MIA.
//
// Built on the mia-realtime-agent template from https://github.com/meetstream-ai/labs.
//
// 1. Save a realtime MIA config with Grok (provider "xai") as the model, via POST /mia.
// 2. Send a bot into the meeting with that config attached.
// 3. Follow the bot status until you press Ctrl+C, then remove the bot.
//
// MeetStream hosts the audio bridge and the connection to xAI, so this program
// opens no websocket and never sees an xAI key.
//
//   node index.js              join the meeting
//   node index.js --dry-run    print the agent config and bot request, send nothing
//   node index.js --check      also verify the API key and any saved agent, no bot

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { assertGrokAgent, buildGrokAgentConfig, describeAgent, voiceWarning } from './src/agent.js';
import { createAgent, createBot, deleteAgent, getAgent, listAgents, removeBot, watchBot } from './src/api.js';
import { optional, optionalBoolean, optionalHttpsUrl, optionalNumber, required, requireHttpsUrl } from './src/env.js';

let state = { apiKey: null, botId: null, agentConfigId: null, deleteAgentOnExit: false };
let stopping = null;
let startup = null;
const startedAt = Date.now();

const args = new Set(process.argv.slice(2));

function loadConfig({ needMeeting, needKey = true }) {
  return {
    apiKey: needKey
      ? required('MEETSTREAM_API_KEY', 'Create one at https://app.meetstream.ai.')
      : optional('MEETSTREAM_API_KEY'),
    meetingLink: needMeeting
      ? requireHttpsUrl('MEETING_LINK', 'Paste the Google Meet, Zoom, or Teams link.')
      : optional('MEETING_LINK'),
    existingAgentConfigId: optional('MEETSTREAM_AGENT_CONFIG_ID'),
    botName: optional('BOT_NAME', 'Grok'),
    callbackUrl: optionalHttpsUrl('CALLBACK_URL'),
    deleteAgentOnExit: optionalBoolean('DELETE_AGENT_ON_EXIT', false),
    pollIntervalMs: optionalNumber('POLL_INTERVAL_SECONDS', 5) * 1000
  };
}

function botPayload(config, agentConfigId) {
  // The only MIA field on create_bot is agent_config_id. No socket_connection_url,
  // no live_audio_required: those are for bring-your-own-bridge setups.
  const payload = {
    meeting_link: config.meetingLink,
    bot_name: config.botName,
    // Audio only. `false` is sent explicitly because the REST API treats an
    // omitted `video_required` as true. Record the demo with your own screen
    // recorder; the bot's recording is the backup and the transcript source.
    video_required: false,
    agent_config_id: agentConfigId
  };
  if (config.callbackUrl) payload.callback_url = config.callbackUrl;
  return payload;
}

/** Elapsed time since start, so log lines can be matched against the screen recording. */
function stamp() {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function warnAboutVoice(agentConfig) {
  const warning = voiceWarning(agentConfig);
  if (warning) console.warn(`[??] ${warning} MeetStream may reject it with HTTP 400.`);
}

function printHelp() {
  console.log('Usage: node index.js [--dry-run | --check]');
  console.log('  (no flag)   save a Grok agent (or reuse MEETSTREAM_AGENT_CONFIG_ID), send it into MEETING_LINK');
  console.log('  --dry-run   print the agent config and create_bot request; no network calls');
  console.log('  --check     verify the API key and the saved agent, if any; no bot is sent');
  console.log('  Ctrl+C removes the bot. See README.md for every variable and DEMO.md for the recording runbook.');
}

async function dryRun() {
  const config = loadConfig({ needMeeting: false, needKey: false });
  const agentConfig = buildGrokAgentConfig();
  warnAboutVoice(agentConfig);
  console.log('POST /mia');
  console.log(JSON.stringify(agentConfig, null, 2));
  console.log('\nPOST /bots/create_bot');
  const payload = botPayload(config, config.existingAgentConfigId || '<agent_config_id from POST /mia>');
  console.log(JSON.stringify({ ...payload, meeting_link: payload.meeting_link || '<MEETING_LINK>' }, null, 2));
}

async function check() {
  const config = loadConfig({ needMeeting: false });
  const agents = await listAgents(config.apiKey);
  console.log(`[ok] MeetStream accepted the API key (${agents.length} saved agent config(s))`);

  if (config.existingAgentConfigId) {
    const agent = await getAgent(config.apiKey, config.existingAgentConfigId);
    assertGrokAgent(agent);
    console.log(`[ok] Saved agent ${config.existingAgentConfigId} is a realtime Grok agent`);
    console.log(describeAgent(agent));
  } else {
    const agentConfig = buildGrokAgentConfig();
    warnAboutVoice(agentConfig);
    console.log('[ok] No MEETSTREAM_AGENT_CONFIG_ID set; a run will create this agent:');
    console.log(describeAgent(agentConfig));
    console.log('     Save one ahead of the recording so a live run skips that step.');
  }

  if (config.meetingLink) {
    requireHttpsUrl('MEETING_LINK');
    console.log(`[ok] MEETING_LINK ${config.meetingLink}`);
  } else {
    console.log('[??] MEETING_LINK is not set yet. Add it before the run.');
  }
}

async function main() {
  if (args.has('--help') || args.has('-h')) return printHelp();
  if (args.has('--dry-run')) return dryRun();
  if (args.has('--check')) return check();

  const config = loadConfig({ needMeeting: true });
  state.apiKey = config.apiKey;
  state.deleteAgentOnExit = config.deleteAgentOnExit;

  if (config.existingAgentConfigId) {
    const agent = await getAgent(config.apiKey, config.existingAgentConfigId);
    assertGrokAgent(agent);
    state.agentConfigId = config.existingAgentConfigId;
    console.log(`[${stamp()}] Reusing saved Grok agent ${state.agentConfigId}`);
    console.log(describeAgent(agent));
  } else {
    const agentConfig = buildGrokAgentConfig();
    warnAboutVoice(agentConfig);
    const created = await createAgent(config.apiKey, agentConfig);
    state.agentConfigId = created.agentConfigId;
    console.log(`[${stamp()}] Created Grok agent ${state.agentConfigId}`);
    console.log(describeAgent(agentConfig));
    if (!config.deleteAgentOnExit) {
      console.log('        Reuse it next run with MEETSTREAM_AGENT_CONFIG_ID=' + state.agentConfigId);
    }
  }

  if (stopping) return;

  const bot = await createBot(config.apiKey, botPayload(config, state.agentConfigId), randomUUID());
  state.botId = bot.bot_id;
  console.log(`[${stamp()}] Bot ${bot.bot_id} is joining ${bot.meeting_url || config.meetingLink}`);
  if (bot.transcript_id) console.log(`        transcript_id ${bot.transcript_id}`);
  console.log('        Admit it from the waiting room, then talk to Grok. Ctrl+C to remove it.');

  const finalStatus = await watchBot(config.apiKey, state.botId, {
    intervalMs: config.pollIntervalMs,
    shouldStop: () => Boolean(stopping),
    onStatus: (status) => console.log(`[${stamp()}] status: ${status}`)
  });
  if (finalStatus && !stopping) console.log(`[${stamp()}] Session finished with status ${finalStatus}`);
}

async function cleanup() {
  if (state.botId) {
    try {
      await removeBot(state.apiKey, state.botId);
      console.log(`[${stamp()}] Asked MeetStream to remove the bot`);
    } catch (error) {
      process.exitCode = 1;
      console.error(`[!!] Could not remove bot ${state.botId}: ${error.message}`);
    }
    state.botId = null;
  }
  if (state.deleteAgentOnExit && state.agentConfigId) {
    try {
      await deleteAgent(state.apiKey, state.agentConfigId);
      console.log(`[${stamp()}] Deleted agent ${state.agentConfigId}`);
    } catch (error) {
      process.exitCode = 1;
      console.error(`[!!] Could not delete agent ${state.agentConfigId}: ${error.message}`);
    }
    state.agentConfigId = null;
  }
}

function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    console.log('\nStopping...');
    await startup?.catch(() => {});
    await cleanup();
  })();
  return stopping;
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

startup = main().catch(async (error) => {
  console.error(`[!!] ${error.message}`);
  process.exitCode = 1;
  if (!stopping) await cleanup();
});
