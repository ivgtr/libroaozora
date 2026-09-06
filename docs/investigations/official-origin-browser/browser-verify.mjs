import { chromium } from '/home/ivgtr/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'
import { expect } from '/home/ivgtr/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/test.mjs'
import { writeFileSync } from 'node:fs'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } })
await context.tracing.start({ screenshots: true, snapshots: true })
const page = await context.newPage()
const pageErrors = []
page.on('pageerror', error => pageErrors.push(error.message))
let contentRequests = 0
page.on('request', request => { if (request.url().includes('/api/works/47927')) contentRequests++ })
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
await page.route('**/api/today', route => route.fulfill({ json: { today: { workId: 47927, date }, tomorrow: { workId: 789, date }, prefetchEnabled: true } }))
const admin = path => fetch('http://127.0.0.1:9798' + path, { method: 'POST' }).then(response => { if (!response.ok) throw new Error('Admin failed'); return response.json() })
async function cache(action) {
  return page.evaluate(async action => {
    const db = await new Promise((resolve, reject) => { const req = indexedDB.open('dayroaozora', 1); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('content_cache', action === 'read' ? 'readonly' : 'readwrite')
        const store = tx.objectStore('content_cache')
        let value
        const req = store.get(47927)
        req.onsuccess = () => {
          value = req.result
          if (action === 'expire') { value.checkedAt = 0; store.put(value) }
          if (action === 'legacy') { value.version = 2; delete value.checkedAt; delete value.delivery; delete value.readingContentId; store.put(value) }
        }
        tx.oncomplete = () => resolve(value)
        tx.onabort = () => reject(tx.error)
      })
    } finally { db.close() }
  }, action)
}
async function shelf(id) {
  await page.evaluate(id => history.pushState(null, '', `/?source=bookshelf&workId=${id}`), id)
  await expect(page.getByRole('application')).toBeVisible()
  await expect(page.getByRole('button', { name: '本棚に戻る' })).toBeVisible()
  if (id === 789) await expect(page.getByRole('application')).toHaveText('一一')
  else await expect(page.getByRole('application')).toContainText('春淺き日に')
}
const results = []
try {
  await page.goto('http://127.0.0.1:3099/')
  await expect(page.getByRole('application')).toContainText('春淺き日に')
  const initialDisplay = await page.getByRole('application').textContent()
  const initial = await cache('read')
  expect(initial.version).toBe(3)
  expect(initial.checkedAt).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise(resolve => { const req = indexedDB.open('dayroaozora'); req.onsuccess = () => resolve(req.result) })
    return new Promise(resolve => { const tx = db.transaction('content_cache'); const req = tx.objectStore('content_cache').get(789); req.onsuccess = () => { db.close(); resolve(Boolean(req.result)) } })
  })).toBe(true)
  await page.evaluate(({ date, id }) => {
    localStorage.setItem('dayro:today', JSON.stringify({ date, workId: 47927, progress: 3, viewPosition: 2, tapCount: 99, startedAt: new Date().toISOString(), completed: false, readingContentId: id }))
    localStorage.setItem('dayro:bookshelf', JSON.stringify([{ workId: 47927, title: '履歴を保持', author: '堀 辰雄', firstLine: '本文', status: 'favorite_completed', favoriteAt: '2026-01-01', completedAt: '2026-01-02', readingTime: 10000, tapCount: 99, lastProgress: 3, lastViewPosition: 2, readingContentId: id }]))
  }, { date, id: initial.readingContentId })
  const requestsBefore = contentRequests
  await admin('/revise')
  await expect(page.getByRole('application')).toHaveText(initialDisplay)
  expect(contentRequests).toBe(requestsBefore)
  results.push('An upstream revision does not replace the displayed text')
  await cache('expire')
  await page.reload()
  await expect(page.getByRole('application')).toBeVisible()
  const stale = await cache('read')
  expect(stale.delivery.verification).toBe('stale')
  expect(stale.checkedAt).toBeUndefined()
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayro:today')).progress)).toBe(3)
  results.push('Temporary origin failure returns the identified previous version without advancing checkedAt or resetting its position')
  await admin('/recover')
  await page.reload()
  await expect(page.getByRole('application')).toContainText('春淺き日に')
  await expect(page.getByRole('status')).toContainText('先頭から再開')
  const updated = await cache('read')
  expect(updated.readingContentId).not.toBe(initial.readingContentId)
  expect(updated.delivery.verification).toBe('current')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayro:today')))).toMatchObject({ progress: 0, viewPosition: 0, tapCount: 99, readingContentId: updated.readingContentId })
  for (let progress = 1; progress <= 6; progress++) {
    await page.getByRole('application').press('Space')
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('dayro:today')).progress)).toBe(progress)
    if ((await page.getByRole('application').textContent()).includes('訂正された温かな')) break
  }
  await expect(page.getByRole('application')).toContainText('訂正された温かな')
  await page.screenshot({ path: '/tmp/official-origin-step2/updated-reading.png', fullPage: false })
  results.push('Reopening adopts the corrected text and resets only the current reading position')
  await shelf(47927)
  const historyEntry = await page.evaluate(() => JSON.parse(localStorage.getItem('dayro:bookshelf'))[0])
  expect(historyEntry).toMatchObject({ status: 'favorite_completed', lastProgress: 0, lastViewPosition: 0, completedAt: '2026-01-02', readingTime: 10000, tapCount: 99, readingContentId: updated.readingContentId })
  results.push('Bookshelf reopening preserves favorites and completion history while resetting the incompatible position')
  await cache('legacy')
  await page.evaluate(() => { const entries = JSON.parse(localStorage.getItem('dayro:bookshelf')); entries[0].status = 'favorite'; entries[0].lastProgress = 1; entries[0].lastViewPosition = 1; delete entries[0].readingContentId; localStorage.setItem('dayro:bookshelf', JSON.stringify(entries)) })
  await context.setOffline(true)
  await shelf(789)
  await shelf(47927)
  expect((await cache('read')).version).toBe(2)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayro:bookshelf'))[0].lastProgress)).toBe(1)
  results.push('Real offline mode can reopen saved legacy v2 text and preserve its unidentified old position')
  await context.setOffline(false)
  await shelf(789)
  await shelf(47927)
  await expect.poll(async () => (await cache('read')).version).toBe(3)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('dayro:bookshelf'))[0].lastProgress)).toBe(0)
  results.push('The first identified online version migrates v2 to v3 and resets an unknown legacy position')
  await admin('/withdraw')
  await cache('expire')
  await shelf(789)
  await page.evaluate(() => history.pushState(null, '', '/?source=bookshelf&workId=47927'))
  await expect(page.getByRole('alert').filter({ hasText: '読み込みに失敗' })).toContainText('読み込みに失敗')
  expect(await cache('read')).toBeUndefined()
  await context.setOffline(true)
  await shelf(789)
  await page.evaluate(() => history.pushState(null, '', '/?source=bookshelf&workId=47927'))
  await expect(page.getByRole('alert').filter({ hasText: '読み込みに失敗' })).toContainText('読み込みに失敗')
  results.push('Confirmed withdrawal invalidates local text and prevents subsequent offline resurrection')
  expect(pageErrors).toEqual([])
  writeFileSync('/tmp/official-origin-step2/browser-results.json', JSON.stringify({ browser: browser.version(), results, contentRequests, pageErrors }, null, 2))
  console.log(JSON.stringify({ results, contentRequests, pageErrors }, null, 2))
} finally {
  await context.tracing.stop({ path: '/tmp/official-origin-step2/browser-trace.zip' })
  await browser.close()
}
