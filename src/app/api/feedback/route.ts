import { NextRequest, NextResponse } from 'next/server'
import { getFeedbackRows, appendFeedbackRow } from '@/lib/google'

export const maxDuration = 60

export async function GET() {
  try {
    const rows = await getFeedbackRows()
    return NextResponse.json(rows)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { date, submitted_by, q1_rating, q2_dislike, q3_menu_suggestion, q4_other_feedback, q5_how_heard, q5_how_heard_other } = body
    if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })
    await appendFeedbackRow({
      date,
      submitted_by: submitted_by ?? '',
      q1_rating: q1_rating ?? '',
      q2_dislike: q2_dislike ?? '',
      q3_menu_suggestion: q3_menu_suggestion ?? '',
      q4_other_feedback: q4_other_feedback ?? '',
      q5_how_heard: q5_how_heard ?? '',
      q5_how_heard_other: q5_how_heard_other ?? '',
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
  }
}
