import { inspect } from "node:util";
const escape = (value) =>
  String(value)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
// Test fixtures are synthetic. Publish failures as annotations for review even
// when the Actions API/log download is unavailable; never load production data.
export default async function* githubReporter(events) {
  for await (const event of events) {
    if (event.type === "test:fail") {
      yield `::error title=${escape(event.data.name)}::${escape(inspect(event.data.details.error, { depth: 5 }).slice(0, 7000))}\n`;
    }
  }
}
