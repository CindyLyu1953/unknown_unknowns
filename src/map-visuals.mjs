export function conceptLabelFontSize(zoom, importance, selected = false) {
  const zoomGrowth = Math.max(0, Math.log2(Math.max(zoom, 0.35) / 0.5)) * 4;
  const hierarchyBase = importance === 1 ? 14 : importance === 2 ? 12 : 11;
  const selectedBoost = selected ? 2 : 0;
  return Math.round(Math.min(22, hierarchyBase + zoomGrowth + selectedBoost) * 10) / 10;
}
