import { ImageResponse } from "next/og";

export const alt = "TeamOS — Team Knowledge Wiki";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #06060a 0%, #12121a 50%, #1a1530 100%)",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 96,
            height: 96,
            borderRadius: 20,
            background: "linear-gradient(135deg, #8b7ff4 0%, #6b5fd4 100%)",
            fontSize: 52,
            fontWeight: 800,
            marginBottom: 32,
          }}
        >
          T
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.02em" }}>TeamOS</div>
        <div style={{ fontSize: 28, color: "#94a3b8", marginTop: 16 }}>
          Team Knowledge Wiki
        </div>
      </div>
    ),
    { ...size },
  );
}
