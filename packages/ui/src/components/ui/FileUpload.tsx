"use client";

import { useRef, useState } from "react";
import { cn } from "../../cn";
import { Upload, FileIcon, X } from "./icons";
import { Spinner } from "./Spinner";
import { Button } from "./Button";

const DEFAULT_ACCEPT = "image/jpeg,image/png,application/pdf";
const DEFAULT_MAX_SIZE_MB = 10;

export type UploadState = "idle" | "uploading" | "success" | "error";

// Matches a file against a standard HTML `accept` string, which mixes
// three token shapes: exact MIME types (image/png), MIME wildcards
// (image/*), and file extensions (.pdf). A naive `list.includes(file.type)`
// silently rejects wildcards and extensions -- which blocked every upload
// on the driver document form.
function fileMatchesAccept(file: File, accept: string): boolean {
  const tokens = accept.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
  if (tokens.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some(token => {
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1)); // "image/" prefix
    return type === token;
  });
}

interface Props {
  label: string;
  hint?: string;
  accept?: string;
  maxSizeMb?: number;
  state: UploadState;
  previewUrl?: string | null;
  fileName?: string | null;
  error?: string | null;
  onSelect: (file: File) => void;
  onRetry?: () => void;
  onRemove?: () => void;
}

// The parent owns the actual upload (it needs a fresh signed URL per
// attempt from the backend) — this component only handles picking,
// client-side file type/size validation, preview, and the idle/
// uploading/success/error states the parent tells it to render.
export function FileUpload({
  label,
  hint,
  accept = DEFAULT_ACCEPT,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  state,
  previewUrl,
  fileName,
  error,
  onSelect,
  onRetry,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    if (!fileMatchesAccept(file, accept)) {
      setLocalError("That file type isn't accepted. Use a JPG, PNG, or PDF.");
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setLocalError(`File is too large. Maximum size is ${maxSizeMb}MB.`);
      return;
    }
    setLocalError(null);
    onSelect(file);
  };

  const displayError = localError ?? error;
  const isImage = previewUrl && /\.(jpe?g|png)$/i.test(previewUrl.split("?")[0]);

  if (state === "success" || (previewUrl && state !== "uploading")) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-text">{label}</span>
        <div className="flex items-center gap-3 rounded-md border border-border bg-white p-3">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl!} alt="" className="h-14 w-14 rounded-md object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-light">
              <FileIcon size={24} className="text-muted" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-text">{fileName ?? "Document uploaded"}</p>
            <p className="text-xs text-green">Uploaded</p>
          </div>
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label="Remove file" className="rounded-md p-1.5 text-muted hover:bg-light">
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text">{label}</span>
      <div
        className={cn(
          "flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-border bg-white p-6 text-center",
          displayError && "border-red",
        )}
      >
        {state === "uploading" ? (
          <>
            <Spinner size={24} className="text-primary" />
            <p className="text-sm text-muted">Uploading…</p>
          </>
        ) : (
          <>
            <Upload size={24} className="text-muted" />
            <p className="text-sm text-muted">JPG, PNG, or PDF — up to {maxSizeMb}MB</p>
            <Button type="button" variant="secondary" size="md" onClick={() => inputRef.current?.click()}>
              Choose file
            </Button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          aria-label={label}
          accept={accept}
          className="sr-only"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>
      {hint && !displayError && <p className="text-xs text-muted">{hint}</p>}
      {displayError && (
        <div className="flex items-center gap-2">
          <p role="alert" className="text-xs text-red">
            {displayError}
          </p>
          {state === "error" && onRetry && (
            <button type="button" onClick={onRetry} className="text-xs font-medium text-primary underline">
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
