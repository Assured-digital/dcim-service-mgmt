import { useEffect } from "react"

/** Single source of truth for the product name shown in the browser tab. */
export const PRODUCT_NAME = "AD Service Mgmt"

/**
 * Sets the browser tab title to `{title} · AD Service Mgmt` (or just the
 * product name when no title is given), restoring it to the product name on
 * unmount or when the title changes.
 */
export function usePageTitle(title?: string | null) {
  useEffect(() => {
    document.title = title ? `${title} · ${PRODUCT_NAME}` : PRODUCT_NAME
    return () => {
      document.title = PRODUCT_NAME
    }
  }, [title])
}
