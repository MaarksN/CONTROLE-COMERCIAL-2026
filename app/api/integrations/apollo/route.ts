import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { domain, email } = await req.json();
    const apiKey = process.env.APOLLO_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'APOLLO_API_KEY não configurada' }, { status: 500 });
    }

    // Example payload for Apollo People Enrichment (mocking implementation structure)
    // The exact endpoint may vary depending on Apollo API spec.
    const response = await fetch('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        api_key: apiKey,
        email: email,
        domain: domain
      })
    });

    const data = await response.json();
    
    return NextResponse.json({ result: data.person || data });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
