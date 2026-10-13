# Recording Runbook

The goal is one clean take of Grok answering out loud in a real call, usable for social and the press campaign. Everything here is about making that take repeatable.

## The day before

- [ ] `npm run check` passes with the real key.
- [ ] One full rehearsal run: `npm start`, admit the bot, run the script below, Ctrl+C. Copy the printed `agent_config_id` into `.env` as `MEETSTREAM_AGENT_CONFIG_ID`, so the recording day never creates an agent.
- [ ] Choose the voice (`GROK_VOICE`) during the rehearsal and keep it. Changing it means recreating the agent; unset `MEETSTREAM_AGENT_CONFIG_ID` and run once more.
- [ ] Decide the platform. Google Meet admits bots most predictably; use a meeting you host so you can admit it.
- [ ] Walk through [PUBLISHING.md](PUBLISHING.md) before the take, not after.

## Setup for the take

- Host the meeting from one machine, with a second participant on another device (or a second person) so the call looks like a real meeting.
- Use a headset or a quiet room. If you can't, set `GROK_ALLOW_INTERRUPTIONS=false` and recreate the agent, so room noise cannot cut Grok off.
- Start the screen recorder (OBS or the platform's recorder) **before** `npm start`, capturing the meeting window and system audio. The join and the first message are part of the shot.
- Keep the terminal visible on a second screen. The `[mm:ss]` stamps line up with the recording when you edit.
- Hide notifications, bookmarks, and anything personal in the browser.

## Script

Keep the questions short and give Grok a beat to answer. Realtime replies come back in about a second, but meeting platforms add their own buffering.

1. Admit `Grok`. Let it say its first message.
2. "Grok, can you hear us?"
3. "We're planning a product launch. Give us one idea to make it more interesting."
4. A follow-up on its answer: "Why would that work better than a normal demo?"
5. "Grok, are you actually in this meeting?"
6. Thank it, then Ctrl+C. Leave the terminal open until it prints `Asked MeetStream to remove the bot`.

Do three takes and keep the best one. Avoid questions about live news, prices, or anything Grok can't verify. A confident wrong answer in a press clip costs more than a dull one.

## If it fights back

| Problem during the take | Move |
| --- | --- |
| Bot never appears in the waiting room | Ctrl+C, check status lines for `Denied`/`Error`, re-run. |
| Bot joins but stays silent | Ctrl+C. Run `npm run check`. If the agent looks right, the xAI integration on the MeetStream side is the suspect; stop and ask MeetStream. |
| Grok talks over people or gets cut off | Toggle `GROK_ALLOW_INTERRUPTIONS`, recreate the agent, retake. |
| Answers run long | Tighten `GROK_SYSTEM_PROMPT` ("one sentence"), recreate the agent. |

This is a timeboxed side quest. If a second session still can't produce a clean take, stop and write down what failed.
