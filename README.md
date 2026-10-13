# Put Grok in a Live Meeting with the MeetStream API

Send Grok into a Google Meet, Zoom, or Microsoft Teams call as a speaking participant. Grok hears everyone in the room and answers out loud. MeetStream provides the bot, the audio in and out, and the in-meeting presence; Grok (xAI) is the model behind the agent.

```console
npm install && cp .env.example .env && npm run check && npm start
```

Built on the [`mia-realtime-agent`](https://github.com/meetstream-ai/labs/tree/main/mia-realtime-agent) template from [MeetStream Labs](https://github.com/meetstream-ai/labs). The API client (`src/api.js`) and env handling (`src/env.js`) are copied from it unchanged, apart from `listAgents`, which comes from [`mia-agent-crud`](https://github.com/meetstream-ai/labs/tree/main/mia-agent-crud). Only the agent config changes, from OpenAI to Grok.

## What it does

1. `POST /mia` saves a realtime MIA config with `model.provider: "xai"` and returns an `agent_config_id`.
2. `POST /bots/create_bot` sends a bot named `Grok` into your meeting with that `agent_config_id` attached.
3. The program polls `GET /bots/{id}/detail` and prints each status change with an elapsed-time stamp, so you can line the log up against a screen recording.
4. Ctrl+C removes the bot with `GET /bots/{id}/remove_bot` and, optionally, deletes the agent.

MeetStream hosts the realtime bridge to xAI. This program opens no websocket and never handles an xAI key.

## Prerequisites

- Node.js 18 or newer
- A MeetStream API key from [app.meetstream.ai](https://app.meetstream.ai)
- xAI enabled as a realtime provider on that MeetStream account
- A meeting link you can admit a bot into

## Setup

```console
git clone https://github.com/ThalhaAhamed/meetstream-grok-demo.git
cd meetstream-grok-demo
npm install
cp .env.example .env     # set MEETSTREAM_API_KEY and MEETING_LINK
npm run check            # verifies the key and the saved agent without joining anything
```

## Run

```console
npm start
```

Admit `Grok` from the waiting room. It stays quiet until someone talks to it, then answers out loud. Ctrl+C removes it.

The first run prints the new `agent_config_id`. Put it in `.env` as `MEETSTREAM_AGENT_CONFIG_ID` so later runs reuse that agent and skip the create step. Do this before you record.

| Command | What it does | Network |
| --- | --- | --- |
| `npm start` | Save or reuse the agent, join the meeting | yes |
| `npm run check` | Verify the API key and saved agent; no bot | read-only |
| `npm run dry-run` | Print both request bodies; no API key needed | none |
| `npm test` | Config builder tests, plus the join and shutdown flow run against a local mock of the MeetStream API | none |

## The Grok config

This follows MeetStream's "Realtime – xAI Grok" example in the [create agent config reference](https://docs.meetstream.ai/api-reference/api-endpoints/mia/create-agent-config). The `agent` settings match the saved agent that recorded the first real Grok call:

```json
{
  "agent_name": "Grok Meeting Demo",
  "mode": "realtime",
  "model": {
    "provider": "xai",
    "voice": "Ara",
    "system_prompt": "You are Grok, built by xAI, taking part in a live video meeting ...",
    "first_message": "",
    "temperature": 0.8
  },
  "agent": {
    "response_modality": "audio",
    "custom_functions": [],
    "mcp_servers": [],
    "preemptive_generation": true,
    "user_away_timeout": 15,
    "interruption_mode": "vad",
    "vad_type": "semantic_vad",
    "vad_eagerness": "medium",
    "vad_create_response": true,
    "vad_interrupt_response": true,
    "enable_interruptions": true,
    "interruptions": { "min_duration_seconds": 0.5, "word_threshold": 0 },
    "false_interruption_timeout": 2,
    "resume_false_interruption": true
  },
  "audio": { "sample_rate": 24000, "num_channels": 1 }
}
```

Realtime mode has no `voice`, `transcriber`, or `wake_word` block. Grok hears audio and speaks audio itself, which is why the replies come back quickly enough to feel like a participant.

`model.model` is omitted by default, as in MeetStream's example, so MeetStream picks its Grok voice model. Set `GROK_MODEL` to pin one.

## Environment variables

| Name | Required | Meaning |
| --- | --- | --- |
| `MEETSTREAM_API_KEY` | yes | Sent as `Authorization: Token <key>`. |
| `MEETING_LINK` | yes for `start` | Full Google Meet, Zoom, or Teams link. |
| `MEETSTREAM_AGENT_CONFIG_ID` | no | Reuse a saved Grok agent. Must be realtime with provider `xai`. |
| `GROK_VOICE` | no | `Ara` (default), `Eve`, `Leo`, `Rex`, or `Sal`. Other names print a warning. |
| `GROK_MODEL` | no | Pin a Grok voice model id. Default: MeetStream's choice. |
| `GROK_FIRST_MESSAGE` | no | Spoken when the bot is admitted. Default empty: Grok waits to be addressed. |
| `GROK_SYSTEM_PROMPT` | no | Replaces the default meeting-participant prompt. |
| `GROK_ALLOW_INTERRUPTIONS` | no | `true` (default) lets people talk over Grok. `false` for noisy rooms. |
| `BOT_NAME` | no | Display name in the meeting. Default `Grok`. |
| `MIA_AGENT_NAME` | no | Saved agent name. Default `Grok Meeting Demo`. |
| `CALLBACK_URL` | no | Public HTTPS endpoint for lifecycle webhooks. |
| `DELETE_AGENT_ON_EXIT` | no | `true` deletes the agent config on exit. Default `false`. |
| `POLL_INTERVAL_SECONDS` | no | Seconds between status polls. Default `5`. |
| `MEETSTREAM_BASE_URL` | no | API base. Default `https://api.meetstream.ai/api/v1`. |

**Recording defaults.** This template records audio only. `video_required: false` is sent explicitly, because the REST API treats an omitted `video_required` as true, and audio only is faster to process and smaller to store. If you turn video on, also send `recording_config.video_layout: "speaker_view"` (the API default is `grid_view`, so speaker view has to be explicit); use `grid_view` only when you want the composited mosaic of everyone. Per-participant video (`video_separate_streams`) is never set here. Capture the demo video with your own screen recorder; see [DEMO.md](DEMO.md).

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| HTTP 403 | Key wrong or revoked | The header is `Token <key>`, not `Bearer`. Regenerate the key. |
| HTTP 400 on `POST /mia` | xAI is not enabled for the account, or the voice/model id is not accepted | Check the MeetStream dashboard integrations; try `GROK_VOICE=Ara` and no `GROK_MODEL`. |
| `points at a "pipeline" agent` / `not Grok` | `MEETSTREAM_AGENT_CONFIG_ID` is some other agent | Unset it and run again to create a Grok agent. |
| Bot joins but never speaks | Expected until someone addresses it (no greeting by default). If it stays silent when asked, the xAI integration is not connected or the agent lacks `response_modality: "audio"` | Run `npm run check`; recreate the agent. |
| Grok stops mid-sentence | Background noise counts as an interruption | `GROK_ALLOW_INTERRUPTIONS=false`, recreate the agent. |
| Status ends at `NotAllowed` or `Denied` | Nobody admitted the bot | Admit it from the People panel; re-run. |
| Bot still in the call after Ctrl+C | The process exited before the remove call finished | Wait for `Asked MeetStream to remove the bot`, or call `GET /bots/{id}/remove_bot`. |

## Related

- [What is MIA](https://docs.meetstream.ai/guides/mia/what-is-mia)
- [MIA custom configurations](https://docs.meetstream.ai/guides/mia/mia-custom-configurations)
- [Create agent config](https://docs.meetstream.ai/api-reference/api-endpoints/mia/create-agent-config)
- [Create bot](https://docs.meetstream.ai/api-reference/api-endpoints/bot-endpoints/create-bot)
- Built from [mia-realtime-agent](https://github.com/meetstream-ai/labs/tree/main/mia-realtime-agent); see also [mia-voice-agent-pipeline](https://github.com/meetstream-ai/labs/tree/main/mia-voice-agent-pipeline), [mia-agent-crud](https://github.com/meetstream-ai/labs/tree/main/mia-agent-crud) and [mia-wake-word-assistant](https://github.com/meetstream-ai/labs/tree/main/mia-wake-word-assistant)

## License

MIT. Derived from MeetStream Labs (MIT, © 2026 MeetStream.ai). Grok and xAI are trademarks of xAI; this project is not made, endorsed, or sponsored by xAI.
