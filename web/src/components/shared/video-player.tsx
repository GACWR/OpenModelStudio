"use client";

interface VideoPlayerProps {
  src: string;
  poster?: string;
}

export function VideoPlayer({ src, poster }: VideoPlayerProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <video
        src={src}
        poster={poster}
        controls
        className="w-full bg-black"
        style={{ maxHeight: "500px" }}
      />
    </div>
  );
}
