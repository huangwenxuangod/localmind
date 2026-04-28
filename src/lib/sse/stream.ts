// SSE 工具函数
import type { SSEEvent } from "@/types";

export function createSSEResponse(
  handler: (emitter: (event: SSEEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      // client disconnected
    },
  });

  const emitter = (event: SSEEvent) => {
    try {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      controller.enqueue(encoder.encode(data));
    } catch {
      // stream closed
    }
  };

  // Run handler async, close stream when done
  handler(emitter).finally(() => {
    try { controller.close(); } catch { /* already closed */ }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
