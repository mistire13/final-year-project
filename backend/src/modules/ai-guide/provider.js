"use strict";
const crypto = require("node:crypto");

// No answers are cached or shared across families. Only provider failure state is shared.
function createProvider({
  fetchImpl = (...args) => fetch(...args),
  now = Date.now,
  timeoutMs = 8000,
  maxConcurrent = 2,
  log = () => {},
  getConfig = () => ({
    key: process.env.NVIDIA_API_KEY,
    base: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
    models: [
      process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
      process.env.NVIDIA_FALLBACK_MODEL,
    ].filter(Boolean),
  }),
} = {}) {
  let fingerprint = "",
    blockedUntil = 0,
    inFlight = 0;
  const failures = new Map();
  return async function complete(messages) {
    const config = getConfig();
    if (!config.key || config.key.startsWith("placeholder")) return null;
    const stamp = crypto
      .createHash("sha256")
      .update(JSON.stringify(config))
      .digest("hex");
    if (stamp !== fingerprint) {
      fingerprint = stamp;
      blockedUntil = 0;
      failures.clear();
    }
    if (now() < blockedUntil || inFlight >= maxConcurrent) return null;
    const models = [...new Set(config.models)].filter(
      (model) => (failures.get(model)?.until || 0) <= now(),
    );
    if (!models.length) return null;
    inFlight++;
    const deadline = now() + timeoutMs;
    try {
      for (let index = 0; index < models.length; index++) {
        const model = models[index],
          remaining = deadline - now();
        if (remaining <= 0) break;
        const controller = new AbortController();
        const timer = setTimeout(
          () => controller.abort(),
          Math.max(1, Math.floor(remaining / (models.length - index))),
        );
        let permanent = false;
        try {
          const response = await fetchImpl(
            config.base.replace(/\/$/, "") + "/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model,
                messages,
                max_tokens: 320,
                temperature: 0.6,
                ...(model.startsWith("nvidia/nemotron-3")
                  ? { chat_template_kwargs: { enable_thinking: false } }
                  : {}),
              }),
              signal: controller.signal,
            },
          );
          if (response.ok) {
            const data = await response.json();
            const choice = data.choices?.[0];
            const answer = choice?.message?.content;
            if (
              typeof answer === "string" &&
              answer.trim().length &&
              answer.length <= 10000 &&
              choice.finish_reason !== "length"
            ) {
              failures.delete(model);
              return { answer: answer.trim(), model };
            }
            log({ model, reason: "invalid_response" });
          } else {
            log({
              model,
              status: response.status,
              reason: "provider_rejected",
            });
            if ([401, 403].includes(response.status)) {
              blockedUntil = now() + 60000;
              break;
            }
            if (response.status === 429) {
              const retry = response.headers?.get("retry-after");
              const delay =
                retry && /^\d+$/.test(retry)
                  ? Number(retry) * 1000
                  : retry
                    ? Date.parse(retry) - now()
                    : 30000;
              blockedUntil =
                now() +
                Math.max(
                  1000,
                  Math.min(120000, Number.isFinite(delay) ? delay : 30000),
                );
              break;
            }
            permanent = [400, 404, 410].includes(response.status);
          }
        } catch (error) {
          log({
            model,
            reason:
              error.name === "AbortError"
                ? "timeout"
                : "connection_or_response_error",
          });
        } finally {
          clearTimeout(timer);
        }
        const count = (failures.get(model)?.count || 0) + 1;
        failures.set(model, {
          count,
          until: permanent ? now() + 300000 : count >= 2 ? now() + 15000 : 0,
        });
      }
      return null;
    } finally {
      inFlight--;
    }
  };
}
module.exports = { createProvider };
