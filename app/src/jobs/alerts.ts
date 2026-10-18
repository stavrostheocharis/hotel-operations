/**
 * One line to whoever runs the system when a job fails or a dead one is
 * swept: an HTTP POST of `{ text }` to JOBS_ALERT_WEBHOOK (Slack-style
 * incoming webhooks and most chat tools accept it). Nothing is sent when
 * the variable is unset; a failing webhook is logged, never fatal.
 */
export async function notifyOperator(text: string): Promise<boolean> {
  const url = process.env.JOBS_ALERT_WEBHOOK;
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5_000) });
    if (!res.ok) console.error(`[alerts] webhook answered ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error(`[alerts] webhook failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
