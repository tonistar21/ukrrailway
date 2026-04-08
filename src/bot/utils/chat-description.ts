export function buildChatDescription(params: {
  club: string
  ageGroup: string
  contactInfo: string
  ownerName: string
}) {
  const lines = [
    `Гурток: ${params.club}`,
    `Вікова група: ${params.ageGroup}`,
    `Відповідальний: ${params.ownerName}`,
    `Контакти: ${params.contactInfo}`
  ]

  return lines.join('\n').slice(0, 255)
}
