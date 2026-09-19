import { useEffect, useRef, useState } from "react";

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
  downloadExportedImage,
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

  icon: React.ComponentType<{
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
   APP
   ========================================= */

function App() {
  /*
   * Uploaded document.
   */
  const [file, setFile] =
    useState<File | null>(
      null,
    );

  /*
   * Currently selected tool.
   */
  const [tool, setTool] =
    useState<Tool>(
      "select",
    );

  /*
   * All fields placed on
   * the document.
   */
  const [fields, setFields] =
    useState<DocumentField[]>(
      [],
    );
  const [past, setPast] =
    useState<DocumentField[][]>([]);

  const [future, setFuture] =
    useState<DocumentField[][]>([]);

  /*
   * Mutable references let high-frequency drag, resize and typing
   * updates always work from the latest field state without creating
   * a separate history entry for every pointer movement or keystroke.
   */
  const fieldsRef =
    useRef<DocumentField[]>([]);

  const pendingHistoryRef =
    useRef<DocumentField[] | null>(null);

  const historyTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);


  /*
   * Actual rendered DOCX page.
   *
   * The DOCX exporter captures
   * this element so the exported
   * document matches the editor.
   */
  const [
    docxDocumentElement,
    setDocxDocumentElement,
  ] =
    useState<HTMLDivElement | null>(
      null,
    );

  /*
   * Currently selected field.
   */
  const [
    selectedFieldId,
    setSelectedFieldId,
  ] =
    useState<string | null>(
      null,
    );

  /*
   * Export state.
   */
  const [
    isExporting,
    setIsExporting,
  ] =
    useState(false);

  /* =========================================
     HISTORY
     ========================================= */

  const cloneFields = (
    source: DocumentField[],
  ): DocumentField[] =>
    source.map((field) => ({
      ...field,
    }));

  const clearHistoryTimer = () => {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current);
      historyTimerRef.current = null;
    }
  };

  const flushPendingHistory = () => {
    clearHistoryTimer();

    const previous =
      pendingHistoryRef.current;

    if (!previous) {
      return;
    }

    const current =
      fieldsRef.current;

    if (
      JSON.stringify(previous) !==
      JSON.stringify(current)
    ) {
      setPast((history) => [
        ...history,
        cloneFields(previous),
      ]);

      setFuture([]);
    }

    pendingHistoryRef.current = null;
  };

  const scheduleHistoryCommit = () => {
    clearHistoryTimer();

    historyTimerRef.current =
      setTimeout(() => {
        flushPendingHistory();
      }, 300);
  };

  const commitFieldsChange = (
    nextFields: DocumentField[],
  ) => {
    flushPendingHistory();

    const previous =
      fieldsRef.current;

    if (
      JSON.stringify(previous) ===
      JSON.stringify(nextFields)
    ) {
      return;
    }

    setPast((history) => [
      ...history,
      cloneFields(previous),
    ]);

    setFuture([]);

    fieldsRef.current =
      cloneFields(nextFields);

    setFields(nextFields);
  };

  const undo = () => {
    flushPendingHistory();

    const history =
      past;

    if (history.length === 0) {
      return;
    }

    const previous =
      history[history.length - 1];

    const current =
      cloneFields(fieldsRef.current);

    setPast(
      history.slice(0, -1),
    );

    setFuture((redoHistory) => [
      ...redoHistory,
      current,
    ]);

    fieldsRef.current =
      cloneFields(previous);

    setFields(previous);
  };

  const redo = () => {
    flushPendingHistory();

    const history =
      future;

    if (history.length === 0) {
      return;
    }

    const next =
      history[history.length - 1];

    const current =
      cloneFields(fieldsRef.current);

    setFuture(
      history.slice(0, -1),
    );

    setPast((undoHistory) => [
      ...undoHistory,
      current,
    ]);

    fieldsRef.current =
      cloneFields(next);

    setFields(next);
  };

  /*
   * Keyboard shortcuts:
   * Ctrl/Cmd + Z       -> Undo
   * Ctrl/Cmd + Shift Z -> Redo
   * Ctrl + Y          -> Redo
   */
  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      const modifier =
        event.ctrlKey ||
        event.metaKey;

      if (!modifier) {
        return;
      }

      const target =
        event.target as HTMLElement | null;

      const isEditable =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      /*
       * Let the browser handle ordinary Ctrl/Cmd + Z inside text
       * inputs. The editor buttons remain available for document-level
       * undo while the user is editing a field.
       */
      if (
        isEditable &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        return;
      }

      if (
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (
        event.key.toLowerCase() === "y" &&
        event.ctrlKey
      ) {
        event.preventDefault();
        redo();
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
  }, [
    past,
    future,
  ]);

  /* =========================================
     FILE TYPE
     ========================================= */

  const isPdf =
    file?.type ===
    "application/pdf";

  const isImage =
    file?.type ===
      "image/png" ||
    file?.type ===
      "image/jpeg";

  const isDocx =
    file?.name
      .toLowerCase()
      .endsWith(".docx");

  /* =========================================
     UPLOAD DOCUMENT
     ========================================= */

  const handleUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile =
      event.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    setFile(
      selectedFile,
    );

    /*
     * Reset editor state when
     * opening a new document.
     */
    clearHistoryTimer();
    pendingHistoryRef.current = null;

    setFields([]);
    fieldsRef.current = [];

    setPast([]);
    setFuture([]);

    setDocxDocumentElement(
      null,
    );

    setSelectedFieldId(
      null,
    );

    setTool("select");

    /*
     * Allow the same file to be
     * selected again later.
     */
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

    /*
     * The PDF editor works directly
     * in displayed PDF coordinates.
     *
     * The image editor passes a scale,
     * so image fields are stored in
     * original-image coordinates.
     *
     * DOCX passes its responsive
     * display scale.
     */
    const safeScale =
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

    const nextFields = [
      ...fieldsRef.current,
      newField,
    ];

    commitFieldsChange(nextFields);

    setSelectedFieldId(
      newField.id,
    );

    setTool("select");
  };

  /* =========================================
     UPDATE FIELD
     ========================================= */

  const updateField = (
    id: string,
    updates: Partial<DocumentField>,
  ) => {
    const currentFields =
      fieldsRef.current;

    const nextFields =
      currentFields.map(
        (field) => {
          if (field.id !== id) {
            return field;
          }

          return {
            ...field,
            ...updates,
          };
        },
      );

    if (
      JSON.stringify(currentFields) ===
      JSON.stringify(nextFields)
    ) {
      return;
    }

    /*
     * Capture the state before the first update in a continuous
     * interaction. Pointer moves, resizing and typing are then grouped
     * into one undoable action.
     */
    if (!pendingHistoryRef.current) {
      pendingHistoryRef.current =
        cloneFields(currentFields);
    }

    fieldsRef.current =
      cloneFields(nextFields);

    setFields(nextFields);

    scheduleHistoryCommit();
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

    /*
     * Selecting an existing
     * field always returns to
     * selection mode.
     */
    setTool("select");
  };

  /* =========================================
     DELETE FIELD
     ========================================= */

  const deleteField = (
    id: string,
  ) => {
    const nextFields =
      fieldsRef.current.filter(
        (field) =>
          field.id !== id,
      );

    if (
      nextFields.length ===
      fieldsRef.current.length
    ) {
      return;
    }

    commitFieldsChange(nextFields);

    setSelectedFieldId(
      (currentSelected) =>
        currentSelected === id
          ? null
          : currentSelected,
    );
  };

  /* =========================================
     RETURN TO UPLOAD SCREEN
     ========================================= */

  const handleBack = () => {
    setFile(null);

    clearHistoryTimer();
    pendingHistoryRef.current = null;

    setFields([]);
    fieldsRef.current = [];

    setPast([]);
    setFuture([]);

    setDocxDocumentElement(
      null,
    );

    setSelectedFieldId(
      null,
    );

    setTool("select");

    setIsExporting(false);
  };

  /* =========================================
     EXPORT
     ========================================= */

  const handleExport =
    async () => {
      if (!file) {
        return;
      }

      setIsExporting(true);

      try {
        /*
         * PDF export.
         */
        if (isPdf) {
          await downloadExportedPdf(
            file,
            fields,
          );

          return;
        }

        /*
         * Image export.
         */
        if (isImage) {
          await downloadExportedImage(
            {
              file,
              fields,
            },
          );

          return;
        }

        /*
         * DOCX export.
         *
         * Capture the actual rendered
         * SignFlow DOCX page so the
         * fields remain exactly where
         * the user positioned them.
         */
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

              fields,
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
        setIsExporting(false);
      }
    };

  /* =========================================
     SELECTED FIELD
     ========================================= */

  const selectedField =
    selectedFieldId
      ? fields.find(
          (field) =>
            field.id ===
            selectedFieldId,
        )
      : null;

  useEffect(() => {
    fieldsRef.current =
      cloneFields(fields);
  }, [fields]);

  useEffect(() => {
    return () => {
      clearHistoryTimer();
    };
  }, []);

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
            aria-label="Undo"
            title="Undo (Ctrl/Cmd + Z)"
            onClick={undo}
            disabled={
              past.length === 0
            }
          >
            <Undo2
              size={18}
            />
          </button>

          <button
            type="button"
            className="icon-button"
            aria-label="Redo"
            title="Redo (Ctrl/Cmd + Shift + Z)"
            onClick={redo}
            disabled={
              future.length === 0
            }
          >
            <Redo2
              size={18}
            />
          </button>

          <div className="divider" />

          <span className="zoom">
            100%
          </span>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className="secondary-button"
          >
            <Save
              size={17}
            />

            Save
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
                      /*
                       * Selecting a new
                       * tool clears the
                       * current selection.
                       */
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
          <div className="document-page">
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

          {/* =================================
              SELECTED FIELD
              ================================= */}

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
            /* =================================
               NOTHING SELECTED
               ================================= */

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
            /* =================================
               TOOL SELECTED
               ================================= */

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