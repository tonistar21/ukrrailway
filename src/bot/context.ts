import { Context, SessionFlavor } from 'grammy'

export type CreateChatStep =
  | 'idle'
  | 'club'
  | 'ageGroup'
  | 'contactChoice'
  | 'contactInfo'
  | 'profileName'
  | 'profilePhone'
  | 'profileTelegramTag'
  | 'studentFullName'
  | 'studentAge'
  | 'studentCity'
  | 'studentClub'

export type ChatManagementStep =
  | 'idle'
  | 'awaitingRoleUser'
  | 'awaitingRoleTag'
  | 'awaitingMuteUser'
  | 'awaitingUnmuteUser'
  | 'awaitingKickUser'
  | 'awaitingTitle'
  | 'awaitingDescription'

export interface CreateChatDraft {
  club?: string
  ageGroup?: string
  contactInfo?: string
}

export interface ProfileDraft {
  profileName?: string
  profilePhone?: string
  profileTelegramTag?: string
}

export interface StudentRegistrationDraft {
  fullName?: string
  age?: number
  city?: string
  club?: string
}

export interface ChatManagementDraft {
  chatId?: string
  targetUserId?: number
  targetUserLabel?: string
}

export interface BotSession {
  createChatStep: CreateChatStep
  createChatDraft: CreateChatDraft
  pendingDraftChatId: string | null
  pendingChatRequestId: number | null
  profileDraft: ProfileDraft
  studentRegistrationDraft: StudentRegistrationDraft
  chatManagementStep: ChatManagementStep
  chatManagementDraft: ChatManagementDraft
  pendingUserRequestId: number | null
}

export type BotContext = Context & SessionFlavor<BotSession>
