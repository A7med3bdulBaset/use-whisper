import type { Harker } from 'hark'
import type { Encoder } from 'lamejs'
import { useEffect, useRef, useState } from 'react'
import type { Options, RecordRTCPromisesHandler } from 'recordrtc'
import { UseWhisperHook, UseWhisperTimeout } from './types'
import { createLogger } from './utils'
import { defaultConfig, defaultTimeout, defaultTranscript } from './configs'

/**
 * React Hook for OpenAI Whisper
 */
export const useWhisper: UseWhisperHook = (config = defaultConfig) => {
  const logger = createLogger(config?.debug || true)

  const chunks = useRef<Blob[]>([])
  const encoder = useRef<Encoder>()
  const listener = useRef<Harker>()
  const recorder = useRef<RecordRTCPromisesHandler>()
  const stream = useRef<MediaStream>()
  const timeout = useRef(defaultTimeout)

  const [recording, setRecording] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState(defaultTranscript)

  /**
   * cleanup on component unmounted
   * - flush out and cleanup lamejs encoder instance
   * - destroy recordrtc instance and clear it from ref
   * - clear setTimout for onStopRecording
   * - clean up hark speaking detection listeners and clear it from ref
   * - stop all user's media steaming track and remove it from ref
   */
  useEffect(() => {
    return () => {
      if (chunks.current) {
        chunks.current = []
      }
      if (encoder.current) {
        encoder.current.flush()
        encoder.current = undefined
      }
      if (recorder.current) {
        recorder.current.destroy()
        recorder.current = undefined
      }
      onStopTimeout('stop')
      if (listener.current) {
        listener.current.stop()
      }
      if (stream.current) {
        stream.current.getTracks().forEach((track) => track.stop())
        stream.current = undefined
      }
    }
  }, [])

  /**
   * if config.autoStart is true
   * start speech recording immediately upon component mounted
   */
  useEffect(() => {
    ;(async () => {
      if (config.autoStart) {
        await onStartRecording()
      }
    })()
  }, [config.autoStart])

  /**
   * start speech recording and start listen for speaking event
   */
  const startRecording = async () => {
    config?.onStartRecording?.()
    await onStartRecording()
  }

  /**
   * pause speech recording also stop media stream
   */
  const pauseRecording = async () => {
    config?.onPauseRecording?.()
    await onPauseRecording()
  }

  /**
   * stop speech recording and start the transcription
   */
  const stopRecording = async () => {
    config?.onStopRecording?.()
    await onStopRecording()
  }

  /**
   * start speech recording event
   * - first ask user for media stream
   * - create recordrtc instance and pass media stream to it
   * - create lamejs encoder instance
   * - check recorder state and start or resume recorder accordingly
   * - start timeout for stop timeout config
   * - update recording state to true
   */
  const onStartRecording = async () => {
    try {
      if (!stream.current) {
        await onStartStreaming()
      }
      if (stream.current) {
        if (!recorder.current) {
          const {
            default: { RecordRTCPromisesHandler, StereoAudioRecorder },
          } = await import('recordrtc')
          const recorderConfig: Options = {
            mimeType: 'audio/wav',
            numberOfAudioChannels: 1, // mono
            recorderType: StereoAudioRecorder,
            sampleRate: 44100, // Sample rate = 44.1khz
            timeSlice: config.streaming ? config.timeSlice : undefined,
            type: 'audio',
            ondataavailable:
              config.autoTranscribe && config.streaming
                ? onDataAvailable
                : undefined,
          }
          recorder.current = new RecordRTCPromisesHandler(
            stream.current,
            recorderConfig,
          )
        }
        if (!encoder.current) {
          const { Mp3Encoder } = await import('lamejs')
          encoder.current = new Mp3Encoder(1, 44100, 96)
        }
        const recordState = await recorder.current.getState()
        if (recordState === 'inactive' || recordState === 'stopped') {
          await recorder.current.startRecording()
        }
        if (recordState === 'paused') {
          await recorder.current.resumeRecording()
        }
        if (config.nonStop) {
          onStartTimeout('stop')
        }
        setRecording(true)
      }
    } catch (err) {
      logger.error(err)
    }
  }

  /**
   * get user media stream event
   * - try to stop all previous media streams
   * - ask user for media stream with a system popup
   * - register hark speaking detection listeners
   */
  const onStartStreaming = async () => {
    try {
      if (stream.current) {
        stream.current.getTracks().forEach((track) => track.stop())
      }
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })
      if (!listener.current) {
        const { default: hark } = await import('hark')
        listener.current = hark(stream.current, {
          interval: 100,
          play: false,
        })
        listener.current.on('speaking', onStartSpeaking)
        listener.current.on('stopped_speaking', onStopSpeaking)
      }
    } catch (err) {
      logger.error(err)
    }
  }

  /**
   * start stop timeout event
   */
  const onStartTimeout = (type: keyof UseWhisperTimeout) => {
    if (!timeout.current[type]) {
      timeout.current[type] = setTimeout(onStopRecording, config.stopTimeout)
    }
  }

  /**
   * user start speaking event
   * - set speaking state to true
   * - clear stop timeout
   */
  const onStartSpeaking = () => {
    logger.log('start speaking')
    setSpeaking(true)
    onStopTimeout('stop')
  }

  /**
   * user stop speaking event
   * - set speaking state to false
   * - start stop timeout back
   */
  const onStopSpeaking = () => {
    logger.log('stop speaking')
    setSpeaking(false)
    if (config.nonStop) {
      onStartTimeout('stop')
    }
  }

  /**
   * pause speech recording event
   * - if recorder state is recording, pause the recorder
   * - clear stop timeout
   * - set recoriding state to false
   */
  const onPauseRecording = async () => {
    try {
      if (recorder.current) {
        const recordState = await recorder.current.getState()
        if (recordState === 'recording') {
          await recorder.current.pauseRecording()
        }
        onStopTimeout('stop')
        setRecording(false)
      }
    } catch (err) {
      logger.error(err)
    }
  }

  /**
   * stop speech recording event
   * - flush out lamejs encoder and set it to undefined
   * - if recorder state is recording or paused, stop the recorder
   * - stop user media stream
   * - clear stop timeout
   * - set recording state to false
   * - start Whisper transcription event
   * - destroy recordrtc instance and clear it from ref
   */
  const onStopRecording = async () => {
    console.log('HERE: 1')
    try {
      if (recorder.current) {
        const recordState = await recorder.current.getState()
        if (recordState === 'recording' || recordState === 'paused') {
          await recorder.current.stopRecording()
        }
        onStopStreaming()
        onStopTimeout('stop')
        setRecording(false)
        if (config.autoTranscribe) {
          console.log('HERE: 2')
          await onTranscribing()
        } else {
          console.log('HERE: 3')
          const blob = await recorder.current.getBlob()
          setTranscript({
            blob,
          })
          await onTranscribing()
        }
        await recorder.current.destroy()
        chunks.current = []
        if (encoder.current) {
          encoder.current.flush()
          encoder.current = undefined
        }
        recorder.current = undefined
      }
    } catch (err) {
      logger.error(err)
    }
  }

  /**
   * stop media stream event
   * - remove hark speaking detection listeners
   * - stop all media stream tracks
   * - clear media stream from ref
   */
  const onStopStreaming = () => {
    if (listener.current) {
      // @ts-ignore
      listener.current.off('speaking', onStartSpeaking)
      // @ts-ignore
      listener.current.off('stopped_speaking', onStopSpeaking)
      listener.current = undefined
    }
    if (stream.current) {
      stream.current.getTracks().forEach((track) => track.stop())
      stream.current = undefined
    }
  }

  /**
   * stop timeout event
   * - clear stop timeout and remove it from ref
   */
  const onStopTimeout = (type: keyof UseWhisperTimeout) => {
    if (timeout.current[type]) {
      clearTimeout(timeout.current[type])
      timeout.current[type] = undefined
    }
  }

  /**
   * start Whisper transcrition event
   * - make sure recorder state is stopped
   * - set transcribing state to true
   * - get audio blob from recordrtc
   * - if config.removeSilence is true, load ffmpeg-wasp and try to remove silence from speec
   * - if config.customServer is true, send audio data to custom server in base64 string
   * - if config.customServer is false, send audio data to Whisper api in multipart/form-data
   * - set transcript object with audio blob and transcription result from Whisper
   * - set transcribing state to false
   */
  const onTranscribing = async () => {
    logger.log('transcribing speech')
    try {
      if (encoder.current && recorder.current) {
        const recordState = await recorder.current.getState()
        if (recordState === 'stopped') {
          setTranscribing(true)
          const blob = await recorder.current.getBlob()
          await callApi(blob)

          // if (config.removeSilence) {
          //   const { createFFmpeg } = await import('@ffmpeg/ffmpeg')
          //   const ffmpeg = createFFmpeg({
          //     mainName: 'main',
          //     corePath: ffmpegCoreUrl,
          //     log: true,
          //   })
          //   if (!ffmpeg.isLoaded()) {
          //     await ffmpeg.load()
          //   }
          //   const buffer = await blob.arrayBuffer()
          //   logger.log({ in: buffer.byteLength })
          //   ffmpeg.FS('writeFile', 'in.wav', new Uint8Array(buffer))
          //   await ffmpeg.run(
          //     '-i', // Input
          //     'in.wav',
          //     '-acodec', // Audio codec
          //     'libmp3lame',
          //     '-b:a', // Audio bitrate
          //     '96k',
          //     '-ar', // Audio sample rate
          //     '44100',
          //     '-af', // Audio filter = remove silence from start to end with 2 seconds in between
          //     silenceRemoveCommand,
          //     'out.mp3', // Output
          //   )
          //   const out = ffmpeg.FS('readFile', 'out.mp3')
          //   logger.log({ out: out.buffer.byteLength })
          //   // 225 seems to be empty mp3 file
          //   if (out.length <= 225) {
          //     ffmpeg.exit()
          //     setTranscript({
          //       blob,
          //     })
          //     setTranscribing(false)
          //     return
          //   }
          //   blob = new Blob([out.buffer], { type: 'audio/mpeg' })
          //   ffmpeg.exit()
          // } else {
          //   const buffer = await blob.arrayBuffer()
          //   logger.log({ wav: buffer.byteLength })
          //   const mp3 = encoder.current.encodeBuffer(new Int16Array(buffer))
          //   blob = new Blob([mp3], { type: 'audio/mpeg' })
          //   logger.log({ blob, mp3: mp3.byteLength })
          // }
          // if (typeof config.onTranscribe === 'function') {
          //   const transcribed = await config.onTranscribe(blob)
          //   logger.log('onTranscribe', transcribed)
          //   setTranscript(transcribed)
          // } else {
          //   const file = new File([blob], 'speech.mp3', { type: 'audio/mpeg' })
          //   const text = await callApi(file)
          //   logger.log('onTranscribing', { text })
          //   setTranscript({
          //     blob,
          //     text,
          //   })
          // }
        }
      }
    } catch (err) {
      logger.info(err)
    } finally {
      setTranscribing(false)
    }
  }

  /**
   * Get audio data in chunk based on timeSlice
   * - while recording send audio chunk to Whisper
   * - chunks are concatenated in succession
   * - set transcript text with interim result
   */
  const onDataAvailable = async (data: Blob) => {
    logger.log('onDataAvailable', data)
    try {
      if (config.streaming && recorder.current) {
        config.onDataAvailable?.(data)
        if (encoder.current) {
          const buffer = await data.arrayBuffer()
          const mp3chunk = encoder.current.encodeBuffer(new Int16Array(buffer))
          const mp3blob = new Blob([mp3chunk], { type: 'audio/mpeg' })
          chunks.current.push(mp3blob)
        }
        const recorderState = await recorder.current.getState()
        if (recorderState === 'recording') {
          const blob = new Blob(chunks.current, {
            type: 'audio/mpeg',
          })
          const file = new File([blob], 'speech.mp3', {
            type: 'audio/mpeg',
          })
          const text = await callApi(file)
          logger.log('onInterim', { text })
          if (text) {
            setTranscript((prev) => ({ ...prev, text }))
          }
        }
      }
    } catch (err) {
      logger.error(err)
    }
  }

  async function callApi(blob: Blob) {
    console.log("CALLING THE API")
    const body = new FormData()
    body.append('blob', blob)
    body.append('removeSilence', config?.removeSilence ? 'true' : 'false')
    body.append('debug', config?.debug ? 'true' : 'false')
    body.append('mode', config.mode ?? 'transcriptions')

    const res = await fetch(config.api as string, {
      method: 'POST',
      body,
    })
    const { text } = (await res.json()) as { text: string }
    return text
  }

  return {
    recording,
    speaking,
    transcribing,
    transcript,
    pauseRecording,
    startRecording,
    stopRecording,
  }
}
