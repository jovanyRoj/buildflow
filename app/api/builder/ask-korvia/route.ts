import { NextRequest, NextResponse } from 'next/server'
import { buildKorviaProjectContext } from '@/lib/korvia-context'

// POST /api/builder/ask-korvia
// { projectId, question } → KORVIA answers using live project data from DB
export async function POST(req: NextRequest) {
  try {
    const { projectId, question } = await req.json()

    if (!projectId || !question?.trim()) {
      return NextResponse.json({ error: 'Missing projectId or question' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'KORVIA not configured — ANTHROPIC_API_KEY missing' }, { status: 500 })
    }

    // Build full project context from DB
    const contextBlock = await buildKorviaProjectContext(projectId)

    const systemPrompt = `You are KORVIA, an AI construction project coordinator for Brivox.
You have real-time access to the project database shown below.
Answer the builder's question concisely and accurately using the data provided.
Use specific task names, names, dates and dollar amounts from the data.
If information is not in the data, say so clearly.
Be direct and helpful. Respond in the same language as the question (English or Spanish).`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `${contextBlock}\n\n---\nBUILDER QUESTION: ${question}`,
        }],
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      console.error('[ask-korvia] Anthropic error:', aiRes.status, errText)
      return NextResponse.json({
        error: `AI API error (${aiRes.status}): ${errText.slice(0, 200)}`,
        answer: `KORVIA error (${aiRes.status}) — check Vercel logs for details.`,
      }, { status: 200 }) // return 200 so frontend shows the answer field
    }

    const aiData  = await aiRes.json()
    const answer  = aiData.content?.[0]?.text

    if (!answer) {
      console.error('[ask-korvia] Empty content from Anthropic:', JSON.stringify(aiData))
      return NextResponse.json({ answer: 'KORVIA did not return a response. Try again.' })
    }

    return NextResponse.json({ answer })

  } catch (e: any) {
    console.error('[ask-korvia] Unexpected error:', e)
    return NextResponse.json({
      answer: `KORVIA encountered an error: ${e.message}`,
    })
  }
}
