import { expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer } from './helpers'

// The sidebar "Opened files" rows act like tabs: they close on middle click and
// reorder by drag, sharing the tab bar's `tabs` order.

const rowSelector = '.side-bar .opened-files-list .opened-file'

const readRowIds = (page: Page): Promise<string[]> =>
  page.evaluate(
    (selector) =>
      Array.from(document.querySelectorAll(selector)).map((el) => el.getAttribute('data-id') ?? ''),
    rowSelector
  )

const readTabIds = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.tabs-container > li')).map(
      (li) => li.getAttribute('data-id') ?? ''
    )
  )

const activeRowId = (page: Page): Promise<string | null> =>
  page.evaluate(
    (selector) => document.querySelector(`${selector}.active`)?.getAttribute('data-id') ?? null,
    rowSelector
  )

const centerOfRow = async(page: Page, id: string): Promise<{ x: number; y: number }> => {
  const box = await page.locator(`${rowSelector}[data-id="${id}"]`).boundingBox()
  if (!box) throw new Error(`row ${id} is not visible`)
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

const addTabs = async(app: ElectronApplication, page: Page, total: number): Promise<void> => {
  const current = (await readRowIds(page)).length
  for (let i = current; i < total; i++) {
    await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, `body ${i}\n`)
  }
  await page.waitForFunction(
    ({ selector, count }) => document.querySelectorAll(selector).length >= count,
    { selector: rowSelector, count: total },
    { timeout: 5000 }
  )
}

test.describe('Sidebar opened files tab actions', () => {
  let app: ElectronApplication
  let page: Page

  test.beforeAll(async() => {
    const launched = await launchWithMarkdown('# Doc\n')
    app = launched.app
    page = launched.page
    await page.waitForSelector(rowSelector, { state: 'visible', timeout: 5000 })
    await addTabs(app, page, 4)
  })

  test.afterAll(async() => {
    if (app) await app.close()
  })

  test('a deliberate drag reorders the rows and the tab bar', async() => {
    const before = await readRowIds(page)
    const from = await centerOfRow(page, before[0])
    const to = await centerOfRow(page, before[1])

    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y + 10, { steps: 10 })
    await page.mouse.up()

    const expected = [before[1], before[0]].join(',')
    await expect
      .poll(async() => (await readRowIds(page)).slice(0, 2).join(','), { timeout: 3000 })
      .toBe(expected)
    expect((await readTabIds(page)).slice(0, 2).join(',')).toBe(expected)
  })

  test('a click with a few pixels of drift still selects the file', async() => {
    const ids = await readRowIds(page)
    const active = await activeRowId(page)
    const targetId = ids.find((id) => id !== active)
    if (!targetId) throw new Error('no inactive row to click')

    const { x, y } = await centerOfRow(page, targetId)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 3)
    await page.mouse.up()

    await expect.poll(() => activeRowId(page), { timeout: 3000 }).toBe(targetId)
  })

  test('middle click closes the row', async() => {
    const ids = await readRowIds(page)
    // Untitled tabs with content are unsaved; pick the saved launch document.
    const savedId = await page.evaluate(
      (selector) =>
        document.querySelector(`${selector}:not(.unsaved)`)?.getAttribute('data-id') ?? null,
      rowSelector
    )
    expect(savedId).not.toBeNull()

    await page.locator(`${rowSelector}[data-id="${savedId}"]`).click({ button: 'middle' })

    await expect.poll(async() => (await readRowIds(page)).length, { timeout: 3000 }).toBe(
      ids.length - 1
    )
    expect(await readRowIds(page)).not.toContain(savedId)
  })
})
