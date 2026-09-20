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

pdfjs.GlobalWorkerOptions.workerSrc =
  new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

const EDITOR_PAGE_WIDTH = 820;

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

interface PdfPageProps {
  pageNumber: number;
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

const canPlaceField = (
  activeTool: string,
) =>
  activeTool === "text" ||
  activeTool === "signature" ||
  activeTool === "date" ||
  activeTool === "checkbox" ||
  activeTool === "name" ||
  activeTool === "email";

function PdfPage({
  pageNumber,
  activeTool,
  fields,
  selectedFieldId,
  onAddField,
  onUpdateField,
  onDeleteField,
  onSelectField,
}: PdfPageProps) {
  const pageRef =
    useRef<HTMLDivElement | null>(null);

  const [displayScale, setDisplayScale] =
    useState(1);

  const [internalHeight, setInternalHeight] =
    useState(1120);

  useEffect(() => {
    const element = pageRef.current;

    if (!element) {
      return;
    }

    const updateGeometry = () => {
      const rect =
        element.getBoundingClientRect();

      if (
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return;
      }

      const nextScale =
        rect.width /
        EDITOR_PAGE_WIDTH;

      const safeScale =
        Number.isFinite(nextScale) &&
        nextScale > 0
          ? nextScale
          : 1;

      setDisplayScale(
        Math.min(1, safeScale),
      );

      setInternalHeight(
        rect.height /
          Math.min(1, safeScale),
      );
    };

    const observer =
      new ResizeObserver(
        updateGeometry,
      );

    observer.observe(element);

    const frame =
      requestAnimationFrame(
        updateGeometry,
      );

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const handlePageClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!canPlaceField(activeTool)) {
      return;
    }

    const target =
      event.target as HTMLElement;

    if (
      target.closest(
        ".document-field, .signature-field, .date-field, .checkbox-field, .name-field, .email-field, .field-drag-handle, .field-delete, .field-resize-handle, .signature-resize-handle, .date-resize-handle, .checkbox-resize-handle, .name-resize-handle, .email-resize-handle, button, input, textarea, select, label",
      )
    ) {
      return;
    }

    const page = pageRef.current;

    if (!page) {
      return;
    }

    const rect =
      page.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    const scale =
      Math.min(
        1,
        rect.width /
          EDITOR_PAGE_WIDTH,
      );

    const safeScale =
      Number.isFinite(scale) &&
      scale > 0
        ? scale
        : 1;

    const x =
      (event.clientX - rect.left) /
      safeScale;

    const y =
      (event.clientY - rect.top) /
      safeScale;

    onAddField(
      pageNumber,
      Math.max(0, x),
      Math.max(0, y),
    );
  };

  const pageFields =
    fields.filter(
      (field) =>
        field.page === pageNumber,
    );

  const renderField = (
    field: DocumentField,
  ) => {
    const commonProps = {
      field,
      selected:
        selectedFieldId === field.id,
      onUpdate: onUpdateField,
      onDelete: onDeleteField,
      onSelect: onSelectField,
    };

    switch (field.type) {
      case "text":
        return (
          <TextField
            key={field.id}
            {...commonProps}
          />
        );

      case "signature":
        return (
          <SignatureField
            key={field.id}
            {...commonProps}
          />
        );

      case "date":
        return (
          <DateField
            key={field.id}
            {...commonProps}
          />
        );

      case "checkbox":
        return (
          <CheckboxField
            key={field.id}
            {...commonProps}
          />
        );

      case "name":
        return (
          <NameField
            key={field.id}
            {...commonProps}
          />
        );

      case "email":
        return (
          <EmailField
            key={field.id}
            {...commonProps}
          />
        );

      default:
        return null;
    }
  };

  const fieldLayerStyle = {
    left: 0,
    top: 0,
    right: "auto",
    bottom: "auto",
    width: EDITOR_PAGE_WIDTH,
    height: internalHeight,
    transform: `scale(${displayScale})`,
    transformOrigin: "top left",
  };

  return (
    <div
      ref={pageRef}
      className={`pdf-page-wrapper ${
        canPlaceField(activeTool)
          ? "pdf-page-text-mode"
          : ""
      }`}
      onClick={handlePageClick}
    >
      <Page
        pageNumber={pageNumber}
        width={EDITOR_PAGE_WIDTH}
        renderTextLayer
        renderAnnotationLayer
      />

      <div
        className="field-layer"
        style={fieldLayerStyle}
      >
        {pageFields.map(renderField)}
      </div>
    </div>
  );
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
          (_, index) => (
            <PdfPage
              key={index + 1}
              pageNumber={index + 1}
              activeTool={activeTool}
              fields={fields}
              selectedFieldId={
                selectedFieldId
              }
              onAddField={onAddField}
              onUpdateField={
                onUpdateField
              }
              onDeleteField={
                onDeleteField
              }
              onSelectField={
                onSelectField
              }
            />
          ),
        )}
      </Document>
    </div>
  );
}
