"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Upload, File, X, Check } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onUpload?: (file: File) => void;
  accept?: string;
}

export function FileUpload({ onUpload, accept }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  const handleFile = useCallback(
    (f: File) => {
      setFile(f);
      setDone(false);
      setProgress(0);

      // Read the file and report real progress
      const reader = new FileReader();
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      reader.onload = () => {
        setProgress(100);
        setDone(true);
        onUpload?.(f);
      };
      reader.readAsArrayBuffer(f);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  return (
    <motion.div
      animate={{ borderColor: dragOver ? "#ffffff" : "rgba(255,255,255,0.1)" }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border bg-card/50 p-8 transition-colors"
    >
      {file ? (
        <div className="flex w-full flex-col items-center gap-3">
          {done ? (
            <Check className="h-8 w-8 text-green-400" />
          ) : (
            <File className="h-8 w-8 text-white" />
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              ({(file.size / 1024).toFixed(1)} KB)
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setFile(null);
                setProgress(0);
                setDone(false);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <Progress value={progress} className="h-1.5 w-48" />
          <span className="text-xs text-muted-foreground">
            {done ? "Ready" : `${progress}%`}
          </span>
        </div>
      ) : (
        <>
          <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag & drop or{" "}
            <label className="cursor-pointer text-white hover:underline">
              browse
              <input
                type="file"
                className="hidden"
                accept={accept}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Supports CSV, Parquet, images, video
          </p>
        </>
      )}
    </motion.div>
  );
}
