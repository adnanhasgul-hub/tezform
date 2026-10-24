import type {
  CrfDraftValues,
  InvestigationValues,
  StoredInvestigationValues,
} from "../types/crf.ts";

export const legacyDvtWarning =
  "Bu kayıt eski veri yapısında her iki taraf için ortak DVT lokalizasyonu içeriyor. Sağ ve Sol lokalizasyonlarını ayrı ayrı doğrulayınız.";

type DvtValues = Pick<
  InvestigationValues,
  "dvtSide" | "dvtRightLocations" | "dvtLeftLocations"
>;

function hasCanonicalLocations(values: StoredInvestigationValues): boolean {
  return "dvtRightLocations" in values || "dvtLeftLocations" in values;
}

/** Historical common locations must never be guessed across two selected sides. */
export function ambiguousLegacyLocations(
  values: StoredInvestigationValues,
): string[] {
  return !hasCanonicalLocations(values) &&
    values.dvtSide?.includes("Sağ") &&
    values.dvtSide.includes("Sol") &&
    Array.isArray(values.dvtLocations)
    ? [...values.dvtLocations]
    : [];
}

/** Canonical read adapter; one-sided historical records have an unambiguous mapping. */
export function normalizeDvt(values: StoredInvestigationValues): DvtValues {
  const sides = [...(values.dvtSide ?? [])];
  const canonical = hasCanonicalLocations(values);
  const shared = values.dvtLocations ?? [];
  return {
    dvtSide: sides,
    dvtRightLocations: sides.includes("Sağ")
      ? [
          ...(canonical
            ? (values.dvtRightLocations ?? [])
            : sides.length === 1
              ? shared
              : []),
        ]
      : [],
    dvtLeftLocations: sides.includes("Sol")
      ? [
          ...(canonical
            ? (values.dvtLeftLocations ?? [])
            : sides.length === 1
              ? shared
              : []),
        ]
      : [],
  };
}

/** Hidden clinical answers never cross the persistence boundary. */
export function clearInactiveDvt(values: CrfDraftValues): CrfDraftValues {
  return { ...values, ...normalizeDvt(values) };
}

export function resolvedDvt(
  values: Pick<
    CrfDraftValues,
    "dvtSide" | "dvtRightLocations" | "dvtLeftLocations"
  >,
): boolean {
  return (
    values.dvtSide.length > 0 &&
    (!values.dvtSide.includes("Sağ") || values.dvtRightLocations.length > 0) &&
    (!values.dvtSide.includes("Sol") || values.dvtLeftLocations.length > 0)
  );
}
