# summary

this repo is a mini lab notebook + benchmark harness for testing in-browser llm tool calling.

## main takeaways so far
- webllm "openai api support" is misleading: tool mode can hijack system prompt + is brittle
- the stable approach is manual tool calling via strict json protocol (parse + validate + retry)
- use router -> executor so the model only sees one tool schema at a time
- keep tool schemas tiny, inject only when needed
- destiny manifest is too big for context: tools fetch defs by hash and return condensed summaries

## what we measure
- json validity (% of outputs parse clean)
- tool pick accuracy (% correct tool chosen)
- latency (time per step / overall)
