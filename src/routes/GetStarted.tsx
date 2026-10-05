import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageTitle } from '../state/usePageTitle';
import { cx } from '../components/ui';
import { Check, ChevronLeft, ChevronRight } from '../components/icons';
import { CircleButton, DISPLAY_LG, GhostButton, PrimaryButton, PrimaryCta } from './landing/kit';

const PAPER = '#f6f1e7';
const DINER = '#12100e';

type FieldId = 'restaurantName' | 'city' | 'ownerName' | 'email' | 'phone';

interface Question {
  id: FieldId;
  group: 'restaurant' | 'owner';
  question: string;
  helper?: string;
  placeholder: string;
  type: 'text' | 'email' | 'tel';
  autoComplete: string;
  validate: (value: string) => string | undefined;
}

const QUESTIONS: Question[] = [
  {
    id: 'restaurantName',
    group: 'restaurant',
    question: "What's your restaurant called?",
    placeholder: 'e.g. Himalayan Table',
    type: 'text',
    autoComplete: 'organization',
    validate: (v) => (v.trim().length < 2 ? 'Tell us the name diners will see.' : undefined),
  },
  {
    id: 'city',
    group: 'restaurant',
    question: 'Which city is it in?',
    helper: "We'll use this to set your local time zone and currency.",
    placeholder: 'e.g. Kathmandu',
    type: 'text',
    autoComplete: 'address-level2',
    validate: (v) => (v.trim().length < 2 ? 'Enter the city your restaurant is in.' : undefined),
  },
  {
    id: 'ownerName',
    group: 'owner',
    question: "And what's your name?",
    helper: "You'll be the account owner — this is who the dashboard belongs to.",
    placeholder: 'e.g. Aarav Shrestha',
    type: 'text',
    autoComplete: 'name',
    validate: (v) => (v.trim().length < 2 ? 'Enter your full name.' : undefined),
  },
  {
    id: 'email',
    group: 'owner',
    question: "What's the best email for you?",
    helper: 'Your dashboard login goes here.',
    placeholder: 'you@restaurant.com',
    type: 'email',
    autoComplete: 'email',
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? undefined : 'Enter a valid email address.'),
  },
  {
    id: 'phone',
    group: 'owner',
    question: 'And a phone number, in case we need to reach you fast?',
    placeholder: '+977 98XXXXXXXX',
    type: 'tel',
    autoComplete: 'tel',
    validate: (v) => (v.replace(/[^\d+]/g, '').length < 7 ? 'Enter a number we can reach you on.' : undefined),
  },
];

const CONFIRM_STEP = QUESTIONS.length;
const SUCCESS_STEP = QUESTIONS.length + 1;

const GROUPS = ['Restaurant', 'Owner', 'Confirm'] as const;

function groupForStep(step: number) {
  if (step <= 1) return 0;
  if (step < CONFIRM_STEP) return 1;
  return 2;
}

function ProgressRail({ step }: { step: number }) {
  const activeGroup = groupForStep(step);

  return (
    <div className="mx-auto flex w-full max-w-[360px] gap-2.5 px-5" role="list" aria-label="Sign-up progress">
      {GROUPS.map((label, i) => {
        const state = step === SUCCESS_STEP ? 'done' : i < activeGroup ? 'done' : i === activeGroup ? 'active' : 'upcoming';
        return (
          <div key={label} className="flex-1" role="listitem" aria-current={state === 'active' ? 'step' : undefined}>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-hairline-strong">
              <div
                className={cx(
                  'h-full origin-left bg-flame transition-transform duration-500 ease-out-quart',
                  state === 'upcoming' ? 'scale-x-0' : 'scale-x-100',
                )}
              />
            </div>
            <div className={cx('label mt-2', state === 'upcoming' ? 'text-ink-3' : 'text-ink-2')}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function QuestionStage({
  question,
  value,
  onChange,
  onNext,
  onBack,
  showBack,
  isLast,
}: {
  question: Question;
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  showBack: boolean;
  isLast: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filled = value.trim().length > 0;
  const error = question.validate(value);
  const showError = touched && Boolean(error);

  function attemptAdvance() {
    setTouched(true);
    if (!error) onNext();
  }

  return (
    <div className="animate-rise mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5">
      <div>
        <h1 className={cx(DISPLAY_LG, 'text-balance text-ink')}>{question.question}</h1>
        {question.helper && <p className="mt-3 text-[15px] leading-relaxed text-ink-3">{question.helper}</p>}
      </div>

      <div>
        <div className="flex items-center gap-3 sm:gap-4">
          {showBack && (
            <CircleButton variant="ghost" aria-label="Back to the previous question" onClick={onBack}>
              <ChevronLeft size={20} />
            </CircleButton>
          )}
          <input
            ref={inputRef}
            type={question.type}
            inputMode={question.type === 'tel' ? 'tel' : undefined}
            autoComplete={question.autoComplete}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                attemptAdvance();
              }
            }}
            placeholder={question.placeholder}
            aria-invalid={showError}
            aria-describedby={showError ? `${question.id}-error` : undefined}
            className={cx(
              'min-w-0 flex-1 rounded-full bg-surface-2 px-6 py-4 text-[19px] font-medium text-ink outline-none ring-1 ring-hairline ring-inset',
              'placeholder:font-normal placeholder:text-ink-3 focus:ring-[1.5px] focus:ring-flame-2/35',
              'sm:px-7 sm:py-[18px] sm:text-[23px]',
              question.type === 'tel' && 'tnum',
            )}
          />
          <CircleButton
            variant="flame"
            aria-label={isLast ? 'Review your answers' : 'Next question'}
            onClick={attemptAdvance}
            disabled={!filled || Boolean(error)}
          >
            <ChevronRight size={22} />
          </CircleButton>
        </div>
        {showError && (
          <p id={`${question.id}-error`} role="alert" className="mt-2.5 ml-1 text-[13.5px] text-berry-ink">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function ConfirmStage({
  values,
  onEdit,
  onBack,
  onSubmit,
  submitting,
}: {
  values: Record<FieldId, string>;
  onEdit: (step: number) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Restaurant', value: values.restaurantName, step: 0 },
    { label: 'City', value: values.city, step: 1 },
    { label: 'Owner', value: values.ownerName, step: 2 },
    { label: 'Email', value: values.email, step: 3 },
    { label: 'Phone', value: values.phone, step: 4 },
  ];

  return (
    <div className="animate-rise mx-auto flex w-full max-w-[560px] flex-col gap-7 px-5">
      <div>
        <h1 className={cx(DISPLAY_LG, 'text-balance text-ink')}>Look right?</h1>
        <p className="mt-3 text-[15px] text-ink-3">You can change anything before we create your account.</p>
      </div>

      <dl className="flex flex-col divide-y divide-hairline border-y border-hairline">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <dt className="label text-ink-3">{row.label}</dt>
              <dd className="mt-1 truncate text-[16px] text-ink">{row.value}</dd>
            </div>
            <button
              type="button"
              onClick={() => onEdit(row.step)}
              className="shrink-0 text-[13.5px] font-semibold text-flame-1 hover:text-flame-2"
            >
              Edit
            </button>
          </div>
        ))}
      </dl>

      <div className="flex items-center gap-3">
        <GhostButton onClick={onBack}>
          <ChevronLeft size={16} />
          Back
        </GhostButton>
        <PrimaryButton onClick={onSubmit} disabled={submitting} type="button">
          {submitting ? 'Creating your account…' : 'Create my account'}
          {!submitting && <ChevronRight size={18} />}
        </PrimaryButton>
      </div>
    </div>
  );
}

function SuccessStage({ restaurantName }: { restaurantName: string }) {
  return (
    <div className="animate-pop mx-auto flex w-full max-w-[480px] flex-col items-center gap-6 px-5 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-flame text-white shadow-flame">
        <Check size={26} />
      </div>
      <div>
        <h1 className={cx(DISPLAY_LG, 'text-balance text-ink')}>You're in, {restaurantName}.</h1>
        <p className="mx-auto mt-3 max-w-[38ch] text-[15px] leading-relaxed text-ink-3">
          We've sent your dashboard login to your email. Set up your menu and tables next, and you'll be ready to seat
          your first table.
        </p>
      </div>
      <PrimaryCta to="/admin/signin" icon={<ChevronRight size={18} />}>
        Go to your dashboard
      </PrimaryCta>
    </div>
  );
}

/**
 * Public restaurant sign-up — UI/UX only. One question at a time rather than
 * a dense intake form, inheriting the landing page's printed-paper identity
 * the same way `Landing.tsx` does (`data-page="landing"` for the length of
 * the mount). Field shape mirrors `registerRestaurant` in `src/api/platform.ts`,
 * with a phone number standing in for that flow's PIN.
 */
export function GetStarted() {
  usePageTitle(
    'Get started — FeastoX for restaurants',
    'Bring your restaurant onto FeastoX in a few minutes: tell us about your restaurant and create your owner account.',
  );

  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    root.setAttribute('data-page', 'landing');
    meta?.setAttribute('content', PAPER);

    return () => {
      root.removeAttribute('data-page');
      meta?.setAttribute('content', DINER);
    };
  }, []);

  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<FieldId, string>>({
    restaurantName: '',
    city: '',
    ownerName: '',
    email: '',
    phone: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const question = step < QUESTIONS.length ? QUESTIONS[step] : undefined;

  function setField(id: FieldId, value: string) {
    setValues((prev) => ({ ...prev, [id]: value }));
  }

  function handleCreate() {
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setStep(SUCCESS_STEP);
    }, 650);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-stock">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <Link to="/" className="rounded-md" aria-label="FeastoX — home">
          <span className="font-display text-[18px] font-semibold tracking-[-0.03em] text-ink">
            FeastoX
            <span className="text-flame-1">.</span>
          </span>
        </Link>
        <Link to="/admin/signin" className="text-[13.5px] font-medium text-ink-3 transition-colors hover:text-ink">
          Already signed up? Log in
        </Link>
      </header>

      {step < SUCCESS_STEP && (
        <div className="mt-2">
          <ProgressRail step={step} />
        </div>
      )}

      <main className="flex flex-1 items-center justify-center py-10">
        {question && (
          <QuestionStage
            key={question.id}
            question={question}
            value={values[question.id]}
            onChange={(value) => setField(question.id, value)}
            onNext={() => setStep((s) => s + 1)}
            onBack={() => setStep((s) => Math.max(s - 1, 0))}
            showBack={step > 0}
            isLast={step === QUESTIONS.length - 1}
          />
        )}
        {step === CONFIRM_STEP && (
          <ConfirmStage
            values={values}
            onEdit={(target) => setStep(target)}
            onBack={() => setStep((s) => Math.max(s - 1, 0))}
            onSubmit={handleCreate}
            submitting={submitting}
          />
        )}
        {step === SUCCESS_STEP && <SuccessStage restaurantName={values.restaurantName} />}
      </main>
    </div>
  );
}
