import { BotSession } from './context.js'

export function createInitialSession(): BotSession {
  return {
    createChatStep: 'idle',
    createChatDraft: {},
    pendingDraftChatId: null,
    pendingChatRequestId: null,
    profileDraft: {},
    studentRegistrationDraft: {}
  }
}
