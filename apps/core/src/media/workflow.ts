/**
 * M7-5 · 工作流选档（architecture L1581-1596：工作流文件只用三份）。
 *
 * characterSwap → swap-vdn；否则 useVdn && adapter → vdn；否则无 vdn；
 * useVdn 但缺 adapter → 回退无 vdn，不报错。
 */

export function pickWorkflowFile(opts: {
  characterSwap: boolean;
  useVdn: boolean;
  vdnAdapterAvailable: boolean;
}): string {
  if (opts.characterSwap) return "h3-character-swap-vdn.json";
  return opts.useVdn && opts.vdnAdapterAvailable
    ? "h3-ref2va-drama-vdn.json"
    : "h3-ref2va-drama.json";
}
