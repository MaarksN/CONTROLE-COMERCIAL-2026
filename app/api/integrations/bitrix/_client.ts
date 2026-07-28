/** Thin client for the Bitrix24 REST API via an inbound webhook URL (e.g. https://portal.bitrix24.com.br/rest/1/xxxxxxxx/). */
export async function callBitrix<T>(
  webhookUrl: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const base = webhookUrl.endsWith("/") ? webhookUrl : `${webhookUrl}/`;
  const url = `${base}${method}.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json()) as { result?: T; error?: string; error_description?: string };
  if (!res.ok || json.error) {
    throw new Error(
      `Bitrix24 (${method}) respondeu com erro: ${json.error_description ?? json.error ?? res.status}`,
    );
  }
  return json.result as T;
}

export type BitrixDealListItem = {
  ID: string;
  TITLE: string;
  OPPORTUNITY: string;
  STAGE_ID: string;
  DATE_CREATE: string;
};
