export type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

export type WhisperMode = 'transcriptions' | 'translations'

export type UseWhisperConfig = {
  api: '/api/whisper' | (string & {})
  autoStart?: boolean
  autoTranscribe?: boolean
  mode?: WhisperMode
  nonStop?: boolean
  removeSilence?: boolean
  stopTimeout?: number
  streaming?: boolean
  timeSlice?: number
  whisperConfig?: WhisperApiConfig
  onDataAvailable?: (blob: Blob) => void
  // onTranscribe?: (blob: Blob) => Promise<UseWhisperTranscript>
  onStartRecording?: () => void
  onStopRecording?: () => void
  onPauseRecording?: () => void
  debug?: boolean
}

export type UseWhisperTimeout = {
  stop?: NodeJS.Timeout
}

export type UseWhisperTranscript = {
  blob?: Blob
  text?: string
}

export type UseWhisperReturn = {
  recording: boolean
  speaking: boolean
  transcribing: boolean
  transcript: UseWhisperTranscript
  pauseRecording: () => Promise<void>
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
}

export type UseWhisperHook = (config?: UseWhisperConfig) => UseWhisperReturn

export type WhisperApiConfig = {
  model?: 'whisper-1' | Record<never, never>
  prompt?: string
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  temperature?: number
  language?: string
}
