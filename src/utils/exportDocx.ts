import html2canvas from "@html2canvas/html2canvas";

import {
  Document,
  ImageRun,
  Packer,
  Paragraph,
} from "docx";

import type { DocumentField } from "../types/document";

interface ExportDocxOptions {
  element: HTMLElement;
  fileName?: string;
  fields?: DocumentField[];
}

const DOCUMENT_WIDTH = 820;

const DOCX_PAGE_WIDTH = 11906;
const DOCX_PAGE_HEIGHT = 16838;

const DOCX_IMAGE_WIDTH = 620;
const DOCX_IMAGE_HEIGHT = 847;

export async function downloadExportedDocx({
  element,
  fileName = "signed-document.docx",
}: ExportDocxOptions): Promise<void> {
  if (!element) {
    throw new Error(
      "The DOCX document page is not available for export.",
    );
  }

  /*
   * Capture the actual SignFlow
   * document page.
   *
   * This preserves the exact visual
   * position of every field.
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
          Math.max(
            element.scrollHeight,
            1120,
          ),

        scale: 2,

        useCORS: true,

        allowTaint: false,

        logging: false,

        /*
         * The cloned DOM is used only
         * for the exported image.
         *
         * Editor controls are removed
         * from the exported version.
         */
        onclone: (
          clonedDocument,
        ) => {
          const controls =
            clonedDocument.querySelectorAll(
              [
                ".field-delete",
                ".resize-handle",
                ".resize-handle-right",
                ".resize-handle-bottom",
                ".resize-handle-corner",
              ].join(","),
            );

          controls.forEach(
            (control) => {
              (
                control as HTMLElement
              ).style.display =
                "none";
            },
          );

          /*
           * Hide buttons inside fields,
           * such as delete/clear controls.
           */
          const buttons =
            clonedDocument.querySelectorAll(
              ".document-field button",
            );

          buttons.forEach(
            (button) => {
              (
                button as HTMLElement
              ).style.display =
                "none";
            },
          );

          /*
           * Remove visual selection
           * indicators from the exported
           * copy where applicable.
           */
          const selectedElements =
            clonedDocument.querySelectorAll(
              ".field-selected, .selected-field",
            );

          selectedElements.forEach(
            (item) => {
              (
                item as HTMLElement
              ).classList.remove(
                "field-selected",
                "selected-field",
              );
            },
          );
        },
      },
    );

  /*
   * Convert the canvas to PNG.
   */
  const imageData =
    canvas.toDataURL(
      "image/png",
    );

  const base64 =
    imageData.split(",")[1];

  if (!base64) {
    throw new Error(
      "Unable to prepare the document image for export.",
    );
  }

  /*
   * Convert base64 PNG data
   * into a Uint8Array.
   */
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
      binary.charCodeAt(index);
  }

  /*
   * IMPORTANT:
   *
   * The image must be inside an
   * actual Paragraph instance.
   *
   * Do NOT replace this with a
   * plain object or "as never".
   */
  const imageParagraph =
    new Paragraph({
      children: [
        new ImageRun({
          type: "png",

          data: imageBytes,

          transformation: {
            width:
              DOCX_IMAGE_WIDTH,

            height:
              DOCX_IMAGE_HEIGHT,
          },
        }),
      ],

      spacing: {
        before: 0,
        after: 0,
        line: 240,
      },
    });

  /*
   * Create a valid DOCX document.
   */
  const exportedDocument =
    new Document({
      sections: [
        {
          properties: {
            page: {
              size: {
                width:
                  DOCX_PAGE_WIDTH,

                height:
                  DOCX_PAGE_HEIGHT,
              },

              margin: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
            },
          },

          children: [
            imageParagraph,
          ],
        },
      ],
    });

  /*
   * Generate the actual DOCX blob.
   */
  const blob =
    await Packer.toBlob(
      exportedDocument,
    );

  /*
   * Download the DOCX.
   */
  const url =
    URL.createObjectURL(
      blob,
    );

  const downloadLink =
    window.document.createElement(
      "a",
    );

  downloadLink.href =
    url;

  downloadLink.download =
    fileName
      .toLowerCase()
      .endsWith(".docx")
      ? fileName
      : `${fileName}.docx`;

  window.document.body.appendChild(
    downloadLink,
  );

  downloadLink.click();

  downloadLink.remove();

  /*
   * Give the browser a moment to
   * consume the object URL before
   * releasing it.
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