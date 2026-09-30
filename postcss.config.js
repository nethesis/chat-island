import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

/**
 * Tailwind's base layer sets its --tw-* variables on every element of the page
 * (`*, ::before, ::after` and `::backdrop`), even with preflight off: inside the
 * CTI that would reset the host's own rings and shadows. Keep them inside the island.
 */
const scopeBase = () => ({
  postcssPlugin: 'chat-island-scope-base',
  OnceExit(root) {
    root.walkRules((rule) => {
      const sel = rule.selector.replace(/\s+/g, ' ').trim()
      if (sel === '*, ::before, ::after' || sel === '*,::before,::after') rule.selector = '.chat-island-root, .chat-island-root *, .chat-island-root ::before, .chat-island-root ::after'
      else if (sel === '::backdrop') rule.selector = '.chat-island-root ::backdrop'
    })
  },
})
scopeBase.postcss = true

export default { plugins: [tailwindcss, autoprefixer, scopeBase] }
