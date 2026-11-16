import { randomUUID } from 'node:crypto';

// Keep each raw body in one log entry so concurrent calls can be paired by ID.
// Request headers are deliberately excluded: they contain provider credentials.
export async function aiRequest(scope, url, options, fetcher = fetch) {
  const id = randomUUID();
  const started = Date.now();
  const prefix = `[AI][${scope}][${id}]`;
  console.log(`${prefix} INPUT ${new Date(started).toISOString()}\n${options.body}`);
  try {
    const response = await fetcher(url, options);
    const raw = await response.clone().text();
    console.log(`${prefix} OUTPUT HTTP ${response.status} ${Date.now() - started}ms\n${raw}`);
    return response;
  } catch (error) {
    console.error(`${prefix} ERROR ${Date.now() - started}ms\n${error.name}: ${error.message}`);
    throw error;
  }
}
