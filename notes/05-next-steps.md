# next steps: making this production-ready (not just a cool demo)

this repo currently proves:
- router->executor split is stable
- strict JSON prompting works
- tool routing accuracy can hit 100% on the starter suite

next steps focus on:
- handling messy real queries
- improving executor schema validity
- testing browser runtimes (webllm / transformers.js)
- keeping latency + UX sane

---

## 1) add a JSON repair + retry loop (most important)

right now:
- router output is very stable
- executor args sometimes fail schema validation (wrong field names, extra keys, wrong types)

fix:
- if JSON parse fails OR AJV schema fails:
  - run one retry
  - include the validation error in the retry prompt
  - demand corrected JSON only

recommended logic:
1) generate once
2) validate
3) if fail -> retry once with: "your output failed because: <ERROR> fix it"

this should push schemaValidityRate up a lot.

---

## 2) add “entity extraction” before routing

real users won’t type perfect names like benchmarks do.

add a cheap pre-pass to extract possible entities:
- weapon names
- perk names
- activity names

sources:
- allowlist keywords list (simple)
- fuzzy matching against a manifest cache (better)

then pass router extra context:

User query: "<query>"
Candidates:
- items: ["ikelos smg", "calus mini tool"]
- perks: ["incandescent"]
- activities: ["iron banner"]

this reduces misroutes and eliminates clarify spam.

---

## 3) expand benchmark suite with real-world messy inputs

add test cases like:

### nicknames / shorthand
- "mini tool rolls"
- "ikelos smg perks"
- "what can fatebringer roll"

### typos
- "incandescant"
- "volt shot"
- "trails of osiris"

### combined intent
- "iron banner loot this week"
- "best roll for cataclysmic"
- "where does apex predator drop"

### general questions that must be NONE
- "best hunter stats now?"
- "how do champs work?"
- "how do surges work?"
- "difference between strand + stasis weapons"

these keep the router honest.

---

## 4) compare browser runtimes properly

the goal is not “best model”, it’s “most reliable routing under constraints”.

add a runner for:
- webllm local models
- transformers.js local models
- ollama local models (current baseline)

measure:
- strict acc / acceptable acc
- json validity
- schema validity
- latency
- clarify rate
- failure modes

then summarize in 04-results.md as a table.

---

## 5) compress tool outputs (manifest pattern)

for large datasets (destiny manifest):
- never stuff raw rows/tables into model context
- tool should fetch by hash/id
- tool returns condensed summary block only

example output style:
- item name
- 4-8 key perks
- sources / activity
- short description

the model should only see “final answer shaped text”, not raw data.

---

## 6) make router deterministic (low temp, strict decoding)

router is basically classification.

recommended router settings:
- temperature: 0 or 0.1
- top_p: low (optional)
- stop tokens (optional): "\n\n" to prevent rambling

executor can be slightly higher if needed, but still low.

---

## 7) optional: “two-layer routing” for larger tool sets

if the tool list grows huge:

layer 1: pick category
- item / perk / activity / none

layer 2: pick exact tool within that category

this avoids “tool soup” and keeps small context stable.

---

## 8) practical repo improvements

- add a README section: “how to run benchmarks”
- add a “results snapshot” folder:
  bench/results/latest_<model>.json
- add a “known limitations” list:
  - schema validity still imperfect without retry loop
  - ambiguous user queries still require clarify or fallback
  - browser models may behave differently than ollama baseline

---

## 9) answer quality guardrails (important)

the router is not the answerer.

final assistant response should:
- call tool only when needed
- keep tool response short
- avoid hallucinating missing fields
- say “not found” when lookup fails
- use a consistent formatting style

production UX should feel:
fast, predictable, no random tool spam.

