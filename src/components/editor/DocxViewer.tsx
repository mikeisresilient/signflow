import {
  useEffect,
  useRef,
  useState,
} from "react";

import mammoth from "mammoth";

import type { DocumentField } from "../../types/document";

import TextField from "./TextField";
import SignatureField from "./SignatureField";
import DateField from "./DateField";
import CheckboxField from "./CheckboxField";
import NameField from "./NameField";
import EmailField from "./EmailField";

interface DocxViewerProps {
  file: File;
  activeTool: string;
  fields: DocumentField[];
  selectedFieldId: string | null;

  onAddField: (
    page: number,
    x: number,
    y: number,
    scale?: number,
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

  onDocumentReady: (
    element: HTMLDivElement | null,
  ) => void;
}

const DOCUMENT_WIDTH = 820;

const SUPPORTED_TOOLS = [
  "text",
  "signature",
  "date",
  "checkbox",
  "name",
  "email",
];

export default function DocxViewer({
  file,
  activeTool,
  fields,
  selectedFieldId,
  onAddField,
  onUpdateField,
  onDeleteField,
  onSelectField,
  onDocumentReady,
}: DocxViewerProps) {
  const documentRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [html, setHtml] =
    useState("");

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  /*
   * Convert DOCX to HTML using
   * Mammoth.
   */
  useEffect(() => {
    let cancelled = false;

    const loadDocument =
      async () => {
        setIsLoading(true);
        setError(null);
        setHtml("");

        try {
          const arrayBuffer =
            await file.arrayBuffer();

          const result =
            await mammoth.convertToHtml(
              {
                arrayBuffer,
              },
              {
                includeDefaultStyleMap: true,
              },
            );

          if (cancelled) {
            return;
          }

          setHtml(
            result.value,
          );
        } catch (loadError) {
          if (cancelled) {
            return;
          }

          console.error(
            "DOCX loading error:",
            loadError,
          );

          setError(
            "Unable to open this DOCX document.",
          );
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      };

    loadDocument();

    return () => {
      cancelled = true;
    };
  }, [file]);

  /*
   * Expose the actual rendered
   * document page to App.tsx.
   *
   * The exporter uses this exact
   * DOM element so field positions
   * match what the user sees.
   */
  useEffect(() => {
    if (
      isLoading ||
      error ||
      !documentRef.current
    ) {
      onDocumentReady(null);
      return;
    }

    onDocumentReady(
      documentRef.current,
    );
  }, [
    isLoading,
    error,
    html,
    onDocumentReady,
  ]);

  /*
   * Only allow field placement when
   * one of the supported field tools
   * is active.
   */
  const canAddField =
    SUPPORTED_TOOLS.includes(
      activeTool,
    );

  /*
   * DOCX is rendered at a fixed
   * document coordinate width.
   *
   * CSS scales the document down
   * responsively on smaller screens,
   * while fields remain positioned
   * using document coordinates.
   */
  const handleDocumentClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!canAddField) {
      return;
    }

    const documentElement =
      documentRef.current;

    if (!documentElement) {
      return;
    }

    /*
     * Ignore clicks originating
     * from an existing field.
     */
    const target =
      event.target as HTMLElement;

    if (
      target.closest(
        ".document-field",
      )
    ) {
      return;
    }

    const rect =
      documentElement.getBoundingClientRect();

    /*
     * Convert displayed coordinates
     * into the 820px document
     * coordinate system.
     */
    const scale =
      rect.width /
      DOCUMENT_WIDTH;

    const safeScale =
      scale > 0
        ? scale
        : 1;

    const displayX =
      event.clientX -
      rect.left;

    const displayY =
      event.clientY -
      rect.top;

    const x =
      displayX /
      safeScale;

    const y =
      displayY /
      safeScale;

    onAddField(
      1,
      Math.max(
        0,
        x,
      ),
      Math.max(
        0,
        y,
      ),
      safeScale,
    );
  };

  /*
   * Render a field using the same
   * field components used by PDF
   * and image documents.
   */
  const renderField = (
    field: DocumentField,
  ) => {
    const commonProps = {
      field,
      selected:
        selectedFieldId ===
        field.id,
      onUpdate:
        onUpdateField,
      onDelete:
        onDeleteField,
      onSelect:
        onSelectField,
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

  if (isLoading) {
    return (
      <div className="docx-loading">
        <div className="docx-loading-spinner" />

        <span>
          Loading document...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="docx-error">
        <div className="docx-error-icon">
          !
        </div>

        <h3>
          Unable to open document
        </h3>

        <p>
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="docx-document">
      <div
        ref={documentRef}
        className={
          canAddField
            ? "docx-page docx-field-mode"
            : "docx-page"
        }
        onClick={
          handleDocumentClick
        }
      >
        <div
          className="docx-content"
          dangerouslySetInnerHTML={{
            __html: html,
          }}
        />

        <div className="docx-field-layer">
          {fields
            .filter(
              (field) =>
                field.page === 1,
            )
            .map(
              renderField,
            )}
        </div>
      </div>
    </div>
  );
}