import { z } from 'zod'
import type { UpdateCheck } from '@shared/types'
import { compareSemver, parseSemver } from './semver'

export const RELEASES_URL = 'https://api.github.com/repos/pacificnm/tab-king/releases/latest'
const RELEASE_PAGE_PREFIX = 'https://github.com/pacificnm/tab-king/'

const ReleaseSchema = z.object({ tag_name: z.string().max(100), html_url: z.string().max(500) })

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/**
 * ABT-2: ask GitHub for the latest release and compare it with the running version. Only called when the user clicks
 * "Check for updates". Throws an Error with a message fit for display.
 */
export async function checkForUpdates(
  current: string,
  fetchFn: FetchLike,
  url = RELEASES_URL,
  timeoutMs = 10_000
): Promise<UpdateCheck> {
  const have = parseSemver(current)
  if (!have) throw new Error(`This build has an unrecognised version (${current}).`)
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchFn(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Tab-King-update-check' },
      signal: AbortSignal.timeout(timeoutMs)
    })
  } catch {
    throw new Error("Couldn't reach GitHub. Check your internet connection and try again.")
  }
  if (res.status === 404) throw new Error('No releases have been published yet.')
  if (res.status === 403 || res.status === 429)
    throw new Error('GitHub is limiting requests right now. Try again in a while.')
  if (!res.ok) throw new Error(`GitHub answered with an error (${res.status}).`)
  const parsed = ReleaseSchema.safeParse(await res.json().catch(() => null))
  const latest = parsed.success ? parseSemver(parsed.data.tag_name) : null
  if (!parsed.success || !latest) throw new Error("GitHub's answer wasn't understood.")
  const page = parsed.data.html_url.startsWith(RELEASE_PAGE_PREFIX)
    ? parsed.data.html_url
    : `${RELEASE_PAGE_PREFIX}releases/latest`
  const text = `${latest.major}.${latest.minor}.${latest.patch}${latest.pre.length ? `-${latest.pre.join('.')}` : ''}`
  return {
    status: compareSemver(latest, have) > 0 ? 'available' : 'up-to-date',
    current,
    latest: text,
    url: page
  }
}
