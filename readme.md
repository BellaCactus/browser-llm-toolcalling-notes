# webllm / transformers.js tool calling benchmarks

notes + mini harness for testing how reliable in-browser LLM tool calling is.

## why this exists
webllm and transformers.js can run models in-browser, but “tool calling” often means:
- you manually enforce JSON outputs
- you parse + validate + retry
- you call tools yourself
- context windows are small so tool schemas + docs don’t fit

this repo collects patterns + tests so we can measure what actually works.

## key patterns
- **router → executor**
  - router picks tool (tiny prompt)
  - executor generates args for ONE tool (inject only that schema)
- **strict JSON protocol**
  - no prose, JSON only
  - validate + retry/repair
- **destiny manifest strategy**
  - never dump raw tables into context
  - tools fetch by hash, return condensed summaries

## benchmark metrics
- JSON validity (% parsed cleanly)
- tool pick accuracy (% correct tool chosen)
- latency (time per call / TTFT)

## structure
- `notes/` writeups + learnings
- `bench/cases.json` labeled test prompts
- `code/` benchmark harness
- `prompts/` router/executor prompt templates
