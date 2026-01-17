import { runBench } from "./toolcall-bench.mjs";

const MODELS = [
  "qwen2.5:7b",
  "qwen2.5:14b",
  "llama3.1:8b"
];

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function fmtPct(x) {
  return pad(`${x.toFixed ? x.toFixed(1) : x}%`, 7);
}

async function main() {
  console.log("\nmodels to test:");
  for (const m of MODELS) console.log(" -", m);

  const all = [];

  for (const model of MODELS) {
    console.log("\n==============================");
    console.log("running:", model);
    console.log("==============================");

    try {
      const { summary } = await runBench(model, { verbose: false });
      all.push(summary);

      console.log("done:", model);
      console.log(" strict acc:", summary.strictToolAccuracyRate + "%");
      console.log(" accept acc:", summary.acceptableAccuracyRate + "%");
      console.log(" json:", summary.jsonValidityRate + "%");
      console.log(" clarify:", summary.clarifyRate + "%");
      console.log(" avg router:", summary.avgRouterMs + "ms");
      console.log(" avg exec:", summary.avgExecMs + "ms");
    } catch (e) {
      console.log("FAILED:", model);
      console.log(e?.message ?? e);
      all.push({
        model,
        total: 0,
        jsonValidityRate: 0,
        schemaValidityRate: 0,
        strictToolAccuracyRate: 0,
        acceptableAccuracyRate: 0,
        clarifyRate: 0,
        avgRouterMs: 0,
        avgExecMs: 0,
        failed: true
      });
    }
  }

  console.log("\n\n====== COMPARISON TABLE ======\n");

  const header =
    pad("model", 18) +
    pad("strict", 10) +
    pad("accept", 10) +
    pad("json", 10) +
    pad("clarify", 10) +
    pad("router", 10) +
    pad("exec", 10);

  console.log(header);
  console.log("-".repeat(header.length));

  for (const s of all) {
    const line =
      pad(s.model, 18) +
      pad(`${s.strictToolAccuracyRate}%`, 10) +
      pad(`${s.acceptableAccuracyRate}%`, 10) +
      pad(`${s.jsonValidityRate}%`, 10) +
      pad(`${s.clarifyRate}%`, 10) +
      pad(`${s.avgRouterMs}ms`, 10) +
      pad(`${s.avgExecMs}ms`, 10);

    console.log(line);
  }

  console.log("\n(done)");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
