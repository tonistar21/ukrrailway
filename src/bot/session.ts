import { BotSession } from './context.js'

export function createInitialSession(): BotSession {
  return {
    createChatStep: 'idle',
    createChatDraft: {},
    pendingDraftChatId: null,
    pendingChatRequestId: null,
    profileDraft: {},
    registrationDraft: {},
    chatManagementStep: 'idle',
    chatManagementDraft: {},
    pendingUserRequestId: null,
    eventStep: 'idle',
    eventDraft: {},
    attendanceStep: 'idle',
    attendanceDraft: {},
    gradeStep: 'idle',
    gradeDraft: {}
  }
}
