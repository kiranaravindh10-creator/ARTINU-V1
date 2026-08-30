import { OTP } from '@artinu/shared';
import { Check, Circle, Upload, X } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Photo } from '@/components/ui/photo';
import { fileToImageDataUrl, formatBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Six boxed digits with auto-advance, backspace-to-previous, arrow keys and
 * full-code paste. Each box is labelled so a screen reader announces position.
 */
export function OtpInput({
  length = OTP.LENGTH,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  const setDigit = (index: number, digit: string) => {
    const next = value.padEnd(length, ' ').split('');
    next[index] = digit;
    const joined = next.join('').replace(/\s+$/, '');
    onChange(joined.trimEnd());

    if (digit && index < length - 1) refs.current[index + 1]?.focus();
    const complete = joined.replace(/\s/g, '');
    if (complete.length === length) onComplete?.(complete);
  };

  return (
    <div className={cn('flex gap-2', disabled && 'opacity-60')}>
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={digits[index]?.trim() ?? ''}
          onChange={(event) => {
            const digit = event.target.value.replace(/\D/g, '').slice(-1);
            setDigit(index, digit);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
              refs.current[index - 1]?.focus();
            }
            if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
            if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
          }}
          onPaste={(event) => {
            event.preventDefault();
            const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
            if (!pasted) return;
            onChange(pasted);
            refs.current[Math.min(pasted.length, length - 1)]?.focus();
            if (pasted.length === length) onComplete?.(pasted);
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          className={cn(
            'size-12 rounded-md border bg-surface text-center font-display text-xl text-ink transition-colors',
            'focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze/20',
            invalid ? 'border-danger' : 'border-line',
          )}
        />
      ))}
    </div>
  );
}

/** Brand glyphs drawn inline — no icon library ships these marks. */
/*
 * `SocialButtons`, the Google/Apple glyphs and the OAuth flow were removed.
 *
 * ARTINU signs people in with an email address and an ARTINU password, and
 * nothing else. A visitor may use a Gmail address as their email — that is just
 * an address — but they never hand ARTINU a Google credential, and ARTINU never
 * asks for one.
 */

/** Live checklist that mirrors passwordSchema in @artinu/shared. */
export function PasswordRules({ password = '' }: { password?: string }) {
  const rules = [
    { label: 'At least 8 characters', passed: password.length >= 8 },
    { label: 'One uppercase letter', passed: /[A-Z]/.test(password) },
    { label: 'One number or symbol', passed: /[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password) },
  ];

  return (
    <ul className="mt-2.5 space-y-1.5">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={cn('flex items-center gap-2 text-xs', rule.passed ? 'text-bronze' : 'text-subtle')}
        >
          {rule.passed ? (
            <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
          ) : (
            <Circle className="size-3.5" strokeWidth={1.5} aria-hidden />
          )}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}

/** Circular dropzone for a profile photograph. */
export function AvatarDropzone({
  value,
  onChange,
  label = 'Upload profile photo',
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  const accept = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Upload a JPG, PNG or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(`That image is ${formatBytes(file.size)} - the limit is 5 MB.`);
      return;
    }
    onChange(await fileToImageDataUrl(file));
  };

  return (
    <div>
      <p className="text-[0.8125rem] font-medium text-ink-soft">{label}</p>

      <div className="mt-3 flex items-center gap-4">
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void accept(event.dataTransfer.files[0]);
          }}
          className="relative"
        >
          {value ? (
            <>
              <Photo src={value} alt="Your profile photograph" className="size-24 rounded-full" />
              <button
                type="button"
                onClick={() => onChange(null)}
                aria-label="Remove photo"
                className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-ink text-canvas"
              >
                <X className="size-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex size-24 flex-col items-center justify-center gap-1 rounded-full border border-dashed text-center transition-colors',
                dragging ? 'border-bronze bg-bronze-soft/40' : 'border-line-strong bg-canvas-soft',
              )}
            >
              <Upload className="size-4 text-bronze" strokeWidth={1.5} aria-hidden />
              <span className="px-3 text-[0.625rem] leading-tight text-muted">
                Click to upload
                <br />
                or drag and drop
              </span>
            </button>
          )}
        </div>

        <p className="text-xs text-subtle">JPG, PNG up to 5MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="sr-only"
        onChange={(event) => {
          void accept(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </div>
  );
}

/** MM:SS countdown to an ISO instant. Calls onExpire once when it hits zero. */
export function useCountdown(expiresAt: string | undefined, onExpire?: () => void) {
  const [remaining, setRemaining] = React.useState(0);
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (!expiresAt) return;
    fired.current = false;

    const tick = () => {
      const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !fired.current) {
        fired.current = true;
        onExpire?.();
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt, onExpire]);

  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');

  return { remaining, label: `${minutes}:${seconds}`, expired: remaining === 0 };
}

/**
 * Four digits laid out like a compass — north, east, south, west — seated on a
 * dotted ring. Auto-advance, backspace-to-previous, arrow keys and full-code
 * paste all behave like the row layout, but the geometry itself guides the eye
 * to the next digit.
 */
export function DiamondOtpInput({
  length: digitCount = OTP.LENGTH,
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
}: {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const refs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(digitCount, ' ').slice(0, digitCount).split('');
  const filled = digits.filter((digit) => digit?.trim()).length;

  const setDigit = (index: number, digit: string) => {
    const next = value.padEnd(digitCount, ' ').split('');
    next[index] = digit;
    const joined = next.join('').replace(/\s+$/, '');
    onChange(joined.trimEnd());

    if (digit && index < digitCount - 1) refs.current[index + 1]?.focus();
    const complete = joined.replace(/\s/g, '');
    if (complete.length === digitCount) onComplete?.(complete);
  };

  // Compass positions: the origin is dead centre of the ring, and each input
  // sits a fixed distance out on its own bearing.
  const radius = 40;
  const positions = Array.from({ length: digitCount }, (_, index) => {
    const angle = ((index * 360) / digitCount - 90) * (Math.PI / 180);
    return {
      x: Math.round(radius * Math.cos(angle)),
      y: Math.round(radius * Math.sin(angle)),
    };
  });

  return (
    <div
      className={cn('relative mx-auto flex items-center justify-center', disabled && 'opacity-60')}
      style={{ width: radius * 2 + 88, height: radius * 2 + 88 }}
      role="group"
      aria-label={`${digitCount}-digit code, arranged as a compass`}
    >
      {/* Dotted ring the digits sit on. */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-full border-2 border-dashed',
          invalid ? 'border-danger/60' : 'border-bronze/40',
        )}
      />
      {/* A short tick at north, like a compass rose. */}
      <div aria-hidden className="absolute" style={{ top: 4, left: '50%' }}>
        <div className="h-2 w-px bg-bronze/50" />
      </div>

      {Array.from({ length: digitCount }, (_, index) => {
        const { x, y } = positions[index]!;
        const digit = digits[index]?.trim() ?? '';
        return (
          <input
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            value={digit}
            onChange={(event) => {
              const digitUpdate = event.target.value.replace(/\D/g, '').slice(-1);
              setDigit(index, digitUpdate);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !digits[index]?.trim() && index > 0) {
                refs.current[index - 1]?.focus();
              }
              if (event.key === 'ArrowLeft') refs.current[Math.max(0, index - 1)]?.focus();
              if (event.key === 'ArrowRight') {
                refs.current[Math.min(digitCount - 1, index + 1)]?.focus();
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, digitCount);
              if (!pasted) return;
              onChange(pasted);
              refs.current[Math.min(pasted.length, digitCount - 1)]?.focus();
              if (pasted.length === digitCount) onComplete?.(pasted);
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            disabled={disabled}
            aria-label={`Digit ${index + 1} of ${digitCount}`}
            aria-invalid={invalid || undefined}
            className={cn(
              'absolute size-16 items-center justify-center rounded-md border bg-surface text-center font-display text-xl text-ink transition-colors',
              'focus:border-bronze focus:outline-none focus:ring-2 focus:ring-bronze/20',
              invalid ? 'border-danger' : 'border-line',
            )}
            style={{
              translate: `calc(-50% + ${x}px) calc(-50% + ${y}px)`,
              top: '50%',
              left: '50%',
            }}
          />
        );
      })}

      {/* Progress pips: one lights for every digit entered. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="flex gap-1">
          {Array.from({ length: digitCount }, (_, index) => (
            <span
              key={index}
              className={cn(
                'size-1 rounded-full transition-colors',
                index < filled ? 'bg-bronze' : 'bg-line',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
