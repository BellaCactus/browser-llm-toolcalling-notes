# prompting: making tool routing stable (without “real function calling”)

this repo assumes the model is NOT trustworthy at structured tool output by default.

so the prompts are designed to enforce:
- predictable tool choice
- valid JSON output
- no extra prose
- no tool confusion (especially in small context windows)

the main trick:
**split the job into two prompts**:
router prompt = choose tool only  
executor prompt = generate args only

this is way more stable than “one mega prompt that does everything”.

---

## 1) router prompt design

router task:
- decide if a tool is needed
- choose exactly one tool OR none OR clarify (rare)

router output format:

{ "choice": "call_tool" | "clarify" | "none", "tool": "<tool_name_or_null>", "question": "<question_or_null>" }

### why this works

#### (A) remove tool schemas from the router entirely
router only sees tool NAMES, never schemas or descriptions.

this prevents:
- prompt bloat / truncation
- “tool name drift” (making up tools)
- confusion between similar tools
- model trying to solve the whole question instead of routing

#### (B) hard rules beat vibes
the model does best when the rules are strict and simple:
- output only JSON
- tool must be one of {item_lookup, perk_lookup, activity_lookup}
- general questions always -> none
- clarify only when identifier missing

without hard rules, models invent:
- “maybe call perk_lookup??”
- “tool: get_item_rolls”
- prose mixed into JSON

#### (C) clarify must be nerfed
clarify can quickly become a failure mode:
the model uses it when uncertain instead of choosing none.

so the prompt says:
- clarify ONLY when lookup is required AND the name is missing
- DO NOT clarify for general system questions

that keeps clarify-rate low, which is important for UX.

---

## 2) executor prompt design

executor task:
- generate args for ONE known tool
- follow the args schema exactly

executor output format:

{ "tool": "<tool_name>", "args": { ... } }

executor is given:
- tool name
- JSON schema for args
- user query

### why this works

#### (A) executor only knows one tool
this dramatically increases schema compliance:
- fewer objects in mind
- fewer competing field names
- less temptation to improvise extra keys

#### (B) schema-first prompting
models “respect the shape” better than they respect natural language rules.
showing the schema in full makes it more likely to:
- include required keys
- avoid extra properties
- correct types

#### (C) strict output rules
executor output must be:
- JSON only
- no markdown
- no prose
- exactly one object

any prose breaks parsing.
the executor prompt is designed to be boring on purpose.

---

## 3) JSON discipline rules

local/browser models often output:
- valid JSON + extra commentary
- JSON inside markdown fences
- trailing commas
- wrong quotes
- multiple objects in one output

so we enforce:

- output ONLY JSON
- parse the first object if there’s extra junk (best effort)
- validate with AJV
- retry once with error feedback (recommended next step)

### recommended retry prompt (repair loop)

if parse or schema fails, call the model again with:

"output only JSON matching the schema. no prose. your last output failed because: <ERROR>. fix it."

this pushes schema validity up massively.

---

## 4) preventing “tool leakage” and hallucinations

### issue: the model tries to answer instead of routing
router must never answer the question.

counter:
- explicitly forbid prose
- include examples of “none” for general questions

### issue: tool name drift
counter:
- tool must be one of a strict list
- invalid tool name is a failure

### issue: “general question routed to tools”
ex: "how do surge mods work" -> perk_lookup (wrong)

counter:
- add hard rule section:
  "if the user asks about general destiny systems, ALWAYS choose none"

the router becomes conservative by default.

---

## 5) “general destiny systems” rule (important!)

the router prompt includes a hard rule:

if the user query is about:
- stats (discipline/recovery/etc)
- mods (champion/surge/etc)
- weapon type comparisons (kinetic vs strand)
- farming/build advice
then ALWAYS return "none"

reason:
these questions don’t require a database lookup.
they require explanation and reasoning.

forcing tools here increases failure rate because:
- tool results aren’t needed
- tool schemas don’t match the question shape
- model picks tools randomly under uncertainty

---

## 6) prompt minimalism vs usefulness

a “minimal prompt” is not pointless.
it’s the strongest foundation because:
- it is testable
- it is consistent
- it scales to many tools

once stable, you can add usefulness by:
- adding more examples
- adding synonyms / patterns
- adding an allowlist for common nicknames
- adding an extra router class: "multi_intent" (optional)

but stability must come first, otherwise UX becomes chaos.

---

## 7) recommended improvements (future work)

### (A) add tool synonyms in router rules
ex:
- “perk pool”, “rolls”, “can roll”, “trait columns” -> item_lookup
- “what does <perk> do”, “perk effect” -> perk_lookup
- “what is <mode>”, “explain <activity>” -> activity_lookup

### (B) add “name extraction” helper
before routing, a cheap deterministic pass can extract likely entities:
- weapon names
- perk names
- activity names

this reduces clarify usage and misroutes.
the router then receives:
- user query
- extracted candidates list

### (C) use deterministic decoding for router
router should be close to temperature 0.
executor can be slightly higher, but still low.
router is a classifier, not creative writing.

---

## 8) how this applies to webllm / transformers.js

browser runtimes often have:
- short context windows
- limited tool-call support
- inconsistent JSON formatting

so the safest approach is:
- do NOT rely on “native tool call mode”
- run plain completion generation
- implement strict JSON protocol manually (parse + validate + retry)

the router->executor approach reduces context demands and improves correctness.

