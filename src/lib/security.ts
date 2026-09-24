// Client side of step-2 login security verification. The actual check runs
// server-side in the security-verify edge function — see that file for why.
import { invokeFunction } from '@/lib/sync'

export interface VerificationChallenge {
  questionId: string
  text: string
  scene: string
  people: { id: string; name: string; photo: string | null }[]
}

/** Does this login need a security question at all? False when none are configured, or it's switched off. */
export async function verificationRequired(): Promise<boolean> {
  const res = await invokeFunction<{ required: boolean }>('security-verify', { action: 'status' })
  return res.required
}

/** Ask for a question to show. `excludeQuestionId` is used by "Try another way". */
export async function verificationChallenge(excludeQuestionId?: string): Promise<VerificationChallenge | null> {
  const res = await invokeFunction<VerificationChallenge & { none?: true }>('security-verify', {
    action: 'challenge', excludeQuestionId,
  })
  return res.none ? null : res
}

export async function verificationCheck(questionId: string, selectedPersonId: string): Promise<boolean> {
  const res = await invokeFunction<{ correct: boolean }>('security-verify', {
    action: 'check', questionId, selectedPersonId,
  })
  return res.correct
}
