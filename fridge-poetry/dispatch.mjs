// Dispatch is the only outbound request. Keep its protocol separate from DOM code.
const AGENT_MOVE = "/root/workspace/dev/tv-demos/fridge-poetry/agent-move";

/** Build the short task sent to Rupert's running Claude Code session. */
export function buildMessage(word, poemLines) {
  const quotedWord = JSON.stringify(word);
  const poem = poemLines.length ? poemLines.map((line) => line.join(" ")).join(" / ") : "(empty)";
  return `Fridge poetry: Rupert just put ${quotedWord} on the fridge. Current poem: ${poem}. Your turn. Run \`${AGENT_MOVE} board\` to see the fridge and the pile, then place ONE word from the pile that continues his line, with \`${AGENT_MOVE} place <word> --after ${quotedWord}\`. Be playful. Reply with only the word you chose.`;
}

/** Submit exactly one immediate HTTP message; only 202 counts as success. */
export async function submitTurn(config, message, fetchRequest = fetch) {
  const base = config.dispatchBase.replace(/\/+$/, "");
  const url = `${base}/sessions/${encodeURIComponent(config.sessionId)}/messages`;
  const response = await fetchRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
  if (response.status !== 202) {
    throw new Error(`Dispatch returned ${response.status}`);
  }
}
