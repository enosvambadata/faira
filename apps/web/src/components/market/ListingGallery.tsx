"use client";

import { useState } from "react";

// Client island: the image gallery's active-thumbnail state. The rest of the
// listing page is server-rendered for SEO.
export function ListingGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = useState(0);

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square overflow-hidden rounded-lg border border-border bg-light">
        {images[active] ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary Cloudinary seller photos; next/image remote config deferred
          <img src={images[active]} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl text-muted">🔧</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((url, i) => (
            <button
              key={url}
              onClick={() => setActive(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border-2 ${i === active ? "border-primary" : "border-border"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- thumbnail of the same seller photo */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
