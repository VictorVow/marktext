import dragula from 'dragula'
import { useEditorStore } from '@/store/editor'

// Pointer travel, in CSS pixels, that separates a click from a tab drag.
// Matches the platform drag thresholds (Blink 3px, Win32 SM_CXDRAG 4px) with a
// little slack for trackpad drift.
const DRAG_THRESHOLD_PX = 5

// Makes the `[data-id]` children of `container` drag-reorderable, writing the
// new order back to the editor store's tab list. Shared by the tab bar and the
// sidebar's opened-files list so both reorder the same `tabs` array.
export const createTabReorderDrake = (
  container: HTMLElement,
  direction: 'horizontal' | 'vertical'
): dragula.Drake => {
  const editorStore = useEditorStore()

  return dragula([container], {
    direction,
    revertOnSpill: true,
    mirrorContainer: container,
    ignoreInputTextSelection: false,
    // dragula's own default is 0, i.e. a single pixel of pointer drift between
    // press and release turns a click into a drag. The drag then swallows the
    // `click` entirely — its mirror element takes the mouseup and is removed
    // before the browser can retarget — so the click handler never runs and the
    // tab refuses to activate (#4895). Require a deliberate movement instead.
    slideFactorX: DRAG_THRESHOLD_PX,
    slideFactorY: DRAG_THRESHOLD_PX
  }).on('drop', (el, _target, _source, sibling) => {
    const droppedId = el?.getAttribute('data-id')
    // This should be the next item (item | ... | el | sibling | item | ...) but
    // may be the mirror image or null (item | ... | el | sibling or null) if last.
    const nextTabId = sibling ? sibling.getAttribute('data-id') : null
    const isLastTab = !sibling || sibling.classList.contains('gu-mirror')
    if (!droppedId || (sibling && !nextTabId)) {
      console.error('Tab reorder error: invalid tab IDs')
      return
    }

    editorStore.EXCHANGE_TABS_BY_ID({
      fromId: droppedId,
      toId: isLastTab ? null : nextTabId
    })
  })
}
