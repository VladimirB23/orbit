/** Typed HTTP client. Paths and bodies are checked against the generated API schema. */
import createClient from 'openapi-fetch';
import type { paths } from './schema';

// `fetch` is looked up on every call so that tests can replace it.
const client = createClient<paths>({ fetch: (request) => globalThis.fetch(request) });

export class ApiError extends Error {
  constructor(
    readonly type: string,
    message: string,
  ) {
    super(message);
  }
}

type Result<T> = { data?: T; error?: unknown; response: Response };

/** Data or an ApiError, whatever went wrong: the server, the network or a proxy. */
async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await call;
  } catch {
    throw new ApiError('offline', 'Нет связи с сервером');
  }
  if (result.response.ok) return result.data as T;
  const body = (result.error as { error?: { type?: string; message?: string } } | undefined)?.error;
  if (body?.type) throw new ApiError(body.type, body.message ?? '');
  throw new ApiError('offline', `Сервер ответил кодом ${result.response.status}`);
}

export { client, unwrap };
