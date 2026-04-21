import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ name: null })

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')

    const client = new Anthropic()
    const message = await client.beta.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      betas: ['pdfs-2024-09-25'],
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          {
            type: 'text',
            text: 'What is the account name or product name shown prominently at the top of this bank statement? Return ONLY that name — no explanation, no punctuation, just the name itself.',
          },
        ],
      }],
    })

    const name = (message.content[0] as { text: string }).text.trim()
    return NextResponse.json({ name: name || null })
  } catch {
    return NextResponse.json({ name: null })
  }
}
