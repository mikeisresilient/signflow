import type { DocumentField } from "../types/document";

type ImageMimeType = "image/png" | "image/jpeg";

interface LoadedImage {
  element: HTMLImageElement;
  width: number;
  height: number;
}

const DEFAULT_SIGNATURE_FONT =
  '"Brush Script MT", "Segoe Script", cursive';

function loadImage(src: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        element: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };

    image.onerror = () => {
      reject(new Error("Unable to load an image."));
    };

    image.src = src;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read the image file."));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("Unable to read the image file."));
    };

    reader.readAsDataURL(file);
  });
}

function getDownloadName(
  originalName: string,
  extension: "png" | "jpg",
): string {
  const baseName =
    originalName.replace(/\.[^/.]+$/, "") ||
    "signflow-document";

  return `${baseName}-signed.${extension}`;
}

function clampFieldPosition(
  field: DocumentField,
  imageWidth: number,
  imageHeight: number,
) {
  return {
    x: Math.max(
      0,
      Math.min(field.x, Math.max(0, imageWidth - field.width)),
    ),
    y: Math.max(
      0,
      Math.min(field.y, Math.max(0, imageHeight - field.height)),
    ),
  };
}

function drawTextField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  const padding = Math.max(4, Math.min(9, field.height * 0.18));
  const fontSize = Math.max(
    12,
    Math.min(32, field.height * 0.55),
  );

  context.font = `${fontSize}px Arial, sans-serif`;
  context.fillStyle = "#181818";
  context.textBaseline = "middle";

  const text = field.value.trim();

  if (!text) {
    return;
  }

  context.fillText(
    text,
    field.x + padding,
    field.y + field.height / 2,
    Math.max(1, field.width - padding * 2),
  );
}

function drawNameField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  drawTextField(context, field);
}

function drawEmailField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  drawTextField(context, field);
}

function drawDateField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  const padding = Math.max(4, Math.min(9, field.height * 0.18));
  const fontSize = Math.max(
    12,
    Math.min(30, field.height * 0.55),
  );

  context.font = `${fontSize}px Arial, sans-serif`;
  context.fillStyle = "#181818";
  context.textBaseline = "middle";

  context.fillText(
    field.value,
    field.x + padding,
    field.y + field.height / 2,
    Math.max(1, field.width - padding * 2),
  );
}

function drawCheckboxField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  const size = Math.min(field.width, field.height);
  const left = field.x + (field.width - size) / 2;
  const top = field.y + (field.height - size) / 2;

  context.save();

  context.strokeStyle = "#181818";
  context.lineWidth = Math.max(2, size * 0.07);
  context.strokeRect(
    left + context.lineWidth / 2,
    top + context.lineWidth / 2,
    size - context.lineWidth,
    size - context.lineWidth,
  );

  if (field.value === "true") {
    context.beginPath();
    context.lineWidth = Math.max(2, size * 0.1);
    context.lineCap = "round";
    context.lineJoin = "round";

    context.moveTo(
      left + size * 0.22,
      top + size * 0.52,
    );

    context.lineTo(
      left + size * 0.44,
      top + size * 0.74,
    );

    context.lineTo(
      left + size * 0.8,
      top + size * 0.28,
    );

    context.stroke();
  }

  context.restore();
}

async function drawSignatureField(
  context: CanvasRenderingContext2D,
  field: DocumentField,
) {
  context.save();

  if (field.signatureImage) {
    try {
      const loaded = await loadImage(
        field.signatureImage,
      );

      const ratio = Math.min(
        field.width / loaded.width,
        field.height / loaded.height,
      );

      const width =
        loaded.width * ratio;

      const height =
        loaded.height * ratio;

      const x =
        field.x + (field.width - width) / 2;

      const y =
        field.y + (field.height - height) / 2;

      context.drawImage(
        loaded.element,
        x,
        y,
        width,
        height,
      );

      context.restore();
      return;
    } catch (error) {
      console.warn(
        "Signature image could not be loaded.",
        error,
      );
    }
  }

  const signatureText =
    field.value.trim();

  if (signatureText) {
    const font =
      field.signatureFont ||
      DEFAULT_SIGNATURE_FONT;

    const fontSize = Math.max(
      22,
      Math.min(72, field.height * 0.62),
    );

    context.font = `${fontSize}px ${font}`;
    context.fillStyle = "#181818";
    context.textBaseline = "middle";

    context.fillText(
      signatureText,
      field.x + 10,
      field.y + field.height / 2,
      Math.max(1, field.width - 20),
    );
  }

  context.restore();
}

async function renderFields(
  context: CanvasRenderingContext2D,
  fields: DocumentField[],
  imageWidth: number,
  imageHeight: number,
) {
  for (const originalField of fields) {
    if (originalField.page !== 1) {
      continue;
    }

    const position = clampFieldPosition(
      originalField,
      imageWidth,
      imageHeight,
    );

    const field: DocumentField = {
      ...originalField,
      x: position.x,
      y: position.y,
    };

    switch (field.type) {
      case "text":
        drawTextField(context, field);
        break;

      case "signature":
        await drawSignatureField(context, field);
        break;

      case "date":
        drawDateField(context, field);
        break;

      case "checkbox":
        drawCheckboxField(context, field);
        break;

      case "name":
        drawNameField(context, field);
        break;

      case "email":
        drawEmailField(context, field);
        break;

      default:
        break;
    }
  }
}

function triggerDownload(
  blob: Blob,
  filename: string,
) {
  const url =
    URL.createObjectURL(blob);

  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export async function exportImage(
  file: File,
  fields: DocumentField[],
): Promise<void> {
  if (
    file.type !== "image/png" &&
    file.type !== "image/jpeg"
  ) {
    throw new Error(
      "Image export only supports PNG and JPEG files.",
    );
  }

  const dataUrl =
    await fileToDataUrl(file);

  const source =
    await loadImage(dataUrl);

  const canvas =
    document.createElement("canvas");

  canvas.width =
    source.width;

  canvas.height =
    source.height;

  const context =
    canvas.getContext("2d");

  if (!context) {
    throw new Error(
      "Your browser does not support canvas export.",
    );
  }

  /*
   * JPG has no transparent background.
   * The uploaded image itself is already the
   * background, so no additional fill is needed.
   */
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  context.drawImage(
    source.element,
    0,
    0,
    source.width,
    source.height,
  );

  await renderFields(
    context,
    fields,
    source.width,
    source.height,
  );

  const outputType: ImageMimeType =
    file.type === "image/png"
      ? "image/png"
      : "image/jpeg";

  const extension =
    outputType === "image/png"
      ? "png"
      : "jpg";

  const quality =
    outputType === "image/jpeg"
      ? 0.92
      : undefined;

  const blob =
    await new Promise<Blob | null>(
      (resolve) =>
        canvas.toBlob(
          resolve,
          outputType,
          quality,
        ),
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
