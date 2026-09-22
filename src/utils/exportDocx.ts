import html2canvas from "@html2canvas/html2canvas";

import {
  Document,
  ImageRun,
  Packer,
  Paragraph,
} from "docx";

interface ExportDocxOptions {
  element: HTMLElement;
  fileName?: string;
}

const DOCUMENT_WIDTH = 820;
const MIN_DOCUMENT_HEIGHT = 1120;

/*
 * DOCX page dimensions are expressed in twips.
 *
 * 1 CSS pixel at 96 DPI is 15 twips.
 *
 * The page and the captured image use the
 * same conversion, so the exported document
 * preserves the exact SignFlow aspect ratio.
 */
const TWIPS_PER_PIXEL = 15;

/* =========================================
   DOCUMENT HEIGHT
   ========================================= */

const getDocumentHeight = (
  element: HTMLElement,
): number => {
  const height = Math.max(
    element.scrollHeight,
    element.offsetHeight,
    element.clientHeight,
    MIN_DOCUMENT_HEIGHT,
  );

  return Math.max(
    MIN_DOCUMENT_HEIGHT,
    Math.ceil(height),
  );
};

/* =========================================
   DOWNLOAD
   ========================================= */

const downloadBlob = (
  blob: Blob,
  fileName: string,
): void => {
  const url =
    URL.createObjectURL(blob);

  const downloadLink =
    window.document.createElement(
      "a",
    );

  downloadLink.href = url;

  downloadLink.download =
    fileName
      .toLowerCase()
      .endsWith(".docx")
      ? fileName
      : `${fileName}.docx`;

  downloadLink.style.display =
    "none";

  window.document.body.appendChild(
    downloadLink,
  );

  downloadLink.click();

  downloadLink.remove();

  /*
   * Give the browser enough time to begin
   * the download before releasing the URL.
   */
  window.setTimeout(
    () => {
      URL.revokeObjectURL(url);
    },
    1000,
  );
};

/* =========================================
   HIDE EDITOR CONTROLS
   ========================================= */

const hideEditorControls = (
  clonedDocument: globalThis.Document,
): void => {
  /*
   * Controls used by the SignFlow editor
   * must never become part of the exported
   * document.
   */
  const controls =
    clonedDocument.querySelectorAll(
      [
        ".field-delete",
        ".resize-handle",
        ".field-resize-handle",
        ".field-resize-right",
        ".field-resize-bottom",
        ".field-resize-corner",
        ".field-drag-handle",
      ].join(","),
    );

  controls.forEach(
    (control) => {
      const element =
        control as HTMLElement;

      element.style.display =
        "none";
    },
  );

  /*
   * Some field implementations use buttons
   * for delete or other editor actions.
   */
  const buttons =
    clonedDocument.querySelectorAll(
      [
        ".document-field button",
        ".signature-field button",
        ".date-field button",
        ".checkbox-field button",
        ".name-field button",
        ".email-field button",
      ].join(","),
    );

  buttons.forEach(
    (button) => {
      const element =
        button as HTMLElement;

      element.style.display =
        "none";
    },
  );
};

/* =========================================
   REMOVE EDITOR SELECTION
   ========================================= */

const removeEditorSelection = (
  clonedDocument: globalThis.Document,
): void => {
  const selectedElements =
    clonedDocument.querySelectorAll(
      [
        ".field-selected",
        ".selected-field",
        ".document-field-selected",
        ".signature-field-selected",
        ".date-field-selected",
        ".checkbox-field-selected",
        ".name-field-selected",
        ".email-field-selected",
      ].join(","),
    );

  selectedElements.forEach(
    (item) => {
      const element =
        item as HTMLElement;

      element.classList.remove(
        "field-selected",
        "selected-field",
        "document-field-selected",
        "signature-field-selected",
        "date-field-selected",
        "checkbox-field-selected",
        "name-field-selected",
        "email-field-selected",
      );
    },
  );
};

/* =========================================
   PREPARE CLONED DOCUMENT
   ========================================= */

const prepareClonedDocument = (
  clonedDocument: globalThis.Document,
  documentHeight: number,
): void => {
  /*
   * The live DOCX viewer can be visually
   * scaled on smaller screens using CSS
   * transform.
   *
   * Export must use the original internal
   * 820px coordinate system instead.
   */
  const clonedPage =
    clonedDocument.querySelector(
      ".docx-page",
    ) as HTMLElement | null;

  if (clonedPage) {
    clonedPage.style.transform =
      "none";

    clonedPage.style.transformOrigin =
      "top left";

    clonedPage.style.position =
      "relative";

    clonedPage.style.top =
      "0";

    clonedPage.style.left =
      "0";

    clonedPage.style.width =
      `${DOCUMENT_WIDTH}px`;

    clonedPage.style.minWidth =
      `${DOCUMENT_WIDTH}px`;

    clonedPage.style.maxWidth =
      `${DOCUMENT_WIDTH}px`;

    clonedPage.style.height =
      `${documentHeight}px`;

    clonedPage.style.minHeight =
      `${documentHeight}px`;

    clonedPage.style.maxHeight =
      `${documentHeight}px`;

    clonedPage.style.margin =
      "0";

    clonedPage.style.padding =
      "0";

    clonedPage.style.overflow =
      "visible";

    clonedPage.style.boxSizing =
      "border-box";
  }

  /*
   * The viewer wrapper may also carry a
   * responsive transform. Remove it so the
   * screenshot is taken at full internal size.
   */
  const visualFrames =
    clonedDocument.querySelectorAll(
      ".docx-document > div",
    );

  visualFrames.forEach(
    (frame) => {
      const htmlFrame =
        frame as HTMLElement;

      htmlFrame.style.transform =
        "none";

      htmlFrame.style.transformOrigin =
        "top left";

      htmlFrame.style.width =
        `${DOCUMENT_WIDTH}px`;

      htmlFrame.style.maxWidth =
        `${DOCUMENT_WIDTH}px`;

      htmlFrame.style.minWidth =
        `${DOCUMENT_WIDTH}px`;

      htmlFrame.style.overflow =
        "visible";
    },
  );

  /*
   * Hide editor only controls.
   *
   * The actual fields remain visible,
   * including their values, signatures
   * and checkbox state.
   */
  hideEditorControls(
    clonedDocument,
  );

  removeEditorSelection(
    clonedDocument,
  );
};

/* =========================================
   CONVERT DATA URL TO BYTES
   ========================================= */

const dataUrlToBytes = (
  dataUrl: string,
): Uint8Array => {
  const commaIndex =
    dataUrl.indexOf(",");

  if (commaIndex === -1) {
    throw new Error(
      "Unable to prepare the document image for export.",
    );
  }

  const base64 =
    dataUrl
      .slice(
        commaIndex + 1,
      )
      .replace(/\s/g, "");

  if (!base64) {
    throw new Error(
      "Unable to prepare the document image for export.",
    );
  }

  try {
    const binary =
      window.atob(base64);

    const imageBytes =
      new Uint8Array(
        binary.length,
      );

    for (
      let index = 0;
      index < binary.length;
      index += 1
    ) {
      imageBytes[index] =
        binary.charCodeAt(
          index,
        );
    }

    return imageBytes;
  } catch {
    throw new Error(
      "Unable to decode the exported document image.",
    );
  }
};

/* =========================================
   EXPORT DOCX
   ========================================= */

export async function downloadExportedDocx({
  element,
  fileName = "signed-document.docx",
}: ExportDocxOptions): Promise<void> {
  if (!element) {
    throw new Error(
      "The DOCX document page is not available for export.",
    );
  }

  const documentHeight =
    getDocumentHeight(
      element,
    );

  /*
   * Capture the actual rendered SignFlow
   * document.
   *
   * This is intentional: the DOCX export
   * is a visual snapshot of the editor.
   *
   * Therefore all fields already rendered
   * by the editor are included:
   *
   * text
   * name
   * email
   * date
   * checkbox
   * drawn signature
   * typed signature
   * uploaded signature
   * field positions
   * field sizes
   */
  const canvas =
    await html2canvas(
      element,
      {
        backgroundColor:
          "#ffffff",

        width:
          DOCUMENT_WIDTH,

        height:
          documentHeight,

        /*
         * Render at 2x for better output
         * quality while retaining the same
         * document coordinate system.
         */
        scale: 2,

        useCORS: true,

        allowTaint: false,

        logging: false,

        onclone: (
          clonedDocument,
        ) => {
          prepareClonedDocument(
            clonedDocument,
            documentHeight,
          );
        },
      },
    );

  if (
    canvas.width <= 0 ||
    canvas.height <= 0
  ) {
    throw new Error(
      "Unable to capture the DOCX document for export.",
    );
  }

  /*
   * Convert the captured document into
   * a PNG image.
   *
   * PNG preserves signatures, text,
   * checkboxes and transparent signature
   * details better than JPEG.
   */
  const imageData =
    canvas.toDataURL(
      "image/png",
    );

  const imageBytes =
    dataUrlToBytes(
      imageData,
    );

  /*
   * Keep the DOCX page at the same
   * aspect ratio as the captured
   * SignFlow document.
   */
  const pageWidthTwips =
    Math.round(
      DOCUMENT_WIDTH *
        TWIPS_PER_PIXEL,
    );

  const pageHeightTwips =
    Math.round(
      documentHeight *
        TWIPS_PER_PIXEL,
    );

  /*
   * ImageRun dimensions are expressed
   * using the captured document's logical
   * CSS pixel dimensions.
   *
   * Do not use canvas.width/canvas.height
   * here because html2canvas scale=2 only
   * controls raster quality.
   */
  const imageParagraph =
    new Paragraph({
      children: [
        new ImageRun({
          type: "png",

          data: imageBytes,

          transformation: {
            width:
              DOCUMENT_WIDTH,

            height:
              documentHeight,
          },
        }),
      ],

      spacing: {
        before: 0,
        after: 0,
        line: 240,
      },

      indent: {
        left: 0,
        right: 0,
        firstLine: 0,
      },
    });

  /*
   * Create a borderless DOCX page whose
   * dimensions match the captured page.
   *
   * This prevents Word from stretching
   * the SignFlow document into a standard
   * paper size.
   */
  const exportedDocument =
    new Document({
      sections: [
        {
          properties: {
            page: {
              size: {
                width:
                  pageWidthTwips,

                height:
                  pageHeightTwips,
              },

              margin: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                header: 0,
                footer: 0,
                gutter: 0,
              },
            },
          },

          children: [
            imageParagraph,
          ],
        },
      ],
    });

  const blob =
    await Packer.toBlob(
      exportedDocument,
    );

  if (
    !blob ||
    blob.size <= 0
  ) {
    throw new Error(
      "The browser could not create the exported DOCX document.",
    );
  }

  downloadBlob(
    blob,
    fileName,
  );
}
