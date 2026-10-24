export function readFreeNumbers(value: unknown): number[] {
  if (value == null) return [];
  if (
    !Array.isArray(value) ||
    value.some(
      (number, index) =>
        !Number.isSafeInteger(number) ||
        number < 0 ||
        (index > 0 && number <= value[index - 1]),
    )
  )
    throw new Error("Invalid reusable pool");
  return [...value];
}
export function releaseNumber(numbers: number[], number: number): number[] {
  if (!Number.isSafeInteger(number) || number < 0 || numbers.includes(number))
    throw new Error("Invalid reusable number");
  return [...numbers, number].sort((a, b) => a - b);
}
