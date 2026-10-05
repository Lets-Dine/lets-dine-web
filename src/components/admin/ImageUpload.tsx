import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { uploadToCloudinary } from '../../api/cloudinary';
import type { UploadSignature } from '../../api/admin';
import type { UploadTarget } from '../../api/staff';
import { ApiError } from '../../api/store';
import { useToast } from '../../state/ToastContext';
import { cx } from '../ui';
import { Move, X } from '../icons';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_QUIET } from './kit';

/** The exact crop window — what actually gets uploaded. */
const CROP_WIDTH = 360;
/** Extra stage visible around the crop window, dimmed, so panning past the edge reads as "excluded" rather than vanishing. */
const STAGE_MARGIN = 48;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
/** Trackpad and mouse wheels report wildly different `deltaY` magnitudes; this tames both to one feel. */
const WHEEL_ZOOM_SENSITIVITY = 0.0018;

/** Longest edge of the compressed output — small enough to stay light, large enough to stay sharp. */
const MAX_OUTPUT_WIDTH: Record<UploadTarget, number> = {
  dish: 900,
  'restaurant-cover': 1600,
  'restaurant-logo': 512,
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** WebP first for the smaller file; a browser that can't encode it falls back to JPEG. */
async function compress(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await canvasToBlob(canvas, 'image/webp', 0.62);
  if (webp) return webp;
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.65);
  if (jpeg) return jpeg;
  throw new ApiError(0, 'This browser could not prepare the image. Try a different one.');
}

interface CropDialogProps {
  src: string;
  aspect: number;
  maxOutputWidth: number;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}

/**
 * Cover-fit crop on an oversized stage: the image always fills the stage
 * (never a blank gap), dragging pans it and the slider or scroll wheel zooms
 * it, and the output is whatever the smaller crop window — outlined, with
 * everything outside it dimmed — shows. No cropping library, just the
 * canvas and pointer events the platform already gives us.
 */
function CropDialog({ src, aspect, maxOutputWidth, onCancel, onConfirm }: CropDialogProps) {
  const push = useToast();
  const cropHeight = CROP_WIDTH / aspect;
  const stageWidth = CROP_WIDTH + STAGE_MARGIN * 2;
  const stageHeight = cropHeight + STAGE_MARGIN * 2;
  const imgRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const drag = useRef<{ x: number; y: number; offset: { x: number; y: number } } | null>(null);
  const [busy, setBusy] = useState(false);

  // Covers the crop window, not the whole stage — covering the stage would force extra zoom just
  // to fill the margin, clipping image content at "fully zoomed out" that the user never asked to lose.
  const baseScale = Math.max(CROP_WIDTH / natural.w, cropHeight / natural.h);
  const scale = baseScale * zoom;
  const dispW = natural.w * scale;
  const dispH = natural.h * scale;

  // Bounds pan/zoom so the crop window always stays fully covered by the image — the stage margin
  // around it is free to show less-than-full image (or a bit of empty surface) with no such guarantee.
  const clampFor = useCallback(
    (dW: number, dH: number, next: { x: number; y: number }) => ({
      x: Math.min(STAGE_MARGIN, Math.max(STAGE_MARGIN + CROP_WIDTH - dW, next.x)),
      y: Math.min(STAGE_MARGIN, Math.max(STAGE_MARGIN + cropHeight - dH, next.y)),
    }),
    [cropHeight],
  );

  // Keeps the state a native wheel listener needs fresh without re-subscribing it on every render.
  const live = useRef({ zoom, offset, baseScale, natural });
  useEffect(() => {
    live.current = { zoom, offset, baseScale, natural };
  });

  /** Rescales around `pivot` (viewport-local px) so whatever image point sits under it stays put. */
  const zoomTo = useCallback(
    (nextZoomRaw: number, pivot: { x: number; y: number }) => {
      const { zoom: curZoom, offset: curOffset, baseScale: curBaseScale, natural: curNatural } = live.current;
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoomRaw));
      if (nextZoom === curZoom) return;
      const curScale = curBaseScale * curZoom;
      const nextScale = curBaseScale * nextZoom;
      const imageX = (pivot.x - curOffset.x) / curScale;
      const imageY = (pivot.y - curOffset.y) / curScale;
      setZoom(nextZoom);
      setOffset(
        clampFor(curNatural.w * nextScale, curNatural.h * nextScale, {
          x: pivot.x - imageX * nextScale,
          y: pivot.y - imageY * nextScale,
        }),
      );
    },
    [clampFor],
  );

  const onLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const cover = Math.max(CROP_WIDTH / w, cropHeight / h);
    const dW = w * cover;
    const dH = h * cover;
    setNatural({ w, h });
    setOffset(clampFor(dW, dH, { x: (stageWidth - dW) / 2, y: (stageHeight - dH) / 2 }));
    setReady(true);
  };

  // Wheel needs a non-passive listener to call preventDefault — React's onWheel is passive by
  // default, so scrolling the page (instead of zooming the crop) is what you'd get without this.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setInteracted(true);
      const rect = el.getBoundingClientRect();
      zoomTo(live.current.zoom - e.deltaY * WHEEL_ZOOM_SENSITIVITY, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setInteracted(true);
    setDragging(true);
    drag.current = { x: e.clientX, y: e.clientY, offset };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setOffset(
      clampFor(dispW, dispH, {
        x: drag.current.offset.x + (e.clientX - drag.current.x),
        y: drag.current.offset.y + (e.clientY - drag.current.y),
      }),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  const confirm = async () => {
    const img = imgRef.current;
    if (!img) return;
    setBusy(true);
    try {
      const sourceX = (STAGE_MARGIN - offset.x) / scale;
      const sourceY = (STAGE_MARGIN - offset.y) / scale;
      const sourceW = CROP_WIDTH / scale;
      const sourceH = cropHeight / scale;

      const outW = Math.min(maxOutputWidth, sourceW);
      const outH = outW / aspect;

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(outW);
      canvas.height = Math.round(outH);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ApiError(0, 'This browser could not prepare the image. Try a different one.');
      ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height);

      onConfirm(await compress(canvas));
    } catch (error) {
      setBusy(false);
      push(error instanceof ApiError ? error.message : 'Could not prepare the image. Try again.', '⚠️');
    }
  };

  // Portaled to <body> — this can be opened from inside a <Field>'s <label>, and a dialog left
  // inside that label would forward every click/drag to the hidden file input, reopening the picker.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-xl rounded-2xl bg-surface p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[14px] font-semibold text-ink">Crop photo</p>
          <button type="button" className={ADMIN_QUIET} onClick={onCancel} aria-label="Cancel">
            <X size={16} />
          </button>
        </div>

        <div
          ref={stageRef}
          className={cx(
            'relative mx-auto touch-none select-none overflow-hidden rounded-xl bg-surface-2 ring-1 ring-hairline ring-inset',
            dragging ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={{ width: stageWidth, height: stageHeight }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={onLoad}
            className="pointer-events-none max-w-none origin-top-left"
            style={{ width: dispW, height: dispH, transform: `translate(${offset.x}px, ${offset.y}px)`, opacity: ready ? 1 : 0 }}
          />

          {/* Everything outside the crop window stays visible but dimmed, so panning past the edge reads as "excluded" rather than vanishing. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bg-ink/55" style={{ height: STAGE_MARGIN }} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-ink/55" style={{ height: STAGE_MARGIN }} />
          <div className="pointer-events-none absolute left-0 bg-ink/55" style={{ top: STAGE_MARGIN, bottom: STAGE_MARGIN, width: STAGE_MARGIN }} />
          <div className="pointer-events-none absolute right-0 bg-ink/55" style={{ top: STAGE_MARGIN, bottom: STAGE_MARGIN, width: STAGE_MARGIN }} />
          <div
            className="pointer-events-none absolute ring-2 ring-bg/90"
            style={{ left: STAGE_MARGIN, top: STAGE_MARGIN, width: CROP_WIDTH, height: cropHeight }}
          />

          <div
            className="pointer-events-none absolute flex items-center justify-center p-2"
            style={{ left: STAGE_MARGIN, top: STAGE_MARGIN, width: CROP_WIDTH, height: cropHeight }}
          >
            <span
              className={cx(
                'flex items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1.5 text-center text-[12px] font-medium text-bg shadow-sm backdrop-blur-sm transition-opacity duration-300',
                (!ready || interacted) && 'opacity-0',
              )}
            >
              <Move size={13} className="shrink-0" />
              Drag to reposition · Scroll to zoom
            </span>
          </div>
        </div>

        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => {
            setInteracted(true);
            zoomTo(Number(e.target.value), { x: stageWidth / 2, y: stageHeight / 2 });
          }}
          className="mt-3 w-full"
          aria-label="Zoom"
        />

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className={ADMIN_GHOST} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={ADMIN_PRIMARY} onClick={confirm} disabled={!ready || busy}>
            {busy ? 'Preparing…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ImageUploadProps {
  /** Which Cloudinary folder/compression profile this upload belongs to. */
  target: UploadTarget;
  /** Crop viewport's width/height ratio, e.g. 1 for a square dish photo, 16/9 for a wide cover. */
  aspect: number;
  onUploaded: (url: string) => void;
  /** Mints the upload signature for a caller with no restaurant (the platform library); `target` then only sets the compression profile. */
  signer?: () => Promise<UploadSignature>;
  disabled?: boolean;
  label?: ReactNode;
  className?: string;
}

/** A button that opens a file picker, crops the chosen image, compresses it, and uploads it to Cloudinary. */
export function ImageUpload({ target, aspect, onUploaded, signer, disabled, label = 'Upload photo', className }: ImageUploadProps) {
  const push = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      push('Choose an image file.', '⚠️');
      return;
    }
    setSource(URL.createObjectURL(file));
  };

  const closeSource = () => {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
  };

  const finish = async (blob: Blob) => {
    closeSource();
    setBusy(true);
    try {
      onUploaded(await uploadToCloudinary(blob, signer ?? target));
    } catch (error) {
      push(error instanceof ApiError ? error.message : 'Upload failed. Try again.', '⚠️');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button type="button" className={cx(ADMIN_GHOST, className)} disabled={busy || disabled} onClick={() => inputRef.current?.click()}>
        {busy ? 'Uploading…' : label}
      </button>
      {source && (
        <CropDialog
          src={source}
          aspect={aspect}
          maxOutputWidth={MAX_OUTPUT_WIDTH[target]}
          onCancel={closeSource}
          onConfirm={(blob) => void finish(blob)}
        />
      )}
    </>
  );
}
