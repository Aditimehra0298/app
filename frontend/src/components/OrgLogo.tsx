import { useApp } from '../context/AppContext'

const FALLBACK = '/static/images/sft-logo-full.png?v=5'

type Props = {
  className?: string
  alt?: string
}

export function OrgLogo({ className, alt = '' }: Props) {
  const { config } = useApp()
  return <img src={config?.logoUrl || FALLBACK} alt={alt} className={className} />
}
