const shell = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8" /><title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #fff; color: #211A11;
         font-family: "Space Mono", ui-monospace, monospace; }
  .sheet { width: 320px; margin: 0 auto; }
  h1, .display { font-family: "Fraunces", Georgia, serif; font-weight: 900; margin: 0; }
  .rule { border-top: 1px dashed rgba(33,26,17,.35); margin: 12px 0; }
  .row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin: 6px 0; }
  .muted { color: #6A5A45; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; }
  .total { font-family: "Fraunces", Georgia, serif; font-weight: 900; font-size: 22px; }
  .center { text-align: center; }
  svg { width: 200px; height: 200px; }
  @media print { body { padding: 0; } }
</style></head><body><div class="sheet">${body}</div>
<script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
</body></html>`;

export function printHtml(title: string, body: string) {
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) return false;
  w.document.open();
  w.document.write(shell(title, body));
  w.document.close();
  return true;
}
