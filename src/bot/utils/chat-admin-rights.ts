export const fullGroupAdministratorRights = {
  is_anonymous: false,
  can_manage_chat: true,
  can_delete_messages: true,
  can_manage_video_chats: true,
  can_restrict_members: true,
  can_promote_members: true,
  can_change_info: true,
  can_invite_users: true,
  can_manage_tags: true,
  can_post_stories: true,
  can_edit_stories: true,
  can_delete_stories: true,
  can_pin_messages: true,
  can_manage_topics: true
} as const

export const manageableGroupAdministratorRights = [
  ['can_manage_chat', 'керування чатом'],
  ['can_delete_messages', 'видалення повідомлень'],
  ['can_manage_video_chats', 'керування відеочатами'],
  ['can_restrict_members', 'обмеження та бан учасників'],
  ['can_promote_members', 'призначення адміністраторів'],
  ['can_change_info', 'зміна інформації чату'],
  ['can_invite_users', 'запрошення користувачів'],
  ['can_manage_tags', 'керування тегами'],
  ['can_post_stories', 'публікація stories'],
  ['can_edit_stories', 'редагування stories'],
  ['can_delete_stories', 'видалення stories'],
  ['can_pin_messages', 'закріплення повідомлень'],
  ['can_manage_topics', 'керування темами']
] as const
