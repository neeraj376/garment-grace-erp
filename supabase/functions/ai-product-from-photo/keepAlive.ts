// JSON whitespace is valid between tokens and keeps the browser connection active.
// The result is emitted once; AI work is never automatically repeated.
export function keepAliveJson(work: () => Promise<Response>, headers: HeadersInit, intervalMs = 5000): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("\n"));
      timer = setInterval(() => {
        if (!cancelled) controller.enqueue(encoder.encode("\n"));
      }, intervalMs);
      try {
        const response = await work();
        const result = await response.json();
        if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(
          response.ok ? result : { ...result, status: response.status },
        )));
      } catch (error) {
        if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify({
          error: error instanceof Error ? error.message : "Video recognition failed", status: 500,
        })));
      } finally {
        clearInterval(timer);
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; clearInterval(timer); },
  });
  return new Response(body, { headers: {
    ...Object.fromEntries(new Headers(headers)),
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-transform",
  } });
}