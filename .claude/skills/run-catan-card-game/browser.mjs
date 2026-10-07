// Browser driver: headless Chromium (Playwright) against the Vite dev server, practice mode.
//   node .claude/skills/run-catan-card-game/browser.mjs < commands.txt
// Env: CATAN_URL (default http://localhost:5199), CATAN_SHOTS (screenshot dir, default /tmp/catan-shots).
// One command per line (blank lines and # comments are skipped):
//   viewport <w> <h>      before 'load'/'lobby'; default 390x844 (phone)
//   lobby                 open the lobby
//   load <state.json>     open practice mode on that GameState (from scenario.ts / engine.ts save)
//   card <n>              tap the n-th card (0-based) of a card grid: in the open dialog, else the page
//   button <regex>        click the button whose accessible name matches (dialog first, then page)
//   click <selector>      page.click with any Playwright selector (css, text=…, role=…)
//   dialog                print the open dialog's text (or "(no dialog)")
//   text                  print the page's visible text
//   shot <name>           screenshot to $CATAN_SHOTS/<name>.png
//   errors                print console errors and page exceptions so far
//   wait <ms>
// Exits 1 if a command fails or the page logged errors.
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const BASE = process.env.CATAN_URL ?? 'http://localhost:5199'
const SHOTS = process.env.CATAN_SHOTS ?? '/tmp/catan-shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await chromium.launch()
let viewport = { width: 390, height: 844 }
let page = null
const errors = []

async function newPage() {
  if (page) await page.context().close()
  page = await (await browser.newContext({ viewport })).newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(String(e)))
  await page.goto(BASE)
}

const dialog = () => page.locator('[role=dialog]')
const scope = async () => ((await dialog().count()) ? dialog().last() : page)
const settle = () => page.waitForTimeout(300)

const commands = {
  viewport: async (w, h) => { viewport = { width: Number(w), height: Number(h) } },
  lobby: async () => { await newPage() },
  load: async file => {
    const state = JSON.parse(readFileSync(file, 'utf8'))
    await newPage()
    // Practice mode starts from the router's navigation state (LobbyPage navigates to /game
    // with { role, initialGameState }); push that state ourselves and let React Router pick it up.
    await page.evaluate(st => {
      history.pushState({ usr: { role: 'practice', initialGameState: st }, key: 'driver', idx: 1 }, '', '/game')
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
    }, state)
    await page.locator('header').first().waitFor()
  },
  card: async n => {
    await (await scope()).locator('[data-testid=search-card]').nth(Number(n)).locator('> button').first().click()
  },
  button: async (...words) => {
    const name = new RegExp(words.join(' '), 'i')
    const inScope = (await scope()).getByRole('button', { name })
    await ((await inScope.count()) ? inScope : page.getByRole('button', { name })).first().click()
    await settle()
  },
  click: async (...sel) => { await page.click(sel.join(' ')); await settle() },
  dialog: async () => { console.log((await dialog().count()) ? (await dialog().last().innerText()).replace(/\s+/g, ' ') : '(no dialog)') },
  text: async () => { console.log((await page.locator('body').innerText()).replace(/\n+/g, ' | ')) },
  shot: async name => { await settle(); const path = `${SHOTS}/${name}.png`; await page.screenshot({ path }); console.log(path) },
  errors: async () => { console.log(errors.length ? errors.join('\n') : '(no errors)') },
  wait: async ms => { await page.waitForTimeout(Number(ms)) },
}

let failed = false
for await (const raw of createInterface({ input: process.stdin })) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const [cmd, ...args] = line.split(/\s+/)
  console.log(`> ${line}`)
  try {
    if (!commands[cmd]) throw new Error(`unknown command ${cmd}`)
    if (!page && !['viewport', 'lobby', 'load'].includes(cmd)) await newPage()
    await commands[cmd](...args)
  } catch (e) {
    failed = true
    console.log(`FAILED: ${e.message.split('\n')[0]}`)
  }
}
await browser.close()
process.exit(failed || errors.length ? 1 : 0)
