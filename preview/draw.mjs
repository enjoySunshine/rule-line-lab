import fs from "node:fs";
import { openSync } from "fontkit";

const font = openSync(
  new URL("../test/data/OpenSans/OpenSans-Regular.ttf", import.meta.url),
);

// The cover title is a single line: A, a space, and another A.
const text = "A A";

// The rule hangs below the baseline, and follows the line: its top edge sits
// at the font's underline position (-154 for OpenSans Regular), and its
// thickness is the font's underline thickness (102), so the bottom edge is
// -256. Only these two values locate the rule — the glyphs stay where they are.
const underlineTop = font.underlinePosition; // -154
const underlineThickness = font.underlineThickness; // 102
const underlineBottom = underlineTop - underlineThickness; // -256

// Glyph origins come from the advances alone: 1296, 532, 1296. The space has
// no outline, but its 532-unit advance is still part of the rule's length.
const run = font.layout(text);
const glyphOrigins = [];
let pen = 0;
for (const position of run.positions) {
  glyphOrigins.push(pen + position.xOffset);
  pen += position.xAdvance;
}

const lineLeft = 0;
const lineRight = pen; // 1296 + 532 + 1296 = 3124
const lineWidth = lineRight - lineLeft;

// The rule is one unbroken segment from the first glyph's origin to the pen
// position after the last glyph. It must equal the run advance and must span
// the space between the two A's, not stop at their ink.
const spaceIndex = run.glyphs.findIndex((g) => g.path.commands.length === 0);
if (lineWidth !== run.advanceWidth) {
  throw new Error(`rule width ${lineWidth} != run advance ${run.advanceWidth}`);
}
if (spaceIndex >= 0) {
  const spaceStart = glyphOrigins[spaceIndex];
  const spaceEnd = spaceStart + run.positions[spaceIndex].xAdvance;
  if (lineLeft > spaceStart || lineRight < spaceEnd) {
    throw new Error(`rule does not cover the space ${spaceStart}..${spaceEnd}`);
  }
  if (spaceEnd >= lineRight) {
    throw new Error("rule must extend past the space to the second A");
  }
}

// Include both the glyphs' ink and the rule in the scene, with a little
// breathing room so neither the ink nor the rule touches the frame.
const pad = 60;
const runBox = run.bbox;
const scene = {
  minX: Math.min(lineLeft, runBox.minX) - pad,
  maxX: Math.max(lineRight, runBox.maxX) + pad,
  minY: Math.min(underlineBottom, runBox.minY) - pad,
  maxY: Math.max(underlineTop, runBox.maxY) + pad,
};

const glyphPaths = run.glyphs
  .map((glyph, index) => {
    const d = glyph.path.toSVG();
    if (!d) {
      // The space is blank on purpose; the rule below it is not.
      return "";
    }

    // scale(1, -1) flips the font's y-up outline into SVG's y-down space
    // without rewriting it: each A still starts at M1120 0.
    return `  <path d="${d}" transform="translate(${glyphOrigins[index]} 0) scale(1,-1)"/>`;
  })
  .filter(Boolean)
  .join("\n");

// In SVG's y-down coordinates, the rule's top edge -154 becomes y 154.
const ruleY = -underlineTop;

const width = Math.ceil(scene.maxX - scene.minX);
const height = Math.ceil(scene.maxY - scene.minY);
const displayWidth = 1200;
const displayHeight = Math.round((displayWidth * height) / width);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${scene.minX} ${-scene.maxY} ${width} ${height}" width="${displayWidth}" height="${displayHeight}">
  <rect x="${scene.minX}" y="${-scene.maxY}" width="${width}" height="${height}" fill="#111"/>
  <g fill="#f4f1ea">
${glyphPaths}
  </g>
  <rect x="${lineLeft}" y="${ruleY}" width="${lineWidth}" height="${underlineThickness}" fill="#f4f1ea"/>
</svg>
`;

fs.writeFileSync(new URL("./out.svg", import.meta.url), svg);

console.log(
  "wrote preview/out.svg",
  `rule x=${lineLeft}..${lineRight} width=${lineWidth}`,
  `top=${underlineTop} bottom=${underlineBottom} thickness=${underlineThickness}`,
  `glyph origins=${glyphOrigins.join(",")}`,
);
