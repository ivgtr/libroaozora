/** A task's creator retains its I/O context until the result AND cleanup settle. */
export type TaskLifetime = { waitUntil(promise: Promise<unknown>): void }
export type SharedTask<T> = {
  promise: Promise<T>
  expiresAt: number
  expire(): void
}

export function liveTask<T>(task: SharedTask<T> | undefined): SharedTask<T> | undefined {
  if (task && Date.now() >= task.expiresAt) {
    task.expire()
    return undefined
  }
  return task
}

export function retainTask<T>(task: SharedTask<T>, lifetime?: TaskLifetime): Promise<T> {
  // Expected acquisition errors are delivered to the response, not reported as
  // unhandled waitUntil rejections. Each joining request may retain it as well.
  lifetime?.waitUntil(task.promise.then(() => {}, () => {}))
  return task.promise
}

export function startTask<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
  timeout: () => Error,
  cleanup: (task: SharedTask<T>) => void,
): SharedTask<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectDeadline!: (reason: unknown) => void
  const task: SharedTask<T> = {
    expiresAt: Date.now() + milliseconds,
    expire() {
      if (controller.signal.aborted) return
      const error = timeout()
      controller.abort(error)
      rejectDeadline(error)
      // Also reclaim synchronously when a new request observes an expired entry.
      // This works even if the creator's timer/finally never ran.
      cleanup(task)
    },
    promise: undefined!,
  }
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject
    timer = setTimeout(() => task.expire(), milliseconds)
  })
  task.promise = Promise.race([
    Promise.resolve().then(() => { controller.signal.throwIfAborted(); return operation(controller.signal) }),
    deadline,
  ]).finally(() => { clearTimeout(timer); cleanup(task) })
  return task
}
