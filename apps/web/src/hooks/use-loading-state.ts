import { useState, useCallback, useMemo } from 'react'

interface LoadingState {
  [key: string]: boolean
}

interface UseLoadingStateReturn {
  /** Check if a specific key is loading */
  isLoading: (key: string) => boolean
  /** Check if any key is loading */
  isAnyLoading: boolean
  /** Set loading state for a key */
  setLoading: (key: string, loading: boolean) => void
  /** Start loading for a key */
  startLoading: (key: string) => void
  /** Stop loading for a key */
  stopLoading: (key: string) => void
  /** Wrap an async function with loading state */
  withLoading: <T>(key: string, fn: () => Promise<T>) => Promise<T>
  /** Get all loading keys */
  loadingKeys: string[]
}

/**
 * Hook for managing multiple loading states
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isLoading, withLoading } = useLoadingState()
 *
 *   const handleSave = async () => {
 *     await withLoading('save', async () => {
 *       await saveData()
 *     })
 *   }
 *
 *   const handleDelete = async () => {
 *     await withLoading('delete', async () => {
 *       await deleteItem()
 *     })
 *   }
 *
 *   return (
 *     <>
 *       <Button disabled={isLoading('save')} onClick={handleSave}>
 *         {isLoading('save') ? 'Saving...' : 'Save'}
 *       </Button>
 *       <Button disabled={isLoading('delete')} onClick={handleDelete}>
 *         {isLoading('delete') ? 'Deleting...' : 'Delete'}
 *       </Button>
 *     </>
 *   )
 * }
 * ```
 */
export function useLoadingState(initialState: LoadingState = {}): UseLoadingStateReturn {
  const [state, setState] = useState<LoadingState>(initialState)

  const isLoading = useCallback((key: string) => !!state[key], [state])

  const isAnyLoading = useMemo(() => Object.values(state).some(Boolean), [state])

  const loadingKeys = useMemo(
    () => Object.entries(state).filter(([, v]) => v).map(([k]) => k),
    [state]
  )

  const setLoading = useCallback((key: string, loading: boolean) => {
    setState((prev) => {
      if (prev[key] === loading) return prev
      if (!loading) {
        const { [key]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: loading }
    })
  }, [])

  const startLoading = useCallback((key: string) => setLoading(key, true), [setLoading])
  const stopLoading = useCallback((key: string) => setLoading(key, false), [setLoading])

  const withLoading = useCallback(
    async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
      startLoading(key)
      try {
        return await fn()
      } finally {
        stopLoading(key)
      }
    },
    [startLoading, stopLoading]
  )

  return {
    isLoading,
    isAnyLoading,
    setLoading,
    startLoading,
    stopLoading,
    withLoading,
    loadingKeys,
  }
}

interface UseAsyncReturn<T> {
  data: T | null
  error: Error | null
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  execute: (...args: unknown[]) => Promise<T | null>
  reset: () => void
}

/**
 * Hook for managing a single async operation state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { data, isLoading, error, execute } = useAsync(async () => {
 *     return await fetchData()
 *   })
 *
 *   return (
 *     <Button onClick={() => execute()} disabled={isLoading}>
 *       {isLoading ? 'Loading...' : 'Fetch Data'}
 *     </Button>
 *   )
 * }
 * ```
 */
export function useAsync<T>(
  asyncFn: (...args: unknown[]) => Promise<T>
): UseAsyncReturn<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const execute = useCallback(
    async (...args: unknown[]): Promise<T | null> => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await asyncFn(...args)
        setData(result)
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setError(error)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [asyncFn]
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setIsLoading(false)
  }, [])

  return {
    data,
    error,
    isLoading,
    isSuccess: !!data && !error,
    isError: !!error,
    execute,
    reset,
  }
}

/**
 * Hook for debounced loading state (prevents flickering for fast operations)
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isLoading, startLoading, stopLoading } = useDebouncedLoading(200)
 *
 *   const handleClick = async () => {
 *     startLoading()
 *     await doSomething()
 *     stopLoading()
 *   }
 *
 *   // Loading will only show if operation takes > 200ms
 *   return <Spinner visible={isLoading} />
 * }
 * ```
 */
export function useDebouncedLoading(delay = 200) {
  const [isLoading, setIsLoading] = useState(false)
  const [actuallyLoading, setActuallyLoading] = useState(false)
  const timeoutRef = useState<NodeJS.Timeout | null>(null)

  const startLoading = useCallback(() => {
    setActuallyLoading(true)
    const timeout = setTimeout(() => {
      setIsLoading(true)
    }, delay)
    timeoutRef[1](timeout)
  }, [delay, timeoutRef])

  const stopLoading = useCallback(() => {
    setActuallyLoading(false)
    if (timeoutRef[0]) {
      clearTimeout(timeoutRef[0])
      timeoutRef[1](null)
    }
    setIsLoading(false)
  }, [timeoutRef])

  return {
    isLoading,
    actuallyLoading,
    startLoading,
    stopLoading,
  }
}
