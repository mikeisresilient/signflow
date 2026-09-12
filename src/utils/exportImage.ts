import type {
  DocumentField,
} from "../types/document";

interface ExportImageOptions {
  file: File;
  fields: DocumentField[];
}

const loadImage =
  (
    source: string,
  ): Promise<HTMLImageElement> =>
    new Promise(
      (resolve, reject) => {
        const image =
          new Image();

        image.onload = () =>
          resolve(image);

        image.onerror = () =>
          reject(
            new Error(
              "Unable to load image.",
            ),
          );

        image.src = source;
      },
    );

const loadFileAsDataUrl =
  (
    file: File,
  ): Promise<string> =>
    new Promise(
      (resolve, reject) => {
        const reader =
          new FileReader();

        reader.onload = () => {
          if (
            typeof reader.result ===
            "string"
          ) {
            resolve(
              reader.result,
            );
          } else {
            reject(
              new Error(
                "Unable to read image.",
              ),
            );
          }
        };

        reader.onerror = () =>
          reject(
            new Error(
              "Unable to read image.",
            ),
          );

        reader.readAsDataURL(file);
      },
    );

const drawTextField = (
  context: CanvasRenderingContext2D,
  field: DocumentField,
) => {
  if (!field.value) {
    return;
  }

  const fontSize =
    Math.max(
      12,
      field.height * 0.55,
    );

  context.save();

  context.fillStyle =
    "#181818";

  context.font =
    `${fontSize}px Arial, sans-serif`;

  context.textBaseline =
    "middle";

  context.textAlign =
    "left";

  const padding =
    Math.max(
      6,
      field.height * 0.18,
    );

  context.fillText(
    field.value,
    field.x + padding,
    field.y +
      field.height / 2,
  );

  context.restore();
};

const drawSignatureField =
  async (
    context: CanvasRenderingContext2D,
    field: DocumentField,
  ) => {
    /*
     * Draw an existing signature image
     * when the signature field contains
     * one.
     */
    if (
      field.signatureImage
    ) {
      try {
        const signature =
          await loadImage(
            field.signatureImage,
          );

        const padding =
          Math.max(
            4,
            field.height * 0.06,
          );

        const availableWidth =
          Math.max(
            1,
            field.width -
              padding * 2,
          );

        const availableHeight =
          Math.max(
            1,
            field.height -
              padding * 2,
          );

        const imageRatio =
          signature.width /
          signature.height;

        const boxRatio =
          availableWidth /
          availableHeight;

        let drawWidth =
          availableWidth;

        let drawHeight =
          availableHeight;

        if (
          imageRatio >
          boxRatio
        ) {
          drawHeight =
            drawWidth /
            imageRatio;
        } else {
          drawWidth =
            drawHeight *
            imageRatio;
        }

        const drawX =
          field.x +
          (field.width -
            drawWidth) /
            2;

        const drawY =
          field.y +
          (field.height -
            drawHeight) /
            2;

        context.drawImage(
          signature,
          drawX,
          drawY,
          drawWidth,
          drawHeight,
        );

        return;
      } catch {
        /*
         * If the signature image cannot
         * be loaded, fall through to
         * typed signature rendering.
         */
      }
    }

    /*
     * Typed signature fallback.
     */
    if (
      field.value
    ) {
      const fontSize =
        Math.max(
          18,
          field.height *
            0.62,
        );

      context.save();

      context.fillStyle =
        "#181818";

      context.font =
        `${fontSize}px ${field.signatureFont ?? '"Brush Script MT", "Segoe Script", cursive'}`;

      context.textBaseline =
        "middle";

      context.textAlign =
        "center";

      context.fillText(
        field.value,
        field.x +
          field.width / 2,
        field.y +
          field.height / 2,
      );

      context.restore();
    }
  };

const drawDateField = (
  context: CanvasRenderingContext2D,
  field: DocumentField,
) => {
  if (!field.value) {
    return;
  }

  const fontSize =
    Math.max(
      12,
      field.height * 0.52,
    );

  context.save();

  context.fillStyle =
    "#181818";

  context.font =
    `${fontSize}px Arial, sans-serif`;

  context.textBaseline =
    "middle";

  context.textAlign =
    "left";

  const padding =
    Math.max(
      6,
      field.height * 0.18,
    );

  context.fillText(
    field.value,
    field.x + padding,
    field.y +
      field.height / 2,
  );

  context.restore();
};

const drawCheckboxField = (
  context: CanvasRenderingContext2D,
  field: DocumentField,
) => {
  const size =
    Math.min(
      field.width,
      field.height,
    );

  const boxX =
    field.x +
    (field.width -
      size) /
      2;

  const boxY =
    field.y +
    (field.height -
      size) /
      2;

  context.save();

  context.strokeStyle =
    "#181818";

  context.lineWidth =
    Math.max(
      1,
      size * 0.055,
    );

  context.strokeRect(
    boxX,
    boxY,
    size,
    size,
  );

  if (
    field.value ===
    "true"
  ) {
    context.strokeStyle =
      "#181818";

    context.lineWidth =
      Math.max(
        2,
        size * 0.09,
      );

    context.lineCap =
      "round";

    context.lineJoin =
      "round";

    context.beginPath();

    context.moveTo(
      boxX +
        size * 0.2,
      boxY +
        size * 0.52,
    );

    context.lineTo(
      boxX +
        size * 0.43,
      boxY +
        size * 0.75,
    );

    context.lineTo(
      boxX +
        size * 0.82,
      boxY +
        size * 0.27,
    );

    context.stroke();
  }

  context.restore();
};

const drawField = async (
  context: CanvasRenderingContext2D,
  field: DocumentField,
) => {
  switch (field.type) {
    case "text":
    case "name":
    case "email":
      drawTextField(
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

    case "signature":
      await drawSignatureField(
        context,
        field,
      );
      break;

    default:
      break;
  }
};

const getExportName = (
  fileName: string,
) => {
  const lastDot =
    fileName.lastIndexOf(
      ".",
    );

  const baseName =
    lastDot > 0
      ? fileName.slice(
          0,
          lastDot,
        )
      : fileName;

  return `${baseName}-signed`;
};

export async function downloadExportedImage(
  options: ExportImageOptions,
) {
  const {
    file,
    fields,
  } = options;

  const source =
    await loadFileAsDataUrl(
      file,
    );

  const image =
    await loadImage(
      source,
    );

  const canvas =
    document.createElement(
      "canvas",
    );

  canvas.width =
    image.naturalWidth ||
    image.width;

  canvas.height =
    image.naturalHeight ||
    image.height;

  const context =
    canvas.getContext(
      "2d",
    );

  if (!context) {
    throw new Error(
      "Unable to create image canvas.",
    );
  }

  /*
   * Draw the original image at
   * its original resolution.
   */
  context.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  /*
   * Draw all document fields
   * on top of the original image.
   */
  for (
    const field of fields
  ) {
    await drawField(
      context,
      field,
    );
  }

  const mimeType =
    file.type ===
    "image/jpeg"
      ? "image/jpeg"
      : "image/png";

  const quality =
    mimeType ===
    "image/jpeg"
      ? 0.92
      : undefined;

  const blob =
    await new Promise<Blob | null>(
      (resolve) => {
        canvas.toBlob(
          resolve,
          mimeType,
          quality,
        );
      },
    );

  if (!blob) {
    throw new Error(
      "Unable to create exported image.",
    );
  }

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
    `${getExportName(file.name)}.${
      mimeType ===
      "image/jpeg"
        ? "jpg"
        : "png"
    }`;

  document.body.appendChild(
    anchor,
  );

  anchor.click();

  anchor.remove();

  URL.revokeObjectURL(
    url,
  );
}