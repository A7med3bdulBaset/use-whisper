import { Mp3Encoder } from 'lamejs'
import {
  ffmpegCoreUrl,
  silenceRemoveCommand,
  whisperApiEndpoint,
} from './configs'
import { createLogger } from './utils'
import { WhisperApiConfig, WhisperMode } from './types'
import { NextResponse } from 'next/server'

interface Props {
  apiKey: string
  whisperConfig?: WhisperApiConfig
}

export function createRouteHandler(props: Props) {
  return async (request: Request) => {
    const formData = await request.formData()

    const config = {
      removeSilence: formData.get('removeSilence') === 'true',
      debug: formData.get('debug') === 'true',
      mode: formData.get('mode') as WhisperMode,
    }

    const logger = createLogger(config.debug)
    const encoder = new Mp3Encoder(1, 44100, 96)

    let blob = formData.get('blob') as Blob | null

    if (!blob) {
      throw new Error('No Blob recieved')
    }

    if (config.removeSilence) {
      const { createFFmpeg } = await import('@ffmpeg/ffmpeg')
      const ffmpeg = createFFmpeg({
        mainName: 'main',
        corePath: ffmpegCoreUrl,
        log: config.debug,
      })
      if (!ffmpeg.isLoaded()) {
        await ffmpeg.load()
      }
      const buffer = await blob.arrayBuffer()
      logger.log({ in: buffer.byteLength })
      ffmpeg.FS('writeFile', 'in.wav', new Uint8Array(buffer))
      await ffmpeg.run(
        '-i', // Input
        'in.wav',
        '-acodec', // Audio codec
        'libmp3lame',
        '-b:a', // Audio bitrate
        '96k',
        '-ar', // Audio sample rate
        '44100',
        '-af', // Audio filter = remove silence from start to end with 2 seconds in between
        silenceRemoveCommand,
        'out.mp3', // Output
      )
      const out = ffmpeg.FS('readFile', 'out.mp3')
      logger.log({ out: out.buffer.byteLength })
      // 225 seems to be empty mp3 file
      if (out.length <= 225) {
        ffmpeg.exit()
        // setTranscript({
        //   blob,
        // })
        // setTranscribing(false)
        return
      }
      blob = new Blob([out.buffer], { type: 'audio/mpeg' })
      ffmpeg.exit()
    } else {
      const buffer = await blob.arrayBuffer()
      logger.log({ wav: buffer.byteLength })
      const mp3 = encoder.encodeBuffer(new Int16Array(buffer))
      blob = new Blob([mp3], { type: 'audio/mpeg' })
      logger.log({ blob, mp3: mp3.byteLength })
    }

    const file = new File([blob], 'speech.mp3', { type: 'audio/mpeg' })
    const text = await onWhispered(file, {
      apiKey: props.apiKey,
      mode: config.mode,
      whisperConfig: props.whisperConfig,
    })
    logger.log('onTranscribing', { text })
    // setTranscript({
    //   blob,
    //   text,
    // })

   return NextResponse.json({ text })
  }
}

async function onWhispered(
  file: File,
  config: {
    mode: WhisperMode
    apiKey: string
    whisperConfig?: WhisperApiConfig
  },
) {
  // Whisper only accept multipart/form-data currently
  const body = new FormData()
  body.append('file', file)
  body.append('model', 'whisper-1')
  if (config.mode === 'transcriptions') {
    body.append('language', config.whisperConfig?.language ?? 'en')
  }

  if (config.whisperConfig?.prompt) {
    body.append('prompt', config.whisperConfig.prompt)
  }
  if (config.whisperConfig?.response_format) {
    body.append('response_format', config.whisperConfig.response_format)
  }
  if (config.whisperConfig?.temperature) {
    body.append('temperature', `${config.whisperConfig.temperature}`)
  }
  const headers: Record<string, string> = {
    'Content-Type': 'multipart/form-data',
    Authorization: `Bearer ${config.apiKey}`,
  }

  const res = await fetch(whisperApiEndpoint + config.mode, {
    method: 'POST',
    body,
    headers,
  })
  const data = await res.json()
  return data.text as string
}
