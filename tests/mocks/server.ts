import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const bitrixMockServer = setupServer(
  http.post("https://example.bitrix24.com/rest/:method", ({ params }) =>
    HttpResponse.json({ result: { method: params.method, items: [] } }),
  ),
);
