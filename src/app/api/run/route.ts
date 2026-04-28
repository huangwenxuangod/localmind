// SSE API Route — /api/run
import { createSSEResponse } from "@/lib/sse/stream";
import { runAgent } from "@/agent/core/agent";
import { nanoid } from "nanoid";

export async function POST(request: Request) {
  const { userInput } = await request.json();
  if (!userInput?.trim()) {
    return Response.json({ error: "userInput is required" }, { status: 400 });
  }

  const sessionId = nanoid();

  return createSSEResponse(async (emitter) => {
    await runAgent(sessionId, userInput, emitter);
  });
}
