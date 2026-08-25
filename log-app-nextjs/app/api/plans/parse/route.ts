import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import { requireUserId, toErrorResponse } from '@/lib/error';
import { parsePlanWithOpenAI } from '@/lib/services/planParser';
import { rateLimit } from '@/lib/rateLimit';

const PARSE_LIMIT = 10;
const PARSE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    if (userId instanceof NextResponse) return userId;

    if (!rateLimit(`plan-parse:${userId}`, PARSE_LIMIT, PARSE_WINDOW_MS)) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many parse requests. Try again later.' } },
        { status: 429 },
      );
    }

    let text = '';

    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const textField = form.get('text');
      if (typeof textField === 'string') text = textField;
      if (file instanceof File) {
        if (file.type !== 'application/pdf') {
          return NextResponse.json(
            { error: { code: 'VALIDATION_ERROR', message: 'Only PDF uploads are supported.' } },
            { status: 400 },
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const parsed = await pdfParse(buffer);
        text = parsed.text;
      }
    } else {
      const body = await req.json().catch(() => null);
      text = body?.text ?? '';
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'No plan text provided.' } },
        { status: 400 },
      );
    }

    const result = await parsePlanWithOpenAI(text);
    return NextResponse.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
