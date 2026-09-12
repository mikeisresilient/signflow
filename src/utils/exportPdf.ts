import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";

import type { DocumentField } from "../types/document";

interface ExportPdfOptions {
  file: File;
  fields: DocumentField[];
}

const EDITOR_PAGE_WIDTH = 820;

/* =========================================
   DATA URL → BYTES
   ========================================= */

const dataUrlToBytes = (
  dataUrl: string,
): Uint8Array => {
  const base64 =
    dataUrl.split(",")[1];

  if (!base64) {
    throw new Error(
      "Invalid image data.",
    );
  }

  const binaryString =
    atob(base64);

  const bytes =
    new Uint8Array(
      binaryString.length,
    );

  for (
    let index = 0;
    index < binaryString.length;
    index += 1
  ) {
    bytes[index] =
      binaryString.charCodeAt(
        index,
      );
  }

  return bytes;
};

/* =========================================
   DRAW WRAPPED TEXT
   ========================================= */

const drawWrappedText = (
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  fontSize: number,
) => {
  const words =
    text.split(/\s+/);

  const lines: string[] = [];

  let currentLine = "";

  for (const word of words) {
    const testLine =
      currentLine.length > 0
        ? `${currentLine} ${word}`
        : word;

    const testWidth =
      font.widthOfTextAtSize(
        testLine,
        fontSize,
      );

    if (
      testWidth <= width ||
      currentLine.length === 0
    ) {
      currentLine =
        testLine;
    } else {
      lines.push(
        currentLine,
      );

      currentLine =
        word;
    }
  }

  if (currentLine) {
    lines.push(
      currentLine,
    );
  }

  const lineHeight =
    fontSize * 1.35;

  lines.forEach(
    (line, index) => {
      page.drawText(
        line,
        {
          x,
          y:
            y -
            index *
              lineHeight,
          size: fontSize,
          font,
          color: rgb(
            0.1,
            0.1,
            0.1,
          ),
        },
      );
    },
  );
};

/* =========================================
   DRAW TEXT FIELD
   ========================================= */

const drawTextField = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
  font: PDFFont,
) => {
  if (!field.value) {
    return;
  }

  const pdfX =
    field.x * scale;

  const pdfY =
    page.getHeight() -
    (field.y +
      field.height) *
      scale;

  const pdfWidth =
    field.width * scale;

  const pdfHeight =
    field.height * scale;

  const fontSize =
    Math.max(
      8,
      Math.min(
        18,
        pdfHeight * 0.48,
      ),
    );

  drawWrappedText(
    page,
    field.value,
    pdfX + 5,
    pdfY +
      pdfHeight -
      fontSize -
      4,
    pdfWidth - 10,
    font,
    fontSize,
  );
};

/* =========================================
   DRAW DATE FIELD
   ========================================= */

const drawDateField = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
  font: PDFFont,
) => {
  if (!field.value) {
    return;
  }

  const pdfX =
    field.x * scale;

  const pdfY =
    page.getHeight() -
    (field.y +
      field.height) *
      scale;

  const pdfHeight =
    field.height * scale;

  const fontSize =
    Math.max(
      8,
      Math.min(
        16,
        pdfHeight * 0.45,
      ),
    );

  page.drawText(
    field.value,
    {
      x: pdfX + 5,
      y:
        pdfY +
        (pdfHeight -
          fontSize) /
          2 +
        1,
      size: fontSize,
      font,
      color: rgb(
        0.1,
        0.1,
        0.1,
      ),
    },
  );
};

/* =========================================
   DRAW NAME FIELD
   ========================================= */

const drawNameField = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
  font: PDFFont,
) => {
  if (!field.value) {
    return;
  }

  drawTextField(
    page,
    field,
    scale,
    font,
  );
};

/* =========================================
   DRAW EMAIL FIELD
   ========================================= */

const drawEmailField = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
  font: PDFFont,
) => {
  if (!field.value) {
    return;
  }

  drawTextField(
    page,
    field,
    scale,
    font,
  );
};

/* =========================================
   DRAW CHECKBOX
   ========================================= */

const drawCheckboxField = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
) => {
  const pdfX =
    field.x * scale;

  const pdfY =
    page.getHeight() -
    (field.y +
      field.height) *
      scale;

  const pdfWidth =
    field.width * scale;

  const pdfHeight =
    field.height * scale;

  const borderWidth =
    Math.max(
      1,
      2 * scale,
    );

  const isChecked =
    field.value === "true";

  page.drawRectangle({
    x: pdfX,
    y: pdfY,
    width: pdfWidth,
    height: pdfHeight,
    borderWidth,
    borderColor:
      rgb(
        0.1,
        0.1,
        0.1,
      ),
    color: isChecked
      ? rgb(
          0.1,
          0.1,
          0.1,
        )
      : rgb(
          1,
          1,
          1,
        ),
  });

  if (!isChecked) {
    return;
  }

  const padding =
    pdfWidth * 0.2;

  const checkThickness =
    Math.max(
      1.5,
      pdfWidth * 0.08,
    );

  const checkColor =
    rgb(
      1,
      1,
      1,
    );

  /*
   * First stroke.
   */
  page.drawLine({
    start: {
      x:
        pdfX +
        padding,

      y:
        pdfY +
        pdfHeight *
          0.5,
    },

    end: {
      x:
        pdfX +
        pdfWidth *
          0.42,

      y:
        pdfY +
        padding,
    },

    thickness:
      checkThickness,

    color:
      checkColor,
  });

  /*
   * Second stroke.
   */
  page.drawLine({
    start: {
      x:
        pdfX +
        pdfWidth *
          0.42,

      y:
        pdfY +
        padding,
    },

    end: {
      x:
        pdfX +
        pdfWidth -
        padding,

      y:
        pdfY +
        pdfHeight *
          0.78,
    },

    thickness:
      checkThickness,

    color:
      checkColor,
  });
};

/* =========================================
   DRAW SIGNATURE
   ========================================= */

const drawSignatureField =
  async (
    page: PDFPage,
    field: DocumentField,
    scale: number,
    pdfDoc: PDFDocument,
  ) => {
    if (
      !field.signatureImage
    ) {
      return;
    }

    const imageBytes =
      dataUrlToBytes(
        field.signatureImage,
      );

    let image;

    /*
     * SignatureField currently
     * stores the drawn signature
     * as PNG data.
     *
     * Try PNG first.
     */
    try {
      image =
        await pdfDoc.embedPng(
          imageBytes,
        );
    } catch {
      /*
       * Fall back to JPG in case
       * an uploaded signature is
       * stored as JPEG.
       */
      try {
        image =
          await pdfDoc.embedJpg(
            imageBytes,
          );
      } catch {
        console.error(
          "Unable to embed signature image.",
        );

        return;
      }
    }

    const pdfX =
      field.x * scale;

    const pdfY =
      page.getHeight() -
      (field.y +
        field.height) *
        scale;

    const pdfWidth =
      field.width * scale;

    const pdfHeight =
      field.height * scale;

    page.drawImage(
      image,
      {
        x: pdfX,
        y: pdfY,
        width: pdfWidth,
        height: pdfHeight,
      },
    );
  };

/* =========================================
   EXPORT PDF
   ========================================= */

export async function exportPdf({
  file,
  fields,
}: ExportPdfOptions): Promise<Uint8Array> {
  const fileBytes =
    await file.arrayBuffer();

  const pdfDoc =
    await PDFDocument.load(
      fileBytes,
    );

  const font =
    await pdfDoc.embedFont(
      StandardFonts.Helvetica,
    );

  const pages =
    pdfDoc.getPages();

  /*
   * Render every field onto
   * its corresponding PDF page.
   */
  for (
    const field of fields
  ) {
    const pageIndex =
      field.page - 1;

    if (
      pageIndex < 0 ||
      pageIndex >= pages.length
    ) {
      continue;
    }

    const page =
      pages[pageIndex];

    /*
     * React-PDF displays the page
     * at 820px wide.
     *
     * Convert editor coordinates
     * into native PDF coordinates.
     */
    const scale =
      page.getWidth() /
      EDITOR_PAGE_WIDTH;

    switch (
      field.type
    ) {
      case "text":
        drawTextField(
          page,
          field,
          scale,
          font,
        );
        break;

      case "name":
        drawNameField(
          page,
          field,
          scale,
          font,
        );
        break;

      case "email":
        drawEmailField(
          page,
          field,
          scale,
          font,
        );
        break;

      case "date":
        drawDateField(
          page,
          field,
          scale,
          font,
        );
        break;

      case "checkbox":
        drawCheckboxField(
          page,
          field,
          scale,
        );
        break;

      case "signature":
        await drawSignatureField(
          page,
          field,
          scale,
          pdfDoc,
        );
        break;

      default:
        break;
    }
  }

  return pdfDoc.save();
}

/* =========================================
   DOWNLOAD EXPORTED PDF
   ========================================= */

export async function downloadExportedPdf(
  file: File,
  fields: DocumentField[],
): Promise<void> {
  const pdfBytes =
    await exportPdf({
      file,
      fields,
    });

  /*
   * Convert the Uint8Array into a
   * guaranteed ArrayBuffer.
   *
   * This avoids the TypeScript error:
   *
   * Uint8Array<ArrayBufferLike>
   * is not assignable to BlobPart.
   */
  const pdfBuffer =
    new ArrayBuffer(
      pdfBytes.byteLength,
    );

  new Uint8Array(
    pdfBuffer,
  ).set(pdfBytes);

  const blob =
    new Blob(
      [pdfBuffer],
      {
        type: "application/pdf",
      },
    );

  const url =
    URL.createObjectURL(
      blob,
    );

  const anchor =
    document.createElement(
      "a",
    );

  const originalName =
    file.name.replace(
      /\.pdf$/i,
      "",
    );

  anchor.href = url;

  anchor.download =
    `${originalName}-signed.pdf`;

  document.body.appendChild(
    anchor,
  );

  anchor.click();

  anchor.remove();

  URL.revokeObjectURL(
    url,
  );
}