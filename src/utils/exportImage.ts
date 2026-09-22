import type { DocumentField } from "../types/document";

type ImageMimeType = "image/png" | "image/jpeg";

interface LoadedImage {
  element: HTMLImageElement;
  width: number;
  height: number;
}

const DEFAULT_SIGNATURE_FONT =
  '"Brush Script MT", "Segoe Script", cursive';

const MIN_FONT_SIZE = 10;
const MAX_TEXT_FONT_SIZE = 32;
const MAX_DATE_FONT_SIZE = 30;
const MIN_SIGNATURE_FONT_SIZE = 14;
const MAX_SIGNATURE_FONT_SIZE = 72;

/* =========================================
   GENERAL HELPERS
   ========================================= */

function safeNumber(
  value: number,
  fallback = 0,
): number {
  return Number.isFinite(value)
    ? value
    : fallback;
}

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

function getSafeFieldDimensions(
  field: DocumentField,
  imageWidth: number,
  imageHeight: number,
) {
  /*
   * A malformed field should never create
   * negative canvas dimensions or push an
   * export outside the source image.
   */
  const width = clamp(
    safeNumber(field.width, 1),
    1,
    Math.max(1, imageWidth),
  );

  const height = clamp(
    safeNumber(field.height, 1),
    1,
    Math.max(1, imageHeight),
  );

  return {
    width,
    height,
  };
}

/* =========================================
   LOAD IMAGE
   ========================================= */

function loadImage(
  src: string,
): Promise<LoadedImage> {
  return new Promise(
    (resolve, reject) => {
      const image =
        new Image();

      image.onload = () => {
        const width =
          image.naturalWidth;

        const height =
          image.naturalHeight;

        if (
          width <= 0 ||
          height <= 0
        ) {
          reject(
            new Error(
              "Unable to determine image dimensions.",
            ),
          );
          return;
        }

        resolve({
          element: image,
          width,
          height,
        });
      };

      image.onerror = () => {
        reject(
          new Error(
            "Unable to load an image.",
          ),
        );
      };

      image.src = src;
    },
  );
}

/* =========================================
   FILE → DATA URL
   ========================================= */

function fileToDataUrl(
  file: File,
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload = () => {
        if (
          typeof reader.result !==
          "string"
        ) {
          reject(
            new Error(
              "Unable to read the image file.",
            ),
          );
          return;
        }

        resolve(
          reader.result,
        );
      };

      reader.onerror = () => {
        reject(
          new Error(
            "Unable to read the image file.",
          ),
        );
      };

      reader.readAsDataURL(file);
    },
  );
}

/* =========================================
   DOWNLOAD NAME
   ========================================= */

function getDownloadName(
  originalName: string,
  extension: "png" | "jpg",
): string {
  const baseName =
    originalName
      .replace(/\.[^/.]+$/, "")
      .trim() ||
    "signflow-document";

  return `${baseName}-signed.${extension}`;
}

/* =========================================
   FIELD POSITION
   ========================================= */

function clampFieldPosition(
  field: DocumentField,
  imageWidth: number,
  imageHeight: number,
) {
  const dimensions =
    getSafeFieldDimensions(
      field,
      imageWidth,
      imageHeight,
    );

  const fieldX =
    safeNumber(field.x);

  const fieldY =
    safeNumber(field.y);

  return {
    x: clamp(
      fieldX,
      0,
      Math.max(
        0,
        imageWidth -
          dimensions.width,
      ),
    ),

    y: clamp(
      fieldY,
      0,
      Math.max(
        0,
        imageHeight -
          dimensions.height,
      ),
    ),

    width:
      dimensions.width,

    height:
      dimensions.height,
  };
}

/* =========================================
   TEXT FIELD
   ========================================= */

function drawTextField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  const text =
    field.value.trim();

  if (!text) {
    return;
  }

  const padding =
    Math.max(
      4,
      Math.min(
        9,
        field.height * 0.18,
      ),
    );

  const availableWidth =
    Math.max(
      1,
      field.width -
        padding * 2,
    );

  let fontSize =
    clamp(
      field.height * 0.55,
      MIN_FONT_SIZE,
      MAX_TEXT_FONT_SIZE,
    );

  context.save();

  context.fillStyle =
    "#181818";

  context.textBaseline =
    "middle";

  context.textAlign =
    "left";

  /*
   * Reduce the font when necessary so
   * long values such as email addresses
   * remain readable instead of being
   * silently clipped by canvas maxWidth.
   */
  context.font =
    `${fontSize}px Arial, sans-serif`;

  while (
    fontSize >
      MIN_FONT_SIZE &&
    context.measureText(
      text,
    ).width >
      availableWidth
  ) {
    fontSize -= 1;

    context.font =
      `${fontSize}px Arial, sans-serif`;
  }

  context.fillText(
    text,
    field.x + padding,
    field.y +
      field.height / 2,
  );

  context.restore();
}

/* =========================================
   NAME FIELD
   ========================================= */

function drawNameField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  drawTextField(
    context,
    field,
  );
}

/* =========================================
   EMAIL FIELD
   ========================================= */

function drawEmailField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  drawTextField(
    context,
    field,
  );
}

/* =========================================
   DATE FIELD
   ========================================= */

function drawDateField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  const text =
    field.value.trim();

  if (!text) {
    return;
  }

  const padding =
    Math.max(
      4,
      Math.min(
        9,
        field.height * 0.18,
      ),
    );

  const availableWidth =
    Math.max(
      1,
      field.width -
        padding * 2,
    );

  let fontSize =
    clamp(
      field.height * 0.55,
      MIN_FONT_SIZE,
      MAX_DATE_FONT_SIZE,
    );

  context.save();

  context.fillStyle =
    "#181818";

  context.textBaseline =
    "middle";

  context.textAlign =
    "left";

  context.font =
    `${fontSize}px Arial, sans-serif`;

  while (
    fontSize >
      MIN_FONT_SIZE &&
    context.measureText(
      text,
    ).width >
      availableWidth
  ) {
    fontSize -= 1;

    context.font =
      `${fontSize}px Arial, sans-serif`;
  }

  context.fillText(
    text,
    field.x + padding,
    field.y +
      field.height / 2,
  );

  context.restore();
}

/* =========================================
   CHECKBOX
   ========================================= */

function drawCheckboxField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  const size =
    Math.min(
      field.width,
      field.height,
    );

  if (size <= 0) {
    return;
  }

  const left =
    field.x +
    (field.width - size) /
      2;

  const top =
    field.y +
    (field.height - size) /
      2;

  context.save();

  context.fillStyle =
    "#ffffff";

  context.strokeStyle =
    "#181818";

  const borderWidth =
    Math.max(
      1,
      Math.min(
        4,
        size * 0.07,
      ),
    );

  context.lineWidth =
    borderWidth;

  /*
   * White fill keeps the checkbox
   * visually consistent even when the
   * source image underneath is dark.
   */
  context.fillRect(
    left,
    top,
    size,
    size,
  );

  context.strokeRect(
    left +
      borderWidth / 2,
    top +
      borderWidth / 2,
    Math.max(
      1,
      size - borderWidth,
    ),
    Math.max(
      1,
      size - borderWidth,
    ),
  );

  if (
    field.value === "true"
  ) {
    context.beginPath();

    context.lineWidth =
      Math.max(
        2,
        size * 0.1,
      );

    context.lineCap =
      "round";

    context.lineJoin =
      "round";

    context.moveTo(
      left +
        size * 0.22,
      top +
        size * 0.52,
    );

    context.lineTo(
      left +
        size * 0.44,
      top +
        size * 0.74,
    );

    context.lineTo(
      left +
        size * 0.8,
      top +
        size * 0.28,
    );

    context.stroke();
  }

  context.restore();
}

/* =========================================
   SIGNATURE FIELD
   ========================================= */

async function drawSignatureField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  context.save();

  /*
   * DRAWN OR UPLOADED SIGNATURE
   */
  if (field.signatureImage) {
    try {
      const loaded =
        await loadImage(
          field.signatureImage,
        );

      if (
        loaded.width > 0 &&
        loaded.height > 0
      ) {
        /*
         * Preserve the signature's
         * aspect ratio.
         */
        const ratio =
          Math.min(
            field.width /
              loaded.width,
            field.height /
              loaded.height,
          );

        const width =
          loaded.width * ratio;

        const height =
          loaded.height * ratio;

        const x =
          field.x +
          (
            field.width -
            width
          ) / 2;

        const y =
          field.y +
          (
            field.height -
            height
          ) / 2;

        context.drawImage(
          loaded.element,
          x,
          y,
          width,
          height,
        );

        context.restore();

        return;
      }
    } catch (error) {
      console.warn(
        "Signature image could not be loaded. Falling back to typed signature if available.",
        error,
      );
    }
  }

  /*
   * TYPED SIGNATURE
   *
   * SignatureField stores typed signatures
   * in field.value, while drawn/uploaded
   * signatures use signatureImage.
   *
   * Therefore typed signatures must be
   * exported separately.
   */
  const signatureText =
    field.value.trim();

  if (!signatureText) {
    context.restore();
    return;
  }

  const font =
    field.signatureFont ||
    DEFAULT_SIGNATURE_FONT;

  const padding = 10;

  const availableWidth =
    Math.max(
      1,
      field.width -
        padding * 2,
    );

  let fontSize =
    clamp(
      field.height * 0.62,
      MIN_SIGNATURE_FONT_SIZE,
      MAX_SIGNATURE_FONT_SIZE,
    );

  context.fillStyle =
    "#181818";

  context.textBaseline =
    "middle";

  context.textAlign =
    "left";

  context.font =
    `${fontSize}px ${font}`;

  /*
   * Keep the entire typed signature
   * inside the field.
   */
  while (
    fontSize >
      MIN_SIGNATURE_FONT_SIZE &&
    context.measureText(
      signatureText,
    ).width >
      availableWidth
  ) {
    fontSize -= 1;

    context.font =
      `${fontSize}px ${font}`;
  }

  context.fillText(
    signatureText,
    field.x + padding,
    field.y +
      field.height / 2,
  );

  context.restore();
}

/* =========================================
   RENDER ALL FIELDS
   ========================================= */

async function renderFields(
  context: CanvasRenderingContext2D,
  fields: DocumentField[],
  imageWidth: number,
  imageHeight: number,
) {
  for (
    const originalField of fields
  ) {
    /*
     * Images are single page documents,
     * so only page 1 belongs on the image.
     */
    if (
      originalField.page !== 1
    ) {
      continue;
    }

    const position =
      clampFieldPosition(
        originalField,
        imageWidth,
        imageHeight,
      );

    const field: DocumentField = {
      ...originalField,

      x: position.x,
      y: position.y,

      width:
        position.width,

      height:
        position.height,
    };

    switch (
      field.type
    ) {
      case "text":
        drawTextField(
          context,
          field,
        );
        break;

      case "signature":
        await drawSignatureField(
          context,
          field,
        );
        break;

      case "date":
        drawDateField(
          context,
          field,
        );
        break;

      case "checkbox":
        drawCheckboxField(
          context,
          field,
        );
        break;

      case "name":
        drawNameField(
          context,
          field,
        );
        break;

      case "email":
        drawEmailField(
          context,
          field,
        );
        break;

      default:
        break;
    }
  }
}

/* =========================================
   DOWNLOAD
   ========================================= */

function triggerDownload(
  blob: Blob,
  filename: string,
) {
  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  anchor.href = url;

  anchor.download =
    filename;

  anchor.style.display =
    "none";

  document.body.appendChild(
    anchor,
  );

  anchor.click();

  anchor.remove();

  /*
   * Give the browser time to start
   * the download before releasing
   * the object URL.
   */
  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        url,
      );
    },
    1000,
  );
}

/* =========================================
   EXPORT IMAGE
   ========================================= */

export async function exportImage(
  file: File,
  fields: DocumentField[],
): Promise<void> {
  if (!file) {
    throw new Error(
      "No image document was provided.",
    );
  }

  const isPng =
    file.type ===
    "image/png";

  const isJpeg =
    file.type ===
    "image/jpeg";

  /*
   * Some browsers may provide an empty
   * MIME type for locally selected files,
   * so also accept the file extension.
   */
  const hasPngExtension =
    /\.png$/i.test(
      file.name,
    );

  const hasJpegExtension =
    /\.(jpe?g)$/i.test(
      file.name,
    );

  if (
    !isPng &&
    !isJpeg &&
    !hasPngExtension &&
    !hasJpegExtension
  ) {
    throw new Error(
      "Image export only supports PNG and JPEG files.",
    );
  }

  const outputType: ImageMimeType =
    isPng ||
    hasPngExtension
      ? "image/png"
      : "image/jpeg";

  const extension =
    outputType ===
    "image/png"
      ? "png"
      : "jpg";

  /*
   * Read the original image as a
   * data URL so it can safely be
   * rendered onto the export canvas.
   */
  const dataUrl =
    await fileToDataUrl(
      file,
    );

  const source =
    await loadImage(
      dataUrl,
    );

  /*
   * Preserve the source image's
   * exact native dimensions.
   *
   * This is important because the editor
   * stores image field coordinates in
   * original image coordinates.
   */
  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    source.width;

  canvas.height =
    source.height;

  const context =
    canvas.getContext(
      "2d",
    );

  if (!context) {
    throw new Error(
      "Your browser does not support canvas export.",
    );
  }

  context.imageSmoothingEnabled =
    true;

  context.imageSmoothingQuality =
    "high";

  /*
   * Draw the original image first.
   */
  context.drawImage(
    source.element,
    0,
    0,
    source.width,
    source.height,
  );

  /*
   * Draw every field on top of
   * the original image.
   *
   * Fields retain their editor
   * position and size.
   */
  await renderFields(
    context,
    fields,
    source.width,
    source.height,
  );

  /*
   * JPEG does not support transparency.
   *
   * The original image itself is already
   * the document background, so no separate
   * background layer is necessary.
   */
  const quality =
    outputType ===
    "image/jpeg"
      ? 0.92
      : undefined;

  const blob =
    await new Promise<
      Blob | null
    >(
      (resolve) => {
        canvas.toBlob(
          resolve,
          outputType,
          quality,
        );
      },
    );

  if (!blob) {
    throw new Error(
      "The browser could not create the exported image.",
    );
  }

  triggerDownload(
    blob,
    getDownloadName(
      file.name,
      extension,
    ),
  );
}
