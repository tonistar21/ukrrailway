import { Context, SessionFlavor } from 'grammy'

export type CreateChatStep =
  | 'idle'
  | 'registrationType'
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
  | 'teacherName'
  | 'teacherPhone'
  | 'teacherCity'
  | 'teacherClub'
  | 'teacherTelegramTag'
  | 'studentClub'

export type EventStep =
  | 'idle'
  | 'title'
  | 'text'
  | 'photo'
  | 'scheduledFor'

export type ChatManagementStep =
  | 'idle'
  | 'awaitingRoleUser'
  | 'awaitingRoleTag'
  | 'awaitingMuteUser'
  | 'awaitingUnmuteUser'
  | 'awaitingKickUser'
  | 'awaitingTitle'
  | 'awaitingDescription'

export type AttendanceStep =
  | 'idle'
  | 'awaitingDate'

export type GradeStep =
  | 'idle'
  | 'awaitingDate'

export type MailStep =
  | 'idle'
  | 'choosingTarget'
  | 'awaitingText'

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

export interface RegistrationDraft {
  registrationType?: 'STUDENT' | 'TEACHER'
  fullName?: string
  age?: number
  city?: string
  club?: string
  profileName?: string
  profilePhone?: string
  profileTelegramTag?: string
  teacherCity?: string
}

export interface ChatManagementDraft {
  chatId?: string
  targetUserId?: number
  targetUserLabel?: string
}

export interface EventDraft {
  title?: string
  text?: string
  photoFileId?: string
  scheduledFor?: string
  selectedEventId?: string
}

export interface AttendanceDraft {
  chatId?: string
  date?: string
  exportMessageId?: number
}

export interface GradeDraft {
  chatId?: string
  date?: string
  exportMessageId?: number
}

export interface MailDraft {
  targetType?: 'TEACHER' | 'ADMIN' | 'VICE_ADMIN'
}

export interface BotSession {
  createChatStep: CreateChatStep
  createChatDraft: CreateChatDraft
  pendingDraftChatId: string | null
  pendingChatRequestId: number | null
  profileDraft: ProfileDraft
  registrationDraft: RegistrationDraft
  chatManagementStep: ChatManagementStep
  chatManagementDraft: ChatManagementDraft
  pendingUserRequestId: number | null
  eventStep: EventStep
  eventDraft: EventDraft
  attendanceStep: AttendanceStep
  attendanceDraft: AttendanceDraft
  gradeStep: GradeStep
  gradeDraft: GradeDraft
  mailStep: MailStep
  mailDraft: MailDraft
}

export type BotContext = Context & SessionFlavor<BotSession>
