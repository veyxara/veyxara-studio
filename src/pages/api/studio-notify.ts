import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { title, action = 'Notificación', url = '' } = await request.json();

    if (!title) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Falta el título' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = import.meta.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = import.meta.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Faltan variables de entorno de Telegram' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const text =
      `🔔 *VEYXARA STUDIO*\n\n` +
      `📌 *Acción:* ${action}\n` +
      `🖼️ *Imagen:* ${title}\n` +
      (url ? `🔗 *Enlace:* ${url}\n` : '') +
      `⏰ *Fecha:* ${new Date().toLocaleString('es-CO')}`;

    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });

    return new Response(
      JSON.stringify({ ok: tgRes.ok }),
      { status: tgRes.ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};