import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { title, date } = await req.json();
    const googleKey = process.env.GOOGLE_WORKSPACE_KEY;

    if (!googleKey) {
      return NextResponse.json({ error: 'Google Workspace Key não configurada.' }, { status: 500 });
    }

    // Mock call to Google Calendar API to create a Meet event
    console.log(`Scheduling meeting: ${title} on ${date}`);

    return NextResponse.json({ 
      success: true, 
      meetLink: 'https://meet.google.com/abc-defg-hij',
      message: 'Reunião agendada com sucesso!' 
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
