/**
 * Extracts a human-readable message from a supabase.functions.invoke() failure.
 * `FunctionsHttpError` only says "non-2xx status code" — the real reason lives
 * in the response body, which we read from `error.context`.
 */
export async function invokeErrorMessage(error: any, data?: any): Promise<string> {
  if (data?.error) return String(data.error);

  const ctx = error?.context;
  if (ctx && typeof ctx.text === "function") {
    try {
      const raw = await ctx.text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) return String(parsed.error);
          if (parsed?.message) return String(parsed.message);
        } catch {
          return raw.slice(0, 300);
        }
      }
    } catch {
      /* body already consumed or unreadable */
    }
  }

  return error?.message || "Unknown error";
}
