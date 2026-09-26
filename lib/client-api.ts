// Calling our own API routes from the browser, with one error shape.
//
// Every route answers failures as { error: { message, code, fields } }
// (lib/api-response.ts). This reads that once, so screens only deal with
// "it worked, here's the data" or "here's the sentence to show".

export type ApiCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fields: Record<string, string> };

export async function callApi<T = Record<string, unknown>>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiCallResult<T>> {
  try {
    const response = await fetch(url, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        message: payload?.error?.message ?? "Something went wrong. Please try again.",
        fields: payload?.error?.fields ?? {},
      };
    }

    return { ok: true, data: payload as T };
  } catch {
    return {
      ok: false,
      message: "We couldn't reach ChatWise. Check your connection.",
      fields: {},
    };
  }
}
