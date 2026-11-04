"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { createProvider } = require("../src/modules/ai-guide/provider");
const config = {
  key: "synthetic",
  base: "https://provider.invalid/v1/",
  models: ["primary", "secondary"],
};
const good = () => ({
  ok: true,
  json: async () => ({
    choices: [
      { message: { content: "Useful guidance" }, finish_reason: "stop" },
    ],
  }),
});
test("invalid primary model is quarantined while fallback succeeds and next request skips it", async () => {
  const calls = [];
  const provider = createProvider({
    getConfig: () => config,
    fetchImpl: async (url, body) => {
      const model = JSON.parse(body.body).model;
      calls.push(model);
      return model === "primary" ? { ok: false, status: 404 } : good();
    },
  });
  assert.equal((await provider([])).model, "secondary");
  assert.equal((await provider([])).model, "secondary");
  assert.deepEqual(calls, ["primary", "secondary", "secondary"]);
});
test("rate limit respects cooldown without retrying or fanning out; recovers after cooldown", async () => {
  let time = 1000,
    calls = 0;
  const provider = createProvider({
    getConfig: () => config,
    now: () => time,
    fetchImpl: async () =>
      ++calls === 1
        ? { ok: false, status: 429, headers: { get: () => "10" } }
        : good(),
  });
  assert.equal(await provider([]), null);
  assert.equal(await provider([]), null);
  assert.equal(calls, 1);
  time += 10001;
  assert.ok(await provider([]));
});
test("auth rejection stops all attempts and changing credentials resets the circuit", async () => {
  let key = "first",
    calls = 0;
  const provider = createProvider({
    getConfig: () => ({ ...config, key }),
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 401 };
    },
  });
  assert.equal(await provider([]), null);
  assert.equal(await provider([]), null);
  assert.equal(calls, 1);
  key = "replacement";
  await provider([]);
  assert.equal(calls, 2);
});
test("malformed JSON, empty content and truncated responses never become successful guidance", async () => {
  for (const response of [
    {
      ok: true,
      json: async () => {
        throw Error("invalid JSON");
      },
    },
    {
      ok: true,
      json: async () => ({ choices: [{ message: { content: " " } }] }),
    },
    {
      ok: true,
      json: async () => ({
        choices: [
          { message: { content: "unfinished" }, finish_reason: "length" },
        ],
      }),
    },
  ]) {
    const provider = createProvider({
      getConfig: () => ({ ...config, models: ["primary"] }),
      fetchImpl: async () => response,
    });
    assert.equal(await provider([]), null);
  }
});
test("timeout budget bounds all attempts and concurrent callers cannot flood the provider", async () => {
  let calls = 0;
  const provider = createProvider({
    getConfig: () => config,
    timeoutMs: 80,
    maxConcurrent: 1,
    fetchImpl: async (url, { signal }) => {
      calls++;
      return new Promise((resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(Object.assign(Error("timeout"), { name: "AbortError" })),
          { once: true },
        ),
      );
    },
  });
  const started = Date.now(),
    first = provider([]);
  assert.equal(await provider([]), null);
  assert.equal(await first, null);
  assert.equal(calls, 2);
  assert.ok(Date.now() - started < 400);
});
