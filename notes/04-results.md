# results: benchmark snapshots + takeaways

this doc records benchmark results from the router->executor harness.

bench suite:
- 50 queries total
- mix of:
  - item roll/perk pool lookups
  - perk meaning lookups
  - activity explanations
  - general destiny system questions (should route to "none")

metrics:
- jsonValidityRate: output parses as JSON
- schemaValidityRate: executor args validate against schema (AJV)
- strictToolAccuracyRate: exact tool match (including "none")
- acceptableAccuracyRate: optional “close enough” accuracy (if enabled)
- clarifyRate: % of clarify outputs
- avgRouterMs / avgExecMs: latency per stage

---

## baseline comparison (router->executor strict JSON)

comparison run (example):

model             strict    accept    json      clarify   router    exec
------------------------------------------------------------------------------
qwen2.5:7b        98%       98%       100%      0%        252ms     217ms
qwen2.5:14b       100%      100%      100%      0%        414ms     377ms
llama3.1:8b       100%      100%      100%      0%        299ms     243ms

notes:
- all three models achieved 100% JSON validity in this run
- strict accuracy reached 100% for qwen2.5:14b and llama3.1:8b
- qwen2.5:7b was fastest and still nearly perfect

---

## deep run: qwen2.5:32b (high VRAM, max vibes)

example bench output:

{
  model: 'qwen2.5:32b',
  total: 50,
  jsonValidityRate: 100,
  schemaValidityRate: 80,
  strictToolAccuracyRate: 100,
  acceptableAccuracyRate: 100,
  clarifyRate: 0,
  avgRouterMs: 746,
  avgExecMs: 674
}

takeaways:
- strict routing accuracy hit 100%
- clarify rate stayed at 0% (router rules worked)
- latency increased vs smaller models (expected)
- schema validity is the main remaining weakness (args shape), not routing

---

## what these results mean

### 1) routing can be made extremely stable
the router prompt design is doing the heavy lifting:
- strict JSON
- hard tool allowlist
- strong “general system questions -> none” rule

this removes most common failures:
- random tool selection
- clarify spam
- tool name hallucination

### 2) executor schema validity is the next bottleneck
schema validity will always be harder than routing because:
- more fields
- stricter types
- models sometimes add extra keys or wrong types

the best improvement is adding:
- validate + retry loop with schema error feedback

one retry often pushes schema validity much higher.

### 3) bigger models improve strict accuracy but cost latency
qwen2.5:32b shows:
- strong accuracy
- slower router/executor time

depending on UX target:
- small model = speed
- medium/large model = fewer edge-case mistakes

---

## recommended next benchmarks

1) add harder ambiguous queries:
- "ikelos smg rolls" (nickname)
- "what perks on mini tool" (missing calus)
- "iron banner loot" (activity + item)
- typos: "incandescant", "trails of osiris"

2) add more "none" system queries:
- build advice
- farming routes
- stat prioritization
- mod explanations

3) measure repair-loop gains:
- baseline schema validity
- schema validity after 1 retry

4) compare browser runtimes:
- webllm vs transformers.js
- in-browser models vs local ollama API

---

## key conclusion

in low-context / browser environments,
the most reliable “tool calling” is:

- manual strict JSON protocol
- router->executor split
- validate + retry
- small schemas
- condensed tool outputs

not “native tool calling mode”.

