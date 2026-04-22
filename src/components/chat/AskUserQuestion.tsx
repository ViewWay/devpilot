import { useState } from "react";
import { HelpCircle, ChevronRight } from "lucide-react";
import { useI18n } from "../../i18n";
import { Button } from "../shared/Button";

/**
 * A single question with optional choices.
 */
export interface Question {
  /** Unique identifier for this question. */
  id: string;
  /** The question text (supports inline markdown). */
  text: string;
  /** If provided, the user must select one of these options. */
  choices?: QuestionChoice[];
  /** Placeholder text for the free-text input. */
  placeholder?: string;
  /** Whether this question requires an answer. */
  required?: boolean;
}

export interface QuestionChoice {
  /** Unique value for this choice. */
  value: string;
  /** Display label. */
  label: string;
  /** Optional description shown below the label. */
  description?: string;
}

type AskUserQuestionProps = {
  /** Title for the question block. */
  title?: string;
  /** One or more questions to present. */
  questions: Question[];
  /** Called with answers when the user submits. Keyed by question id. */
  onSubmit: (answers: Record<string, string>) => void;
  /** Optional className for the container. */
  className?: string;
};

/**
 * AskUserQuestion — renders a multi-question form for agent → user
 * interaction. Supports both free-text input and single-choice selection.
 *
 * Used when the agent needs clarification before proceeding (e.g. choosing
 * a design approach, confirming an action, or gathering requirements).
 */
export function AskUserQuestion({
  title,
  questions,
  onSubmit,
  className = "",
}: AskUserQuestionProps) {
  const { t } = useI18n();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Clear error for this question
    if (errors[questionId]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    for (const q of questions) {
      if (q.required && !answers[q.id]?.trim()) {
        newErrors[q.id] = t("askRequired");
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(answers);
  };

  const allAnswered = questions.every((q) => !q.required || answers[q.id]?.trim());

  return (
    <div
      className={`
        rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]
        p-4 space-y-4
        ${className}
      `}
      role="region"
      aria-label={t("askUserQuestion")}
    >
      {/* Header */}
      {title && (
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
          <HelpCircle size={16} className="text-[var(--color-brand)] shrink-0" />
          <span>{title}</span>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={q.id} className="space-y-2">
            <label
              htmlFor={`ask-q-${q.id}`}
              className="block text-sm text-[var(--color-text-primary)]"
            >
              <span className="text-[var(--color-text-secondary)] mr-1">{idx + 1}.</span>
              {q.text}
              {q.required && <span className="text-[var(--color-error)] ml-0.5">*</span>}
            </label>

            {/* Choice-based question */}
            {q.choices && q.choices.length > 0 ? (
              <div className="space-y-1.5">
                {q.choices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => handleAnswerChange(q.id, choice.value)}
                    className={`
                      w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors
                      ${
                        answers[q.id] === choice.value
                          ? "border-[var(--color-brand)] bg-[var(--color-brand)]/10 text-[var(--color-text-primary)]"
                          : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-primary)]"
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`
                          h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0
                          ${
                            answers[q.id] === choice.value
                              ? "border-[var(--color-brand)]"
                              : "border-[var(--color-border)]"
                          }
                        `}
                      >
                        {answers[q.id] === choice.value && (
                          <div className="h-2 w-2 rounded-full bg-[var(--color-brand)]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{choice.label}</div>
                        {choice.description && (
                          <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                            {choice.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              /* Free-text question */
              <input
                id={`ask-q-${q.id}`}
                type="text"
                value={answers[q.id] ?? ""}
                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                placeholder={q.placeholder ?? t("askPlaceholder")}
                className={`
                  w-full h-10 px-3 rounded-lg border text-sm outline-none transition-colors
                  bg-[var(--color-surface)] text-[var(--color-text-primary)]
                  placeholder:text-[var(--color-text-tertiary)]
                  ${
                    errors[q.id]
                      ? "border-[var(--color-error)]"
                      : "border-[var(--color-border)] focus:border-[var(--color-border-focus)] focus:shadow-[var(--shadow-focus-ring)]"
                  }
                `}
              />
            )}

            {errors[q.id] && (
              <p className="text-xs text-[var(--color-error)]">{errors[q.id]}</p>
            )}
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!allAnswered}
          icon={<ChevronRight size={14} />}
        >
          {t("askSubmit")}
        </Button>
      </div>
    </div>
  );
}
