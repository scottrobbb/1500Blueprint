import { parseTableBlock } from "@/lib/sat/table-markup";
import { MathText } from "./MathText";

/**
 * Renders question text block-by-block: a Markdown table (from the importer)
 * becomes a real <table>; every other block is a paragraph with caret-exponent
 * superscripts applied. Used wherever the text is not highlightable.
 */
export function QuestionContent({ text, pClassName }: { text: string; pClassName?: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <>
      {blocks.map((block, i) => {
        const rows = parseTableBlock(block);
        if (!rows) {
          return (
            <p key={i} className={pClassName}>
              <MathText>{block}</MathText>
            </p>
          );
        }
        const [head, ...body] = rows;
        return (
          <div key={i} className="mt-5 max-w-full overflow-x-auto pb-1">
            <table className="mx-auto w-max border-collapse font-serif text-[15px] text-exam-ink">
              <thead>
                <tr>
                  {head.map((c, j) => (
                    <th
                      key={j}
                      className="border border-exam-border px-3 py-1.5 text-center font-semibold"
                    >
                      <MathText>{c}</MathText>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((r, ri) => (
                  <tr key={ri}>
                    {r.map((c, ci) => (
                      <td
                        key={ci}
                        className={`border border-exam-border px-3 py-1.5 ${
                          ci === 0 ? "font-semibold" : "text-center"
                        }`}
                      >
                        <MathText>{c}</MathText>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}
