import { useCallback, useEffect, useRef, useState } from 'react'

const VIDEO_MAX_BYTES = 300 * 1024 * 1024

export function formatDurationLabel(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function useVideoRecorder(opts: {
  resetKey?: string | number
  minSeconds: number
  maxSeconds: number
}) {
  const { resetKey, minSeconds, maxSeconds } = opts
  const [blob, setBlob] = useState<Blob | null>(null)
  const [duration, setDuration] = useState(0)
  const [durationUnknown, setDurationUnknown] = useState(false)
  const [recording, setRecording] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const startTime = useRef(0)
  const timerRef = useRef<number | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const canRecord = !isIOS && typeof MediaRecorder !== 'undefined'

  const reset = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setBlob(null)
    setDuration(0)
    setDurationUnknown(false)
    setRecording(false)
    setPreviewUrl(null)
    setError('')
    chunks.current = []
  }, [])

  useEffect(() => {
    reset()
  }, [resetKey, reset])

  useEffect(() => {
    previewUrlRef.current = previewUrl
  }, [previewUrl])

  const validateFileSize = (size: number) => {
    if (size > VIDEO_MAX_BYTES) {
      setError('Video file is too large. Maximum upload size is 300 MB.')
      return false
    }
    return true
  }

  const validate = (d: number, size = blob?.size ?? 0) => {
    if (!validateFileSize(size)) return false
    if (!isFinite(d) || d <= 0) {
      setDurationUnknown(true)
      setError('')
      return true
    }
    setDurationUnknown(false)
    if (d < minSeconds) {
      setError(`Too short (${formatDurationLabel(d)}). Minimum ${formatDurationLabel(minSeconds)} required.`)
      return false
    }
    if (d > maxSeconds) {
      setError(`Too long (${formatDurationLabel(d)}). Maximum ${formatDurationLabel(maxSeconds)} allowed.`)
      return false
    }
    setError('')
    return true
  }

  const handleFile = async (file: File) => {
    reset()
    if (!validateFileSize(file.size)) return
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setBlob(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    video.onloadedmetadata = () => {
      const d = video.duration
      setDuration(Number.isFinite(d) ? d : 0)
      validate(d, file.size)
    }
    video.onerror = () => {
      setDurationUnknown(true)
    }
  }

  const startRecord = async () => {
    reset()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      mediaRecorder.current = recorder
      chunks.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data)
      }
      recorder.onstop = () => {
        const recorded = new Blob(chunks.current, { type: recorder.mimeType || 'video/webm' })
        stream.getTracks().forEach((t) => t.stop())
        const url = URL.createObjectURL(recorded)
        setPreviewUrl(url)
        setBlob(recorded)
        const elapsed = Math.max(0, (Date.now() - startTime.current) / 1000)
        setDuration(elapsed)
        validate(elapsed, recorded.size)
      }
      startTime.current = Date.now()
      recorder.start()
      setRecording(true)
      timerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTime.current) / 1000
        if (elapsed >= maxSeconds) {
          if (recorder.state !== 'inactive') recorder.stop()
          setRecording(false)
          if (timerRef.current) clearInterval(timerRef.current)
        }
      }, 250)
    } catch {
      setError('Camera permission is required to record video.')
    }
  }

  const stopRecord = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (mediaRecorder.current?.state !== 'inactive') mediaRecorder.current?.stop()
    setRecording(false)
  }

  const canSubmit = Boolean(
    blob &&
      !error &&
      blob.size <= VIDEO_MAX_BYTES &&
      (durationUnknown || (duration >= minSeconds && duration <= maxSeconds)),
  )

  return {
    canRecord,
    recording,
    previewUrl,
    error,
    blob,
    duration,
    durationUnknown,
    startRecord,
    stopRecord,
    handleFile,
    reset,
    canSubmit,
    elapsed: recording ? Math.floor((Date.now() - startTime.current) / 1000) : 0,
    minSeconds,
    maxSeconds,
  }
}
