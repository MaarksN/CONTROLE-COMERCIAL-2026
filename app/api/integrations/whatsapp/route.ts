import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { phone, message } = await req.json();
    const apiKey = process.env.WHATSAPP_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'WhatsApp API Key não configurada.' }, { status: 500 });
    }

    // Mock call to a generic WhatsApp API (e.g. Meta Cloud API or Baileys Webhook)
    console.log(`Sending WhatsApp message to ${phone}: ${message}`);

    return NextResponse.json({ success: true, message: 'Mensagem enviada com sucesso!' });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
