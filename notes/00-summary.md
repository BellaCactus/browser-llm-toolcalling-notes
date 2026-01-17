# summary

this repo is a mini lab notebook + benchmark harness for testing in-browser / local LLM tool calling.

## core idea
destiny manifest data is huge, so the LLM should never see raw tables.
best pattern:
- tool retrieves definitions by hash / name
- tool returns a tiny condensed summary block
- the model only sees the condensed output

## important gotcha: "webllm tool calling"
webllm "openai api support" can be brittle for tool calling because it’s basically “fake function calling”
unless you enforce strict JSON yourself.
the stable approach is manual tool calling via a strict protocol:
1) force a tiny tool-call JSON schema (single object, no prose)
2) hard-validate JSON (repair/retry if needed)
3) run tools one-at-a-time (no multi-tool chains)
4) keep tool descriptions OUT of the main prompt, inject only when needed

## destiny note (armor 3.0 / edge of fate)
edge of fate updates armor stats and naming (weapons/health/class/etc), so system questions in the suite should reflect the new era.
old “resilience/recovery” style system prompts are outdated for modern benchmarking.

## what we measure
- json validity (% outputs parse clean)
- schema validity (% tool args match schema)
- tool pick accuracy (% correct tool chosen)
- latency (router step + executor step)

## current best router prompt behavior
after adding hard overrides:
- roll/perk pool queries -> ALWAYS item_lookup (never perk_lookup, never clarify)
- "what is <activity>" for raid/dungeon/crucible/etc -> activity_lookup
- general systems/build advice -> none
we get 0 clarify for the main suite and high strict accuracy across models.

