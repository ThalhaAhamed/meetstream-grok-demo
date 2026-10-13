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
import { assertGrokAgent, buildGrokAgentConfig, describeAgent } from './src/agent.js';
import { getAgent, listAgents } from './src/api.js';
import { optional, optionalBoolean, optionalHttpsUrl, optionalNumber, required, requireHttpsUrl } from './src/env.js';
import { botPayload, createSession, warnAboutVoice } from './src/session.js';

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

  const session = createSession(loadConfig({ needMeeting: true }));
  const stop = () => session.stop().then(() => {
    if (session.state.failed) process.exitCode = 1;
  });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  await session.run();
  if (session.state.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[!!] ${error.message}`);
  process.exitCode = 1;
});
