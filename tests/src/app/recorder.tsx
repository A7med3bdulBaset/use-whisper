'use client'

// import { useWhisper } from '../../../dist'
import { useWhisper } from '@chengsokdara/use-whisper'

export function Recorder() {
  const {
    recording,
    transcript,
    startRecording,
    pauseRecording,
    stopRecording,
  } = useWhisper({
    apiKey: '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',
  })

  console.log(transcript.text)

  return (
    <div className="flex gap-2">
      <button onClick={startRecording}>Start</button>
      <button onClick={pauseRecording}>Pause</button>
      <button onClick={stopRecording}>Stop</button>
      <p>{recording ? 'Recording' : 'Not Recording'}</p>
      <p>{transcript.text}</p>
    </div>
  )
}
