import { useEffect } from 'react'
import { BRAND } from '../components/brand/brand.js'

// Pages pass titles like "Field — AgroBloom" or just "Field". The product name ends up in the tab
// title exactly once either way.
export default function useDocumentTitle(title) {
  useEffect(() => {
    if (!title || title === 'Home') {
      document.title = `${BRAND.name} — Fertilizer Planning from Your Soil Test`
    } else if (title.includes(BRAND.name)) {
      document.title = title
    } else {
      document.title = `${title} — ${BRAND.name}`
    }
  }, [title])
}
