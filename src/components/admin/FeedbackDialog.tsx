import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { getFeedbackSignature, sendFeedback } from '../../api/feedback';
import type { FeedbackType } from '../../api/feedback';
import { uploadToCloudinary } from '../../api/cloudinary';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Field, Segmented, TextArea, useCommand } from './kit';
import { X } from '../icons';

const TYPES: { value: FeedbackType; label: string }[] = [
  { value: 'BUG', label: 'Bug' },
  { value: 'IDEA', label: 'Idea' },
  { value: 'QUESTION', label: 'Question' },
  { value: 'PRAISE', label: 'Praise' },
];
const PLACEHOLDER: Record<FeedbackType, string> = {
  BUG: 'What happened, and what did you expect instead?',
  IDEA: 'What would make your shift easier?',
  QUESTION: 'What are you trying to do?',
  PRAISE: 'What is working well for you?',
};
const MAX_SCREENSHOT = 8 * 1024 * 1024;

/**
 * A quiet line to the product team from wherever staff are working. One way: it is sent with the
 * page they were on and who they are, and nothing comes back — so there is no history to show.
 */
export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation();
  const { run, busy } = useCommand();
  const [type, setType] = useState<FeedbackType>('BUG');
  const [message, setMessage] = useState('');
  const [shot, setShot] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const textRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    textRef.current?.querySelector('textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const preview = useMemo(() => (shot ? URL.createObjectURL(shot) : null), [shot]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const pick = (file: File | undefined) => {
    setFileError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) return setFileError('Choose an image file.');
    if (file.size > MAX_SCREENSHOT) return setFileError('That image is over 8 MB.');
    setShot(file);
  };

  const submit = async () => {
    const ok = await run(
      'feedback',
      async () => {
        const screenshotUrl = shot ? await uploadToCloudinary(shot, getFeedbackSignature) : undefined;
        await sendFeedback({ type, message: message.trim(), screenshotUrl, pagePath: pathname });
      },
      'Thanks — your feedback was sent',
    );
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        className="animate-pop max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-surface p-5 text-ink shadow-deep ring-1 ring-hairline ring-inset sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="feedback-title" className="font-display text-[22px] leading-tight font-black">
              Tell us how it's going
            </h2>
            <p className="mt-1 text-[13px] text-ink-3">Goes straight to the people building this. We read every note, though we can't reply to each one.</p>
          </div>
          <button type="button" aria-label="Close" className={`${ADMIN_TINY} text-ink-3 hover:text-ink`} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <Segmented label="Kind of feedback" value={type} onChange={setType} options={TYPES} />

          <div ref={textRef}>
            <Field label="Your message">
              <TextArea value={message} onChange={setMessage} rows={5} maxLength={2000} placeholder={PLACEHOLDER[type]} />
            </Field>
          </div>

          <div>
            {shot && preview ? (
              <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-2 ring-1 ring-hairline ring-inset">
                <img src={preview} alt="Screenshot to send" className="size-14 rounded-lg object-cover" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{shot.name}</span>
                <button type="button" className={`${ADMIN_TINY} text-ink-3 hover:text-berry`} onClick={() => setShot(null)}>
                  Remove
                </button>
              </div>
            ) : (
              <label className={`${ADMIN_GHOST} cursor-pointer`}>
                Attach a screenshot
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
            )}
            {fileError && <p className="mt-1.5 text-[12.5px] text-berry">{fileError}</p>}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" className={ADMIN_GHOST} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={ADMIN_PRIMARY} disabled={busy || message.trim().length < 3} onClick={submit}>
            {busy ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}
