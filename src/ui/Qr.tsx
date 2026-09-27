import qrcode from "qrcode-generator";
import { useMemo } from "preact/hooks";

/** QR code dessiné en pixels de phosphore, lisible par l’appareil photo d’un téléphone. */
export function Qr({ text, label }: { text: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + 2} ${row + 2}h1v1h-1z`;
      }
    }
    return { size: count + 4, path: d };
  }, [text]);
  return (
    <svg class="qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shape-rendering="crispEdges">
      <rect class="qr__bg" width={size} height={size} />
      <path class="qr__dots" d={path} />
    </svg>
  );
}
