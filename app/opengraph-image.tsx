import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The card iMessage, Slack, Discord, and X draw when the site is shared. It
// lives at the root so every route inherits it; a segment that needs its own
// card adds its own opengraph-image and wins over this one.
export const alt = "1500 Blueprint — full-length adaptive digital SAT practice tests, question bank, and courses";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Read at module scope so this happens once while the route is prerendered,
// not per request. Everything is inlined rather than fetched: the card has to
// render during the build that produces it, before the URL it would fetch from
// is live.
const [gabaritoBold, gabaritoBlack, mark] = await Promise.all([
  readFile(join(process.cwd(), "assets/og/gabarito-700.ttf")),
  readFile(join(process.cwd(), "assets/og/gabarito-900.ttf")),
  readFile(join(process.cwd(), "assets/og/blu-mark.png")),
]);
const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "76px 80px",
          backgroundColor: "#0b2a5b",
          backgroundImage: "linear-gradient(135deg, #0b2a5b 0%, #16407f 58%, #0b2a5b 100%)",
          fontFamily: "Gabarito",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            display: "flex",
            top: -180,
            right: -150,
            width: 560,
            height: 560,
            borderRadius: 560,
            backgroundColor: "rgba(63, 169, 245, 0.16)",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <img src={markSrc} width={104} height={104} alt="" />
          <div
            style={{
              display: "flex",
              fontSize: 52,
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: -1,
            }}
          >
            1500 Blueprint
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 106,
              fontWeight: 900,
              color: "#ffffff",
              letterSpacing: -3,
              lineHeight: 1,
            }}
          >
            Crush the SAT.
          </div>
          <div
            style={{
              display: "flex",
              maxWidth: 900,
              fontSize: 34,
              fontWeight: 700,
              color: "#7ccbff",
              lineHeight: 1.35,
            }}
          >
            6 full-length adaptive tests, a 1250+ question bank, and weekly classes with Scott.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 30,
            fontWeight: 700,
            color: "rgba(255, 255, 255, 0.72)",
          }}
        >
          1500blueprint.com
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Gabarito", data: gabaritoBold, weight: 700, style: "normal" },
        { name: "Gabarito", data: gabaritoBlack, weight: 900, style: "normal" },
      ],
    },
  );
}
