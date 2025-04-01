"use client"

import * as React from "react"
import { ChevronRight, Eye, Lock, Play, Plus, Square, Timer, GripHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image"

interface Layer {
  id: string
  name: string
  start: number // in frames
  duration: number // in frames
  visible: boolean
  locked: boolean
  type: "effect" | "adjustment" | "video"
}

const FPS = 30
const TOTAL_FRAMES = 300 // 10 seconds in frames

export default function Timeline() {
  const [currentFrame, setCurrentFrame] = React.useState(0)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [newLayerName, setNewLayerName] = React.useState("")
  const [layers, setLayers] = React.useState<Layer[]>([
    {
      id: "1",
      name: "Color Correction",
      start: 0,
      duration: 150,
      visible: true,
      locked: false,
      type: "effect",
    },
    {
      id: "2",
      name: "Blur Effect",
      start: 30,
      duration: 90,
      visible: true,
      locked: false,
      type: "effect",
    },
  ])

  const timelineRef = React.useRef<HTMLDivElement>(null)
  const [dragData, setDragData] = React.useState<{
    layerId: string
    type: "move" | "resize-start" | "resize-end" | null
    initialX: number
    initialStart: number
    initialDuration: number
  } | null>(null)

  // Playback control
  React.useEffect(() => {
    let animationFrame: number

    const animate = () => {
      if (isPlaying) {
        setCurrentFrame((prev) => {
          if (prev >= TOTAL_FRAMES - 1) {
            setIsPlaying(false)
            return 0
          }
          return prev + 1
        })
        animationFrame = requestAnimationFrame(animate)
      }
    }

    if (isPlaying) {
      animationFrame = requestAnimationFrame(animate)
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame)
      }
    }
  }, [isPlaying])

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }

  const toggleLayerVisibility = (layerId: string) => {
    setLayers(layers.map((layer) => (layer.id === layerId ? { ...layer, visible: !layer.visible } : layer)))
  }

  const toggleLayerLock = (layerId: string) => {
    setLayers(layers.map((layer) => (layer.id === layerId ? { ...layer, locked: !layer.locked } : layer)))
  }

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current || dragData) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = x / rect.width
    const frame = Math.floor(percentage * TOTAL_FRAMES)
    setCurrentFrame(Math.max(0, Math.min(frame, TOTAL_FRAMES - 1)))
    if (isPlaying) setIsPlaying(false)
  }

  const addNewLayer = () => {
    if (!newLayerName) return

    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: newLayerName,
      start: 0,
      duration: 90,
      visible: true,
      locked: false,
      type: "effect",
    }

    setLayers([...layers, newLayer])
    setNewLayerName("")
  }

  const handleDragStart = (e: React.MouseEvent, layerId: string, type: "move" | "resize-start" | "resize-end") => {
    if (!timelineRef.current) return
    e.stopPropagation()

    const layer = layers.find((l) => l.id === layerId)
    if (!layer || layer.locked) return

    const rect = timelineRef.current.getBoundingClientRect()
    setDragData({
      layerId,
      type,
      initialX: e.clientX,
      initialStart: layer.start,
      initialDuration: layer.duration,
    })
  }

  const handleDragMove = React.useCallback(
    (e: React.MouseEvent) => {
      if (!dragData || !timelineRef.current) return

      const rect = timelineRef.current.getBoundingClientRect()
      const deltaX = e.clientX - dragData.initialX
      const framesDelta = Math.round((deltaX / rect.width) * TOTAL_FRAMES)

      setLayers(
        layers.map((layer) => {
          if (layer.id !== dragData.layerId) return layer

          if (dragData.type === "move") {
            const newStart = Math.max(0, Math.min(TOTAL_FRAMES - layer.duration, dragData.initialStart + framesDelta))
            return { ...layer, start: newStart }
          } else if (dragData.type === "resize-start") {
            const newStart = Math.max(
              0,
              Math.min(dragData.initialStart + dragData.initialDuration - 1, dragData.initialStart + framesDelta),
            )
            const newDuration = dragData.initialStart + dragData.initialDuration - newStart
            return { ...layer, start: newStart, duration: newDuration }
          } else if (dragData.type === "resize-end") {
            const newDuration = Math.max(
              1,
              Math.min(TOTAL_FRAMES - layer.start, dragData.initialDuration + framesDelta),
            )
            return { ...layer, duration: newDuration }
          }
          return layer
        }),
      )
    },
    [dragData, layers],
  )

  const handleDragEnd = React.useCallback(() => {
    setDragData(null)
  }, [])

  React.useEffect(() => {
    if (dragData) {
      const handleMouseMove = (e: MouseEvent) => handleDragMove(e as unknown as React.MouseEvent)
      const handleMouseUp = () => handleDragEnd()

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)

      return () => {
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [dragData, handleDragMove, handleDragEnd])

  return (
    <div className="flex h-screen flex-col bg-zinc-900 text-white">
      {/* Preview area */}
      <div className="flex-1 border-b border-zinc-700 p-4">
        <div className="relative h-full rounded-lg border border-zinc-700 bg-zinc-800">
          <Image
            src={`/placeholder.svg?frame=${currentFrame}`}
            alt={`Frame ${currentFrame}`}
            fill
            className="object-contain"
          />
          <div className="absolute bottom-4 left-4 rounded bg-black/50 px-2 py-1 text-sm">Frame: {currentFrame}</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="h-64 flex flex-col">
        {/* Timeline controls */}
        <div className="flex items-center gap-2 border-b border-zinc-700 p-2">
          <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400 hover:text-white" onClick={togglePlay}>
            {isPlaying ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Timer className="h-4 w-4" />
            <span>Frame: {currentFrame}</span>
          </div>
        </div>

        {/* Timeline content */}
        <div className="flex flex-1">
          {/* Layers sidebar */}
          <div className="w-48 border-r border-zinc-700 bg-zinc-800">
            <div className="flex items-center justify-between p-2 text-sm font-medium">
              <span>Layers</span>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-zinc-400 hover:text-white">
                    <Plus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Layer</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="name">Layer name</Label>
                      <Input
                        id="name"
                        value={newLayerName}
                        onChange={(e) => setNewLayerName(e.target.value)}
                        placeholder="Enter layer name"
                      />
                    </div>
                  </div>
                  <Button onClick={addNewLayer}>Add Layer</Button>
                </DialogContent>
              </Dialog>
            </div>
            <div className="space-y-1 p-1">
              {layers.map((layer) => (
                <div key={layer.id} className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-zinc-700/50">
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-zinc-400 hover:text-white"
                    onClick={() => toggleLayerVisibility(layer.id)}
                  >
                    <Eye className={cn("h-4 w-4", !layer.visible && "text-zinc-600")} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-zinc-400 hover:text-white"
                    onClick={() => toggleLayerLock(layer.id)}
                  >
                    <Lock className={cn("h-4 w-4", layer.locked && "text-yellow-500")} />
                  </Button>
                  <span className="text-sm">{layer.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline tracks */}
          <div className="relative flex-1 bg-zinc-900" ref={timelineRef}>
            {/* Time ruler */}
            <div className="sticky top-0 h-6 border-b border-zinc-700 bg-zinc-800">
              <div className="flex h-full">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 border-r border-zinc-700 px-1 text-xs text-zinc-500 cursor-pointer hover:bg-zinc-700/30"
                    onClick={() => setCurrentFrame(i * 30)}
                  >
                    {i * 30}f
                  </div>
                ))}
              </div>
            </div>

            {/* Tracks */}
            <div className="relative" onClick={handleTimelineClick}>
              {layers.map((layer) => (
                <div key={layer.id} className="group relative h-8 border-b border-zinc-700/50 hover:bg-zinc-800/50">
                  {/* Layer clip */}
                  <div
                    className={cn(
                      "absolute top-1 h-6 rounded bg-blue-500/20 border border-blue-500/30",
                      !layer.visible && "opacity-50",
                      layer.locked ? "cursor-not-allowed" : "cursor-move",
                    )}
                    style={{
                      left: `${(layer.start / TOTAL_FRAMES) * 100}%`,
                      width: `${(layer.duration / TOTAL_FRAMES) * 100}%`,
                    }}
                    onMouseDown={(e) => handleDragStart(e, layer.id, "move")}
                  >
                    <div className="flex h-full items-center px-2 gap-2">
                      <GripHorizontal className="h-3 w-3 text-blue-200/50" />
                      <span className="text-xs font-medium text-blue-200">{layer.name}</span>
                    </div>

                    {/* Resize handles */}
                    {!layer.locked && (
                      <>
                        <div
                          className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-400"
                          onMouseDown={(e) => handleDragStart(e, layer.id, "resize-start")}
                        />
                        <div
                          className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-400"
                          onMouseDown={(e) => handleDragStart(e, layer.id, "resize-end")}
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-red-500"
                style={{ left: `${(currentFrame / TOTAL_FRAMES) * 100}%` }}
              />
            </div>

          </div>
        </div>

        {/* Timeline zoom/scroll */}
        <div className="border-t border-zinc-700 p-2">
          <Slider defaultValue={[50]} max={100} step={1} className="w-32" />
        </div>
      </div>
    </div>
  )
}


