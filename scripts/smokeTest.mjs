// Checks a built site where it will be served, before it is published (the Deploy workflow
// runs it on the GitHub Pages build): the app opens without errors, the service worker takes
// control, it opens again offline with the editor working, and it refuses to run in a frame.
//
//   node scripts/smokeTest.mjs http://127.0.0.1:4180/get-started/
import { chromium } from '@playwright/test'

const url = process.argv[2]
if (!url) throw new Error('Usage: node scripts/smokeTest.mjs <url of the app>')

const browser = await chromium.launch()
const context = await browser.newContext({ serviceWorkers: 'allow' })
const page = await context.newPage()
const problems = []
page.on('console', (message) => message.type() === 'error' && problems.push(message.text()))
page.on('pageerror', (error) => problems.push(error.message))
const check = async (name, action) => {
  await action()
  console.log(`ok   ${name}`)
}

try {
  await check('opens', async () => {
    await page.goto(url)
    await page.getByRole('heading', { name: 'Welcome to your library', level: 1 }).waitFor({ timeout: 30_000 })
  })
  await check('the service worker takes control', () => page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30_000 }))
  await check('opens offline, with the editor and the handbooks', async () => {
    await context.setOffline(true)
    await page.reload()
    await page.getByRole('heading', { name: 'Welcome to your library', level: 1 }).waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Create a new note', exact: true }).click()
    await page.getByRole('textbox', { name: 'Note title' }).waitFor({ timeout: 30_000 })
    // A built-in handbook note, from the install, never opened online.
    await page.goto(`${url}#/notebook/core-everyday-nutrition?note=core-staying-hydrated`)
    await page.getByRole('dialog', { name: 'Staying hydrated' }).waitFor({ timeout: 30_000 })
    await context.setOffline(false)
  })
  await check('refuses to run in a frame', async () => {
    const framing = await context.newPage()
    await framing.setContent(`<iframe src="${url}" width="600" height="300"></iframe>`)
    await framing.frameLocator('iframe').getByText('The Personal Knowledge Library does not run inside other pages.').waitFor({ timeout: 30_000 })
    await framing.close()
  })
  if (problems.length) throw new Error(`Console errors:\n${problems.join('\n')}`)
  console.log('Smoke test passed.')
} finally {
  await browser.close()
}
