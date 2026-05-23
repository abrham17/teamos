import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          background: "linear-gradient(135deg, #8b7ff4 0%, #6b5fd4 100%)",
          fontSize: 20,
          fontWeight: 800,
          color: "white",
        }}
      >
        T
      </div>
    ),
    { ...size },
  );
}
