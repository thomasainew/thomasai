import type { AdvisorPersona } from '@/types'

/** The questions asked in Train Advisors — same set for both personas. */
export const PERSONA_QUESTIONS = [
  'Who is this character based on? (a real family member, or a type of person)',
  "What's their profession or background?",
  'How do they usually talk — tone, style, any phrase they repeat often?',
  'What do they care about most when it comes to money?',
  'Any personal story or memory that shows who they really are?',
  'Anything they should never say or do?',
]

/** Turn a persona's guided answers + free notes into one block for the Gemini prompt. */
export function composePersonaNotes(p: AdvisorPersona | undefined): string {
  if (!p) return ''
  const parts: string[] = []
  for (const { question, answer } of p.qa ?? []) {
    if (answer.trim()) parts.push(`${question} — ${answer.trim()}`)
  }
  if (p.instructions?.trim()) parts.push(p.instructions.trim())
  return parts.join('\n')
}
