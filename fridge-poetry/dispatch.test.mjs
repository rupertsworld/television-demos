// The local fetch stub checks the page's complete Dispatch request without contacting a session.
import assert from "node:assert/strict";
import test from "node:test";
import { buildMessage, submitTurn } from "./dispatch.mjs";

test("message includes Rupert's word, the poem, and exact agent instructions", () => {
  const message = buildMessage("moon", [["the", "moon"], ["glow"]]);
  assert.match(message, /Rupert just put "moon"/);
  assert.match(message, /Current poem: the moon \/ glow/);
  assert.match(message, /agent-move board/);
  assert.match(message, /agent-move place <word> --after "moon"/);
  assert.match(message, /Reply with only the word you chose/);
});

test("submits one JSON message to the configured session", async () => {
  let request;
  const response = await submitTurn(
    { dispatchBase: "http://local-stub/dispatch/", sessionId: "session-123" },
    "hello",
    async (url, options) => {
      request = { url, options };
      return { status: 202 };
    },
  );
  assert.equal(response, undefined);
  assert.equal(request.url, "http://local-stub/dispatch/sessions/session-123/messages");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.options.body), { text: "hello" });
});

test("a non-202 response fails so the page can clear thinking", async () => {
  await assert.rejects(
    submitTurn(
      { dispatchBase: "http://local-stub/dispatch", sessionId: "session-123" },
      "hello",
      async () => ({ status: 503 }),
    ),
    /503/,
  );
});
