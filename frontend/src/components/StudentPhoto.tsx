import { useEffect, useState } from 'react'
import { User } from 'lucide-react'

type Props = {
  src?: string | null
  alt?: string
  className?: string
}

export function StudentPhoto({ src, alt = '', className = '' }: Props) {
  const [failed, setFailed] = useState(false)
  const url = String(src || '').trim()

  useEffect(() => {
    setFailed(false)
  }, [url])

  if (!url || failed) {
    return (
      <span className={`inline-flex items-center justify-center bg-slate-100 text-slate-400 ${className}`}>
        <User size={22} />
      </span>
    )
  }

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
