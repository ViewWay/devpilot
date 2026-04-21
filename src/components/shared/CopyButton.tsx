import { useEffect, useState } from 'react'

type Props = {
  text: string
  label?: string
  copiedLabel?: string
  displayLabel?: string
  displayCopiedLabel?: string
  className?: string
}

export function CopyButton({
  text,
  label = 'Copy',
  copiedLabel = 'Copied',
  displayLabel,
  displayCopiedLabel,
  className = '',
}: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) { return; }
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const currentLabel = copied ? copiedLabel : label
  const buttonText = copied
    ? (displayCopiedLabel ?? copiedLabel)
    : (displayLabel ?? label)

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-label={currentLabel}
      title={currentLabel}
    >
      {buttonText}
    </button>
  )
}
