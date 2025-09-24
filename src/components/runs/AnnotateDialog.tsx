function normBoxToCenterStyle(b: { x: number; y: number; w: number; h: number; angle?: number }): React.CSSProperties {
    const r = getRenderRect();
    const angle = typeof b.angle === "number" ? b.angle : 0;
    if (!r) {
      // Fallback en pourcentage, rotation autour du centre via translate(-50%,-50%)
      const left = `${(clamp01(b.x) + clamp01(b.w) / 2) * 100}%`;
      const top = `${(clamp01(b.y) + clamp01(b.h) / 2) * 100}%`;
      const width = `${clamp01(b.w) * 100}%`;
      const height = `${clamp01(b.h) * 100}%`;
      return {
        left,
        top,
        width,
        height,
        transformOrigin: "center",
        transform: `translate(-50%, -50%) rotate(${angle}deg)`,
      };
    }
    const leftPx = r.offsetX + (b.x + b.w / 2) * r.drawW;
    const topPx = r.offsetY + (b.y + b.h / 2) * r.drawH;
    const widthPx = b.w * r.drawW;
    const heightPx = b.h * r.drawH;
    return {
      left: leftPx,
      top: topPx,
      width: widthPx,
      height: heightPx,
      transformOrigin: "center",
      transform: `translate(-50%, -50%) rotate(${angle}deg)`,
    };
  }