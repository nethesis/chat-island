import { useState } from 'react'
import { Button, Icon } from './Button'
import { t } from '../i18n'

/** A link that works as a password: monospaced, selectable at once, copied from inside the field. */
export function SecretLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => navigator.clipboard?.writeText(link).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1500))).catch(() => {})
  return (
    <div className="ci-flex-1 ci-min-w-0 ci-h-10 ci-flex ci-items-center ci-gap-1 ci-pl-4 ci-pr-1 ci-rounded-full ci-bg-elevationL2 dark:ci-bg-elevationL2Dark ci-border ci-border-solid ci-border-gray-300 dark:ci-border-gray-600">
      <code className="ci-flex-1 ci-min-w-0 ci-truncate ci-select-all ci-font-mono ci-text-xs ci-text-gray-700 dark:ci-text-gray-200" title={link}>
        {link}
      </code>
      <Button variant="small" onClick={copy} aria-label={t('Group.Copy')} title={copied ? t('Group.Copied') : t('Group.Copy')}>
        {copied ? Icon.check : Icon.copy}
      </Button>
    </div>
  )
}
