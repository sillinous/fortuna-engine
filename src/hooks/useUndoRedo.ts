/**
 * FORTUNA ENGINE — Undo/Redo System (Phase 2 UX Fix)
 *
 * Maintains a stack of state snapshots. Every destructive action
 * (delete, clear, bulk update) goes through this system and shows
 * an "Undo" toast. Ctrl+Z / Cmd+Z triggers global undo.
 *
 * Usage:
 *   const { execute, undo, redo, canUndo, canRedo } = useUndoRedo()
 *   execute('Deleted scenario "Max Roth"', () => removeScenario(id))
 */

import { useCallback, useRef, useEffect } from 'react'
import { useFortuna } from './useFortuna'
import { useToasts } from '../components/ToastSystem'
import type { FortunaState } from '../engine/storage'

// ─── Types ──────────────────────────────────────────────────────────

interface UndoEntry {
  description: string
  previousState: FortunaState
  timestamp: number
}

const MAX_STACK = 30

// ─── Hook ───────────────────────────────────────────────────────────

export function useUndoRedo() {
  const { state, setState } = useFortuna()
  const { addToast } = useToasts()
  const undoStack = useRef<UndoEntry[]>([])
  const redoStack = useRef<UndoEntry[]>([])

  /**
   * Execute a destructive action with undo support.
   * Captures current state before running the action.
   */
  const execute = useCallback((description: string, action: () => void, options?: { silent?: boolean }) => {
    // Capture snapshot before action
    undoStack.current = [
      ...undoStack.current.slice(-MAX_STACK + 1),
      { description, previousState: structuredClone(state), timestamp: Date.now() },
    ]
    // Clear redo stack (new action invalidates redo history)
    redoStack.current = []

    // Run the action
    action()

    // Show undo toast (unless silent)
    if (!options?.silent) {
      addToast({
        type: 'info',
        title: description,
        duration: 6000,
        actionLabel: 'Undo',
        onAction: () => performUndo(),
      })
    }
  }, [state, addToast])

  /**
   * Undo the last action.
   */
  const performUndo = useCallback(() => {
    const entry = undoStack.current.pop()
    if (!entry) return false

    // Push current state to redo stack
    redoStack.current.push({
      description: entry.description,
      previousState: structuredClone(state),
      timestamp: Date.now(),
    })

    // Restore previous state
    setState(entry.previousState)

    addToast({
      type: 'success',
      title: `Undone: ${entry.description}`,
      duration: 3000,
    })

    return true
  }, [state, setState, addToast])

  /**
   * Redo the last undone action.
   */
  const performRedo = useCallback(() => {
    const entry = redoStack.current.pop()
    if (!entry) return false

    // Push current state to undo stack
    undoStack.current.push({
      description: `Redo: ${entry.description}`,
      previousState: structuredClone(state),
      timestamp: Date.now(),
    })

    setState(entry.previousState)

    addToast({
      type: 'info',
      title: `Redone: ${entry.description}`,
      duration: 3000,
    })

    return true
  }, [state, setState, addToast])

  // Ctrl+Z / Cmd+Z / Ctrl+Shift+Z / Cmd+Shift+Z global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          performRedo()
        } else {
          performUndo()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [performUndo, performRedo])

  return {
    execute,
    undo: performUndo,
    redo: performRedo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    undoCount: undoStack.current.length,
    redoCount: redoStack.current.length,
  }
}
