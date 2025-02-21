"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Rectangle {
  id: number
  x: number
  y: number
  width: number
  height: number
  label: string
}

export function BoundingBoxLabeler() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [rectangles, setRectangles] = useState<Rectangle[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null)
  const [selectedRectangle, setSelectedRectangle] = useState<Rectangle | null>(null)
  const [labelText, setLabelText] = useState("")

  useEffect(() => {
    drawRectangles()
  }, [selectedRectangle]) // Updated dependency

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [selectedRectangle])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Delete" && selectedRectangle) {
      deleteSelectedRectangle()
    }
  }

  const deleteSelectedRectangle = () => {
    if (selectedRectangle) {
      setRectangles(rectangles.filter((rect) => rect.id !== selectedRectangle.id))
      setSelectedRectangle(null)
      setLabelText("")
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setStartPoint({ x, y })
      setIsDrawing(true)
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint) return
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      drawRectangles()
      drawRect(startPoint.x, startPoint.y, x - startPoint.x, y - startPoint.y)
    }
  }

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing && startPoint) {
      const canvas = canvasRef.current
      if (canvas) {
        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top
        const newRect: Rectangle = {
          id: Date.now(),
          x: Math.min(startPoint.x, x),
          y: Math.min(startPoint.y, y),
          width: Math.abs(x - startPoint.x),
          height: Math.abs(y - startPoint.y),
          label: "",
        }
        setRectangles([...rectangles, newRect])
      }
    }
    setIsDrawing(false)
    setStartPoint(null)
  }

  const drawRect = (x: number, y: number, width: number, height: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (ctx) {
      ctx.strokeStyle = "red"
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, width, height)
    }
  }

  const drawRectangles = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      rectangles.forEach((rect) => {
        ctx.strokeStyle = rect === selectedRectangle ? "blue" : "red"
        ctx.lineWidth = 2
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
        if (rect.label) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.7)"
          ctx.fillRect(rect.x, rect.y - 20, ctx.measureText(rect.label).width + 10, 20)
          ctx.fillStyle = "white"
          ctx.font = "14px Arial"
          ctx.fillText(rect.label, rect.x + 5, rect.y - 5)
        }
      })
    }
  }

  const selectRectangle = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDrawing) return
    const canvas = canvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const clickedRect = rectangles.find((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height)
      setSelectedRectangle(clickedRect || null)
      if (clickedRect) {
        setLabelText(clickedRect.label)
      } else {
        setLabelText("")
      }
    }
  }

  const labelSelectedRectangle = () => {
    if (selectedRectangle) {
      const updatedRectangles = rectangles.map((rect) =>
        rect.id === selectedRectangle.id ? { ...rect, label: labelText } : rect,
      )
      setRectangles(updatedRectangles)
      setSelectedRectangle(null)
      setLabelText("")
    }
  }

  const clearCanvas = () => {
    setRectangles([])
    setSelectedRectangle(null)
    setLabelText("")
  }

  const submitBoundingBoxes = () => {
    console.log(JSON.stringify(rectangles, null, 2))
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <canvas
        ref={canvasRef}
        width={512}
        height={512}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onClick={selectRectangle}
        className="border border-gray-300 cursor-crosshair"
      />
      <div className="flex space-x-2">
        <Input
          type="text"
          value={labelText}
          onChange={(e) => setLabelText(e.target.value)}
          placeholder="Enter label text"
          className="w-64"
        />
        <Button onClick={labelSelectedRectangle} disabled={!selectedRectangle}>
          Label
        </Button>
        <Button onClick={clearCanvas}>Clear</Button>
        <Button onClick={submitBoundingBoxes}>Submit</Button>
      </div>
    </div>
  )
}


