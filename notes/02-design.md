# design: stable tool calling in low-context / browser LLMs

this doc explains the architecture that makes tool calling stable even when:
- the model has a small context window (ex: ~4k)
- the app has many tools / schemas
- the model’s “native tool calling” is unreliable
- the model sometimes produces invalid JSON or extra prose

the goal is not “perfect reasoning”.
the goal is **predictable routing + valid tool args**.

---

## the problem

### 1) context window is the real enemy
in-browser models often have small context limits, and tool descriptions + schemas explode token count fast.
if you dump *all* tool JSON schemas into the system prompt, you will:
- truncate earlier instructions
- confuse the model (too many competing tools)
- get inconsistent tool choice
- get invalid JSON outputs (prose mixed in)

### 2) tool calling is not actually “function calling”
many local/browsers models do not have real tool calling.
they have “text that looks like tool calling”.
so you must treat tool output as **untrusted user text**:
- parse it
- validate it
- retry it

### 3) the manifest / data is huge
destiny definitions are massive (tables, long strings).
you cannot “stuff the manifest into context”.
the model should never directly see raw database tables.

---

## the solution: router -> executor -> tool -> summarize

the architecture is a 2-step generation pipeline:

### (A) router step
the router ONLY decides one thing:

- call a tool? which one?
- OR no tool needed?
- OR ask ONE clarifying question?

router output format is strict and tiny:

{ "choice": "call_tool" | "clarify" | "none", "tool": "<tool_name_or_null>", "question": "<question_or_null>" }

router rules:
- output ONLY JSON
- no prose
- no markdown
- tool name must be from a fixed list
- for general game/system questions, ALWAYS return "none"
- clarify is only allowed when the query is clearly asking for a lookup, but the key name is missing

router is NOT allowed to:
- generate tool args
- answer the user
- invent tool names

why this helps:
- router prompt stays small
- routing becomes stable and testable
- fewer failure modes

### (B) executor step
executor happens ONLY if router chose a tool.

executor job:
- generate VALID args for ONE tool
- follow the provided JSON schema exactly

executor output format:

{ "tool": "<tool_name>", "args": { ... } }

executor rules:
- output ONLY JSON
- no prose
- args must validate against schema (ajv)

why this helps:
- model sees only one tool schema at a time
- smaller schema = more valid args
- errors are isolated to a single tool call

### (C) tool call step
your code calls the tool *outside the model*.

critical rule:
**tools should return condensed results**.
no huge payloads back into the model.

good tool output style:
- small, structured summary
- stable keys
- short text blocks
- ids/hashes for followups

example output (good):
{
  "name": "calus mini-tool",
  "type": "smg",
  "columns": {
    "col3": ["incandescent", "threat detector", "unrelenting"],
    "col4": ["surrounded", "grave robber", "tap the trigger"]
  },
  "source": "crafted / season data",
  "confidence": "high"
}

bad tool output:
- giant raw definition blobs
- full lore text
- dozens of nested objects
- raw database rows

### (D) summarizer step (optional)
after tool returns, you can run a final model pass that:
- turns tool output into a clean user-facing answer
- DOES NOT pick tools again

this keeps the reasoning clean:
routing is separate from answering.

---

## stability rules (the “anti-chaos kit”)

### rule 1: schemas must be tiny
tool args schemas should be *minimal*:
- only include required fields
- avoid deep nesting
- avoid unions/oneOf where possible

### rule 2: validate + retry
every model output is untrusted.
do:
1) try parse JSON
2) validate schema
3) if fail, retry with a repair prompt like:
   "output only JSON matching schema, no prose. here is the error: ..."

### rule 3: one tool at a time
no multi-tool chains in one generation.
if you need multiple tools:
- tool A -> summarize -> tool B
each step is separate.

### rule 4: inject tool definitions only when needed
router sees only tool NAMES.
executor sees only the schema for the chosen tool.
this avoids the “all tools in prompt” disaster.

### rule 5: clamp clarify usage
clarify should be rare and only for missing identifiers.
never clarify system questions.

example:
- "what perks can roll on ____?" -> clarify (missing weapon name)
- "explain armor stats" -> none (system)
- "how to farm ___?" -> none (system)
- "what does incandescent do?" -> perk_lookup (no clarify)

---

## how we benchmark

we evaluate the pipeline using a small test suite of queries labeled with expected routing:

- item roll/perk pool queries -> item_lookup
- perk meaning -> perk_lookup
- activity definition -> activity_lookup
- system/build/farming/stat explanations -> none

metrics:
- json validity: % model outputs parse as JSON
- schema validity: % args validate against schema
- strict accuracy: tool == expected tool
- acceptable accuracy: “close enough” for some ambiguous cases (optional)
- clarify rate: % of clarify outputs
- latency: router ms + executor ms

we store results in:
bench/results/latest_<model>.json

---

## model selection notes (browser vs local)

in-browser model selector (small/medium/large) is mostly a tradeoff:
- larger = better accuracy, slower, more memory
- smaller = faster, more mistakes

for local ollama:
- smaller models can be fast but need stricter prompts
- larger models improve strict accuracy but increase latency

this repo’s job is to measure it, not guess.

---

## recommended next steps

1) add more edge-case queries:
- weapon nicknames ("ikelos smg", "ikelos smg v1.0.3")
- punctuation/typos
- “what rolls” vs “perk pool” wording
- multi-intent questions ("what is iron banner and what’s the loot")

2) test more models:
- qwen2.5:32b
- llama3.1 variants
- any webllm/transformers.js model you can load

3) add a repair loop to executor:
- if schema validation fails, retry once with error message

4) add a “safe summarizer” pass:
- tool output -> user-friendly message
- summarizer cannot call tools

