import type { CrfField, CrfValue } from "../../types/crf";
import { getFieldAccessibleLabel } from "./sections";

interface Props {
  field: CrfField;
  value: CrfValue;
  onChange: (value: CrfValue) => void;
  onBlur: () => void;
  error?: string;
}

export function FormField({ field, value, onChange, onBlur, error }: Props) {
  const id = `crf-${field.id}`;
  const description =
    [field.hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  const label = getFieldAccessibleLabel(field);
  const className = `form-field${error ? " invalid-field" : ""}${field.when ? " conditional-field" : ""}`;
  const feedback = (
    <>
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
      {field.hint && (
        <p className="field-hint clinical-copy" id={`${id}-hint`}>
          {field.hint}
        </p>
      )}
    </>
  );

  if (field.kind === "multiselect" || field.kind === "radio") {
    const selected = Array.isArray(value) ? value : [];
    const longOptions = field.options.some((option) => option.length > 45);
    return (
      <fieldset
        id={id}
        tabIndex={-1}
        className={`${className} multi-choice-field`}
        aria-label={field.label ? undefined : label}
        aria-describedby={description}
        aria-invalid={error ? true : undefined}
        onBlur={onBlur}
      >
        {field.label && (
          <legend className="clinical-copy">{field.label}</legend>
        )}
        <div
          className={`multi-choice-options${longOptions ? " long-options" : ""}`}
        >
          {field.options.map((option, index) => (
            <label key={option} htmlFor={`${id}-${index}`}>
              <input
                id={`${id}-${index}`}
                name={field.id}
                type={field.kind === "radio" ? "radio" : "checkbox"}
                value={option}
                checked={
                  field.kind === "radio"
                    ? value === option
                    : selected.includes(option)
                }
                onChange={(event) =>
                  onChange(
                    field.kind === "radio"
                      ? option
                      : event.target.checked
                        ? [...selected, option]
                        : selected.filter((item) => item !== option),
                  )
                }
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
        {feedback}
      </fieldset>
    );
  }

  const common = {
    id,
    name: field.id,
    value:
      typeof value === "number"
        ? value.toFixed(1)
        : typeof value === "string"
          ? value
          : "",
    onBlur,
    "aria-label": field.label ? undefined : label,
    "aria-describedby": description,
    "aria-invalid": error ? true : undefined,
    onChange: (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => onChange(event.target.value),
  };
  return (
    <div
      className={`${className}${field.kind === "textarea" ? " full-width" : ""}`}
    >
      {field.label && (
        <label className="clinical-copy" htmlFor={id}>
          {field.label}
        </label>
      )}
      {field.prefix && <p className="field-prefix">{field.prefix}</p>}
      <div className="input-with-unit">
        {field.kind === "textarea" ? (
          <textarea {...common} rows={3} />
        ) : field.kind === "select" ? (
          <select {...common}>
            <option value="">Seçiniz</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            type={field.readOnly ? "text" : field.kind}
            readOnly={field.readOnly}
            inputMode={field.inputMode}
            autoComplete={field.id === "nationalId" ? "off" : undefined}
            min={field.min}
            max={field.max}
            step={
              field.kind === "number"
                ? field.integer
                  ? "1"
                  : "any"
                : undefined
            }
          />
        )}
        {field.unit && <span className="field-unit">{field.unit}</span>}
      </div>
      {feedback}
    </div>
  );
}
