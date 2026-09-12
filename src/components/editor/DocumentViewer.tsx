import { useState } from "react";
import {
  Document,
  Page,
  pdfjs,
} from "react-pdf";

import type { DocumentField } from "../../types/document";

import TextField from "./TextField";
import SignatureField from "./SignatureField";
import DateField from "./DateField";
import CheckboxField from "./CheckboxField";
import NameField from "./NameField";
import EmailField from "./EmailField";

import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc =
  new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

interface DocumentViewerProps {
  file: File;
  activeTool: string;
  fields: DocumentField[];
  selectedFieldId: string | null;
  onAddField: (
    page: number,
    x: number,
    y: number,
  ) => void;
  onUpdateField: (
    id: string,
    updates: Partial<DocumentField>,
  ) => void;
  onDeleteField: (
    id: string,
  ) => void;
  onSelectField: (
    id: string,
  ) => void;
}

export default function DocumentViewer({
  file,
  activeTool,
  fields,
  selectedFieldId,
  onAddField,
  onUpdateField,
  onDeleteField,
  onSelectField,
}: DocumentViewerProps) {
  const [numPages, setNumPages] =
    useState(0);

  /*
   * =========================================
   * HANDLE PDF PAGE CLICK
   * =========================================
   *
   * These tools can create fields directly
   * on the document.
   */
  const handlePageClick = (
    event: React.MouseEvent<HTMLDivElement>,
    pageNumber: number,
  ) => {
    if (
      activeTool !== "text" &&
      activeTool !== "signature" &&
      activeTool !== "date" &&
      activeTool !== "checkbox" &&
      activeTool !== "name" &&
      activeTool !== "email"
    ) {
      return;
    }

    const pageElement =
      event.currentTarget;

    const rect =
      pageElement.getBoundingClientRect();

    const x =
      event.clientX - rect.left;

    const y =
      event.clientY - rect.top;

    onAddField(
      pageNumber,
      x,
      y,
    );
  };

  /*
   * =========================================
   * RENDER
   * =========================================
   */

  return (
    <div className="pdf-document">
      <Document
        file={file}
        onLoadSuccess={({
          numPages,
        }) =>
          setNumPages(numPages)
        }
        onLoadError={(error) => {
          console.error(
            "PDF loading error:",
            error,
          );
        }}
        loading={
          <div className="pdf-loading">
            Loading document...
          </div>
        }
      >
        {Array.from(
          { length: numPages },
          (_, index) => {
            const pageNumber =
              index + 1;

            const pageFields =
              fields.filter(
                (field) =>
                  field.page ===
                  pageNumber,
              );

            /*
             * =================================
             * TOOLS THAT CAN PLACE A FIELD
             * =================================
             */
            const canAddField =
              activeTool === "text" ||
              activeTool ===
                "signature" ||
              activeTool === "date" ||
              activeTool ===
                "checkbox" ||
              activeTool === "name" ||
              activeTool ===
                "email";

            return (
              <div
                key={pageNumber}
                className={`pdf-page-wrapper ${
                  canAddField
                    ? "pdf-page-text-mode"
                    : ""
                }`}
                onClick={(event) =>
                  handlePageClick(
                    event,
                    pageNumber,
                  )
                }
              >
                <Page
                  pageNumber={
                    pageNumber
                  }
                  width={820}
                  renderTextLayer
                  renderAnnotationLayer
                />

                <div className="field-layer">
                  {pageFields.map(
                    (field) => {
                      /*
                       * =================================
                       * TEXT
                       * =================================
                       */
                      if (
                        field.type ===
                        "text"
                      ) {
                        return (
                          <TextField
                            key={
                              field.id
                            }
                            field={
                              field
                            }
                            selected={
                              selectedFieldId ===
                              field.id
                            }
                            onUpdate={
                              onUpdateField
                            }
                            onDelete={
                              onDeleteField
                            }
                            onSelect={
                              onSelectField
                            }
                          />
                        );
                      }

                      /*
                       * =================================
                       * SIGNATURE
                       * =================================
                       */
                      if (
                        field.type ===
                        "signature"
                      ) {
                        return (
                          <SignatureField
                            key={
                              field.id
                            }
                            field={
                              field
                            }
                            selected={
                              selectedFieldId ===
                              field.id
                            }
                            onUpdate={
                              onUpdateField
                            }
                            onDelete={
                              onDeleteField
                            }
                            onSelect={
                              onSelectField
                            }
                          />
                        );
                      }

                      /*
                       * =================================
                       * DATE
                       * =================================
                       */
                      if (
                        field.type ===
                        "date"
                      ) {
                        return (
                          <DateField
                            key={
                              field.id
                            }
                            field={
                              field
                            }
                            selected={
                              selectedFieldId ===
                              field.id
                            }
                            onUpdate={
                              onUpdateField
                            }
                            onDelete={
                              onDeleteField
                            }
                            onSelect={
                              onSelectField
                            }
                          />
                        );
                      }

                      /*
                       * =================================
                       * CHECKBOX
                       * =================================
                       */
                      if (
                        field.type ===
                        "checkbox"
                      ) {
                        return (
                          <CheckboxField
                            key={
                              field.id
                            }
                            field={
                              field
                            }
                            selected={
                              selectedFieldId ===
                              field.id
                            }
                            onUpdate={
                              onUpdateField
                            }
                            onDelete={
                              onDeleteField
                            }
                            onSelect={
                              onSelectField
                            }
                          />
                        );
                      }

                      /*
                       * =================================
                       * NAME
                       * =================================
                       */
                      if (
                        field.type ===
                        "name"
                      ) {
                        return (
                          <NameField
                            key={
                              field.id
                            }
                            field={
                              field
                            }
                            selected={
                              selectedFieldId ===
                              field.id
                            }
                            onUpdate={
                              onUpdateField
                            }
                            onDelete={
                              onDeleteField
                            }
                            onSelect={
                              onSelectField
                            }
                          />
                        );
                      }

                      /*
                       * =================================
                       * EMAIL
                       * =================================
                       */
                      if (
                        field.type ===
                        "email"
                      ) {
                        return (
                          <EmailField
                            key={
                              field.id
                            }
                            field={
                              field
                            }
                            selected={
                              selectedFieldId ===
                              field.id
                            }
                            onUpdate={
                              onUpdateField
                            }
                            onDelete={
                              onDeleteField
                            }
                            onSelect={
                              onSelectField
                            }
                          />
                        );
                      }

                      return null;
                    },
                  )}
                </div>
              </div>
            );
          },
        )}
      </Document>
    </div>
  );
}