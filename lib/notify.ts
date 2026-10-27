// 여러 프로젝트가 같은 디스코드 채널을 쓰므로 어느 프로젝트의 알림인지 이름을 붙인다
const PROJECT = '예약 CRM'

/** DISCORD_WEBHOOK_URL이 없으면 아무것도 하지 않고, 실패해도 호출한 쪽에 영향 없음 */
export async function notifyDiscord(content: string): Promise<void> {
  const hook = process.env.DISCORD_WEBHOOK_URL
  if (!hook) return
  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: PROJECT, content: `**[${PROJECT}]** ${content}`.slice(0, 1900), allowed_mentions: { parse: [] } }),
    })
  } catch {}
}
