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
 * DOCX uses twips.
 *
 * We keep the exported page at the same
 * aspect ratio as the SignFlow document
 * canvas instead of forcing the captured
 * image into a different page ratio.
 */
const TWIPS_PER_PIXEL = 14.52;

const getDocumentHeight = (
  element: HTMLElement,
): number => {
  const height = Math.max(
    element.scrollHeight,
    element.offsetHeight,
    MIN_DOCUMENT_HEIGHT,
  );

  return Math.max(
    MIN_DOCUMENT_HEIGHT,
    Math.ceil(height),
  );
};

const downloadBlob = (
  blob: Blob,
  fileName: string,
) => {
  const url =
    URL.createObjectURL(blob);

  const downloadLink =
    window.document.createElement("a");

  downloadLink.href = url;

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

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

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
   * IMPORTANT:
   *
   * SignFlow visually scales the DOCX page
   * on smaller devices using CSS transform.
   *
   * We must NOT export that visual scale.
   *
   * Instead, html2canvas captures the page
   * in its fixed 820px internal coordinate
   * system. This makes the exported result
   * independent of the device used for editing.
   */
  const documentHeight =
    getDocumentHeight(element);

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

        scale: 2,

        useCORS: true,

        allowTaint: false,

        logging: false,

        onclone: (
          clonedDocument,
        ) => {
          /*
           * Remove the responsive visual
           * transform from the cloned page.
           *
           * The live editor may currently be
           * scaled to 40%, 60%, etc. on mobile.
           * Export must always use the internal
           * 820px document coordinates.
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

            clonedPage.style.minHeight =
              `${documentHeight}px`;

            clonedPage.style.height =
              `${documentHeight}px`;

            clonedPage.style.margin =
              "0";

            clonedPage.style.overflow =
              "visible";
          }

          /*
           * Hide the visual editor frame.
           * The exported page should start
           * directly at the document itself.
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
            },
          );

          /*
           * Remove editor-only controls.
           */
          const controls =
            clonedDocument.querySelectorAll(
              [
                ".field-delete",
                ".resize-handle",
                ".resize-handle-right",
                ".resize-handle-bottom",
                ".resize-handle-corner",
                ".field-drag-handle",
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
           * Hide buttons inside fields.
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
           * Remove editor selection
           * indicators.
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
   * Convert the captured page to PNG.
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
   * Keep the DOCX page and image at
   * exactly the same aspect ratio as
   * the captured SignFlow page.
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

  const imageWidthTwips =
    pageWidthTwips;

  const imageHeightTwips =
    pageHeightTwips;

  const imageParagraph =
    new Paragraph({
      children: [
        new ImageRun({
          type: "png",

          data: imageBytes,

          transformation: {
            width:
              Math.round(
                DOCUMENT_WIDTH,
              ),

            height:
              Math.round(
                documentHeight,
              ),
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
   * Create a page whose dimensions
   * match the captured document.
   *
   * This prevents the previous
   * 620x847 image from being stretched
   * into a different page ratio.
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

  /*
   * Keep these values referenced so
   * the intended one-to-one page/image
   * relationship remains explicit.
   */
  void imageWidthTwips;
  void imageHeightTwips;

  downloadBlob(
    blob,
    fileName,
  );
}
