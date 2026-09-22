import {
  useCallback,
  useEffect,
  useRef,
  useState,
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

const EDITOR_PAGE_WIDTH = 820;
const DEFAULT_PAGE_HEIGHT = 1120;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

interface DocumentViewerProps {
  file: File;
  activeTool: string;
  fields: DocumentField[];
  selectedFieldId: string | null;

  /**
   * Zoom percentage.
   *
   * 50  = 50%
   * 100 = 100%
   * 150 = 150%
   */
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

const canPlaceField = (
  activeTool: string,
): boolean =>
  activeTool === "text" ||
  activeTool === "signature" ||
  activeTool === "date" ||
  activeTool === "checkbox" ||
  activeTool === "name" ||
  activeTool === "email";

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

  const [fitScale, setFitScale] =
    useState(1);

  const [internalHeight, setInternalHeight] =
    useState(DEFAULT_PAGE_HEIGHT);


  const safeZoom = clamp(
    zoom,
    MIN_ZOOM,
    MAX_ZOOM,
  );

  /*
   * The editor uses an internal 820px coordinate system, but the visible
   * page must always fit the available viewport on smaller screens.
   *
   * At 100% and below, fit the page to the available width.
   * Above 100%, preserve real zoom and let the outer canvas scroll.
   */
  const basePageWidth =
    EDITOR_PAGE_WIDTH * safeZoom;

  const usableWidth =
    Number.isFinite(availableWidth) &&
    availableWidth > 0
      ? availableWidth
      : EDITOR_PAGE_WIDTH;

  const renderedPageWidth =
    safeZoom <= 1
      ? Math.min(basePageWidth, usableWidth)
      : basePageWidth;

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
   * Detect the page that is currently
   * visible while the document scrolls.
   */
  useEffect(() => {
    const element =
      pageRef.current;

    if (!element) {
      return;
    }

    if (
      typeof IntersectionObserver ===
      "undefined"
    ) {
      return;
    }

    const observer =
      new IntersectionObserver(
        (entries) => {
          const visibleEntries =
            entries.filter(
              (entry) =>
                entry.isIntersecting &&
                entry.intersectionRatio >=
                  0.25,
            );

          if (
            visibleEntries.length === 0
          ) {
            return;
          }

          const mostVisible =
            visibleEntries.reduce(
              (
                previous,
                current,
              ) =>
                current.intersectionRatio >
                previous.intersectionRatio
                  ? current
                  : previous,
            );

          onPageVisible(
            pageNumber,
          );

          void mostVisible;
        },
        {
          threshold: [
            0.25,
            0.5,
            0.75,
          ],
        },
      );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [
    onPageVisible,
    pageNumber,
  ]);

  /**
   * Measure the actual visible page.
   *
   * The PDF and field layer use the same
   * coordinate system even when zoomed.
   */
  useEffect(() => {
    const element =
      pageRef.current;

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

      const rawScale =
        rect.width /
        renderedPageWidth;

      const safeScale =
        Number.isFinite(rawScale) &&
        rawScale > 0
          ? rawScale
          : 1;

      setFitScale(
        safeScale,
      );

      const content =
        pageContentRef.current;

      if (!content) {
        return;
      }

      const contentRect =
        content.getBoundingClientRect();

      if (
        contentRect.height <= 0
      ) {
        return;
      }

      const totalVisualScale =
        safeScale * safeZoom;

      if (
        !Number.isFinite(
          totalVisualScale,
        ) ||
        totalVisualScale <= 0
      ) {
        return;
      }

      const measuredInternalHeight =
        contentRect.height /
        totalVisualScale;

      if (
        Number.isFinite(
          measuredInternalHeight,
        ) &&
        measuredInternalHeight > 0
      ) {
        setInternalHeight(
          measuredInternalHeight,
        );
      }
    };

    const observer =
      new ResizeObserver(
        updateGeometry,
      );

    observer.observe(element);

    if (pageContentRef.current) {
      observer.observe(
        pageContentRef.current,
      );
    }

    const frame =
      requestAnimationFrame(
        updateGeometry,
      );

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    renderedPageWidth,
    safeZoom,
  ]);


  /**
   * Convert displayed coordinates into
   * the internal 820px coordinate system.
   */
  const getDisplayToInternalScale = (
    rect: DOMRect,
  ): number => {
    if (
      rect.width <= 0
    ) {
      return 1;
    }

    /*
     * Fields are always stored in the 820px internal coordinate system.
     * The actual visible page width, including mobile fitting, determines
     * the display scale.
     */
    const scale =
      rect.width /
      EDITOR_PAGE_WIDTH;

    return Number.isFinite(scale) &&
      scale > 0
      ? scale
      : 1;
  };

  const handlePageClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (
      !canPlaceField(
        activeTool,
      )
    ) {
      return;
    }

    const target =
      event.target instanceof HTMLElement
        ? event.target
        : null;

    if (
      target?.closest(
        INTERACTIVE_FIELD_SELECTOR,
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

    const scale =
      getDisplayToInternalScale(
        rect,
      );

    const displayX =
      event.clientX -
      rect.left;

    const displayY =
      event.clientY -
      rect.top;

    const internalX =
      displayX /
      scale;

    const internalY =
      displayY /
      scale;

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
        internalHeight,
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

  /**
   * Keep the field layer in the original
   * document coordinate system.
   */
  const totalDisplayScale =
    fitScale *
    (renderedPageWidth /
      EDITOR_PAGE_WIDTH);

  const fieldLayerStyle:
    React.CSSProperties = {
      position: "absolute",

      left: 0,
      top: 0,

      width:
        EDITOR_PAGE_WIDTH,

      height:
        internalHeight,

      transform:
        `scale(${totalDisplayScale})`,

      transformOrigin:
        "top left",

      overflow:
        "visible",

      pointerEvents:
        "none",

      zIndex: 20,

      boxSizing:
        "border-box",
    };

  const pageContentStyle:
    React.CSSProperties = {
      position:
        "relative",

      width:
        renderedPageWidth,

      maxWidth:
        "none",

      flex:
        "0 0 auto",

      boxSizing:
        "border-box",
    };

  return (
    <div
      ref={pageRef}
      className={`pdf-page-wrapper ${
        canPlaceField(activeTool)
          ? "pdf-page-text-mode"
          : ""
      }`}
      onClick={
        handlePageClick
      }
      data-page-number={
        pageNumber
      }
      style={{
        width:
          renderedPageWidth,

        maxWidth:
          "none",

        flex:
          "0 0 auto",

        position:
          "relative",

        boxSizing:
          "border-box",

        scrollMarginTop:
          "70px",
      }}
    >
      <div
        ref={
          pageContentRef
        }
        style={
          pageContentStyle
        }
      >
        <Page
          pageNumber={
            pageNumber
          }
          width={
            renderedPageWidth
          }
          renderTextLayer
          renderAnnotationLayer
        />

        <div
          className="field-layer"
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
  const [
    numPages,
    setNumPages,
  ] = useState(0);

  const [
    currentPage,
    setCurrentPage,
  ] = useState(1);

  const [
    pageInput,
    setPageInput,
  ] = useState("1");

  const pageRefs =
    useRef<
      Map<
        number,
        HTMLDivElement
      >
    >(new Map());

  const viewerRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [availableWidth, setAvailableWidth] =
    useState(EDITOR_PAGE_WIDTH);

  const safeZoom =
    normalizeZoom(zoom);

  /*
   * Measure the actual editor viewport. This is intentionally kept in the
   * viewer instead of guessing from device breakpoints, so the same logic
   * works on phones, tablets, laptops, desktops and large monitors.
   */
  useEffect(() => {
    const element = viewerRef.current;

    if (!element) {
      return;
    }

    const updateAvailableWidth = () => {
      const width = element.clientWidth;

      if (width <= 0) {
        return;
      }

      setAvailableWidth(
        Math.max(
          1,
          width,
        ),
      );
    };

    const observer =
      new ResizeObserver(
        updateAvailableWidth,
      );

    observer.observe(element);
    updateAvailableWidth();

    return () => {
      observer.disconnect();
    };
  }, []);

  /**
   * Clear stale DOM references when
   * the uploaded document changes.
   */
  useEffect(() => {
    pageRefs.current.clear();
  }, [file]);

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

  /**
   * Update both navigation values together.
   */
  const handlePageVisible =
    useCallback(
      (pageNumber: number) => {
        setCurrentPage(
          (previousPage) => {
            if (
              previousPage ===
              pageNumber
            ) {
              return previousPage;
            }

            return pageNumber;
          },
        );

        setPageInput(
          String(pageNumber),
        );
      },
      [],
    );

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

        if (!pageElement) {
          return;
        }

        pageElement.scrollIntoView({
          behavior:
            "smooth",

          block:
            "start",

          inline:
            "nearest",
        });
      },
      [
        numPages,
      ],
    );

  const handlePreviousPage =
    useCallback(() => {
      if (
        currentPage <= 1
      ) {
        return;
      }

      goToPage(
        currentPage - 1,
      );
    }, [
      currentPage,
      goToPage,
    ]);

  const handleNextPage =
    useCallback(() => {
      if (
        currentPage >=
        numPages
      ) {
        return;
      }

      goToPage(
        currentPage + 1,
      );
    }, [
      currentPage,
      numPages,
      goToPage,
    ]);

  /**
   * Keyboard page navigation.
   *
   * Navigation is ignored while the user
   * is interacting with an editor field,
   * form control, button, resize handle,
   * or page number input.
   */
  useEffect(() => {
    const handleKeyboardNavigation = (
      event: KeyboardEvent,
    ) => {
      if (numPages <= 0) {
        return;
      }

      const activeElement =
        document.activeElement;

      const target =
        event.target instanceof HTMLElement
          ? event.target
          : null;

      const activeIsInsideViewer =
        viewerRef.current
          ? viewerRef.current.contains(
              activeElement,
            )
          : false;

      const activeTag =
        activeElement instanceof HTMLElement
          ? activeElement.tagName
          : "";

      const targetTag =
        target?.tagName ?? "";

      const isEditableElement =
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "SELECT" ||
        activeElement?.getAttribute(
          "contenteditable",
        ) === "true" ||
        targetTag === "INPUT" ||
        targetTag === "TEXTAREA" ||
        targetTag === "SELECT" ||
        target?.getAttribute(
          "contenteditable",
        ) === "true";

      if (isEditableElement) {
        return;
      }

      if (
        target?.closest(
          INTERACTIVE_FIELD_SELECTOR,
        )
      ) {
        return;
      }

      if (
        activeElement &&
        activeElement !== document.body &&
        !activeIsInsideViewer
      ) {
        return;
      }

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown": {
          if (
            currentPage >=
            numPages
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          goToPage(
            currentPage + 1,
          );

          return;
        }

        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp": {
          if (
            currentPage <= 1
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          goToPage(
            currentPage - 1,
          );

          return;
        }

        case "Home": {
          if (
            currentPage === 1
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          goToPage(1);

          return;
        }

        case "End": {
          if (
            currentPage ===
            numPages
          ) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          goToPage(
            numPages,
          );

          return;
        }

        default:
          return;
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyboardNavigation,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyboardNavigation,
      );
    };
  }, [
    currentPage,
    numPages,
    goToPage,
  ]);

  const handlePageInputChange =
    (
      event:
        React.ChangeEvent<HTMLInputElement>,
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

      const parsedPage =
        Number(
          pageInput,
        );

      if (
        !Number.isFinite(
          parsedPage,
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
        parsedPage,
      );
    };

  const handlePageInputKeyDown =
    (
      event:
        React.KeyboardEvent<HTMLInputElement>,
    ) => {
      if (
        event.key ===
        "Enter"
      ) {
        event.preventDefault();

        commitPageInput();

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

  return (
    <div
      ref={
        viewerRef
      }
      className="pdf-document"
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,

        /*
         * The .canvas-area remains the
         * vertical scrolling container.
         */
        overflow:
          "visible",

        position:
          "relative",

        boxSizing:
          "border-box",
      }}
    >
      {numPages > 0 && (
        <div
          className="pdf-page-navigation"
          style={{
            position:
              "sticky",

            top: 0,

            zIndex: 1000,

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            gap: 8,

            width:
              "100%",

            minWidth: 0,

            padding:
              "10px 12px",

            marginBottom:
              12,

            boxSizing:
              "border-box",

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

            isolation:
              "isolate",

            flexShrink:
              0,
          }}
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
              display:
                "inline-flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              minWidth:
                38,

              width:
                38,

              height:
                36,

              padding:
                0,

              border:
                "1px solid #d1d5db",

              borderRadius:
                8,

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

              fontSize:
                20,

              fontWeight:
                700,

              lineHeight:
                1,

              touchAction:
                "manipulation",

              flexShrink:
                0,
            }}
          >
            ‹
          </button>

          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              gap: 7,

              whiteSpace:
                "nowrap",

              fontSize:
                14,

              fontWeight:
                600,

              color:
                "#374151",

              flexShrink:
                0,
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
                width:
                  48,

                height:
                  34,

                padding:
                  "0 8px",

                border:
                  "1px solid #d1d5db",

                borderRadius:
                  7,

                background:
                  "#ffffff",

                color:
                  "#111827",

                textAlign:
                  "center",

                fontSize:
                  14,

                fontWeight:
                  600,

                outline:
                  "none",

                boxSizing:
                  "border-box",

                flexShrink:
                  0,
              }}
            />

            <span>
              of{" "}
              {numPages}
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
              display:
                "inline-flex",

              alignItems:
                "center",

              justifyContent:
                "center",

              minWidth:
                38,

              width:
                38,

              height:
                36,

              padding:
                0,

              border:
                "1px solid #d1d5db",

              borderRadius:
                8,

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

              fontSize:
                20,

              fontWeight:
                700,

              lineHeight:
                1,

              touchAction:
                "manipulation",

              flexShrink:
                0,
            }}
          >
            ›
          </button>
        </div>
      )}

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
        }}
        onLoadError={(
          error,
        ) => {
          console.error(
            "PDF loading error:",
            error,
          );

          setNumPages(
            0,
          );

          setCurrentPage(
            1,
          );

          setPageInput(
            "1",
          );

          pageRefs.current.clear();
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
          style={{
            display:
              "flex",

            flexDirection:
              "column",

            alignItems:
              safeZoom > 1
                ? "flex-start"
                : "center",

            gap: 24,

            width:
              "100%",

            minWidth: 0,

            boxSizing:
              "border-box",

            overflow:
              "visible",
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
  );
}