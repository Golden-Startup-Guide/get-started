/**
 * What the app was opened to do, from its address: an app shortcut (?action=new, quick, or
 * today), a page clipped with the bookmarklet (?clip-title, clip-url, clip-text), or something
 * shared to the installed app on Android (?share-title, share-text, share-url).
 */
export type LaunchRequest =
  | { kind: 'new' | 'quick' | 'today' }
  | { kind: 'clip'; title: string; url: string; text: string }

const MAX_TEXT = 20_000

export function readLaunchRequest(search: string): LaunchRequest | undefined {
  const params = new URLSearchParams(search)
  const action = params.get('action')
  if (action === 'new' || action === 'quick' || action === 'today') return { kind: action }
  const prefix = params.has('clip-url') || params.has('clip-title') || params.has('clip-text') ? 'clip' : 'share'
  const title = params.get(`${prefix}-title`)?.trim() ?? ''
  let url = params.get(`${prefix}-url`)?.trim() ?? ''
  let text = params.get(`${prefix}-text`)?.trim() ?? ''
  // Android apps often share a link as the text.
  if (!url && /^https?:\/\/\S+$/.test(text)) {
    url = text
    text = ''
  }
  if (url && !/^https?:\/\//i.test(url)) url = ''
  if (!title && !url && !text) return undefined
  return { kind: 'clip', title, url, text: text.slice(0, MAX_TEXT) }
}

/** A clipped page as a note: a link to it, and what was selected, quoted. */
export function clipToNote(clip: Extract<LaunchRequest, { kind: 'clip' }>): { title: string; content: string } {
  const host = clip.url ? new URL(clip.url).host : ''
  const title = (clip.title || clip.text.split('\n')[0] || host || 'Clipped page').slice(0, 120).trim()
  const escapedTitle = title.replace(/([[\]])/g, '\\$1')
  const parts = [
    clip.url ? `[${escapedTitle}](<${clip.url}>)` : '',
    clip.text ? clip.text.split(/\r?\n/).map((line) => `> ${line}`.trimEnd()).join('\n') : '',
  ].filter(Boolean)
  return { title, content: parts.join('\n\n') }
}

/** The bookmarklet that clips the current page (and any selected text) into the app at `appUrl`. */
export function clipperBookmarklet(appUrl: string): string {
  const target = JSON.stringify(appUrl)
  return `javascript:(()=>{const e=encodeURIComponent,s=String(getSelection()).slice(0,4000);window.open(${target}+'?clip-title='+e(document.title)+'&clip-url='+e(location.href)+'&clip-text='+e(s),'_blank','noopener')})()`
}
