import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

type CommandItem = {
  title: string
  icon?: React.ReactNode
}

type CommandListProps = {
  items: CommandItem[]
  command: (item: CommandItem) => void
}

type KeyDownPayload = { event: KeyboardEvent }
type CommandListRef = { onKeyDown: (payload: KeyDownPayload) => boolean }

export const CommandList = forwardRef<CommandListRef, CommandListProps>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) {
      props.command(item)
    }
  }

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: KeyDownPayload) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }
      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }
      if (event.key === 'Enter') {
        enterHandler()
        return true
      }
      return false
    },
  }))

  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-lg shadow-xl overflow-hidden py-1 w-64 z-50">
      {props.items.length ? (
        props.items.map((item, index: number) => (
          <button
            className={`flex items-center gap-3 w-full text-left px-4 py-2 text-sm ${
              index === selectedIndex ? 'bg-[var(--accent)] text-[var(--bg-950)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-800)]'
            }`}
            key={index}
            onClick={() => selectItem(index)}
          >
            {item.icon && <span className="w-4 h-4">{item.icon}</span>}
            <span className="font-medium">{item.title}</span>
          </button>
        ))
      ) : (
        <div className="px-4 py-2 text-sm text-[var(--text-muted)]">No results</div>
      )}
    </div>
  )
})

CommandList.displayName = 'CommandList'
