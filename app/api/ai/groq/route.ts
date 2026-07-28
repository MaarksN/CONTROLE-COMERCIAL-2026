import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, dataContext } = await req.json();
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY não configurada' }, { status: 500 });
    }

    const systemPrompt = `Você é o Assistente de Inteligência Comercial da Atlas (Atlas Comercial 360), especialista em análise de funil de vendas, predições logísticas e B2B. O tom de voz deve ser inovador, tecnológico, seguro e direto ao ponto. Utilize formatação markdown. 
    Aqui estão os dados comerciais atuais para contexto (não os repita, apenas use para gerar insights): 
    ${JSON.stringify(dataContext)}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error("Groq API Error:", data.error);
      return NextResponse.json({ error: data.error.message }, { status: 500 });
    }

    return NextResponse.json({ result: data.choices[0].message.content });
  } catch (error: unknown) {
    console.error("Groq integration error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
