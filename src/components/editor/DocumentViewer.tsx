import { useEffect, useRef, useState } from "react";
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

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface DocumentViewerProps {
  file: File;
  activeTool: string;
  fields: DocumentField[];
  selectedFieldId: string | null;
  onAddField: (page: number, x: number, y: number, scale?: number) => void;
  onUpdateField: (id: string, updates: Partial<DocumentField>) => void;
  onDeleteField: (id: string) => void;
  onSelectField: (id: string) => void;
}

const EDITOR_PAGE_WIDTH = 820;

const FIELD_TOOLS = [
  "text",
  "signature",
  "date",
  "checkbox",
  "name",
  "email",
];

const getFieldSize = (tool: string) => {
  switch (tool) {
    case "signature":
      return { width: 320, height: 140 };
    case "date":
      return { width: 180, height: 42 };
    case "checkbox":
      return { width: 36, height: 36 };
    case "name":
      return { width: 240, height: 42 };
    case "email":
      return { width: 280, height: 42 };
    default:
      return { width: 200, height: 42 };
  }
};

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
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageScale, setPageScale] = useState(1);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const updateScale = () => {
      const availableWidth = viewer.clientWidth;
      if (availableWidth <= 0) return;

      setPageScale(
        Math.min(1, availableWidth / EDITOR_PAGE_WIDTH),
      );
    };

    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(viewer);

    return () => observer.disconnect();
  }, []);

  const handlePageClick = (
    event: React.MouseEvent<HTMLDivElement>,
    pageNumber: number,
  ) => {
    if (!FIELD_TOOLS.includes(activeTool)) return;

    const target = event.target as HTMLElement;
    if (
      target.closest(
        ".document-field, .field-drag-handle, .field-delete, .field-resize-handle, .signature-resize-handle, .date-resize-handle, .checkbox-resize-handle, .name-resize-handle, .email-resize-handle, button, input, textarea, select",
      )
    ) {
      return;
    }

    const pageElement = event.currentTarget;
    const rect = pageElement.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) return;

    const safeScale = rect.width / EDITOR_PAGE_WIDTH;
    const { width, height } = getFieldSize(activeTool);

    const displayX = event.clientX - rect.left;
    const displayY = event.clientY - rect.top;

    const displayWidth = width * safeScale;
    const displayHeight = height * safeScale;

    const clampedX = Math.min(
      Math.max(0, rect.width - displayWidth),
      Math.max(0, displayX),
    );

    const clampedY = Math.min(
      Math.max(0, rect.height - displayHeight),
      Math.max(0, displayY),
    );

    onAddField(
      pageNumber,
      clampedX / safeScale,
      clampedY / safeScale,
      safeScale,
    );
  };

  const renderField = (field: DocumentField) => {
    const commonProps = {
      field,
      selected: selectedFieldId === field.id,
      onUpdate: onUpdateField,
      onDelete: onDeleteField,
      onSelect: onSelectField,
    };

    switch (field.type) {
      case "text":
        return <TextField key={field.id} {...commonProps} />;
      case "signature":
        return <SignatureField key={field.id} {...commonProps} />;
      case "date":
        return <DateField key={field.id} {...commonProps} />;
      case "checkbox":
        return <CheckboxField key={field.id} {...commonProps} />;
      case "name":
        return <NameField key={field.id} {...commonProps} />;
      case "email":
        return <EmailField key={field.id} {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <div ref={viewerRef} className="pdf-document">
      <Document
        file={file}
        onLoadSuccess={({ numPages: loadedPages }) => {
          setNumPages(loadedPages);
        }}
        onLoadError={(error) => {
          console.error("PDF loading error:", error);
        }}
        loading={<div className="pdf-loading">Loading document...</div>}
      >
        {Array.from({ length: numPages }, (_, index) => {
          const pageNumber = index + 1;
          const pageFields = fields.filter(
            (field) => field.page === pageNumber,
          );
          const canAddField = FIELD_TOOLS.includes(activeTool);

          return (
            <div
              key={pageNumber}
              className={`pdf-page-wrapper ${
                canAddField ? "pdf-page-text-mode" : ""
              }`}
              onClick={(event) => handlePageClick(event, pageNumber)}
              style={{
                width: `${EDITOR_PAGE_WIDTH * pageScale}px`,
                maxWidth: "100%",
                marginLeft: "auto",
                marginRight: "auto",
                position: "relative",
              }}
            >
              <Page
                pageNumber={pageNumber}
                width={Math.max(1, Math.round(EDITOR_PAGE_WIDTH * pageScale))}
                renderTextLayer
                renderAnnotationLayer
              />

              <div
                className="field-layer"
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${EDITOR_PAGE_WIDTH}px`,
                  transform: `scale(${pageScale})`,
                  transformOrigin: "top left",
                  pointerEvents: "none",
                }}
              >
                {pageFields.map(renderField)}
              </div>
            </div>
          );
        })}
      </Document>
    </div>
  );
}
