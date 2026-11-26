import { setTimeout as delay } from 'node:timers/promises';

export async function retryAppleRead(send, consume = response => response) {
  for (let attempt = 0; ; attempt++) {
    let wait = 300 * 2 ** attempt;
    try {
      const response = await send();
      if (response.ok) return await consume(response);
      if (attempt >= 2 || ![408, 429, 500, 502, 503, 504].includes(response.status)) return response;
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        const seconds = /^\d+$/.test(retryAfter) ? Number(retryAfter) : (Date.parse(retryAfter) - Date.now()) / 1000;
        if (seconds > 5) return response;
        if (Number.isFinite(seconds)) wait = Math.max(wait, seconds * 1000);
      }
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      if (attempt >= 2 || !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)) throw error;
    }
    await delay(wait);
  }
}
