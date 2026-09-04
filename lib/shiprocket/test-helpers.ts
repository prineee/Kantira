// Shared mock-fetch helper for the lib/shiprocket/*.test.ts files. Not
// itself a test — deliberately named without a .test. suffix so Node's test
// runner glob doesn't try to execute it directly.

type MockRoute = {
  match: (url: string) => boolean;
  respond: () => { status: number; body: unknown } | { status: number; rawText: string };
};

export function installMockFetch(routes: MockRoute[]) {
  const original = globalThis.fetch;
  let callCount = 0;
  const calledUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    callCount += 1;
    const url = typeof input === "string" ? input : input.toString();
    calledUrls.push(url);

    const route = routes.find((r) => r.match(url));
    if (!route) {
      throw new Error(`No mock route configured for URL: ${url}`);
    }
    const result = route.respond();
    const text = "rawText" in result ? result.rawText : JSON.stringify(result.body);

    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: { get: () => "application/json" },
      text: async () => text,
      json: async () => JSON.parse(text),
    } as unknown as Response;
  }) as typeof fetch;

  return {
    restore: () => {
      globalThis.fetch = original;
    },
    get callCount() {
      return callCount;
    },
    get calledUrls() {
      return calledUrls;
    },
  };
}

export function withEnv(vars: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  const restore = () => {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
  const result = fn();
  if (result instanceof Promise) {
    return result.finally(restore);
  }
  restore();
  return undefined;
}
