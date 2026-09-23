import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";

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

/**
 * SignFlow keeps field coordinates in a stable internal coordinate system.
 * The actual PDF is then displayed at a responsive scale derived from the
 * available viewport and the selected zoom.
 */
const EDITOR_PAGE_WIDTH = 820;
const DEFAULT_PAGE_HEIGHT = 1120;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

interface DocumentViewerProps {
  file: File;
  activeTool: string;
  fields: DocumentField[];
  selectedFieldId: string | null;
  zoom?: number;

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
  zoom: number;
  availableWidth: number;

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

  onPageRef: (
    pageNumber: number,
    element: HTMLDivElement | null,
  ) => void;

  onPageVisible: (
    pageNumber: number,
  ) => void;
}

const FIELD_TOOLS = new Set([
  "text",
  "signature",
  "date",
  "checkbox",
  "name",
  "email",
]);

const INTERACTIVE_FIELD_SELECTOR = [
  ".document-field",
  ".signature-field",
  ".date-field",
  ".checkbox-field",
  ".name-field",
  ".email-field",
  ".field-drag-handle",
  ".field-delete",
  ".field-resize-handle",
  ".text-resize-handle",
  ".signature-resize-handle",
  ".date-resize-handle",
  ".checkbox-resize-handle",
  ".name-resize-handle",
  ".email-resize-handle",
  ".signature-controls",
  ".date-controls",
  ".checkbox-controls",
  ".name-controls",
  ".email-controls",
  "button",
  "input",
  "textarea",
  "select",
  "label",
].join(", ");

const clamp = (
  value: number,
  min: number,
  max: number,
): number => {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (max < min) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, value),
  );
};

const normalizeZoom = (
  value: number | undefined,
): number => {
  const numericValue =
    Number.isFinite(value)
      ? Number(value)
      : 100;

  return clamp(
    numericValue / 100,
    MIN_ZOOM,
    MAX_ZOOM,
  );
};

const isFieldTool = (
  tool: string,
): boolean => FIELD_TOOLS.has(tool);

const isInteractiveTarget = (
  target: EventTarget | null,
): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      INTERACTIVE_FIELD_SELECTOR,
    ),
  );
};

/**
 * Each PDF page owns its own geometry.
 *
 * Important:
 * The page itself is never forced to 100% by a generic .pdf-page-wrapper
 * rule. A unique class is used here so the editor can control its width
 * without fighting the global responsive stylesheet.
 */
function PdfPage({
  pageNumber,
  activeTool,
  fields,
  selectedFieldId,
  zoom,
  availableWidth,
  onAddField,
  onUpdateField,
  onDeleteField,
  onSelectField,
  onPageRef,
  onPageVisible,
}: PdfPageProps) {
  const pageRef =
    useRef<HTMLDivElement | null>(null);

  const pageContentRef =
    useRef<HTMLDivElement | null>(null);

  const [pageInternalHeight, setPageInternalHeight] =
    useState(DEFAULT_PAGE_HEIGHT);

  const safeZoom = clamp(
    zoom,
    MIN_ZOOM,
    MAX_ZOOM,
  );

  const safeAvailableWidth =
    Number.isFinite(availableWidth) &&
    availableWidth > 0
      ? availableWidth
      : EDITOR_PAGE_WIDTH;

  /**
   * At 100% and below:
   *   the document fits the available viewport.
   *
   * Above 100%:
   *   the document keeps its zoomed width and the inner scroll area
   *   handles horizontal scrolling.
   */
  const requestedWidth =
    EDITOR_PAGE_WIDTH * safeZoom;

  const displayWidth =
    safeZoom <= 1
      ? Math.min(
          requestedWidth,
          safeAvailableWidth,
        )
      : requestedWidth;

  const safeDisplayWidth =
    Math.max(
      1,
      displayWidth,
    );

  /**
   * One and only one scale is used for field coordinates:
   *
   *     displayed page width / internal page width
   *
   * This makes field placement, dragging and resizing independent of
   * whether the device is a phone, tablet, laptop or desktop.
   */
  const displayScale =
    safeDisplayWidth /
    EDITOR_PAGE_WIDTH;

  useEffect(() => {
    const element =
      pageRef.current;

    if (!element) {
      return;
    }

    onPageRef(
      pageNumber,
      element,
    );

    return () => {
      onPageRef(
        pageNumber,
        null,
      );
    };
  }, [
    onPageRef,
    pageNumber,
  ]);

  /**
   * Current-page detection.
   *
   * The root application scroll container is intentionally not hard-coded.
   * IntersectionObserver calculates visibility against the nearest viewport
   * so this works with the desktop and mobile layouts.
   */
  useEffect(() => {
    const element =
      pageRef.current;

    if (
      !element ||
      typeof IntersectionObserver ===
        "undefined"
    ) {
      return;
    }

    /*
     * The PDF pages are scrolled inside SignFlow's own document viewport.
     * Use that element as the IntersectionObserver root so the page indicator
     * follows the page actually visible inside the editor, including mobile.
     */
    const scrollContainer =
      pageRef.current?.closest(
        ".signflow-pdf-scroll",
      ) as HTMLElement | null;

    const observer =
      new IntersectionObserver(
        (entries) => {
          const visible =
            entries.filter(
              (entry) =>
                entry.isIntersecting &&
                entry.intersectionRatio >=
                  0.2,
            );

          if (
            visible.length === 0
          ) {
            return;
          }

          let mostVisible =
            visible[0];

          for (
            let index = 1;
            index < visible.length;
            index += 1
          ) {
            if (
              visible[index]
                .intersectionRatio >
              mostVisible.intersectionRatio
            ) {
              mostVisible =
                visible[index];
            }
          }

          if (mostVisible) {
            onPageVisible(
              pageNumber,
            );
          }
        },
        {
          root: scrollContainer,
          rootMargin: "0px",
          threshold: [
            0.2,
            0.35,
            0.5,
            0.75,
          ],
        },
      );

    observer.observe(
      element,
    );

    return () => {
      observer.disconnect();
    };
  }, [
    onPageVisible,
    pageNumber,
  ]);

  /**
   * Read the actual PDF canvas height.
   *
   * React-PDF renders the canvas at the requested display width. Converting
   * that rendered height back through displayScale gives us the real internal
   * page height. This is especially important for the final page and for PDFs
   * with non-standard page dimensions.
   */
  useEffect(() => {
    const element =
      pageContentRef.current;

    if (!element) {
      return;
    }

    let frame = 0;

    const measurePage = () => {
      const canvas =
        element.querySelector(
          "canvas",
        );

      if (
        !(canvas instanceof HTMLCanvasElement)
      ) {
        return;
      }

      const rect =
        canvas.getBoundingClientRect();

      if (
        rect.width <= 0 ||
        rect.height <= 0
      ) {
        return;
      }

      const measuredHeight =
        rect.height /
        displayScale;

      if (
        Number.isFinite(
          measuredHeight,
        ) &&
        measuredHeight > 0
      ) {
        setPageInternalHeight(
          measuredHeight,
        );
      }
    };

    const observer =
      new ResizeObserver(
        () => {
          measurePage();
        },
      );

    observer.observe(
      element,
    );

    frame =
      requestAnimationFrame(
        measurePage,
      );

    return () => {
      cancelAnimationFrame(
        frame,
      );
      observer.disconnect();
    };
  }, [
    displayScale,
    safeDisplayWidth,
  ]);

  const handlePageClick = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (
      !isFieldTool(
        activeTool,
      )
    ) {
      return;
    }

    if (
      isInteractiveTarget(
        event.target,
      )
    ) {
      return;
    }

    const page =
      pageRef.current;

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

    /**
     * The page's visible width is the source of truth.
     * Never use viewport width or zoom directly here.
     */
    const scale =
      rect.width /
      EDITOR_PAGE_WIDTH;

    if (
      !Number.isFinite(scale) ||
      scale <= 0
    ) {
      return;
    }

    const displayX =
      event.clientX -
      rect.left;

    const displayY =
      event.clientY -
      rect.top;

    const internalX =
      displayX / scale;

    const internalY =
      displayY / scale;

    const safeX =
      clamp(
        internalX,
        0,
        EDITOR_PAGE_WIDTH,
      );

    const safeY =
      clamp(
        internalY,
        0,
        pageInternalHeight,
      );

    onAddField(
      pageNumber,
      safeX,
      safeY,
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

  const fieldLayerStyle: CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: EDITOR_PAGE_WIDTH,
    height: pageInternalHeight,
    transform:
      `scale(${displayScale})`,
    transformOrigin:
      "top left",
    overflow: "visible",
    pointerEvents: "none",
    zIndex: 20,
    boxSizing: "border-box",
  };

  const pageStyle: CSSProperties = {
    position: "relative",
    width: safeDisplayWidth,
    minWidth: safeDisplayWidth,
    maxWidth: "none",
    height: "auto",
    flex: "0 0 auto",
    boxSizing: "border-box",
    marginLeft:
      safeZoom <= 1
        ? "auto"
        : 0,
    marginRight:
      safeZoom <= 1
        ? "auto"
        : 0,
    scrollMarginTop: 76,
  };

  return (
    <div
      ref={pageRef}
      className={`signflow-pdf-page ${
        isFieldTool(activeTool)
          ? "signflow-pdf-page-text-mode"
          : ""
      }`}
      data-page-number={
        pageNumber
      }
      onClick={
        handlePageClick
      }
      style={pageStyle}
    >
      <div
        ref={
          pageContentRef
        }
        className="signflow-pdf-page-content"
        style={{
          position: "relative",
          width: safeDisplayWidth,
          minWidth: safeDisplayWidth,
          maxWidth: "none",
          boxSizing: "border-box",
        }}
      >
        <Page
          pageNumber={
            pageNumber
          }
          width={
            safeDisplayWidth
          }
          renderTextLayer
          renderAnnotationLayer
        />

        <div
          className="signflow-pdf-field-layer"
          style={
            fieldLayerStyle
          }
        >
          {pageFields.map(
            renderField,
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocumentViewer({
  file,
  activeTool,
  fields,
  selectedFieldId,
  zoom = 100,
  onAddField,
  onUpdateField,
  onDeleteField,
  onSelectField,
}: DocumentViewerProps) {
  const [numPages, setNumPages] =
    useState(0);

  const [currentPage, setCurrentPage] =
    useState(1);

  const [pageInput, setPageInput] =
    useState("1");

  const [availableWidth, setAvailableWidth] =
    useState(
      EDITOR_PAGE_WIDTH,
    );

  const viewerRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const scrollRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const pageRefs =
    useRef<
      Map<
        number,
        HTMLDivElement
      >
    >(
      new Map(),
    );

  const safeZoom =
    normalizeZoom(zoom);

  /**
   * Measure the actual width available to the PDF editor.
   *
   * ResizeObserver handles:
   *   phone rotation
   *   tablet rotation
   *   sidebar changes
   *   browser resizing
   *   desktop window resizing
   */
  useEffect(() => {
    const element =
      viewerRef.current;

    if (!element) {
      return;
    }

    const updateWidth = () => {
      const width =
        element.clientWidth;

      if (
        width > 0
      ) {
        setAvailableWidth(
          width,
        );
      }
    };

    const observer =
      new ResizeObserver(
        updateWidth,
      );

    observer.observe(
      element,
    );

    updateWidth();

    return () => {
      observer.disconnect();
    };
  }, []);

  const registerPageRef =
    useCallback(
      (
        pageNumber: number,
        element:
          HTMLDivElement | null,
      ) => {
        if (element) {
          pageRefs.current.set(
            pageNumber,
            element,
          );
        } else {
          pageRefs.current.delete(
            pageNumber,
          );
        }
      },
      [],
    );

  const handlePageVisible =
    useCallback(
      (
        pageNumber: number,
      ) => {
        setCurrentPage(
          (previous) =>
            previous === pageNumber
              ? previous
              : pageNumber,
        );

        setPageInput(
          String(pageNumber),
        );
      },
      [],
    );

  /**
   * Scroll only the SignFlow document container.
   *
   * This avoids scrollIntoView() choosing an unrelated ancestor on mobile
   * browsers and accidentally moving the application shell.
   */
  const goToPage =
    useCallback(
      (pageNumber: number) => {
        if (
          numPages <= 0
        ) {
          return;
        }

        const safePage =
          Math.round(
            clamp(
              pageNumber,
              1,
              numPages,
            ),
          );

        const pageElement =
          pageRefs.current.get(
            safePage,
          );

        setCurrentPage(
          safePage,
        );

        setPageInput(
          String(safePage),
        );

        if (
          !pageElement
        ) {
          return;
        }

        const container =
          scrollRef.current;

        if (!container) {
          pageElement.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });

          return;
        }

        const containerRect =
          container.getBoundingClientRect();

        const pageRect =
          pageElement.getBoundingClientRect();

        const targetTop =
          container.scrollTop +
          (
            pageRect.top -
            containerRect.top
          ) -
          8;

        container.scrollTo({
          top: Math.max(
            0,
            targetTop,
          ),
          behavior: "smooth",
        });
      },
      [
        numPages,
      ],
    );

  const handlePreviousPage =
    useCallback(
      () => {
        if (
          currentPage <= 1
        ) {
          return;
        }

        goToPage(
          currentPage - 1,
        );
      },
      [
        currentPage,
        goToPage,
      ],
    );

  const handleNextPage =
    useCallback(
      () => {
        if (
          currentPage >=
          numPages
        ) {
          return;
        }

        goToPage(
          currentPage + 1,
        );
      },
      [
        currentPage,
        numPages,
        goToPage,
      ],
    );

  /**
   * Keyboard page navigation.
   */
  useEffect(() => {
    const handleKeyboard =
      (
        event: globalThis.KeyboardEvent,
      ) => {
        if (
          numPages <= 0
        ) {
          return;
        }

        const active =
          document.activeElement;

        const target =
          event.target instanceof
          HTMLElement
            ? event.target
            : null;

        const activeInside =
          viewerRef.current
            ? viewerRef.current.contains(
                active,
              )
            : false;

        const activeTag =
          active instanceof HTMLElement
            ? active.tagName
            : "";

        const targetTag =
          target?.tagName ?? "";

        const editable =
          activeTag === "INPUT" ||
          activeTag === "TEXTAREA" ||
          activeTag === "SELECT" ||
          targetTag === "INPUT" ||
          targetTag === "TEXTAREA" ||
          targetTag === "SELECT" ||
          active?.getAttribute(
            "contenteditable",
          ) === "true" ||
          target?.getAttribute(
            "contenteditable",
          ) === "true";

        if (editable) {
          return;
        }

        if (
          isInteractiveTarget(
            target,
          )
        ) {
          return;
        }

        if (
          active &&
          active !== document.body &&
          !activeInside
        ) {
          return;
        }

        switch (
          event.key
        ) {
          case "ArrowRight":
          case "ArrowDown":
          case "PageDown":
            if (
              currentPage <
              numPages
            ) {
              event.preventDefault();
              goToPage(
                currentPage + 1,
              );
            }
            return;

          case "ArrowLeft":
          case "ArrowUp":
          case "PageUp":
            if (
              currentPage > 1
            ) {
              event.preventDefault();
              goToPage(
                currentPage - 1,
              );
            }
            return;

          case "Home":
            if (
              currentPage !== 1
            ) {
              event.preventDefault();
              goToPage(1);
            }
            return;

          case "End":
            if (
              currentPage !==
              numPages
            ) {
              event.preventDefault();
              goToPage(
                numPages,
              );
            }
            return;

          default:
            return;
        }
      };

    window.addEventListener(
      "keydown",
      handleKeyboard,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyboard,
      );
    };
  }, [
    currentPage,
    numPages,
    goToPage,
  ]);

  const handlePageInputChange =
    (
      event: ChangeEvent<HTMLInputElement>,
    ) => {
      const value =
        event.target.value;

      if (
        value === "" ||
        /^\d+$/.test(value)
      ) {
        setPageInput(
          value,
        );
      }
    };

  const commitPageInput =
    () => {
      if (
        numPages <= 0
      ) {
        return;
      }

      const parsed =
        Number(
          pageInput,
        );

      if (
        !Number.isFinite(
          parsed,
        )
      ) {
        setPageInput(
          String(
            currentPage,
          ),
        );
        return;
      }

      goToPage(
        parsed,
      );
    };

  const handlePageInputKeyDown =
    (
      event: ReactKeyboardEvent<HTMLInputElement>,
    ) => {
      if (
        event.key ===
        "Enter"
      ) {
        event.preventDefault();
        commitPageInput();
        event.currentTarget.blur();
        return;
      }

      if (
        event.key ===
        "Escape"
      ) {
        event.preventDefault();

        setPageInput(
          String(
            currentPage,
          ),
        );

        event.currentTarget.blur();
      }
    };

  const viewerStyle: CSSProperties =
    {
      width: "100%",
      maxWidth: "100%",
      minWidth: 0,
      position: "relative",
      boxSizing: "border-box",
    };

  const navigationStyle:
    CSSProperties = {
      position: "sticky",
      top: 0,
      zIndex: 1000,
      width: "100%",
      minWidth: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      padding: "8px 10px",
      margin: 0,
      boxSizing: "border-box",
      background:
        "rgba(255,255,255,0.97)",
      borderBottom:
        "1px solid rgba(15,23,42,0.10)",
      boxShadow:
        "0 2px 12px rgba(15,23,42,0.08)",
      backdropFilter:
        "blur(12px)",
      WebkitBackdropFilter:
        "blur(12px)",
      isolation: "isolate",
    };

  const navigationButtonStyle:
    CSSProperties = {
      width: 38,
      minWidth: 38,
      height: 36,
      padding: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      border:
        "1px solid #d1d5db",
      borderRadius: 8,
      fontSize: 20,
      fontWeight: 700,
      lineHeight: 1,
      flexShrink: 0,
      touchAction: "manipulation",
      boxSizing: "border-box",
    };

  return (
    <div
      ref={
        viewerRef
      }
      className="signflow-pdf-viewer"
      style={
        viewerStyle
      }
    >
      {numPages > 0 && (
        <div
          className="signflow-pdf-navigation"
          style={
            navigationStyle
          }
        >
          <button
            type="button"
            onClick={
              handlePreviousPage
            }
            disabled={
              currentPage <= 1
            }
            aria-label="Previous page"
            title="Previous page"
            style={{
              ...navigationButtonStyle,
              background:
                currentPage <= 1
                  ? "#f3f4f6"
                  : "#ffffff",
              color:
                currentPage <= 1
                  ? "#9ca3af"
                  : "#111827",
              cursor:
                currentPage <= 1
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            ‹
          </button>

          <div
            className="signflow-pdf-page-indicator"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              minWidth: 0,
              whiteSpace: "nowrap",
              fontSize: 14,
              fontWeight: 600,
              color: "#374151",
              flexShrink: 1,
            }}
          >
            <span>
              Page
            </span>

            <input
              type="text"
              inputMode="numeric"
              value={
                pageInput
              }
              onChange={
                handlePageInputChange
              }
              onBlur={
                commitPageInput
              }
              onKeyDown={
                handlePageInputKeyDown
              }
              aria-label="Current page"
              style={{
                width: 48,
                minWidth: 48,
                height: 34,
                padding: "0 6px",
                border:
                  "1px solid #d1d5db",
                borderRadius: 7,
                background: "#ffffff",
                color: "#111827",
                textAlign: "center",
                fontSize: 14,
                fontWeight: 600,
                outline: "none",
                boxSizing:
                  "border-box",
                flexShrink: 0,
              }}
            />

            <span>
              of {numPages}
            </span>
          </div>

          <button
            type="button"
            onClick={
              handleNextPage
            }
            disabled={
              currentPage >=
              numPages
            }
            aria-label="Next page"
            title="Next page"
            style={{
              ...navigationButtonStyle,
              background:
                currentPage >=
                numPages
                  ? "#f3f4f6"
                  : "#ffffff",
              color:
                currentPage >=
                numPages
                  ? "#9ca3af"
                  : "#111827",
              cursor:
                currentPage >=
                numPages
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            ›
          </button>
        </div>
      )}

      <div
        ref={
          scrollRef
        }
        className="signflow-pdf-scroll"
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          height: "100%",
          maxHeight: "100%",
          overflowX:
            safeZoom > 1
              ? "auto"
              : "hidden",
          overflowY: "auto",
          boxSizing:
            "border-box",
          overscrollBehaviorX:
            "contain",
          overscrollBehaviorY:
            "contain",
          WebkitOverflowScrolling:
            "touch",
          touchAction:
            safeZoom > 1
              ? "pan-x pan-y"
              : "pan-y",
        }}
      >
        <Document
          file={file}
          onLoadSuccess={({
            numPages:
              loadedNumPages,
          }) => {
            setNumPages(
              loadedNumPages,
            );

            setCurrentPage(
              1,
            );

            setPageInput(
              "1",
            );

            pageRefs.current.clear();

            requestAnimationFrame(() => {
              scrollRef.current?.scrollTo({
                top: 0,
                left: 0,
                behavior: "auto",
              });
            });
          }}
          onLoadError={(
            error,
          ) => {
            console.error(
              "PDF loading error:",
              error,
            );

            setNumPages(0);
            setCurrentPage(1);
            setPageInput("1");
            pageRefs.current.clear();

            requestAnimationFrame(() => {
              scrollRef.current?.scrollTo({
                top: 0,
                left: 0,
                behavior: "auto",
              });
            });
          }}
          loading={
            <div className="pdf-loading">
              Loading document...
            </div>
          }
          error={
            <div className="pdf-loading">
              Unable to load this PDF.
            </div>
          }
          noData={
            <div className="pdf-loading">
              No PDF document selected.
            </div>
          }
        >
          <div
            className="signflow-pdf-pages"
            style={{
              width:
                "100%",
              minWidth:
                safeZoom > 1
                  ? EDITOR_PAGE_WIDTH *
                    safeZoom
                  : "100%",
              display:
                "flex",
              flexDirection:
                "column",
              alignItems:
                safeZoom > 1
                  ? "flex-start"
                  : "stretch",
              gap: 24,
              padding:
                "16px 0 32px",
              boxSizing:
                "border-box",
            }}
          >
            {Array.from(
              {
                length:
                  numPages,
              },
              (_, index) => (
                <PdfPage
                  key={
                    index + 1
                  }
                  pageNumber={
                    index + 1
                  }
                  activeTool={
                    activeTool
                  }
                  fields={
                    fields
                  }
                  selectedFieldId={
                    selectedFieldId
                  }
                  zoom={
                    safeZoom
                  }
                  availableWidth={
                    availableWidth
                  }
                  onAddField={
                    onAddField
                  }
                  onUpdateField={
                    onUpdateField
                  }
                  onDeleteField={
                    onDeleteField
                  }
                  onSelectField={
                    onSelectField
                  }
                  onPageRef={
                    registerPageRef
                  }
                  onPageVisible={
                    handlePageVisible
                  }
                />
              ),
            )}
          </div>
        </Document>
      </div>
    </div>
  );
}
