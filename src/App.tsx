import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
} from "react";

import {
  ArrowLeft,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  Download,
  FileText,
  Mail,
  MousePointer2,
  PenLine,
  Redo2,
  Save,
  Type,
  Undo2,
  Upload,
  UserRound,
} from "lucide-react";

import DocumentViewer from "./components/editor/DocumentViewer";
import ImageViewer from "./components/editor/ImageViewer";
import DocxViewer from "./components/editor/DocxViewer";

import type {
  DocumentField,
  FieldType,
} from "./types/document";

import {
  downloadExportedPdf,
} from "./utils/exportPdf";

import {
  exportImage,
} from "./utils/exportImage";

import {
  downloadExportedDocx,
} from "./utils/exportDocx";

import "./index.css";

/* =========================================
   TOOL TYPES
   ========================================= */

type Tool =
  | "select"
  | FieldType;

/* =========================================
   TOOL CONFIGURATION
   ========================================= */

interface ToolItem {
  id: Tool;
  label: string;
  icon: ComponentType<{
    size?: number;
  }>;
}

const tools: ToolItem[] = [
  {
    id: "select",
    label: "Select",
    icon: MousePointer2,
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
  },
  {
    id: "signature",
    label: "Signature",
    icon: PenLine,
  },
  {
    id: "date",
    label: "Date",
    icon: CalendarDays,
  },
  {
    id: "checkbox",
    label: "Checkbox",
    icon: CheckSquare,
  },
  {
    id: "name",
    label: "Name",
    icon: UserRound,
  },
  {
    id: "email",
    label: "Email",
    icon: Mail,
  },
];

/* =========================================
   SAVE DATA
   ========================================= */

interface SavedDocumentState {
  fileName: string;
  fileSize: number;
  lastModified: number;
  fields: DocumentField[];
  savedAt: number;
}

const SAVE_STORAGE_PREFIX =
  "signflow-document:";

const getStorageKey = (
  selectedFile: File,
): string => {
  return `${SAVE_STORAGE_PREFIX}${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`;
};

const cloneFields = (
  source: DocumentField[],
): DocumentField[] => {
  return source.map(
    (field) => ({
      ...field,
    }),
  );
};

/* =========================================
   CONSTANTS
   ========================================= */

const MIN_ZOOM = 50;
const MAX_ZOOM = 150;
const ZOOM_STEP = 10;

/* =========================================
   APP
   ========================================= */

function App() {
  /* =========================================
     DOCUMENT
     ========================================= */

  const [file, setFile] =
    useState<File | null>(null);

  /* =========================================
     TOOL
     ========================================= */

  const [tool, setTool] =
    useState<Tool>(
      "select",
    );

  /* =========================================
     FIELDS
     ========================================= */

  const [fields, setFields] =
    useState<DocumentField[]>(
      [],
    );

  const [
    docxDocumentElement,
    setDocxDocumentElement,
  ] =
    useState<HTMLDivElement | null>(
      null,
    );

  const [
    selectedFieldId,
    setSelectedFieldId,
  ] =
    useState<string | null>(
      null,
    );

  /* =========================================
     EXPORT
     ========================================= */

  const [
    isExporting,
    setIsExporting,
  ] =
    useState(false);

  /* =========================================
     UNDO / REDO
     ========================================= */

  const [
    past,
    setPast,
  ] =
    useState<DocumentField[][]>(
      [],
    );

  const [
    future,
    setFuture,
  ] =
    useState<DocumentField[][]>(
      [],
    );

  const pastRef =
    useRef<DocumentField[][]>(
      [],
    );

  const futureRef =
    useRef<DocumentField[][]>(
      [],
    );

  /* =========================================
     SAVE STATE
     ========================================= */

  const [
    isSaved,
    setIsSaved,
  ] =
    useState(false);

  /* =========================================
     ZOOM
     ========================================= */

  const [
    zoom,
    setZoom,
  ] =
    useState(100);

  /* =========================================
     FIELD REFERENCE
     ========================================= */

  const fieldsRef =
    useRef<DocumentField[]>(
      [],
    );

  const historySnapshotRef =
    useRef<DocumentField[] | null>(
      null,
    );

  const historyTimerRef =
    useRef<number | null>(
      null,
    );

  const documentSessionRef =
    useRef(0);

  /* =========================================
     FIELD REF SYNCHRONIZATION
     ========================================= */

  useEffect(() => {
    fieldsRef.current =
      fields;
  }, [fields]);

  /* =========================================
     HISTORY CLEANUP
     ========================================= */

  useEffect(() => {
    return () => {
      if (
        historyTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          historyTimerRef.current,
        );

        historyTimerRef.current =
          null;
      }
    };
  }, []);

  /* =========================================
     FILE TYPE
     ========================================= */

  const isPdf =
    file?.type ===
      "application/pdf" ||
    Boolean(
      file?.name
        .toLowerCase()
        .endsWith(".pdf"),
    );

  const isImage =
    file?.type ===
      "image/png" ||
    file?.type ===
      "image/jpeg" ||
    Boolean(
      file?.name
        .toLowerCase()
        .match(
          /\.(png|jpe?g)$/i,
        ),
    );

  const isDocx =
    Boolean(
      file?.name
        .toLowerCase()
        .endsWith(".docx"),
    );

  /* =========================================
     HISTORY HELPERS
     ========================================= */

  const clearHistoryTimer =
    useCallback(() => {
      if (
        historyTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          historyTimerRef.current,
        );

        historyTimerRef.current =
          null;
      }
    }, []);

  const pushPastSnapshot =
    useCallback(
      (
        snapshot: DocumentField[],
      ) => {
        const cloned =
          cloneFields(
            snapshot,
          );

        const nextPast = [
          ...pastRef.current,
          cloned,
        ];

        pastRef.current =
          nextPast;

        setPast(
          nextPast,
        );
      },
      [],
    );

  const clearFuture =
    useCallback(() => {
      futureRef.current =
        [];

      setFuture([]);
    }, []);

  const flushPendingHistory =
    useCallback(() => {
      clearHistoryTimer();

      const pending =
        historySnapshotRef.current;

      if (!pending) {
        return;
      }

      pushPastSnapshot(
        pending,
      );

      historySnapshotRef.current =
        null;
    }, [
      clearHistoryTimer,
      pushPastSnapshot,
    ]);

  const beginHistoryTransaction =
    useCallback(() => {
      if (
        historySnapshotRef.current ===
        null
      ) {
        historySnapshotRef.current =
          cloneFields(
            fieldsRef.current,
          );
      }

      clearHistoryTimer();

      const currentSession =
        documentSessionRef.current;

      historyTimerRef.current =
        window.setTimeout(() => {
          if (
            currentSession !==
            documentSessionRef.current
          ) {
            return;
          }

          flushPendingHistory();
        }, 350);
    }, [
      clearHistoryTimer,
      flushPendingHistory,
    ]);

  const commitFieldState =
    useCallback(
      (
        nextFields: DocumentField[],
      ) => {
        const previous =
          fieldsRef.current;

        pushPastSnapshot(
          previous,
        );

        clearFuture();

        const cloned =
          cloneFields(
            nextFields,
          );

        fieldsRef.current =
          cloned;

        setFields(
          cloned,
        );

        setIsSaved(false);
      },
      [
        pushPastSnapshot,
        clearFuture,
      ],
    );

  /* =========================================
     UPLOAD DOCUMENT
     ========================================= */

  const handleUpload = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile =
      event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    documentSessionRef.current +=
      1;

    clearHistoryTimer();

    historySnapshotRef.current =
      null;

    setFile(
      selectedFile,
    );

    let restoredFields:
      DocumentField[] = [];

    try {
      const saved =
        window.localStorage.getItem(
          getStorageKey(
            selectedFile,
          ),
        );

      if (saved) {
        const parsed =
          JSON.parse(
            saved,
          ) as SavedDocumentState;

        if (
          Array.isArray(
            parsed.fields,
          )
        ) {
          restoredFields =
            cloneFields(
              parsed.fields,
            );
        }
      }
    } catch (error) {
      console.warn(
        "Unable to restore saved SignFlow state.",
        error,
      );
    }

    fieldsRef.current =
      restoredFields;

    setFields(
      restoredFields,
    );

    pastRef.current =
      [];

    futureRef.current =
      [];

    setPast([]);

    setFuture([]);

    setDocxDocumentElement(
      null,
    );

    setSelectedFieldId(
      null,
    );

    setTool(
      "select",
    );

    setZoom(100);

    setIsSaved(
      restoredFields.length > 0,
    );

    event.target.value = "";
  };

  /* =========================================
     ADD FIELD
     ========================================= */

  const addField = (
    page: number,
    x: number,
    y: number,
    scale = 1,
  ) => {
    if (
      tool !== "text" &&
      tool !== "signature" &&
      tool !== "date" &&
      tool !== "checkbox" &&
      tool !== "name" &&
      tool !== "email"
    ) {
      return;
    }

    const isSignature =
      tool === "signature";

    const isDate =
      tool === "date";

    const isCheckbox =
      tool === "checkbox";

    const isName =
      tool === "name";

    const isEmail =
      tool === "email";

    const today =
      new Date();

    const defaultDate =
      `${today.getFullYear()}-${String(
        today.getMonth() + 1,
      ).padStart(
        2,
        "0",
      )}-${String(
        today.getDate(),
      ).padStart(
        2,
        "0",
      )}`;

    const safeScale =
      Number.isFinite(
        scale,
      ) &&
      scale > 0
        ? scale
        : 1;

    const displayWidth =
      isSignature
        ? 320
        : isDate
          ? 180
          : isCheckbox
            ? 36
            : isName
              ? 240
              : isEmail
                ? 280
                : 200;

    const displayHeight =
      isSignature
        ? 140
        : isDate
          ? 42
          : isCheckbox
            ? 36
            : 42;

    const newField:
      DocumentField = {
      id: crypto.randomUUID(),

      type:
        isSignature
          ? "signature"
          : isDate
            ? "date"
            : isCheckbox
              ? "checkbox"
              : isName
                ? "name"
                : isEmail
                  ? "email"
                  : "text",

      page,

      x,

      y,

      width:
        displayWidth /
        safeScale,

      height:
        displayHeight /
        safeScale,

      value:
        isDate
          ? defaultDate
          : isCheckbox
            ? "false"
            : "",

      ...(isSignature
        ? {
            signatureMode:
              "draw",

            signatureImage:
              "",

            signatureFont:
              '"Brush Script MT", "Segoe Script", cursive',
          }
        : {}),
    };

    commitFieldState([
      ...fieldsRef.current,
      newField,
    ]);

    setSelectedFieldId(
      newField.id,
    );

    setTool(
      "select",
    );
  };

  /* =========================================
     UPDATE FIELD
     ========================================= */

  const updateField = (
    id: string,
    updates: Partial<DocumentField>,
  ) => {
    beginHistoryTransaction();

    const nextFields =
      fieldsRef.current.map(
        (field) => {
          if (
            field.id !== id
          ) {
            return field;
          }

          return {
            ...field,
            ...updates,
          };
        },
      );

    fieldsRef.current =
      nextFields;

    setFields(
      nextFields,
    );

    setIsSaved(false);

    clearHistoryTimer();

    const currentSession =
      documentSessionRef.current;

    historyTimerRef.current =
      window.setTimeout(() => {
        if (
          currentSession !==
          documentSessionRef.current
        ) {
          return;
        }

        flushPendingHistory();
      }, 350);
  };

  /* =========================================
     SELECT FIELD
     ========================================= */

  const selectField = (
    id: string,
  ) => {
    setSelectedFieldId(
      id,
    );

    setTool(
      "select",
    );
  };

  /* =========================================
     DELETE FIELD
     ========================================= */

  const deleteField = (
    id: string,
  ) => {
    const fieldExists =
      fieldsRef.current.some(
        (field) =>
          field.id === id,
      );

    if (!fieldExists) {
      return;
    }

    clearHistoryTimer();

    historySnapshotRef.current =
      null;

    commitFieldState(
      fieldsRef.current.filter(
        (field) =>
          field.id !== id,
      ),
    );

    setSelectedFieldId(
      (currentSelected) =>
        currentSelected === id
          ? null
          : currentSelected,
    );
  };

  /* =========================================
     UNDO
     ========================================= */

  const handleUndo = () => {
    flushPendingHistory();

    const currentPast =
      pastRef.current;

    if (
      currentPast.length ===
      0
    ) {
      return;
    }

    const previous =
      currentPast[
        currentPast.length - 1
      ];

    const remainingPast =
      currentPast.slice(
        0,
        -1,
      );

    const currentFields =
      cloneFields(
        fieldsRef.current,
      );

    const nextFuture = [
      ...futureRef.current,
      currentFields,
    ];

    pastRef.current =
      remainingPast;

    futureRef.current =
      nextFuture;

    setPast(
      remainingPast,
    );

    setFuture(
      nextFuture,
    );

    const restored =
      cloneFields(
        previous,
      );

    fieldsRef.current =
      restored;

    setFields(
      restored,
    );

    setIsSaved(false);

    setSelectedFieldId(
      (currentSelected) =>
        currentSelected &&
        restored.some(
          (field) =>
            field.id ===
            currentSelected,
        )
          ? currentSelected
          : null,
    );
  };

  /* =========================================
     REDO
     ========================================= */

  const handleRedo = () => {
    flushPendingHistory();

    const currentFuture =
      futureRef.current;

    if (
      currentFuture.length ===
      0
    ) {
      return;
    }

    const next =
      currentFuture[
        currentFuture.length - 1
      ];

    const remainingFuture =
      currentFuture.slice(
        0,
        -1,
      );

    const currentFields =
      cloneFields(
        fieldsRef.current,
      );

    const nextPast = [
      ...pastRef.current,
      currentFields,
    ];

    pastRef.current =
      nextPast;

    futureRef.current =
      remainingFuture;

    setPast(
      nextPast,
    );

    setFuture(
      remainingFuture,
    );

    const restored =
      cloneFields(
        next,
      );

    fieldsRef.current =
      restored;

    setFields(
      restored,
    );

    setIsSaved(false);

    setSelectedFieldId(
      (currentSelected) =>
        currentSelected &&
        restored.some(
          (field) =>
            field.id ===
            currentSelected,
        )
          ? currentSelected
          : null,
    );
  };

  /* =========================================
     KEYBOARD SHORTCUTS
     ========================================= */

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      const target =
        event.target;

      if (
        target instanceof
          HTMLInputElement ||
        target instanceof
          HTMLTextAreaElement ||
        target instanceof
          HTMLSelectElement
      ) {
        return;
      }

      const modifier =
        event.ctrlKey ||
        event.metaKey;

      if (!modifier) {
        return;
      }

      if (
        event.key.toLowerCase() ===
        "z"
      ) {
        event.preventDefault();

        if (
          event.shiftKey
        ) {
          handleRedo();
        } else {
          handleUndo();
        }

        return;
      }

      if (
        event.key.toLowerCase() ===
        "y"
      ) {
        event.preventDefault();

        handleRedo();

        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        setZoom(100);
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  });

  /* =========================================
     RETURN TO UPLOAD SCREEN
     ========================================= */

  const handleBack = () => {
    documentSessionRef.current +=
      1;

    clearHistoryTimer();

    historySnapshotRef.current =
      null;

    fieldsRef.current =
      [];

    pastRef.current =
      [];

    futureRef.current =
      [];

    setFile(null);

    setFields([]);

    setPast([]);

    setFuture([]);

    setDocxDocumentElement(
      null,
    );

    setSelectedFieldId(
      null,
    );

    setTool(
      "select",
    );

    setIsExporting(
      false,
    );

    setIsSaved(
      false,
    );

    setZoom(100);
  };

  /* =========================================
     SAVE
     ========================================= */

  const handleSave = () => {
    if (!file) {
      return;
    }

    const savedState:
      SavedDocumentState = {
      fileName:
        file.name,

      fileSize:
        file.size,

      lastModified:
        file.lastModified,

      fields:
        cloneFields(
          fieldsRef.current,
        ),

      savedAt:
        Date.now(),
    };

    try {
      window.localStorage.setItem(
        getStorageKey(file),
        JSON.stringify(
          savedState,
        ),
      );

      setIsSaved(
        true,
      );
    } catch (error) {
      console.error(
        "Save error:",
        error,
      );

      window.alert(
        "Unable to save this document state in your browser.",
      );
    }
  };

  /* =========================================
     EXPORT
     ========================================= */

  const handleExport =
    async () => {
      if (!file) {
        return;
      }

      flushPendingHistory();

      setIsExporting(
        true,
      );

      try {
        if (isPdf) {
          await downloadExportedPdf(
            file,
            fieldsRef.current,
          );

          return;
        }

        if (isImage) {
          await exportImage(
            file,
            fieldsRef.current,
          );

          return;
        }

        if (isDocx) {
          if (
            !docxDocumentElement
          ) {
            window.alert(
              "The DOCX document is still loading. Please wait a moment and try again.",
            );

            return;
          }

          await downloadExportedDocx(
            {
              element:
                docxDocumentElement,

              fileName:
                file.name,
            },
          );

          return;
        }

        window.alert(
          "Export for this file type is not available yet.",
        );
      } catch (error) {
        console.error(
          "Export error:",
          error,
        );

        window.alert(
          "Something went wrong while exporting the document.",
        );
      } finally {
        setIsExporting(
          false,
        );
      }
    };

  /* =========================================
     ZOOM
     ========================================= */

  const handleZoomOut =
    () => {
      setZoom(
        (currentZoom) =>
          Math.max(
            MIN_ZOOM,
            currentZoom -
              ZOOM_STEP,
          ),
      );
    };

  const handleZoomIn =
    () => {
      setZoom(
        (currentZoom) =>
          Math.min(
            MAX_ZOOM,
            currentZoom +
              ZOOM_STEP,
          ),
      );
    };

  const handleZoomReset =
    () => {
      setZoom(100);
    };

  const zoomLabel =
    `${zoom}%`;

  /* =========================================
     SELECTED FIELD
     ========================================= */

  const selectedField =
    selectedFieldId
      ? fields.find(
          (field) =>
            field.id ===
            selectedFieldId,
        ) ?? null
      : null;

  /* =========================================
     UPLOAD SCREEN
     ========================================= */

  if (!file) {
    return (
      <main className="upload-page">
        <div className="upload-container">
          <div className="brand">
            <div className="brand-mark">
              S
            </div>

            <span>
              SignFlow
            </span>
          </div>

          <div className="upload-card">
            <div className="upload-icon">
              <Upload
                size={28}
              />
            </div>

            <h1>
              Sign documents
              <br />
              with ease
            </h1>

            <p>
              Upload a document,
              add your signature,
              text and other
              fields, then
              export the
              completed
              document.
            </p>

            <label className="upload-button">
              <Upload
                size={18}
              />

              Upload document

              <input
                type="file"
                accept=".pdf,.docx,.png,.jpg,.jpeg"
                onChange={
                  handleUpload
                }
                hidden
              />
            </label>

            <span className="supported">
              PDF, DOCX, PNG and
              JPG supported
            </span>
          </div>
        </div>
      </main>
    );
  }

  /* =========================================
     EDITOR
     ========================================= */

  return (
    <div className="app">
      {/* =================================
          TOP BAR
          ================================= */}

      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="icon-button"
            onClick={
              handleBack
            }
            aria-label="Back"
          >
            <ArrowLeft
              size={19}
            />
          </button>

          <div className="document-title">
            <FileText
              size={18}
            />

            <span>
              {file.name}
            </span>

            <ChevronDown
              size={15}
            />
          </div>
        </div>

        <div className="topbar-center">
          <button
            type="button"
            className="icon-button"
            onClick={
              handleUndo
            }
            disabled={
              past.length ===
              0
            }
            aria-label="Undo"
            title="Undo"
          >
            <Undo2
              size={18}
            />
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={
              handleRedo
            }
            disabled={
              future.length ===
              0
            }
            aria-label="Redo"
            title="Redo"
          >
            <Redo2
              size={18}
            />
          </button>

          <div className="divider" />

          <button
            type="button"
            className="zoom-button"
            onClick={
              handleZoomOut
            }
            disabled={
              zoom <=
              MIN_ZOOM
            }
            aria-label="Zoom out"
            title="Zoom out"
          >
            −
          </button>

          <button
            type="button"
            className="zoom-button"
            onClick={handleZoomReset}
            disabled={zoom === 100}
            aria-label="Reset zoom to 100%"
            title="Reset zoom to 100%"
          >
            100%
          </button>

          <span
            className="zoom"
            aria-live="polite"
            aria-label={`Current zoom ${zoomLabel}`}
          >
            {zoomLabel}
          </span>

          <button
            type="button"
            className="zoom-button"
            onClick={
              handleZoomIn
            }
            disabled={
              zoom >=
              MAX_ZOOM
            }
            aria-label="Zoom in"
            title="Zoom in"
          >
            +
          </button>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="secondary-button"
            onClick={
              handleSave
            }
            title={
              isSaved
                ? "Saved"
                : "Save document"
            }
          >
            <Save
              size={17}
            />

            {isSaved
              ? "Saved"
              : "Save"}
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={
              handleExport
            }
            disabled={
              isExporting
            }
          >
            <Download
              size={17}
            />

            {isExporting
              ? "Exporting..."
              : "Export"}
          </button>
        </div>
      </header>

      <div className="workspace">
        {/* =================================
            LEFT TOOLBAR
            ================================= */}

        <aside className="sidebar">
          <div className="sidebar-heading">
            TOOLS
          </div>

          <div className="tools">
            {tools.map(
              (item) => {
                const Icon =
                  item.icon;

                return (
                  <button
                    type="button"
                    key={
                      item.id
                    }
                    className={`tool ${
                      tool ===
                      item.id
                        ? "tool-active"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedFieldId(
                        null,
                      );

                      setTool(
                        item.id,
                      );
                    }}
                  >
                    <Icon
                      size={19}
                    />

                    <span>
                      {
                        item.label
                      }
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </aside>

        {/* =================================
            DOCUMENT CANVAS
            ================================= */}

        <main className="canvas-area">
          <div
            className="document-page"
            data-signflow-zoom={
              zoom
            }
          >
            {isPdf ? (
              <DocumentViewer
                file={file}
                activeTool={
                  tool
                }
                fields={
                  fields
                }
                selectedFieldId={
                  selectedFieldId
                }
                zoom={
                  zoom
                }
                onAddField={
                  addField
                }
                onUpdateField={
                  updateField
                }
                onDeleteField={
                  deleteField
                }
                onSelectField={
                  selectField
                }
              />
            ) : isImage ? (
              <ImageViewer
                file={file}
                activeTool={
                  tool
                }
                fields={
                  fields
                }
                selectedFieldId={
                  selectedFieldId
                }
                zoom={zoom}
                onAddField={
                  addField
                }
                onUpdateField={
                  updateField
                }
                onDeleteField={
                  deleteField
                }
                onSelectField={
                  selectField
                }
              />
            ) : isDocx ? (
              <DocxViewer
                file={file}
                activeTool={
                  tool
                }
                fields={
                  fields
                }
                selectedFieldId={
                  selectedFieldId
                }
                zoom={zoom}
                onAddField={
                  addField
                }
                onUpdateField={
                  updateField
                }
                onDeleteField={
                  deleteField
                }
                onSelectField={
                  selectField
                }
                onDocumentReady={
                  setDocxDocumentElement
                }
              />
            ) : (
              <div className="document-placeholder">
                <FileText
                  size={42}
                />

                <h2>
                  {file.name}
                </h2>

                <p>
                  This file type
                  will be supported
                  in the next stage.
                </p>

                <span>
                  PDF, DOCX, PNG and
                  JPG editing is
                  currently enabled.
                </span>
              </div>
            )}
          </div>
        </main>

        {/* =================================
            RIGHT PROPERTIES
            ================================= */}

        <aside className="properties">
          <div className="sidebar-heading">
            PROPERTIES
          </div>

          {selectedField ? (
            <div className="selected-tool">
              <div className="selected-icon">
                {(() => {
                  const selectedTool =
                    tools.find(
                      (item) =>
                        item.id ===
                        selectedField.type,
                    );

                  const Icon =
                    selectedTool?.icon ??
                    MousePointer2;

                  return (
                    <Icon
                      size={20}
                    />
                  );
                })()}
              </div>

              <h3>
                {tools.find(
                  (item) =>
                    item.id ===
                    selectedField.type,
                )?.label ??
                  "Field"}
              </h3>

              <p>
                {selectedField.type ===
                "signature"
                  ? "Create, draw, type or upload your signature."
                  : selectedField.type ===
                      "date"
                    ? "Set the date that will appear on the document."
                    : selectedField.type ===
                        "checkbox"
                      ? "Check or uncheck this field on the document."
                      : selectedField.type ===
                          "name"
                        ? "Enter the name that should appear on the document."
                        : selectedField.type ===
                            "email"
                          ? "Enter the email address that should appear on the document."
                          : "Use the field on the document to enter and position your text."}
              </p>

              <button
                type="button"
                className="property-delete"
                onClick={() =>
                  deleteField(
                    selectedField.id,
                  )
                }
              >
                Delete field
              </button>
            </div>
          ) : tool ===
            "select" ? (
            <div className="empty-properties">
              <MousePointer2
                size={22}
              />

              <p>
                Select an element
                to edit its
                properties.
              </p>
            </div>
          ) : (
            <div className="selected-tool">
              <div className="selected-icon">
                {(() => {
                  const selected =
                    tools.find(
                      (item) =>
                        item.id ===
                        tool,
                    );

                  const Icon =
                    selected?.icon ??
                    MousePointer2;

                  return (
                    <Icon
                      size={20}
                    />
                  );
                })()}
              </div>

              <h3>
                {
                  tools.find(
                    (item) =>
                      item.id ===
                      tool,
                  )?.label
                }
              </h3>

              <p>
                {tool ===
                "signature"
                  ? "Click on the document to place a signature field. You can then draw, type or upload your signature."
                  : tool ===
                      "date"
                    ? "Click on the document to place a date field."
                    : tool ===
                        "checkbox"
                      ? "Click on the document to place a checkbox."
                      : tool ===
                          "name"
                        ? "Click on the document to place a name field."
                        : tool ===
                            "email"
                          ? "Click on the document to place an email field."
                          : "Click on the document to place this field."}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;