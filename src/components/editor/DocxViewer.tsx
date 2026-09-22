import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { MouseEvent } from "react";

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

  zoom?: number;

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
 * --------------------------------------------------
 * INTERNAL DOCUMENT SIZE
 * --------------------------------------------------
 *
 * SignFlow stores DOCX field coordinates in a
 * fixed internal coordinate system.
 *
 * The visual document can then be scaled without
 * changing the stored field coordinates.
 */

const DOCUMENT_WIDTH = 820;

const MIN_DOCUMENT_HEIGHT = 1120;

const MIN_ZOOM = 0.5;

const MAX_ZOOM = 1.5;

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

const clamp = (
  value: number,
  min: number,
  max: number,
) =>
  Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );

export default function DocxViewer({
  file,
  activeTool,
  fields,
  selectedFieldId,
  zoom = 100,
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
    useState(
      MIN_DOCUMENT_HEIGHT,
    );

  /*
   * --------------------------------------------------
   * NORMALIZED ZOOM
   * --------------------------------------------------
   */

  const safeZoom =
    clamp(
      Number.isFinite(zoom)
        ? zoom / 100
        : 1,
      MIN_ZOOM,
      MAX_ZOOM,
    );

  /*
   * --------------------------------------------------
   * LOAD DOCX
   * --------------------------------------------------
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
                includeDefaultStyleMap:
                  true,
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
   * --------------------------------------------------
   * CALCULATE FIT SCALE
   * --------------------------------------------------
   *
   * This represents the responsive scale required
   * to fit the document into the available viewport.
   *
   * Zoom is applied separately.
   *
   * Therefore:
   *
   * final visual scale =
   * responsive fit scale × user zoom
   *
   * The internal document remains 820px wide.
   * --------------------------------------------------
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

        /*
         * Leave a small amount of breathing room
         * around the document.
         */

        const horizontalPadding =
          availableWidth <= 480
            ? 8
            : 24;

        const usableWidth =
          Math.max(
            1,
            availableWidth -
              horizontalPadding * 2,
          );

        const fitScale =
          Math.min(
            1,
            usableWidth /
              DOCUMENT_WIDTH,
          );

        setDocumentScale(
          fitScale,
        );

        const naturalHeight =
          Math.max(
            page.scrollHeight,
            MIN_DOCUMENT_HEIGHT,
          );

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
   * --------------------------------------------------
   * DOCUMENT HEIGHT
   * --------------------------------------------------
   *
   * The actual DOCX page is allowed to determine
   * its natural height.
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
            Math.max(
              MIN_DOCUMENT_HEIGHT,
              height,
            ),
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
   * --------------------------------------------------
   * DOCUMENT READY
   * --------------------------------------------------
   *
   * App/exportDocx needs the actual unscaled
   * document element.
   *
   * We intentionally pass documentRef.current,
   * not the visual wrapper.
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
   * --------------------------------------------------
   * FIELD MODE
   * --------------------------------------------------
   */

  const canAddField =
    SUPPORTED_TOOLS.includes(
      activeTool,
    );

  /*
   * --------------------------------------------------
   * FINAL VISUAL SCALE
   * --------------------------------------------------
   *
   * documentScale handles responsive fitting.
   *
   * safeZoom handles the user's selected zoom.
   *
   * At 100%:
   *
   * finalScale = documentScale
   *
   * At 150%:
   *
   * finalScale = documentScale × 1.5
   */

  const finalScale =
    documentScale *
    safeZoom;

  /*
   * --------------------------------------------------
   * ADD FIELD
   * --------------------------------------------------
   *
   * The click position is measured against the
   * visually transformed document.
   *
   * We convert it back into the fixed 820px
   * internal coordinate system.
   */

  const handleDocumentClick = (
    event: MouseEvent<HTMLDivElement>,
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
     * Never create a new field while interacting
     * with an existing field or one of its controls.
     */

    if (
      target.closest(
        ".document-field, " +
          ".field-drag-handle, " +
          ".field-delete, " +
          ".field-resize-handle, " +
          ".signature-resize-handle, " +
          ".date-resize-handle, " +
          ".checkbox-resize-handle, " +
          ".name-resize-handle, " +
          ".email-resize-handle, " +
          "button, input, textarea, select",
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
     * The DOM width is the visually transformed
     * width of the document.
     *
     * Convert that back to the 820px internal
     * coordinate system.
     */

    const safeScale =
      rect.width /
      DOCUMENT_WIDTH;

    if (
      !Number.isFinite(
        safeScale,
      ) ||
      safeScale <= 0
    ) {
      return;
    }

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
     * Convert the field dimensions from internal
     * coordinates to displayed coordinates.
     */

    const displayFieldWidth =
      fieldWidth *
      safeScale;

    const displayFieldHeight =
      fieldHeight *
      safeScale;

    /*
     * Keep the complete field inside the page.
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
     * Convert to internal document coordinates.
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
   * --------------------------------------------------
   * RENDER FIELD
   * --------------------------------------------------
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

  /*
   * --------------------------------------------------
   * LOADING
   * --------------------------------------------------
   */

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

  /*
   * --------------------------------------------------
   * ERROR
   * --------------------------------------------------
   */

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
   * --------------------------------------------------
   * VISUAL DOCUMENT DIMENSIONS
   * --------------------------------------------------
   *
   * The wrapper represents the actual visible size
   * after responsive fitting and user zoom.
   */

  const visualDocumentWidth =
    DOCUMENT_WIDTH *
    finalScale;

  const visualDocumentHeight =
    documentHeight *
    finalScale;

  /*
   * --------------------------------------------------
   * RESPONSIVE DOCX EDITOR
   * --------------------------------------------------
   */

  return (
    <div
      ref={viewerRef}
      className="docx-document"
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,

        boxSizing:
          "border-box",

        overflowX:
          safeZoom > 1
            ? "auto"
            : "hidden",

        overflowY:
          "visible",

        overscrollBehaviorX:
          "contain",

        WebkitOverflowScrolling:
          "touch",
      }}
    >
      {/*
       * ------------------------------------------------
       * ZOOM SCROLL AREA
       * ------------------------------------------------
       *
       * At normal zoom this remains centered.
       *
       * Above 100% zoom the document can extend
       * beyond the viewport and becomes horizontally
       * scrollable.
       */}

      <div
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,

          overflowX:
            safeZoom > 1
              ? "auto"
              : "hidden",

          overflowY:
            "visible",

          overscrollBehaviorX:
            "contain",

          WebkitOverflowScrolling:
            "touch",

          boxSizing:
            "border-box",

          display: "flex",

          justifyContent:
            safeZoom <= 1
              ? "center"
              : "flex-start",

          alignItems:
            "flex-start",

          padding:
            safeZoom > 1
              ? "0 8px 24px"
              : "0 0 24px",
        }}
      >
        {/*
         * ------------------------------------------------
         * VISUAL FRAME
         * ------------------------------------------------
         *
         * This represents the transformed size of the
         * document.
         *
         * It is NOT passed to exportDocx.
         */}

        <div
          style={{
            width:
              `${visualDocumentWidth}px`,

            height:
              `${visualDocumentHeight}px`,

            flex:
              "0 0 auto",

            position:
              "relative",

            overflow:
              "visible",

            boxSizing:
              "border-box",
          }}
        >
          {/*
           * ------------------------------------------------
           * REAL DOCX PAGE
           * ------------------------------------------------
           *
           * This element always remains 820px wide
           * internally.
           *
           * Both the DOCX content and field layer
           * receive the exact same transform.
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
                `scale(${finalScale})`,

              transformOrigin:
                "top left",

              isolation:
                "isolate",

              overflow:
                "visible",
            }}
          >
            {/*
             * ------------------------------------------------
             * DOCX CONTENT
             * ------------------------------------------------
             */}

            <div
              className="docx-content"
              dangerouslySetInnerHTML={{
                __html: html,
              }}
            />

            {/*
             * ------------------------------------------------
             * FIELD LAYER
             * ------------------------------------------------
             *
             * It uses the exact same 820px internal
             * coordinate system as the DOCX page.
             *
             * Because it is inside the same transformed
             * page, fields remain aligned at every zoom.
             */}

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

                overflow:
                  "visible",

                lineHeight:
                  "normal",
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
    </div>
  );
}