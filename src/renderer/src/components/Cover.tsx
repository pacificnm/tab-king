import { useState } from 'react'
import { libraryUrl } from '@shared/types'

interface Props {
  /** Library-relative path, a full URL/data URL, or null for the placeholder. */
  src: string | null
  size: number
  className?: string
}

/** Album art with a placeholder when there is none or the file is missing (LIB-5, LIB-8). */
export function Cover({ src, size, className = '' }: Props): React.JSX.Element {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = failedSrc === src
  const url = src && /^(data:|blob:|tabking:)/.test(src) ? src : src ? libraryUrl(src) : null
  const box = { width: size, height: size }
  if (!url || failed) {
    return (
      <div
        role="img"
        aria-label="No cover art"
        style={box}
        className={`flex shrink-0 items-center justify-center rounded bg-surface-2 text-fg-muted ${className}`}
      >
        <svg
          viewBox="0 0 24 24"
          width={size * 0.5}
          height={size * 0.5}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
        </svg>
      </div>
    )
  }
  return (
    <img
      src={url}
      alt=""
      style={box}
      loading="lazy"
      draggable={false}
      className={`shrink-0 rounded object-cover ${className}`}
      onError={() => setFailedSrc(src)}
    />
  )
}
