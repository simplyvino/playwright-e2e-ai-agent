import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import "dotenv/config";
import { createMcpSession, runAgentStage } from "./mcp-runner.js";

const execFileAsync = promisify(execFile);

const MODEL = process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
const TARGET_URL = process.env.TARGET_URL || "https://practiceautomatedtesting.com/webelements";
const FEATURE_GOAL = process.env.FEATURE_GOAL || "Test the Simple Input Form with 2 basic scenarios.";
const SPEC_PATH = path.resolve("specs/generated-plan.md");
const TEST_PATH = path.resolve("tests/generated.spec.js");
const MAX_HEAL_RETRIES = 2;

async function runPlaywrightTests() {
  try {
    const { stdout } = await execFileAsync("npx", ["playwright", "test", "--reporter=json"]);
    return { passed: true, report: stdout };
  } catch (err) {
    return { passed: false, report: (err.stdout || err.stderr || err.message).slice(0, 4000) };
  }
}

async function runPlanner(session) {
  console.log("=== Pipeline 1: Planner ===");
  const systemPrompt = await fs.readFile("agents/planner.md", "utf8");
  const plan = await runAgentStage({
    ...session,
    model: MODEL,
    systemPrompt,
    userPrompt: `Target URL: ${TARGET_URL}\nGoal: ${FEATURE_GOAL}`,
  });
  await fs.mkdir(path.dirname(SPEC_PATH), { recursive: true });
  await fs.writeFile(SPEC_PATH, `${plan}\n`, "utf8");
  console.log(`Saved -> ${SPEC_PATH}`);
  if (!plan || !plan.trim()) {
    throw new Error("Planner returned an empty plan; refusing to write empty spec file.");
  }
}

async function runGenerator(session) {
  console.log("=== Pipeline 2: Generator ===");
  const systemPrompt = await fs.readFile("agents/generator.md", "utf8");
  const plan = await fs.readFile(SPEC_PATH, "utf8");
  const code = await runAgentStage({
    ...session,
    model: MODEL,
    systemPrompt,
    userPrompt: `Target URL: ${TARGET_URL}\n\nTest Plan:\n${plan}`,
  });
  await fs.mkdir(path.dirname(TEST_PATH), { recursive: true });
  await fs.writeFile(TEST_PATH, `${code}\n`, "utf8");
  console.log(`Saved -> ${TEST_PATH}`);
}

async function runHealer(session) {
  console.log("=== Pipeline 3: Healer ===");
  const systemPrompt = await fs.readFile("agents/healer.md", "utf8");

  for (let attempt = 1; attempt <= MAX_HEAL_RETRIES; attempt++) {
    const result = await runPlaywrightTests();
    if (result.passed) {
      console.log("All tests passed.");
      return;
    }

    console.log(`Attempt ${attempt}/${MAX_HEAL_RETRIES}: patching failing test...`);
    const currentCode = await fs.readFile(TEST_PATH, "utf8");
    const patched = await runAgentStage({
      ...session,
      model: MODEL,
      systemPrompt,
      userPrompt: `Target URL: ${TARGET_URL}\n\nFailure Output:\n${result.report}\n\nTest Code:\n${currentCode}`,
    });
    await fs.writeFile(TEST_PATH, `${patched}\n`, "utf8");
  }

  const finalCheck = await runPlaywrightTests();
  console.log(finalCheck.passed ? "Final check: PASSED" : "Final check: FAILED");
}

async function main() {
  const stage = process.argv[2] || "all";
  const session = await createMcpSession();

  try {
    if (stage === "plan" || stage === "all") await runPlanner(session);
    if (stage === "generate" || stage === "all") await runGenerator(session);
    if (stage === "heal" || stage === "all") await runHealer(session);
  } finally {
    await session.client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
