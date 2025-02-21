import { useState, useEffect } from "react"

export function useImagePlayer(images1: string[], images2: string[], interval = 1000) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  const maxImages = Math.min(images1.length, images2.length) // Ensure both arrays are synchronized

  useEffect(() => {
    let timer: NodeJS.Timeout
    let startTime: number

    const updateProgress = () => {
      const elapsedTime = Date.now() - startTime
      setProgress((elapsedTime / interval) * 100)
    }

    if (isPlaying && maxImages > 0) {
      startTime = Date.now()
      timer = setInterval(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % maxImages)
        setProgress(0)
        startTime = Date.now()
      }, interval)

      const progressTimer = setInterval(updateProgress, 16) // ~60fps

      return () => {
        clearInterval(timer)
        clearInterval(progressTimer)
      }
    }
  }, [isPlaying, interval, maxImages])

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying)
  }

  const reset = () => {
    setIsPlaying(false)
    setCurrentIndex(0)
    setProgress(0)
  }

  return {
    currentIndex,
    isPlaying,
    progress,
    togglePlayPause,
    reset,
    setCurrentIndex,
    maxImages,
  }
}
