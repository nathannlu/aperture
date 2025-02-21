"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Play, Pause, RotateCcw } from "lucide-react"

interface ImagePlayerProps {
  images1: string[]
  images2: string[]
  interval?: number
}

export function ImagePlayer({ images1, images2, interval = 1000 }: ImagePlayerProps) {
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

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="flex w-full space-x-4">
        {/* Left Image */}
        <div className="relative flex-1">
          <img
            src={images1[currentIndex] || "/placeholder.svg"}
            alt={`Left Image ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain w-full"
            style={{ display: "block" }} // Ensures images don't get extra padding
          />
        </div>

        {/* Right Image */}
        <div className="relative flex-1">
          <img
            src={images2[currentIndex] || "/placeholder.svg"}
            alt={`Right Image ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain w-full"
            style={{ display: "block" }}
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Button onClick={togglePlayPause} variant="outline" size="icon">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button onClick={reset} variant="outline" size="icon">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <Slider
        min={0}
        max={maxImages - 1}
        step={1}
        value={[currentIndex]}
        onValueChange={(value) => setCurrentIndex(value[0])}
        className="w-full max-w-md"
      />

      <p className="text-sm text-gray-500">
        Image {currentIndex + 1} of {maxImages}
      </p>
    </div>
  )
}
