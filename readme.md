<div align="center">

# 🖤 browser-llm-toolcalling-notes

mini lab notebook + benchmark harness for **LLM tool-calling** (router + executor)  
tested with **local models (Ollama)** + built to compare against **in-browser (webllm / transformers.js)**

![Node](https://img.shields.io/badge/node-works-ff78c8?style=for-the-badge)
![JSON](https://img.shields.io/badge/json-strict_only-0b0b0b?style=for-the-badge)
![Bench](https://img.shields.io/badge/bench-router%20%2B%20executor-ff4db8?style=for-the-badge)

</div>

---

## what is this?

this repo is a **tiny benchmark + notes vault** for answering one question:

> “can small-ish local / browser models reliably choose tools + produce valid tool-call JSON?”

the answer is: **yes**, but only if you stop trusting “magic function calling” and instead enforce a **strict JSON protocol**.

---

## the core idea (router -> executor)

the only stable setup i’ve found is a two-step pipeline:

### 1) router (tool selection)
- sees the user query
- chooses **exactly one** tool (or **none**)
- outputs **JSON only** (no prose)

### 2) executor (argument generation)
- sees **one tool schema** at a time
- generates args in strict JSON
- args are validated with **AJV**
- (optionally) retried if invalid

this avoids “tool spam”, avoids giant system prompts, and stops models from guessing random tools.

---

## why destiny is the perfect stress test

destiny’s manifest is **huge**. you can’t shove raw tables / schemas into context.

so the correct pattern is:

- the model picks *what* it needs
- the tool fetches the actual definitions by **hash / name**
- you return a **small condensed summary block**
- the LLM **never** sees raw tables

---

## current results (tldr)

this harness measures:

- **json validity**: did we parse JSON cleanly?
- **schema validity**: did args match the JSON schema?
- **tool accuracy**:
  - *strict*: exact expected tool
  - *acceptable*: “close enough” for practical routing
- latency:
  - router ms
  - executor ms

### example run (strict routing prompt)
- json validity: ~**100%**
- strict tool accuracy: **very high** once “general systems = none” is enforced
- 32b gets slower but still consistent

(see files in `bench/results/` for the real numbers)

---

## project layout

notes/
00-summary.md # main takeaways
design.md # the protocol + design decisions
05-next-steps.md # what to try next

bench/
cases.json # benchmark prompts + expected tool
results/ # latest runs written here

prompts/
router.prompt.txt # choose tool (or none)
executor.prompt.txt # generate tool args from schema

code/node/
package.json
toolcall-bench.mjs # bench runner
compare-models.mjs # multi-model comparison runner (optional)


---

## quick start

### requirements
- node 18+ (newer is fine)
- ollama installed + running

### install
```bash
cd code/node
npm install

run the benchmark

npm run bench

run a model comparison (if included)

npm run compare

choose model

in powershell:

$env:MODEL="qwen2.5:14b"
npm run bench

ollama notes (windows)

if ollama isn’t on PATH, you can still run it by absolute path:

& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" pull qwen2.5:14b

or define a quick helper function in your session:

function ollama { & "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" @args }

important prompting rule

hard rule for router:

if the query is about general destiny systems:

    armor stats (resilience/discipline/recovery)

    mods (champions/surges)

    comparisons (kinetic vs strand)

    farming / build advice

ALWAYS choose "none".

clarify is ONLY for missing item/perk/activity name when a lookup is clearly required.

this single rule prevents most “wrong tool” failures.
next upgrades (not done yet)

stuff that would make this even more real:

    executor retry loop:

        invalid args -> repair -> retry once

    browser backend runner:

        webllm runner

        transformers.js runner

    longer test suite:

        more ambiguous queries

        multi-turn followups

    real tool outputs:

        return a tiny condensed “tool result block”

        keep model context small
