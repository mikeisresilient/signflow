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

/*
 * SignFlow keeps document fields in a
 * fixed internal coordinate system.
 *
 * The document is visually scaled on
 * smaller screens.
 */
const DOCUMENT_WIDTH = 820;

const SUPPORTED_TOOLS = [
  "text",
  "signature",
  "date",
  "checkbox",
  "name",
  "email",
];

const getFieldSize = (
  tool: string,
) => {
  switch (tool) {
    case "signature":
      return {
        width: 320,
        height: 140,
      };

    case "date":
      return {
        width: 180,
        height: 42,
      };

    case "checkbox":
      return {
        width: 36,
        height: 36,
      };

    case "name":
      return {
        width: 240,
        height: 42,
      };

    case "email":
      return {
        width: 280,
        height: 42,
      };

    case "text":
    default:
      return {
        width: 200,
        height: 42,
      };
  }
};

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

  const viewerRef =
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

  const [documentScale, setDocumentScale] =
    useState(1);

  const [documentHeight, setDocumentHeight] =
    useState(1120);

  /*
   * Load DOCX and convert it to HTML.
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
   * Calculate the visual scale.
   *
   * Desktop:
   *   820px document = scale 1
   *
   * Mobile:
   *   available width / 820px
   *
   * Example:
   *   328px screen -> 0.4 scale
   */
  useEffect(() => {
    if (isLoading || error) {
      return;
    }

    const viewer =
      viewerRef.current;

    const page =
      documentRef.current;

    if (!viewer || !page) {
      return;
    }

    const updateScale =
      () => {
        const availableWidth =
          viewer.clientWidth;

        if (
          availableWidth <= 0
        ) {
          return;
        }

        const nextScale =
          Math.min(
            1,
            availableWidth /
              DOCUMENT_WIDTH,
          );

        setDocumentScale(
          nextScale,
        );

        /*
         * The page itself remains
         * 820px wide internally.
         *
         * We only scale the visual
         * representation.
         */
        const naturalHeight =
          page.scrollHeight;

        if (
          naturalHeight > 0
        ) {
          setDocumentHeight(
            naturalHeight,
          );
        }
      };

    updateScale();

    const resizeObserver =
      new ResizeObserver(
        updateScale,
      );

    resizeObserver.observe(
      viewer,
    );

    resizeObserver.observe(
      page,
    );

    const frame =
      requestAnimationFrame(
        updateScale,
      );

    return () => {
      cancelAnimationFrame(
        frame,
      );

      resizeObserver.disconnect();
    };
  }, [
    isLoading,
    error,
    html,
  ]);

  /*
   * Recalculate page height after
   * the document has rendered.
   */
  useEffect(() => {
    if (
      isLoading ||
      error ||
      !documentRef.current
    ) {
      return;
    }

    const page =
      documentRef.current;

    const updateHeight =
      () => {
        const height =
          page.scrollHeight;

        if (
          height > 0
        ) {
          setDocumentHeight(
            height,
          );
        }
      };

    updateHeight();

    const frame1 =
      requestAnimationFrame(
        updateHeight,
      );

    const frame2 =
      requestAnimationFrame(
        () => {
          requestAnimationFrame(
            updateHeight,
          );
        },
      );

    return () => {
      cancelAnimationFrame(
        frame1,
      );

      cancelAnimationFrame(
        frame2,
      );
    };
  }, [
    html,
    isLoading,
    error,
  ]);

  /*
   * Give App.tsx the actual document
   * element used for DOCX export.
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

  const canAddField =
    SUPPORTED_TOOLS.includes(
      activeTool,
    );

  /*
   * Add a field to the document.
   *
   * The click happens on the visually
   * scaled page, so we convert the
   * screen position back into the
   * 820px internal coordinate system.
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

    const target =
      event.target as HTMLElement;

    /*
     * Don't add a new field when
     * interacting with an existing field.
     */
    if (
      target.closest(
        ".document-field",
      )
    ) {
      return;
    }

    const rect =
      documentElement.getBoundingClientRect();

    if (
      rect.width <= 0 ||
      rect.height <= 0
    ) {
      return;
    }

    /*
     * Because the document is visually
     * scaled, determine its actual
     * displayed scale from the DOM.
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

    const {
      width: fieldWidth,
      height: fieldHeight,
    } =
      getFieldSize(
        activeTool,
      );

    /*
     * Convert field dimensions from
     * internal document coordinates
     * into displayed screen dimensions.
     */
    const displayFieldWidth =
      fieldWidth *
      safeScale;

    const displayFieldHeight =
      fieldHeight *
      safeScale;

    /*
     * Keep the complete field inside
     * the visible document page.
     */
    const maxDisplayX =
      Math.max(
        0,
        rect.width -
          displayFieldWidth,
      );

    const maxDisplayY =
      Math.max(
        0,
        rect.height -
          displayFieldHeight,
      );

    const clampedDisplayX =
      Math.min(
        maxDisplayX,
        Math.max(
          0,
          displayX,
        ),
      );

    const clampedDisplayY =
      Math.min(
        maxDisplayY,
        Math.max(
          0,
          displayY,
        ),
      );

    /*
     * Convert back to internal
     * 820px document coordinates.
     */
    const x =
      clampedDisplayX /
      safeScale;

    const y =
      clampedDisplayY /
      safeScale;

    onAddField(
      1,
      x,
      y,
      safeScale,
    );
  };

  /*
   * Render fields.
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

  /*
   * The outer viewer is always responsive.
   *
   * There is NO horizontal scrolling.
   */
  return (
    <div
      ref={viewerRef}
      className="docx-document"
      style={{
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {/*
       * This frame represents the
       * VISUAL size of the document.
       *
       * On mobile it becomes smaller.
       * The actual page inside remains
       * 820px wide internally.
       */}
      <div
        style={{
          width:
            `${DOCUMENT_WIDTH * documentScale}px`,

          height:
            `${documentHeight * documentScale}px`,

          maxWidth:
            "100%",

          margin:
            "0 auto",

          position:
            "relative",

          overflow:
            "visible",

          boxSizing:
            "border-box",
        }}
      >
        {/*
         * This is the real document page.
         *
         * It remains 820px internally,
         * then the entire page is scaled.
         *
         * Content + fields therefore scale
         * together and stay aligned.
         */}
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
          style={{
            position:
              "absolute",

            top: 0,
            left: 0,

            width:
              `${DOCUMENT_WIDTH}px`,

            minWidth:
              `${DOCUMENT_WIDTH}px`,

            maxWidth:
              `${DOCUMENT_WIDTH}px`,

            minHeight:
              `${documentHeight}px`,

            margin: 0,

            boxSizing:
              "border-box",

            background:
              "#ffffff",

            transform:
              `scale(${documentScale})`,

            transformOrigin:
              "top left",

            isolation:
              "isolate",
          }}
        >
          <div
            className="docx-content"
            dangerouslySetInnerHTML={{
              __html: html,
            }}
          />

          <div
            className="docx-field-layer"
            style={{
              position:
                "absolute",

              top: 0,
              left: 0,
              right: 0,
              bottom: 0,

              width:
                "100%",

              minHeight:
                "100%",

              pointerEvents:
                "none",

              zIndex: 20,
            }}
          >
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
    </div>
  );
}