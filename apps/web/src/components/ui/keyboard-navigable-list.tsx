'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useAnnounce, KeyCode } from '@/lib/accessibility'

interface KeyboardNavigableListProps<T> {
  /** Items to render in the list */
  items: T[]
  /** Unique key extractor for each item */
  getKey: (item: T) => string
  /** Render function for each item */
  renderItem: (item: T, index: number, isActive: boolean) => React.ReactNode
  /** Callback when item is selected (Enter/Space) */
  onSelect?: (item: T, index: number) => void
  /** Callback when escape is pressed */
  onEscape?: () => void
  /** Callback when active item changes */
  onActiveChange?: (index: number) => void
  /** Label for screen readers (aria-label) */
  label: string
  /** Orientation for arrow key navigation */
  orientation?: 'vertical' | 'horizontal'
  /** Whether to loop navigation */
  loop?: boolean
  /** Additional class name */
  className?: string
  /** Empty state to show when no items */
  emptyState?: React.ReactNode
  /** Item class name */
  itemClassName?: string
  /** Active item class name */
  activeItemClassName?: string
}

/**
 * Keyboard Navigable List
 *
 * A list component that supports full keyboard navigation:
 * - Arrow Up/Down: Navigate between items
 * - Home: Go to first item
 * - End: Go to last item
 * - Enter/Space: Select item
 * - Escape: Close/cancel
 *
 * Screen reader friendly with ARIA attributes and announcements.
 */
export function KeyboardNavigableList<T>({
  items,
  getKey,
  renderItem,
  onSelect,
  onEscape,
  onActiveChange,
  label,
  orientation = 'vertical',
  loop = true,
  className,
  emptyState,
  itemClassName,
  activeItemClassName = 'bg-accent text-accent-foreground',
}: KeyboardNavigableListProps<T>) {
  const [activeIndex, setActiveIndex] = React.useState(0)
  const listRef = React.useRef<HTMLUListElement>(null)
  const itemRefs = React.useRef<Map<number, HTMLLIElement>>(new Map())
  const announce = useAnnounce()

  // Reset active index when items change
  React.useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(Math.max(0, items.length - 1))
    }
  }, [items.length, activeIndex])

  // Notify parent of active change
  React.useEffect(() => {
    onActiveChange?.(activeIndex)
  }, [activeIndex, onActiveChange])

  // Scroll active item into view
  React.useEffect(() => {
    const activeItem = itemRefs.current.get(activeIndex)
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIndex])

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    if (items.length === 0) return

    const isVertical = orientation === 'vertical'
    const nextKey = isVertical ? KeyCode.ARROW_DOWN : KeyCode.ARROW_RIGHT
    const prevKey = isVertical ? KeyCode.ARROW_UP : KeyCode.ARROW_LEFT

    let nextIndex = activeIndex

    switch (event.key) {
      case nextKey:
        event.preventDefault()
        nextIndex = activeIndex + 1
        if (nextIndex >= items.length) {
          nextIndex = loop ? 0 : items.length - 1
        }
        break

      case prevKey:
        event.preventDefault()
        nextIndex = activeIndex - 1
        if (nextIndex < 0) {
          nextIndex = loop ? items.length - 1 : 0
        }
        break

      case KeyCode.HOME:
        event.preventDefault()
        nextIndex = 0
        break

      case KeyCode.END:
        event.preventDefault()
        nextIndex = items.length - 1
        break

      case KeyCode.ENTER:
      case KeyCode.SPACE:
        event.preventDefault()
        if (items[activeIndex]) {
          onSelect?.(items[activeIndex], activeIndex)
          announce(`Selected item ${activeIndex + 1} of ${items.length}`)
        }
        return

      case KeyCode.ESCAPE:
        event.preventDefault()
        onEscape?.()
        return

      default:
        return
    }

    if (nextIndex !== activeIndex) {
      setActiveIndex(nextIndex)
      announce(`Item ${nextIndex + 1} of ${items.length}`)
    }
  }, [activeIndex, items, loop, orientation, onSelect, onEscape, announce])

  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-label={label}
      aria-activedescendant={items[activeIndex] ? `item-${getKey(items[activeIndex])}` : undefined}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md',
        className
      )}
    >
      {items.map((item, index) => (
        <li
          key={getKey(item)}
          id={`item-${getKey(item)}`}
          ref={(el) => {
            if (el) {
              itemRefs.current.set(index, el)
            } else {
              itemRefs.current.delete(index)
            }
          }}
          role="option"
          aria-selected={index === activeIndex}
          tabIndex={-1}
          onClick={() => {
            setActiveIndex(index)
            onSelect?.(item, index)
          }}
          onMouseEnter={() => setActiveIndex(index)}
          className={cn(
            'cursor-pointer transition-colors',
            itemClassName,
            index === activeIndex && activeItemClassName
          )}
        >
          {renderItem(item, index, index === activeIndex)}
        </li>
      ))}
    </ul>
  )
}

/**
 * Simple card list with keyboard navigation
 */
interface KeyboardNavigableCardListProps<T> extends Omit<KeyboardNavigableListProps<T>, 'renderItem'> {
  /** Render function for card content */
  renderCard: (item: T, index: number, isActive: boolean) => React.ReactNode
}

export function KeyboardNavigableCardList<T>({
  renderCard,
  itemClassName,
  activeItemClassName,
  ...props
}: KeyboardNavigableCardListProps<T>) {
  return (
    <KeyboardNavigableList
      {...props}
      itemClassName={cn(
        'rounded-lg border p-4 mb-2 last:mb-0',
        itemClassName
      )}
      activeItemClassName={cn(
        'ring-2 ring-ring bg-accent/50',
        activeItemClassName
      )}
      renderItem={renderCard}
    />
  )
}
