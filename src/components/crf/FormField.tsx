import { getMaxLength } from "./validation";
import type { CrfField, CrfValue } from "../../types/crf";

interface Props {
  field: CrfField;
  value: CrfValue;
  onChange: (value: CrfValue) => void;
  onBlur: () => void;
  error?: string;
}

export function FormField({ field, value, onChange, onBlur, error }: Props) {
  const id = `crf-${field.id}`;
  const common = {
    id,
    name: field.id,
    value: typeof value === "string" ? value : "",
    required: field.required,
    onBlur,
    "aria-invalid": error ? true : undefined,
    "aria-describedby":
      [field.hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
        .filter(Boolean)
        .join(" ") || undefined,
  };

  if (field.kind === "multiselect") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset
        id={id}
        tabIndex={-1}
        className={`form-field multi-choice-field${error ? " invalid-field" : ""}`}
        aria-describedby={common["aria-describedby"]}
        aria-invalid={common["aria-invalid"]}
        onBlur={onBlur}
      >
        <legend>
          {field.label}
          {field.required && <span aria-hidden="true"> *</span>}
        </legend>
        <div className="multi-choice-options">
          {field.options.map((option, index) => (
            <label key={option} htmlFor={`${id}-${index}`}>
              <input
                id={`${id}-${index}`}
                name={field.id}
                type="checkbox"
                value={option}
                checked={selected.includes(option)}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, option]
                      : selected.filter((item) => item !== option),
                  )
                }
              />
              {option}
            </label>
          ))}
        </div>
        {error && (
          <p className="field-error" id={`${id}-error`}>
            {error}
          </p>
        )}
        {field.hint && (
          <p className="field-hint" id={`${id}-hint`}>
            {field.hint}
          </p>
        )}
      </fieldset>
    );
  }

  return (
    <div
      className={`form-field${error ? " invalid-field" : ""}${field.kind === "textarea" ? " full-width" : ""}`}
    >
      <label htmlFor={id}>
        {field.label}
        {field.required && <span aria-hidden="true"> *</span>}
      </label>
      {field.kind === "select" ? (
        <select {...common} onChange={(event) => onChange(event.target.value)}>
          <option value="">Seçiniz</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.kind === "textarea" ? (
        <textarea
          {...common}
          rows={3}
          maxLength={getMaxLength(field)}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...common}
          type={field.kind}
          min={field.kind === "number" ? field.min : undefined}
          max={field.kind === "number" ? field.max : undefined}
          step={field.kind === "number" ? (field.step ?? "1") : undefined}
          maxLength={getMaxLength(field)}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {field.hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {field.hint}
        </p>
      )}
    </div>
  );
}
