export const createLogger = (
  isDebugMode: boolean,
): Pick<Console, 'log' | 'error' | 'info'> => {
  const canConsole = isDebugMode && process.env.NODE_ENV !== 'production'

  return {
    log: (...data) => {
      if (canConsole) {
        console.log(...data)
      }
    },
    error: (...data) => {
      if (canConsole) {
        console.error(...data)
      }
    },
    info: (...data) => {
      if (canConsole) {
        console.info(...data)
      }
    },
  }
}
