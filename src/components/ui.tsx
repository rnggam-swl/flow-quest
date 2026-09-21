import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

function cx(...classes: Array<string | false | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-[14px] border border-border bg-surface p-6", className)}>
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "ghost" | "gold";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    "rounded-[9px] px-[22px] py-3 text-[14.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-surface3 disabled:text-muted2";
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-teal text-[#0A2723] hover:bg-[#5EE6D1]",
    ghost: "border border-border-light bg-surface2 text-text hover:bg-surface3",
    gold: "bg-gold text-[#3A2607] hover:bg-[#F7C066]",
  };
  return <button className={cx(base, variants[variant], className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? <div className="mt-1.5 text-[13px] text-danger">{error}</div> : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-[9px] border border-border-light bg-surface2 px-[13px] py-[11px] text-[14.5px] text-text outline-none placeholder:text-muted2 focus:border-teal",
        props.className
      )}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "min-h-[90px] w-full resize-y rounded-[9px] border border-border-light bg-surface2 px-[13px] py-3 text-[14px] text-text outline-none focus:border-teal",
        props.className
      )}
    />
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2.5 text-[12px] font-semibold uppercase tracking-[1.5px] text-teal">
      {children}
    </div>
  );
}

export function Headline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cx("font-display mb-2.5 text-[32px] font-semibold leading-[1.25]", className)}>
      {children}
    </h1>
  );
}

export function Sub({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("mb-7 text-[15px] leading-[1.6] text-muted", className)}>{children}</p>;
}

export function CenteredShell({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[520px] px-5 pt-[60px] pb-20">{children}</div>;
}

export function HintCode({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-md border border-dashed border-border-light bg-surface2 px-2.5 py-0.5 text-[13px] font-semibold tracking-[0.5px] text-gold">
      {children}
    </span>
  );
}

/** Small spinner shown by loading.tsx route boundaries so page transitions give instant feedback instead of a frozen screen while the server renders. */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Memuat…"
      className={cx("h-6 w-6 animate-spin rounded-full border-2 border-border-light border-t-teal", className)}
    />
  );
}

export function PageLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

export function StatusPill({ tone, children }: { tone: "completed" | "progress"; children: ReactNode }) {
  const tones = {
    completed: "bg-[rgba(123,201,126,0.15)] text-success",
    progress: "bg-[rgba(240,172,63,0.15)] text-gold",
  };
  return (
    <span className={cx("rounded-xl px-2.5 py-[3px] text-[11.5px] font-semibold", tones[tone])}>
      {children}
    </span>
  );
}
