"use client";

import { useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  errorTextClass,
  badgeActiveClass,
} from "@/lib/ui/form-classes";
import {
  uploadProductMedia,
  deleteProductMedia,
  setPrimaryProductMedia,
  reorderProductMedia,
} from "./actions";

export type MediaItem = {
  id: string;
  url: string | null;
  altText: string | null;
  isPrimary: boolean;
};

function UploadSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryButtonClass}>
      {pending ? "Uploading…" : "Upload image"}
    </button>
  );
}

export function MediaManager({
  itemId,
  initialMedia,
}: {
  itemId: string;
  initialMedia: MediaItem[];
}) {
  const [media, setMedia] = useState(initialMedia);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const boundUpload = uploadProductMedia.bind(null, itemId);
  const [uploadState, uploadAction] = useFormState(boundUpload, { error: null });

  // initialMedia only changes identity when the server re-renders after a
  // revalidatePath (upload/delete/reorder/set-primary all trigger one), so
  // this keeps local optimistic ordering in sync with the authoritative list.
  if (
    initialMedia !== media &&
    initialMedia.map((m) => m.id).join() !== media.map((m) => m.id).join()
  ) {
    setMedia(initialMedia);
  }

  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= media.length) return;

    const reordered = [...media];
    const current = media[index];
    const swapWith = media[target];
    if (!current || !swapWith) return;
    reordered[index] = swapWith;
    reordered[target] = current;
    setMedia(reordered);
    setActionError(null);

    startTransition(async () => {
      const result = await reorderProductMedia(
        itemId,
        reordered.map((m) => m.id),
      );
      if (result.error) setActionError(result.error);
    });
  }

  function handleSetPrimary(mediaId: string) {
    setActionError(null);
    startTransition(async () => {
      const result = await setPrimaryProductMedia(itemId, mediaId);
      if (result.error) setActionError(result.error);
    });
  }

  function handleDelete(mediaId: string) {
    setActionError(null);
    startTransition(async () => {
      const result = await deleteProductMedia(itemId, mediaId);
      if (result.error) setActionError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <form action={uploadAction} className="space-y-4">
        <div>
          <label className={labelClass}>Image file (JPEG, PNG, or WEBP — max 10 MB)</label>
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Alt text (optional)</label>
          <input type="text" name="alt_text" className={inputClass} />
        </div>
        {uploadState.error ? <p className={errorTextClass}>{uploadState.error}</p> : null}
        <UploadSubmitButton />
      </form>

      {actionError ? <p className={errorTextClass}>{actionError}</p> : null}

      {media.length === 0 ? (
        <p className="text-sm text-brand-slate">No images uploaded yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {media.map((item, index) => (
            <li
              key={item.id}
              className="space-y-2 rounded-lg border border-kantira-navy-100 p-3"
            >
              <div className="aspect-square overflow-hidden rounded-md bg-kantira-navy-50">
                {item.url ? (
                  <img
                    src={item.url}
                    alt={item.altText ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              {item.isPrimary ? (
                <span className={badgeActiveClass}>Primary</span>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleSetPrimary(item.id)}
                  className="text-xs font-medium text-brand-royal disabled:opacity-60"
                >
                  Set as primary
                </button>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button
                    type="button"
                    disabled={isPending || index === 0}
                    onClick={() => moveImage(index, -1)}
                    className={`${secondaryButtonClass} px-2 py-1 text-xs disabled:opacity-40`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={isPending || index === media.length - 1}
                    onClick={() => moveImage(index, 1)}
                    className={`${secondaryButtonClass} px-2 py-1 text-xs disabled:opacity-40`}
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleDelete(item.id)}
                  className="text-xs font-medium text-red-600 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
