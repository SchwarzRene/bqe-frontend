// Shrinks a picture before it is sent: at most 1280 px on the long side, as a
// JPEG under ~600 kB. A phone photo is several megabytes and the account's
// space is shared; re-drawing it also leaves the camera's metadata, such as
// where it was taken, behind. The Worker takes at most 700 kB.

const MAX_SIDE = 1280;
const MAX_BYTES = 600_000;

export async function shrink(file) {
  if (!file.type.startsWith("image/")) throw new Error("That file is not a picture.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("This browser can't open that picture — try a JPEG or PNG."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // a transparent PNG becomes white, not black, as a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (let quality = 0.85; quality > 0.3; quality -= 0.15) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    throw new Error("That picture is too detailed to shrink enough — try another.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
