import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { email, subject, body } = await req.json();
    const smtpKey = process.env.SMTP_API_KEY;

    if (!smtpKey) {
      return NextResponse.json({ error: 'Configuração SMTP não encontrada.' }, { status: 500 });
    }

    // Mock call to a generic Email API (e.g. Nodemailer/SendGrid)
    console.log(`Sending Email to ${email} with subject: ${subject}`);

    return NextResponse.json({ success: true, message: 'E-mail enviado com sucesso!' });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
