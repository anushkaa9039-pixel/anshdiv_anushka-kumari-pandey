// Server-side only. Calls the decision model with narrow, typed questions.
// Model output is allow-listed below, so pasted text can never inject free-form content.
import { parseEventText } from "../src/core.js";

const URL_ = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "typesafe/jev-1.13";
const TOPICS = ["tech", "arts", "career", "social"];
const LEVEL = { calm: 1, balanced: 3, lively: 5 };
const CROWD = { small: 1, medium: 3, large: 5 };

export const QUESTIONS = {
  is_event: { type: "noul", instructions: "Does this message announce a real event people can attend?",
    criteria: { true: "It announces a real community event", false: "It is spam, a scam, abuse or not an event" } },
  topic: { type: "choice", instructions: "Which topic fits this event best?",
    criteria: { tech: "Coding, hackathons, AI, open source", arts: "Music, art, poetry, film", career: "Jobs, resumes, startups, internships", social: "Games, reading, hangouts" } },
  energy: { type: "choice", instructions: "How energetic is this event?",
    criteria: { calm: "Quiet and relaxed", balanced: "Moderate pace", lively: "Loud and high energy" } },
  crowd: { type: "choice", instructions: "How big will the crowd be?",
    criteria: { small: "Under 20 people", medium: "20 to 100 people", large: "Over 100 people" } },
};

export function interpret(a = {}) {
  const out = {};
  const p = Number(a.is_event?.noul);
  if (Number.isFinite(p)) out.isEvent = p >= 0.5;
  if (TOPICS.includes(a.topic?.choice)) out.topic = a.topic.choice;
  if (Object.hasOwn(LEVEL, a.energy?.choice)) out.energy = LEVEL[a.energy.choice];
  if (Object.hasOwn(CROWD, a.crowd?.choice)) out.crowd = CROWD[a.crowd.choice];
  return out;
}

/** Always resolves: with no key or any upstream failure it falls back to local parsing. */
export async function analyze(text, { key, fetchImpl = fetch } = {}) {
  const base = { ...parseEventText(text), isEvent: true, energy: 3, crowd: 3, source: "local" };
  if (!key) return base;
  try {
    const res = await fetchImpl(URL_, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, state: [`Event message: ${text}`], questions: QUESTIONS }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return base;
    return { ...base, ...interpret((await res.json()).answers), source: "model" };
  } catch {
    return base;
  }
}
