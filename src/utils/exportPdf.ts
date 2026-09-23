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

const MIN_TEXT_FONT_SIZE = 8;
const MAX_TEXT_FONT_SIZE = 18;

const MIN_DATE_FONT_SIZE = 8;
const MAX_DATE_FONT_SIZE = 16;

/* =========================================
   GENERAL HELPERS
   ========================================= */

const clamp = (
  value: number,
  min: number,
  max: number,
): number => {
  return Math.min(
    Math.max(value, min),
    max,
  );
};

const safeNumber = (
  value: number,
  fallback = 0,
): number => {
  return Number.isFinite(value)
    ? value
    : fallback;
};

/* =========================================
   FIELD GEOMETRY
   ========================================= */

const getFieldGeometry = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
) => {
  const pageHeight =
    page.getHeight();

  const safeScale =
    Number.isFinite(scale) &&
    scale > 0
      ? scale
      : 1;

  const fieldWidth = Math.max(
    1,
    safeNumber(field.width, 1),
  );

  const fieldHeight = Math.max(
    1,
    safeNumber(field.height, 1),
  );

  /*
   * The editor uses an internal width of
   * 820px regardless of the actual PDF size.
   */
  const maxEditorX = Math.max(
    0,
    EDITOR_PAGE_WIDTH -
      fieldWidth,
  );

  /*
   * Convert the native PDF page height
   * back into editor coordinates.
   */
  const editorPageHeight =
    pageHeight / safeScale;

  const maxEditorY = Math.max(
    0,
    editorPageHeight -
      fieldHeight,
  );

  /*
   * Protect against invalid or slightly
   * out of bounds field positions.
   */
  const editorX = clamp(
    safeNumber(field.x),
    0,
    maxEditorX,
  );

  const editorY = clamp(
    safeNumber(field.y),
    0,
    maxEditorY,
  );

  const pdfWidth =
    fieldWidth * safeScale;

  const pdfHeight =
    fieldHeight * safeScale;

  const pdfX =
    editorX * safeScale;

  /*
   * React/PDF editor coordinates use a
   * top left origin.
   *
   * PDF coordinates use a bottom left
   * origin.
   */
  const pdfY =
    pageHeight -
    (editorY + fieldHeight) *
      safeScale;

  return {
    x: pdfX,
    y: pdfY,
    width: pdfWidth,
    height: pdfHeight,
  };
};

/* =========================================
   DATA URL → BYTES
   ========================================= */

const dataUrlToBytes = (
  dataUrl: string,
): Uint8Array => {
  const commaIndex =
    dataUrl.indexOf(",");

  if (commaIndex === -1) {
    throw new Error(
      "Invalid image data.",
    );
  }

  const base64 = dataUrl
    .slice(commaIndex + 1)
    .replace(/\s/g, "");

  if (!base64) {
    throw new Error(
      "Invalid image data.",
    );
  }

  try {
    const binaryString =
      atob(base64);

    const bytes =
      new Uint8Array(
        binaryString.length,
      );

    for (
      let index = 0;
      index <
      binaryString.length;
      index += 1
    ) {
      bytes[index] =
        binaryString.charCodeAt(
          index,
        );
    }

    return bytes;
  } catch {
    throw new Error(
      "Invalid image data.",
    );
  }
};

/* =========================================
   TEXT WRAPPING
   ========================================= */

const breakLongWord = (
  word: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] => {
  if (!word) {
    return [""];
  }

  if (
    font.widthOfTextAtSize(
      word,
      fontSize,
    ) <= maxWidth
  ) {
    return [word];
  }

  const chunks: string[] = [];

  let current = "";

  for (
    const character of word
  ) {
    const candidate =
      current + character;

    if (
      current &&
      font.widthOfTextAtSize(
        candidate,
        fontSize,
      ) > maxWidth
    ) {
      chunks.push(current);

      current = character;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
};

const wrapText = (
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): string[] => {
  const normalized =
    text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

  const paragraphs =
    normalized.split("\n");

  const lines: string[] = [];

  for (
    const paragraph of paragraphs
  ) {
    const words =
      paragraph
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let currentLine = "";

    for (
      const word of words
    ) {
      const pieces =
        breakLongWord(
          word,
          font,
          fontSize,
          maxWidth,
        );

      for (
        let pieceIndex = 0;
        pieceIndex <
        pieces.length;
        pieceIndex += 1
      ) {
        const piece =
          pieces[pieceIndex];

        const candidate =
          currentLine.length > 0
            ? `${currentLine} ${piece}`
            : piece;

        if (
          currentLine &&
          font.widthOfTextAtSize(
            candidate,
            fontSize,
          ) > maxWidth
        ) {
          lines.push(
            currentLine,
          );

          currentLine = piece;
        } else {
          currentLine = candidate;
        }

        /*
         * Long words can be split into
         * several independent lines.
         */
        if (
          pieceIndex <
          pieces.length - 1
        ) {
          if (currentLine) {
            lines.push(
              currentLine,
            );
          }

          currentLine = "";
        }
      }
    }

    if (currentLine) {
      lines.push(
        currentLine,
      );
    }
  }

  return lines.length > 0
    ? lines
    : [""];
};

/* =========================================
   DRAW WRAPPED TEXT
   ========================================= */

const drawWrappedText = (
  page: PDFPage,
  text: string,
  x: number,
  yTop: number,
  width: number,
  height: number,
  font: PDFFont,
  fontSize: number,
) => {
  const safeWidth =
    Math.max(1, width);

  const safeHeight =
    Math.max(1, height);

  const horizontalPadding =
    Math.min(
      5,
      safeWidth * 0.08,
    );

  const verticalPadding =
    Math.min(
      4,
      safeHeight * 0.08,
    );

  const contentWidth =
    Math.max(
      1,
      safeWidth -
        horizontalPadding * 2,
    );

  /*
   * Fit the COMPLETE text inside the field.
   * Never truncate and never add an ellipsis.
   */
  const MIN_RENDER_FONT_SIZE = 4;

  let fittedFontSize = Math.max(
    MIN_RENDER_FONT_SIZE,
    fontSize,
  );

  let lines = wrapText(
    text,
    font,
    fittedFontSize,
    contentWidth,
  );

  let lineHeight =
    fittedFontSize * 1.2;

  let maxLines = Math.max(
    1,
    Math.floor(
      (safeHeight -
        verticalPadding * 2) /
        lineHeight,
    ),
  );

  /*
   * Reduce the font until every wrapped
   * line can fit vertically.
   */
  while (
    lines.length > maxLines &&
    fittedFontSize > MIN_RENDER_FONT_SIZE
  ) {
    fittedFontSize = Math.max(
      MIN_RENDER_FONT_SIZE,
      fittedFontSize - 0.5,
    );

    lines = wrapText(
      text,
      font,
      fittedFontSize,
      contentWidth,
    );

    lineHeight =
      fittedFontSize * 1.2;

    maxLines = Math.max(
      1,
      Math.floor(
        (safeHeight -
          verticalPadding * 2) /
          lineHeight,
      ),
    );
  }

  /*
   * At the minimum font size we still keep
   * every line. The exporter must never
   * silently discard user-entered content.
   */
  const totalTextHeight =
    lines.length *
    lineHeight;

  /*
   * Center the text vertically
   * inside its field.
   */
  const firstLineBaseline =
    yTop -
    verticalPadding -
    Math.max(
      0,
      (
        safeHeight -
        verticalPadding * 2 -
        totalTextHeight
      ) / 2,
    ) -
    fittedFontSize;

  lines.forEach(
    (line, index) => {
      page.drawText(
        line,
        {
          x:
            x +
            horizontalPadding,

          y:
            firstLineBaseline -
            index *
              lineHeight,

          size: fittedFontSize,

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
   TEXT FIELD
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

  const geometry =
    getFieldGeometry(
      page,
      field,
      scale,
    );

  const fontSize =
    clamp(
      geometry.height * 0.48,
      MIN_TEXT_FONT_SIZE,
      MAX_TEXT_FONT_SIZE,
    );

  drawWrappedText(
    page,
    field.value,
    geometry.x,
    geometry.y +
      geometry.height,
    geometry.width,
    geometry.height,
    font,
    fontSize,
  );
};

/* =========================================
   DATE FIELD
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

  const geometry =
    getFieldGeometry(
      page,
      field,
      scale,
    );

  const fontSize =
    clamp(
      geometry.height * 0.45,
      MIN_DATE_FONT_SIZE,
      MAX_DATE_FONT_SIZE,
    );

  drawWrappedText(
    page,
    field.value,
    geometry.x,
    geometry.y +
      geometry.height,
    geometry.width,
    geometry.height,
    font,
    fontSize,
  );
};

/* =========================================
   NAME FIELD
   ========================================= */

const drawNameField = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
  font: PDFFont,
) => {
  drawTextField(
    page,
    field,
    scale,
    font,
  );
};

/* =========================================
   EMAIL FIELD
   ========================================= */

const drawEmailField = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
  font: PDFFont,
) => {
  drawTextField(
    page,
    field,
    scale,
    font,
  );
};

/* =========================================
   CHECKBOX
   ========================================= */

const drawCheckboxField = (
  page: PDFPage,
  field: DocumentField,
  scale: number,
) => {
  const geometry =
    getFieldGeometry(
      page,
      field,
      scale,
    );

  const borderWidth =
    Math.max(
      1,
      2 * scale,
    );

  const isChecked =
    field.value === "true";

  /*
   * Always export the checkbox itself.
   * This means an unchecked checkbox added
   * by the user is not silently removed.
   */
  page.drawRectangle(
    {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,

      borderWidth,

      borderColor:
        rgb(
          0.1,
          0.1,
          0.1,
        ),

      color:
        rgb(
          1,
          1,
          1,
        ),
    },
  );

  if (!isChecked) {
    return;
  }

  const padding =
    Math.min(
      geometry.width,
      geometry.height,
    ) * 0.2;

  const checkThickness =
    Math.max(
      1.5,
      Math.min(
        geometry.width,
        geometry.height,
      ) * 0.08,
    );

  const checkColor =
    rgb(
      0.1,
      0.1,
      0.1,
    );

  /*
   * First stroke.
   */
  page.drawLine(
    {
      start: {
        x:
          geometry.x +
          padding,

        y:
          geometry.y +
          geometry.height *
            0.48,
      },

      end: {
        x:
          geometry.x +
          geometry.width *
            0.42,

        y:
          geometry.y +
          padding,
      },

      thickness:
        checkThickness,

      color:
        checkColor,
    },
  );

  /*
   * Second stroke.
   */
  page.drawLine(
    {
      start: {
        x:
          geometry.x +
          geometry.width *
            0.42,

        y:
          geometry.y +
          padding,
      },

      end: {
        x:
          geometry.x +
          geometry.width -
          padding,

        y:
          geometry.y +
          geometry.height *
            0.78,
      },

      thickness:
        checkThickness,

      color:
        checkColor,
    },
  );
};

/* =========================================
   SIGNATURE FIELD
   ========================================= */

const drawSignatureField =
  async (
    page: PDFPage,
    field: DocumentField,
    scale: number,
    pdfDoc: PDFDocument,
  ) => {
    const geometry =
      getFieldGeometry(
        page,
        field,
        scale,
      );

    /*
     * DRAWN OR UPLOADED SIGNATURE
     */
    if (field.signatureImage) {
      try {
        const imageBytes =
          dataUrlToBytes(
            field.signatureImage,
          );

        let image;

        /*
         * Drawn signatures are normally PNG.
         * Uploaded signatures may be JPG.
         */
        try {
          image =
            await pdfDoc.embedPng(
              imageBytes,
            );
        } catch {
          image =
            await pdfDoc.embedJpg(
              imageBytes,
            );
        }

        const imageWidth =
          image.width;

        const imageHeight =
          image.height;

        if (
          imageWidth <= 0 ||
          imageHeight <= 0
        ) {
          return;
        }

        /*
         * Preserve the original signature
         * aspect ratio.
         */
        const imageScale =
          Math.min(
            geometry.width /
              imageWidth,

            geometry.height /
              imageHeight,
          );

        const renderedWidth =
          imageWidth *
          imageScale;

        const renderedHeight =
          imageHeight *
          imageScale;

        page.drawImage(
          image,
          {
            x:
              geometry.x +
              (
                geometry.width -
                renderedWidth
              ) / 2,

            y:
              geometry.y +
              (
                geometry.height -
                renderedHeight
              ) / 2,

            width:
              renderedWidth,

            height:
              renderedHeight,
          },
        );

        return;
      } catch (error) {
        console.error(
          "Unable to embed signature image.",
          error,
        );
      }
    }

    /*
     * TYPED SIGNATURE
     *
     * Typed signatures use field.value.
     * They must not disappear simply because
     * signatureImage is empty.
     */
    if (!field.value) {
      return;
    }

    /*
     * The browser font selected inside the
     * editor cannot safely be assumed to exist
     * inside the exported PDF.
     *
     * Helvetica Oblique is therefore used as
     * a reliable PDF fallback.
     */
    const typedSignatureFont =
      await pdfDoc.embedFont(
        StandardFonts.HelveticaOblique,
      );

    const initialFontSize =
      clamp(
        geometry.height * 0.7,
        14,
        Math.min(
          42,
          geometry.height * 0.85,
        ),
      );

    const availableWidth =
      Math.max(
        1,
        geometry.width - 10,
      );

    let fittedFontSize =
      initialFontSize;

    /*
     * Reduce the font until the complete
     * typed signature fits inside its field.
     */
    while (
      fittedFontSize > 10 &&
      typedSignatureFont.widthOfTextAtSize(
        field.value,
        fittedFontSize,
      ) >
        availableWidth
    ) {
      fittedFontSize -= 1;
    }

    const textWidth =
      typedSignatureFont.widthOfTextAtSize(
        field.value,
        fittedFontSize,
      );

    page.drawText(
      field.value,
      {
        x:
          geometry.x +
          Math.max(
            5,
            (
              geometry.width -
              textWidth
            ) / 2,
          ),

        y:
          geometry.y +
          (
            geometry.height -
            fittedFontSize
          ) / 2 +
          fittedFontSize *
            0.18,

        size:
          fittedFontSize,

        font:
          typedSignatureFont,

        color:
          rgb(
            0.05,
            0.05,
            0.05,
          ),
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
  if (!file) {
    throw new Error(
      "No PDF document was provided.",
    );
  }

  /*
   * Check both MIME type and extension
   * because some browsers do not always
   * provide the MIME type consistently.
   */
  const isPdf =
    file.type ===
      "application/pdf" ||
    /\.pdf$/i.test(
      file.name,
    );

  if (!isPdf) {
    throw new Error(
      "Please select a valid PDF document.",
    );
  }

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

  if (pages.length === 0) {
    throw new Error(
      "The PDF does not contain any pages.",
    );
  }

  /*
   * Render every field onto its actual
   * corresponding PDF page.
   */
  for (
    const field of fields
  ) {
    const rawPage =
      safeNumber(
        field.page,
        1,
      );

    const pageNumber =
      Math.trunc(
        rawPage,
      );

    const pageIndex =
      pageNumber - 1;

    if (
      pageIndex < 0 ||
      pageIndex >=
        pages.length
    ) {
      continue;
    }

    const page =
      pages[pageIndex];

    /*
     * The editor stores coordinates against
     * an internal 820px page width.
     *
     * Convert those coordinates into the
     * actual PDF page coordinate system.
     */
    const pageWidth =
      page.getWidth();

    const scale =
      pageWidth /
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
    await exportPdf(
      {
        file,
        fields,
      },
    );

  /*
   * Convert Uint8Array into a standalone
   * ArrayBuffer.
   *
   * This avoids strict TypeScript BlobPart
   * compatibility problems involving
   * Uint8Array<ArrayBufferLike>.
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
        type:
          "application/pdf",
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

  anchor.style.display =
    "none";

  document.body.appendChild(
    anchor,
  );

  anchor.click();

  anchor.remove();

  /*
   * Release the object URL after the
   * browser has had a chance to start
   * the download.
   */
  window.setTimeout(
    () => {
      URL.revokeObjectURL(
        url,
      );
    },
    0,
  );
}