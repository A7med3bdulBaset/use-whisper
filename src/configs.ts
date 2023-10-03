import {
  UseWhisperConfig,
  UseWhisperTimeout,
  UseWhisperTranscript,
} from './types'

const defaultStopTimeout = 5_000

export const ffmpegCoreUrl =
  'https://unpkg.com/@ffmpeg/core-st@0.11.1/dist/ffmpeg-core.js'

export const silenceRemoveCommand =
  'silenceremove=start_periods=1:stop_periods=-1:start_threshold=-30dB:stop_threshold=-30dB:start_silence=2:stop_silence=2'

export const whisperApiEndpoint = 'https://api.openai.com/v1/audio/'

export const defaultConfig: Required<UseWhisperConfig> = {
  api: '/api/whisper',
  autoStart: false,
  autoTranscribe: true,
  mode: 'transcriptions',
  nonStop: false,
  removeSilence: false,
  stopTimeout: defaultStopTimeout,
  streaming: false,
  timeSlice: 1_000,
  onDataAvailable: () => {},
  debug: true,
  onStartRecording: () => {},
  onPauseRecording: () => {},
  onStopRecording: () => {},
  whisperConfig: {
    language: 'en',
    model: 'whisper-1',
    prompt: '',
    response_format: 'json',
    temperature: 0.9,
  },
}

/**
 * default timeout for recorder
 */
export const defaultTimeout: UseWhisperTimeout = {
  stop: undefined,
}

/**
 * default transcript object
 */
export const defaultTranscript: UseWhisperTranscript = {
  blob: undefined,
  text: undefined,
}
