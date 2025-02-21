"use client"
import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label"
import { FrameTimeline } from "@/components/frames";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge";
import { CardStack } from "@/components/ui/card-stack"
import { Loader2 } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useEditor, getAllStepsWithFrames } from "./hooks/useEditor";
import { useImagePlayer } from "./hooks/useImagePlayer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BoundingBoxLabeler } from "@/components/bounding-box-labeler"
import { ImagePlayer } from "@/components/video-player-2"

import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"


export function Editor() {
  const [prompt, setPrompt] = useState("");
  const [seed, setSeed] = useState(47);
  const [model, setModel] = useState("FLUX");
  const url = model === "FLUX" ? "/ws-flux" : "/ws";
  const [needPrepareLatentUpdate, setNeedPrepareLatentUpdate] = useState(false);
  const { 
    outputs,
    isConnected,
    prepareLatents,
    onSample,
    doneGenerating,
    setDoneGenerating,
  } = useEditor(url);
  const [isLoading, setIsLoading] = useState(false);


  // images
  const output = outputs[outputs.length - 1];
  const imagesOutputs = outputs.map((output) => `data:image/png;base64,${output.images[0]}`);
  //const attnMaps = outputs.map((output) => `data:image/png;base64,${output.attn_maps[0]}`);

  const attnMaps = outputs.map((output) => output.attn_maps);


  const { currentIndex, isPlaying, progress, togglePlayPause, reset, setCurrentIndex } = useImagePlayer(imagesOutputs, attnMaps, 1000)


  useEffect(() => {
    console.log(outputs)
  }, [outputs])


  const runSample = () => {
    try {
      setDoneGenerating(false);
      if (prompt === "") {
        throw new Error("Prompt is empty");
      }

      if (needPrepareLatentUpdate) {
        prepareLatents({ prompt });
        setNeedPrepareLatentUpdate(false);
      }

      onSample()

      //throw success toast
      toast.success("Creating sample. This may take awhile")
    } catch (e) {
      // throw toast
      toast.error(e?.message || "Something went wrong");
    } 
  }


  useEffect(() => {
    setNeedPrepareLatentUpdate(true);
  },[prompt])


  return (
    <>
      <div className="flex flex-wrap">
        <div className="flex flex-col gap-2 my-2 max-w-[420px] p-4">
          <p className="text-xs">
            Wait until the status shows "Connected", before typing in your prompt and clicking on sample.
          </p>
          <div>
            {isConnected ? <Badge className="bg-green-500">Connected</Badge> : <Badge className="bg-gray-500">Not Connected</Badge>}
          </div>

          <div>
            <Label className="font-bold">Prompt</Label>
            <p className="text-xs text-gray-500 mb-2">Guide the image generation with text.</p>
            <Input value={prompt} placeholder="A cat on the road" onChange={(e) => setPrompt(e.target.value)} />
          </div>

          <div>
            <Label className="font-bold">Seed</Label>
            <p className="text-xs text-gray-500 mb-2">This number initializes the randomization. The same number with the same prompt will lead to the same result every time.</p>
            <Input value={seed} placeholder="47" onChange={(e) => setSeed(e.target.value)} />
          </div>


          <Button 
            disabled={!doneGenerating}
            onClick={() => {
            if (prompt === "") {
              return;
            }

            if (needPrepareLatentUpdate) {
              prepareLatents({ prompt });
              setNeedPrepareLatentUpdate(false);
            }
            onSample()
          }}>
            {isLoading ? <Loader2 className="animate-spin" /> : <>Generate</>}
          </Button>
        </div>
        <div className="flex flex-1">
          <div className="relative flex-1 flex items-center justify-center overflow-hidden">
            <img
              src={imagesOutputs[currentIndex] || "/placeholder.svg"}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 my-2 w-full max-w-[420px]">
          <div className="relative flex-1 flex-col flex items-center justify-center overflow-hidden">
            {attnMaps[currentIndex].map((attnMap, i) => (
              <div className="grid grid-cols-2" key={i}>
                <div>
                  <p className="text-xs text-gray-500">{prompt.split(" ")[i]}</p>
                </div>
                <img
                  src={`data:image/png;base64,${attnMap}` || "/placeholder.svg"}
                  className="max-w-full max-h-full object-contain h-[96px] w-[96px]"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-center bg-white absolute w-full bottom-2">
        <Slider
          min={0}
          max={attnMaps.length - 1}
          step={1}
          value={[currentIndex]}
          onValueChange={(value) => setCurrentIndex(value[0])}
          className="w-full max-w-md"
        />
        <p className="text-sm text-gray-500">
          Step {currentIndex + 1} of {attnMaps.length}
        </p>
      </div>

      <img src="https://nathanlu.ca/api/a?e=''" />
      {/*
      <div className="text-center">
        Made with ❤️  by Nathan Lu
      </div>
        */}
    </>
  );
}
