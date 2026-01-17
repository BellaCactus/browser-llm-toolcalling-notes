import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import { fileURLToPath } from "node:url";

// this file lives in: repoRoot/code/node/toolcall-bench.mjs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// repo root is: repoRoot/code/node -> go up 2 levels
const repoRoot = path.resolve(__dirname, "..", "..");

function p(...parts) {
  return path.resolve(repoRoot, ...parts);
}

const ajv = new Ajv({ allErrors: true, strict: false });

// tool arg schemas (swap these to match your real tools)
const toolArgSchemas = {
  item_lookup: {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "integer", nullable: true } },
    required: ["query"],
    additionalProperties: false
  },
  perk_lookup: {
    type: "object",
    properties: { perkName: { type: "string" } },
    required: ["perkName"],
    additionalProperties: false
  },
  activity_lookup: {
    type: "object",
    properties: { activityName: { type: "string" } },
    required: ["activityName"],
    additionalProperties: false
  }
};

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

function tryParseJson(text) {
  const candidate = extractFirstJsonObject(text) ?? text.trim();
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (e) {
    return { ok: false, err: String(e?.message ?? e) };
  }
}

function nowMs() {
  return Date.now();
}

function safeFilename(s) {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
}

/**
 * REAL model call via Ollama local server.
 * Set model via env:
 *   $env:MODEL="qwen2.5:14b"
 *   node toolcall-bench.mjs
 */
async function generate(prompt, model) {
  const res = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.1 }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ollama error: ${res.status} ${text}`);
  }

  const data = await res.json();
  return data.response;
}

async function router(userQuery, model) {
  const routerPromptPath = p("prompts", "router.prompt.txt");
  const base = fs.readFileSync(routerPromptPath, "utf8");

  const prompt = `${base}\n\nUser query: ${userQuery}`;

  const t0 = nowMs();
  const raw = await generate(prompt, model);
  const ms = nowMs() - t0;

  const parsed = tryParseJson(raw);
  if (!parsed.ok) return { ok: false, raw, ms, err: `router json parse failed: ${parsed.err}` };

  const o = parsed.value;

  if (!o || typeof o !== "object") return { ok: false, raw, ms, err: "router output not object" };
  if (!["call_tool", "clarify", "none"].includes(o.choice)) return { ok: false, raw, ms, err: "router missing/invalid choice" };

  if (o.choice === "call_tool") {
    if (typeof o.tool !== "string") return { ok: false, raw, ms, err: "router call_tool missing tool string" };
    return { ok: true, raw, ms, out: { choice: "call_tool", tool: o.tool, question: null } };
  }

  if (o.choice === "clarify") {
    if (typeof o.question !== "string") return { ok: false, raw, ms, err: "router clarify missing question string" };
    return { ok: true, raw, ms, out: { choice: "clarify", tool: null, question: o.question } };
  }

  return { ok: true, raw, ms, out: { choice: "none", tool: null, question: null } };
}

async function executor(userQuery, tool, model) {
  const executorPromptPath = p("prompts", "executor.prompt.txt");
  const base = fs.readFileSync(executorPromptPath, "utf8");

  const schema = toolArgSchemas[tool];

  const prompt = [
    base,
    `Tool: ${tool}`,
    `Args JSON schema:\n${JSON.stringify(schema, null, 2)}`,
    `User query: ${userQuery}`
  ].join("\n\n");

  const t0 = nowMs();
  const raw = await generate(prompt, model);
  const ms = nowMs() - t0;

  const parsed = tryParseJson(raw);
  if (!parsed.ok) return { ok: false, raw, ms, err: `executor json parse failed: ${parsed.err}` };

  const o = parsed.value;
  if (!o || typeof o !== "object") return { ok: false, raw, ms, err: "executor output not object" };
  if (o.tool !== tool) return { ok: false, raw, ms, err: `executor tool mismatch (expected ${tool})` };
  if (!o.args || typeof o.args !== "object") return { ok: false, raw, ms, err: "executor missing args object" };

  const validate = ajv.compile(schema);
  const ok = validate(o.args);
  if (!ok) return { ok: false, raw, ms, err: `args schema fail: ${ajv.errorsText(validate.errors)}` };

  return { ok: true, raw, ms, toolcall: { tool, args: o.args } };
}

/**
 * Run benchmark.
 * Returns summary + detailed rows, and also writes JSON file.
 */
export async function runBench(model, { verbose = true } = {}) {
  const casesPath = p("bench", "cases.json");
  const cases = JSON.parse(fs.readFileSync(casesPath, "utf8"));

  let total = 0;

  let jsonOk = 0;
  let schemaOk = 0;

  let strictCorrect = 0;
  let acceptableCorrect = 0;

  let clarifyCount = 0;

  let routerMsSum = 0;
  let execMsSum = 0;

  const results = [];

  for (const c of cases) {
    total++;

    const r = await router(c.query, model);

    let gotTool = "none";
    let status = "ok";
    let execMs = 0;

    let routerJsonOk = false;
    let execSchemaOk = false;

    if (!r.ok) {
      status = "router_fail";
      gotTool = "none";
    } else {
      routerJsonOk = true;
      jsonOk++;

      const out = r.out;

      if (out.choice === "clarify") {
        gotTool = "clarify";
        status = "clarify";
        clarifyCount++;
      } else if (out.choice === "none") {
        gotTool = "none";
        status = "none";
      } else {
        // call_tool
        const chosenTool = out.tool;
        gotTool = chosenTool;

        const ex = await executor(c.query, chosenTool, model);
        execMs = ex.ms;

        if (!ex.ok) {
          status = "executor_fail";
        } else {
          status = "toolcall_ok";
          execSchemaOk = true;
          schemaOk++;
        }
      }
    }

    routerMsSum += r.ms;
    execMsSum += execMs;

    const strictHit = gotTool === c.expectedTool;
    const acceptableHit = strictHit || gotTool === "clarify";

    if (strictHit) strictCorrect++;
    if (acceptableHit) acceptableCorrect++;

    results.push({
      query: c.query,
      expectedTool: c.expectedTool,
      gotTool,
      status,
      routerMs: r.ms,
      execMs,
      routerOk: r.ok,
      routerJsonOk,
      executorSchemaOk: execSchemaOk
    });

    if (verbose) {
      console.log("\n---");
      console.log("query:", c.query);
      console.log("expected:", c.expectedTool);
      console.log("got:", gotTool);
      console.log("status:", status);
      console.log("routerMs:", r.ms, "execMs:", execMs);
      if (!r.ok) console.log("routerErr:", r.err);
    }
  }

  const summary = {
    model,
    total,
    jsonValidityRate: Number(((jsonOk / total) * 100).toFixed(1)),
    schemaValidityRate: Number(((schemaOk / Math.max(1, total)) * 100).toFixed(1)),
    strictToolAccuracyRate: Number(((strictCorrect / total) * 100).toFixed(1)),
    acceptableAccuracyRate: Number(((acceptableCorrect / total) * 100).toFixed(1)),
    clarifyRate: Number(((clarifyCount / total) * 100).toFixed(1)),
    avgRouterMs: Math.round(routerMsSum / total),
    avgExecMs: Math.round(execMsSum / total)
  };

  if (verbose) {
    console.log("\n====== SUMMARY ======");
    console.log(summary);
  }

  const outName = `latest_${safeFilename(model)}.json`;
  const outPath = p("bench", "results", outName);
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2), "utf8");

  if (verbose) {
    console.log("wrote results:", outPath);
  }

  return { summary, results, outPath };
}

// allow running directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const model = process.env.MODEL || "qwen2.5:14b";
  runBench(model, { verbose: true }).catch((e) => {
    console.error("FATAL:", e);
    process.exit(1);
  });
}
