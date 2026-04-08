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

export interface BotSession {
  createChatStep: CreateChatStep
  createChatDraft: CreateChatDraft
  pendingDraftChatId: string | null
  pendingChatRequestId: number | null
  profileDraft: ProfileDraft
  studentRegistrationDraft: StudentRegistrationDraft
}

export type BotContext = Context & SessionFlavor<BotSession>
