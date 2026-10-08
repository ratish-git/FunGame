// One-off: render preview-src.svg -> preview.png (1200x630) using sharp.
const sharp = require("sharp");
const fs = require("fs");

const svg = fs.readFileSync("preview-src.svg");
sharp(svg, { density: 150 })
  .resize(1200, 630)
  .png()
  .toFile("preview.png")
  .then((info) => console.log("OK", info.width + "x" + info.height, info.size + " bytes"))
  .catch((err) => {
    console.error("FAIL", err.message);
    process.exit(1);
  });
