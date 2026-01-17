# results

## latest model comparison (router + executor)

from `npm run compare`:

| model         | strict acc | accept acc | json | clarify | avg router | avg exec |
|--------------|------------|------------|------|---------|------------|----------|
| qwen2.5:7b    | 98%        | 98%        | 100% | 0%      | 252ms      | 217ms    |
| qwen2.5:14b   | 100%       | 100%       | 100% | 0%      | 414ms      | 377ms    |
| llama3.1:8b   | 100%       | 100%       | 100% | 0%      | 299ms      | 243ms    |

interpretation:
- qwen2.5:14b and llama3.1:8b are perfectly routing the current suite with the latest router prompt
- qwen2.5:7b is slightly less accurate but faster

## what changed to make it stable
key router prompt fixes:
- override: "what perks can roll on X" => item_lookup ALWAYS
  (prevents perk_lookup mistakes on weapon roll questions)
- whitelist: raid/dungeon/crucible/etc => activity_lookup for "what is..." queries
- hard boundary: general systems/build/farming advice => none
- clarify is only allowed if a lookup is required but the key name is missing
  (and roll queries never clarify)

## speed notes
- router step is the biggest latency variable
- executor is stable because schema is tiny + ajv validation is strict

## how to run
from `code/node`:

### single bench
$env:MODEL="qwen2.5:14b"
npm run bench

### compare
npm run compare

results write to:
bench/results/latest_<model>.json

