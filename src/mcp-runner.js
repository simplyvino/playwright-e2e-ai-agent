import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

export async function createMcpSession() {
  const transport = new StdioClientTransport({
    command: "./node_modules/.bin/playwright-mcp",
    args: [
      "--browser",
      "chromium",
      "--headless",
      "--no-sandbox",
    ],
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: "/ms-playwright",
    },
    stderr: "pipe",
  });

  // Print the exact child process error before MCP disconnects
  transport.stderr?.on("data", (chunk) => {
    console.error("[playwright-mcp stderr]:", chunk.toString());
  });

  const client = new Client({
    name: "playwright-ai-qa-pipeline",
    version: "0.3.0",
  });

  await client.connect(transport);
  const { tools } = await client.listTools();

  const openaiTools = tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description ?? "",
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  }));

  return { client, openaiTools };
}

export async function runAgentStage({
  client,
  openaiTools,
  model,
  systemPrompt,
  userPrompt,
  maxTurns = 25,
}) {
  const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://github.com/simplyvino/playwright-ai-qa-agent",
      "X-Title": "Playwright AI QA Agent",
    },
  });

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let finalText = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await openrouter.chat.completions.create({
      model,
      messages,
      tools: openaiTools,
      temperature: 0.2,
    });

    const msg = response.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalText = (msg.content ?? "").trim();
      if (finalText) break;
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const toolCall of msg.tool_calls) {
        if (toolCall.type !== "function") continue;
        const args = JSON.parse(toolCall.function.arguments || "{}");

        console.log(`[${model}] -> MCP: ${toolCall.function.name}`);
        const result = await client.callTool({
          name: toolCall.function.name,
          arguments: args,
        });

        const textOutput = Array.isArray(result.content)
          ? result.content
              .map((block) =>
                typeof block === "object" && block && "text" in block
                  ? String(block.text)
                  : JSON.stringify(block)
              )
              .join("\n")
          : JSON.stringify(result.content);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: textOutput,
        });
      }
    }
  }

  // Fallback: if the model exited with empty text or hit maxTurns, ask for the final output without tools
  if (!finalText) {
    const summaryResponse = await openrouter.chat.completions.create({
      model,
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "Now provide your complete final response based on everything you observed. Do not leave it blank.",
        },
      ],
      temperature: 0.2,
    });
    finalText = (summaryResponse.choices[0]?.message?.content ?? "").trim();
  }

  return finalText
    .replace(/^```(?:javascript|js|markdown|md)?\n/i, "")
    .replace(/\n```$/i, "")
    .trim();
}
