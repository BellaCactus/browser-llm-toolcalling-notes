import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import { fileURLToPath } from "node:url";

type ToolName = "item_lookup" | "perk_lookup" | "activity_lookup" | "none" | "clarify";

type BenchCase = {
  query: string;
  expectedTool: ToolName;
};

type RouterOut =
  | { choice: "call_tool"; tool: ToolName; question: null }
  | { choice: "clarify"; tool: null; question: string }
  | { choice: "none"; tool: null; question: null };

type ToolCall = { tool: Exclude<ToolName, "none" | "clarify">; args: Record<string, any> };

const ajv = new Ajv({ allErrors: true, strict: false });

// --- locate repo root based on this file location ---
// this file lives in: repoRoot/code/node/toolcall-bench.ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

function p(...parts: string[]) {
  return path.resolve(repoRoot, ...parts);
}

// tiny example schemas (swap these to match your real tools)
const toolArgSchemas: Record<Exclude<ToolName, "none" | "clarify">, any> = {
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

function extractFirstJsonObject(text: string): string | null {
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

function tryParseJson(text: string): { ok: true; value: any } | { ok: false; err: string } {
  const candidate = extractFirstJsonObject(text) ?? text.trim();
  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch (e: any) {
    return { ok: false, err: String(e?.message ?? e) };
  }
}

function nowMs() {
  return Date.now();
}

/**
 * Replace this with your actual webllm / transformers.js call.
 * For now, it's a stub that always returns none.
 */
async function generate(_prompt: string): Promise<string> {
  return `{"choice":"none","tool":null,"question":null}`;
}

async function router(userQuery: string): Promise<{ ok: boolean; out?: RouterOut; raw?: string; ms: number; err?: string }> {
  const routerPromptPath = p("prompts", "router.prompt.txt");
  const base = fs.readFileSync(routerPromptPath, "utf8");

  const prompt = `${base}\n\nUser query: ${userQuery}`;

  const t0 = nowMs();
  const raw = await generate(prompt);
  const ms = nowMs() - t0;

  const parsed = tryParseJson(raw);
  if (!parsed.ok) return { ok: false, raw, ms, err: `router json parse failed: ${parsed.err}` };

  const o = parsed.value;

  if (!o || typeof o !== "object") return { ok: false, raw, ms, err: "router output not object" };
  if (!["call_tool", "clarify", "none"].includes(o.choice)) return { ok: false, raw, ms, err: "router missing/invalid choice" };

  if (o.choice === "call_tool") {
    if (typeof o.tool !== "string") return { ok: false, raw, ms, err: "router call_tool missing tool string" };
    return { ok: true, raw, ms, out: { choice: "call_tool", tool: o.tool, question: null } as any };
  }

  if (o.choice === "clarify") {
    if (typeof o.question !== "string") return { ok: false, raw, ms, err: "router clarify missing question string" };
    return { ok: true, raw, ms, out: { choice: "clarify", tool: null, question: o.question } };
  }

  return { ok: true, raw, ms, out: { choice: "none", tool: null, question: null } };
}

async function executor(userQuery: string, tool: Exclude<ToolName, "none" | "clarify">): Promise<{ ok: boolean; toolcall?: ToolCall; raw?: string; ms: number; err?: string }> {
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
  const raw = await generate(prompt);
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

async function main() {
  const casesPath = p("bench", "cases.json");
  const cases: BenchCase[] = JSON.parse(fs.readFileSync(casesPath, "utf8"));

  let jsonOk = 0;
  let toolCorrect = 0;
  let total = 0;

  const results: any[] = [];

  for (const c of cases) {
    total++;

    const r = await router(c.query);

    let finalTool: ToolName = "none";
    let status = "ok";
    let execMs = 0;

    if (!r.ok) {
      status = "router_fail";
    } else if (r.out!.choice === "clarify") {
      finalTool = "clarify";
      status = "clarify";
      jsonOk++;
    } else if (r.out!.choice === "none") {
      finalTool = "none";
      status = "none";
      jsonOk++;
    } else {
      // call_tool
      jsonOk++;
      const chosenTool = r.out!.tool as Exclude<ToolName, "none" | "clarify">;

      const ex = await executor(c.query, chosenTool);
      execMs = ex.ms;

      if (!ex.ok) {
        status = "executor_fail";
        finalTool = chosenTool;
      } else {
        status = "toolcall_ok";
        finalTool = chosenTool;
      }
    }

    if (finalTool === c.expectedTool) toolCorrect++;

    results.push({
      query: c.query,
      expectedTool: c.expectedTool,
      gotTool: finalTool,
      status,
      routerMs: r.ms,
      execMs
    });

    console.log("\n---");
    console.log("query:", c.query);
    console.log("expected:", c.expectedTool);
    console.log("got:", finalTool);
    console.log("status:", status);
    console.log("routerMs:", r.ms, "execMs:", execMs);
    if (!r.ok) console.log("routerErr:", r.err);
  }

  const summary = {
    total,
    jsonValidityRate: Number(((jsonOk / total) * 100).toFixed(1)),
    toolAccuracyRate: Number(((toolCorrect / total) * 100).toFixed(1))
  };

  console.log("\n====== SUMMARY ======");
  console.log(summary);

  const outPath = p("bench", "results", "latest.json");
  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2), "utf8");
  console.log("wrote results:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
